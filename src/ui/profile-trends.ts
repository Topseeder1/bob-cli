import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { callCloudFunction, isAuthenticated } from '../core/api-client.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY   = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS         = chalk.hex('#66BB6A');
const INFO            = chalk.hex('#26C6DA');
const WARNING         = chalk.hex('#FFC107');
const ERROR           = chalk.hex('#EF5350');
const MUTED           = chalk.hex('#78909C');
const BORDER          = chalk.hex('#455A64');

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

// ─── SPARKLINE HELPERS ────────────────────────────────────────────────────────

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Maps a score (0-100) to a colored sparkline character.
 * Each character is individually colored based on its own score value.
 */
function sparkChar(score: number): string {
  const idx    = Math.min(7, Math.floor((score / 100) * 8));
  const char   = SPARK_CHARS[idx];
  const colored = scoreColor(score);
  return colored(char);
}

/**
 * Returns the appropriate chalk color for a given score value.
 */
function scoreColor(score: number): chalk.Chalk {
  if (score >= 76)      return SUCCESS;
  if (score >= 51)      return WARNING;
  if (score >= 26)      return BRAND_PRIMARY;
  return ERROR;
}

/**
 * Returns a colored trend arrow + label based on direction.
 */
function trendArrow(direction: 'rising' | 'falling' | 'stable' | 'unknown'): string {
  switch (direction) {
    case 'rising':  return SUCCESS('↗ Rising');
    case 'falling': return ERROR('↘ Falling');
    case 'stable':  return WARNING('→ Stable');
    default:        return MUTED('— Unknown');
  }
}

/**
 * Calculates trend direction from an array of scores.
 */
function calculateTrend(scores: number[]): 'rising' | 'falling' | 'stable' | 'unknown' {
  if (scores.length < 2) return 'unknown';
  const valid = scores.filter(s => s > 0);
  if (valid.length < 2)  return 'unknown';

  const first    = valid.slice(0, Math.ceil(valid.length / 2));
  const last     = valid.slice(Math.floor(valid.length / 2));
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgLast  = last.reduce((a, b) => a + b, 0) / last.length;
  const delta    = avgLast - avgFirst;

  if (delta > 5)  return 'rising';
  if (delta < -5) return 'falling';
  return 'stable';
}

/**
 * Builds a full sparkline string from an array of scores.
 * Each character is individually colored.
 */
function buildSparkline(scores: number[]): string {
  return scores.map(s => s > 0 ? sparkChar(s) : MUTED('·')).join('');
}

/**
 * Renders one sparkline row inside the trend card.
 * Label is padded to fixed width for alignment.
 */
function sparkRow(label: string, scores: number[], latestScore: number): string {
  const LABEL_WIDTH = 16;
  const paddedLabel = MUTED(label.padEnd(LABEL_WIDTH));
  const spark       = buildSparkline(scores);
  const latest      = scoreColor(latestScore)(String(latestScore).padStart(3));
  const trend       = trendArrow(calculateTrend(scores));
  return `${paddedLabel}  ${spark}  ${latest}  ${trend}`;
}

// ─── SNAPSHOT INTERFACE ───────────────────────────────────────────────────────

interface DailySnapshot {
  date:          string;
  confidence:    number;
  autonomy:      number;
  clarity:       number;
  momentum:      number;
  productivity:  number;
  moodScore:     number;
  consistency:   number;
  followThrough: number;
}

// ─── DATA LOADER ─────────────────────────────────────────────────────────────

/**
 * Loads daily snapshots — cloud first (authenticated), local fallback (Tier 1).
 */
async function loadDailySnapshots(days: number = 7): Promise<DailySnapshot[]> {

  // ─── Cloud path (authenticated users) ───
  if (isAuthenticated()) {
    try {
      const result = await callCloudFunction('getCLIProfileHistory', { days });

      if (result?.success && Array.isArray(result.snapshots) && result.snapshots.length > 0) {
        return result.snapshots.map((s: any) => ({
          date:          s.date          || '',
          confidence:    s.confidence    || 0,
          autonomy:      s.autonomy      || 0,
          clarity:       s.clarity       || 0,
          momentum:      s.momentum      || 0,
          productivity:  s.productivity  || 0,
          moodScore:     s.moodScore     || 0,
          consistency:   s.consistency   || 0,
          followThrough: s.followThrough || 0,
        }));
      }
    } catch {
      // Non-fatal — fall through to local
    }
  }

  // ─── Local fallback (Tier 1 users with local profiles) ───
  const projectName = path.basename(process.cwd());
  const homeDir     = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const dailyDir    = path.join(homeDir, '.bob', 'projects', projectName, 'profile', 'daily');

  if (!fs.existsSync(dailyDir)) return [];

  const files = fs.readdirSync(dailyDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .slice(-days);

  const snapshots: DailySnapshot[] = [];

  for (const file of files) {
    try {
      const raw  = JSON.parse(fs.readFileSync(path.join(dailyDir, file), 'utf-8'));
      const date = file.replace('.json', '');
      snapshots.push({
        date,
        confidence:    raw.decision?.psychologicalState?.confidence    || 0,
        autonomy:      raw.decision?.psychologicalState?.autonomy      || 0,
        clarity:       raw.decision?.psychologicalState?.clarity       || 0,
        momentum:      raw.decision?.psychologicalState?.momentum      || 0,
        productivity:  raw.behavioral?.overallProductivity             || 0,
        moodScore:     raw.mood?.moodScore                             || 0,
        consistency:   raw.behavioral?.consistency?.score             || raw.behavioral?.consistency || 0,
        followThrough: raw.behavioral?.followThrough?.score           || raw.behavioral?.followThrough || 0,
      });
    } catch {
      // Skip malformed files
    }
  }

  return snapshots;
}

// ─── BEST / WORST DAYS ────────────────────────────────────────────────────────

function findBestWorstDays(snapshots: DailySnapshot[]): {
  best:  { date: string; avg: number } | null;
  worst: { date: string; avg: number } | null;
} {
  if (snapshots.length === 0) return { best: null, worst: null };

  const scored = snapshots.map(s => {
    const scores = [s.confidence, s.autonomy, s.clarity, s.momentum, s.productivity, s.moodScore]
      .filter(v => v > 0);
    const avg = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    return { date: s.date, avg };
  });

  const best  = scored.reduce((a, b) => a.avg > b.avg ? a : b);
  const worst = scored.reduce((a, b) => a.avg < b.avg ? a : b);

  return { best, worst };
}

// ─── DATE FORMATTER ───────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
  try {
    const normalized = dateStr.includes('-')
      ? dateStr
      : `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    return new Date(normalized).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export async function renderProfileTrends(days: number = 7): Promise<void> {
  const snapshots = await loadDailySnapshots(days);

  console.log('');

  if (snapshots.length === 0) {
    console.log(topRule());
    console.log(row(WARNING('⚠️  NO TREND DATA AVAILABLE')));
    console.log(hRule());
    console.log(row(MUTED('▸ No profile history found.')));
    console.log(row(MUTED('▸ Run `bob profile --cloud` to generate your first profile.')));
    console.log(emptyRow());
    console.log(botRule());
    console.log('');
    return;
  }

  // ─── Extract score arrays (oldest → newest for left-to-right sparkline) ───
  const ordered      = [...snapshots].reverse();
  const confidence   = ordered.map(s => s.confidence);
  const autonomy     = ordered.map(s => s.autonomy);
  const clarity      = ordered.map(s => s.clarity);
  const momentum     = ordered.map(s => s.momentum);
  const productivity = ordered.map(s => s.productivity);
  const moodScore    = ordered.map(s => s.moodScore);
  const consistency  = ordered.map(s => s.consistency);
  const followThrough = ordered.map(s => s.followThrough);

  // ─── Latest scores (most recent day) ───
  const latest = snapshots[0];

  // ─── Date range ───
  const firstDate = formatDateLabel(ordered[0].date);
  const lastDate  = formatDateLabel(ordered[ordered.length - 1].date);

  // ─── Best / worst days ───
  const { best, worst } = findBestWorstDays(snapshots);

  // ─── Render header ───
  console.log(topRule());
  console.log(row(INFO(`📈  TREND VIEW  ·  Last ${snapshots.length} Day${snapshots.length !== 1 ? 's' : ''}`)));
  console.log(row(MUTED(`▸ ${firstDate}  →  ${lastDate}`)));
  console.log(hRule());

  // ─── Psychological state ───
  console.log(row(chalk.white('▸ Psychological State')));
  console.log(emptyRow());
  console.log(row(sparkRow('Confidence',  confidence,   latest.confidence)));
  console.log(row(sparkRow('Autonomy',    autonomy,     latest.autonomy)));
  console.log(row(sparkRow('Clarity',     clarity,      latest.clarity)));
  console.log(row(sparkRow('Momentum',    momentum,     latest.momentum)));

  // ─── Behavioral ───
  console.log(hRule());
  console.log(row(chalk.white('▸ Behavioral')));
  console.log(emptyRow());
  console.log(row(sparkRow('Productivity',  productivity,  latest.productivity)));
  console.log(row(sparkRow('Consistency',   consistency,   latest.consistency)));
  console.log(row(sparkRow('Follow-thru',   followThrough, latest.followThrough)));

  // ─── Mood ───
  console.log(hRule());
  console.log(row(chalk.white('▸ Mood')));
  console.log(emptyRow());
  console.log(row(sparkRow('Mood Score', moodScore, latest.moodScore)));

  // ─── Best / worst ───
  if (best || worst) {
    console.log(hRule());
    console.log(row(chalk.white('▸ Highlights')));
    console.log(emptyRow());
    if (best)  console.log(row(SUCCESS('  ↗ Best day:   ') + chalk.white(formatDateLabel(best.date))  + MUTED(`  avg ${best.avg}`)));
    if (worst) console.log(row(ERROR('  ↘ Worst day:  ')  + chalk.white(formatDateLabel(worst.date)) + MUTED(`  avg ${worst.avg}`)));
  }

  // ─── Legend ───
  console.log(hRule());
  console.log(row(MUTED('▸ Legend')));
  console.log(emptyRow());
  console.log(row(
    ERROR('█')        + MUTED(' 0-25  ') +
    BRAND_PRIMARY('█') + MUTED(' 26-50  ') +
    WARNING('█')       + MUTED(' 51-75  ') +
    SUCCESS('█')       + MUTED(' 76-100  ') +
    MUTED('·')         + MUTED(' No data')
  ));
  console.log(row(
    SUCCESS('↗') + MUTED(' Rising  ') +
    ERROR('↘')   + MUTED(' Falling  ') +
    WARNING('→') + MUTED(' Stable')
  ));

  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}