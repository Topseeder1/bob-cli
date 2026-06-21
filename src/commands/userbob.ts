// File: src/commands/userbob.ts

import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction, callHTTPFunction, isAuthenticated } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { buildDNAString } from '../core/profile-store.js';
import { getActiveConversationId } from '../core/project-map.js';

// ─── DESIGN TOKENS ───
const PURPLE    = chalk.hex('#AB47BC');
const AMBER     = chalk.hex('#FFAB00');
const GREEN     = chalk.hex('#66BB6A');
const CYAN      = chalk.hex('#26C6DA');
const RED       = chalk.hex('#EF5350');
const GRAY      = chalk.gray;
const BLUE      = chalk.hex('#42A5F5');
const BOB_COLOR = chalk.hex('#E66F24');
const BORDER    = chalk.hex('#455A64');
const WHITE     = chalk.white;

const BOB_DIR = path.join(os.homedir(), '.bob');

function getSessionFilePath(): string {
  const projectName = path.basename(process.cwd());
  return path.join(BOB_DIR, 'projects', projectName, 'userbob-session.json');
}

function writeSessionFile(data: Record<string, any>): void {
  const filePath = getSessionFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readSessionFile(): Record<string, any> | null {
  const filePath = getSessionFilePath();
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}

function clearSessionFile(): void {
  const filePath = getSessionFilePath();
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function renderHUD(sat: number, target: number, stag: number, stagTarget: number, div: number, divTarget: number, grading: number): void {
  const satBar = sat >= target ? GREEN(`${sat}%`) : sat >= target * 0.7 ? AMBER(`${sat}%`) : RED(`${sat}%`);
  console.log('');
  console.log(BORDER('  ─── MISSION CONTROL ──────────────────────────────────────────'));
  console.log(
    `  SAT: ${satBar} → ${target}%` +
    `  │  STAG: ${stag}/${stagTarget > 0 ? stagTarget : '∞'}` +
    `  │  DIV: ${div}/${divTarget > 0 ? divTarget : '∞'}` +
    `  │  GRADE: ${grading}`
  );
  console.log(BORDER('  ────────────────────────────────────────────────────────────────'));
  console.log('');
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '  • ')
    .replace(/^\s*\d+\.\s+/gm, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderMessage(sender: string, message: string, audit?: any): void {
  const cleanMsg = stripMarkdown(message);
  const maxWidth = 70;
  const lines = wrapText(cleanMsg, maxWidth - 4);

  if (sender === 'userBob') {
    const topBar = PURPLE(`  ┌─ UserBob ${'─'.repeat(maxWidth - 13)}┐`);
    const bottomBar = PURPLE(`  └${'─'.repeat(maxWidth - 2)}┘`);
    console.log('');
    console.log(topBar);
    for (const line of lines) {
      const padded = line.padEnd(maxWidth - 4);
      console.log(PURPLE('  │') + `  ${padded}` + PURPLE('  │'));
    }
    console.log(bottomBar);

    if (audit) {
      const chips: string[] = [];
      if (audit.satisfactionScore !== undefined) chips.push(CYAN(`[SAT: ${audit.satisfactionScore}%]`));
      if (audit.resemblanceScore !== undefined)  chips.push(BLUE(`[RES: ${audit.resemblanceScore}%]`));
      if (audit.reasoning) chips.push(GRAY(`[${String(audit.reasoning).slice(0, 50)}...]`));
      if (chips.length > 0) console.log('  ' + chips.join(' '));
    }

  } else if (sender === 'bob') {
    const indent = '          ';
    const topBar = BOB_COLOR(`${indent}┌${'─'.repeat(maxWidth - 12)}─ Bob ─┐`);
    const bottomBar = BOB_COLOR(`${indent}└${'─'.repeat(maxWidth - 2)}┘`);
    console.log('');
    console.log(topBar);
    for (const line of lines) {
      const padded = line.padEnd(maxWidth - 4);
      console.log(BOB_COLOR(`${indent}│`) + `  ${padded}` + BOB_COLOR('  │'));
    }
    console.log(bottomBar);

  } else if (sender === 'system') {
    console.log('');
    console.log(CYAN('  ── SYSTEM ──────────────────────────────────────'));
    console.log(GRAY(`  ${cleanMsg}`));
    console.log(CYAN('  ────────────────────────────────────────────────'));

  } else {
    console.log('');
    console.log(GRAY(`  [${sender.toUpperCase()}] ${cleanMsg}`));
  }
}

function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length > maxWidth) {
        if (currentLine) lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
  }

  return lines;
}

async function handleSlashCommand(input: string, config: any, conversationId: string): Promise<void> {
  const trimmed = input.trim();

  if (trimmed === '/status') {
    try {
      const response = await callCloudFunction('getCLIConversationMessages', { conversationId, since: null });
      const state = response?.state || {};
      console.log('');
      console.log(AMBER('  ─── Current Parameters ───'));
      console.log(GRAY(`  Target Satisfaction : ${state.targetSatisfaction ?? 'N/A'}`));
      console.log(GRAY(`  Grading Standard    : ${state.gradingStandard ?? 'N/A'}`));
      console.log(GRAY(`  Current Satisfaction: ${state.currentSatisfaction ?? 'N/A'}`));
      console.log(GRAY(`  Stalemate           : ${state.stalemateState?.current ?? 0}/${state.stalemateState?.target ?? '∞'}`));
      console.log(GRAY(`  Divergence          : ${state.divergenceState?.current ?? 0}/${state.divergenceState?.target ?? '∞'}`));
      console.log(GRAY(`  Status              : ${state.simulationStatus ?? 'UNKNOWN'}`));
      console.log(GRAY(`  Active              : ${state.userBobActive ?? 'UNKNOWN'}`));
      console.log('');
    } catch {
      console.log(RED('  ❌ Could not fetch conversation state.'));
    }
    return;
  }

  const setMatch = trimmed.match(/^\/set\s+(grading|target|stag|div)\s+(\d+)$/i);
  if (setMatch) {
    const param = setMatch[1].toLowerCase();
    const value = parseInt(setMatch[2], 10);
    const paramMap: Record<string, string> = {
      grading: 'gradingStandard',
      target:  'targetSatisfaction',
      stag:    'stalemateZone',
      div:     'divergenceThreshold',
    };
    try {
      await callHTTPFunction('userSimManagerService', {
        action: 'updateParameters',
        conversationId,
        uid: config.uid,
        email: config.email,
        params: { [paramMap[param]]: value },
      });
      console.log(GREEN(`  ✅ ${param} updated to ${value}`));
    } catch (e: any) {
      console.log(RED(`  ❌ Failed to update ${param}: ${e.message}`));
    }
    return;
  }

  const injectMatch = trimmed.match(/^\/inject\s+"(.+)"$/);
  if (injectMatch) {
    const note = injectMatch[1];
    try {
      await callHTTPFunction('userSimManagerService', {
        action: 'injectNote',
        conversationId,
        uid: config.uid,
        email: config.email,
        note,
      });
      console.log(GREEN(`  ✅ Director's note injected.`));
    } catch (e: any) {
      console.log(RED(`  ❌ Failed to inject note: ${e.message}`));
    }
    return;
  }

  console.log(GRAY('  Commands: /set grading|target|stag|div <n>  /inject "note"  /status  /abort'));
}

async function runPlatformSimulation(
  config: any,
  conversationId: string,
  mission: string,
  params: { target: number; grading: number; stag: number; div: number }
): Promise<void> {

  await callHTTPFunction('userSimManagerService', {
    action: 'updateParameters',
    conversationId,
    uid: config.uid,
    email: config.email,
    params: {
      targetSatisfaction:  params.target,
      gradingStandard:     params.grading,
      stalemateZone:       params.stag,
      divergenceThreshold: params.div,
    },
  });

  await callHTTPFunction('userSimManagerService', {
    action: 'injectNote',
    conversationId,
    uid: config.uid,
    email: config.email,
    note: mission,
  });

  console.log(GREEN('  ✅ Mission injected. Simulation is running.'));
  console.log('');
  console.log(BORDER('  ─── LIVE SIMULATION ──────────────────────────────────────────'));
  console.log(GRAY('  Messages will stream below as Bob and UserBob interact.'));
  console.log(GRAY('  You can type commands at any time:'));
  console.log('');
  console.log(AMBER('    /abort') + GRAY('              — Stop the simulation immediately'));
  console.log(AMBER('    /set target 90') + GRAY('     — Update satisfaction target'));
  console.log(AMBER('    /set grading 70') + GRAY('    — Update Teacher\'s Curve'));
  console.log(AMBER('    /set stag 5') + GRAY('        — Update stalemate threshold'));
  console.log(AMBER('    /set div 3') + GRAY('         — Update divergence threshold'));
  console.log(AMBER('    /inject "note"') + GRAY('     — Inject a director\'s note mid-session'));
  console.log(AMBER('    /status') + GRAY('            — Show current simulation parameters'));
  console.log('');
  console.log(BORDER('  ────────────────────────────────────────────────────────────────'));
  console.log('');

  let running = true;
  let lastMessageTimestamp = 0;
  let hudState = { sat: 0, target: params.target, stag: 0, stagTarget: params.stag, div: 0, divTarget: params.div, grading: params.grading };

  const sigintHandler = async () => {
    if (!running) return;
    running = false;
    console.log('\n');
    console.log(AMBER('  🛑 Aborting simulation...'));
    try {
      await callHTTPFunction('userSimManagerService', {
        action: 'abortMission',
        conversationId,
        uid: config.uid,
        email: config.email,
      });
      console.log(GREEN('  ✅ Simulation aborted.'));
    } catch { }
    process.exit(0);
  };
  process.on('SIGINT', sigintHandler);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.setPrompt('');

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === '/abort' || trimmed === 'abort') {
      running = false;
      console.log(AMBER('  🛑 Aborting simulation...'));
      try {
        await callHTTPFunction('userSimManagerService', {
          action: 'abortMission',
          conversationId,
          uid: config.uid,
          email: config.email,
        });
        console.log(GREEN('  ✅ Simulation aborted.'));
      } catch { }
      rl.close();
      process.exit(0);
    }

    await handleSlashCommand(trimmed, config, conversationId);
  });

  while (running) {
    await new Promise(r => setTimeout(r, 3000));

    try {
      const response = await callCloudFunction('getCLIConversationMessages', {
        conversationId,
        since: lastMessageTimestamp || null,
      });

      const messages: any[] = response?.messages || [];
      const state = response?.state || {};

      for (const msg of messages) {
        renderMessage(msg.sender, msg.message, msg.simulationAudit);
        if (msg.timestamp && msg.timestamp > lastMessageTimestamp) {
          lastMessageTimestamp = msg.timestamp;
        }
      }

      if (state.currentSatisfaction !== undefined) hudState.sat = state.currentSatisfaction;
      if (state.targetSatisfaction !== undefined) hudState.target = state.targetSatisfaction;
      if (state.gradingStandard !== undefined) hudState.grading = state.gradingStandard;
      if (state.stalemateState) {
        hudState.stag = state.stalemateState.current ?? hudState.stag;
        hudState.stagTarget = state.stalemateState.target ?? hudState.stagTarget;
      }
      if (state.divergenceState) {
        hudState.div = state.divergenceState.current ?? hudState.div;
        hudState.divTarget = state.divergenceState.target ?? hudState.divTarget;
      }

      if (state.userBobActive === false || (state.simulationStatus && state.simulationStatus !== 'RUNNING')) {
        if (messages.length > 0) {
          renderHUD(hudState.sat, hudState.target, hudState.stag, hudState.stagTarget, hudState.div, hudState.divTarget, hudState.grading);
        }
        console.log('');
        console.log(AMBER(`  🏁 Simulation ended: ${state.simulationStatus || 'INACTIVE'}`));
        console.log('');
        running = false;
        break;
      }

      if (messages.length > 0) {
        renderHUD(hudState.sat, hudState.target, hudState.stag, hudState.stagTarget, hudState.div, hudState.divTarget, hudState.grading);
      }

    } catch (e: any) {
      console.log(RED(`  ❌ Poll error: ${e.message}`));
    }
  }

  rl.close();
  process.removeListener('SIGINT', sigintHandler);
}

async function runLocalSimulation(
  config: any,
  dnaString: string | null,
  mission: string,
  params: { target: number; grading: number; stag: number; div: number }
): Promise<void> {

  writeSessionFile({ active: true, turns: 0, mission });

  let running = true;
  let turns = 0;
  let conversationHistory: LocalChatMessage[] = [];
  let sat = 0;
  let stalemateCurrent = 0;
  let divergenceCurrent = 0;
  let lastStatus = '';

  const sigintHandler = () => {
    running = false;
    writeSessionFile({ active: false });
    clearSessionFile();
    console.log('\n' + AMBER('  🛑 Simulation stopped.'));
    process.exit(0);
  };
  process.on('SIGINT', sigintHandler);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.setPrompt('');

  rl.on('line', (line) => {
    const t = line.trim();
    if (t === '/abort' || t === 'abort') {
      running = false;
      writeSessionFile({ active: false });
      clearSessionFile();
      console.log(AMBER('  🛑 Simulation stopped.'));
      rl.close();
      process.exit(0);
    }
    if (t.startsWith('/set ')) {
      const m = t.match(/^\/set\s+(grading|target|stag|div)\s+(\d+)$/i);
      if (m) {
        const val = parseInt(m[2], 10);
        if (m[1] === 'grading') params.grading = val;
        if (m[1] === 'target')  params.target  = val;
        if (m[1] === 'stag')    params.stag    = val;
        if (m[1] === 'div')     params.div     = val;
        console.log(GREEN(`  ✅ ${m[1]} updated to ${val} (local)`));
      }
    }
    if (t === '/status') {
      console.log('');
      console.log(AMBER('  ─── Local Sim Parameters ───'));
      console.log(GRAY(`  Target: ${params.target}  │  Grading: ${params.grading}  │  Stag Limit: ${params.stag}  │  Div Limit: ${params.div}`));
      console.log(GRAY(`  Current SAT: ${sat}  │  Turns: ${turns}  │  Stag: ${stalemateCurrent}  │  Div: ${divergenceCurrent}`));
      console.log('');
    }
  });

  const bobSystem = `You are Bob — a senior AI engineering consultant. A developer's digital twin (UserBob) is evaluating your work. Respond helpfully and directly to advance the mission. Mission context: ${mission}`;

  const userBobSystem = dnaString
    ? `You are a digital twin of a software engineer. You ARE this developer. Your personality, communication style, and engineering philosophy are defined below.\n\nMission: ${mission}\n\n${dnaString}\n\nAfter each Bob response, evaluate it 0-100 on how well it advances YOUR mission. Reply with your natural reaction, then append exactly one JSON footer on its own line:\n{"satisfactionScore": <0-100>, "status": "CONVERGING|STAGNATING|DIVERGING"}`
    : `You are a digital twin of a software engineer. You have no personal profile loaded — respond based on the mission context only.\n\nMission: ${mission}\n\nAfter each Bob response, evaluate it 0-100 on mission alignment. Reply with your reaction, then append exactly one JSON footer on its own line:\n{"satisfactionScore": <0-100>, "status": "CONVERGING|STAGNATING|DIVERGING"}`;

  console.log(BORDER('  ─── LIVE LOCAL SIMULATION ────────────────────────────────────'));
  console.log(GRAY('  Bob and UserBob will converse autonomously below.'));
  console.log(GRAY('  Commands:'));
  console.log(AMBER('    /abort') + GRAY('              — Stop the simulation'));
  console.log(AMBER('    /set target 90') + GRAY('     — Update satisfaction target'));
  console.log(AMBER('    /set grading 70') + GRAY('    — Update Teacher\'s Curve'));
  console.log(AMBER('    /set stag 5') + GRAY('        — Update stalemate threshold'));
  console.log(AMBER('    /set div 3') + GRAY('         — Update divergence threshold'));
  console.log(AMBER('    /status') + GRAY('            — Show current parameters'));
  console.log(BORDER('  ────────────────────────────────────────────────────────────────'));
  console.log('');

  const kickstart = `Mission received: "${mission}". Bob, what's your first move?`;
  console.log(PURPLE('  UserBob > ') + WHITE(kickstart));
  conversationHistory.push({ role: 'user', content: kickstart });

  while (running) {
    const session = readSessionFile();
    if (!session?.active) { running = false; break; }

    turns++;

    try {
      const bobMessages: LocalChatMessage[] = [
        { role: 'system', content: bobSystem },
        ...conversationHistory,
      ];
      const bobResponse = await callLocalModel(config.localEndpoint!, bobMessages);
      console.log(BOB_COLOR('  Bob       > ') + WHITE(bobResponse));
      conversationHistory.push({ role: 'assistant', content: bobResponse });

      const ubMessages: LocalChatMessage[] = [
        { role: 'system', content: userBobSystem },
        ...conversationHistory,
      ];
      const ubResponse = await callLocalModel(config.localEndpoint!, ubMessages);

      const jsonMatch = ubResponse.match(/\{[^}]*"satisfactionScore"[^}]*\}/);
      const cleanResponse = ubResponse.replace(/\{[^}]*"satisfactionScore"[^}]*\}/, '').trim();
      console.log(PURPLE('  UserBob > ') + WHITE(cleanResponse));

      let auditChips: string[] = [];
      if (jsonMatch) {
        try {
          const audit = JSON.parse(jsonMatch[0]);
          const rawScore = audit.satisfactionScore || 0;
          sat = Math.round(rawScore * (params.grading / 100));
          lastStatus = audit.status || '';
          auditChips = [CYAN(`[SAT: ${sat}%]`), BLUE(`[RAW: ${rawScore}]`), GRAY(`[${lastStatus}]`)];

          if (lastStatus === 'STAGNATING') {
            stalemateCurrent++;
            if (params.stag > 0 && stalemateCurrent >= params.stag) {
              console.log('            ' + auditChips.join(' '));
              renderHUD(sat, params.target, stalemateCurrent, params.stag, divergenceCurrent, params.div, params.grading);
              console.log(AMBER(`  🏁 Stalemate threshold reached (${stalemateCurrent}/${params.stag}). Simulation ended.`));
              running = false;
              break;
            }
          } else if (lastStatus === 'DIVERGING') {
            divergenceCurrent++;
            stalemateCurrent = 0;
            if (params.div > 0 && divergenceCurrent >= params.div) {
              console.log('            ' + auditChips.join(' '));
              renderHUD(sat, params.target, stalemateCurrent, params.stag, divergenceCurrent, params.div, params.grading);
              console.log(AMBER(`  🏁 Divergence threshold reached (${divergenceCurrent}/${params.div}). Simulation ended.`));
              running = false;
              break;
            }
          } else if (lastStatus === 'CONVERGING') {
            stalemateCurrent = 0;
            divergenceCurrent = 0;
          }
        } catch { }
      }
      if (auditChips.length) console.log('            ' + auditChips.join(' '));

      conversationHistory.push({ role: 'user', content: ubResponse });
      writeSessionFile({ active: true, turns, mission, sat });

      renderHUD(sat, params.target, stalemateCurrent, params.stag, divergenceCurrent, params.div, params.grading);

      if (sat >= params.target) {
        console.log(GREEN(`  🎯 Target satisfaction ${params.target}% reached! Mission complete.`));
        running = false;
        break;
      }

      await new Promise(r => setTimeout(r, 1000));

    } catch (e: any) {
      console.log(RED(`  ❌ Local model error: ${e.message}`));
      console.log(GRAY('  Retrying in 3 seconds...'));
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  clearSessionFile();
  rl.close();
  process.removeListener('SIGINT', sigintHandler);
  console.log('');
  console.log(GRAY(`  Session complete. ${turns} turns processed.`));
  console.log('');
}

export function registerUserBobCommand(program: Command): void {
  program
    .command('userbob [mission...]')
    .description('Launch your UserBob digital twin simulation')
    .option('--local',                'Force local Ollama mode (Tier 1)')
    .option('--target <number>',      'Satisfaction target (default: 85)', '85')
    .option('--grading <number>',     'Teacher\'s curve grading standard (default: 50)', '50')
    .option('--stag <number>',        'Stalemate threshold — 0 = infinite (default: 0)', '0')
    .option('--div <number>',         'Divergence threshold — 0 = infinite (default: 0)', '0')
    .option('--resume',               'Resume without injecting a new mission note')
    .action(async (missionArgs: string[], options: { local?: boolean; target: string; grading: string; stag: string; div: string; resume?: boolean }) => {
      const config = getConfig();

      const params = {
        target:  parseInt(options.target,  10),
        grading: parseInt(options.grading, 10),
        stag:    parseInt(options.stag,    10),
        div:     parseInt(options.div,     10),
      };

      const usePlatform = !options.local && isAuthenticated();

      console.log('');
      console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
      console.log(BORDER('  ║') + PURPLE('  🤖 UserBob — Digital Twin Simulation'));
      console.log(BORDER('  ║') + GRAY(`  Mode: ${usePlatform ? 'Platform (Tier 3)' : 'Local Ollama (Tier 1)'}`));
      console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
      console.log('');

      const dna = buildDNAString();
      if (dna) {
        console.log(GREEN('  ✅ Behavioral DNA loaded.'));
      } else {
        console.log(AMBER('  ⚠️  No behavioral profile found.'));
        console.log(GRAY('  UserBob performs significantly better with your DNA loaded.'));
        console.log('');

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        const answer = await new Promise<string>(resolve => rl.question(AMBER('  Run `bob profile --today` now? (y/n): '), resolve));
        rl.close();

        if (answer.trim().toLowerCase() === 'y') {
          console.log('');
          console.log(GRAY('  Run `bob profile --today` in a separate terminal, then re-run `bob userbob`.'));
          process.exit(0);
        } else {
          console.log('');
          console.log(RED('  ⚠️  Running in Generic Mode — no behavioral profile loaded.'));
          console.log(RED('  UserBob will respond using project context only.'));
          console.log(RED('  Responses won\'t reflect your personal communication style,'));
          console.log(RED('  decision patterns, or engineering philosophy.'));
          console.log(GRAY('  Run `bob profile --today` anytime to unlock full personalization.'));
          console.log('');
        }
      }

      let mission = missionArgs.length > 0 ? missionArgs.join(' ') : '';

      if (!mission && !options.resume) {
        const mrl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        mission = await new Promise<string>(resolve => mrl.question(AMBER('  What\'s the mission? > '), resolve));
        mrl.close();
        if (!mission.trim()) {
          console.log(RED('  ❌ Mission cannot be empty. Exiting.'));
          process.exit(1);
        }
        mission = mission.trim();
      }

      console.log('');
      console.log(GRAY(`  Target: ${params.target}%  │  Grade: ${params.grading}  │  Stag: ${params.stag || '∞'}  │  Div: ${params.div || '∞'}`));
      console.log('');

      if (usePlatform) {
        // ─── Read conversation ID from project scope ───
        const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;

        if (!conversationId) {
          console.log(RED('  ❌ No active conversation. Run `bob conversations join` first.'));
          process.exit(1);
        }

        if (options.resume) {
          console.log(AMBER('  🔄 Resuming simulation (no new mission note)...'));
          await callHTTPFunction('userSimManagerService', {
            action: 'resumeMission',
            conversationId,
            uid: config.uid,
            email: config.email,
          });
          console.log(GREEN('  ✅ Simulation resumed. Entering watch mode...'));
          console.log('');
          await runPlatformSimulation(config, conversationId, mission || 'Resumed session', params);
        } else {
          await runPlatformSimulation(config, conversationId, mission, params);
        }
        return;
      }

      if (!config.localEndpoint) {
        console.log(RED('  ❌ No local model configured.'));
        console.log(GRAY('  Run: bob config set localEndpoint http://127.0.0.1:11434/api/chat'));
        process.exit(1);
      }

      await runLocalSimulation(config, dna, mission, params);
    });
}