import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfigValue, getConfigPath } from '../core/config-store.js';

const VALID_KEYS = [
  'provider',
  'providerKey',
  'localEndpoint',
  'tier',
  'idrp',
  'idrpFilter',
  'activeProject',
  'activePersona',
];

const VALID_PROVIDERS = ['claude', 'gemini', 'openai', 'grok', 'local'];

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('View or update Bob CLI configuration');

  // bob config show
  configCmd
    .command('show')
    .description('Display current configuration')
    .action(() => {
      const config = getConfig();
      console.log('');
      console.log(chalk.bold('  ⚙️  Bob CLI Configuration'));
      console.log(chalk.gray('  ─────────────────────────────'));
      console.log(`  ${chalk.cyan('Tier:')}           ${config.tier}`);
      console.log(`  ${chalk.cyan('Logged In:')}      ${config.loggedIn}`);
      console.log(`  ${chalk.cyan('Email:')}          ${config.email || 'None'}`);
      console.log(`  ${chalk.cyan('Provider:')}       ${config.provider || 'Not set'}`);
      console.log(`  ${chalk.cyan('Provider Key:')}   ${config.providerKey ? '••••••••' : 'Not set'}`);
      console.log(`  ${chalk.cyan('Local Endpoint:')} ${config.localEndpoint || 'Not set'}`);
      console.log(`  ${chalk.cyan('IDRP:')}           ${config.idrp ? 'Enabled' : 'Disabled'}`);
      console.log(`  ${chalk.cyan('IDRP Filter:')}    ${config.idrpFilter}`);
      console.log(`  ${chalk.cyan('Active Project:')} ${config.activeProject || 'None'}`);
      console.log(`  ${chalk.cyan('Active Persona:')} ${config.activePersona || 'None'}`);
      console.log('');
      console.log(chalk.gray(`  Config file: ${getConfigPath()}`));
      console.log('');
    });

  // bob config set <key> <value>
  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      if (!VALID_KEYS.includes(key)) {
        console.log('');
        console.log(chalk.red(`  ❌ Invalid key: "${key}"`));
        console.log(chalk.gray(`  Valid keys: ${VALID_KEYS.join(', ')}`));
        console.log('');
        return;
      }

      // Validate provider value
      if (key === 'provider' && !VALID_PROVIDERS.includes(value)) {
        console.log('');
        console.log(chalk.red(`  ❌ Invalid provider: "${value}"`));
        console.log(chalk.gray(`  Valid providers: ${VALID_PROVIDERS.join(', ')}`));
        console.log('');
        return;
      }

      // Handle boolean values
      let finalValue: any = value;
      if (key === 'idrp') {
        finalValue = value === 'true' || value === 'enabled' || value === 'on';
      }
      if (key === 'tier') {
        if (value !== 'local' && value !== 'platform') {
          console.log('');
          console.log(chalk.red(`  ❌ Invalid tier: "${value}"`));
          console.log(chalk.gray(`  Valid tiers: local, platform`));
          console.log('');
          return;
        }
      }

      setConfigValue(key as any, finalValue);
      console.log('');
      console.log(chalk.green(`  ✅ ${key} → ${key === 'providerKey' ? '••••••••' : finalValue}`));
      console.log('');
    });

  // bob config path
  configCmd
    .command('path')
    .description('Show the config file location')
    .action(() => {
      console.log('');
      console.log(chalk.cyan(`  📁 ${getConfigPath()}`));
      console.log('');
    });
}