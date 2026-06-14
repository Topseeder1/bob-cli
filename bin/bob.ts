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
import { registerByokCommand } from '../src/commands/byok.js';
import { registerConversationsCommand } from '../src/commands/conversations.js';
import { registerForkCommand } from '../src/commands/fork.js';
import { registerDeepDiveCommand } from '../src/commands/deepdive.js';
import { registerAnalyseCommand } from '../src/commands/analyse.js';
import { registerAutonomyCommand } from '../src/commands/autonomy.js';
import { registerServeCommand } from '../src/commands/serve.js';
import { registerRemoteCommand } from '../src/commands/remote.js';
import { registerProfileCommand } from '../src/commands/profile.js';
import { registerUserBobCommand } from '../src/commands/userbob.js';
import { registerCommandCenterCommand } from '../src/commands/command-center.js';


// ─── DESIGN TOKENS ───
const BRAND_PRIMARY = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const MUTED = chalk.hex('#78909C');
const MODE_CONSULTANT = chalk.hex('#AB47BC');

const program = new Command();

program
  .name('bob')
  .description("Bob's CLI — AI coding assistant and Forge orchestrator")
  .version('0.2.0')
  .helpOption(false)
  .addHelpCommand(false);

// ─── CUSTOM HELP ───
program
  .option('-h, --help', 'Print this usage information')
  .on('option:help', () => {
    printCustomHelp();
    process.exit(0);
  });

// Also handle `bob help` and `bob --help` with no command
program
  .command('help')
  .description('Display help for Bob\'s CLI')
  .action(() => {
    printCustomHelp();
  });

function printCustomHelp(): void {
  console.log('');
  console.log(BRAND_PRIMARY('  ◉ Bob\'s CLI') + MUTED(' — Your AI Engineering Partner, In Your Terminal.'));
  console.log('');
  console.log(chalk.white('  Common commands:'));
  console.log('');
  console.log(BRAND_SECONDARY('    bob chat "message"'));
  console.log(MUTED('      Chat with Bob — code-friendly engineering partner with file awareness.'));
  console.log('');
  console.log(BRAND_SECONDARY('    bob consult "message"'));
  console.log(MUTED('      Strategic advice only — no code, just architectural guidance.'));
  console.log('');
  console.log(BRAND_SECONDARY('    bob index'));
  console.log(MUTED('      Index your project — generates summaries and dependency map for context.'));
  console.log('');
  console.log(chalk.white('  Usage: ') + INFO('bob <command> [arguments]'));
  console.log('');

  // ─── GLOBAL OPTIONS ───
  console.log(chalk.white('  Global options:'));
  console.log(MUTED('    -h, --help          Print this usage information.'));
  console.log(MUTED('    -V, --version       Output the version number.'));
  console.log('');

  // ─── AVAILABLE COMMANDS ───
  console.log(chalk.white('  Available commands:'));
  console.log('');

  // ─── CONVERSATION ───
  console.log(INFO('  Conversation'));
  printCmd('chat [message]', 'Chat with Bob — code-friendly engineering partner');
  printCmd('consult [message]', 'Strategic advice only, no code output');
  printCmd('conversations', 'List, search, and join existing conversations');
  printCmd('fork <title>', 'Branch conversation into a focused sub-project');
  printCmd('forks', 'List all forks of the current conversation');
  printCmd('deepdive', 'Sandboxed exploration on a specific Bob message');
  printCmd('deepdives', 'List all deep dives in the current conversation');
  printCmd('deepdives-join', 'Re-enter an existing deep dive');
  console.log('');

  // ─── PROJECT TOOLS ───
  console.log(SUCCESS('  Project Tools'));
  printCmd('index', 'Index your project — AI-powered summaries + dependency map');
  printCmd('analyse', 'Full QA code review — bugs, features, improvements, upgrades');
  printCmd('analyse --auto', 'Auto-fix mode — Bob triages, MiniBob implements');
  printCmd('autonomy', 'Full autonomous repair across entire codebase');
  printCmd('push <message>', 'Git stage + commit + push in one command');
  console.log('');

  // ─── REMOTE (SOVEREIGNLINK) ───
  console.log(BRAND_PRIMARY('  Remote (SovereignLink)'));
  printCmd('serve', 'Start Active Bob — receive commands from any device');
  printCmd('remote [type] [msg]', 'Send commands to a remote Active Bob');
  console.log('');

  // ─── PROFILE & IDENTITY ───
  console.log(MODE_CONSULTANT('  Profile & Identity'));
  printCmd('profile', 'View your behavioral DNA dashboard');
  printCmd('profile --cloud', 'Generate cloud-powered daily profile');
  printCmd('userbob', 'Launch your UserBob digital twin');
  printCmd('byok', 'Manage Bring Your Own Key configuration');
  printCmd('command-center', 'Autonomous Command Center — inspect and approve tasks');
  printCmd('cc', 'Alias for command-center');
  console.log('');

  // ─── CONFIGURATION ───
  console.log(MUTED('  Configuration'));
  printCmd('config show', 'Display current configuration');
  printCmd('config set <key> <val>', 'Update a configuration value');
  printCmd('login', 'Authenticate with Bob\'s Workshop via browser');
  printCmd('logout', 'Sign out and clear stored credentials');
  printCmd('whoami', 'Show current auth status and project info');
  console.log('');

  // ─── INTERACTIVE SLASH COMMANDS ───
  console.log(chalk.white('  Interactive slash commands ') + MUTED('(inside a chat/consult session):'));
  console.log('');
  printCmd('/exit', 'End the session');
  printCmd('/new', 'Start a fresh conversation');
  printCmd('/clear', 'Clear the terminal');
  printCmd('/include <path>', 'Load a file into active context');
  printCmd('/delete <path>', 'Delete a file (with backup)');
  printCmd('/deepdive', 'Deep dive on the last Bob message');
  printCmd('/constraints', 'View active negative constraints');
  console.log('');

  // ─── FOOTER ───
  console.log(MUTED('  ─────────────────────────────────────────────────────────────────'));
  console.log('');
  console.log(MUTED('  Run ') + INFO('bob <command> --help') + MUTED(' for details on a specific command.'));
  console.log('');
  console.log(MUTED('  📖 Full docs:'));
  console.log(INFO('    https://seedling-io.gitbook.io/bob-cli/bobs-cli-product-wiki-and-user-guide/command-reference'));
  console.log('');
  console.log(MUTED('  Built by ') + BRAND_PRIMARY('Bob\'s Workshop') + MUTED(' — A Seedling Company.'));
  console.log('');
}

function printCmd(cmd: string, desc: string): void {
  const padded = cmd.padEnd(24);
  console.log(BRAND_SECONDARY(`    ${padded}`) + MUTED(desc));
}

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

registerConfigCommand(program);
registerChatCommand(program);
registerConsultCommand(program);
registerIndexCommand(program);
registerLoginCommand(program);
registerPushCommand(program);
registerByokCommand(program);
registerConversationsCommand(program);
registerForkCommand(program);
registerDeepDiveCommand(program);
registerAnalyseCommand(program);
registerAutonomyCommand(program);
registerServeCommand(program);
registerRemoteCommand(program);
registerProfileCommand(program);
registerUserBobCommand(program);
registerCommandCenterCommand(program);

// ─── GLOBAL ERROR BOUNDARY ───
process.on('uncaughtException', (error) => {
  console.error('');
  console.error(chalk.hex('#EF5350')('  ❌ An unexpected error occurred.'));
  console.error(chalk.hex('#78909C')(`     ${error.message || 'Unknown error'}`));
  console.error('');
  console.error(chalk.hex('#78909C')('  If this persists, please report it:'));
  console.error(chalk.hex('#26C6DA')('    https://github.com/bobsworkshop/bob-cli/issues'));
  console.error('');
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('');
  console.error(chalk.hex('#EF5350')('  ❌ An unexpected error occurred.'));
  console.error(chalk.hex('#78909C')(`     ${reason?.message || reason || 'Unknown error'}`));
  console.error('');
  console.error(chalk.hex('#78909C')('  If this persists, please report it:'));
  console.error(chalk.hex('#26C6DA')('    https://github.com/bobsworkshop/bob-cli/issues'));
  console.error('');
  process.exit(1);
});

program.parse();