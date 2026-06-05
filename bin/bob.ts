#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { getConfig } from '../src/core/config-store.js';
import { registerConfigCommand } from '../src/commands/config.js';
import { registerChatCommand } from '../src/commands/chat.js';
import { registerConsultCommand } from '../src/commands/consult.js';
import { registerIndexCommand } from '../src/commands/index.js';
import { registerLoginCommand } from '../src/commands/login.js';
import { registerPushCommand } from '../src/commands/push.js';


const program = new Command();

program
  .name('bob')
  .description('Bob\'s CLI — AI coding assistant and Forge orchestrator')
  .version('0.1.0');

// ═══════════════════════════════════════════
// WHOAMI
// ═══════════════════════════════════════════
program
  .command('whoami')
  .description('Show current authentication status and configuration')
  .action(() => {
    const config = getConfig();
    const projectName = path.basename(process.cwd());

    console.log('');
    console.log(chalk.bold('  🤖 Bob\'s CLI'));
    console.log(chalk.gray('  ─────────────────────────'));
    console.log(`  ${chalk.cyan('Status:')}    ${config.loggedIn ? chalk.green('Logged in as ' + config.email) : 'Not logged in'}`);
    console.log(`  ${chalk.cyan('Tier:')}      ${config.tier === 'platform' ? 'Platform (Tier 3)' : 'Local-first (Tier 1)'}`);
    console.log(`  ${chalk.cyan('Provider:')}  ${config.provider || 'Not configured'}`);
    console.log(`  ${chalk.cyan('Mode:')}      ${config.personalizationMode ? 'Personalized' : config.consultantMode ? 'Consultant' : 'Standard'}`);
    console.log(`  ${chalk.cyan('IDRP:')}      ${config.idrp ? 'Enabled' : 'Disabled'}`);
    console.log(`  ${chalk.cyan('Project:')}   ${projectName} (${process.cwd()})`);
    console.log(`  ${chalk.cyan('Session:')}   ${config.conversationId ? config.conversationId.slice(0, 20) + '...' : 'None'}`);
    console.log('');
    if (!config.loggedIn) {
      console.log(chalk.gray('  Run `bob login` to authenticate.'));
      console.log('');
    }
  });

// ═══════════════════════════════════════════
// REGISTER COMMANDS
// ═══════════════════════════════════════════
registerConfigCommand(program);
registerChatCommand(program);
registerConsultCommand(program);
registerIndexCommand(program);
registerLoginCommand(program);
registerPushCommand(program);

program.parse();