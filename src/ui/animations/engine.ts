import chalk from 'chalk';

export interface AnimationFrame {
  lines: string[];
}

export interface AnimationConfig {
  frameDelay: number;
  frameHeight: number;
  loop?: boolean;
}

/**
 * Plays an animation sequence frame by frame.
 * Uses ANSI cursor repositioning to overwrite in place.
 * Returns a stop function for looping animations.
 */
export function startAnimation(
  frames: AnimationFrame[],
  config: AnimationConfig,
  statusText?: string,
): { stop: () => void; promise: Promise<void> } {
  let running = true;
  const { frameDelay, frameHeight, loop = false } = config;

  // Seed blank lines
  for (let i = 0; i < frameHeight + (statusText ? 2 : 0); i++) {
    console.log('');
  }

  const promise = (async () => {
    // Play through all frames once
    for (const frame of frames) {
      if (!running) return;
      renderFrame(frame, frameHeight, statusText);
      await sleep(frameDelay);
    }

    // If looping, alternate last 2 frames
    if (loop) {
      let toggle = false;
      while (running) {
        const idx = toggle ? frames.length - 1 : frames.length - 2;
        renderFrame(frames[Math.max(0, idx)], frameHeight, statusText);
        toggle = !toggle;
        await sleep(frameDelay * 2);
      }
    }
  })();

  return {
    stop: () => {
      running = false;
    },
    promise,
  };
}

function renderFrame(frame: AnimationFrame, frameHeight: number, statusText?: string): void {
  const totalHeight = frameHeight + (statusText ? 2 : 0);

  // Move cursor up
  process.stdout.write(`\x1B[${totalHeight}A`);

  // Clear and print each line
  for (let i = 0; i < frameHeight; i++) {
    process.stdout.write('\x1B[2K');
    if (i < frame.lines.length) {
      process.stdout.write(frame.lines[i]);
    }
    process.stdout.write('\n');
  }

  // Status text below animation
  if (statusText) {
    process.stdout.write('\x1B[2K');
    process.stdout.write(statusText + '\n');
    process.stdout.write('\x1B[2K\n');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}