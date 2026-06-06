import chalk from 'chalk';
import { AnimationFrame, startAnimation } from './engine.js';

const WATER = chalk.bgHex('#1565C0').hex('#42A5F5');
const DEEP_WATER = chalk.bgHex('#0D47A1').hex('#1565C0');
const BOARD = chalk.hex('#8D6E63');
const FIGURE = chalk.hex('#FFAB00');
const SPLASH = chalk.hex('#81D4FA');
const SKY = chalk.hex('#90CAF9');
const POOL_EDGE = chalk.hex('#455A64');

// Block characters for building scenes
const FULL = '█';
const LIGHT = '░';
const MED = '▒';
const DARK = '▓';
const TOP = '▀';
const BOT = '▄';

const FRAME_HEIGHT = 12;

function buildFrames(): AnimationFrame[] {
  const frames: AnimationFrame[] = [];

  // Frame 1: Figure standing on diving board, pool below
  frames.push({ lines: [
    SKY('                                                        '),
    SKY('                                                        '),
    `  ${BOARD('━━━━━━━┓')}                                              `,
    `  ${BOARD('       ┃')} ${FIGURE('▓█▓')}                                          `,
    `  ${BOARD('       ┃')} ${FIGURE(' █ ')}                                          `,
    `  ${BOARD('       ┃')} ${FIGURE('▐ ▌')}                                          `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('╔════════════════════╗')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE('║')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE('║')}           `,
    `  ${POOL_EDGE('━━━━━━━┻━━━━━━━━━━')}${POOL_EDGE('║')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE('║')}           `,
    `                    ${POOL_EDGE('╚════════════════════╝')}           `,
    `                                                          `,
  ]});

  // Frame 2: Figure crouching to jump
  frames.push({ lines: [
    SKY('                                                        '),
    SKY('                                                        '),
    `  ${BOARD('━━━━━━━┓')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')} ${FIGURE('▓█▓')}                                          `,
    `  ${BOARD('       ┃')} ${FIGURE('▐█▌')}                                          `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('╔════════════════════╗')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE('║')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE('║')}           `,
    `  ${POOL_EDGE('━━━━━━━┻━━━━━━━━━━')}${POOL_EDGE('║')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE('║')}           `,
    `                    ${POOL_EDGE('╚════════════════════╝')}           `,
    `                                                          `,
  ]});

  // Frame 3: Figure in the air
  frames.push({ lines: [
    SKY('                                                        '),
    `                  ${FIGURE('▓█▓')}                                    `,
    `  ${BOARD('━━━━━━━┓')}   ${FIGURE(' █ ')}                                        `,
    `  ${BOARD('       ┃')}   ${FIGURE('▐ ▌')}                                        `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('╔════════════════════╗')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE('║')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE('║')}           `,
    `  ${POOL_EDGE('━━━━━━━┻━━━━━━━━━━')}${POOL_EDGE('║')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE('║')}           `,
    `                    ${POOL_EDGE('╚════════════════════╝')}           `,
    `                                                          `,
  ]});

  // Frame 4: Figure above pool, diving down
  frames.push({ lines: [
    SKY('                                                        '),
    SKY('                                                        '),
    `  ${BOARD('━━━━━━━┓')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}           ${FIGURE('▐█▌')}                                `,
    `  ${BOARD('       ┃')}           ${FIGURE(' ▼ ')}                                `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('╔════════════════════╗')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE('║')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE('║')}           `,
    `  ${POOL_EDGE('━━━━━━━┻━━━━━━━━━━')}${POOL_EDGE('║')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE('║')}           `,
    `                    ${POOL_EDGE('╚════════════════════╝')}           `,
    `                                                          `,
  ]});

  // Frame 5: SPLASH — figure entering water
  frames.push({ lines: [
    SKY('                                                        '),
    SKY('                                                        '),
    `  ${BOARD('━━━━━━━┓')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('╔════')}${SPLASH('💦💦💦')}${POOL_EDGE('═══════════╗')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${LIGHT}${LIGHT}${LIGHT}`)}${FIGURE('▓█▓')}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE('║')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE('║')}           `,
    `  ${POOL_EDGE('━━━━━━━┻━━━━━━━━━━')}${POOL_EDGE('║')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE('║')}           `,
    `                    ${POOL_EDGE('╚════════════════════╝')}           `,
    `                                                          `,
  ]});

  // Frame 6: Figure submerging
  frames.push({ lines: [
    SKY('                                                        '),
    SKY('                                                        '),
    `  ${BOARD('━━━━━━━┓')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('╔════════════════════╗')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE('║')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${MED}${MED}${MED}`)}${FIGURE('▓█▓')}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE('║')}           `,
    `  ${POOL_EDGE('━━━━━━━┻━━━━━━━━━━')}${POOL_EDGE('║')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE('║')}           `,
    `                    ${POOL_EDGE('╚════════════════════╝')}           `,
    `                                                          `,
  ]});

  // Frame 7: Figure deep underwater
  frames.push({ lines: [
    SKY('                                                        '),
    SKY('                                                        '),
    `  ${BOARD('━━━━━━━┓')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('╔════════════════════╗')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE('║')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE('║')}           `,
    `  ${POOL_EDGE('━━━━━━━┻━━━━━━━━━━')}${POOL_EDGE('║')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${FIGURE('🤿')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE('║')}           `,
    `                    ${POOL_EDGE('╚════════════════════╝')}           `,
    `                                                          `,
  ]});

  // Frame 8: Final — "DEEP DIVE ACTIVE" text
  frames.push({ lines: [
    SKY('                                                        '),
    SKY('                                                        '),
    `  ${BOARD('━━━━━━━┓')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}                                              `,
    `  ${BOARD('       ┃')}         ${chalk.bold.blue('⚡ DEEP DIVE ACTIVE')}                   `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('╔════════════════════╗')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE('║')}           `,
    `         ${POOL_EDGE('┃')}         ${POOL_EDGE('║')}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE('║')}           `,
    `  ${POOL_EDGE('━━━━━━━┻━━━━━━━━━━')}${POOL_EDGE('║')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${FIGURE('🤿')}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE('║')}           `,
    `                    ${POOL_EDGE('╚════════════════════╝')}           `,
    `                                                          `,
  ]});

  return frames;
}

/**
 * Starts the deep dive animation. Loops until stop() is called.
 */
export function startDeepDiveAnimation(): { stop: () => void; promise: Promise<void> } {
  const frames = buildFrames();

  return startAnimation(frames, {
    frameDelay: 400,
    frameHeight: FRAME_HEIGHT,
    loop: true,
  }, chalk.blue('  🤿 Initiating deep dive...'));
}