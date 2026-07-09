import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import inquirer from 'inquirer';
import { getConfig, setConfigValue } from '../src/core/config-store.js';
import { getActiveConversationId, setActiveConversationId } from '../src/core/project-map.js';
import { callCloudFunction } from '../src/core/api-client.js';
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
import { registerBackupCommand } from '../src/commands/backup.js';
import { registerAgentCommand } from '../src/commands/agent.js';
import { registerAgentRunCommand } from '../src/commands/agent-run.js';
import { registerUserBobCommand } from '../src/commands/userbob.js';
import { registerCommandCenterCommand } from '../src/commands/command-center.js';
import { renderHelp } from '../src/ui/help.js';
import { runInteractiveHelp } from '../src/ui/help-interactive.js';

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

// ═══════════════════════════════════════════════════════════════════
// ERROR BOUNDARIES
// ═══════════════════════════════════════════════════════════════════

process.on('uncaughtException', (error: Error) => {
  console.log('');
  console.log(topRule());
  console.log(row(ERROR('❌  Something went wrong')));
  console.log(hRule());
  console.log(row(MUTED(`▸ ${error.message?.slice(0, 56) || 'Unknown error'}`)));
  console.log(emptyRow());
  console.log(row(MUTED('▸ Run `bob whoami` to check your configuration')));
  console.log(row(MUTED('▸ Run `bob login` if authentication has expired')));
  console.log(row(MUTED('▸ Docs: https://seedling-io.gitbook.io/bob-cli')));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  const message = reason?.message || String(reason) || 'Unknown error';
  console.log('');
  console.log(topRule());
  console.log(row(ERROR('❌  Something went wrong')));
  console.log(hRule());
  console.log(row(MUTED(`▸ ${message?.slice(0, 56)}`)));
  console.log(emptyRow());
  console.log(row(MUTED('▸ Run `bob whoami` to check your configuration')));
  console.log(row(MUTED('▸ Run `bob login` if authentication has expired')));
  console.log(row(MUTED('▸ Docs: https://seedling-io.gitbook.io/bob-cli')));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');
  process.exit(1);
});

// ═══════════════════════════════════════════════════════════════════
// PROGRAM
// ═══════════════════════════════════════════════════════════════════

const program = new Command();

program
  .name('bob')
  .description('Bob\'s CLI — AI coding assistant and Forge orchestrator')
  .version('1.5.1');

program.helpOption(false);

// ═══════════════════════════════════════════════════════════════════
// WHOAMI
// ═══════════════════════════════════════════════════════════════════

program
  .command('whoami')
  .description('Show current status and configuration')
  .option('--config', 'Open interactive settings panel')
  .action(async (options: { config?: boolean }) => {
    const config         = getConfig();
    const projectName    = path.basename(process.cwd());
    const projectPath    = process.cwd();
    const projectConvoId = getActiveConversationId(process.cwd());
    const globalConvoId  = config.conversationId;
    const activeConvoId  = projectConvoId || globalConvoId;
    const sessionSource  = projectConvoId ? 'project' : globalConvoId ? 'global' : null;
    const isLoggedIn     = config.loggedIn && config.authToken;
    const tierLabel      = config.tier === 'platform' ? 'Platform (Tier 3)' : 'Local-first (Tier 1)';
    const providerLabel  = config.provider || 'Not configured';
    const modeLabel      = config.personalizationMode
      ? 'Personalized'
      : config.consultantMode
        ? 'Consultant'
        : 'Standard';

    console.log('');
    console.log(topRule());
    console.log(row(BRAND_PRIMARY('◉  BOB\'S CLI') + MUTED(`  ·  v${program.version()}`)));
    console.log(hRule());
    console.log(row(
      MUTED('▸ Status:    ') +
      (isLoggedIn
        ? SUCCESS('Logged in as ') + chalk.white(config.email || '')
        : ERROR('Not logged in'))
    ));
    console.log(row(MUTED('▸ Tier:      ') + chalk.white(tierLabel)));
    console.log(row(MUTED('▸ Provider:  ') + chalk.white(providerLabel)));
    console.log(row(MUTED('▸ Mode:      ') + chalk.white(modeLabel)));
    console.log(row(MUTED('▸ IDRP:      ') + chalk.white(config.idrp ? 'Enabled' : 'Disabled')));
    console.log(hRule());
    console.log(row(MUTED('▸ Project:   ') + chalk.white(projectName)));
    console.log(row(MUTED('▸ Path:      ') + MUTED(projectPath)));
    if (activeConvoId) {
      console.log(row(
        MUTED('▸ Session:   ') +
        INFO(activeConvoId.slice(0, 28) + '...') +
        MUTED(`  (${sessionSource})`)
      ));
      if (isLoggedIn && config.provider !== 'local') {
        console.log(row(
          MUTED('▸ Web:       ') +
          MUTED(`https://bobs-workshop.web.app/#/bobcodeassistant/${activeConvoId.slice(0, 16)}...`)
        ));
      }
    } else {
      console.log(row(MUTED('▸ Session:   ') + MUTED('None — run `bob conversations join` or `bob chat`')));
    }
    console.log(hRule());
    if (!isLoggedIn) {
      console.log(row(BRAND_SECONDARY('▸ bob login                — connect to platform')));
      console.log(row(MUTED('▸ bob chat "hello"         — start chatting locally')));
    } else if (!activeConvoId) {
      console.log(row(BRAND_SECONDARY('▸ bob conversations join   — resume a conversation')));
      console.log(row(MUTED('▸ bob chat "hello"         — start a new conversation')));
    } else {
      console.log(row(BRAND_SECONDARY('▸ bob whoami --config      — open settings panel')));
      console.log(row(MUTED('▸ bob help --interactive   — explore all commands')));
    }
    console.log(emptyRow());
    console.log(botRule());
    console.log('');

    if (options.config) {
      await runConfigPanel(config);
    }
  });

// ═══════════════════════════════════════════════════════════════════
// CONFIG PANEL — SETTINGS ONLY
// ═══════════════════════════════════════════════════════════════════

async function runConfigPanel(config: any): Promise<void> {
  let running = true;

  // ─── Load personas ───
  let personaList: { id: string; name: string; description?: string }[] = [];
  try {
    const { listAvailablePersonas } = await import('../src/ai/personas/persona-loader.js');
    personaList = listAvailablePersonas() || [];
  } catch {
    personaList = [
      { id: 'local:architectBob',  name: 'architectBob',  description: 'Contract-first, systems design'   },
      { id: 'local:builderBob',    name: 'builderBob',    description: 'Ships fast, pragmatic execution'  },
      { id: 'local:qaEngineerBob', name: 'qaEngineerBob', description: 'Testing, edge cases, reliability' },
      { id: 'local:securityBob',   name: 'securityBob',   description: 'Threat modeling, zero trust'      },
      { id: 'local:frontendBob',   name: 'frontendBob',   description: 'UI/UX, accessibility, components' },
      { id: 'local:backendBob',    name: 'backendBob',    description: 'APIs, reliability, idempotency'   },
      { id: 'local:devopsBob',     name: 'devopsBob',     description: 'CI/CD, infrastructure, pipelines' },
    ];
  }

  while (running) {

    // ─── Static current-values card ───
    console.log('');
    console.log(topRule());
    console.log(row(BRAND_PRIMARY('⚙️   SETTINGS')));
    console.log(hRule());
    console.log(row(MUTED('▸ Provider:  ') + chalk.white(config.provider        || 'not set')));
    console.log(row(MUTED('▸ Endpoint:  ') + chalk.white(config.localEndpoint   ? config.localEndpoint.slice(0, 38) : 'not set')));
    console.log(row(MUTED('▸ Persona:   ') + chalk.white(config.activePersonaId || 'none')));
    console.log(row(MUTED('▸ IDRP:      ') + chalk.white(config.idrp            ? 'enabled'  : 'disabled')));
    console.log(row(MUTED('▸ Auto Mode: ') + chalk.white(config.autoMode        ? 'on'       : 'off')));
    console.log(emptyRow());
    console.log(botRule());
    console.log('');

    // ─── 5 choices + 1 exit = 6 items total — safe for Windows ───
    const { selected } = await inquirer.prompt([
      {
        type:    'select',
        name:    'selected',
        message: BRAND_SECONDARY('  What would you like to change?'),
        choices: [
          { name: BRAND_SECONDARY('  🤖  Provider'),       value: 'provider', short: 'Provider'      },
          { name: BRAND_SECONDARY('  🔗  Local Endpoint'), value: 'endpoint', short: 'Local Endpoint' },
          { name: BRAND_SECONDARY('  🎭  Active Persona'), value: 'persona',  short: 'Active Persona' },
          { name: BRAND_SECONDARY('  🔄  IDRP'),           value: 'idrp',     short: 'IDRP'           },
          { name: BRAND_SECONDARY('  🔀  Auto Mode'),      value: 'automode', short: 'Auto Mode'      },
          { name: MUTED('  ↩  Done'),                      value: '__done__', short: 'Done'           },
        ],
      },
    ]);

    if (selected === '__done__') {
      running = false;
      console.log('');
      console.log(SUCCESS('  ✅ Settings saved.'));
      console.log('');
      break;
    }

    // ─── PROVIDER ────────────────────────────────────────────────
    if (selected === 'provider') {
      console.log('');
      console.log(topRule());
      console.log(row(BRAND_SECONDARY('🤖  PROVIDER')));
      console.log(hRule());
      console.log(row(MUTED('▸ Local:    Your Ollama model — free, sovereign, offline')));
      console.log(row(MUTED('▸ Platform: Bob\'s Workshop cloud AI — Tier 3 required')));
      console.log(emptyRow());
      console.log(botRule());
      console.log('');

      const { provider } = await inquirer.prompt([
        {
          type:    'select',
          name:    'provider',
          message: BRAND_SECONDARY('  Select provider:'),
          choices: [
            { name: SUCCESS('  local    ') + MUTED('— Ollama (free, sovereign)'),    value: 'local',    short: 'local'    },
            { name: INFO('  platform ') + MUTED('— Bob\'s Workshop cloud (Tier 3)'), value: 'platform', short: 'platform' },
          ],
          default: config.provider || 'local',
        },
      ]);
      setConfigValue('provider', provider);
      config.provider = provider;
      console.log('');
      console.log(SUCCESS(`  ✅ Provider set to: ${provider}`));
      console.log('');
      continue;
    }

    // ─── ENDPOINT ────────────────────────────────────────────────
    if (selected === 'endpoint') {
      console.log('');
      console.log(topRule());
      console.log(row(BRAND_SECONDARY('🔗  LOCAL ENDPOINT')));
      console.log(hRule());
      console.log(row(MUTED('▸ The URL where your Ollama model is running.')));
      console.log(row(MUTED('▸ Default: http://127.0.0.1:11434/api/chat')));
      console.log(emptyRow());
      console.log(botRule());
      console.log('');

      const { endpoint } = await inquirer.prompt([
        {
          type:    'input',
          name:    'endpoint',
          message: BRAND_SECONDARY('  Endpoint URL:'),
          default: config.localEndpoint || 'http://127.0.0.1:11434/api/chat',
        },
      ]);
      if (endpoint.trim()) {
        setConfigValue('localEndpoint', endpoint.trim());
        config.localEndpoint = endpoint.trim();
        console.log('');
        console.log(SUCCESS(`  ✅ Endpoint set: ${endpoint.trim()}`));
        console.log('');
      }
      continue;
    }

    // ─── PERSONA ─────────────────────────────────────────────────
    if (selected === 'persona') {
      console.log('');
      console.log(topRule());
      console.log(row(BRAND_SECONDARY('🎭  ACTIVE PERSONA')));
      console.log(hRule());
      console.log(row(MUTED('▸ Shapes how Bob thinks and communicates in chat.')));
      console.log(row(MUTED('▸ Built-in personas are specialist engineers.')));
      console.log(row(MUTED('▸ Custom personas load from a local markdown file.')));
      console.log(emptyRow());
      console.log(botRule());
      console.log('');

      const personaChoices: any[] = [
        { name: MUTED('  ◉  None'), value: '', short: 'None' },
      ];

      for (const p of personaList) {
        personaChoices.push({
          name:  BRAND_SECONDARY(`  🎭  ${p.name}`),
          value: p.id,
          short: p.name,
        });
      }

      personaChoices.push({
        name:  INFO('  📄  Custom file'),
        value: '__custom__',
        short: 'Custom file',
      });

      const { selectedPersona } = await inquirer.prompt([
        {
          type:     'select',
          name:     'selectedPersona',
          message:  BRAND_SECONDARY('  Select a persona:'),
          choices:  personaChoices,
          pageSize: 10,
        },
      ]);

      if (selectedPersona === '__custom__') {
        const { customPath } = await inquirer.prompt([
          {
            type:    'input',
            name:    'customPath',
            message: BRAND_SECONDARY('  File path (e.g. ~/personas/my-persona.md):'),
            default: '',
          },
        ]);
        if (customPath.trim()) {
          const personaId = `file:${customPath.trim()}`;
          setConfigValue('activePersonaId', personaId);
          config.activePersonaId = personaId;
          console.log('');
          console.log(SUCCESS(`  ✅ Persona set to: ${personaId}`));
          console.log('');
        } else {
          console.log('');
          console.log(MUTED('  ▸ No change.'));
          console.log('');
        }
      } else {
        setConfigValue('activePersonaId', selectedPersona || null);
        config.activePersonaId = selectedPersona || null;
        console.log('');
        console.log(SUCCESS(`  ✅ Persona set to: ${selectedPersona || 'none'}`));
        console.log('');
      }
      continue;
    }

    // ─── IDRP ────────────────────────────────────────────────────
    if (selected === 'idrp') {
      console.log('');
      console.log(topRule());
      console.log(row(BRAND_SECONDARY('🔄  IDRP')));
      console.log(hRule());
      console.log(row(MUTED('▸ Intelligent Dynamic Response Personalization.')));
      console.log(row(MUTED('▸ When enabled, Bob adapts using your DNA profile.')));
      console.log(emptyRow());
      console.log(botRule());
      console.log('');

      const { idrp } = await inquirer.prompt([
        {
          type:    'select',
          name:    'idrp',
          message: BRAND_SECONDARY('  IDRP setting:'),
          choices: [
            { name: SUCCESS('  enabled  ') + MUTED('— Bob adapts to your DNA profile'), value: true,  short: 'enabled'  },
            { name: MUTED('  disabled ') + MUTED('— Standard responses'),               value: false, short: 'disabled' },
          ],
          default: config.idrp || false,
        },
      ]);
      setConfigValue('idrp', idrp);
      config.idrp = idrp;
      console.log('');
      console.log(SUCCESS(`  ✅ IDRP set to: ${idrp ? 'enabled' : 'disabled'}`));
      console.log('');
      continue;
    }

    // ─── AUTO MODE ───────────────────────────────────────────────
    if (selected === 'automode') {
      console.log('');
      console.log(topRule());
      console.log(row(BRAND_SECONDARY('🔀  AUTO MODE')));
      console.log(hRule());
      console.log(row(MUTED('▸ When on, skips all file approval prompts.')));
      console.log(row(MUTED('▸ Faster but less control over file writes.')));
      console.log(emptyRow());
      console.log(botRule());
      console.log('');

      const { autoMode } = await inquirer.prompt([
        {
          type:    'select',
          name:    'autoMode',
          message: BRAND_SECONDARY('  Auto Mode setting:'),
          choices: [
            { name: WARNING('  on  ') + MUTED('— Skip approvals (faster, less control)'), value: true,  short: 'on'  },
            { name: SUCCESS('  off ') + MUTED('— Show approvals (safer, full control)'),  value: false, short: 'off' },
          ],
          default: config.autoMode || false,
        },
      ]);
      setConfigValue('autoMode', autoMode);
      config.autoMode = autoMode;
      console.log('');
      console.log(SUCCESS(`  ✅ Auto Mode set to: ${autoMode ? 'on' : 'off'}`));
      console.log('');
      continue;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELP
// ═══════════════════════════════════════════════════════════════════

program
  .command('help')
  .description('View all commands — use --interactive for the full explorer')
  .option('--interactive', 'Launch interactive command explorer')
  .action(async (options: { interactive?: boolean }) => {
    if (options.interactive) {
      await runInteractiveHelp();
    } else {
      renderHelp(program.version() || '1.5.0');
    }
  });

// ═══════════════════════════════════════════════════════════════════
// REGISTER COMMANDS
// ═══════════════════════════════════════════════════════════════════
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
registerBackupCommand(program);
registerAgentCommand(program);
registerAgentRunCommand(program);
registerUserBobCommand(program);
registerCommandCenterCommand(program);

program.parse();