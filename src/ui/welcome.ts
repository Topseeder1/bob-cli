// File: src/ui/welcome.ts
import chalk from 'chalk';
import { getConfig, setConfigValue } from '../core/config-store.js';

// ─── DESIGN TOKENS ───────────────────────────────────────────
const BRAND_PRIMARY   = chalk.hex('#E66F24');   // Orange
const BRAND_SECONDARY = chalk.hex('#FFAB00');   // Amber
const SUCCESS         = chalk.hex('#66BB6A');   // Green
const INFO            = chalk.hex('#26C6DA');   // Cyan
const MUTED           = chalk.hex('#78909C');   // Gray
const WHITE           = chalk.white;
const MODE_CONSULTANT = chalk.hex('#AB47BC');   // Purple

const BOX_WIDTH      = 66; // inner content width (between ║ chars)
const TYPEWRITER_DELAY = 80;

// ─── HELPERS ─────────────────────────────────────────────────

/** Pads content to fill the inner box width, closing with ║ */
function pad(content: string, visibleLen: number): string {
  const spaces = BOX_WIDTH - visibleLen;
  return content + ' '.repeat(Math.max(0, spaces)) + MUTED('║');
}

/** Full-width horizontal rule using ╠═══╣ */
function hRule(): string {
  return MUTED('  ╠' + '═'.repeat(BOX_WIDTH) + '╣');
}

export async function showWelcomeIfFirstRun(): Promise<void> {
  const config = getConfig();
  if (config.hasSeenWelcome) return;
  await playWelcomeAnimation();
  setConfigValue('hasSeenWelcome', true);
}

async function playWelcomeAnimation(): Promise<void> {
  console.clear();
  console.log('');

  // ─── TOP BORDER ──────────────────────────────────────────
  console.log(MUTED('  ╔' + '═'.repeat(BOX_WIDTH) + '╗'));

  // ─── CLOUDS (white, full width) ──────────────────────────
  console.log(MUTED('  ║') + pad(WHITE('  ☁   ☁      ☁         ☁    ☁      ☁     ☁    ☁  '), 54));
  console.log(MUTED('  ║') + pad(WHITE('     ☁    ☁       ☁  ') + chalk.yellow('☀️') + WHITE('      ☁      ☁       ☁  '), 56));
  console.log(MUTED('  ║') + pad(WHITE('  ☁     ☁    ☁       ☁       ☁    ☁     ☁      ☁ '), 54));
  console.log(MUTED('  ║') + pad(WHITE('    ☁       ☁   ☁         ☁      ☁        ☁    ☁  '), 54));

  // ─── SEPARATOR ───────────────────────────────────────────
  console.log(hRule());

  // ─── ASCII LOGO (Orange + Amber) ─────────────────────────
  console.log(MUTED('  ║') + pad('  ' + BRAND_PRIMARY('██████╗  ██████╗ ██████╗ ') + BRAND_SECONDARY('██╗ ███████╗'), 52));
  console.log(MUTED('  ║') + pad('  ' + BRAND_PRIMARY('██╔══██╗██╔═══██╗██╔══██╗') + BRAND_SECONDARY('╚═╝ ██╔════╝'), 52));
  console.log(MUTED('  ║') + pad('  ' + BRAND_PRIMARY('██████╔╝██║   ██║██████╔╝') + BRAND_SECONDARY('    ███████╗'), 52));
  console.log(MUTED('  ║') + pad('  ' + BRAND_PRIMARY('██╔══██╗██║   ██║██╔══██╗') + BRAND_SECONDARY('    ╚════██║'), 52));
  console.log(MUTED('  ║') + pad('  ' + BRAND_PRIMARY('██████╔╝╚██████╔╝██████╔╝') + BRAND_SECONDARY('    ███████║'), 52));
  console.log(MUTED('  ║') + pad('  ' + BRAND_PRIMARY('╚═════╝  ╚═════╝ ╚═════╝ ') + BRAND_SECONDARY('    ╚══════╝'), 52));
  console.log(MUTED('  ║') + pad('', 0));
  console.log(MUTED('  ║') + pad('  ' + WHITE('C  L  I') + MUTED('  v0.1.6'), 18));
  console.log(MUTED('  ║') + pad('', 0));

  // ─── SEPARATOR ───────────────────────────────────────────
  console.log(hRule());

  // ─── TYPEWRITER TAGLINE ───────────────────────────────────
  console.log(MUTED('  ║') + pad('', 0));

  const tagline  = '  🔨🪛💻  We Can Build It!';
  const tagVisible = 26; // visible character count (emoji = 2 each, 3 emoji = 6 extra)
  process.stdout.write(MUTED('  ║'));
  for (let i = 0; i <= tagline.length; i++) {
    const content = BRAND_SECONDARY(tagline.slice(0, i));
    const spaces = BOX_WIDTH - Math.min(i, tagVisible) - 2;
    process.stdout.write(`\r${MUTED('  ║')}${content}${' '.repeat(Math.max(0, spaces))}${MUTED('║')}`);
    await sleep(TYPEWRITER_DELAY);
  }
  process.stdout.write('\n');

  console.log(MUTED('  ║') + pad('', 0));

  // ─── SEPARATOR ───────────────────────────────────────────
  console.log(hRule());

  // ─── BRANDING ─────────────────────────────────────────────
  console.log(MUTED('  ║') + pad('', 0));
  console.log(MUTED('  ║') + pad('  ' + SUCCESS('🌱 Bob\'s CLI') + MUTED('  ·  ') + MODE_CONSULTANT('Part of the Seedling Productivity Suite'), 58));
  console.log(MUTED('  ║') + pad('  ' + INFO('https://seedling-io.gitbook.io/bob-cli'), 40));
  console.log(MUTED('  ║') + pad('', 0));

  // ─── SEPARATOR ───────────────────────────────────────────
  console.log(hRule());

  // ─── QUICK START ──────────────────────────────────────────
  console.log(MUTED('  ║') + pad('', 0));
  console.log(MUTED('  ║') + pad('  ' + MUTED('Quick Start:'), 14));
  console.log(MUTED('  ║') + pad('', 0));
  console.log(MUTED('  ║') + pad('  ' + BRAND_SECONDARY('▸ bob chat') + MUTED('           — Talk to Bob'), 36));
  console.log(MUTED('  ║') + pad('  ' + BRAND_SECONDARY('▸ bob consult') + MUTED('        — Strategic advice (no code)'), 51));
  console.log(MUTED('  ║') + pad('  ' + BRAND_SECONDARY('▸ bob index') + MUTED('          — Index your project'), 43));
  console.log(MUTED('  ║') + pad('  ' + BRAND_SECONDARY('▸ bob login') + MUTED('          — Connect to the platform'), 47));
  console.log(MUTED('  ║') + pad('  ' + BRAND_SECONDARY('▸ bob push "msg"') + MUTED('     — Git commit + push'), 41));
  console.log(MUTED('  ║') + pad('  ' + BRAND_SECONDARY('▸ bob --help') + MUTED('         — See all commands'), 40));
  console.log(MUTED('  ║') + pad('', 0));

  // ─── SEPARATOR ───────────────────────────────────────────
  console.log(hRule());

  // ─── COMMUNITY ───────────────────────────────────────────
  console.log(MUTED('  ║') + pad('', 0));
  console.log(MUTED('  ║') + pad('  ' + SUCCESS('🌱 Join 1,700+ builders in our community:'), 43));
  console.log(MUTED('  ║') + pad('  ' + INFO('https://discord.gg/wM9ZBXdd'), 21));
  console.log(MUTED('  ║') + pad('', 0));

  // ─── BOTTOM BORDER ────────────────────────────────────────
  console.log(MUTED('  ╚' + '═'.repeat(BOX_WIDTH) + '╝'));
  console.log('');

  await sleep(800);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}