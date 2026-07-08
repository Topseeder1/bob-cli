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
const MODE_CONSULTANT = chalk.hex('#AB47BC');
const BRAND_PRIMARY   = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS         = chalk.hex('#66BB6A');
const INFO            = chalk.hex('#26C6DA');
const WARNING         = chalk.hex('#FFC107');
const ERROR           = chalk.hex('#EF5350');
const MUTED           = chalk.hex('#78909C');
const BLUE            = chalk.hex('#42A5F5');
const BORDER          = chalk.hex('#455A64');

// ─── LAYOUT HELPERS ───
const BOX_WIDTH = 62;

function pad(text: string): string {
  const visible = text.replace(/\x1B\[[0-9;]*m/g, '');
  const padding = BOX_WIDTH - visible.length - 2;
  return text + ' '.repeat(Math.max(0, padding));
}

function topRule(): string {
  return BORDER('  ╔' + '═'.repeat(BOX_WIDTH) + '╗');
}

function botRule(): string {
  return BORDER('  ╚' + '═'.repeat(BOX_WIDTH) + '╝');
}

function hRule(): string {
  return BORDER('  ╠' + '═'.repeat(BOX_WIDTH) + '╣');
}

function row(content: string): string {
  return BORDER('  ║ ') + pad(content) + BORDER(' ║');
}

function emptyRow(): string {
  return BORDER('  ║') + ' '.repeat(BOX_WIDTH) + BORDER('║');
}

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

// ─── MISSION CONTROL HUD ─────────────────────────────────────────

function renderHUD(sat: number, target: number, stag: number, stagTarget: number, div: number, divTarget: number, grading: number): void {
  const satColor = sat >= target ? SUCCESS : sat >= target * 0.7 ? BRAND_SECONDARY : ERROR;
  const satStr   = satColor(`${sat}%`);

  console.log('');
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('◉  MISSION CONTROL')));
  console.log(hRule());
  console.log(row(
    MUTED('SAT: ')    + satStr + MUTED(` → ${target}%`) +
    MUTED('  │  STAG: ') + chalk.white(`${stag}/${stagTarget > 0 ? stagTarget : '∞'}`) +
    MUTED('  │  DIV: ')  + chalk.white(`${div}/${divTarget > 0 ? divTarget : '∞'}`) +
    MUTED('  │  GRADE: ') + chalk.white(`${grading}`)
  ));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}

// ─── STRIP MARKDOWN ──────────────────────────────────────────────

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

// ─── RENDER MESSAGE ───────────────────────────────────────────────

function renderMessage(sender: string, message: string, audit?: any): void {
  const cleanMsg = stripMarkdown(message);
  const maxWidth = 70;
  const lines = wrapText(cleanMsg, maxWidth - 4);

  if (sender === 'userBob') {
    const topBar    = MODE_CONSULTANT(`  ┌─ UserBob ${'─'.repeat(maxWidth - 13)}┐`);
    const bottomBar = MODE_CONSULTANT(`  └${'─'.repeat(maxWidth - 2)}┘`);
    console.log('');
    console.log(topBar);
    for (const line of lines) {
      const padded = line.padEnd(maxWidth - 4);
      console.log(MODE_CONSULTANT('  │') + `  ${padded}` + MODE_CONSULTANT('  │'));
    }
    console.log(bottomBar);

    if (audit) {
      const chips: string[] = [];
      if (audit.satisfactionScore !== undefined) chips.push(INFO(`[SAT: ${audit.satisfactionScore}%]`));
      if (audit.resemblanceScore !== undefined)  chips.push(BLUE(`[RES: ${audit.resemblanceScore}%]`));
      if (audit.reasoning) chips.push(MUTED(`[${String(audit.reasoning).slice(0, 50)}...]`));
      if (chips.length > 0) console.log('  ' + chips.join(' '));
    }

  } else if (sender === 'bob') {
    const indent    = '          ';
    const topBar    = BRAND_PRIMARY(`${indent}┌${'─'.repeat(maxWidth - 12)}─ Bob ─┐`);
    const bottomBar = BRAND_PRIMARY(`${indent}└${'─'.repeat(maxWidth - 2)}┘`);
    console.log('');
    console.log(topBar);
    for (const line of lines) {
      const padded = line.padEnd(maxWidth - 4);
      console.log(BRAND_PRIMARY(`${indent}│`) + `  ${padded}` + BRAND_PRIMARY('  │'));
    }
    console.log(bottomBar);

  } else if (sender === 'system') {
    console.log('');
    console.log(INFO('  ── SYSTEM ──────────────────────────────────────'));
    console.log(MUTED(`  ${cleanMsg}`));
    console.log(INFO('  ────────────────────────────────────────────────'));

  } else {
    console.log('');
    console.log(MUTED(`  [${sender.toUpperCase()}] ${cleanMsg}`));
  }
}

// ─── WRAP TEXT ────────────────────────────────────────────────────

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

// ─── SLASH COMMAND HANDLER ────────────────────────────────────────

async function handleSlashCommand(input: string, config: any, conversationId: string): Promise<void> {
  const trimmed = input.trim();

  if (trimmed === '/status') {
    try {
      const response = await callCloudFunction('getCLIConversationMessages', { conversationId, since: null });
      const state    = response?.state || {};

      console.log('');
      console.log(topRule());
      console.log(row(BRAND_SECONDARY('◈  CURRENT PARAMETERS')));
      console.log(hRule());
      console.log(row(MUTED('▸ Target Satisfaction : ') + chalk.white(state.targetSatisfaction  ?? 'N/A')));
      console.log(row(MUTED('▸ Grading Standard    : ') + chalk.white(state.gradingStandard     ?? 'N/A')));
      console.log(row(MUTED('▸ Current Satisfaction: ') + chalk.white(state.currentSatisfaction ?? 'N/A')));
      console.log(row(MUTED('▸ Stalemate           : ') + chalk.white(`${state.stalemateState?.current ?? 0}/${state.stalemateState?.target ?? '∞'}`)));
      console.log(row(MUTED('▸ Divergence          : ') + chalk.white(`${state.divergenceState?.current ?? 0}/${state.divergenceState?.target ?? '∞'}`)));
      console.log(row(MUTED('▸ Status              : ') + chalk.white(state.simulationStatus    ?? 'UNKNOWN')));
      console.log(row(MUTED('▸ Active              : ') + chalk.white(String(state.userBobActive ?? 'UNKNOWN'))));
      console.log(emptyRow());
      console.log(botRule());
      console.log('');
    } catch {
      console.log(ERROR('  ❌ Could not fetch conversation state.'));
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
        uid:   config.uid,
        email: config.email,
        params: { [paramMap[param]]: value },
      });
      console.log(SUCCESS(`  ✅ ${param} updated to ${value}`));
    } catch (e: any) {
      console.log(ERROR(`  ❌ Failed to update ${param}: ${e.message}`));
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
        uid:   config.uid,
        email: config.email,
        note,
      });
      console.log(SUCCESS(`  ✅ Director's note injected.`));
    } catch (e: any) {
      console.log(ERROR(`  ❌ Failed to inject note: ${e.message}`));
    }
    return;
  }

  console.log(MUTED('  Commands: /set grading|target|stag|div <n>  /inject "note"  /status  /abort'));
}

// ─── PLATFORM SIMULATION ─────────────────────────────────────────

async function runPlatformSimulation(
  config: any,
  conversationId: string,
  mission: string,
  params: { target: number; grading: number; stag: number; div: number }
): Promise<void> {

  await callHTTPFunction('userSimManagerService', {
    action: 'updateParameters',
    conversationId,
    uid:   config.uid,
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
    uid:   config.uid,
    email: config.email,
    note:  mission,
  });

  console.log(SUCCESS('  ✅ Mission injected. Simulation is running.'));
  console.log('');

  // ─── Live simulation header card ───
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('◉  LIVE SIMULATION')));
  console.log(row(MUTED('Messages will stream below as Bob and UserBob interact.')));
  console.log(hRule());
  console.log(row(MUTED('▸ /abort              — Stop the simulation immediately')));
  console.log(row(MUTED('▸ /set target 90      — Update satisfaction target')));
  console.log(row(MUTED('▸ /set grading 70     — Update Teacher\'s Curve')));
  console.log(row(MUTED('▸ /set stag 5         — Update stalemate threshold')));
  console.log(row(MUTED('▸ /set div 3          — Update divergence threshold')));
  console.log(row(MUTED('▸ /inject "note"      — Inject a director\'s note mid-session')));
  console.log(row(MUTED('▸ /status             — Show current simulation parameters')));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');

  let running             = true;
  let lastMessageTimestamp = 0;
  let hudState            = {
    sat: 0, target: params.target,
    stag: 0, stagTarget: params.stag,
    div: 0, divTarget: params.div,
    grading: params.grading,
  };

  const sigintHandler = async () => {
    if (!running) return;
    running = false;
    console.log('\n');
    console.log(BRAND_SECONDARY('  🛑 Aborting simulation...'));
    try {
      await callHTTPFunction('userSimManagerService', {
        action: 'abortMission',
        conversationId,
        uid:   config.uid,
        email: config.email,
      });
      console.log(SUCCESS('  ✅ Simulation aborted.'));
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
      console.log(BRAND_SECONDARY('  🛑 Aborting simulation...'));
      try {
        await callHTTPFunction('userSimManagerService', {
          action: 'abortMission',
          conversationId,
          uid:   config.uid,
          email: config.email,
        });
        console.log(SUCCESS('  ✅ Simulation aborted.'));
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
      const state            = response?.state    || {};

      for (const msg of messages) {
        renderMessage(msg.sender, msg.message, msg.simulationAudit);
        if (msg.timestamp && msg.timestamp > lastMessageTimestamp) {
          lastMessageTimestamp = msg.timestamp;
        }
      }

      if (state.currentSatisfaction !== undefined) hudState.sat     = state.currentSatisfaction;
      if (state.targetSatisfaction  !== undefined) hudState.target  = state.targetSatisfaction;
      if (state.gradingStandard     !== undefined) hudState.grading = state.gradingStandard;
      if (state.stalemateState) {
        hudState.stag      = state.stalemateState.current ?? hudState.stag;
        hudState.stagTarget = state.stalemateState.target  ?? hudState.stagTarget;
      }
      if (state.divergenceState) {
        hudState.div      = state.divergenceState.current ?? hudState.div;
        hudState.divTarget = state.divergenceState.target  ?? hudState.divTarget;
      }

      if (state.userBobActive === false || (state.simulationStatus && state.simulationStatus !== 'RUNNING')) {
        if (messages.length > 0) {
          renderHUD(hudState.sat, hudState.target, hudState.stag, hudState.stagTarget, hudState.div, hudState.divTarget, hudState.grading);
        }
        console.log('');
        console.log(BRAND_SECONDARY(`  🏁 Simulation ended: ${state.simulationStatus || 'INACTIVE'}`));
        console.log('');
        running = false;
        break;
      }

      if (messages.length > 0) {
        renderHUD(hudState.sat, hudState.target, hudState.stag, hudState.stagTarget, hudState.div, hudState.divTarget, hudState.grading);
      }

    } catch (e: any) {
      console.log(ERROR(`  ❌ Poll error: ${e.message}`));
    }
  }

  rl.close();
  process.removeListener('SIGINT', sigintHandler);
}

// ─── LOCAL SIMULATION ─────────────────────────────────────────────

async function runLocalSimulation(
  config: any,
  dnaString: string | null,
  mission: string,
  params: { target: number; grading: number; stag: number; div: number }
): Promise<void> {

  writeSessionFile({ active: true, turns: 0, mission });

  let running           = true;
  let turns             = 0;
  let conversationHistory: LocalChatMessage[] = [];
  let sat               = 0;
  let stalemateCurrent  = 0;
  let divergenceCurrent = 0;
  let lastStatus        = '';

  const sigintHandler = () => {
    running = false;
    writeSessionFile({ active: false });
    clearSessionFile();
    console.log('\n' + BRAND_SECONDARY('  🛑 Simulation stopped.'));
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
      console.log(BRAND_SECONDARY('  🛑 Simulation stopped.'));
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
        console.log(SUCCESS(`  ✅ ${m[1]} updated to ${val} (local)`));
      }
    }
    if (t === '/status') {
      console.log('');
      console.log(topRule());
      console.log(row(BRAND_SECONDARY('◈  LOCAL SIM PARAMETERS')));
      console.log(hRule());
      console.log(row(MUTED('▸ Target:     ') + chalk.white(`${params.target}%`)));
      console.log(row(MUTED('▸ Grading:    ') + chalk.white(`${params.grading}`)));
      console.log(row(MUTED('▸ Stag Limit: ') + chalk.white(`${params.stag || '∞'}`)));
      console.log(row(MUTED('▸ Div Limit:  ') + chalk.white(`${params.div  || '∞'}`)));
      console.log(hRule());
      console.log(row(MUTED('▸ Current SAT:') + chalk.white(`${sat}%`)));
      console.log(row(MUTED('▸ Turns:      ') + chalk.white(`${turns}`)));
      console.log(row(MUTED('▸ Stag:       ') + chalk.white(`${stalemateCurrent}`)));
      console.log(row(MUTED('▸ Div:        ') + chalk.white(`${divergenceCurrent}`)));
      console.log(emptyRow());
      console.log(botRule());
      console.log('');
    }
  });

  const bobSystem    = `You are Bob — a senior AI engineering consultant. A developer's digital twin (UserBob) is evaluating your work. Respond helpfully and directly to advance the mission. Mission context: ${mission}`;
  const userBobSystem = dnaString
    ? `You are a digital twin of a software engineer. You ARE this developer. Your personality, communication style, and engineering philosophy are defined below.\n\nMission: ${mission}\n\n${dnaString}\n\nAfter each Bob response, evaluate it 0-100 on how well it advances YOUR mission. Reply with your natural reaction, then append exactly one JSON footer on its own line:\n{"satisfactionScore": <0-100>, "status": "CONVERGING|STAGNATING|DIVERGING"}`
    : `You are a digital twin of a software engineer. You have no personal profile loaded — respond based on the mission context only.\n\nMission: ${mission}\n\nAfter each Bob response, evaluate it 0-100 on mission alignment. Reply with your reaction, then append exactly one JSON footer on its own line:\n{"satisfactionScore": <0-100>, "status": "CONVERGING|STAGNATING|DIVERGING"}`;

  // ─── Live local simulation header card ───
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('◉  LIVE LOCAL SIMULATION')));
  console.log(row(MUTED('Bob and UserBob will converse autonomously below.')));
  console.log(hRule());
  console.log(row(MUTED('▸ /abort              — Stop the simulation')));
  console.log(row(MUTED('▸ /set target 90      — Update satisfaction target')));
  console.log(row(MUTED('▸ /set grading 70     — Update Teacher\'s Curve')));
  console.log(row(MUTED('▸ /set stag 5         — Update stalemate threshold')));
  console.log(row(MUTED('▸ /set div 3          — Update divergence threshold')));
  console.log(row(MUTED('▸ /status             — Show current parameters')));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');

  const kickstart = `Mission received: "${mission}". Bob, what's your first move?`;
  console.log(MODE_CONSULTANT('  UserBob > ') + chalk.white(kickstart));
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
      console.log(BRAND_PRIMARY('  Bob       > ') + chalk.white(bobResponse));
      conversationHistory.push({ role: 'assistant', content: bobResponse });

      const ubMessages: LocalChatMessage[] = [
        { role: 'system', content: userBobSystem },
        ...conversationHistory,
      ];
      const ubResponse = await callLocalModel(config.localEndpoint!, ubMessages);

      const jsonMatch    = ubResponse.match(/\{[^}]*"satisfactionScore"[^}]*\}/);
      const cleanResponse = ubResponse.replace(/\{[^}]*"satisfactionScore"[^}]*\}/, '').trim();
      console.log(MODE_CONSULTANT('  UserBob > ') + chalk.white(cleanResponse));

      let auditChips: string[] = [];
      if (jsonMatch) {
        try {
          const audit    = JSON.parse(jsonMatch[0]);
          const rawScore = audit.satisfactionScore || 0;
          sat            = Math.round(rawScore * (params.grading / 100));
          lastStatus     = audit.status || '';
          auditChips     = [
            INFO(`[SAT: ${sat}%]`),
            BLUE(`[RAW: ${rawScore}]`),
            MUTED(`[${lastStatus}]`),
          ];

          if (lastStatus === 'STAGNATING') {
            stalemateCurrent++;
            if (params.stag > 0 && stalemateCurrent >= params.stag) {
              console.log('            ' + auditChips.join(' '));
              renderHUD(sat, params.target, stalemateCurrent, params.stag, divergenceCurrent, params.div, params.grading);
              console.log(BRAND_SECONDARY(`  🏁 Stalemate threshold reached (${stalemateCurrent}/${params.stag}). Simulation ended.`));
              running = false;
              break;
            }
          } else if (lastStatus === 'DIVERGING') {
            divergenceCurrent++;
            stalemateCurrent = 0;
            if (params.div > 0 && divergenceCurrent >= params.div) {
              console.log('            ' + auditChips.join(' '));
              renderHUD(sat, params.target, stalemateCurrent, params.stag, divergenceCurrent, params.div, params.grading);
              console.log(BRAND_SECONDARY(`  🏁 Divergence threshold reached (${divergenceCurrent}/${params.div}). Simulation ended.`));
              running = false;
              break;
            }
          } else if (lastStatus === 'CONVERGING') {
            stalemateCurrent  = 0;
            divergenceCurrent = 0;
          }
        } catch { }
      }
      if (auditChips.length) console.log('            ' + auditChips.join(' '));

      conversationHistory.push({ role: 'user', content: ubResponse });
      writeSessionFile({ active: true, turns, mission, sat });

      renderHUD(sat, params.target, stalemateCurrent, params.stag, divergenceCurrent, params.div, params.grading);

      if (sat >= params.target) {
        console.log(SUCCESS(`  🎯 Target satisfaction ${params.target}% reached! Mission complete.`));
        running = false;
        break;
      }

      await new Promise(r => setTimeout(r, 1000));

    } catch (e: any) {
      console.log(ERROR(`  ❌ Local model error: ${e.message}`));
      console.log(MUTED('  Retrying in 3 seconds...'));
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  clearSessionFile();
  rl.close();
  process.removeListener('SIGINT', sigintHandler);
  console.log('');
  console.log(MUTED(`  Session complete. ${turns} turns processed.`));
  console.log('');
}

// ─── REGISTER COMMAND ─────────────────────────────────────────────

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
      console.log(BORDER('  ║ ') + MODE_CONSULTANT('🤖  UserBob — Digital Twin Simulation'));
      console.log(BORDER('  ║ ') + MUTED(`Mode: ${usePlatform ? 'Platform (Tier 3)' : 'Local Ollama (Tier 1)'}`));
      console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
      console.log('');

      const dna = buildDNAString();
      if (dna) {
        console.log(SUCCESS('  ✅ Behavioral DNA loaded.'));
      } else {
        console.log(BRAND_SECONDARY('  ⚠️  No behavioral profile found.'));
        console.log(MUTED('  UserBob performs significantly better with your DNA loaded.'));
        console.log('');

        const rl     = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        const answer = await new Promise<string>(resolve => rl.question(BRAND_SECONDARY('  Run `bob profile --today` now? (y/n): '), resolve));
        rl.close();

        if (answer.trim().toLowerCase() === 'y') {
          console.log('');
          console.log(MUTED('  Run `bob profile --today` in a separate terminal, then re-run `bob userbob`.'));
          process.exit(0);
        } else {
          console.log('');
          console.log(ERROR('  ⚠️  Running in Generic Mode — no behavioral profile loaded.'));
          console.log(ERROR('  UserBob will respond using project context only.'));
          console.log(ERROR('  Responses won\'t reflect your personal communication style,'));
          console.log(ERROR('  decision patterns, or engineering philosophy.'));
          console.log(MUTED('  Run `bob profile --today` anytime to unlock full personalization.'));
          console.log('');
        }
      }

      let mission = missionArgs.length > 0 ? missionArgs.join(' ') : '';

      if (!mission && !options.resume) {
        const mrl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        mission   = await new Promise<string>(resolve => mrl.question(BRAND_SECONDARY('  What\'s the mission? > '), resolve));
        mrl.close();
        if (!mission.trim()) {
          console.log(ERROR('  ❌ Mission cannot be empty. Exiting.'));
          process.exit(1);
        }
        mission = mission.trim();
      }

      console.log('');
      console.log(MUTED(`  Target: ${params.target}%  │  Grade: ${params.grading}  │  Stag: ${params.stag || '∞'}  │  Div: ${params.div || '∞'}`));
      console.log('');

      if (usePlatform) {
        const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;

        if (!conversationId) {
          console.log(ERROR('  ❌ No active conversation. Run `bob conversations join` first.'));
          process.exit(1);
        }

        if (options.resume) {
          console.log(BRAND_SECONDARY('  🔄 Resuming simulation (no new mission note)...'));
          await callHTTPFunction('userSimManagerService', {
            action: 'resumeMission',
            conversationId,
            uid:   config.uid,
            email: config.email,
          });
          console.log(SUCCESS('  ✅ Simulation resumed. Entering watch mode...'));
          console.log('');
          await runPlatformSimulation(config, conversationId, mission || 'Resumed session', params);
        } else {
          await runPlatformSimulation(config, conversationId, mission, params);
        }
        return;
      }

      if (!config.localEndpoint) {
        console.log(ERROR('  ❌ No local model configured.'));
        console.log(MUTED('  Run: bob config set localEndpoint http://127.0.0.1:11434/api/chat'));
        process.exit(1);
      }

      await runLocalSimulation(config, dna, mission, params);
    });
}