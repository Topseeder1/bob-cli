import chalk from 'chalk';
import inquirer from 'inquirer';
import { HELP_DATA, CategoryEntry, CommandEntry } from './help-data.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY    = chalk.hex('#E66F24');
const BRAND_SECONDARY  = chalk.hex('#FFAB00');
const SUCCESS          = chalk.hex('#66BB6A');
const INFO             = chalk.hex('#26C6DA');
const WARNING          = chalk.hex('#FFC107');
const ERROR            = chalk.hex('#EF5350');
const MUTED            = chalk.hex('#78909C');
const BORDER           = chalk.hex('#455A64');
const MODE_CONSULTANT  = chalk.hex('#AB47BC');
const GOLD             = chalk.hex('#FFD700');

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

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let   currentLine     = '';
  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// ─── CATEGORY COLOR MAP ──────────────────────────────────────────

function categoryColor(label: string): chalk.Chalk {
  switch (label) {
    case 'Conversation':            return INFO;
    case 'Project Tools':           return SUCCESS;
    case 'The Crew':                return BRAND_PRIMARY;
    case 'VaultBob':                return GOLD;
    case 'UserBob':                 return MODE_CONSULTANT;
    case 'Profile & Identity':      return chalk.hex('#CE93D8');
    case 'Remote — SovereignLink™': return INFO;
    case 'Configuration':           return MUTED;
    default:                        return MUTED;
  }
}

// ─── STATIC CATEGORY REFERENCE CARD ─────────────────────────────

function renderCategoryReferenceCard(): void {
  const LABEL_WIDTH = 22;
  const DESC_WIDTH  = 36;

  console.log('');
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('◉  BOB\'S CLI') + MUTED('  ·  Interactive Help')));
  console.log(row(MUTED('Your AI Engineering Partner — In Your Terminal')));
  console.log(hRule());

  for (const cat of HELP_DATA.categories) {
    const color        = categoryColor(cat.label);
    const commandCount = cat.commands.length;
    const labelStr     = color(`${cat.icon}  ${cat.label}`).padEnd(LABEL_WIDTH);
    const countStr     = MUTED(`${commandCount} cmd${commandCount !== 1 ? 's' : ''} `);
    const descStr      = MUTED(cat.description.slice(0, DESC_WIDTH) + (cat.description.length > DESC_WIDTH ? '...' : ''));
    console.log(row(`${labelStr}  ${countStr} ${descStr}`));
  }

  console.log(emptyRow());
  console.log(row(MUTED('▸ Arrow keys to navigate  ·  Enter to select  ·  Ctrl+C to exit')));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}

// ─── STATIC COMMAND REFERENCE CARD ──────────────────────────────

function renderCommandReferenceCard(category: CategoryEntry): void {
  const color = categoryColor(category.label);
  const CMD_WIDTH  = 24;
  const DESC_WIDTH = 34;

  console.log('');
  console.log(topRule());
  console.log(row(color(`${category.icon}  ${category.label.toUpperCase()}`)));
  console.log(row(MUTED(category.description)));
  console.log(hRule());

  for (const cmd of category.commands) {
    const nameStr = BRAND_SECONDARY(cmd.name.padEnd(CMD_WIDTH));
    const descStr = MUTED(cmd.brief.slice(0, DESC_WIDTH) + (cmd.brief.length > DESC_WIDTH ? '...' : ''));
    console.log(row(`▸ ${nameStr}  ${descStr}`));
    if (cmd.alias) {
      console.log(row(MUTED(`  alias: ${cmd.alias}`)));
    }
  }

  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}

// ─── COMMAND DETAIL VIEW ─────────────────────────────────────────

function renderCommandDetail(cmd: CommandEntry, categoryLabel: string): void {
  const color = categoryColor(categoryLabel);

  console.log('');
  console.log(topRule());
  console.log(row(color(`◉  ${cmd.name.toUpperCase()}`)));
  if (cmd.alias) {
    console.log(row(MUTED(`   alias: ${cmd.alias}`)));
  }
  console.log(hRule());

  // ─── Brief ───
  console.log(row(chalk.white.bold(cmd.brief)));
  console.log(emptyRow());

  // ─── Description ───
  console.log(row(MUTED('▸ What it does')));
  const descLines = wrapText(cmd.description, BOX_WIDTH - 6);
  for (const line of descLines) {
    console.log(row(chalk.white(`  ${line}`)));
  }
  console.log(emptyRow());

  // ─── Usage ───
  console.log(row(MUTED('▸ Usage')));
  for (const u of cmd.usage) {
    console.log(row(BRAND_SECONDARY(`  ${u.command}`)));
    console.log(row(MUTED(`    → ${u.description}`)));
  }
  console.log(emptyRow());

  // ─── Flags ───
  if (cmd.flags && cmd.flags.length > 0) {
    console.log(row(MUTED('▸ Supported values')));
    for (const f of cmd.flags) {
      console.log(row(INFO(`  ${f.flag}`)));
      console.log(row(MUTED(`    → ${f.description}`)));
    }
    console.log(emptyRow());
  }

  // ─── Slash commands ───
  if (cmd.slashCommands && cmd.slashCommands.length > 0) {
    console.log(row(MUTED('▸ Slash commands')));
    for (const s of cmd.slashCommands) {
      console.log(row(SUCCESS(`  ${s.command}`)));
      console.log(row(MUTED(`    → ${s.description}`)));
    }
    console.log(emptyRow());
  }

  // ─── Tier ───
  console.log(hRule());
  console.log(row(MUTED('▸ Tier:  ') + chalk.white(cmd.tier)));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}

// ─── SUPPORT VIEW ────────────────────────────────────────────────

function renderSupportView(): void {
  console.log('');
  console.log(topRule());
  console.log(row(SUCCESS('◉  COMMUNITY & SUPPORT')));
  console.log(hRule());
  console.log(emptyRow());
  console.log(row(MUTED('▸ Documentation')));
  console.log(row(INFO(`  ${HELP_DATA.links.gitbook}`)));
  console.log(emptyRow());
  console.log(row(MUTED('▸ Discord — Live community help')));
  console.log(row(MODE_CONSULTANT(`  ${HELP_DATA.links.discord}`)));
  console.log(emptyRow());
  console.log(row(MUTED('▸ Web App')));
  console.log(row(chalk.white(`  ${HELP_DATA.links.web}`)));
  console.log(emptyRow());
  console.log(row(MUTED('▸ npm')));
  console.log(row(chalk.white(`  ${HELP_DATA.links.npm}`)));
  console.log(emptyRow());
  console.log(hRule());
  console.log(row(MUTED('Built by Bob\'s Workshop — A Seedling Company 🌱')));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}

// ─── CATEGORY VIEW ───────────────────────────────────────────────

async function renderCategoryView(category: CategoryEntry): Promise<void> {
  let inCategory = true;

  while (inCategory) {

    // ─── Static reference card — renders once above the prompt ───
    renderCommandReferenceCard(category);

    // ─── Command selector — short names only, no wrapping risk ───
    const choices: any[] = category.commands.map(cmd => ({
      name:  BRAND_SECONDARY(`  ▸ ${cmd.name}`),
      value: cmd.name,
      short: cmd.name,
    }));

    choices.push(new inquirer.Separator(MUTED('  ' + '─'.repeat(40))));
    choices.push({
      name:  MUTED('  ↩  Back to categories'),
      value: '__back__',
      short: 'Back',
    });

    const { selected } = await inquirer.prompt([
      {
        type:     'select',
        name:     'selected',
        message:  categoryColor(category.label)(`  Select a command:`),
        choices,
        pageSize: 12,
      },
    ]);

    if (selected === '__back__') {
      inCategory = false;
      break;
    }

    const cmd = category.commands.find(c => c.name === selected);
    if (!cmd) continue;

    // ─── Full command detail ───
    renderCommandDetail(cmd, category.label);

    // ─── Navigation after detail ───
    const { next } = await inquirer.prompt([
      {
        type:    'select',
        name:    'next',
        message: MUTED('  What next?'),
        choices: [
          { name: MUTED(`  ↩  Back to ${category.label}`), value: 'back',       short: 'Back'       },
          { name: MUTED('  ↩  Back to categories'),         value: 'categories', short: 'Categories' },
          { name: MUTED('  ✕  Exit help'),                  value: 'exit',       short: 'Exit'       },
        ],
      },
    ]);

    if (next === 'exit') {
      process.exit(0);
    } else if (next === 'categories') {
      inCategory = false;
      break;
    }
    // 'back' loops — re-renders the command reference card + selector
  }
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────

export async function runInteractiveHelp(): Promise<void> {

  // ─── Render category reference card ONCE at startup ───
  renderCategoryReferenceCard();

  let running = true;

  while (running) {

    // ─── Category selector — short names + command count only ───
    const categoryChoices: any[] = HELP_DATA.categories.map(cat => {
      const color        = categoryColor(cat.label);
      const commandCount = cat.commands.length;
      return {
        name:  color(`  ${cat.icon}  ${cat.label.padEnd(26)}`) + MUTED(`${commandCount} command${commandCount !== 1 ? 's' : ''}`),
        value: cat.label,
        short: cat.label,
      };
    });

    categoryChoices.push(new inquirer.Separator(MUTED('  ' + '─'.repeat(40))));
    categoryChoices.push({
      name:  SUCCESS('  ◉  Community & Support'),
      value: '__support__',
      short: 'Support',
    });
    categoryChoices.push({
      name:  MUTED('  ✕  Exit help'),
      value: '__exit__',
      short: 'Exit',
    });

    const { selectedCategory } = await inquirer.prompt([
      {
        type:     'select',
        name:     'selectedCategory',
        message:  BRAND_PRIMARY('  Select a category:'),
        choices:  categoryChoices,
        pageSize: 12,
      },
    ]);

    if (selectedCategory === '__exit__') {
      running = false;
      break;
    }

    if (selectedCategory === '__support__') {
      renderSupportView();
      // ─── Re-render reference card after support view ───
      renderCategoryReferenceCard();
      continue;
    }

    const category = HELP_DATA.categories.find(c => c.label === selectedCategory);
    if (!category) continue;

    await renderCategoryView(category);

    // ─── Re-render reference card when returning from a category ───
    renderCategoryReferenceCard();
  }

  console.log('');
  console.log(MUTED('  👋 Exiting help. Happy building!'));
  console.log('');
}