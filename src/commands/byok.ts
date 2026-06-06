import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';

const VALID_PROVIDERS = ['google', 'bedrock', 'claude', 'openai', 'grok'];

export function registerByokCommand(program: Command): void {
  const byokCmd = program
    .command('byok')
    .description('Manage your Bring Your Own Key (BYOK) configuration');

  // bob byok set <provider> <key>
  byokCmd
    .command('set <provider> <key>')
    .description('Configure an API key for a provider')
    .action(async (provider: string, key: string) => {
      const config = getConfig();

      // ─── AUTH GATE ───
      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(chalk.red('  ❌ Not logged in.'));
        console.log(chalk.gray('  Run `bob login` first.'));
        console.log('');
        return;
      }

      // ─── VALIDATE PROVIDER ───
      if (!VALID_PROVIDERS.includes(provider.toLowerCase())) {
        console.log('');
        console.log(chalk.red(`  ❌ Invalid provider: "${provider}"`));
        console.log(chalk.gray(`  Valid providers: ${VALID_PROVIDERS.join(', ')}`));
        console.log('');
        return;
      }

      const spinner = ora({
        text: chalk.cyan('  Saving key...'),
        spinner: 'dots',
      }).start();

      try {
        const result = await callCloudFunction('updateBYOKFromCLI', {
          action: 'set',
          provider: provider.toLowerCase(),
          apiKey: key,
        });

        spinner.stop();
        console.log('');
        console.log(chalk.green(`  ✅ ${result.message}`));
        console.log(chalk.gray(`  Provider: ${provider.toLowerCase()}`));
        console.log(chalk.gray('  Key stored securely on the platform.'));
        console.log('');

      } catch (error: any) {
        spinner.stop();
        if (error.message?.includes('ORG_USER_BLOCKED') || error.response?.data?.error?.message?.includes('ORG_USER_BLOCKED')) {
          console.log('');
          console.log(chalk.yellow('  ⚠️  BYOK configuration for Organization accounts is managed by your admin.'));
          console.log(chalk.gray('  Contact your administrator to update keys from the Admin Dashboard:'));
          console.log(chalk.cyan('  https://bobs-workshop.web.app/#/bobsadmindashboard'));
          console.log('');
        } else {
          console.log('');
          console.log(chalk.red(`  ❌ ${error.message || 'Failed to save key.'}`));
          console.log('');
        }
      }
    });

  // bob byok remove <provider>
  byokCmd
    .command('remove <provider>')
    .description('Remove an API key for a provider')
    .action(async (provider: string) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(chalk.red('  ❌ Not logged in.'));
        console.log(chalk.gray('  Run `bob login` first.'));
        console.log('');
        return;
      }

      if (!VALID_PROVIDERS.includes(provider.toLowerCase())) {
        console.log('');
        console.log(chalk.red(`  ❌ Invalid provider: "${provider}"`));
        console.log(chalk.gray(`  Valid providers: ${VALID_PROVIDERS.join(', ')}`));
        console.log('');
        return;
      }

      // Confirmation
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>(resolve => {
        rl.question(chalk.yellow(`  Remove ${provider} key? (y/n): `), resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log(chalk.gray('  Cancelled.'));
        return;
      }

      const spinner = ora({
        text: chalk.cyan('  Removing key...'),
        spinner: 'dots',
      }).start();

      try {
        const result = await callCloudFunction('updateBYOKFromCLI', {
          action: 'remove',
          provider: provider.toLowerCase(),
        });

        spinner.stop();
        console.log('');
        console.log(chalk.green(`  ✅ ${result.message}`));
        console.log('');

      } catch (error: any) {
        spinner.stop();
        if (error.message?.includes('ORG_USER_BLOCKED') || error.response?.data?.error?.message?.includes('ORG_USER_BLOCKED')) {
          console.log('');
          console.log(chalk.yellow('  ⚠️  BYOK configuration for Organization accounts is managed by your admin.'));
          console.log(chalk.gray('  Contact your administrator to update keys from the Admin Dashboard:'));
          console.log(chalk.cyan('  https://bobs-workshop.web.app/#/bobsadmindashboard'));
          console.log('');
        } else {
          console.log('');
          console.log(chalk.red(`  ❌ ${error.message || 'Failed to remove key.'}`));
          console.log('');
        }
      }
    });

  // bob byok status
  byokCmd
    .command('status')
    .description('Show which BYOK keys are configured')
    .action(async () => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(chalk.red('  ❌ Not logged in.'));
        console.log(chalk.gray('  Run `bob login` first.'));
        console.log('');
        return;
      }

      const spinner = ora({
        text: chalk.cyan('  Checking BYOK status...'),
        spinner: 'dots',
      }).start();

      try {
        const result = await callCloudFunction('updateBYOKFromCLI', {
          action: 'status',
        });

        spinner.stop();

        const keys = result.keys || [];

        console.log('');
        console.log(chalk.bold('  🔑 BYOK Status'));
        console.log(chalk.gray('  ─────────────────────────────────────'));

        if (keys.length === 0) {
          console.log(chalk.gray('  No keys configured.'));
          console.log(chalk.gray('  Run `bob byok set <provider> <key>` to add one.'));
        } else {
          for (const key of keys) {
            const statusIcon = key.isActive ? chalk.green('●') : chalk.red('○');
            const statusText = key.isActive ? chalk.green('Active') : chalk.red('Inactive');
            console.log(`  ${statusIcon} ${chalk.cyan(key.provider.padEnd(12))} ${statusText}  (via ${key.source})`);
          }
        }

        console.log(chalk.gray('  ─────────────────────────────────────'));
        console.log('');

      } catch (error: any) {
        spinner.stop();
        if (error.message?.includes('ORG_USER_BLOCKED') || error.response?.data?.error?.message?.includes('ORG_USER_BLOCKED')) {
          console.log('');
          console.log(chalk.yellow('  ⚠️  BYOK configuration for Organization accounts is managed by your admin.'));
          console.log(chalk.gray('  Contact your administrator to update keys from the Admin Dashboard:'));
          console.log(chalk.cyan('  https://bobs-workshop.web.app/#/bobsadmindashboard'));
          console.log('');
        } else {
          console.log('');
          console.log(chalk.red(`  ❌ ${error.message || 'Failed to check status.'}`));
          console.log('');
        }
      }
    });
}