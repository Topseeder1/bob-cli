import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { startForkAnimation } from '../ui/animations/fork-split.js';
import { getActiveConversationId, setActiveConversationId } from '../core/project-map.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY   = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS         = chalk.hex('#66BB6A');
const INFO            = chalk.hex('#26C6DA');
const WARNING         = chalk.hex('#FFC107');
const ERROR           = chalk.hex('#EF5350');
const MUTED           = chalk.hex('#78909C');
const BORDER          = chalk.hex('#455A64');
const MODE_CONSULTANT = chalk.hex('#AB47BC');

// ─── LAYOUT HELPERS ───
const BOX_WIDTH = 62;

function pad(text: string): string {
  const visible = text.replace(/\x1B\[[0-9;]*m/g, '');
  const padding = BOX_WIDTH - visible.length - 2;
  return text + ' '.repeat(Math.max(0, padding));
}

function topRule(): string { return BORDER('  ╔' + '═'.repeat(BOX_WIDTH) + '╗'); }
function botRule(): string { return BORDER('  ╚' + '═'.repeat(BOX_WIDTH) + '╝'); }
function hRule():   string { return BORDER('  ╠' + '═'.repeat(BOX_WIDTH) + '╣'); }
function row(content: string): string {
  return BORDER('  ║ ') + pad(content) + BORDER(' ║');
}
function emptyRow(): string {
  return BORDER('  ║') + ' '.repeat(BOX_WIDTH) + BORDER('║');
}

export function registerForkCommand(program: Command): void {
  program
    .command('fork <title>')
    .description('Fork the current conversation into a focused sub-project')
    .action(async (title: string) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(ERROR('  ❌ Not logged in. Forks require Tier 3 (platform).'));
        console.log(MUTED('  Run `bob login` to authenticate.'));
        console.log('');
        return;
      }

      // ─── Read conversation ID from project scope ───
      const parentConvoId = getActiveConversationId(process.cwd()) || config.conversationId;
      if (!parentConvoId) {
        console.log('');
        console.log(ERROR('  ❌ No active conversation to fork from.'));
        console.log(MUTED('  Start a conversation first with `bob chat`, or join one with `bob conversations join`.'));
        console.log('');
        return;
      }

      console.log('');
      console.log(chalk.bold(MODE_CONSULTANT(`  ⚡ Forking: "${title}"`)));
      console.log(MUTED(`  From: ${parentConvoId.slice(0, 24)}...`));
      console.log('');

      const forkPromise = callCloudFunction('createConversationFork', {
        parentConversationId: parentConvoId,
        forkTitle:            title,
        userEmail:            config.email,
        userId:               config.uid,
      });

      const animation = startForkAnimation('Parent', title);

      try {
        const result = await forkPromise;
        animation.stop();
        await new Promise(resolve => setTimeout(resolve, 200));

        if (result?.conversationId) {
          // ─── Write fork's new ID to project scope ───
          setActiveConversationId(result.conversationId, process.cwd());
          setConfigValue('conversationId', result.conversationId);

          // ─── Success card ───
          console.log('');
          console.log(topRule());
          console.log(row(SUCCESS(`✅  Fork created: "${title}"`)));
          console.log(hRule());
          console.log(row(MUTED('▸ Session: ') + chalk.white(result.conversationId.slice(0, 24) + '...')));
          console.log(row(MUTED('▸ Your next `bob chat` continues in this fork.')));
          console.log(row(MUTED('▸ 🔗 https://bobs-workshop.web.app/#/bobcodeassistant/' + result.conversationId.slice(0, 20) + '...')));
          console.log(emptyRow());
          console.log(botRule());
          console.log('');

          // ─── Kickstart message ───
          if (result.kickstartMessage) {
            console.log(topRule());
            console.log(row(INFO('🤖  Bob:')));
            console.log(hRule());
            for (const line of result.kickstartMessage.split('\n')) {
              console.log(row(chalk.white(`  ${line}`)));
            }
            console.log(emptyRow());
            console.log(botRule());
            console.log('');
          }

          // ─── Key points ───
          if (result.keyPoints && result.keyPoints.length > 0) {
            console.log(MUTED('  📋 Context carried forward:'));
            for (const point of result.keyPoints.slice(0, 4)) {
              console.log(MUTED(`    ▸ ${point}`));
            }
            console.log('');
          }

        } else {
          console.log('');
          console.log(ERROR('  ❌ Fork failed — no conversation ID returned.'));
          console.log('');
        }
      } catch (error: any) {
        animation.stop();
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('');
        console.log(ERROR(`  ❌ Fork failed: ${error.message}`));
        console.log('');
      }
    });

  program
    .command('forks')
    .description('List all forks of the current conversation')
    .action(async () => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(ERROR('  ❌ Not logged in.'));
        console.log('');
        return;
      }

      // ─── Read conversation ID from project scope ───
      const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;
      if (!conversationId) {
        console.log('');
        console.log(ERROR('  ❌ No active conversation.'));
        console.log('');
        return;
      }

      console.log('');
      console.log(chalk.bold(MODE_CONSULTANT('  🔀 Loading forks...')));

      try {
        const result = await callCloudFunction('listConversationForks', { conversationId });
        const forks  = result.forks || [];

        console.log('');
        console.log(topRule());
        console.log(row(MODE_CONSULTANT('🔀  FORKS')));
        console.log(hRule());

        if (forks.length === 0) {
          console.log(emptyRow());
          console.log(row(MUTED('No forks yet.')));
          console.log(row(MUTED('Run `bob fork "title"` to create one.')));
          console.log(emptyRow());
        } else {
          for (const fork of forks) {
            console.log(emptyRow());
            console.log(row(MODE_CONSULTANT('⚡ ') + chalk.white(fork.title || 'Untitled')));
            console.log(row(MUTED('  ' + (fork.summary?.slice(0, 55) || 'No summary') + (fork.summary?.length > 55 ? '...' : ''))));
            console.log(row(MUTED('  ID: ' + (fork.forkConversationId?.slice(0, 24) || fork.id.slice(0, 24)) + '...')));
          }
          console.log(emptyRow());
        }

        console.log(hRule());
        console.log(row(MUTED('▸ Join a fork: bob conversations join → select it')));
        console.log(emptyRow());
        console.log(botRule());
        console.log('');

      } catch (error: any) {
        console.log('');
        console.log(ERROR(`  ❌ ${error.message}`));
        console.log('');
      }
    });
}