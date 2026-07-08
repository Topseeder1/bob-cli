import chalk from 'chalk';
import { HELP_DATA } from './help-data.js';

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
const GOLD            = chalk.hex('#FFD700');

// ─── LAYOUT HELPERS ───
const BOX_WIDTH = 70;

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

// ─── CATEGORY COLOR MAP ──────────────────────────────────────────

function categoryColor(label: string): chalk.Chalk {
  switch (label) {
    case 'Conversation':           return INFO;
    case 'Project Tools':          return SUCCESS;
    case 'The Crew':               return BRAND_PRIMARY;
    case 'VaultBob':               return GOLD;
    case 'UserBob':                return MODE_CONSULTANT;
    case 'Profile & Identity':     return chalk.hex('#CE93D8');
    case 'Remote — SovereignLink™': return INFO;
    case 'Configuration':          return MUTED;
    default:                       return MUTED;
  }
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────

export function renderHelp(version: string = '1.4.1'): void {
  console.log('');

  // ─── Header ───
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('◉  BOB\'S CLI') + MUTED(`  ·  v${version}`)));
  console.log(row(MUTED('Your AI Engineering Partner — In Your Terminal')));
  console.log(hRule());
  console.log(row(MUTED('Usage: ') + chalk.white('bob <command> [options]')));
  console.log(row(MUTED('Help:  ') + chalk.white('bob help') + MUTED('  ·  ') + chalk.white('bob help --interactive')));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');

  // ─── Categories ───
  for (const category of HELP_DATA.categories) {
    const color = categoryColor(category.label);

    console.log(topRule());
    console.log(row(color(`${category.icon}  ${category.label.toUpperCase()}`)));
    console.log(row(MUTED(category.description)));
    console.log(hRule());

    for (const cmd of category.commands) {
      console.log(row(
        BRAND_SECONDARY(cmd.name.padEnd(28)) +
        chalk.white(cmd.brief)
      ));
      if (cmd.alias) {
        console.log(row(MUTED(`   alias: ${cmd.alias}`)));
      }
    }

    console.log(emptyRow());
    console.log(botRule());
    console.log('');
  }

  // ─── Quick reference ───
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('⚡  QUICK REFERENCE')));
  console.log(hRule());
  console.log(row(MUTED('▸ Local setup (free, zero config):')));
  console.log(row(chalk.white('    bob chat "hello"                     — auto-detects Ollama')));
  console.log(emptyRow());
  console.log(row(MUTED('▸ Platform setup (Tier 3):')));
  console.log(row(chalk.white('    bob login                            — authenticate')));
  console.log(row(chalk.white('    bob chat "help me refactor this"     — cloud-powered chat')));
  console.log(emptyRow());
  console.log(row(MUTED('▸ First-time project setup:')));
  console.log(row(chalk.white('    bob index                            — index your codebase')));
  console.log(row(chalk.white('    bob analyse                          — full QA review')));
  console.log(row(chalk.white('    bob analyse --auto                   — auto-fix issues')));
  console.log(emptyRow());
  console.log(row(MUTED('▸ Autonomous engineering:')));
  console.log(row(chalk.white('    bob agent spawn builder "Build"      — spawn an agent')));
  console.log(row(chalk.white('    bob agent-run "Add authentication"   — launch a mission')));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');

  // ─── Community + support ───
  console.log(topRule());
  console.log(row(SUCCESS('◉  COMMUNITY & SUPPORT')));
  console.log(hRule());
  console.log(row(MUTED('▸ Docs:      ') + INFO(HELP_DATA.links.gitbook)));
  console.log(row(MUTED('▸ Discord:   ') + MODE_CONSULTANT(HELP_DATA.links.discord)));
  console.log(row(MUTED('▸ Web App:   ') + MUTED(HELP_DATA.links.web)));
  console.log(row(MUTED('▸ npm:       ') + MUTED(HELP_DATA.links.npm)));
  console.log(emptyRow());
  console.log(row(MUTED('▸ Interactive help:  ') + chalk.white('bob help --interactive')));
  console.log(row(MUTED('▸ Command detail:    ') + chalk.white('bob help --interactive → select any command')));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}