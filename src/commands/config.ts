// File: src/commands/config.ts

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getConfig, setConfigValue, getConfigPath } from '../core/config-store.js';

const VALID_KEYS = [
  'provider',
  'providerKey',
  'localEndpoint',
  'tier',
  'idrp',
  'idrpFilter',
  'idrpAutoInvoke',
  'idrpReadFileMaxLines',
  'idrpBlockedDirectories',
  'idrpUnblockedDirectories',
  'idrpListDirMaxDepth',
  'idrpListDirDefaultDepth',
  'idrpSearchMaxResults',
  'idrpSearchMaxFileSize',
  'idrpDangerousCommands',
  'idrpCommandWhitelist',
  'idrpCommandTimeout',
  'userBobMode',
  'activeProject',
  'activePersona',
  'hasSeenWelcome',
  'autoMode',
];

const VALID_PROVIDERS = ['claude', 'gemini', 'openai', 'grok', 'local'];
const VALID_USERBOB_MODES = ['local', 'platform'];

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
      const dangerousOn = config.idrpDangerousCommands === true || config.idrpDangerousCommands === 'true';

      console.log('');
      console.log(chalk.bold('  ⚙️  Bob CLI Configuration'));
      console.log(chalk.gray('  ─────────────────────────────'));
      console.log(`  ${chalk.cyan('Tier:')}           ${config.tier}`);
      console.log(`  ${chalk.cyan('Logged In:')}      ${config.loggedIn}`);
      console.log(`  ${chalk.cyan('Email:')}          ${config.email || 'None'}`);
      console.log(`  ${chalk.cyan('Provider:')}       ${config.provider || 'Not set'}`);
      console.log(`  ${chalk.cyan('Provider Key:')}   ${config.providerKey ? '••••••••' : 'Not set'}`);
      console.log(`  ${chalk.cyan('Local Endpoint:')} ${config.localEndpoint || 'Not set'}`);
      console.log(`  ${chalk.cyan('Auto Mode:')}      ${config.autoMode ? 'Enabled' : 'Disabled'}`);
      console.log(`  ${chalk.cyan('Active Project:')} ${config.activeProject || 'None'}`);
      console.log(`  ${chalk.cyan('Active Persona:')} ${config.activePersona || 'None'}`);
      console.log(`  ${chalk.cyan('Has Seen Welcome:')} ${config.hasSeenWelcome}`);

      console.log('');
      console.log(chalk.bold('  🤖 UserBob Settings'));
      console.log(chalk.gray('  ─────────────────────────────'));
      const modeDisplay = config.userBobMode
        ? config.userBobMode === 'local'
          ? chalk.green('local (Tier 1 — Local Model)')
          : chalk.hex('#26C6DA')('platform (Tier 3 — Cloud)')
        : chalk.gray('auto (local if endpoint responds, otherwise platform)');
      console.log(`  ${chalk.cyan('UserBob Mode:')}   ${modeDisplay}`);

      console.log('');
      console.log(chalk.bold('  📂 IDRP Local Settings'));
      console.log(chalk.gray('  ─────────────────────────────'));
      console.log(`  ${chalk.cyan('IDRP:')}              ${config.idrp ? 'Enabled' : 'Disabled'}`);
      console.log(`  ${chalk.cyan('IDRP Filter:')}       ${config.idrpFilter || 'None'}`);
      console.log(`  ${chalk.cyan('Auto Invoke:')}       ${config.idrpAutoInvoke === false ? chalk.yellow('Manual (ask before invoking)') : chalk.green('Auto (model decides)')}`);
      console.log(`  ${chalk.cyan('Read Max Lines:')}    ${config.idrpReadFileMaxLines || 500}`);
      console.log(`  ${chalk.cyan('Blocked Dirs:')}      ${config.idrpBlockedDirectories || '(defaults only)'}`);
      console.log(`  ${chalk.cyan('Unblocked Dirs:')}    ${config.idrpUnblockedDirectories || '(none)'}`);
      console.log(`  ${chalk.cyan('Dir Max Depth:')}     ${config.idrpListDirMaxDepth || 3}`);
      console.log(`  ${chalk.cyan('Dir Default Depth:')} ${config.idrpListDirDefaultDepth || 1}`);
      console.log(`  ${chalk.cyan('Search Max Results:')} ${config.idrpSearchMaxResults || 50}`);
      console.log(`  ${chalk.cyan('Search Max File:')}   ${config.idrpSearchMaxFileSize || 100000} bytes`);
      console.log(`  ${chalk.cyan('Command Timeout:')}   ${config.idrpCommandTimeout || 30}s`);
      console.log(`  ${chalk.cyan('Command Whitelist:')} ${config.idrpCommandWhitelist || '(defaults only)'}`);

      if (dangerousOn) {
        console.log(`  ${chalk.cyan('Dangerous Cmds:')}   ${chalk.red.bold('⚠️  UNRESTRICTED (dangerous commands enabled)')}`);
      } else {
        console.log(`  ${chalk.cyan('Dangerous Cmds:')}   ${chalk.green('Disabled (safe whitelist only)')}`);
      }

      console.log('');
      console.log(chalk.gray(`  Config file: ${getConfigPath()}`));
      console.log('');
    });

  // bob config set <key> <value>
  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
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

      // Validate userBobMode
      if (key === 'userBobMode' && !VALID_USERBOB_MODES.includes(value)) {
        console.log('');
        console.log(chalk.red(`  ❌ Invalid userBobMode: "${value}"`));
        console.log(chalk.gray(`  Valid modes: ${VALID_USERBOB_MODES.join(', ')}`));
        console.log('');
        return;
      }

      let finalValue: any = value;

      // ─── BOOLEAN KEYS ───
      if (key === 'idrp') {
        finalValue = value === 'true' || value === 'enabled' || value === 'on';
      }
      if (key === 'hasSeenWelcome') {
        finalValue = value === 'true';
      }
      if (key === 'autoMode') {
        finalValue = value === 'true' || value === 'enabled' || value === 'on';
      }
      if (key === 'idrpAutoInvoke') {
        finalValue = value === 'true' || value === 'enabled' || value === 'on' || value === 'auto';
      }

      // ─── DANGEROUS COMMANDS — confirmation required ───
      if (key === 'idrpDangerousCommands') {
        const wantsEnabled = value === 'true' || value === 'enabled' || value === 'on';

        if (wantsEnabled) {
          console.log('');
          console.log(chalk.red.bold('  ⚠️  WARNING: Enabling dangerous commands'));
          console.log(chalk.red('  ─────────────────────────────────────────'));
          console.log(chalk.red('  This allows the AI model to execute ANY shell'));
          console.log(chalk.red('  command on your machine, including destructive'));
          console.log(chalk.red('  operations like rm, mv, curl, and sudo.'));
          console.log('');
          console.log(chalk.red('  This removes all command safety restrictions'));
          console.log(chalk.red('  for IDRP local capabilities.'));
          console.log('');

          const { confirmed } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmed',
            message: chalk.red('  Are you sure you want to enable dangerous commands?'),
            default: false,
          }]);

          if (!confirmed) {
            console.log('');
            console.log(chalk.gray('  Cancelled. Dangerous commands remain disabled.'));
            console.log('');
            return;
          }

          finalValue = true;
        } else {
          finalValue = false;
        }
      }

      // ─── TIER VALIDATION ───
      if (key === 'tier') {
        if (value !== 'local' && value !== 'platform') {
          console.log('');
          console.log(chalk.red(`  ❌ Invalid tier: "${value}"`));
          console.log(chalk.gray(`  Valid tiers: local, platform`));
          console.log('');
          return;
        }
      }

      // ─── NUMERIC KEYS WITH FLOORS ───
      if (key === 'idrpReadFileMaxLines') {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          console.log('');
          console.log(chalk.red(`  ❌ Invalid value: "${value}" — must be a positive number.`));
          console.log(chalk.gray(`  Minimum enforced: 50 lines. Default: 500.`));
          console.log('');
          return;
        }
        finalValue = Math.max(num, 50);
        if (num < 50) console.log(chalk.yellow(`  ⚠️  Minimum is 50 lines. Setting to 50.`));
      }

      if (key === 'idrpListDirMaxDepth') {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          console.log('');
          console.log(chalk.red(`  ❌ Invalid value — must be a positive number (1-10).`));
          console.log('');
          return;
        }
        finalValue = Math.min(Math.max(num, 1), 10);
        if (num > 10) console.log(chalk.yellow(`  ⚠️  Maximum depth is 10. Setting to 10.`));
        if (num < 1) console.log(chalk.yellow(`  ⚠️  Minimum depth is 1. Setting to 1.`));
      }

      if (key === 'idrpListDirDefaultDepth') {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          console.log('');
          console.log(chalk.red(`  ❌ Invalid value — must be a positive number.`));
          console.log('');
          return;
        }
        finalValue = Math.max(num, 1);
      }

      if (key === 'idrpSearchMaxResults') {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          console.log('');
          console.log(chalk.red(`  ❌ Invalid value — must be a positive number. Minimum: 10.`));
          console.log('');
          return;
        }
        finalValue = Math.max(num, 10);
        if (num < 10) console.log(chalk.yellow(`  ⚠️  Minimum is 10 results. Setting to 10.`));
      }

      if (key === 'idrpSearchMaxFileSize') {
        const num = parseInt(value);
        if (isNaN(num) || num < 1000) {
          console.log('');
          console.log(chalk.red(`  ❌ Invalid value — must be at least 1000 bytes.`));
          console.log('');
          return;
        }
        finalValue = num;
      }

      if (key === 'idrpCommandTimeout') {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          console.log('');
          console.log(chalk.red(`  ❌ Invalid value — must be a positive number (seconds). Minimum: 5.`));
          console.log('');
          return;
        }
        finalValue = Math.max(num, 5);
        if (num < 5) console.log(chalk.yellow(`  ⚠️  Minimum timeout is 5 seconds. Setting to 5.`));
      }

      // ─── COMMA-SEPARATED LIST KEYS ───
      if (key === 'idrpBlockedDirectories' || key === 'idrpUnblockedDirectories' || key === 'idrpCommandWhitelist') {
        finalValue = value.split(',').map((s: string) => s.trim()).filter(Boolean).join(',');
        if (!finalValue) {
          console.log('');
          console.log(chalk.red(`  ❌ Empty value. Provide comma-separated values.`));
          console.log(chalk.gray(`  Example: bob config set ${key} "value1,value2"`));
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