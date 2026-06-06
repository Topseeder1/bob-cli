import chalk from 'chalk';
import * as path from 'path';
import { getConfig } from '../core/config-store.js';
import { loadSummaries } from '../core/project-map.js';

const AMBER = chalk.hex('#FFAB00');
const ORANGE = chalk.hex('#E66F24');
const GREEN = chalk.hex('#2E7D32');
const BLUE = chalk.hex('#42A5F5');
const DARK_BG = chalk.bgHex('#222C22');

/**
 * Renders the session header for interactive mode.
 * Clean, informative, branded.
 */
export function renderSessionHeader(mode: 'chat' | 'consult'): void {
  const config = getConfig();
  const projectName = path.basename(process.cwd());
  const summaries = loadSummaries(process.cwd());
  const fileCount = summaries ? Object.keys(summaries).length : 0;
  const isIndexed = fileCount > 0;

  const modeLabel = mode === 'chat' ? '🤖 Code Mode' : '🎯 Consultant Mode';
  const modeColor = mode === 'chat' ? chalk.cyan : chalk.magenta;

  console.log('');
  console.log(DARK_BG(chalk.gray('   ╭──────────────────────────────────────────────╮')));
  console.log(DARK_BG(chalk.gray('   │  ') + ORANGE('◉') + AMBER(' BOB CLI') + chalk.gray('  v0.1.0') + chalk.gray('                          │')));
  console.log(DARK_BG(chalk.gray('   │  ') + modeColor(modeLabel) + chalk.gray('                               │')));
  console.log(DARK_BG(chalk.gray('   ╰──────────────────────────────────────────────╯')));
  console.log('');

  // Status line
  const projectStatus = isIndexed
    ? GREEN(`  📚 ${projectName}`) + chalk.gray(` (${fileCount} files indexed)`)
    : chalk.yellow(`  ⚠️  ${projectName}`) + chalk.gray(' (not indexed — run `bob index`)');

  console.log(projectStatus);

  if (config.loggedIn && config.tier === 'platform') {
    console.log(BLUE(`  📡 ${config.email}`) + chalk.gray(` · Tier 3 · Provider: ${config.provider || 'default'}`));
  } else {
    console.log(chalk.gray(`  🔒 Local-first (Tier 1) · Provider: ${config.provider || 'not set'}`));
  }

  console.log('');
  console.log(chalk.gray('  ─────────────────────────────────────────────────'));

  // Commands
  if (mode === 'chat') {
    console.log(chalk.gray('  /exit · /new · /clear · /include · /delete · /deepdive'));
  } else {
    console.log(chalk.gray('  /exit · /new · /clear · /include'));
  }

  console.log(chalk.gray('  ─────────────────────────────────────────────────'));
  console.log('');
}