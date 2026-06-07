import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as os from 'os';
import * as path from 'path';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { buildLocalContext, readFileContent } from '../core/context-builder.js';
import { STANDARD_STYLE_PROMPT, CONSULTANT_STYLE_PROMPT } from '../ai/persona.js';
import { getRelevantFileContents } from '../core/file-retrieval.js';
import { extractProposedFile, proposeAndWriteFile } from '../core/file-writer.js';

const GREEN = chalk.hex('#66BB6A');
const AMBER = chalk.hex('#FFAB00');
const BLUE = chalk.hex('#42A5F5');
const RED = chalk.hex('#EF5350');
const GRAY = chalk.gray;
const CYAN = chalk.cyan;
const BORDER = chalk.hex('#455A64');

interface TierConfig {
  activeInterval: number;
  sleepInterval: number | null;  // null = no sleep mode
  idleThreshold: number | null;  // null = no idle detection
  extendedIdleTimeout: number | null;  // null = never auto-exit
}

const TIER_CONFIGS: Record<string, TierConfig> = {
  'Power': {
    activeInterval: 2000,         // 2 seconds
    sleepInterval: 120000,        // 120 seconds (2 minutes) when sleeping
    idleThreshold: 5 * 60000,    // 5 min → enter sleep
    extendedIdleTimeout: null,    // Never auto-exit
  },
  'Pro': {
    activeInterval: 10000,        // 10 seconds
    sleepInterval: 30000,         // 30 seconds when sleeping
    idleThreshold: 5 * 60000,    // 5 min → enter sleep
    extendedIdleTimeout: 60 * 60000, // 1 hour → auto-exit
  },
  'Starter': {
    activeInterval: 15000,        // 15 seconds
    sleepInterval: null,          // No sleep mode — goes straight to auto-exit
    idleThreshold: null,          // No idle detection
    extendedIdleTimeout: 15 * 60000, // 15 minutes → auto-exit
  },
};

const BLOCKED_TIERS = ['Explore', 'Free', 'free', 'explore'];

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
    console.log(BORDER('  ║') + GRAY(`  Sleep:    disabled`));
  }
  if (tierConfig.extendedIdleTimeout) {
    console.log(BORDER('  ║') + GRAY(`  Auto-exit: after ${tierConfig.extendedIdleTimeout / 60000} min idle`));
  } else {
    console.log(BORDER('  ║') + GREEN(`  Auto-exit: never (Power tier)`));
  }
  console.log(BORDER('  ║'));
  console.log(BORDER('  ║') + GRAY('  Press Ctrl+C to stop.'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  // ─── REGISTER SESSION ───
  try {
    await callCloudFunction('registerRemoteDaemonSession', {
      conversationId: config.conversationId,
      sessionId: sessionId,
      machineId: machineId,
      projectName: projectName,
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

  const cleanup = async () => {
    running = false;
    console.log('');
    console.log(GRAY('  🔌 Shutting down Active Bob...'));

    try {
      await callCloudFunction('deregisterRemoteDaemonSession', {
        conversationId: config.conversationId,
        sessionId: sessionId,
      });
      console.log(GRAY('  ✅ Session deregistered. Bob is offline.'));
    } catch {
      console.log(GRAY('  ⚠️  Could not deregister (will timeout automatically).'));
    }

    console.log('');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // ─── POLLING LOOP ───
  let lastCommandTime = Date.now();
  let isSleeping = false;

  while (running) {
    const timeSinceLastCommand = Date.now() - lastCommandTime;

    // ─── CHECK EXTENDED IDLE (auto-exit) ───
    if (tierConfig.extendedIdleTimeout && timeSinceLastCommand > tierConfig.extendedIdleTimeout) {
      console.log('');
      console.log(AMBER(`  ⏸️  No commands received in ${Math.round(tierConfig.extendedIdleTimeout / 60000)} minutes.`));
      console.log(GRAY('  Active Bob is going offline. Run `bob serve` to restart.'));
      console.log('');

      try {
        await callCloudFunction('deregisterRemoteDaemonSession', {
          conversationId: config.conversationId,
          sessionId: sessionId,
        });
      } catch { /* silent */ }

      break;
    }

    // ─── CHECK SLEEP MODE (only if tier supports it) ───
    if (tierConfig.sleepInterval && tierConfig.idleThreshold) {
      const shouldSleep = timeSinceLastCommand > tierConfig.idleThreshold;

      if (shouldSleep && !isSleeping) {
        isSleeping = true;
        const timestamp = new Date().toLocaleTimeString();
        console.log(GRAY(`  [${timestamp}] 💤 Entering sleep mode (polling every ${tierConfig.sleepInterval / 1000}s)...`));
      }
    }

    const currentInterval = (isSleeping && tierConfig.sleepInterval) ? tierConfig.sleepInterval : tierConfig.activeInterval;

    // ─── POLL ───
    try {
      const result = await callCloudFunction('pollRemoteCommands', {
        conversationId: config.conversationId,
        sessionId: sessionId,
      });

      if (result?.command) {
        const cmd = result.command;
        const type = cmd.type;
        const payload = cmd.payload || {};

        // Wake from sleep
        if (isSleeping) {
          isSleeping = false;
          console.log(GREEN('  ⚡ Waking up — command received!'));
        }

        lastCommandTime = Date.now();

        const timestamp = new Date().toLocaleTimeString();
        console.log(AMBER(`  [${timestamp}] ⏳ Received: ${type} ${payload.message ? '"' + payload.message.slice(0, 40) + (payload.message.length > 40 ? '...' : '') + '"' : ''}`));

        const commandResult = await executeRemoteCommand(type, payload, config);

        await callCloudFunction('completeRemoteCommand', {
          conversationId: config.conversationId,
          commandId: cmd.id,
          sessionId: sessionId,
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
// COMMAND EXECUTION
// ═══════════════════════════════════════════════════════════

async function executeRemoteCommand(type: string, payload: any, config: any): Promise<any> {
  switch (type) {
    case 'chat':
      return await executeChat(payload, config);
    case 'consult':
      return await executeConsult(payload, config);
    case 'push':
      return await executePush(payload);
    case 'index':
      return { success: true, message: 'Index command received. Feature in progress.' };
    case 'analyse':
      return { success: true, message: 'Analyse command received. Feature in progress.' };
    case 'autonomy':
      return { success: true, message: 'Autonomy command received. Feature in progress.' };
    default:
      return { success: false, error: `Unknown command type: ${type}` };
  }
}

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
    if (proposed) {
      await proposeAndWriteFile(proposed, true);  // Auto-approve in daemon mode
    }

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

    return {
      success: true,
      text: response,
      referencedFiles: selectedFiles,
    };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function executePush(payload: any): Promise<any> {
  const { message } = payload;
  if (!message) return { success: false, error: 'No commit message provided.' };

  try {
    const simpleGit = (await import('simple-git')).default;
    const git = simpleGit(process.cwd());

    const isRepo = await git.checkIsRepo();
    if (!isRepo) return { success: false, error: 'Not a git repository.' };

    const status = await git.status();
    if (status.files.length === 0) return { success: true, message: 'Nothing to commit. Working tree clean.' };

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