import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';

export function registerConversationsCommand(program: Command): void {
  const convosCmd = program
    .command('conversations')
    .description('List, search, and join existing conversations')
    .option('-p, --page <number>', 'Page number', '1')
    .option('-s, --search <query>', 'Search conversations by title or content')
    .action(async (options: { page?: string; search?: string }) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(chalk.red('  ❌ Not logged in.'));
        console.log(chalk.gray('  Run `bob login` first.'));
        console.log('');
        return;
      }

      const spinner = ora({
        text: chalk.cyan('  Loading conversations...'),
        spinner: 'dots',
      }).start();

      try {
        const result = await callCloudFunction('listCLIConversations', {
          page: parseInt(options.page || '1'),
          limit: 10,
          search: options.search || null,
        });

        spinner.stop();

        const conversations = result.conversations || [];

        if (conversations.length === 0) {
          console.log('');
          console.log(chalk.yellow('  No conversations found.'));
          if (options.search) {
            console.log(chalk.gray(`  Search: "${options.search}"`));
          }
          console.log('');
          return;
        }

        console.log('');
        console.log(chalk.bold('  💬 Your Conversations'));
        console.log(chalk.gray('  ─────────────────────────────────────'));

        if (options.search) {
          console.log(chalk.gray(`  Search: "${options.search}" (${result.total} results)`));
          console.log('');
        }

        conversations.forEach((convo: any, index: number) => {
          const num = index + 1;
          const timeAgo = convo.lastUpdated ? getTimeAgo(convo.lastUpdated) : 'unknown';
          const sourceIcon = convo.source === 'cli' ? '⌨️' : '🌐';
          const projectIcon = convo.hasProject ? '📁' : '  ';

          console.log(`  ${chalk.cyan(String(num).padStart(2, ' '))}. ${projectIcon} ${chalk.white(convo.title)}`);
          console.log(chalk.gray(`      ${sourceIcon} ${timeAgo} · ${convo.sender === 'bob' ? 'Bob' : 'You'}: ${convo.lastMessage.slice(0, 60)}${convo.lastMessage.length > 60 ? '...' : ''}`));
          console.log('');
        });

        // Pagination info
        if (result.totalPages && result.totalPages > 1) {
          console.log(chalk.gray(`  Page ${result.page}/${result.totalPages} (${result.total} total)`));
          if (result.page < result.totalPages) {
            console.log(chalk.gray(`  Run: bob conversations --page ${result.page + 1}`));
          }
        }

        console.log(chalk.gray('  ─────────────────────────────────────'));
        console.log(chalk.gray('  Join: bob conversations join'));
        console.log('');

      } catch (error: any) {
        spinner.stop();
        console.log('');
        console.log(chalk.red(`  ❌ ${error.message}`));
        console.log('');
      }
    });

  // bob conversations join
  convosCmd
    .command('join')
    .description('Pick a conversation to continue')
    .option('-s, --search <query>', 'Search first')
    .action(async (options: { search?: string }) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(chalk.red('  ❌ Not logged in.'));
        console.log(chalk.gray('  Run `bob login` first.'));
        console.log('');
        return;
      }

      const spinner = ora({
        text: chalk.cyan('  Loading conversations...'),
        spinner: 'dots',
      }).start();

      try {
        const result = await callCloudFunction('listCLIConversations', {
          page: 1,
          limit: 15,
          search: options.search || null,
        });

        spinner.stop();

        const conversations = result.conversations || [];

        if (conversations.length === 0) {
          console.log('');
          console.log(chalk.yellow('  No conversations found.'));
          console.log('');
          return;
        }

        console.log('');
        console.log(chalk.bold('  💬 Select a Conversation'));
        console.log(chalk.gray('  ─────────────────────────────────────'));
        console.log('');

        conversations.forEach((convo: any, index: number) => {
          const num = index + 1;
          const timeAgo = convo.lastUpdated ? getTimeAgo(convo.lastUpdated) : 'unknown';
          const sourceIcon = convo.source === 'cli' ? '⌨️' : '🌐';
          const projectIcon = convo.hasProject ? '📁' : '  ';

          console.log(`  ${chalk.cyan(String(num).padStart(2, ' '))}. ${projectIcon} ${chalk.white(convo.title)}`);
          console.log(chalk.gray(`      ${sourceIcon} ${timeAgo}`));
        });

        console.log('');

        // ─── SELECTION PROMPT ───
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve => {
          rl.question(chalk.cyan('  Select (1-' + conversations.length + ') or 0 to cancel: '), resolve);
        });
        rl.close();

        const selection = parseInt(answer.trim());

        if (isNaN(selection) || selection === 0) {
          console.log(chalk.gray('  Cancelled.'));
          console.log('');
          return;
        }

        if (selection < 1 || selection > conversations.length) {
          console.log(chalk.red('  ❌ Invalid selection.'));
          console.log('');
          return;
        }

        const selected = conversations[selection - 1];
        setConfigValue('conversationId', selected.id);

        console.log('');
        console.log(chalk.green(`  ✅ Joined: "${selected.title}"`));
        console.log(chalk.gray(`  Session ID: ${selected.id}`));
        console.log(chalk.gray('  Your next `bob chat` message will continue this conversation.'));
        console.log('');

      } catch (error: any) {
        spinner.stop();
        console.log('');
        console.log(chalk.red(`  ❌ ${error.message}`));
        console.log('');
      }
    });
}

function getTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}