import chalk from 'chalk';

const FRAME_DELAY_MS = 350;

const FRAMES: string[] = [
  `
  👷 ━━━━━━━━━━━━━━━━━━━━ 🍴 ━━╮
                                 ┃
                                 ╰━━
  `,
  `
       👷 ━━━━━━━━━━━━━━━━ 🍴 ━━╮
                                  ┃
                                  ╰━━
  `,
  `
            👷 ━━━━━━━━━━━ 🍴 ━━╮
                                 ┃
                                 ╰━━
  `,
  `
                 👷 ━━━━━━ 🍴 ━━╮
                                ┃
                                ╰━━
  `,
  `
                      👷  🍴 ━━━╮
                                ┃
                                ╰━━
  `,
  `
                         👷🍴
                          ╱ ╲
                         ╱   ╲
  `,
  `
                         🍴
                        ╱   ╲
                       ╱     ╲
                      │       │
                      ▼       ▼
  `,
];

const FRAME_HEIGHT = 6;

/**
 * Starts the fork animation. Loops until stop() is called.
 * Shows "⚡ Fork initializing..." below the animation.
 */
export function startForkAnimation(parentTitle: string, forkTitle: string): { stop: () => void } {
  let running = true;

  // Seed blank lines for the animation area
  for (let i = 0; i < FRAME_HEIGHT + 2; i++) {
    console.log('');
  }

  const run = async () => {
    // Play through main frames once
    for (const frame of FRAMES) {
      if (!running) return;
      renderFrame(frame);
      await sleep(FRAME_DELAY_MS);
    }

    // Loop last 2 frames until stopped
    let toggle = false;
    while (running) {
      if (!running) return;
      renderFrame(FRAMES[toggle ? FRAMES.length - 1 : FRAMES.length - 2]);
      toggle = !toggle;
      await sleep(600);
    }
  };

  run();

  return {
    stop: () => {
      running = false;
      // Small delay to let the last frame finish rendering
      setTimeout(() => {
        renderFinalFrame(parentTitle, forkTitle);
      }, 100);
    }
  };
}

function renderFrame(frame: string): void {
  const totalHeight = FRAME_HEIGHT + 2; // frame + status line + blank
  process.stdout.write(`\x1B[${totalHeight}A`);
  for (let i = 0; i < totalHeight; i++) {
    process.stdout.write('\x1B[2K\n');
  }
  process.stdout.write(`\x1B[${totalHeight}A`);

  const lines = frame.split('\n').filter(l => l.length > 0);
  for (const line of lines) {
    console.log(line);
  }
  // Pad to frame height
  for (let i = lines.length; i < FRAME_HEIGHT; i++) {
    console.log('');
  }
  // Status line below animation
  console.log(chalk.magenta('  ⚡ Fork initializing...'));
  console.log('');
}

function renderFinalFrame(parentTitle: string, forkTitle: string): void {
  const totalHeight = FRAME_HEIGHT + 2;
  process.stdout.write(`\x1B[${totalHeight}A`);
  for (let i = 0; i < totalHeight; i++) {
    process.stdout.write('\x1B[2K\n');
  }
  process.stdout.write(`\x1B[${totalHeight}A`);

  console.log(chalk.gray('                         🍴'));
  console.log(chalk.gray('                        ╱   ╲'));
  console.log(`             ${chalk.green('○')} ${chalk.gray(truncate(parentTitle, 18))}   ${chalk.magenta('⚡')} ${chalk.bold(truncate(forkTitle, 18))}`);
  console.log(chalk.gray('                       ╱       ╲'));
  console.log(chalk.gray('  ─────────────────────────────────────'));
  console.log(chalk.green('  ✅ Fork created!'));
  console.log('');
  console.log('');
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}