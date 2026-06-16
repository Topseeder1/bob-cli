// File: src/commands/serve.ts

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { buildLocalContext } from '../core/context-builder.js';
import { STANDARD_STYLE_PROMPT, CONSULTANT_STYLE_PROMPT } from '../ai/persona.js';
import { getRelevantFileContents } from '../core/file-retrieval.js';
import { extractProposedFile, proposeAndWriteFile } from '../core/file-writer.js';
import {
  loadSummaries,
  loadDependencies,
  ensureProjectStructure,
  getProjectName,
  createAnalysisRun,
  completeTask,
  updateManifestProgress,
  saveSummaries,
  saveDependencies,
} from '../core/project-map.js';

const GREEN = chalk.hex('#66BB6A');
const AMBER = chalk.hex('#FFAB00');
const RED = chalk.hex('#EF5350');
const GRAY = chalk.gray;
const CYAN = chalk.cyan;
const BORDER = chalk.hex('#455A64');

const BOB_DIR = path.join(os.homedir(), '.bob');
const ALGORITHM = 'aes-256-cbc';

interface TierConfig {
  activeInterval: number;
  sleepInterval: number | null;
  idleThreshold: number | null;
  extendedIdleTimeout: number | null;
}

const TIER_CONFIGS: Record<string, TierConfig> = {
  'Power': {
    activeInterval: 2000,
    sleepInterval: 120000,
    idleThreshold: 5 * 60000,
    extendedIdleTimeout: null,
  },
  'Pro': {
    activeInterval: 10000,
    sleepInterval: 30000,
    idleThreshold: 5 * 60000,
    extendedIdleTimeout: 60 * 60000,
  },
  'Starter': {
    activeInterval: 15000,
    sleepInterval: null,
    idleThreshold: null,
    extendedIdleTimeout: 15 * 60000,
  },
};

const BLOCKED_TIERS = ['Explore', 'Free', 'free', 'explore'];

// ─── ENCRYPTION HELPERS (for remote backup) ──────────────────────

function deriveKey(uid: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(uid, salt, 100000, 32, 'sha256');
}

function encrypt(inputPath: string, outputPath: string, uid: string): void {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = deriveKey(uid, salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const input = fs.readFileSync(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const header = Buffer.from(salt + iv.toString('hex'), 'utf-8');
  fs.writeFileSync(outputPath, Buffer.concat([header, encrypted]));
}

function decrypt(inputPath: string, outputPath: string, uid: string): void {
  const data = fs.readFileSync(inputPath);
  const header = data.slice(0, 64).toString('utf-8');
  const salt = header.slice(0, 32);
  const iv = Buffer.from(header.slice(32, 64), 'hex');
  const encrypted = data.slice(64);
  const key = deriveKey(uid, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  fs.writeFileSync(outputPath, decrypted);
}

function getTempDir(): string {
  const tmpDir = path.join(os.tmpdir(), `bob-remote-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTemp(tmpDir: string): void {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
}

// ─── IGNORED FILE TYPES FOR INDEX ────────────────────────────────

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.dart_tool', '.idea', '.gradle', '.pub-cache', '.bob'];
const CODE_EXTENSIONS = new Set(['.dart', '.js', '.ts', '.html', '.css', '.json', '.yaml', '.yml', '.xml', '.sh', '.md']);

function scanProjectFiles(rootDir: string, currentDir?: string, depth: number = 0): string[] {
  if (depth > 6) return [];
  const dir = currentDir || rootDir;
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        files.push(...scanProjectFiles(rootDir, fullPath, depth + 1));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) files.push(relativePath);
      }
    }
  } catch { }

  return files;
}

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start an Active Bob — receive and execute commands from the web app or another device')
    .action(async () => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(RED('  ❌ Not logged in. Active Bob requires Tier 3.'));
        console.log(GRAY('  Run `bob login` to authenticate.'));
        console.log('');
        return;
      }

      if (!config.conversationId) {
        console.log('');
        console.log(RED('  ❌ No active conversation.'));
        console.log(GRAY('  Active Bob must be bound to a conversation.'));
        console.log(GRAY('  Run `bob conversations join` first, then `bob serve`.'));
        console.log('');
        return;
      }

      if (!config.localEndpoint) {
        console.log('');
        console.log(RED('  ❌ No local endpoint configured.'));
        console.log(GRAY('  Active Bob uses your local model for sovereign execution.'));
        console.log(GRAY('  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`'));
        console.log('');
        return;
      }

      // ─── FETCH TIER ───
      let userTier = 'Explore';
      try {
        const tierResult = await callCloudFunction('getCLIUserTier', {});
        userTier = tierResult?.tier || 'Explore';
      } catch {
        userTier = 'Explore';
      }

      // ─── BLOCK FREE/EXPLORE USERS ───
      if (BLOCKED_TIERS.includes(userTier)) {
        const email = config.email || '';
        const domain = email.split('@').pop()?.toLowerCase() || '';
        const genericDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'protonmail.com', 'ymail.com'];
        const isOrgUser = !genericDomains.includes(domain);

        console.log('');
        console.log(RED('  ❌ Active Bob requires a paid subscription.'));
        console.log(GRAY(`  Your current tier: ${userTier}`));
        console.log('');

        if (isOrgUser) {
          console.log(AMBER('  🏢 Contact your organization administrator to upgrade your tier.'));
          console.log(GRAY(`  Organization: ${domain}`));
          console.log(GRAY('  Admin Dashboard: https://bobs-workshop.web.app/#/bobsadmindashboard'));
        } else {
          console.log(AMBER('  🚀 Upgrade to unlock remote execution:'));
          console.log('');
          console.log(GRAY('    Starter  — 15s polling, 15 min idle timeout'));
          console.log(GRAY('    Pro      — 10s polling, sleep mode, 1 hour idle timeout'));
          console.log(GRAY('    Power    — 2s polling, sleep mode, never disconnects'));
          console.log('');
          console.log(CYAN('  Upgrade at: https://bobs-workshop.web.app/#/pricing'));
        }

        console.log('');
        return;
      }

      const tierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS['Starter'];
      const machineId = os.hostname();
      const projectName = path.basename(process.cwd());
      const sessionId = `${machineId}_${Date.now()}`;

      await startActiveBob(config, sessionId, machineId, projectName, tierConfig, userTier);
    });
}

async function startActiveBob(
  config: any,
  sessionId: string,
  machineId: string,
  projectName: string,
  tierConfig: TierConfig,
  userTier: string,
): Promise<void> {
  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + CYAN('  🌐 Bob Serve — Active Bob Online                       ') + BORDER('║'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GRAY(`  Account:  ${config.email}`));
  console.log(BORDER('  ║') + GRAY(`  Machine:  ${machineId}`));
  console.log(BORDER('  ║') + GRAY(`  Project:  ${projectName} (${process.cwd()})`));
  console.log(BORDER('  ║') + GRAY(`  Session:  ${sessionId.slice(0, 30)}...`));
  console.log(BORDER('  ║') + GRAY(`  Convo:    ${config.conversationId?.slice(0, 24)}...`));
  console.log(BORDER('  ║') + AMBER(`  Tier:     ${userTier}`));
  console.log(BORDER('  ║') + GRAY(`  Polling:  every ${tierConfig.activeInterval / 1000}s`));
  if (tierConfig.sleepInterval) {
    console.log(BORDER('  ║') + GRAY(`  Sleep:    every ${tierConfig.sleepInterval / 1000}s after ${tierConfig.idleThreshold! / 60000} min idle`));
  } else {
    console.log(BORDER('  ║') + GRAY('  Sleep:    disabled'));
  }
  if (tierConfig.extendedIdleTimeout) {
    console.log(BORDER('  ║') + GRAY(`  Auto-exit: after ${tierConfig.extendedIdleTimeout / 60000} min idle`));
  } else {
    console.log(BORDER('  ║') + GREEN('  Auto-exit: never (Power tier)'));
  }
  console.log(BORDER('  ║'));
  console.log(BORDER('  ║') + GRAY('  Capabilities: chat, consult, push, index, analyse, backup, restore'));
  console.log(BORDER('  ║') + GRAY('  Press Ctrl+C to stop.'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  // ─── REGISTER SESSION ───
  try {
    await callCloudFunction('registerRemoteDaemonSession', {
      conversationId: config.conversationId,
      sessionId,
      machineId,
      projectName,
      projectPath: process.cwd(),
      localEndpoint: config.localEndpoint,
    });
    console.log(GREEN('  ✅ Active Bob registered. Listening for commands...'));
    console.log('');
  } catch (error: any) {
    console.log(RED(`  ❌ Failed to register: ${error.message}`));
    return;
  }

  // ─── HANDLE CTRL+C ───
  let running = true;
  let sigintHandlerAdded = false;

  const cleanup = async () => {
    if (!running) return;
    running = false;
    console.log('');
    console.log(GRAY('  🔌 Shutting down Active Bob...'));
    try {
      await callCloudFunction('deregisterRemoteDaemonSession', {
        conversationId: config.conversationId,
        sessionId,
      });
      console.log(GRAY('  ✅ Session deregistered. Bob is offline.'));
    } catch {
      console.log(GRAY('  ⚠️  Could not deregister (will timeout automatically).'));
    }
    console.log('');
    process.exit(0);
  };

  if (!sigintHandlerAdded) {
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    sigintHandlerAdded = true;
  }

  // ─── POLLING LOOP ───
  let lastCommandTime = Date.now();
  let isSleeping = false;

  while (running) {
    const timeSinceLastCommand = Date.now() - lastCommandTime;

    // ─── CHECK EXTENDED IDLE ───
    if (tierConfig.extendedIdleTimeout && timeSinceLastCommand > tierConfig.extendedIdleTimeout) {
      console.log('');
      console.log(AMBER(`  ⏸️  No commands received in ${Math.round(tierConfig.extendedIdleTimeout / 60000)} minutes.`));
      console.log(GRAY('  Active Bob is going offline. Run `bob serve` to restart.'));
      console.log('');
      try {
        await callCloudFunction('deregisterRemoteDaemonSession', {
          conversationId: config.conversationId,
          sessionId,
        });
      } catch { }
      break;
    }

    // ─── CHECK SLEEP MODE ───
    if (tierConfig.sleepInterval && tierConfig.idleThreshold) {
      const shouldSleep = timeSinceLastCommand > tierConfig.idleThreshold;
      if (shouldSleep && !isSleeping) {
        isSleeping = true;
        const timestamp = new Date().toLocaleTimeString();
        console.log(GRAY(`  [${timestamp}] 💤 Entering sleep mode (polling every ${tierConfig.sleepInterval / 1000}s)...`));
      }
    }

    const currentInterval = (isSleeping && tierConfig.sleepInterval)
      ? tierConfig.sleepInterval
      : tierConfig.activeInterval;

    // ─── POLL ───
    try {
      const result = await callCloudFunction('pollRemoteCommands', {
        conversationId: config.conversationId,
        sessionId,
      });

      if (result?.command) {
        const cmd = result.command;
        const type = cmd.type;
        const payload = cmd.payload || {};

        if (isSleeping) {
          isSleeping = false;
          console.log(GREEN('  ⚡ Waking up — command received!'));
        }

        lastCommandTime = Date.now();
        const timestamp = new Date().toLocaleTimeString();
        console.log(AMBER(`  [${timestamp}] ⏳ Received: ${type}${payload.message ? ` "${payload.message.slice(0, 40)}${payload.message.length > 40 ? '...' : ''}"` : ''}`));

        const commandResult = await executeRemoteCommand(type, payload, config);

        await callCloudFunction('completeRemoteCommand', {
          conversationId: config.conversationId,
          commandId: cmd.id,
          sessionId,
          result: commandResult,
        });

        const endTimestamp = new Date().toLocaleTimeString();
        if (commandResult.success) {
          console.log(GREEN(`  [${endTimestamp}] ✅ Completed: ${type}`));
        } else {
          console.log(RED(`  [${endTimestamp}] ❌ Failed: ${type} — ${commandResult.error || 'unknown'}`));
        }
        console.log('');
      }

    } catch (error: any) {
      if (error.message?.includes('Session expired')) {
        console.log(RED('  ❌ Session expired. Run `bob login` and restart `bob serve`.'));
        running = false;
      }
    }

    if (running) {
      await new Promise(resolve => setTimeout(resolve, currentInterval));
    }
  }
}

// ═══════════════════════════════════════════════════════════
// COMMAND EXECUTION ROUTER
// ═══════════════════════════════════════════════════════════

async function executeRemoteCommand(type: string, payload: any, config: any): Promise<any> {
  switch (type) {
    case 'chat':      return await executeChat(payload, config);
    case 'consult':   return await executeConsult(payload, config);
    case 'push':      return await executePush(payload);
    case 'index':     return await executeIndex(payload, config);
    case 'analyse':   return await executeAnalyse(payload, config);
    case 'backup':    return await executeBackup(payload, config);
    case 'restore':   return await executeRestore(payload, config);
    case 'autonomy':  return { success: true, message: 'Autonomy command received. Feature in progress.' };
    default:          return { success: false, error: `Unknown command type: ${type}` };
  }
}

// ═══════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════

async function executeChat(payload: any, config: any): Promise<any> {
  const { message } = payload;
  if (!message) return { success: false, error: 'No message provided.' };

  try {
    const localContext = buildLocalContext(process.cwd());
    let relevantFiles = '';
    let selectedFiles: string[] = [];

    if (config.localEndpoint) {
      const retrieval = await getRelevantFileContents(message, config.localEndpoint);
      relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;
    }

    let fullContext = localContext;
    if (relevantFiles) fullContext += `\n\n${relevantFiles}`;

    const messages: LocalChatMessage[] = [
      { role: 'system', content: STANDARD_STYLE_PROMPT + (fullContext ? `\n\n## PROJECT CONTEXT ##\n${fullContext}` : '') },
      { role: 'user', content: message },
    ];

    const response = await callLocalModel(config.localEndpoint!, messages);

    const proposed = extractProposedFile(response);
    if (proposed) await proposeAndWriteFile(proposed, true);

    return {
      success: true,
      text: response,
      referencedFiles: selectedFiles,
      fileProposed: proposed ? proposed.filePath : null,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════
// CONSULT
// ═══════════════════════════════════════════════════════════

async function executeConsult(payload: any, config: any): Promise<any> {
  const { message } = payload;
  if (!message) return { success: false, error: 'No message provided.' };

  try {
    const localContext = buildLocalContext(process.cwd());
    let relevantFiles = '';
    let selectedFiles: string[] = [];

    if (config.localEndpoint) {
      const retrieval = await getRelevantFileContents(message, config.localEndpoint);
      relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;
    }

    let fullContext = localContext;
    if (relevantFiles) fullContext += `\n\n${relevantFiles}`;

    const messages: LocalChatMessage[] = [
      { role: 'system', content: CONSULTANT_STYLE_PROMPT + (fullContext ? `\n\n## PROJECT CONTEXT ##\n${fullContext}` : '') },
      { role: 'user', content: message },
    ];

    const response = await callLocalModel(config.localEndpoint!, messages);

    return { success: true, text: response, referencedFiles: selectedFiles };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════
// PUSH
// ═══════════════════════════════════════════════════════════

async function executePush(payload: any): Promise<any> {
  const { message } = payload;
  if (!message) return { success: false, error: 'No commit message provided.' };

  try {
    const simpleGit = (await import('simple-git')).default;
    const git = simpleGit(process.cwd());

    const isRepo = await git.checkIsRepo();
    if (!isRepo) return { success: false, error: 'Not a git repository.' };

    const status = await git.status();
    if (status.files.length === 0) {
      return { success: true, message: 'Nothing to commit. Working tree clean.' };
    }

    await git.add('.');
    const commitResult = await git.commit(message);
    const branch = (await git.branchLocal()).current;

    try {
      await git.push('origin', branch);
    } catch (pushErr: any) {
      if (pushErr.message?.includes('no upstream')) {
        await git.push(['--set-upstream', 'origin', branch]);
      } else {
        throw pushErr;
      }
    }

    return {
      success: true,
      message: `Pushed to ${branch}`,
      commit: commitResult.commit?.slice(0, 7),
      filesChanged: status.files.length,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════
// INDEX
// ═══════════════════════════════════════════════════════════

async function executeIndex(payload: any, config: any): Promise<any> {
  if (!config.localEndpoint) {
    return { success: false, error: 'No local endpoint configured. Index requires a local model.' };
  }

  const cwd = process.cwd();
  const projectName = getProjectName(cwd);

  try {
    const files = scanProjectFiles(cwd);

    if (files.length === 0) {
      return { success: false, error: 'No code files found to index.' };
    }

    const { runId, runDir, tasksDir } = createAnalysisRun(cwd, files);
    const summaries: Record<string, string> = {};
    let completed = 0;

    // ─── Phase 1: Summarize each file ────────────────────────
    for (const filePath of files) {
      const absolutePath = path.join(cwd, filePath);
      let content: string;

      try {
        content = fs.readFileSync(absolutePath, 'utf-8');
      } catch {
        completed++;
        continue;
      }

      if (content.length > 50000) {
        summaries[filePath] = `Large file (${Math.round(content.length / 1000)}KB). Skipped detailed analysis.`;
        completeTask(tasksDir, filePath, summaries[filePath]);
        completed++;
        updateManifestProgress(runDir, completed);
        continue;
      }

      try {
        const messages: LocalChatMessage[] = [
          {
            role: 'system',
            content: 'You are a code analyst. Respond with ONLY a 2-3 sentence summary. No formatting, no headers, no bullets. Just plain sentences.',
          },
          {
            role: 'user',
            content: `Summarize this file. What does it do, what does it export, and what does it depend on?\n\nFile: ${filePath}\n\n${content}`,
          },
        ];

        const summary = await callLocalModel(config.localEndpoint!, messages);
        summaries[filePath] = summary.trim();
        completeTask(tasksDir, filePath, summary.trim());
      } catch {
        summaries[filePath] = 'Could not summarize.';
      }

      completed++;
      updateManifestProgress(runDir, completed);
    }

    // ─── Phase 2: Dependency mapping ─────────────────────────
    let dependencies: Record<string, string[]> = {};
    try {
      const summaryContext = Object.entries(summaries)
        .map(([fp, summary]) => `[${fp}]: ${summary}`)
        .join('\n\n');

      const messages: LocalChatMessage[] = [
        {
          role: 'system',
          content: 'You are a senior software architect. Respond with ONLY a valid JSON object. No explanation, no markdown.',
        },
        {
          role: 'user',
          content: `Based on these file summaries, generate a JSON dependency map. Each key is a file path, each value is an array of file paths it depends on.\n\nFILE SUMMARIES:\n${summaryContext}\n\nRespond with ONLY the JSON object:`,
        },
      ];

      const depResponse = await callLocalModel(config.localEndpoint!, messages);
      const jsonMatch = depResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        dependencies = JSON.parse(jsonMatch[0]);
      }
    } catch {
      dependencies = {};
    }

    saveSummaries(cwd, summaries);
    saveDependencies(cwd, dependencies);
    updateManifestProgress(runDir, completed, 'completed');

    return {
      success: true,
      message: `Indexed ${Object.keys(summaries).length} files in ${projectName}. Dependency map generated.`,
      fileCount: Object.keys(summaries).length,
      projectName,
    };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════
// ANALYSE
// ═══════════════════════════════════════════════════════════

async function executeAnalyse(payload: any, config: any): Promise<any> {
  if (!config.localEndpoint) {
    return { success: false, error: 'No local endpoint configured. Analysis requires a local model.' };
  }

  const cwd = process.cwd();
  const projectName = getProjectName(cwd);

  try {
    const summaries = loadSummaries(cwd);
    if (!summaries || Object.keys(summaries).length === 0) {
      return {
        success: false,
        error: `Project not indexed. Run \`bob remote index\` first, or \`bob index\` locally.`,
      };
    }

    const dependencies = loadDependencies(cwd) || {};
    const files = Object.keys(summaries);
    const { analysisDir } = ensureProjectStructure(cwd);
    const resultsDir = path.join(analysisDir, 'results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const allResults: Record<string, any> = {};
    let totalBugs = 0;
    let totalFeatures = 0;
    let totalImprovements = 0;
    let totalUpgrades = 0;

    for (const filePath of files) {
      const absolutePath = path.join(cwd, filePath);
      let content: string;

      try {
        content = fs.readFileSync(absolutePath, 'utf-8');
      } catch {
        continue;
      }

      if (content.length > 30000) continue;

      const fileDeps = dependencies[filePath] || [];
      let depContext = '';
      if (fileDeps.length > 0) {
        depContext = `\nRELATED FILES:\n${fileDeps.map((d: string) => `- ${d}: ${summaries[d] || 'unknown'}`).join('\n')}\n`;
      }

      const analysisPrompt = `You are the Lead QA Engineer on this project. Perform a thorough code review.

For each issue provide: title, description (why it's a problem), priority (critical/high/medium/low), implementation (exact fix steps).

Respond with ONLY a JSON object:
{
  "bugs": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}],
  "features": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}],
  "improvements": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}],
  "upgrades": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}]
}
${depContext}
FILE: ${filePath}
${content}`;

      try {
        const messages: LocalChatMessage[] = [
          { role: 'system', content: 'You are the Lead QA Engineer. Respond with ONLY valid JSON. Quality over quantity.' },
          { role: 'user', content: analysisPrompt },
        ];

        const responseText = await callLocalModel(config.localEndpoint!, messages);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const cat of ['bugs', 'features', 'improvements', 'upgrades']) {
            if (parsed[cat]) {
              parsed[cat] = parsed[cat].map((item: any) => ({ ...item, filePath }));
            }
          }
          allResults[filePath] = parsed;
          totalBugs += parsed.bugs?.length || 0;
          totalFeatures += parsed.features?.length || 0;
          totalImprovements += parsed.improvements?.length || 0;
          totalUpgrades += parsed.upgrades?.length || 0;
        }
      } catch {
        continue;
      }
    }

    fs.writeFileSync(
      path.join(resultsDir, 'analysis.json'),
      JSON.stringify(allResults, null, 2)
    );
    fs.writeFileSync(
      path.join(resultsDir, 'counts.json'),
      JSON.stringify({ bugs: totalBugs, features: totalFeatures, improvements: totalImprovements, upgrades: totalUpgrades }, null, 2)
    );

    return {
      success: true,
      message: `Analysis complete for ${projectName}. Found: ${totalBugs} bugs, ${totalFeatures} features, ${totalImprovements} improvements, ${totalUpgrades} upgrades.`,
      counts: { bugs: totalBugs, features: totalFeatures, improvements: totalImprovements, upgrades: totalUpgrades },
      projectName,
    };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════════

async function executeBackup(payload: any, config: any): Promise<any> {
  const { isSource = false, isGlobal = false, archiveName } = payload;

  if (!config.uid) {
    return { success: false, error: 'User UID not available. Re-login required.' };
  }

  const cwd = process.cwd();
  const projectName = path.basename(cwd);

  // ─── Resolve what to back up ──────────────────────────────
  let sourceDir: string;
  let displayLabel: string;

  if (isGlobal) {
    sourceDir = BOB_DIR;
    displayLabel = 'global (~/.bob/)';
  } else if (isSource) {
    sourceDir = cwd;
    displayLabel = `source: ${projectName}`;
  } else {
    sourceDir = path.join(BOB_DIR, 'projects', projectName);
    displayLabel = `context: ${projectName}`;
  }

  if (!fs.existsSync(sourceDir)) {
    return { success: false, error: `Source directory not found: ${sourceDir}` };
  }

  const tmpDir = getTempDir();
  const archivePath = path.join(tmpDir, 'bob-backup.tar.gz');
  const encryptedPath = path.join(tmpDir, 'bob-backup.bob.enc');

  try {
    // ─── Compress ─────────────────────────────────────────────
    const tar = await import('tar');
    const relativeSource = path.relative(os.homedir(), sourceDir);

    await tar.create(
      { gzip: true, file: archivePath, cwd: os.homedir() },
      [relativeSource]
    );

    const archiveStats = fs.statSync(archivePath);
    const estimatedSizeGB = archiveStats.size / (1024 * 1024 * 1024);
    const sizeLabel = archiveStats.size < 1024 * 1024
      ? `${(archiveStats.size / 1024).toFixed(1)} KB`
      : `${(archiveStats.size / (1024 * 1024)).toFixed(1)} MB`;

    // ─── Encrypt ──────────────────────────────────────────────
    encrypt(archivePath, encryptedPath, config.uid);

    // ─── Request upload URL ───────────────────────────────────
    let uploadResult: any;
    const action = archiveName
      ? (isSource ? 'requestSourceArchiveUpload' : 'requestArchiveUpload')
      : (isSource ? 'requestSourceUpload' : 'requestUpload');

    uploadResult = await callCloudFunction('cliBackupLicense', {
      action,
      projectName,
      isGlobal,
      isSource,
      archiveName: archiveName || null,
      estimatedSizeGB,
    });

    // ─── Upload to S3 ─────────────────────────────────────────
    const encryptedData = fs.readFileSync(encryptedPath);
    await axios.put(uploadResult.uploadUrl, encryptedData, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': encryptedData.length,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // ─── Record usage ─────────────────────────────────────────
    const recordAction = archiveName
      ? (isSource ? 'recordSourceArchiveUsage' : 'recordArchiveUsage')
      : (isSource ? 'recordSourceUsage' : 'recordUsage');

    try {
      await callCloudFunction('cliBackupLicense', {
        action: recordAction,
        projectName,
        isGlobal,
        isSource,
        archiveId: uploadResult.archiveId || null,
      });
    } catch { /* non-fatal */ }

    const label = archiveName ? `archive "${archiveName}"` : 'backup';
    return {
      success: true,
      message: `Remote ${label} complete for ${displayLabel}. Size: ${sizeLabel}.`,
      sizeBytes: archiveStats.size,
      projectName,
      isSource,
      isGlobal,
    };

  } catch (error: any) {
    return { success: false, error: `Backup failed: ${error.message}` };
  } finally {
    cleanupTemp(tmpDir);
  }
}

// ═══════════════════════════════════════════════════════════
// RESTORE
// ═══════════════════════════════════════════════════════════

async function executeRestore(payload: any, config: any): Promise<any> {
  const { isSource = false, isGlobal = false } = payload;

  if (!config.uid) {
    return { success: false, error: 'User UID not available. Re-login required.' };
  }

  const cwd = process.cwd();
  const projectName = path.basename(cwd);

  const tmpDir = getTempDir();
  const downloadPath = path.join(tmpDir, 'bob-backup.bob.enc');
  const decryptedPath = path.join(tmpDir, 'bob-backup.tar.gz');

  try {
    // ─── Get download URL for latest revision ─────────────────
    const downloadResult = await callCloudFunction('cliBackupLicense', {
      action: isSource ? 'requestSourceDownload' : 'requestDownload',
      projectName,
      isGlobal,
      isSource,
      s3VersionId: null, // always latest in headless mode
    });

    // ─── Download ─────────────────────────────────────────────
    const response = await axios.get(downloadResult.downloadUrl, {
      responseType: 'arraybuffer',
      maxContentLength: Infinity,
    });

    fs.writeFileSync(downloadPath, Buffer.from(response.data));

    // ─── Decrypt ──────────────────────────────────────────────
    decrypt(downloadPath, decryptedPath, config.uid);

    // ─── Back up current state ────────────────────────────────
    let restoreTarget: string;
    if (isGlobal) {
      restoreTarget = BOB_DIR;
    } else if (isSource) {
      restoreTarget = cwd;
    } else {
      restoreTarget = path.join(BOB_DIR, 'projects', projectName);
    }

    const preRestoreBackup = `${restoreTarget}-pre-restore-${Date.now()}`;
    if (fs.existsSync(restoreTarget)) {
      fs.cpSync(restoreTarget, preRestoreBackup, { recursive: true });
    }

    // ─── Extract ──────────────────────────────────────────────
    const tar = await import('tar');
    if (isSource) {
      const parentDir = path.dirname(cwd);
      await tar.extract({ file: decryptedPath, cwd: parentDir });
    } else {
      await tar.extract({ file: decryptedPath, cwd: os.homedir() });
    }

    const scopeLabel = isGlobal ? 'global (~/.bob/)' : isSource ? `source: ${projectName}` : `context: ${projectName}`;

    return {
      success: true,
      message: `Remote restore complete for ${scopeLabel}. Pre-restore backup saved locally.`,
      projectName,
      isSource,
      isGlobal,
      preRestoreBackup: path.basename(preRestoreBackup),
    };

  } catch (error: any) {
    return { success: false, error: `Restore failed: ${error.message}` };
  } finally {
    cleanupTemp(tmpDir);
  }
}