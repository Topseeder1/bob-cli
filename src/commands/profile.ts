import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../core/config-store.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { isAuthenticated } from '../core/api-client.js';
import { runCloudProfiler, ProfileScope } from '../core/cloud-profiler.js';
import { renderProfileDashboard } from '../ui/profile-dashboard.js';
import {
  saveDailyProfile,
  saveWeeklyProfile,
  saveMonthlyProfile,
  loadDailyProfiles,
  loadWeeklyProfiles,
  loadCurrentDNA,
  getTodayMessages,
  getConversationMessages,
  DailyProfile,
  WeeklyProfile,
  MonthlyProfile,
} from '../core/profile-store.js';
import * as path from 'path';

const AMBER = chalk.hex('#FFAB00');
const GREEN = chalk.hex('#66BB6A');
const BLUE = chalk.hex('#42A5F5');
const GRAY = chalk.gray;
const CYAN = chalk.cyan;
const RED = chalk.hex('#EF5350');
const BORDER = chalk.hex('#455A64');

export function registerProfileCommand(program: Command): void {
  program
    .command('profile')
    .description('Generate and view your behavioral profile — how you work, think, and communicate')
    .option('--today', 'Generate today\'s profile from today\'s conversations')
    .option('--week', 'Synthesize the last 7 daily profiles into a weekly profile')
    .option('--month', 'Synthesize all dailies + weeklies into a monthly profile')
    .option('--cloud', 'Run cloud-powered profiling (Power tier only)')
    .option('--cloud-weekly', 'Run cloud weekly synthesis (Power tier only)')
    .option('--cloud-monthly', 'Run cloud monthly synthesis (Power tier only)')
    .option('--view', 'View your DNA dashboard')
    .action(async (options: { today?: boolean; week?: boolean; month?: boolean; cloud?: boolean; cloudWeekly?: boolean; cloudMonthly?: boolean; view?: boolean }) => {
      const config = getConfig();

      // ─── Cloud profiling paths ───
      if (options.cloud) {
        await handleCloudProfile('daily');
        return;
      }
      if (options.cloudWeekly) {
        await handleCloudProfile('weekly');
        return;
      }
      if (options.cloudMonthly) {
        await handleCloudProfile('monthly');
        return;
      }

      // ─── Dashboard view ───
      if (options.view) {
        await renderProfileDashboard();
        return;
      }

      // ─── Local profiling paths ───
      if (config.provider !== 'local' || !config.localEndpoint) {
        // No local model — show dashboard if authenticated, otherwise show help
        if (isAuthenticated()) {
          await renderProfileDashboard();
        } else {
          showLocalHelp();
        }
        return;
      }

      if (options.today) {
        await generateDailyProfile(config);
      } else if (options.week) {
        await generateWeeklyProfile(config);
      } else if (options.month) {
        await generateMonthlyProfile(config);
      } else {
        // Default: show dashboard if authenticated, otherwise local DNA
        if (isAuthenticated()) {
          await renderProfileDashboard();
        } else {
          showCurrentProfile();
        }
      }
    });
}

// ═══════════════════════════════════════════════════════════
// CLOUD PROFILE HANDLER
// ═══════════════════════════════════════════════════════════

async function handleCloudProfile(scope: ProfileScope): Promise<void> {
  if (!isAuthenticated()) {
    console.log('');
    console.log(RED('  ❌ Cloud profiling requires authentication.'));
    console.log(GRAY('  Run `bob login` to authenticate.'));
    console.log('');
    return;
  }

  console.log('');
  console.log(AMBER(`  🧬 Running cloud ${scope} profiling (Power tier)...`));
  console.log('');

  try {
    await runCloudProfiler({
      scope,
      onProgress: (msg) => console.log(msg),
    });
  } catch (error: any) {
    console.log('');
    if (error.message.includes('Power tier')) {
      console.log(RED('  ❌ Cloud profiling requires Power tier.'));
      console.log(GRAY('  Upgrade at: app.bobsworkshop.com/upgrade'));
    } else {
      console.log(RED(`  ❌ ${error.message}`));
    }
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// LOCAL HELP (no local model, not authenticated)
// ═══════════════════════════════════════════════════════════

function showLocalHelp(): void {
  console.log('');
  console.log(RED('  ❌ No profile source available.'));
  console.log('');
  console.log(GRAY('  For local profiling:'));
  console.log(GRAY('    bob config set provider local'));
  console.log(GRAY('    bob config set localEndpoint http://127.0.0.1:11434/api/chat'));
  console.log('');
  console.log(GRAY('  For cloud profiling (Power tier):'));
  console.log(GRAY('    bob login'));
  console.log(GRAY('    bob profile --cloud          — Daily cloud profile'));
  console.log(GRAY('    bob profile --cloud-weekly   — Weekly synthesis'));
  console.log(GRAY('    bob profile --cloud-monthly  — Monthly DNA'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════
// SHOW CURRENT PROFILE (Local DNA — fallback)
// ═══════════════════════════════════════════════════════════

function showCurrentProfile(): void {
  const dna = loadCurrentDNA();

  if (!dna) {
    console.log('');
    console.log(AMBER('  ⚠️  No profile generated yet.'));
    console.log(GRAY('  Run `bob profile --today` to generate your first profile.'));
    console.log('');
    return;
  }

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + AMBER('  🧬 Your Current DNA Profile'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + CYAN(`  Archetype: ${dna.archetype || 'Unknown'}`));
  console.log(BORDER('  ║') + GRAY(`  Communication: ${dna.communicationStyle || 'Unknown'}`));
  console.log(BORDER('  ║') + GRAY(`  Work Rhythm: ${dna.workRhythm || 'Unknown'}`));
  console.log(BORDER('  ║') + GRAY(`  Emotional State: ${dna.emotionalState || 'Unknown'}`));
  console.log(BORDER('  ║') + GRAY(`  Decision Making: ${dna.decisionMaking || 'Unknown'}`));
  if (dna.growth) {
    console.log(BORDER('  ║') + GREEN(`  Growth: ${dna.growth}`));
  }
  console.log(BORDER('  ║'));
  console.log(BORDER('  ║') + GRAY(`  Last updated: ${dna.lastUpdated || 'Never'} (${dna.source || 'unknown'})`));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log(GRAY('  Commands:'));
  console.log(GRAY('    bob profile --today          — Local daily profile'));
  console.log(GRAY('    bob profile --week           — Local weekly synthesis'));
  console.log(GRAY('    bob profile --month          — Local monthly synthesis'));
  console.log(GRAY('    bob profile --cloud          — Cloud daily (Power tier)'));
  console.log(GRAY('    bob profile --cloud-weekly   — Cloud weekly (Power tier)'));
  console.log(GRAY('    bob profile --cloud-monthly  — Cloud monthly (Power tier)'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════
// DAILY PROFILE (LOCAL)
// ═══════════════════════════════════════════════════════════

async function generateDailyProfile(config: any): Promise<void> {
  const messages = await getTodayMessages();

  if (messages.length === 0) {
    console.log('');
    console.log(AMBER('  ⚠️  No conversations found for today.'));
    console.log(GRAY('  Chat with Bob first, then run this command.'));
    console.log('');
    return;
  }

  const userMessages = messages.filter(m => m.role === 'user');
  const projectName = path.basename(process.cwd());

  console.log('');
  console.log(CYAN(`  🧬 Generating daily profile from ${userMessages.length} messages...`));
  console.log('');

  const spinner = ora({ text: CYAN('  Analyzing your communication patterns...'), spinner: 'dots' }).start();

  const conversationText = messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');

  const prompt = `You are a behavioral psychologist and communication analyst. Analyze the following conversation transcript from today and produce a detailed behavioral profile of the USER (not the assistant).

CONVERSATION TRANSCRIPT:
${conversationText}

Respond with ONLY a valid JSON object matching this EXACT structure. Include REAL quotes from the user as evidence for each assessment. Provide a confidence score (0-100) for each dimension based on how much evidence exists in the transcript.

{
  "communicationStyle": {
    "tone": "description of their tone (e.g., direct and impatient, curious and exploratory, formal and precise)",
    "verbosity": "terse/moderate/verbose",
    "questionRatio": 0.0 to 1.0 (how much they ask vs state),
    "confidence": 0-100,
    "examples": ["exact quote 1 that demonstrates this", "exact quote 2"]
  },
  "mentality": {
    "patience": "high/moderate/low",
    "approach": "methodical/chaotic/adaptive/burst-driven",
    "optimism": "optimistic/pragmatic/pessimistic/frustrated",
    "confidence": 0-100,
    "examples": ["exact quote showing their mentality", "another quote"]
  },
  "goalPatterns": {
    "clarity": "very clear/somewhat clear/vague/exploratory",
    "followThrough": "high/moderate/scattered",
    "currentGoals": ["goal 1 they're working toward", "goal 2"],
    "confidence": 0-100,
    "examples": ["quote about their goals", "quote showing follow-through"]
  },
  "workFrequency": {
    "sessionCount": number of distinct work sessions today,
    "averageDuration": "short (< 30 min) / medium (30-90 min) / long (90+ min)",
    "peakHours": "morning/afternoon/evening/night",
    "pattern": "steady/burst-mode/intermittent",
    "confidence": 0-100
  },
  "emotionalState": {
    "dominant": "primary emotion today (frustrated/excited/calm/anxious/determined/etc)",
    "secondary": "secondary emotion",
    "triggers": ["what caused emotional shifts"],
    "confidence": 0-100,
    "quotes": ["exact quote showing emotion 1", "exact quote showing emotion 2"]
  },
  "decisionStyle": {
    "speed": "instant/fast/deliberate/slow/indecisive",
    "riskTolerance": "high/moderate/cautious/risk-averse",
    "independence": "fully independent/seeks validation/collaborative/dependent",
    "confidence": 0-100,
    "examples": ["quote showing decision-making", "another example"]
  },
  "technicalDepth": {
    "level": "beginner/intermediate/senior/expert",
    "focusAreas": ["area 1", "area 2"],
    "confidence": 0-100
  },
  "userQuotes": ["5-8 most revealing/characteristic quotes from the user that capture who they are today"]
}

IMPORTANT: Only include assessments you have EVIDENCE for. Use exact quotes from the transcript. Do NOT fabricate or assume beyond what the text shows.`;

  try {
    const aiMessages: LocalChatMessage[] = [
      { role: 'system', content: 'You are a behavioral analyst. Respond with ONLY valid JSON. No explanation.' },
      { role: 'user', content: prompt },
    ];

    const response = await callLocalModel(config.localEndpoint!, aiMessages);
    spinner.stop();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(RED('  ❌ Could not parse profile response.'));
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const today = new Date().toISOString().split('T')[0];

    const profile: DailyProfile = {
      date: today,
      projectName: projectName,
      messageCount: messages.length,
      ...parsed,
      generatedAt: new Date().toISOString(),
    };

    saveDailyProfile(profile);

    console.log('');
    console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
    console.log(BORDER('  ║') + AMBER(`  🧬 Daily Profile — ${today}`));
    console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
    console.log(BORDER('  ║') + CYAN(`  Communication: ${parsed.communicationStyle?.tone || 'Unknown'} (${parsed.communicationStyle?.confidence || 0}%)`));
    console.log(BORDER('  ║') + CYAN(`  Mentality: ${parsed.mentality?.approach || 'Unknown'}, ${parsed.mentality?.optimism || ''} (${parsed.mentality?.confidence || 0}%)`));
    console.log(BORDER('  ║') + CYAN(`  Emotional State: ${parsed.emotionalState?.dominant || 'Unknown'} (${parsed.emotionalState?.confidence || 0}%)`));
    console.log(BORDER('  ║') + CYAN(`  Decision Style: ${parsed.decisionStyle?.speed || 'Unknown'}, ${parsed.decisionStyle?.riskTolerance || ''} (${parsed.decisionStyle?.confidence || 0}%)`));
    console.log(BORDER('  ║') + CYAN(`  Work Pattern: ${parsed.workFrequency?.pattern || 'Unknown'}`));
    console.log(BORDER('  ║'));

    if (parsed.userQuotes && parsed.userQuotes.length > 0) {
      console.log(BORDER('  ║') + GRAY('  Key Quotes:'));
      for (const quote of parsed.userQuotes.slice(0, 4)) {
        console.log(BORDER('  ║') + GRAY(`    "${quote.slice(0, 70)}${quote.length > 70 ? '...' : ''}"`));
      }
    }

    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(GREEN(`  ✅ Saved to: ~/.bob/projects/${projectName}/profile/daily/${today}.json`));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log(RED(`  ❌ ${error.message}`));
  }
}

// ═══════════════════════════════════════════════════════════
// WEEKLY PROFILE (LOCAL)
// ═══════════════════════════════════════════════════════════

async function generateWeeklyProfile(config: any): Promise<void> {
  const dailies = loadDailyProfiles(7);

  if (dailies.length === 0) {
    console.log('');
    console.log(AMBER('  ⚠️  No daily profiles found.'));
    console.log(GRAY('  Run `bob profile --today` for at least a few days first.'));
    console.log('');
    return;
  }

  console.log('');
  console.log(CYAN(`  🧬 Synthesizing weekly profile from ${dailies.length} daily profiles...`));
  console.log('');

  const spinner = ora({ text: CYAN('  Analyzing patterns across days...'), spinner: 'dots' }).start();

  const dailySummaries = dailies.map(d => ({
    date: d.date,
    communication: d.communicationStyle?.tone,
    mentality: d.mentality?.approach + ', ' + d.mentality?.optimism,
    emotion: d.emotionalState?.dominant,
    workPattern: d.workFrequency?.pattern,
    goals: d.goalPatterns?.currentGoals,
    quotes: d.userQuotes?.slice(0, 3),
  }));

  const prompt = `You are a behavioral psychologist analyzing how a person changed over a week. Below are their daily profiles from the past ${dailies.length} days. Analyze the EVOLUTION and PATTERNS across days.

DAILY PROFILES:
${JSON.stringify(dailySummaries, null, 2)}

Respond with ONLY a valid JSON object:

{
  "trajectory": "One sentence describing the overall direction of change this week",
  "energyPattern": "When their energy peaked and dropped across the week",
  "moodShift": "How their emotional state changed from the start to end of the week, with quotes as evidence",
  "focusEvolution": "How their focus/goals shifted day by day",
  "communicationShift": "How their communication style changed over the week",
  "dailySummaries": [{"date": "2026-06-01", "summary": "one-line summary of that day"}],
  "keyMoments": [{"date": "2026-06-03", "event": "what happened", "quote": "exact user quote from that day"}],
  "confidence": 0-100
}

Use REAL quotes from the daily profiles as evidence. Show how the person CHANGED, not just what they were on average.`;

  try {
    const aiMessages: LocalChatMessage[] = [
      { role: 'system', content: 'You are a behavioral analyst synthesizing weekly patterns. Respond with ONLY valid JSON.' },
      { role: 'user', content: prompt },
    ];

    const response = await callLocalModel(config.localEndpoint!, aiMessages);
    spinner.stop();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(RED('  ❌ Could not parse weekly profile.'));
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const now = new Date();
    const weekNum = getWeekNumber(now);
    const weekId = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

    const profile: WeeklyProfile = {
      weekOf: weekId,
      dateRange: `${dailies[dailies.length - 1]?.date || '?'} to ${dailies[0]?.date || '?'}`,
      ...parsed,
      generatedAt: new Date().toISOString(),
    };

    saveWeeklyProfile(profile);

    console.log('');
    console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
    console.log(BORDER('  ║') + AMBER(`  🧬 Weekly Profile — ${weekId}`));
    console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
    console.log(BORDER('  ║') + CYAN(`  Trajectory: ${parsed.trajectory || 'Unknown'}`));
    console.log(BORDER('  ║') + GRAY(`  Energy: ${parsed.energyPattern || 'Unknown'}`));
    console.log(BORDER('  ║') + GRAY(`  Mood Shift: ${parsed.moodShift || 'Unknown'}`));
    console.log(BORDER('  ║') + GRAY(`  Focus: ${parsed.focusEvolution || 'Unknown'}`));
    console.log(BORDER('  ║') + GRAY(`  Communication: ${parsed.communicationShift || 'Unknown'}`));

    if (parsed.keyMoments && parsed.keyMoments.length > 0) {
      console.log(BORDER('  ║'));
      console.log(BORDER('  ║') + GRAY('  Key Moments:'));
      for (const moment of parsed.keyMoments.slice(0, 3)) {
        console.log(BORDER('  ║') + GRAY(`    ${moment.date}: ${moment.event}`));
        if (moment.quote) console.log(BORDER('  ║') + GRAY(`    "${moment.quote.slice(0, 60)}..."`));
      }
    }

    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(GREEN(`  ✅ Saved: weekly/${weekId}.json`));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log(RED(`  ❌ ${error.message}`));
  }
}

// ═══════════════════════════════════════════════════════════
// MONTHLY PROFILE (LOCAL)
// ═══════════════════════════════════════════════════════════

async function generateMonthlyProfile(config: any): Promise<void> {
  const dailies = loadDailyProfiles(31);
  const weeklies = loadWeeklyProfiles(5);

  if (dailies.length === 0 && weeklies.length === 0) {
    console.log('');
    console.log(AMBER('  ⚠️  No profiles found for this month.'));
    console.log(GRAY('  Run `bob profile --today` daily and `bob profile --week` weekly first.'));
    console.log('');
    return;
  }

  console.log('');
  console.log(CYAN(`  🧬 Synthesizing monthly profile from ${dailies.length} dailies + ${weeklies.length} weeklies...`));
  console.log('');

  const spinner = ora({ text: CYAN('  Analyzing monthly evolution...'), spinner: 'dots' }).start();

  const weekSummaries = weeklies.map(w => ({
    week: w.weekOf,
    trajectory: w.trajectory,
    moodShift: w.moodShift,
    keyMoments: w.keyMoments?.slice(0, 2),
  }));

  const dailyHighlights = dailies.map(d => ({
    date: d.date,
    emotion: d.emotionalState?.dominant,
    communication: d.communicationStyle?.tone,
    topQuote: d.userQuotes?.[0],
  }));

  const prompt = `You are a behavioral psychologist writing a monthly personality assessment. You have daily snapshots showing how this person felt and communicated each day, plus weekly synthesis showing trends. Analyze their GROWTH and EVOLUTION over the entire month.

WEEKLY SYNTHESES:
${JSON.stringify(weekSummaries, null, 2)}

DAILY HIGHLIGHTS (showing day-to-day shifts):
${JSON.stringify(dailyHighlights, null, 2)}

Respond with ONLY a valid JSON object:

{
  "overallTrajectory": "2-3 sentences describing the overall arc of this month",
  "weeklyProgression": ["Week 1: description", "Week 2: description", "Week 3: description", "Week 4: description"],
  "personalitySnapshot": {
    "archetype": "A name for their personality type",
    "communicationStyle": "How they typically communicate — with evidence",
    "workRhythm": "Their natural work pattern",
    "emotionalPattern": "Their emotional cycle",
    "decisionMaking": "How they make decisions",
    "growth": "How they grew this month"
  },
  "keyQuotes": ["4-6 most revealing user quotes from across the entire month"],
  "confidence": 0-100
}

Show the JOURNEY, not just the destination. Use real quotes as evidence for every claim.`;

  try {
    const aiMessages: LocalChatMessage[] = [
      { role: 'system', content: 'You are a behavioral psychologist writing a monthly assessment. Respond with ONLY valid JSON.' },
      { role: 'user', content: prompt },
    ];

    const response = await callLocalModel(config.localEndpoint!, aiMessages);
    spinner.stop();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(RED('  ❌ Could not parse monthly profile.'));
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const now = new Date();
    const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const profile: MonthlyProfile = {
      month: monthId,
      ...parsed,
      generatedAt: new Date().toISOString(),
    };

    saveMonthlyProfile(profile);

    console.log('');
    console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
    console.log(BORDER('  ║') + AMBER(`  🧬 Monthly Profile — ${monthId}`));
    console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
    console.log(BORDER('  ║') + CYAN(`  Archetype: ${parsed.personalitySnapshot?.archetype || 'Unknown'}`));
    console.log(BORDER('  ║'));
    console.log(BORDER('  ║') + GRAY(`  Trajectory: ${parsed.overallTrajectory?.slice(0, 70) || 'Unknown'}...`));
    console.log(BORDER('  ║'));

    if (parsed.weeklyProgression) {
      console.log(BORDER('  ║') + GRAY('  Weekly Progression:'));
      for (const week of parsed.weeklyProgression.slice(0, 4)) {
        console.log(BORDER('  ║') + GRAY(`    ${week.slice(0, 65)}...`));
      }
    }

    console.log(BORDER('  ║'));
    if (parsed.personalitySnapshot?.growth) {
      console.log(BORDER('  ║') + GREEN(`  Growth: ${parsed.personalitySnapshot.growth.slice(0, 65)}...`));
    }

    if (parsed.keyQuotes && parsed.keyQuotes.length > 0) {
      console.log(BORDER('  ║'));
      console.log(BORDER('  ║') + GRAY('  Defining Quotes:'));
      for (const quote of parsed.keyQuotes.slice(0, 3)) {
        console.log(BORDER('  ║') + GRAY(`    "${quote.slice(0, 65)}${quote.length > 65 ? '...' : ''}"`));
      }
    }

    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(GREEN(`  ✅ Saved: monthly/${monthId}.json`));
    console.log(GRAY('  This is now your current DNA profile. Bob will adapt to match.'));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log(RED(`  ❌ ${error.message}`));
  }
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}