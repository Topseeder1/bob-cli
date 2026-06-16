// File: src/commands/remote.ts

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { renderMarkdown } from '../ui/renderer.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const BORDER = chalk.hex('#455A64');

export function registerRemoteCommand(program: Command): void {
  program
    .command('remote [type] [message]')
    .description('Send commands to an Active Bob on a remote machine')
    .option('--new', 'Discover and connect to a different Active Bob')
    .option('--auto', 'For analyse: run auto-fix mode')
    .option('-i, --interactive', 'Enter interactive remote session')
    .option('--session <id>', 'Target a specific Active Bob session')
    .option('--source', 'For backup/restore: use source code mode')
    .option('--global', 'For backup/restore: use global mode (Grid only)')
    .option('--archive <name>', 'For backup: save as named archive')
    .action(async (
      type: string | undefined,
      message: string | undefined,
      options: {
        new?: boolean;
        auto?: boolean;
        interactive?: boolean;
        session?: string;
        source?: boolean;
        global?: boolean;
        archive?: string;
      }
    ) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(ERROR('  ❌ Not logged in.'));
        console.log(MUTED('  Run `bob login` to authenticate.'));
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

      // ─── STATUS ───
      if (!type) {
        await showConnectionStatus(config);
        return;
      }

      // ─── DISPATCH ───
      const validTypes = [
        'chat', 'consult', 'index', 'analyse',
        'push', 'autonomy', 'backup', 'restore',
      ];

      if (!validTypes.includes(type)) {
        console.log('');
        console.log(ERROR(`  ❌ Invalid command type: "${type}"`));
        console.log(MUTED(`  Valid types: ${validTypes.join(', ')}`));
        console.log('');
        return;
      }

      const payload: any = { conversationId: config.conversationId };
      if (message) payload.message = message;
      if (options.auto) payload.auto = true;
      if (options.source) payload.isSource = true;
      if (options.global) payload.isGlobal = true;
      if (options.archive) payload.archiveName = options.archive;

      if ((type === 'chat' || type === 'consult' || type === 'push') && !message) {
        console.log('');
        console.log(ERROR(`  ❌ ${type} requires a message.`));
        console.log(MUTED(`  Example: bob remote ${type} "your message here"`));
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
  const spinner = ora({ text: INFO('  Connecting to Active Bob...'), spinner: 'dots' }).start();

  let activeBobName = 'Unknown';
  try {
    const result = await callCloudFunction('listActiveBobs', {
      conversationId: config.conversationId,
    });
    const sessions = (result?.sessions || []).filter((s: any) => s.active);

    if (sessions.length === 0) {
      spinner.stop();
      console.log('');
      console.log(ERROR('  🔴 No Active Bob found on this conversation.'));
      console.log(MUTED('  Run `bob serve` on the target machine first.'));
      console.log('');
      return;
    }

    activeBobName = sessions[0].machineId || 'Active Bob';
    spinner.stop();
  } catch (error: any) {
    spinner.stop();
    console.log(ERROR(`  ❌ ${error.message}`));
    return;
  }

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + INFO('  🌐 Active Bob — Remote Session') + MUTED(` (${activeBobName})`));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + MUTED(`  Conversation: ${config.conversationId?.slice(0, 28)}...`));
  console.log(BORDER('  ║') + MUTED('  Commands dispatched to the remote machine.'));
  console.log(BORDER('  ║'));
  console.log(BORDER('  ║') + chalk.white('  Slash Commands:'));
  console.log(BORDER('  ║') + MUTED('    ▸ /consult "msg"        — Strategic advice'));
  console.log(BORDER('  ║') + MUTED('    ▸ /push "msg"           — Git commit & push'));
  console.log(BORDER('  ║') + MUTED('    ▸ /index                — Re-index project'));
  console.log(BORDER('  ║') + MUTED('    ▸ /analyse              — Run QA analysis'));
  console.log(BORDER('  ║') + MUTED('    ▸ /backup               — Backup context'));
  console.log(BORDER('  ║') + MUTED('    ▸ /backup source        — Backup source code'));
  console.log(BORDER('  ║') + MUTED('    ▸ /backup global        — Backup ~/.bob/ (Grid)'));
  console.log(BORDER('  ║') + MUTED('    ▸ /restore              — Restore latest context'));
  console.log(BORDER('  ║') + MUTED('    ▸ /restore source       — Restore latest source'));
  console.log(BORDER('  ║') + MUTED('    ▸ /exit                 — Disconnect'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question(INFO('  You (remote): '), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }

      // ─── /exit ───
      if (trimmed === '/exit' || trimmed === '/quit') {
        console.log('');
        console.log(MUTED('  📡 Disconnected from remote session.'));
        console.log('');
        rl.close();
        return;
      }

      // ─── /consult "message" ───
      if (trimmed.startsWith('/consult ')) {
        const msg = trimmed.slice(9).trim().replace(/^["']|["']$/g, '');
        if (msg) {
          await dispatchAndShow(config, 'consult', { message: msg }, targetSession);
        } else {
          console.log(ERROR('  ❌ Provide a message: /consult "your question"'));
        }
        prompt(); return;
      }

      // ─── /push "message" ───
      if (trimmed.startsWith('/push ')) {
        const msg = trimmed.slice(6).trim().replace(/^["']|["']$/g, '');
        if (msg) {
          await dispatchAndShow(config, 'push', { message: msg }, targetSession);
        } else {
          console.log(ERROR('  ❌ Provide a commit message: /push "your message"'));
        }
        prompt(); return;
      }

      // ─── /index ───
      if (trimmed === '/index') {
        await dispatchAndShow(config, 'index', {}, targetSession);
        prompt(); return;
      }

      // ─── /analyse ───
      if (trimmed === '/analyse' || trimmed === '/analyze') {
        await dispatchAndShow(config, 'analyse', {}, targetSession);
        prompt(); return;
      }

      // ─── /backup [source|global] ───
      if (trimmed.startsWith('/backup')) {
        const parts = trimmed.split(' ');
        const flag = parts[1]?.toLowerCase();
        const backupPayload: any = {};
        if (flag === 'source') backupPayload.isSource = true;
        if (flag === 'global') backupPayload.isGlobal = true;
        await dispatchAndShow(config, 'backup', backupPayload, targetSession);
        prompt(); return;
      }

      // ─── /restore [source|global] ───
      if (trimmed.startsWith('/restore')) {
        const parts = trimmed.split(' ');
        const flag = parts[1]?.toLowerCase();
        const restorePayload: any = {};
        if (flag === 'source') restorePayload.isSource = true;
        if (flag === 'global') restorePayload.isGlobal = true;
        await dispatchAndShow(config, 'restore', restorePayload, targetSession);
        prompt(); return;
      }

      // ─── Default: chat message ───
      await dispatchAndShow(config, 'chat', { message: trimmed }, targetSession);
      prompt();
    });
  };

  prompt();
}

async function dispatchAndShow(
  config: any,
  type: string,
  payload: any,
  targetSession?: string
): Promise<void> {
  const spinner = ora({
    text: BRAND_SECONDARY(`  📡 Active Bob executing: ${type}...`),
    spinner: 'dots',
  }).start();

  let pollCount = 0;
  const MAX_POLLS = 300; // 10 minutes at 2s intervals

  try {
    const result = await callCloudFunction('sendRemoteCommand', {
      conversationId: config.conversationId,
      type,
      payload: { ...payload, conversationId: config.conversationId },
      targetSession: targetSession || null,
    });

    if (!result?.success) {
      spinner.stop();
      console.log(ERROR(`  ❌ ${result?.message || 'Failed to dispatch.'}`));
      console.log('');
      return;
    }

    const commandId = result.commandId;

    while (pollCount < MAX_POLLS) {
      pollCount++;
      try {
        const pollResult = await callCloudFunction('getRemoteCommandResult', {
          conversationId: config.conversationId,
          commandId,
        });

        if (pollResult?.status === 'completed') {
          spinner.stop();

          if (pollResult.result?.text) {
            const rendered = renderMarkdown(pollResult.result.text);
            console.log('');
            console.log(MUTED('  ───────────────────────────────────────'));
            console.log(chalk.bold(INFO('  🤖 Bob (Remote):')));
            console.log('');
            for (const line of rendered.split('\n')) {
              console.log(`  ${line}`);
            }
            console.log('');
            if (pollResult.result?.referencedFiles?.length > 0) {
              console.log(MUTED(`  └─ 📂 Referenced: ${pollResult.result.referencedFiles.join(', ')}`));
            }
            console.log(MUTED('  ───────────────────────────────────────'));
          } else if (pollResult.result?.message) {
            console.log('');
            console.log(SUCCESS(`  ✅ ${pollResult.result.message}`));

            // ─── Show analysis counts if available ───────────
            if (pollResult.result?.counts) {
              const c = pollResult.result.counts;
              console.log(MUTED(`     🐛 ${c.bugs} bugs  ⭐ ${c.features} features  🔧 ${c.improvements} improvements  ⬆️ ${c.upgrades} upgrades`));
            }

            // ─── Show backup details if available ───────────
            if (pollResult.result?.sizeBytes) {
              const sizeLabel = pollResult.result.sizeBytes < 1024 * 1024
                ? `${(pollResult.result.sizeBytes / 1024).toFixed(1)} KB`
                : `${(pollResult.result.sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
              console.log(MUTED(`     📦 Size: ${sizeLabel}`));
            }
          } else if (pollResult.result?.error) {
            console.log('');
            console.log(ERROR(`  ❌ ${pollResult.result.error}`));
          }

          console.log('');
          return;
        }

        if (pollResult?.status === 'failed') {
          spinner.stop();
          console.log('');
          console.log(ERROR(`  ❌ ${pollResult.result?.error || 'Command failed.'}`));
          console.log('');
          return;
        }

      } catch { /* keep polling */ }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Timeout
    spinner.stop();
    console.log('');
    console.log(WARNING('  ⚠️  Command timed out after 10 minutes.'));
    console.log(MUTED('  The command may still be running on the remote machine.'));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log(ERROR(`  ❌ ${error.message}`));
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════

async function showConnectionStatus(config: any): Promise<void> {
  if (!config.conversationId) {
    console.log('');
    console.log(ERROR('  🔴 No conversation selected.'));
    console.log(MUTED('  Run `bob remote --new` to find and connect to an Active Bob.'));
    console.log('');
    return;
  }

  const spinner = ora({ text: INFO('  Checking Active Bob status...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('listActiveBobs', {
      conversationId: config.conversationId,
    });

    spinner.stop();
    const sessions = result?.sessions || [];
    const activeSessions = sessions.filter((s: any) => s.active);

    console.log('');
    console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
    console.log(BORDER('  ║') + INFO('  🌐 Remote Connection Status'));
    console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
    console.log(BORDER('  ║') + MUTED(`  Conversation: ${config.conversationId?.slice(0, 28)}...`));
    console.log(BORDER('  ║'));

    if (activeSessions.length === 0) {
      console.log(BORDER('  ║') + ERROR('  🔴 No Active Bob found on this conversation.'));
      console.log(BORDER('  ║') + MUTED('  Run `bob serve` on the target machine.'));
    } else {
      for (const session of activeSessions) {
        const ago = session.lastHeartbeat ? getTimeAgo(session.lastHeartbeat) : 'unknown';
        console.log(BORDER('  ║') + SUCCESS(`  🟢 ${session.machineId}`) + MUTED(` (${session.projectName}) — ${ago}`));
      }
    }

    console.log(BORDER('  ║'));
    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');

    if (activeSessions.length > 0) {
      console.log(MUTED('  Commands:'));
      console.log(MUTED('    ▸ bob remote --interactive         — Persistent session'));
      console.log(MUTED('    ▸ bob remote chat "message"        — One-shot chat'));
      console.log(MUTED('    ▸ bob remote consult "msg"         — Strategic advice'));
      console.log(MUTED('    ▸ bob remote push "msg"            — Git push'));
      console.log(MUTED('    ▸ bob remote index                 — Re-index project'));
      console.log(MUTED('    ▸ bob remote analyse               — Run QA analysis'));
      console.log(MUTED('    ▸ bob remote backup                — Backup context'));
      console.log(MUTED('    ▸ bob remote backup --source       — Backup source code'));
      console.log(MUTED('    ▸ bob remote backup --global       — Backup ~/.bob/ (Grid)'));
      console.log(MUTED('    ▸ bob remote restore               — Restore latest'));
      console.log(MUTED('    ▸ bob remote restore --source      — Restore latest source'));
      console.log('');
    }

  } catch (error: any) {
    spinner.stop();
    console.log(ERROR(`  ❌ ${error.message}`));
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// DISCOVER AND CONNECT
// ═══════════════════════════════════════════════════════════

async function discoverAndConnect(config: any): Promise<void> {
  const spinner = ora({ text: INFO('  Searching for Active Bobs...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('listActiveBobs', {});
    spinner.stop();
    const bobs = result?.activeBobs || [];

    if (bobs.length === 0) {
      console.log('');
      console.log(WARNING('  ⚠️  No Active Bobs found.'));
      console.log(MUTED('  Run `bob serve` on a machine to start an Active Bob.'));
      console.log('');
      return;
    }

    console.log('');
    console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
    console.log(BORDER('  ║') + INFO('  🌐 Active Bobs Available'));
    console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));

    for (let i = 0; i < bobs.length; i++) {
      const bob = bobs[i];
      const ago = bob.lastHeartbeat ? getTimeAgo(bob.lastHeartbeat) : 'unknown';
      console.log(BORDER('  ║') + `  ${INFO(String(i + 1).padStart(2))}. ${SUCCESS('🟢')} ${chalk.white(bob.machineId)} — ${MUTED(bob.projectName)}`);
      console.log(BORDER('  ║') + MUTED(`      Convo: ${bob.conversationTitle || bob.conversationId?.slice(0, 20) + '...'} | ${ago}`));
    }

    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(INFO('  Select (1-' + bobs.length + ') or 0 to cancel: '), resolve);
    });
    rl.close();

    const selection = parseInt(answer.trim());

    if (isNaN(selection) || selection === 0 || selection < 1 || selection > bobs.length) {
      console.log(MUTED('  Cancelled.'));
      return;
    }

    const selected = bobs[selection - 1];
    setConfigValue('conversationId', selected.conversationId);

    console.log('');
    console.log(SUCCESS(`  ✅ Connected to: ${selected.machineId} (${selected.projectName})`));
    console.log(MUTED(`  Conversation: ${selected.conversationId?.slice(0, 24)}...`));
    console.log(MUTED('  Run `bob remote --interactive` for a persistent session.'));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log(ERROR(`  ❌ ${error.message}`));
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// ONE-SHOT DISPATCH
// ═══════════════════════════════════════════════════════════

async function dispatchCommand(
  config: any,
  type: string,
  payload: any,
  targetSession?: string
): Promise<void> {
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