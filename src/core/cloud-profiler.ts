/**
 * Cloud Profiler Orchestration Engine (Pub/Sub Architecture)
 * Polished UI with stage boxes, color-gradient progress bars, and clean rendering.
 * Supports daily, weekly, and monthly scopes.
 */

import { getConfig } from './config-store.js';
import { callCloudFunction, isAuthenticated } from './api-client.js';
import chalk from 'chalk';
import ora from 'ora';

const AMBER = chalk.hex('#FFAB00');
const ORANGE = chalk.hex('#E66F24');
const GREEN = chalk.hex('#66BB6A');
const CYAN = chalk.cyan;
const RED = chalk.hex('#EF5350');
const GRAY = chalk.gray;
const WHITE = chalk.white;
const BORDER = chalk.hex('#455A64');

export type ProfileScope = 'daily' | 'weekly' | 'monthly';

interface CloudProfilerOptions {
  scope: ProfileScope;
  onProgress?: (message: string) => void;
}

const POLL_INTERVAL = 3000;

/**
 * Renders a color-gradient progress bar.
 * 0-25: red, 25-50: orange, 50-75: amber/yellow, 75-100: green
 */
function renderProgressBar(score: number, width: number = 30): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;

  let barColor;
  if (score >= 75) barColor = chalk.hex('#66BB6A');
  else if (score >= 50) barColor = chalk.hex('#FFAB00');
  else if (score >= 25) barColor = chalk.hex('#E66F24');
  else barColor = chalk.hex('#EF5350');

  const filledBar = barColor('█'.repeat(filled));
  const emptyBar = chalk.hex('#333333')('░'.repeat(empty));

  return `${filledBar}${emptyBar} ${barColor(`${score}/100`)}`;
}

/**
 * Renders a chunk progress bar
 */
function renderChunkBar(current: number, total: number, width: number = 30): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return AMBER('█'.repeat(filled)) + chalk.hex('#333333')('░'.repeat(empty)) + GRAY(` ${current}/${total}`);
}

/**
 * Truncates a string to a max length with ellipsis
 */
function truncate(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.substring(0, max - 3) + '...';
}

/**
 * Renders a boxed stage section
 */
function renderBox(icon: string, title: string, lines: string[]): void {
  console.log('');
  console.log(BORDER('  ┌─────────────────────────────────────────────────────────┐'));
  console.log(BORDER('  │') + `  ${icon} ${WHITE(title)}`);
  for (const line of lines) {
    console.log(BORDER('  │') + `  ${line}`);
  }
  console.log(BORDER('  └─────────────────────────────────────────────────────────┘'));
}

/**
 * Returns an emoji for common emotions
 */
function getEmotionEmoji(emotion: string): string {
  const lower = (emotion || '').toLowerCase();
  if (lower.includes('anger') || lower.includes('angry')) return '😠';
  if (lower.includes('happiness') || lower.includes('happy') || lower.includes('joy')) return '😊';
  if (lower.includes('sadness') || lower.includes('sad')) return '😢';
  if (lower.includes('fear') || lower.includes('anxiety')) return '😰';
  if (lower.includes('surprise')) return '😲';
  if (lower.includes('disgust')) return '🤢';
  if (lower.includes('contempt')) return '😤';
  if (lower.includes('pride')) return '😏';
  if (lower.includes('gratitude')) return '🙏';
  if (lower.includes('frustrat')) return '😤';
  if (lower.includes('flow')) return '⚡';
  if (lower.includes('curiosity') || lower.includes('curious')) return '🧐';
  if (lower.includes('satisfaction') || lower.includes('accomplish')) return '✅';
  if (lower.includes('burnout')) return '🔥';
  if (lower.includes('imposter')) return '🎭';
  if (lower.includes('confusion') || lower.includes('confused')) return '😵';
  return '◉';
}

/**
 * Capitalizes first letter
 */
function capitalize(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Runs the cloud profiling pipeline via Pub/Sub worker.
 */
export async function runCloudProfiler(options: CloudProfilerOptions): Promise<void> {
  const { scope } = options;
  const config = getConfig();

  if (!isAuthenticated()) {
    throw new Error('Cloud profiling requires authentication. Run `bob login` first.');
  }

  console.log('');
  console.log(AMBER(`  🧬 Running cloud ${scope} profiling (Power tier)...`));
  console.log('');

  // ─── STEP 1: Start the profiling job ───
  const spinner = ora({ text: CYAN('  Initiating profiling job...'), spinner: 'dots' }).start();

  const startResult = await callCloudFunction('startCloudProfiling', {
    scope,
    isLocalModel: false,
  });

  if (!startResult?.success || !startResult?.jobPath) {
    spinner.fail(RED('  ❌ Failed to start profiling job.'));
    throw new Error('Failed to start profiling job.');
  }

  const jobPath = startResult.jobPath;
  const jobId = startResult.jobId;

  spinner.succeed(GREEN(`  🚀 Job started: ${chalk.gray(jobId.slice(0, 30))}`));

  // ─── STEP 2: Poll for status updates ───
  let lastSeenLines = 0;
  let currentChunks = 0;
  let totalChunks = 0;
  let chunkBarRendered = false;
  let dataBoxRendered = false;
  let stage1Rendered = false;
  let stage2Rendered = false;
  let stage3Rendered = false;
  let stage4Rendered = false;
  let weeklyBehavioralRendered = false;
  let weeklyDecisionRendered = false;
  let weeklySynthesisRendered = false;
  let monthlyRendered = false;
  let activeSpinner: any = null;

  while (true) {
    await sleep(POLL_INTERVAL);

    let jobData: any;
    try {
      jobData = await callCloudFunction('getCloudProfilingStatus', { jobPath });
    } catch (error: any) {
      continue;
    }

    if (!jobData) continue;

    const { status, statusLines, error: jobError } = jobData;

    if (statusLines && statusLines.length > lastSeenLines) {
      for (let i = lastSeenLines; i < statusLines.length; i++) {
        const line = statusLines[i];
        const msg = line.message || '';

        // ═══════════════════════════════════════════════════════
        // DAILY PIPELINE RENDERING
        // ═══════════════════════════════════════════════════════

        // ─── DATA COLLECTION ───
        if (msg.includes('Found') && msg.includes('messages') && !dataBoxRendered) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }

          const msgMatch = msg.match(/Found (\d+) messages \((\d+) conversation, (\d+) deep dive\)/);
          if (msgMatch) {
            renderBox('📥', 'Collecting Data', [
              GRAY(`Found ${WHITE(msgMatch[1])} messages (${msgMatch[2]} 💬 | ${msgMatch[3]} 🤿)`),
            ]);
          }
          dataBoxRendered = true;
          continue;
        }

        // ─── CHUNK PROGRESS ───
        if (msg.includes('Processing chunk')) {
          const chunkMatch = msg.match(/Processing chunk (\d+)\/(\d+)/);
          if (chunkMatch) {
            currentChunks = parseInt(chunkMatch[1]);
            totalChunks = parseInt(chunkMatch[2]);

            if (!chunkBarRendered) {
              process.stdout.write(BORDER('  │') + `  Summarizing: `);
              chunkBarRendered = true;
            }

            process.stdout.write(`\r${BORDER('  │')}  Summarizing: ${renderChunkBar(currentChunks, totalChunks)}`);

            if (currentChunks === totalChunks) {
              process.stdout.write('\n');
              console.log(BORDER('  └─────────────────────────────────────────────────────────┘'));
            }
          }
          continue;
        }

        // Skip handled messages
        if (msg.includes('Summarizing') && msg.includes('chunks')) continue;
        if (msg.includes('Summarization complete')) continue;
        if (msg.includes('Profiling job created')) continue;

        if (msg.includes('Scanning conversations')) {
          activeSpinner = ora({ text: GRAY('  Scanning conversations...'), spinner: 'dots' }).start();
          continue;
        }

        // ─── STAGE 1: EMOTION ANALYSIS ───
        if (msg.includes('Running emotion analyzers')) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
          activeSpinner = ora({ text: CYAN('  Analyzing emotions (primary + social + cognitive)...'), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Stage 1 complete') && !stage1Rendered) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }

          const primaryMatch = msg.match(/Primary=(\w+)/);
          const socialMatch = msg.match(/Social=(\w+)/);
          const cognitiveMatch = msg.match(/Cognitive=([^,]+)/);

          const primary = primaryMatch ? primaryMatch[1] : 'analyzed';
          const social = socialMatch ? socialMatch[1] : 'analyzed';
          const cognitive = cognitiveMatch ? truncate(cognitiveMatch[1], 45) : 'analyzed';

          renderBox('🧠', 'Stage 1: Emotion Analysis', [
            `${GRAY('Primary:')}   ${getEmotionEmoji(primary)} ${WHITE(primary)}`,
            `${GRAY('Social:')}    ${getEmotionEmoji(social)} ${WHITE(social)}`,
            `${GRAY('Cognitive:')} ${WHITE(cognitive)}`,
          ]);
          stage1Rendered = true;
          continue;
        }

        // ─── STAGE 2: MOOD SYNTHESIS ───
        if (msg.includes('Synthesizing unified mood')) {
          activeSpinner = ora({ text: CYAN('  Synthesizing mood...'), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Stage 2 complete') && !stage2Rendered) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }

          const moodMatch = msg.match(/Mood=([^(]+)/);
          const scoreMatch = msg.match(/score: (\d+)\/100/);

          const mood = moodMatch ? truncate(moodMatch[1].trim(), 50) : 'synthesized';
          const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

          renderBox('🌡️', 'Stage 2: Mood Synthesis', [
            `${GRAY('Mood:')}  ${WHITE(mood)}`,
            `${GRAY('Score:')} ${renderProgressBar(score)}`,
          ]);
          stage2Rendered = true;
          continue;
        }

        // ─── STAGE 3: BEHAVIORAL AUDIT ───
        if (msg.includes('Auditing work patterns')) {
          activeSpinner = ora({ text: CYAN('  Auditing work patterns...'), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Stage 3 complete') && !stage3Rendered) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }

          const styleMatch = msg.match(/Work Style=([^,]+)/);
          const prodMatch = msg.match(/Productivity=(\d+)\/100/);

          const style = styleMatch ? truncate(styleMatch[1].trim(), 45) : 'audited';
          const productivity = prodMatch ? parseInt(prodMatch[1]) : 0;

          renderBox('📊', 'Stage 3: Behavioral Audit', [
            `${GRAY('Style:')}        ${WHITE(style)}`,
            `${GRAY('Productivity:')} ${renderProgressBar(productivity)}`,
          ]);
          stage3Rendered = true;
          continue;
        }

        // ─── STAGE 4: DECISION PROFILE ───
        if (msg.includes('Profiling decision-making')) {
          activeSpinner = ora({ text: CYAN('  Profiling decisions...'), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Stage 4 complete') && !stage4Rendered) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }

          const archMatch = msg.match(/Archetype=([^—]+)/);
          const descMatch = msg.match(/—\s*(.+)/);

          const archetype = archMatch ? archMatch[1].trim() : 'profiled';
          const description = descMatch ? truncate(descMatch[1].trim(), 50) : '';

          renderBox('🎯', 'Stage 4: Decision Profile', [
            `${GRAY('Archetype:')} ${AMBER(archetype)}`,
            description ? `${GRAY('"' + description + '"')}` : '',
          ].filter(Boolean));
          stage4Rendered = true;
          continue;
        }

        // ═══════════════════════════════════════════════════════
        // WEEKLY PIPELINE RENDERING
        // ═══════════════════════════════════════════════════════

        if (msg.includes('Analyzing behavioral patterns across the week')) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
          activeSpinner = ora({ text: CYAN('  Analyzing weekly behavioral patterns...'), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Found') && msg.includes('daily audits')) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
          const countMatch = msg.match(/Found (\d+) daily audits/);
          const count = countMatch ? countMatch[1] : '?';
          activeSpinner = ora({ text: CYAN(`  Synthesizing from ${count} daily audits...`), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Weekly behavioral complete') && !weeklyBehavioralRendered) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }

          const styleMatch = msg.match(/Weekly behavioral complete: (.+)/);
          const style = styleMatch ? truncate(styleMatch[1].trim(), 50) : 'audited';

          renderBox('📈', 'Weekly Behavioral Audit', [
            `${GRAY('Work Style:')} ${WHITE(style)}`,
          ]);
          weeklyBehavioralRendered = true;
          continue;
        }

        if (msg.includes('Analyzing decision evolution')) {
          activeSpinner = ora({ text: CYAN('  Analyzing weekly decision evolution...'), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Weekly decision complete') && !weeklyDecisionRendered) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }

          const archMatch = msg.match(/Archetype=([^,]+)/);
          const edgeMatch = msg.match(/Edge=(\d+)\/100/);

          const archetype = archMatch ? archMatch[1].trim() : 'profiled';
          const edge = edgeMatch ? parseInt(edgeMatch[1]) : 0;

          renderBox('🎯', 'Weekly Decision Profile', [
            `${GRAY('Archetype:')} ${AMBER(archetype)}`,
            `${GRAY('Edge Score:')} ${renderProgressBar(edge)}`,
          ]);
          weeklyDecisionRendered = true;
          continue;
        }

        if (msg.includes('Synthesizing weekly personality DNA')) {
          activeSpinner = ora({ text: CYAN('  Synthesizing weekly DNA...'), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Weekly synthesis complete') && !weeklySynthesisRendered) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }

          const synthMatch = msg.match(/Weekly synthesis complete: (.+)/);
          const synthesis = synthMatch ? truncate(synthMatch[1].trim(), 50) : 'synthesized';

          renderBox('🧬', 'Weekly DNA Synthesis', [
            `${GRAY('Archetype:')} ${AMBER(synthesis)}`,
            `${GRAY('Your weekly personality profile has been updated.')}`,
          ]);
          weeklySynthesisRendered = true;
          continue;
        }

        // ═══════════════════════════════════════════════════════
        // MONTHLY PIPELINE RENDERING
        // ═══════════════════════════════════════════════════════

        if (msg.includes('Gathering weekly profiles for monthly')) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
          activeSpinner = ora({ text: CYAN('  Gathering weekly profiles...'), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Found') && msg.includes('weekly profiles')) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
          const countMatch = msg.match(/Found (\d+) weekly profiles/);
          const count = countMatch ? countMatch[1] : '?';
          activeSpinner = ora({ text: CYAN(`  Generating monthly DNA from ${count} weeks of data...`), spinner: 'dots' }).start();
          continue;
        }

        if (msg.includes('Monthly synthesis complete') && !monthlyRendered) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }

          const archMatch = msg.match(/Monthly synthesis complete: (.+)/);
          const archetype = archMatch ? truncate(archMatch[1].trim(), 50) : 'synthesized';

          renderBox('🧬', 'Monthly DNA Synthesis', [
            `${GRAY('Monthly Archetype:')} ${AMBER(archetype)}`,
            `${GRAY('Your complete monthly personality profile is now active.')}`,
            `${GRAY('Bob will adapt to match your patterns going forward.')}`,
          ]);
          monthlyRendered = true;
          continue;
        }

        // ═══════════════════════════════════════════════════════
        // GENERIC HANDLERS
        // ═══════════════════════════════════════════════════════

        // Completion (handled below in terminal state check)
        if (msg.includes('profiling complete!') && msg.includes('✅')) continue;

        // Failures
        if (msg.includes('❌') || msg.includes('Failed')) {
          if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
          const cleanMsg = msg.replace('❌ Failed: ', '').replace('❌ ', '');
          console.log(RED(`  ❌ ${truncate(cleanMsg, 70)}`));
          continue;
        }
      }

      lastSeenLines = statusLines.length;
    }

    // ─── TERMINAL STATES ───
    if (status === 'complete') {
      if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
      console.log('');
      console.log(GREEN('  ══════════════════════════════════════════════════════════'));
      console.log(GREEN(`  ✅ ${capitalize(scope)} DNA Profile Complete`));
      console.log(GRAY('     Your profile has been updated.'));
      console.log(GRAY('     Personalization Mode will now use this data.'));
      console.log(GREEN('  ══════════════════════════════════════════════════════════'));
      console.log('');
      return;
    }

    if (status === 'failed') {
      if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
      console.log('');
      const cleanError = (jobError || 'Cloud profiling failed. Check logs for details.')
        .replace(/firestore/gi, 'database')
        .replace(/Firestore/g, 'database');
      console.log(RED(`  ❌ ${cleanError}`));
      console.log('');
      throw new Error(cleanError);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}