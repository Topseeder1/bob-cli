/**
 * Profile Dashboard Renderer
 * Fetches and displays the user's complete behavioral DNA in polished terminal tiles.
 */

import chalk from 'chalk';
import ora from 'ora';
import { callCloudFunction, isAuthenticated } from '../core/api-client.js';

const AMBER = chalk.hex('#FFAB00');
const ORANGE = chalk.hex('#E66F24');
const GREEN = chalk.hex('#66BB6A');
const CYAN = chalk.cyan;
const RED = chalk.hex('#EF5350');
const GRAY = chalk.gray;
const WHITE = chalk.white;
const BORDER = chalk.hex('#455A64');
const MAGENTA = chalk.hex('#CE93D8');
const GOLD = chalk.hex('#FFD700');

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

/**
 * Returns a colored trend string, or empty string if undetermined/missing
 */
function trend(value: any): string {
  if (!value) return '';
  const text = typeof value === 'string' ? value : (value?.direction || value?.trend || '');
  const lower = text.toLowerCase();
  if (lower.includes('undetermined') || lower.includes('insufficient') || lower.includes('unconfirmed')) return '';
  if (lower.includes('rising') || lower.includes('improving')) return chalk.green('↗ ' + text);
  if (lower.includes('falling') || lower.includes('declining')) return chalk.red('↘ ' + text);
  if (lower.includes('stable')) return chalk.gray('→ ' + text);
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
    console.log(RED('  ❌ Dashboard requires authentication.'));
    console.log(GRAY('  Run `bob login` to authenticate.'));
    console.log('');
    return;
  }

  const spinner = ora({ text: CYAN('  Loading your DNA profile...'), spinner: 'dots' }).start();

  try {
    const data = await callCloudFunction('getCLIProfileDashboard', {});

    if (!data?.success) {
      spinner.fail(RED('  ❌ Failed to load profile data.'));
      return;
    }

    spinner.stop();

    const { daily, weekly, monthly } = data;

    if (!daily?.decision && !weekly?.decision && !monthly) {
      console.log('');
      console.log(AMBER('  ⚠️  No profile data found.'));
      console.log(GRAY('  Run `bob profile --cloud` to generate your first profile.'));
      console.log('');
      return;
    }

    console.log('');

    // ═══════════════════════════════════════════════════════
    // DAILY TILE
    // ═══════════════════════════════════════════════════════
    if (daily?.decision || daily?.mood || daily?.behavioral) {
      console.log(BORDER('  ╔══════════════════════════════════════════════════════════════╗'));
      console.log(BORDER('  ║') + CYAN('  📅 DAILY PROFILE'));
      console.log(BORDER('  ╠══════════════════════════════════════════════════════════════╣'));

      if (daily.decision) {
        const d = daily.decision;
        console.log(BORDER('  ║') + `  ${GRAY('Archetype:')}  ${AMBER(trunc(d.dailyArchetype || 'Unknown', 55))}`);
        console.log(BORDER('  ║') + `  ${GRAY('Date:')}       ${WHITE(d.profileDate || 'Unknown')}`);

        if (d.psychologicalState) {
          console.log(BORDER('  ║'));
          console.log(BORDER('  ║') + `  ${GRAY('Confidence:')}  ${bar(d.psychologicalState.confidence || 0)}`);
          console.log(BORDER('  ║') + `  ${GRAY('Autonomy:')}    ${bar(d.psychologicalState.autonomy || 0)}`);
          console.log(BORDER('  ║') + `  ${GRAY('Clarity:')}     ${bar(d.psychologicalState.clarity || 0)}`);
          console.log(BORDER('  ║') + `  ${GRAY('Momentum:')}    ${bar(d.psychologicalState.momentum || 0)}`);
        }

        if (d.brutallyHonestAssessment) {
          console.log(BORDER('  ║'));
          console.log(BORDER('  ║') + `  ${GRAY('"' + trunc(d.brutallyHonestAssessment, 58) + '"')}`);
        }
      }

      if (daily.primaryEmotion || daily.socialEmotion || daily.cognitiveEmotion) {
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${WHITE('Emotions:')}`);
        if (daily.primaryEmotion?.dominantEmotion) {
          console.log(BORDER('  ║') + `    ${GRAY('Primary:')}   ${emo(daily.primaryEmotion.dominantEmotion)} ${WHITE(daily.primaryEmotion.dominantEmotion)}`);
        }
        if (daily.socialEmotion?.dominantSocialEmotion) {
          console.log(BORDER('  ║') + `    ${GRAY('Social:')}    ${emo(daily.socialEmotion.dominantSocialEmotion)} ${WHITE(daily.socialEmotion.dominantSocialEmotion)}`);
        }
        if (daily.cognitiveEmotion?.dominantCognitiveState) {
          console.log(BORDER('  ║') + `    ${GRAY('Cognitive:')} ${emo(daily.cognitiveEmotion.dominantCognitiveState)} ${WHITE(trunc(daily.cognitiveEmotion.dominantCognitiveState, 40))}`);
        }
      }

      if (daily.mood) {
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${WHITE('Mood:')} ${trunc(daily.mood.unifiedMood || '', 50)}`);
        console.log(BORDER('  ║') + `  ${GRAY('Score:')} ${bar(daily.mood.moodScore || 0)}`);
      }

      if (daily.behavioral) {
        const b = daily.behavioral;
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${WHITE('Behavior:')}`);
        console.log(BORDER('  ║') + `    ${GRAY('Style:')}        ${WHITE(trunc(b.workStyle || '', 45))}`);
        console.log(BORDER('  ║') + `    ${GRAY('Productivity:')} ${bar(b.overallProductivity || 0)}`);
        if (b.consistency) console.log(BORDER('  ║') + `    ${GRAY('Consistency:')}  ${bar(extractScore(b.consistency))}`);
        if (b.followThrough) console.log(BORDER('  ║') + `    ${GRAY('Follow-thru:')}  ${bar(extractScore(b.followThrough))}`);
      }

      console.log(BORDER('  ╚══════════════════════════════════════════════════════════════╝'));
      console.log('');
    }

    // ═══════════════════════════════════════════════════════
    // WEEKLY TILE
    // ═══════════════════════════════════════════════════════
    if (weekly?.decision) {
      console.log(BORDER('  ╔══════════════════════════════════════════════════════════════╗'));
      console.log(BORDER('  ║') + MAGENTA('  📊 WEEKLY PROFILE'));
      console.log(BORDER('  ╠══════════════════════════════════════════════════════════════╣'));

      const w = weekly.decision;
      console.log(BORDER('  ║') + `  ${GRAY('Archetype:')}   ${AMBER(w.archetypeOfWeek || 'Unknown')}`);
      console.log(BORDER('  ║') + `  ${GRAY('Edge Score:')}  ${bar(w.userEdgeScore || 0)}`);

      // Scores + trends (hide undetermined trends)
      if (w.gritProfile) {
        const gritTrend = trend(w.gritProfile.trend || w.gritProfile);
        console.log(BORDER('  ║') + `  ${GRAY('Grit:')}        ${bar(extractScore(w.gritProfile))}${gritTrend ? ' ' + gritTrend : ''}`);
      }
      if (w.innovationProfile) {
        const innovTrend = trend(w.innovationProfile.trend || w.innovationProfile);
        console.log(BORDER('  ║') + `  ${GRAY('Innovation:')}  ${bar(extractScore(w.innovationProfile))}${innovTrend ? ' ' + innovTrend : ''}`);
      }
      if (w.executionProfile) {
        const execTrend = trend(w.executionProfile.trend || w.executionProfile);
        console.log(BORDER('  ║') + `  ${GRAY('Execution:')}   ${bar(extractScore(w.executionProfile))}${execTrend ? ' ' + execTrend : ''}`);
      }

      // Work style + resilience
      if (w.workflowProfile?.style) {
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${GRAY('Work Style:')}  ${WHITE(trunc(w.workflowProfile.style, 45))}`);
      }
      if (w.psychologicalState?.resilience) {
        console.log(BORDER('  ║') + `  ${GRAY('Resilience:')}  ${bar(w.psychologicalState.resilience)}`);
      }

      // Strategic analysis
      if (w.strategicAnalysis) {
        console.log(BORDER('  ║'));
        if (w.strategicAnalysis.biggestWin) {
          console.log(BORDER('  ║') + `  ${GREEN('+')} ${GRAY('Win:')}    ${trunc(w.strategicAnalysis.biggestWin, 50)}`);
        }
        if (w.strategicAnalysis.biggestMiss) {
          console.log(BORDER('  ║') + `  ${RED('-')} ${GRAY('Miss:')}   ${trunc(w.strategicAnalysis.biggestMiss, 50)}`);
        }
        if (w.strategicAnalysis.blindSpot) {
          console.log(BORDER('  ║') + `  ${ORANGE('?')} ${GRAY('Blind:')}  ${trunc(w.strategicAnalysis.blindSpot, 50)}`);
        }
        if (w.strategicAnalysis.growthEdge) {
          console.log(BORDER('  ║') + `  ${CYAN('↗')} ${GRAY('Growth:')} ${trunc(w.strategicAnalysis.growthEdge, 50)}`);
        }
      }

      // Communication guidance
      if (w.communicationGuidance) {
        const cg = w.communicationGuidance;
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${WHITE('Communication Guidance:')}`);
        if (cg.preferredTone) {
          console.log(BORDER('  ║') + `    ${GRAY('Tone:')}  ${trunc(cg.preferredTone, 52)}`);
        }
        if (cg.paceRecommendation) {
          console.log(BORDER('  ║') + `    ${GRAY('Pace:')}  ${trunc(cg.paceRecommendation, 52)}`);
        }
        if (cg.avoidTopics && cg.avoidTopics.length > 0) {
          console.log(BORDER('  ║') + `    ${GRAY('Avoid:')} ${trunc(cg.avoidTopics[0], 52)}`);
          if (cg.avoidTopics.length > 1) {
            console.log(BORDER('  ║') + `           ${trunc(cg.avoidTopics[1], 52)}`);
          }
        }
        if (cg.encourageTopics && cg.encourageTopics.length > 0) {
          console.log(BORDER('  ║') + `    ${GRAY('Push:')}  ${trunc(cg.encourageTopics[0], 52)}`);
          if (cg.encourageTopics.length > 1) {
            console.log(BORDER('  ║') + `           ${trunc(cg.encourageTopics[1], 52)}`);
          }
        }
      }

      // Week summary
      if (w.weekSummary) {
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${GRAY('"' + trunc(w.weekSummary, 58) + '"')}`);
      }

      // Weekly behavioral trends
      if (weekly.behavioral) {
        const wb = weekly.behavioral;

        const consistencyVal = trend(wb.consistencyTrend?.direction || wb.consistencyTrend);
        const followVal = trend(wb.followThroughTrend?.direction || wb.followThroughTrend);
        const focusVal = trend(wb.focusTrend?.direction || wb.focusTrend);

        // Only show if at least one has real data
        if (consistencyVal || followVal || focusVal) {
          console.log(BORDER('  ║'));
          console.log(BORDER('  ║') + `  ${WHITE('Weekly Behavior Trends:')}`);
          if (consistencyVal) console.log(BORDER('  ║') + `    ${GRAY('Consistency:')} ${consistencyVal}`);
          if (followVal) console.log(BORDER('  ║') + `    ${GRAY('Follow-thru:')} ${followVal}`);
          if (focusVal) console.log(BORDER('  ║') + `    ${GRAY('Focus:')}       ${focusVal}`);
        }

        if (wb.weekSummary) {
          console.log(BORDER('  ║'));
          console.log(BORDER('  ║') + `  ${GRAY('"' + trunc(wb.weekSummary, 58) + '"')}`);
        }
      }

      console.log(BORDER('  ╚══════════════════════════════════════════════════════════════╝'));
      console.log('');
    }

    // ═══════════════════════════════════════════════════════
    // MONTHLY TILE
    // ═══════════════════════════════════════════════════════
    if (monthly) {
      console.log(BORDER('  ╔══════════════════════════════════════════════════════════════╗'));
      console.log(BORDER('  ║') + GOLD('  🏆 MONTHLY DNA'));
      console.log(BORDER('  ╠══════════════════════════════════════════════════════════════╣'));

      console.log(BORDER('  ║') + `  ${GRAY('Archetype:')}  ${AMBER(monthly.monthlyArchetype || 'Unknown')}`);

      if (monthly.trendAnalysis) {
        const gritT = trend(monthly.trendAnalysis.gritTrend);
        const innovT = trend(monthly.trendAnalysis.innovationTrend);
        const execT = trend(monthly.trendAnalysis.executionTrend);

        if (gritT || innovT || execT) {
          console.log(BORDER('  ║'));
          if (gritT) console.log(BORDER('  ║') + `  ${GRAY('Grit:')}       ${gritT}`);
          if (innovT) console.log(BORDER('  ║') + `  ${GRAY('Innovation:')} ${innovT}`);
          if (execT) console.log(BORDER('  ║') + `  ${GRAY('Execution:')}  ${execT}`);
        }
      }

      if (monthly.trendAnalysis?.overallTrajectory) {
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${GRAY('"' + trunc(monthly.trendAnalysis.overallTrajectory, 58) + '"')}`);
      }

      if (monthly.personalityDNA) {
        const dna = monthly.personalityDNA;
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${WHITE('Personality DNA:')}`);
        if (dna.coreMotivation) console.log(BORDER('  ║') + `    ${GRAY('Motivation:')}    ${trunc(dna.coreMotivation, 48)}`);
        if (dna.workIdentity) console.log(BORDER('  ║') + `    ${GRAY('Work Identity:')} ${trunc(dna.workIdentity, 48)}`);
        if (dna.stressResponse) console.log(BORDER('  ║') + `    ${GRAY('Under Stress:')}  ${trunc(dna.stressResponse, 48)}`);
        if (dna.learningStyle) console.log(BORDER('  ║') + `    ${GRAY('Learning:')}      ${trunc(dna.learningStyle, 48)}`);
      }

      if (monthly.psychologicalState) {
        const ps = monthly.psychologicalState;
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${WHITE('State:')}`);
        if (ps.confidence) console.log(BORDER('  ║') + `    ${GRAY('Confidence:')} ${bar(ps.confidence)}`);
        if (ps.resilience) console.log(BORDER('  ║') + `    ${GRAY('Resilience:')} ${bar(ps.resilience)}`);
        if (ps.burnoutRisk) console.log(BORDER('  ║') + `    ${GRAY('Burnout:')}    ${bar(ps.burnoutRisk)}`);
        if (ps.overallWellbeing && typeof ps.overallWellbeing === 'string' && ps.overallWellbeing.length < 30) {
          console.log(BORDER('  ║') + `    ${GRAY('Wellbeing:')}  ${WHITE(ps.overallWellbeing)}`);
        }
      }

      if (monthly.predictiveInsights) {
        const pi = monthly.predictiveInsights;
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${WHITE('Predictions:')}`);
        if (pi.likelyNextMonthArchetype) {
          console.log(BORDER('  ║') + `    ${GRAY('Next Month:')} ${AMBER(trunc(pi.likelyNextMonthArchetype, 45))}`);
        }
        if (pi.communicationStrategy) {
          console.log(BORDER('  ║') + `    ${GRAY('Strategy:')}   ${trunc(pi.communicationStrategy, 48)}`);
        }
      }

      if (monthly.monthSummary) {
        console.log(BORDER('  ║'));
        console.log(BORDER('  ║') + `  ${GRAY('"' + trunc(monthly.monthSummary, 58) + '"')}`);
      }

      console.log(BORDER('  ╚══════════════════════════════════════════════════════════════╝'));
      console.log('');
    }

    // ═══════════════════════════════════════════════════════
    // COMMANDS FOOTER
    // ═══════════════════════════════════════════════════════
    console.log(BORDER('  ┌──────────────────────────────────────────────────────────────┐'));
    console.log(BORDER('  │') + GRAY('  Commands:'));
    console.log(BORDER('  │') + GRAY('    bob profile --cloud          — Refresh daily profile'));
    console.log(BORDER('  │') + GRAY('    bob profile --cloud-weekly   — Refresh weekly synthesis'));
    console.log(BORDER('  │') + GRAY('    bob profile --cloud-monthly  — Refresh monthly DNA'));
    console.log(BORDER('  │') + GRAY('    bob chat --personalized      — Chat with DNA-aware Bob'));
    console.log(BORDER('  └──────────────────────────────────────────────────────────────┘'));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log('');
    console.log(RED(`  ❌ ${error.message}`));
    console.log('');
  }
}