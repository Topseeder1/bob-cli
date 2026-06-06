import chalk from 'chalk';
import { getConfig, setConfigValue } from '../core/config-store.js';

const AMBER = chalk.hex('#FFAB00');
const ORANGE = chalk.hex('#E66F24');
const GREEN = chalk.hex('#2E7D32');
const SKY = chalk.hex('#87CEEB');
const WHITE = chalk.white;
const BORDER = chalk.hex('#2E7D32');

const TYPEWRITER_DELAY = 80;

/**
 * Shows the welcome screen on first install only.
 */
export async function showWelcomeIfFirstRun(): Promise<void> {
  const config = getConfig();

  if (config.hasSeenWelcome) return;

  await playWelcomeAnimation();

  setConfigValue('hasSeenWelcome', true);
}

async function playWelcomeAnimation(): Promise<void> {
  console.clear();
  console.log('');

  // ─── TOP BORDER ───
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));

  // ─── SKY WITH CLOUDS AND SUN ───
  console.log(BORDER('  ║') + SKY('  ☁        ☁           ☁    ☁         ☁        ☁     ☁') + BORDER('║'));
  console.log(BORDER('  ║') + SKY('       ☁        ☁   ') + chalk.yellow('☀️') + SKY('        ☁       ☁           ☁') + BORDER('║'));
  console.log(BORDER('  ║') + SKY('    ☁      ☁        ☁      ☁    ☁        ☁   ☁      ☁') + BORDER('║'));
  console.log(BORDER('  ║') + SKY('  ☁    ☁       ☁          ☁       ☁    ☁       ☁    ') + BORDER(' ║'));

  // ─── SEPARATOR ───
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));

  // ─── ASCII ART "BOB'S" ───
  console.log(BORDER('  ║') + ORANGE('    ██████╗  ██████╗ ██████╗ ') + AMBER('██╗ ███████╗') + '          ' + BORDER('║'));
  console.log(BORDER('  ║') + ORANGE('    ██╔══██╗██╔═══██╗██╔══██╗') + AMBER('╚═╝ ██╔════╝') + '          ' + BORDER('║'));
  console.log(BORDER('  ║') + ORANGE('    ██████╔╝██║   ██║██████╔╝') + AMBER('    ███████╗') + '          ' + BORDER('║'));
  console.log(BORDER('  ║') + ORANGE('    ██╔══██╗██║   ██║██╔══██╗') + AMBER('    ╚════██║') + '          ' + BORDER('║'));
  console.log(BORDER('  ║') + ORANGE('    ██████╔╝╚██████╔╝██████╔╝') + AMBER('    ███████║') + '          ' + BORDER('║'));
  console.log(BORDER('  ║') + ORANGE('    ╚═════╝  ╚═════╝ ╚═════╝ ') + AMBER('    ╚══════╝') + '          ' + BORDER('║'));
  console.log(BORDER('  ║') + '                                                        ' + BORDER('║'));
  console.log(BORDER('  ║') + WHITE('                          C  L  I') + chalk.gray('  v0.1.0') + '              ' + BORDER('║'));
  console.log(BORDER('  ║') + '                                                        ' + BORDER('║'));

  // ─── SEPARATOR ───
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));

  // ─── TYPEWRITER: "We Can Build It!" ───
  console.log(BORDER('  ║') + '                                                        ' + BORDER('║'));

  process.stdout.write(BORDER('  ║'));
  const tagline = '    🔨🪛💻  We Can Build It!';
  for (let i = 0; i <= tagline.length; i++) {
    process.stdout.write(`\r${BORDER('  ║')}${AMBER(tagline.slice(0, i))}`);
    await sleep(TYPEWRITER_DELAY);
  }
  const pad = 56 - tagline.length;
  process.stdout.write(' '.repeat(pad > 0 ? pad : 0) + BORDER('║') + '\n');

  console.log(BORDER('  ║') + '                                                        ' + BORDER('║'));

  // ─── BRANDING ───
  console.log(BORDER('  ║') + chalk.gray('    ─────────────────────────────────────────────') + '       ' + BORDER('║'));
  console.log(BORDER('  ║') + GREEN('    🌱 Bob\'s Workshop') + chalk.gray(' | A Seedling Company') + '            ' + BORDER('║'));
  console.log(BORDER('  ║') + chalk.gray('    ─────────────────────────────────────────────') + '       ' + BORDER('║'));
  console.log(BORDER('  ║') + '                                                        ' + BORDER('║'));

  // ─── QUICK START ───
  console.log(BORDER('  ║') + chalk.gray('    Quick Start:') + '                                        ' + BORDER('║'));
  console.log(BORDER('  ║') + chalk.gray('    ') + AMBER('bob chat') + chalk.gray('           — Talk to Bob') + '                 ' + BORDER('║'));
  console.log(BORDER('  ║') + chalk.gray('    ') + AMBER('bob consult') + chalk.gray('        — Strategic advice (no code)') + '   ' + BORDER('║'));
  console.log(BORDER('  ║') + chalk.gray('    ') + AMBER('bob index') + chalk.gray('          — Index your project') + '           ' + BORDER('║'));
  console.log(BORDER('  ║') + chalk.gray('    ') + AMBER('bob login') + chalk.gray('          — Connect to the platform') + '      ' + BORDER('║'));
  console.log(BORDER('  ║') + chalk.gray('    ') + AMBER('bob push "msg"') + chalk.gray('     — Git commit + push') + '            ' + BORDER('║'));
  console.log(BORDER('  ║') + chalk.gray('    ') + AMBER('bob --help') + chalk.gray('         — See all commands') + '             ' + BORDER('║'));
  console.log(BORDER('  ║') + '                                                        ' + BORDER('║'));

  // ─── BOTTOM BORDER ───
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  await sleep(800);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}