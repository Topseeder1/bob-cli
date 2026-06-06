import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { startForkAnimation } from '../ui/animations/fork-split.js';

export function registerForkCommand(program: Command): void {
  program
    .command('fork <title>')
    .description('Fork the current conversation into a focused sub-project')
    .action(async (title: string) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(chalk.red('  ❌ Not logged in. Forks require Tier 3 (platform).'));
        console.log(chalk.gray('  Run `bob login` to authenticate.'));
        console.log('');
        return;
      }

      if (!config.conversationId) {
        console.log('');
        console.log(chalk.red('  ❌ No active conversation to fork from.'));
        console.log(chalk.gray('  Start a conversation first with `bob chat`, or join one with `bob conversations join`.'));
        console.log('');
        return;
      }

      const parentConvoId = config.conversationId;

      console.log('');
      console.log(chalk.bold.magenta(`  ⚡ Forking: "${title}"`));
      console.log(chalk.gray(`  From: ${parentConvoId.slice(0, 24)}...`));
      console.log('');

      // Start animation + backend call simultaneously
      const forkPromise = callCloudFunction('createConversationFork', {
        parentConversationId: parentConvoId,
        forkTitle: title,
        userEmail: config.email,
        userId: config.uid,
      });

      const animation = startForkAnimation('Parent', title);

      try {
        const result = await forkPromise;
        animation.stop();

        // Small delay to let final frame render
        await new Promise(resolve => setTimeout(resolve, 200));

        if (result?.conversationId) {
          setConfigValue('conversationId', result.conversationId);

          console.log('');
          console.log(chalk.green(`  ✅ Fork created: "${title}"`));
          console.log(chalk.gray(`  Session: ${result.conversationId.slice(0, 24)}...`));
          console.log(chalk.gray('  Your next `bob chat` message continues in this fork.'));
          console.log(chalk.gray(`  🔗 https://bobs-workshop.web.app/#/bobcodeassistant/${result.conversationId}`));
          console.log('');

          // Show Bob's kickstart message
          if (result.kickstartMessage) {
            console.log(chalk.gray('  ─────────────────────────────────────'));
            console.log(chalk.bold.cyan('  🤖 Bob:'));
            console.log('');
            for (const line of result.kickstartMessage.split('\n')) {
              console.log(`  ${line}`);
            }
            console.log('');
            console.log(chalk.gray('  ─────────────────────────────────────'));
            console.log('');
          }

          // Show summary details
          if (result.keyPoints && result.keyPoints.length > 0) {
            console.log(chalk.gray('  📋 Context carried forward:'));
            for (const point of result.keyPoints.slice(0, 4)) {
              console.log(chalk.gray(`    • ${point}`));
            }
            console.log('');
          }

        } else {
          console.log('');
          console.log(chalk.red('  ❌ Fork failed — no conversation ID returned.'));
          console.log('');
        }

      } catch (error: any) {
        animation.stop();
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('');
        console.log(chalk.red(`  ❌ Fork failed: ${error.message}`));
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
        console.log(chalk.red('  ❌ Not logged in.'));
        console.log('');
        return;
      }

      if (!config.conversationId) {
        console.log('');
        console.log(chalk.red('  ❌ No active conversation.'));
        console.log('');
        return;
      }

      console.log('');
      console.log(chalk.bold.magenta('  🔀 Loading forks...'));

      try {
        const result = await callCloudFunction('listConversationForks', {
          conversationId: config.conversationId,
        });

        const forks = result.forks || [];

        console.log('');
        console.log(chalk.bold.magenta('  🔀 Forks'));
        console.log(chalk.gray('  ─────────────────────────────────────'));

        if (forks.length === 0) {
          console.log(chalk.gray('  No forks yet.'));
          console.log(chalk.gray('  Run `bob fork "title"` to create one.'));
        } else {
          for (const fork of forks) {
            console.log(`  ${chalk.magenta('⚡')} ${chalk.white(fork.title || 'Untitled')}`);
            console.log(chalk.gray(`    ${fork.summary?.slice(0, 60) || 'No summary'}${fork.summary?.length > 60 ? '...' : ''}`));
            console.log(chalk.gray(`    ID: ${fork.forkConversationId?.slice(0, 24) || fork.id.slice(0, 24)}...`));
            console.log('');
          }
        }

        console.log(chalk.gray('  ─────────────────────────────────────'));
        console.log(chalk.gray('  Join a fork: bob conversations join → select it'));
        console.log('');

      } catch (error: any) {
        console.log('');
        console.log(chalk.red(`  ❌ ${error.message}`));
        console.log('');
      }
    });
}