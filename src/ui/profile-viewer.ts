import chalk from 'chalk';
import inquirer from 'inquirer';
import { renderProfileDashboard, ProfileViewOptions, ProfileScope, DailySection, WeeklySection, MonthlySection } from './profile-dashboard.js';
import { renderProfileTrends } from './profile-trends.js';

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

function topRule(): string {
  return BORDER('  ╔' + '═'.repeat(BOX_WIDTH) + '╗');
}

function botRule(): string {
  return BORDER('  ╚' + '═'.repeat(BOX_WIDTH) + '╝');
}

function hRule(): string {
  return BORDER('  ╠' + '═'.repeat(BOX_WIDTH) + '╣');
}

function row(content: string): string {
  return BORDER('  ║ ') + pad(content) + BORDER(' ║');
}

function emptyRow(): string {
  return BORDER('  ║') + ' '.repeat(BOX_WIDTH) + BORDER('║');
}

// ─── MAIN INTERACTIVE VIEWER ──────────────────────────────────────────────────

export async function runProfileViewer(): Promise<void> {

  // ─── Step 1: Scope selection ───
  console.log('');
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('🧬  PROFILE VIEWER')));
  console.log(row(MUTED('Your DNA — explore by scope, section, and display mode.')));
  console.log(botRule());
  console.log('');

  const { scope } = await inquirer.prompt([
    {
      type:    'select',
      name:    'scope',
      message: BRAND_SECONDARY('  What scope would you like to view?'),
      choices: [
        {
          name:  INFO('  🗓  All') + MUTED('                  — daily + weekly + monthly'),
          value: 'all',
          short: 'All',
        },
        {
          name:  INFO('  📅  Daily') + MUTED('               — today\'s profile'),
          value: 'daily',
          short: 'Daily',
        },
        {
          name:  MODE_CONSULTANT('  📊  Weekly') + MUTED('              — this week\'s synthesis'),
          value: 'weekly',
          short: 'Weekly',
        },
        {
          name:  GOLD('  🏆  Monthly') + MUTED('             — monthly DNA'),
          value: 'monthly',
          short: 'Monthly',
        },
        {
          name:  BRAND_PRIMARY('  📈  Trends') + MUTED('              — sparkline trend view'),
          value: 'trends',
          short: 'Trends',
        },
      ],
      pageSize: 6,
    },
  ]);

  // ─── Trends shortcut ───
  if (scope === 'trends') {
    const { days } = await inquirer.prompt([
      {
        type:     'select',
        name:     'days',
        message:  BRAND_SECONDARY('  How many days to view?'),
        choices:  [
          { name: MUTED('  7 days  — last week'),    value: 7,  short: '7 days'  },
          { name: MUTED('  14 days — last 2 weeks'), value: 14, short: '14 days' },
          { name: MUTED('  30 days — last month'),   value: 30, short: '30 days' },
        ],
        pageSize: 3,
      },
    ]);

    await renderProfileTrends(days);
    return;
  }

  // ─── Step 2: Section selection ───
  let dailySection:   DailySection   = 'all';
  let weeklySection:  WeeklySection  = 'all';
  let monthlySection: MonthlySection = 'all';

  if (scope === 'daily') {
    const { section } = await inquirer.prompt([
      {
        type:    'select',
        name:    'section',
        message: BRAND_SECONDARY('  Which section?'),
        choices: [
          { name: INFO('  ◉  Everything'),                          value: 'all',       short: 'Everything'  },
          { name: MUTED('  ▸  Decision profile') + MUTED('    — archetype, psychological state'), value: 'decision',  short: 'Decision'    },
          { name: MUTED('  ▸  Emotions')         + MUTED('         — primary, social, cognitive'), value: 'emotions',  short: 'Emotions'    },
          { name: MUTED('  ▸  Mood')             + MUTED('             — unified mood, score'),    value: 'mood',      short: 'Mood'        },
          { name: MUTED('  ▸  Behavioral')       + MUTED('       — work style, productivity'),     value: 'behavioral',short: 'Behavioral'  },
        ],
        pageSize: 6,
      },
    ]);
    dailySection = section;

  } else if (scope === 'weekly') {
    const { section } = await inquirer.prompt([
      {
        type:    'select',
        name:    'section',
        message: BRAND_SECONDARY('  Which section?'),
        choices: [
          { name: INFO('  ◉  Everything'),                             value: 'all',       short: 'Everything' },
          { name: MUTED('  ▸  Decision profile') + MUTED('    — archetype, edge score, grit'),   value: 'decision',  short: 'Decision'   },
          { name: MUTED('  ▸  Behavioral')       + MUTED('       — work style, resilience'),      value: 'behavioral',short: 'Behavioral' },
          { name: MUTED('  ▸  Strategic')        + MUTED('        — wins, misses, blind spots'),  value: 'strategic', short: 'Strategic'  },
          { name: MUTED('  ▸  Summary')          + MUTED('          — week summary quote'),        value: 'summary',   short: 'Summary'    },
        ],
        pageSize: 6,
      },
    ]);
    weeklySection = section;

  } else if (scope === 'monthly') {
    const { section } = await inquirer.prompt([
      {
        type:    'select',
        name:    'section',
        message: BRAND_SECONDARY('  Which section?'),
        choices: [
          { name: INFO('  ◉  Everything'),                                  value: 'all',         short: 'Everything'  },
          { name: MUTED('  ▸  Archetype')     + MUTED('         — monthly archetype'),            value: 'archetype',  short: 'Archetype'   },
          { name: MUTED('  ▸  Trends')        + MUTED('            — grit, innovation, execution'),value: 'trends',     short: 'Trends'      },
          { name: MUTED('  ▸  Personality DNA') + MUTED('    — motivation, identity, stress'),    value: 'dna',        short: 'DNA'         },
          { name: MUTED('  ▸  State')         + MUTED('             — confidence, resilience, burnout'), value: 'state', short: 'State'     },
          { name: MUTED('  ▸  Predictions')   + MUTED('       — next month, strategy'),           value: 'predictions',short: 'Predictions' },
          { name: MUTED('  ▸  Summary')       + MUTED('           — month summary quote'),        value: 'summary',    short: 'Summary'     },
        ],
        pageSize: 8,
      },
    ]);
    monthlySection = section;

  } else if (scope === 'all') {
    // For 'all' scope we skip section selection — show everything
  }

  // ─── Step 3: Display mode ───
  const { displayMode } = await inquirer.prompt([
    {
      type:    'select',
      name:    'displayMode',
      message: BRAND_SECONDARY('  Display mode?'),
      choices: [
        {
          name:  INFO('  ◉  Summary') + MUTED('    — truncated, fits your terminal'),
          value: 'summary',
          short: 'Summary',
        },
        {
          name:  SUCCESS('  ◉  Full') + MUTED('       — expanded, complete text'),
          value: 'full',
          short: 'Full',
        },
      ],
      pageSize: 2,
    },
  ]);

  const fullMode = displayMode === 'full';

  // ─── Render ───
  const opts: ProfileViewOptions = {
    scope:          scope as ProfileScope,
    dailySection,
    weeklySection,
    monthlySection,
    fullMode,
  };

  await renderProfileDashboard(opts);
}