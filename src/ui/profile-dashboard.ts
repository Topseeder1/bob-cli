import chalk from 'chalk';
import ora from 'ora';
import { callCloudFunction, isAuthenticated } from '../core/api-client.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY       = chalk.hex('#E66F24');
const BRAND_SECONDARY     = chalk.hex('#FFAB00');
const SUCCESS             = chalk.hex('#66BB6A');
const INFO                = chalk.hex('#26C6DA');
const WARNING             = chalk.hex('#FFC107');
const ERROR               = chalk.hex('#EF5350');
const MUTED               = chalk.hex('#78909C');
const BORDER              = chalk.hex('#455A64');
const MODE_CONSULTANT     = chalk.hex('#AB47BC');
const MODE_PERSONALIZATION = chalk.hex('#CE93D8');
const GOLD                = chalk.hex('#FFD700');

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

// ─── SCORE BAR ───
function bar(score: number, width: number = 25): string {
  const numScore = typeof score === 'number' ? score : parseInt(score) || 0;
  const filled   = Math.round((numScore / 100) * width);
  const empty    = width - filled;

  let barColor: chalk.Chalk;
  if (numScore >= 76)      barColor = SUCCESS;
  else if (numScore >= 51) barColor = WARNING;
  else if (numScore >= 26) barColor = BRAND_PRIMARY;
  else                     barColor = ERROR;

  return `${barColor('█'.repeat(filled))}${chalk.hex('#333333')('░'.repeat(empty))} ${barColor(`${numScore}`)}`;
}

// ─── UTILITIES ───
function trunc(text: string, max: number, fullMode: boolean = false): string {
  if (!text) return '';
  const str = String(text);
  if (fullMode || str.length <= max) return str;
  return str.substring(0, max - 3) + '...';
}

function emo(emotion: string): string {
  const lower = (emotion || '').toLowerCase();
  if (lower.includes('anger'))                               return '😠';
  if (lower.includes('happiness') || lower.includes('happy')) return '😊';
  if (lower.includes('sadness'))                             return '😢';
  if (lower.includes('fear'))                               return '😰';
  if (lower.includes('surprise'))                           return '😲';
  if (lower.includes('disgust'))                            return '🤢';
  if (lower.includes('contempt'))                           return '😤';
  if (lower.includes('pride'))                              return '😏';
  if (lower.includes('gratitude'))                          return '🙏';
  if (lower.includes('frustrat'))                           return '😤';
  if (lower.includes('flow'))                               return '⚡';
  if (lower.includes('curiosity'))                          return '🧐';
  if (lower.includes('satisfaction'))                       return '✅';
  if (lower.includes('burnout'))                            return '🔥';
  if (lower.includes('imposter'))                           return '🎭';
  return '◉';
}

function trendArrow(value: any): string {
  if (!value) return '';
  const text  = typeof value === 'string' ? value : (value?.direction || value?.trend || '');
  const lower = text.toLowerCase();
  if (lower.includes('undetermined') || lower.includes('insufficient') || lower.includes('unconfirmed')) return '';
  if (lower.includes('rising')   || lower.includes('improving')) return SUCCESS('↗ ' + text);
  if (lower.includes('falling')  || lower.includes('declining')) return ERROR('↘ ' + text);
  if (lower.includes('stable'))                                   return WARNING('→ ' + text);
  return '';
}

function extractScore(obj: any): number {
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'object' && obj !== null) return obj.score || obj.level || 0;
  return 0;
}

// ─── SECTION FILTERS ───
export type ProfileScope   = 'all' | 'daily' | 'weekly' | 'monthly';
export type DailySection   = 'all' | 'decision' | 'emotions' | 'mood' | 'behavioral';
export type WeeklySection  = 'all' | 'decision' | 'behavioral' | 'strategic' | 'summary';
export type MonthlySection = 'all' | 'archetype' | 'trends' | 'dna' | 'state' | 'predictions' | 'summary';

export interface ProfileViewOptions {
  scope?:          ProfileScope;
  dailySection?:   DailySection;
  weeklySection?:  WeeklySection;
  monthlySection?: MonthlySection;
  fullMode?:       boolean;
}

// ─── MAIN RENDER ──────────────────────────────────────────────────────────────

export async function renderProfileDashboard(opts: ProfileViewOptions = {}): Promise<void> {
  const {
    scope          = 'all',
    dailySection   = 'all',
    weeklySection  = 'all',
    monthlySection = 'all',
    fullMode       = false,
  } = opts;

  if (!isAuthenticated()) {
    console.log('');
    console.log(ERROR('  ❌ Dashboard requires authentication.'));
    console.log(MUTED('  Run `bob login` to authenticate.'));
    console.log('');
    return;
  }

  const spinner = ora({ text: INFO('  Loading your DNA profile...'), spinner: 'dots' }).start();

  try {
    const data = await callCloudFunction('getCLIProfileDashboard', {});

    if (!data?.success) {
      spinner.fail(ERROR('  ❌ Failed to load profile data.'));
      return;
    }

    spinner.stop();

    const { daily, weekly, monthly } = data;

    if (!daily?.decision && !weekly?.decision && !monthly) {
      console.log('');
      console.log(topRule());
      console.log(row(WARNING('⚠️  NO PROFILE DATA FOUND')));
      console.log(hRule());
      console.log(row(MUTED('▸ Run `bob profile --cloud` to generate your first profile.')));
      console.log(emptyRow());
      console.log(botRule());
      console.log('');
      return;
    }

    console.log('');

    // ═══════════════════════════════════════════════════════
    // DAILY TILE
    // ═══════════════════════════════════════════════════════
    if ((scope === 'all' || scope === 'daily') && (daily?.decision || daily?.mood || daily?.behavioral)) {

      console.log(topRule());
      console.log(row(INFO('📅  DAILY PROFILE')));
      console.log(hRule());

      // ─── Decision section ───
      if ((dailySection === 'all' || dailySection === 'decision') && daily.decision) {
        const d = daily.decision;
        console.log(row(MUTED('▸ Archetype:') + '  ' + BRAND_SECONDARY(trunc(d.dailyArchetype || 'Unknown', 45, fullMode))));
        console.log(row(MUTED('▸ Date:     ') + '  ' + chalk.white(d.profileDate || 'Unknown')));

        if (d.psychologicalState) {
          console.log(emptyRow());
          console.log(row(MUTED('▸ Confidence:  ') + bar(d.psychologicalState.confidence || 0)));
          console.log(row(MUTED('▸ Autonomy:    ') + bar(d.psychologicalState.autonomy   || 0)));
          console.log(row(MUTED('▸ Clarity:     ') + bar(d.psychologicalState.clarity    || 0)));
          console.log(row(MUTED('▸ Momentum:    ') + bar(d.psychologicalState.momentum   || 0)));
        }

        if (d.brutallyHonestAssessment) {
          console.log(emptyRow());
          const assessment = trunc(d.brutallyHonestAssessment, fullMode ? 9999 : 50, fullMode);
          const lines      = wrapText(assessment, BOX_WIDTH - 6);
          for (const line of lines) {
            console.log(row(MUTED(`"${line}"`)));
          }
        }
      }

      // ─── Emotions section ───
      if ((dailySection === 'all' || dailySection === 'emotions') &&
          (daily.primaryEmotion || daily.socialEmotion || daily.cognitiveEmotion)) {
        console.log(emptyRow());
        console.log(row(chalk.white('▸ Emotions')));
        if (daily.primaryEmotion?.dominantEmotion) {
          console.log(row(
            MUTED('  Primary:   ') +
            `${emo(daily.primaryEmotion.dominantEmotion)} ` +
            chalk.white(trunc(daily.primaryEmotion.dominantEmotion, 35, fullMode))
          ));
        }
        if (daily.socialEmotion?.dominantSocialEmotion) {
          console.log(row(
            MUTED('  Social:    ') +
            `${emo(daily.socialEmotion.dominantSocialEmotion)} ` +
            chalk.white(trunc(daily.socialEmotion.dominantSocialEmotion, 35, fullMode))
          ));
        }
        if (daily.cognitiveEmotion?.dominantCognitiveState) {
          console.log(row(
            MUTED('  Cognitive: ') +
            `${emo(daily.cognitiveEmotion.dominantCognitiveState)} ` +
            chalk.white(trunc(daily.cognitiveEmotion.dominantCognitiveState, 35, fullMode))
          ));
        }
      }

      // ─── Mood section ───
      if ((dailySection === 'all' || dailySection === 'mood') && daily.mood) {
        console.log(emptyRow());
        console.log(row(chalk.white('▸ Mood')));
        console.log(row(MUTED('  State: ') + chalk.white(trunc(daily.mood.unifiedMood || '', 45, fullMode))));
        console.log(row(MUTED('  Score: ') + bar(daily.mood.moodScore || 0)));
      }

      // ─── Behavioral section ───
      if ((dailySection === 'all' || dailySection === 'behavioral') && daily.behavioral) {
        const b = daily.behavioral;
        console.log(emptyRow());
        console.log(row(chalk.white('▸ Behavior')));
        console.log(row(MUTED('  Style:        ') + chalk.white(trunc(b.workStyle || '', 40, fullMode))));
        console.log(row(MUTED('  Productivity: ') + bar(b.overallProductivity || 0)));
        if (b.consistency)  console.log(row(MUTED('  Consistency:  ') + bar(extractScore(b.consistency))));
        if (b.followThrough) console.log(row(MUTED('  Follow-thru:  ') + bar(extractScore(b.followThrough))));
      }

      console.log(emptyRow());
      console.log(botRule());
      console.log('');
    }

    // ═══════════════════════════════════════════════════════
    // WEEKLY TILE
    // ═══════════════════════════════════════════════════════
    if ((scope === 'all' || scope === 'weekly') && weekly?.decision) {
      const w = weekly.decision;

      console.log(topRule());
      console.log(row(MODE_CONSULTANT('📊  WEEKLY PROFILE')));
      console.log(hRule());

      // ─── Decision section ───
      if (weeklySection === 'all' || weeklySection === 'decision') {
        console.log(row(MUTED('▸ Archetype:  ') + BRAND_SECONDARY(trunc(w.archetypeOfWeek || 'Unknown', 40, fullMode))));
        console.log(row(MUTED('▸ Edge Score: ') + bar(w.userEdgeScore || 0)));

        if (w.gritProfile) {
          const t = trendArrow(w.gritProfile.trend || w.gritProfile);
          console.log(row(MUTED('▸ Grit:       ') + bar(extractScore(w.gritProfile)) + (t ? '  ' + t : '')));
        }
        if (w.innovationProfile) {
          const t = trendArrow(w.innovationProfile.trend || w.innovationProfile);
          console.log(row(MUTED('▸ Innovation: ') + bar(extractScore(w.innovationProfile)) + (t ? '  ' + t : '')));
        }
        if (w.executionProfile) {
          const t = trendArrow(w.executionProfile.trend || w.executionProfile);
          console.log(row(MUTED('▸ Execution:  ') + bar(extractScore(w.executionProfile)) + (t ? '  ' + t : '')));
        }
      }

      // ─── Behavioral section ───
      if ((weeklySection === 'all' || weeklySection === 'behavioral')) {
        if (w.workflowProfile?.style || w.psychologicalState?.resilience) {
          console.log(emptyRow());
          console.log(row(chalk.white('▸ Behavior')));
          if (w.workflowProfile?.style) {
            console.log(row(MUTED('  Work Style:  ') + chalk.white(trunc(w.workflowProfile.style, 40, fullMode))));
          }
          if (w.psychologicalState?.resilience) {
            console.log(row(MUTED('  Resilience:  ') + bar(w.psychologicalState.resilience)));
          }
        }
      }

      // ─── Strategic section ───
      if ((weeklySection === 'all' || weeklySection === 'strategic') && w.strategicAnalysis) {
        console.log(emptyRow());
        console.log(row(chalk.white('▸ Strategic')));
        if (w.strategicAnalysis.biggestWin) {
          console.log(row(SUCCESS('+') + '  ' + MUTED('Win:    ') + chalk.white(trunc(w.strategicAnalysis.biggestWin,  45, fullMode))));
        }
        if (w.strategicAnalysis.biggestMiss) {
          console.log(row(ERROR('-') + '  ' + MUTED('Miss:   ') + chalk.white(trunc(w.strategicAnalysis.biggestMiss,  45, fullMode))));
        }
        if (w.strategicAnalysis.blindSpot) {
          console.log(row(BRAND_PRIMARY('?') + '  ' + MUTED('Blind:  ') + chalk.white(trunc(w.strategicAnalysis.blindSpot,  45, fullMode))));
        }
        if (w.strategicAnalysis.growthEdge) {
          console.log(row(INFO('↗') + '  ' + MUTED('Growth: ') + chalk.white(trunc(w.strategicAnalysis.growthEdge, 45, fullMode))));
        }
      }

      // ─── Summary section ───
      if ((weeklySection === 'all' || weeklySection === 'summary') && w.weekSummary) {
        console.log(emptyRow());
        const summary = trunc(w.weekSummary, fullMode ? 9999 : 50, fullMode);
        const lines   = wrapText(summary, BOX_WIDTH - 6);
        for (const line of lines) {
          console.log(row(MUTED(`"${line}"`)));
        }
      }

      console.log(emptyRow());
      console.log(botRule());
      console.log('');
    }

    // ═══════════════════════════════════════════════════════
    // MONTHLY TILE
    // ═══════════════════════════════════════════════════════
    if ((scope === 'all' || scope === 'monthly') && monthly) {

      console.log(topRule());
      console.log(row(GOLD('🏆  MONTHLY DNA')));
      console.log(hRule());

      // ─── Archetype section ───
      if (monthlySection === 'all' || monthlySection === 'archetype') {
        console.log(row(MUTED('▸ Archetype: ') + BRAND_SECONDARY(trunc(monthly.monthlyArchetype || 'Unknown', 40, fullMode))));
      }

      // ─── Trends section ───
      if ((monthlySection === 'all' || monthlySection === 'trends') && monthly.trendAnalysis) {
        const gritT  = trendArrow(monthly.trendAnalysis.gritTrend);
        const innovT = trendArrow(monthly.trendAnalysis.innovationTrend);
        const execT  = trendArrow(monthly.trendAnalysis.executionTrend);

        if (gritT || innovT || execT) {
          console.log(emptyRow());
          console.log(row(chalk.white('▸ Trends')));
          if (gritT)  console.log(row(MUTED('  Grit:       ') + gritT));
          if (innovT) console.log(row(MUTED('  Innovation: ') + innovT));
          if (execT)  console.log(row(MUTED('  Execution:  ') + execT));
        }

        if (monthly.trendAnalysis.overallTrajectory) {
          console.log(emptyRow());
          const traj  = trunc(monthly.trendAnalysis.overallTrajectory, fullMode ? 9999 : 50, fullMode);
          const lines = wrapText(traj, BOX_WIDTH - 6);
          for (const line of lines) {
            console.log(row(MUTED(`"${line}"`)));
          }
        }
      }

      // ─── DNA section ───
      if ((monthlySection === 'all' || monthlySection === 'dna') && monthly.personalityDNA) {
        const dna = monthly.personalityDNA;
        console.log(emptyRow());
        console.log(row(chalk.white('▸ Personality DNA')));
        if (dna.coreMotivation)  console.log(row(MUTED('  Motivation:     ') + chalk.white(trunc(dna.coreMotivation,  40, fullMode))));
        if (dna.workIdentity)    console.log(row(MUTED('  Work Identity:  ') + chalk.white(trunc(dna.workIdentity,    40, fullMode))));
        if (dna.stressResponse)  console.log(row(MUTED('  Under Stress:   ') + chalk.white(trunc(dna.stressResponse,  40, fullMode))));
        if (dna.learningStyle)   console.log(row(MUTED('  Learning Style: ') + chalk.white(trunc(dna.learningStyle,   40, fullMode))));
      }

      // ─── State section ───
      if ((monthlySection === 'all' || monthlySection === 'state') && monthly.psychologicalState) {
        const ps = monthly.psychologicalState;
        console.log(emptyRow());
        console.log(row(chalk.white('▸ Psychological State')));
        if (ps.confidence)  console.log(row(MUTED('  Confidence:  ') + bar(ps.confidence)));
        if (ps.resilience)  console.log(row(MUTED('  Resilience:  ') + bar(ps.resilience)));
        if (ps.burnoutRisk) console.log(row(MUTED('  Burnout:     ') + bar(ps.burnoutRisk)));
        if (ps.overallWellbeing && typeof ps.overallWellbeing === 'string' && ps.overallWellbeing.length < 30) {
          console.log(row(MUTED('  Wellbeing:   ') + chalk.white(ps.overallWellbeing)));
        }
      }

      // ─── Predictions section ───
      if ((monthlySection === 'all' || monthlySection === 'predictions') && monthly.predictiveInsights) {
        const pi = monthly.predictiveInsights;
        console.log(emptyRow());
        console.log(row(chalk.white('▸ Predictions')));
        if (pi.likelyNextMonthArchetype) {
          console.log(row(MUTED('  Next Month:  ') + BRAND_SECONDARY(trunc(pi.likelyNextMonthArchetype, 40, fullMode))));
        }
        if (pi.communicationStrategy) {
          console.log(row(MUTED('  Strategy:    ') + chalk.white(trunc(pi.communicationStrategy, 40, fullMode))));
        }
      }

      // ─── Summary section ───
      if ((monthlySection === 'all' || monthlySection === 'summary') && monthly.monthSummary) {
        console.log(emptyRow());
        const summary = trunc(monthly.monthSummary, fullMode ? 9999 : 50, fullMode);
        const lines   = wrapText(summary, BOX_WIDTH - 6);
        for (const line of lines) {
          console.log(row(MUTED(`"${line}"`)));
        }
      }

      console.log(emptyRow());
      console.log(botRule());
      console.log('');
    }

    // ─── Commands footer card ───
    console.log(topRule());
    console.log(row(MUTED('▸ Commands')));
    console.log(hRule());
    console.log(row(MUTED('  bob profile --view              — Interactive profile viewer')));
    console.log(row(MUTED('  bob profile --view --full        — Full text, no truncation')));
    console.log(row(MUTED('  bob profile --trends             — Sparkline trend view')));
    console.log(row(MUTED('  bob profile --cloud              — Refresh daily profile')));
    console.log(row(MUTED('  bob profile --cloud-weekly       — Refresh weekly synthesis')));
    console.log(row(MUTED('  bob profile --cloud-monthly      — Refresh monthly DNA')));
    console.log(row(MUTED('  bob chat --personalized          — Chat with DNA-aware Bob')));
    console.log(emptyRow());
    console.log(botRule());
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log('');
    console.log(ERROR(`  ❌ ${error.message}`));
    console.log('');
  }
}

// ─── WRAP TEXT ────────────────────────────────────────────────────────────────

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let   currentLine     = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}