import chalk from 'chalk';
import ora from 'ora';
import { callCloudFunction, isAuthenticated } from '../core/api-client.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const MODE_CONSULTANT = chalk.hex('#AB47BC');
const MODE_PERSONALIZATION = chalk.hex('#CE93D8');
const GOLD = chalk.hex('#FFD700');
const BORDER = chalk.hex('#455A64');

// ─── DASHBOARD HELPERS ───
const DASH_WIDTH = 62;

function topRule(): string { return BORDER('  ╔' + '═'.repeat(DASH_WIDTH) + '╗'); }
function botRule(): string { return BORDER('  ╚' + '═'.repeat(DASH_WIDTH) + '╝'); }
function midRule(): string { return BORDER('  ╠' + '═'.repeat(DASH_WIDTH) + '╣'); }
function row(content: string): string {
  const stripped = content.replace(/\x1B\[[0-9;]*m/g, '');
  const pad = DASH_WIDTH - stripped.length;
  return BORDER('  ║') + content + (pad > 0 ? ' '.repeat(pad) : '') + BORDER('║');
}

function bar(score: number, width: number = 25): string {
  const numScore = typeof score === 'number' ? score : parseInt(score) || 0;
  const filled = Math.round((numScore / 100) * width);
  const empty = width - filled;

  let barColor;
  if (numScore >= 75) barColor = chalk.hex('#66BB6A');
  else if (numScore >= 50) barColor = chalk.hex('#FFAB00');
  else if (numScore >= 25) barColor = chalk.hex('#E66F24');
  else barColor = chalk.hex('#EF5350');

  return `${barColor('█'.repeat(filled))}${chalk.hex('#333333')('░'.repeat(empty))} ${barColor(`${numScore}`)}`;
}

function trunc(text: string, max: number): string {
  if (!text) return '';
  const str = String(text);
  if (str.length <= max) return str;
  return str.substring(0, max - 3) + '...';
}

function emo(emotion: string): string {
  const lower = (emotion || '').toLowerCase();
  if (lower.includes('anger')) return '😠';
  if (lower.includes('happiness') || lower.includes('happy')) return '😊';
  if (lower.includes('sadness')) return '😢';
  if (lower.includes('fear')) return '😰';
  if (lower.includes('surprise')) return '😲';
  if (lower.includes('disgust')) return '🤢';
  if (lower.includes('contempt')) return '😤';
  if (lower.includes('pride')) return '😏';
  if (lower.includes('gratitude')) return '🙏';
  if (lower.includes('frustrat')) return '😤';
  if (lower.includes('flow')) return '⚡';
  if (lower.includes('curiosity')) return '🧐';
  if (lower.includes('satisfaction')) return '✅';
  if (lower.includes('burnout')) return '🔥';
  if (lower.includes('imposter')) return '🎭';
  return '◉';
}

function trend(value: any): string {
  if (!value) return '';
  const text = typeof value === 'string' ? value : (value?.direction || value?.trend || '');
  const lower = text.toLowerCase();
  if (lower.includes('undetermined') || lower.includes('insufficient') || lower.includes('unconfirmed')) return '';
  if (lower.includes('rising') || lower.includes('improving')) return SUCCESS('↗ ' + text);
  if (lower.includes('falling') || lower.includes('declining')) return ERROR('↘ ' + text);
  if (lower.includes('stable')) return MUTED('→ ' + text);
  return '';
}

function extractScore(obj: any): number {
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'object' && obj !== null) return obj.score || obj.level || 0;
  return 0;
}

export async function renderProfileDashboard(): Promise<void> {
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
      console.log(WARNING('  ⚠️  No profile data found.'));
      console.log(MUTED('  Run `bob profile --cloud` to generate your first profile.'));
      console.log('');
      return;
    }

    console.log('');

    // ═══════════════════════════════════════════════════════
    // DAILY TILE
    // ═══════════════════════════════════════════════════════
    if (daily?.decision || daily?.mood || daily?.behavioral) {
      console.log(topRule());
      console.log(row(INFO('  📅 DAILY PROFILE')));
      console.log(midRule());

      if (daily.decision) {
        const d = daily.decision;
        console.log(row(`  ${MUTED('Archetype:')}  ${BRAND_SECONDARY(trunc(d.dailyArchetype || 'Unknown', 45))}`));
        console.log(row(`  ${MUTED('Date:')}       ${chalk.white(d.profileDate || 'Unknown')}`));

        if (d.psychologicalState) {
          console.log(row(''));
          console.log(row(`  ${MUTED('Confidence:')}  ${bar(d.psychologicalState.confidence || 0)}`));
          console.log(row(`  ${MUTED('Autonomy:')}    ${bar(d.psychologicalState.autonomy || 0)}`));
          console.log(row(`  ${MUTED('Clarity:')}     ${bar(d.psychologicalState.clarity || 0)}`));
          console.log(row(`  ${MUTED('Momentum:')}    ${bar(d.psychologicalState.momentum || 0)}`));
        }

        if (d.brutallyHonestAssessment) {
          console.log(row(''));
          console.log(row(`  ${MUTED('"' + trunc(d.brutallyHonestAssessment, 50) + '"')}`));
        }
      }

      if (daily.primaryEmotion || daily.socialEmotion || daily.cognitiveEmotion) {
        console.log(row(''));
        console.log(row(`  ${chalk.white('Emotions:')}`));
        if (daily.primaryEmotion?.dominantEmotion) {
          console.log(row(`    ${MUTED('Primary:')}   ${emo(daily.primaryEmotion.dominantEmotion)} ${chalk.white(daily.primaryEmotion.dominantEmotion)}`));
        }
        if (daily.socialEmotion?.dominantSocialEmotion) {
          console.log(row(`    ${MUTED('Social:')}    ${emo(daily.socialEmotion.dominantSocialEmotion)} ${chalk.white(daily.socialEmotion.dominantSocialEmotion)}`));
        }
        if (daily.cognitiveEmotion?.dominantCognitiveState) {
          console.log(row(`    ${MUTED('Cognitive:')} ${emo(daily.cognitiveEmotion.dominantCognitiveState)} ${chalk.white(trunc(daily.cognitiveEmotion.dominantCognitiveState, 35))}`));
        }
      }

      if (daily.mood) {
        console.log(row(''));
        console.log(row(`  ${chalk.white('Mood:')} ${trunc(daily.mood.unifiedMood || '', 45)}`));
        console.log(row(`  ${MUTED('Score:')} ${bar(daily.mood.moodScore || 0)}`));
      }

      if (daily.behavioral) {
        const b = daily.behavioral;
        console.log(row(''));
        console.log(row(`  ${chalk.white('Behavior:')}`));
        console.log(row(`    ${MUTED('Style:')}        ${chalk.white(trunc(b.workStyle || '', 40))}`));
        console.log(row(`    ${MUTED('Productivity:')} ${bar(b.overallProductivity || 0)}`));
        if (b.consistency) console.log(row(`    ${MUTED('Consistency:')}  ${bar(extractScore(b.consistency))}`));
        if (b.followThrough) console.log(row(`    ${MUTED('Follow-thru:')}  ${bar(extractScore(b.followThrough))}`));
      }

      console.log(botRule());
      console.log('');
    }

    // ═══════════════════════════════════════════════════════
    // WEEKLY TILE
    // ═══════════════════════════════════════════════════════
    if (weekly?.decision) {
      console.log(topRule());
      console.log(row(MODE_CONSULTANT('  📊 WEEKLY PROFILE')));
      console.log(midRule());

      const w = weekly.decision;
      console.log(row(`  ${MUTED('Archetype:')}   ${BRAND_SECONDARY(w.archetypeOfWeek || 'Unknown')}`));
      console.log(row(`  ${MUTED('Edge Score:')}  ${bar(w.userEdgeScore || 0)}`));

      if (w.gritProfile) {
        const gritTrend = trend(w.gritProfile.trend || w.gritProfile);
        console.log(row(`  ${MUTED('Grit:')}        ${bar(extractScore(w.gritProfile))}${gritTrend ? ' ' + gritTrend : ''}`));
      }
      if (w.innovationProfile) {
        const innovTrend = trend(w.innovationProfile.trend || w.innovationProfile);
        console.log(row(`  ${MUTED('Innovation:')}  ${bar(extractScore(w.innovationProfile))}${innovTrend ? ' ' + innovTrend : ''}`));
      }
      if (w.executionProfile) {
        const execTrend = trend(w.executionProfile.trend || w.executionProfile);
        console.log(row(`  ${MUTED('Execution:')}   ${bar(extractScore(w.executionProfile))}${execTrend ? ' ' + execTrend : ''}`));
      }

      if (w.workflowProfile?.style) {
        console.log(row(''));
        console.log(row(`  ${MUTED('Work Style:')}  ${chalk.white(trunc(w.workflowProfile.style, 40))}`));
      }
      if (w.psychologicalState?.resilience) {
        console.log(row(`  ${MUTED('Resilience:')}  ${bar(w.psychologicalState.resilience)}`));
      }

      if (w.strategicAnalysis) {
        console.log(row(''));
        if (w.strategicAnalysis.biggestWin) {
          console.log(row(`  ${SUCCESS('+')} ${MUTED('Win:')}    ${trunc(w.strategicAnalysis.biggestWin, 45)}`));
        }
        if (w.strategicAnalysis.biggestMiss) {
          console.log(row(`  ${ERROR('-')} ${MUTED('Miss:')}   ${trunc(w.strategicAnalysis.biggestMiss, 45)}`));
        }
        if (w.strategicAnalysis.blindSpot) {
          console.log(row(`  ${BRAND_PRIMARY('?')} ${MUTED('Blind:')}  ${trunc(w.strategicAnalysis.blindSpot, 45)}`));
        }
        if (w.strategicAnalysis.growthEdge) {
          console.log(row(`  ${INFO('↗')} ${MUTED('Growth:')} ${trunc(w.strategicAnalysis.growthEdge, 45)}`));
        }
      }

      if (w.weekSummary) {
        console.log(row(''));
        console.log(row(`  ${MUTED('"' + trunc(w.weekSummary, 50) + '"')}`));
      }

      console.log(botRule());
      console.log('');
    }

    // ═══════════════════════════════════════════════════════
    // MONTHLY TILE
    // ═══════════════════════════════════════════════════════
    if (monthly) {
      console.log(topRule());
      console.log(row(GOLD('  🏆 MONTHLY DNA')));
      console.log(midRule());

      console.log(row(`  ${MUTED('Archetype:')}  ${BRAND_SECONDARY(monthly.monthlyArchetype || 'Unknown')}`));

      if (monthly.trendAnalysis) {
        const gritT = trend(monthly.trendAnalysis.gritTrend);
        const innovT = trend(monthly.trendAnalysis.innovationTrend);
        const execT = trend(monthly.trendAnalysis.executionTrend);

        if (gritT || innovT || execT) {
          console.log(row(''));
          if (gritT) console.log(row(`  ${MUTED('Grit:')}       ${gritT}`));
          if (innovT) console.log(row(`  ${MUTED('Innovation:')} ${innovT}`));
          if (execT) console.log(row(`  ${MUTED('Execution:')}  ${execT}`));
        }
      }

      if (monthly.trendAnalysis?.overallTrajectory) {
        console.log(row(''));
        console.log(row(`  ${MUTED('"' + trunc(monthly.trendAnalysis.overallTrajectory, 50) + '"')}`));
      }

      if (monthly.personalityDNA) {
        const dna = monthly.personalityDNA;
        console.log(row(''));
        console.log(row(`  ${chalk.white('Personality DNA:')}`));
        if (dna.coreMotivation) console.log(row(`    ${MUTED('Motivation:')}    ${trunc(dna.coreMotivation, 42)}`));
        if (dna.workIdentity) console.log(row(`    ${MUTED('Work Identity:')} ${trunc(dna.workIdentity, 42)}`));
        if (dna.stressResponse) console.log(row(`    ${MUTED('Under Stress:')}  ${trunc(dna.stressResponse, 42)}`));
        if (dna.learningStyle) console.log(row(`    ${MUTED('Learning:')}      ${trunc(dna.learningStyle, 42)}`));
      }

      if (monthly.psychologicalState) {
        const ps = monthly.psychologicalState;
        console.log(row(''));
        console.log(row(`  ${chalk.white('State:')}`));
        if (ps.confidence) console.log(row(`    ${MUTED('Confidence:')} ${bar(ps.confidence)}`));
        if (ps.resilience) console.log(row(`    ${MUTED('Resilience:')} ${bar(ps.resilience)}`));
        if (ps.burnoutRisk) console.log(row(`    ${MUTED('Burnout:')}    ${bar(ps.burnoutRisk)}`));
        if (ps.overallWellbeing && typeof ps.overallWellbeing === 'string' && ps.overallWellbeing.length < 30) {
          console.log(row(`    ${MUTED('Wellbeing:')}  ${chalk.white(ps.overallWellbeing)}`));
        }
      }

      if (monthly.predictiveInsights) {
        const pi = monthly.predictiveInsights;
        console.log(row(''));
        console.log(row(`  ${chalk.white('Predictions:')}`));
        if (pi.likelyNextMonthArchetype) {
          console.log(row(`    ${MUTED('Next Month:')} ${BRAND_SECONDARY(trunc(pi.likelyNextMonthArchetype, 40))}`));
        }
        if (pi.communicationStrategy) {
          console.log(row(`    ${MUTED('Strategy:')}   ${trunc(pi.communicationStrategy, 42)}`));
        }
      }

      if (monthly.monthSummary) {
        console.log(row(''));
        console.log(row(`  ${MUTED('"' + trunc(monthly.monthSummary, 50) + '"')}`));
      }

      console.log(botRule());
      console.log('');
    }

    // ═══════════════════════════════════════════════════════
    // COMMANDS FOOTER
    // ═══════════════════════════════════════════════════════
    console.log(MUTED('  Commands:'));
    console.log(MUTED('    ▸ bob profile --cloud          — Refresh daily profile'));
    console.log(MUTED('    ▸ bob profile --cloud-weekly   — Refresh weekly synthesis'));
    console.log(MUTED('    ▸ bob profile --cloud-monthly  — Refresh monthly DNA'));
    console.log(MUTED('    ▸ bob chat --personalized      — Chat with DNA-aware Bob'));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log('');
    console.log(ERROR(`  ❌ ${error.message}`));
    console.log('');
  }
}