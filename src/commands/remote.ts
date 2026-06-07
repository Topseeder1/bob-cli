import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { renderMarkdown } from '../ui/renderer.js';

const GREEN = chalk.hex('#66BB6A');
const AMBER = chalk.hex('#FFAB00');
const RED = chalk.hex('#EF5350');
const GRAY = chalk.gray;
const CYAN = chalk.cyan;
const BORDER = chalk.hex('#455A64');

export function registerRemoteCommand(program: Command): void {
  program
    .command('remote [type] [message]')
    .description('Send commands to an Active Bob on a remote machine')
    .option('--new', 'Discover and connect to a different Active Bob')
    .option('--auto', 'For analyse: run auto-fix mode')
    .option('-i, --interactive', 'Enter interactive remote session')
    .option('--session <id>', 'Target a specific Active Bob session')
    .action(async (type: string | undefined, message: string | undefined, options: { new?: boolean; auto?: boolean; interactive?: boolean; session?: string }) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(RED('  ❌ Not logged in.'));
        console.log(GRAY('  Run `bob login` to authenticate.'));
        console.log('');
        return;
      }

      // ─── DISCOVER / CONNECT ───
      if (options.new || !config.conversationId) {
        await discoverAndConnect(config);
        return;
      }

      // ─── INTERACTIVE MODE ───
      if (options.interactive || (!type && !options.new)) {
        await runInteractiveRemote(config, options.session);
        return;
      }

      // ─── STATUS (explicit no-type, no-interactive) ───
      if (!type) {
        await showConnectionStatus(config);
        return;
      }

      // ─── DISPATCH ───
      const validTypes = ['chat', 'consult', 'index', 'analyse', 'push', 'autonomy'];
      if (!validTypes.includes(type)) {
        console.log('');
        console.log(RED(`  ❌ Invalid command type: "${type}"`));
        console.log(GRAY(`  Valid types: ${validTypes.join(', ')}`));
        console.log('');
        return;
      }

      const payload: any = { conversationId: config.conversationId };
      if (message) payload.message = message;
      if (options.auto) payload.auto = true;

      if ((type === 'chat' || type === 'consult' || type === 'push') && !message) {
        console.log('');
        console.log(RED(`  ❌ ${type} requires a message.`));
        console.log(GRAY(`  Example: bob remote ${type} "your message here"`));
        console.log('');
        return;
      }

      await dispatchCommand(config, type, payload, options.session);
    });
}

// ═══════════════════════════════════════════════════════════
// INTERACTIVE REMOTE SESSION
// ═══════════════════════════════════════════════════════════

async function runInteractiveRemote(config: any, targetSession?: string): Promise<void> {
  // Check for active bob first
  const spinner = ora({ text: CYAN('  Connecting to Active Bob...'), spinner: 'dots' }).start();

  let activeBobName = 'Unknown';
  try {
    const result = await callCloudFunction('listActiveBobs', {
      conversationId: config.conversationId,
    });
    const sessions = (result?.sessions || []).filter((s: any) => s.active);

    if (sessions.length === 0) {
      spinner.stop();
      console.log('');
      console.log(RED('  🔴 No Active Bob found on this conversation.'));
      console.log(GRAY('  Run `bob serve` on the target machine first.'));
      console.log('');
      return;
    }

    activeBobName = sessions[0].machineId || 'Active Bob';
    spinner.stop();
  } catch (error: any) {
    spinner.stop();
    console.log(RED(`  ❌ ${error.message}`));
    return;
  }

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + CYAN(`  🌐 Active Bob — Remote Session (${activeBobName})`) + BORDER(''));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GRAY(`  Conversation: ${config.conversationId?.slice(0, 28)}...`));
  console.log(BORDER('  ║') + GRAY('  Commands dispatched to the remote machine.'));
  console.log(BORDER('  ║') + GRAY('  Type your message. /exit to disconnect.'));
  console.log(BORDER('  ║') + GRAY('  /consult "msg" for consultant mode.'));
  console.log(BORDER('  ║') + GRAY('  /push "msg" to git push remotely.'));
  console.log(BORDER('  ║') + GRAY('  /index to re-index remotely.'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question(chalk.green('  You (remote): '), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // ─── /exit ───
      if (trimmed === '/exit' || trimmed === '/quit') {
        console.log('');
        console.log(GRAY('  📡 Disconnected from remote session.'));
        console.log('');
        rl.close();
        return;
      }

      // ─── /consult "message" ───
      if (trimmed.startsWith('/consult ')) {
        const msg = trimmed.slice(9).trim().replace(/^["']|["']$/g, '');
        if (msg) {
          await dispatchAndShow(config, 'consult', { message: msg, conversationId: config.conversationId }, targetSession);
        } else {
          console.log(RED('  ❌ Provide a message: /consult "your question"'));
        }
        prompt();
        return;
      }

      // ─── /push "message" ───
      if (trimmed.startsWith('/push ')) {
        const msg = trimmed.slice(6).trim().replace(/^["']|["']$/g, '');
        if (msg) {
          await dispatchAndShow(config, 'push', { message: msg, conversationId: config.conversationId }, targetSession);
        } else {
          console.log(RED('  ❌ Provide a commit message: /push "your message"'));
        }
        prompt();
        return;
      }

      // ─── /index ───
      if (trimmed === '/index') {
        await dispatchAndShow(config, 'index', { conversationId: config.conversationId }, targetSession);
        prompt();
        return;
      }

      // ─── /analyse ───
      if (trimmed === '/analyse' || trimmed === '/analyze') {
        await dispatchAndShow(config, 'analyse', { conversationId: config.conversationId }, targetSession);
        prompt();
        return;
      }

      // ─── Default: chat message ───
      await dispatchAndShow(config, 'chat', { message: trimmed, conversationId: config.conversationId }, targetSession);
      prompt();
    });
  };

  prompt();
}

async function dispatchAndShow(config: any, type: string, payload: any, targetSession?: string): Promise<void> {
  const spinner = ora({ text: CYAN(`  📡 Active Bob executing: ${type}...`), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('sendRemoteCommand', {
      conversationId: config.conversationId,
      type: type,
      payload: payload,
      targetSession: targetSession || null,
    });

    if (!result?.success) {
      spinner.stop();
      console.log(RED(`  ❌ ${result?.message || 'Failed to dispatch.'}`));
      console.log('');
      return;
    }

    const commandId = result.commandId;

    // Wait for result
    while (true) {
      try {
        const pollResult = await callCloudFunction('getRemoteCommandResult', {
          conversationId: config.conversationId,
          commandId: commandId,
        });

        if (pollResult?.status === 'completed') {
          spinner.stop();

          if (pollResult.result?.text) {
            const rendered = renderMarkdown(pollResult.result.text);
            console.log('');
            console.log(GRAY('  ─────────────────────────────────────'));
            console.log(chalk.bold.cyan('  🤖 Bob (Remote):'));
            console.log('');
            for (const line of rendered.split('\n')) {
              console.log(`  ${line}`);
            }
            console.log('');
            if (pollResult.result?.referencedFiles?.length > 0) {
              console.log(GRAY(`  📂 Referenced: ${pollResult.result.referencedFiles.join(', ')}`));
            }
            console.log(GRAY('  ─────────────────────────────────────'));
          } else if (pollResult.result?.message) {
            console.log('');
            console.log(GREEN(`  ✅ ${pollResult.result.message}`));
          } else if (pollResult.result?.error) {
            console.log('');
            console.log(RED(`  ❌ ${pollResult.result.error}`));
          }

          console.log('');
          return;
        }

        if (pollResult?.status === 'failed') {
          spinner.stop();
          console.log('');
          console.log(RED(`  ❌ ${pollResult.result?.error || 'Command failed.'}`));
          console.log('');
          return;
        }

      } catch { /* keep polling */ }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

  } catch (error: any) {
    spinner.stop();
    console.log(RED(`  ❌ ${error.message}`));
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════

async function showConnectionStatus(config: any): Promise<void> {
  if (!config.conversationId) {
    console.log('');
    console.log(RED('  🔴 No conversation selected.'));
    console.log(GRAY('  Run `bob remote --new` to find and connect to an Active Bob.'));
    console.log('');
    return;
  }

  const spinner = ora({ text: CYAN('  Checking Active Bob status...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('listActiveBobs', {
      conversationId: config.conversationId,
    });

    spinner.stop();
    const sessions = result?.sessions || [];
    const activeSessions = sessions.filter((s: any) => s.active);

    console.log('');
    console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
    console.log(BORDER('  ║') + CYAN('  🌐 Remote Connection Status                            ') + BORDER('║'));
    console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
    console.log(BORDER('  ║') + GRAY(`  Conversation: ${config.conversationId?.slice(0, 28)}...`));
    console.log(BORDER('  ║'));

    if (activeSessions.length === 0) {
      console.log(BORDER('  ║') + RED('  🔴 No Active Bob found on this conversation.'));
      console.log(BORDER('  ║') + GRAY('  Run `bob serve` on the target machine.'));
    } else {
      for (const session of activeSessions) {
        const ago = session.lastHeartbeat ? getTimeAgo(session.lastHeartbeat) : 'unknown';
        console.log(BORDER('  ║') + GREEN(`  🟢 ${session.machineId}`) + GRAY(` (${session.projectName}) — ${ago}`));
      }
    }

    console.log(BORDER('  ║'));
    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');

    if (activeSessions.length > 0) {
      console.log(GRAY('  Commands:'));
      console.log(GRAY('    bob remote --interactive    — persistent session'));
      console.log(GRAY('    bob remote chat "message"   — one-shot'));
      console.log(GRAY('    bob remote consult "msg"    — strategic advice'));
      console.log(GRAY('    bob remote push "msg"       — git push'));
      console.log(GRAY('    bob remote index            — re-index'));
      console.log(GRAY('    bob remote analyse          — run analysis'));
      console.log('');
    }

  } catch (error: any) {
    spinner.stop();
    console.log(RED(`  ❌ ${error.message}`));
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// DISCOVER AND CONNECT
// ═══════════════════════════════════════════════════════════

async function discoverAndConnect(config: any): Promise<void> {
  const spinner = ora({ text: CYAN('  Searching for Active Bobs...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('listActiveBobs', {});

    spinner.stop();
    const bobs = result?.activeBobs || [];

    if (bobs.length === 0) {
      console.log('');
      console.log(AMBER('  ⚠️  No Active Bobs found.'));
      console.log(GRAY('  Run `bob serve` on a machine to start an Active Bob.'));
      console.log('');
      return;
    }

    console.log('');
    console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
    console.log(BORDER('  ║') + CYAN('  🌐 Active Bobs Available                               ') + BORDER('║'));
    console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));

    for (let i = 0; i < bobs.length; i++) {
      const bob = bobs[i];
      const ago = bob.lastHeartbeat ? getTimeAgo(bob.lastHeartbeat) : 'unknown';
      console.log(BORDER('  ║') + `  ${chalk.cyan(String(i + 1).padStart(2))}. ${GREEN('🟢')} ${chalk.white(bob.machineId)} — ${GRAY(bob.projectName)}`);
      console.log(BORDER('  ║') + GRAY(`      Convo: ${bob.conversationTitle || bob.conversationId?.slice(0, 20) + '...'} | ${ago}`));
    }

    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(chalk.cyan('  Select (1-' + bobs.length + ') or 0 to cancel: '), resolve);
    });
    rl.close();

    const selection = parseInt(answer.trim());

    if (isNaN(selection) || selection === 0 || selection < 1 || selection > bobs.length) {
      console.log(GRAY('  Cancelled.'));
      return;
    }

    const selected = bobs[selection - 1];
    setConfigValue('conversationId', selected.conversationId);

    console.log('');
    console.log(GREEN(`  ✅ Connected to: ${selected.machineId} (${selected.projectName})`));
    console.log(GRAY(`  Conversation: ${selected.conversationId?.slice(0, 24)}...`));
    console.log(GRAY('  Run `bob remote --interactive` for a persistent session.'));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log(RED(`  ❌ ${error.message}`));
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// ONE-SHOT DISPATCH
// ═══════════════════════════════════════════════════════════

async function dispatchCommand(config: any, type: string, payload: any, targetSession?: string): Promise<void> {
  await dispatchAndShow(config, type, payload, targetSession);
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function getTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}