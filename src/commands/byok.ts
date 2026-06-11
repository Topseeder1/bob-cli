import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';

// ─── DESIGN TOKENS ───
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');

const VALID_PROVIDERS = ['google', 'bedrock', 'claude', 'openai', 'grok'];

export function registerByokCommand(program: Command): void {
  const byokCmd = program
    .command('byok')
    .description('Manage your Bring Your Own Key (BYOK) configuration');

  byokCmd
    .command('set <provider> <key>')
    .description('Configure an API key for a provider')
    .action(async (provider: string, key: string) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(ERROR('  ❌ Not logged in.'));
        console.log(MUTED('  Run `bob login` first.'));
        console.log('');
        return;
      }

      if (!VALID_PROVIDERS.includes(provider.toLowerCase())) {
        console.log('');
        console.log(ERROR(`  ❌ Invalid provider: "${provider}"`));
        console.log(MUTED(`  Valid providers: ${VALID_PROVIDERS.join(', ')}`));
        console.log('');
        return;
      }

      const spinner = ora({
        text: INFO('  Saving key...'),
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
        console.log(SUCCESS(`  ✅ ${result.message}`));
        console.log(MUTED(`  Provider: ${provider.toLowerCase()}`));
        console.log(MUTED('  Key stored securely on the platform.'));
        console.log('');
      } catch (error: any) {
        spinner.stop();

        if (error.message?.includes('ORG_USER_BLOCKED') || error.response?.data?.error?.message?.includes('ORG_USER_BLOCKED')) {
          console.log('');
          console.log(WARNING('  ⚠️  BYOK configuration for Organization accounts is managed by your admin.'));
          console.log(MUTED('  Contact your administrator to update keys from the Admin Dashboard:'));
          console.log(INFO('  https://bobs-workshop.web.app/#/bobsadmindashboard'));
          console.log('');
        } else {
          console.log('');
          console.log(ERROR(`  ❌ ${error.message || 'Failed to save key.'}`));
          console.log('');
        }
      }
    });

  byokCmd
    .command('remove <provider>')
    .description('Remove an API key for a provider')
    .action(async (provider: string) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(ERROR('  ❌ Not logged in.'));
        console.log(MUTED('  Run `bob login` first.'));
        console.log('');
        return;
      }

      if (!VALID_PROVIDERS.includes(provider.toLowerCase())) {
        console.log('');
        console.log(ERROR(`  ❌ Invalid provider: "${provider}"`));
        console.log(MUTED(`  Valid providers: ${VALID_PROVIDERS.join(', ')}`));
        console.log('');
        return;
      }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>(resolve => {
        rl.question(WARNING(`  Remove ${provider} key? (y/n): `), resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log(MUTED('  Cancelled.'));
        return;
      }

      const spinner = ora({
        text: INFO('  Removing key...'),
        spinner: 'dots',
      }).start();

      try {
        const result = await callCloudFunction('updateBYOKFromCLI', {
          action: 'remove',
          provider: provider.toLowerCase(),
        });

        spinner.stop();
        console.log('');
        console.log(SUCCESS(`  ✅ ${result.message}`));
        console.log('');
      } catch (error: any) {
        spinner.stop();

        if (error.message?.includes('ORG_USER_BLOCKED') || error.response?.data?.error?.message?.includes('ORG_USER_BLOCKED')) {
          console.log('');
          console.log(WARNING('  ⚠️  BYOK configuration for Organization accounts is managed by your admin.'));
          console.log(MUTED('  Contact your administrator to update keys from the Admin Dashboard:'));
          console.log(INFO('  https://bobs-workshop.web.app/#/bobsadmindashboard'));
          console.log('');
        } else {
          console.log('');
          console.log(ERROR(`  ❌ ${error.message || 'Failed to remove key.'}`));
          console.log('');
        }
      }
    });

  byokCmd
    .command('status')
    .description('Show which BYOK keys are configured')
    .action(async () => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(ERROR('  ❌ Not logged in.'));
        console.log(MUTED('  Run `bob login` first.'));
        console.log('');
        return;
      }

      const spinner = ora({
        text: INFO('  Checking BYOK status...'),
        spinner: 'dots',
      }).start();

      try {
        const result = await callCloudFunction('updateBYOKFromCLI', {
          action: 'status',
        });

        spinner.stop();
        const keys = result.keys || [];

        console.log('');
        console.log(chalk.bold(BRAND_SECONDARY('  🔑 BYOK Status')));
        console.log(MUTED('  ─────────────────────────────────────'));

        if (keys.length === 0) {
          console.log(MUTED('  No keys configured.'));
          console.log(MUTED('  Run `bob byok set <provider> <key>` to add one.'));
        } else {
          for (const key of keys) {
            const statusIcon = key.isActive ? SUCCESS('●') : ERROR('○');
            const statusText = key.isActive ? SUCCESS('Active') : ERROR('Inactive');
            console.log(`  ${statusIcon} ${INFO(key.provider.padEnd(12))} ${statusText}  (via ${key.source})`);
          }
        }

        console.log(MUTED('  ─────────────────────────────────────'));
        console.log('');
      } catch (error: any) {
        spinner.stop();

        if (error.message?.includes('ORG_USER_BLOCKED') || error.response?.data?.error?.message?.includes('ORG_USER_BLOCKED')) {
          console.log('');
          console.log(WARNING('  ⚠️  BYOK configuration for Organization accounts is managed by your admin.'));
          console.log(MUTED('  Contact your administrator to update keys from the Admin Dashboard:'));
          console.log(INFO('  https://bobs-workshop.web.app/#/bobsadmindashboard'));
          console.log('');
        } else {
          console.log('');
          console.log(ERROR(`  ❌ ${error.message || 'Failed to check status.'}`));
          console.log('');
        }
      }
    });
}