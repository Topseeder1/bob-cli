import chalk from 'chalk';
import * as path from 'path';
import { getConfig } from '../core/config-store.js';
import { loadSummaries } from '../core/project-map.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY   = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS         = chalk.hex('#66BB6A');
const INFO            = chalk.hex('#26C6DA');
const WARNING         = chalk.hex('#FFC107');
const ERROR           = chalk.hex('#EF5350');
const MUTED           = chalk.hex('#78909C');

const MODE_CHAT         = chalk.hex('#26C6DA');
const MODE_DEEPDIVE     = chalk.hex('#0097A7');
const MODE_CONSULTANT   = chalk.hex('#AB47BC');
const MODE_PERSONALIZED = chalk.hex('#CE93D8');

const BOX_WIDTH = 50; // inner content width (between ║ chars)

function hRule(): string {
  return MUTED('  ╠' + '═'.repeat(BOX_WIDTH) + '╣');
}

function pad(content: string, visibleLen: number): string {
  const remaining = BOX_WIDTH - visibleLen;
  return content + ' '.repeat(Math.max(0, remaining));
}

export function renderSessionHeader(mode: 'chat' | 'consult' | 'personalized'): void {
  const config = getConfig();
  const projectName = path.basename(process.cwd());
  const summaries = loadSummaries(process.cwd());
  const fileCount = summaries ? Object.keys(summaries).length : 0;
  const isIndexed = fileCount > 0;

  const modeConfig = {
    chat:         { label: '⚡ Chat Mode',        color: MODE_CHAT,         icon: '◆' },
    consult:      { label: '◎ Consultant Mode',   color: MODE_CONSULTANT,   icon: '◎' },
    personalized: { label: '✦ Personalized Mode', color: MODE_PERSONALIZED, icon: '✦' },
  }[mode];

  const mc = modeConfig.color;

  // Header
  console.log('');
  console.log(MUTED('  ╔' + '═'.repeat(BOX_WIDTH) + '╗'));

  // Brand line
  const brandText = `  ${BRAND_PRIMARY('◉ BOB')}${BRAND_SECONDARY("'S CLI")}  ·  ${mc(modeConfig.label)}`;
  const brandVisible = `  ◉ BOB'S CLI  ·  ${modeConfig.label}`;
  console.log(MUTED('  ║') + pad(brandText, brandVisible.length) + MUTED('║'));

  console.log(hRule());

  // Project / index status
  const indexLabel = isIndexed
    ? SUCCESS(`  📚 ${projectName}`) + MUTED(` · ${fileCount} files indexed`)
    : WARNING(`  ⚠  ${projectName}`) + MUTED(' · run `bob index`');
  const indexVisible = isIndexed
    ? `  📚 ${projectName} · ${fileCount} files indexed`
    : `  ⚠  ${projectName} · run \`bob index\``;
  console.log(MUTED('  ║') + pad(indexLabel, indexVisible.length) + MUTED('║'));

  // Auth / tier row
  const tierLabel = config.loggedIn && config.tier === 'platform'
    ? INFO(`  📡 ${config.email}`) + MUTED(` · Tier 3 · ${config.provider || 'default'}`)
    : MUTED(`  🔒 Local  ·  Tier 1  ·  ${config.provider || 'not set'}`);
  const tierVisible = config.loggedIn && config.tier === 'platform'
    ? `  📡 ${config.email} · Tier 3 · ${config.provider || 'default'}`
    : `  🔒 Local  ·  Tier 1  ·  ${config.provider || 'not set'}`;
  console.log(MUTED('  ║') + pad(tierLabel, tierVisible.length) + MUTED('║'));

  console.log(MUTED('  ╚' + '═'.repeat(BOX_WIDTH) + '╝'));
  console.log('');

  // Command hints
  const hints = mode === 'chat'
    ? MUTED('  ▸ /exit  /new  /clear  /include  /delete  /deepdive')
    : MUTED('  ▸ /exit  /new  /clear  /include');

  console.log(hints);
  console.log('');
}