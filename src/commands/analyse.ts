import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { loadSummaries, loadDependencies, ensureProjectStructure, getProjectName } from '../core/project-map.js';
import * as fs from 'fs';
import * as path from 'path';

const RED = chalk.hex('#EF5350');
const PURPLE = chalk.hex('#AB47BC');
const BLUE = chalk.hex('#42A5F5');
const TEAL = chalk.hex('#26A69A');
const AMBER = chalk.hex('#FFAB00');
const GRAY = chalk.gray;
const BORDER = chalk.hex('#455A64');

const BG_RED = chalk.bgHex('#2D1111');
const BG_PURPLE = chalk.bgHex('#1A0D2B');
const BG_BLUE = chalk.bgHex('#0D1B2A');
const BG_TEAL = chalk.bgHex('#0D2420');

export function registerAnalyseCommand(program: Command): void {
  program
    .command('analyse')
    .description('Analyse the current project for bugs, features, improvements, and upgrades')
    .option('--results', 'Show analysis dashboard or filtered list')
    .option('--bugs', 'Show bugs list (interactive)')
    .option('--features', 'Show features list (interactive)')
    .option('--improvements', 'Show improvements list (interactive)')
    .option('--upgrades', 'Show upgrades list (interactive)')
    .option('--sort <method>', 'Sort by: priority (default) or file')
    .option('--search <query>', 'Filter results by keyword')
    .option('--status', 'Show current analysis job status')
    .option('--auto', 'Auto-fix mode: Bob triages and MiniBob implements')
    .option('--confidence <number>', 'Confidence gate for auto-fix (default: 90)', '90')
    .option('--priority <level>', 'Priority gate for auto-fix: critical, high, medium, low (default: critical)', 'critical')
    .action(async (options: {
      results?: boolean;
      bugs?: boolean;
      features?: boolean;
      improvements?: boolean;
      upgrades?: boolean;
      sort?: string;
      status?: boolean;
      search?: string;
      auto?: boolean;
      confidence?: string;
      priority?: string;
    }) => {
      const config = getConfig();

      // ─── AUTO-FIX MODE ───
      if (options.auto) {
        const { runAutoFix } = await import('./analyse-auto.js');
        const category = options.bugs ? 'bugs' : options.features ? 'features' : options.improvements ? 'improvements' : options.upgrades ? 'upgrades' : undefined;
        await runAutoFix({
          category: category,
          confidence: parseInt(options.confidence || '90'),
          priority: options.priority || 'critical',
        });
        return;
      }

      // ─── RESULTS: Interactive list view ───
      if (options.bugs || options.features || options.improvements || options.upgrades) {
        const { showInteractiveResults } = await import('./analyse-results.js');
        const category = options.bugs ? 'bugs' : options.features ? 'features' : options.improvements ? 'improvements' : 'upgrades';
        await showInteractiveResults(config, category, options.sort, options.search);
        return;
      }

      // ─── RESULTS: Dashboard ───
      if (options.results) {
        await showDashboard(config);
        return;
      }

      // ─── STATUS ───
      if (options.status) {
        await showStatus(config);
        return;
      }

      // ─── RUN ANALYSIS ───
      await runAnalysis(config);
    });
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

async function showDashboard(config: any): Promise<void> {
  const spinner = ora({ text: chalk.cyan('  Loading analysis results...'), spinner: 'dots' }).start();

  try {
    let counts: { bugs: number; features: number; improvements: number; upgrades: number };

    if (config.tier === 'platform' && config.provider !== 'local' && config.loggedIn && config.conversationId) {
      const result = await callCloudFunction('getCLIAnalysisResults', {
        conversationId: config.conversationId,
        category: 'all',
      });
      counts = result?.counts;
    } else {
      counts = loadLocalCounts();
    }

    spinner.stop();

    if (!counts) {
      console.log('');
      console.log(chalk.yellow('  ⚠️  No analysis results found.'));
      console.log(GRAY('  Run `bob analyse` first to analyse your project.'));
      console.log('');
      return;
    }

    renderDashboard(counts);

  } catch (error: any) {
    spinner.stop();
    console.log(chalk.red(`  ❌ ${error.message}`));
    console.log('');
  }
}

function renderDashboard(counts: { bugs: number; features: number; improvements: number; upgrades: number }): void {
  const total = counts.bugs + counts.features + counts.improvements + counts.upgrades;

  console.log('');
  console.log(BORDER('  ╔══════════════╦══════════════╦══════════════╦══════════════╗'));
  console.log(BORDER('  ║') + AMBER(' ◆ MINIBOB ANALYSIS COMPLETE') + GRAY(`  ${total} pts`) + BORDER('       ║'));
  console.log(BORDER('  ╠══════════════╬══════════════╬══════════════╬══════════════╣'));

  // Empty row
  console.log(BORDER('  ║') + BG_RED('              ') + BORDER('║') + BG_PURPLE('              ') + BORDER('║') + BG_BLUE('              ') + BORDER('║') + BG_TEAL('              ') + BORDER('║'));

  // Category labels (14 visual cols per cell — emoji takes 2 cols)
  console.log(BORDER('  ║') + BG_RED(`  ${RED('🔴 BUGS')}    `) + BORDER('║') + BG_PURPLE(`  ${PURPLE('🟣 FEAT')}    `) + BORDER('║') + BG_BLUE(`  ${BLUE('🔵 OPTZ')}    `) + BORDER('║') + BG_TEAL(`  ${TEAL('🟢 UPGR')}    `) + BORDER('║'));

  // Counts (5 + 4 + 5 = 14 chars per cell)
  const bugsStr = String(counts.bugs).padStart(4);
  const featStr = String(counts.features).padStart(4);
  const imprStr = String(counts.improvements).padStart(4);
  const upgrStr = String(counts.upgrades).padStart(4);

  console.log(BORDER('  ║') + BG_RED(`     ${RED(bugsStr)}     `) + BORDER('║') + BG_PURPLE(`     ${PURPLE(featStr)}     `) + BORDER('║') + BG_BLUE(`     ${BLUE(imprStr)}     `) + BORDER('║') + BG_TEAL(`     ${TEAL(upgrStr)}     `) + BORDER('║'));

  // Empty row
  console.log(BORDER('  ║') + BG_RED('              ') + BORDER('║') + BG_PURPLE('              ') + BORDER('║') + BG_BLUE('              ') + BORDER('║') + BG_TEAL('              ') + BORDER('║'));

  console.log(BORDER('  ╠══════════════╩══════════════╩══════════════╩══════════════╣'));
  console.log(BORDER('  ║') + chalk.white(`        ${total} POINTS IDENTIFIED`) + BORDER('                        ║'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log(GRAY('  View details (interactive):'));
  console.log(GRAY('    bob analyse --results --bugs'));
  console.log(GRAY('    bob analyse --results --features'));
  console.log(GRAY('    bob analyse --results --improvements'));
  console.log(GRAY('    bob analyse --results --upgrades'));
  console.log('');
  console.log(GRAY('  Auto-fix:'));
  console.log(GRAY('    bob analyse --auto'));
  console.log(GRAY('    bob analyse --auto --bugs --confidence 80'));
  console.log(GRAY('    bob analyse --auto --priority high'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════

async function showStatus(config: any): Promise<void> {
  if (!config.loggedIn || !config.authToken || !config.conversationId) {
    console.log('');
    console.log(chalk.yellow('  ⚠️  Status check requires Tier 3 with an active conversation.'));
    console.log('');
    return;
  }

  const spinner = ora({ text: chalk.cyan('  Checking analysis status...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('getCLIAnalysisResults', {
      conversationId: config.conversationId,
      action: 'status',
    });

    spinner.stop();

    if (result?.status) {
      console.log('');
      console.log(AMBER(`  ◆ Analysis Status: ${result.status.toUpperCase()}`));
      if (result.progress) {
        const pct = Math.round((result.progress.completed / result.progress.total) * 100);
        const barLen = 30;
        const filled = Math.round((pct / 100) * barLen);
        let barColor: any;
        if (pct < 25) barColor = chalk.red;
        else if (pct < 50) barColor = chalk.hex('#FF8C00');
        else if (pct < 75) barColor = chalk.yellow;
        else barColor = chalk.green;

        const bar = barColor('█'.repeat(filled)) + GRAY('░'.repeat(barLen - filled));
        console.log(`  [${bar}] ${result.progress.completed}/${result.progress.total} (${pct}%)`);
      }
      console.log('');
    } else {
      console.log('');
      console.log(GRAY('  No active analysis job found.'));
      console.log('');
    }
  } catch (error: any) {
    spinner.stop();
    console.log(chalk.red(`  ❌ ${error.message}`));
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// RUN ANALYSIS
// ═══════════════════════════════════════════════════════════

async function runAnalysis(config: any): Promise<void> {
  const cwd = process.cwd();
  const projectName = getProjectName(cwd);

  console.log('');
  console.log(chalk.bold.cyan(`  ⚡ Analysing project: ${projectName}`));
  console.log(GRAY(`  📁 ${cwd}`));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log('');

  // ─── TIER 3: Call Cloud Function ───
  if (config.tier === 'platform' && config.provider !== 'local' && config.loggedIn && config.conversationId) {
    const spinner = ora({ text: chalk.cyan('  Triggering platform analysis...'), spinner: 'dots' }).start();

    try {
      const result = await callCloudFunction('analyzeProjectWorkspace', {
        conversationId: config.conversationId,
      });

      spinner.stop();

      if (result?.success) {
        console.log(chalk.green(`  ✅ Analysis job created: ${result.jobId}`));
        console.log(GRAY('  Run `bob analyse --status` to check progress.'));
        console.log(GRAY('  Run `bob analyse --results` when complete.'));
      } else {
        console.log(chalk.red(`  ❌ ${result?.message || 'Failed to start analysis.'}`));
      }
      console.log('');

    } catch (error: any) {
      spinner.stop();
      console.log(chalk.red(`  ❌ ${error.message}`));
      console.log('');
    }
    return;
  }

  // ─── TIER 1: Local Analysis ───
  if (config.provider !== 'local' || !config.localEndpoint) {
    console.log(chalk.red('  ❌ Local analysis requires a local model.'));
    console.log(GRAY('  Run `bob config set provider local`'));
    console.log(GRAY('  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`'));
    console.log('');
    return;
  }

  const summaries = loadSummaries(cwd);
  if (!summaries || Object.keys(summaries).length === 0) {
    console.log(chalk.yellow('  ⚠️  Project not indexed. Run `bob index` first.'));
    console.log('');
    return;
  }

  const dependencies = loadDependencies(cwd) || {};
  const files = Object.keys(summaries);

  console.log(GRAY(`  Found ${files.length} indexed files. Starting deep analysis...`));
  console.log('');
  console.log('');
  console.log('');
  console.log('');

  const { analysisDir } = ensureProjectStructure(cwd);
  const resultsDir = path.join(analysisDir, 'results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  let completed = 0;
  const allResults: Record<string, any> = {};

  for (const filePath of files) {
    const absolutePath = path.join(cwd, filePath);

    let content: string;
    try {
      content = fs.readFileSync(absolutePath, 'utf-8');
    } catch (error: any) {
      console.error(chalk.red(`  ❌ Could not read file ${filePath}: ${error.message}`));
      completed++;
      continue;
    }

    if (content.length > 30000) {
      completed++;
      printProgress(completed, files.length, filePath, '(skipped — too large)');
      continue;
    }

    const fileDeps = dependencies[filePath] || [];
    let depContext = '';
    if (fileDeps.length > 0) {
      depContext = `\nRELATED FILES:\n${fileDeps.map((d: string) => `- ${d}: ${summaries[d] || 'unknown'}`).join('\n')}\n`;
    }

        const analysisPrompt = `You are the Lead QA Engineer on this project. Your job is to perform a thorough, production-grade code review.

    For each issue you find, you MUST provide:
    - A CLEAR, SPECIFIC title (not generic — name the exact problem)
    - A DETAILED description explaining WHY this is a problem and WHAT the impact is
    - A SPECIFIC implementation instruction — exact steps to fix it, referencing actual function/variable names from the code
    - An honest priority based on real-world impact

    PRIORITY DEFINITIONS:
    - critical: Will cause crashes, data loss, security vulnerabilities, or breaks core functionality
    - high: Causes bugs in normal usage, performance degradation, or makes code unmaintainable
    - medium: Code smell, minor inefficiency, or could cause issues under edge cases
    - low: Style improvements, minor optimizations, or nice-to-haves

    CONFIDENCE RUBRIC (you will use this later during triage):
    Your confidence should reflect: "How certain am I that implementing this fix will NOT break anything AND will ACTUALLY contribute positively to the project?"
    - 95-100%: Fix is 1-5 lines, explicit, zero side effects, purely additive
    - 85-94%: Clear fix, well-scoped, minimal risk, touches isolated logic
    - 75-84%: Good fix but touches shared logic or has minor behavioral implications
    - <75%: Requires judgment, structural changes, or has unpredictable side effects

    DO NOT include vague suggestions like "improve error handling" without specifying EXACTLY what to change.
    DO NOT include items without clear implementation steps.
    Every suggestion must be actionable by a junior engineer reading only your instructions.

    Respond with ONLY a JSON object:
    {
      "bugs": [{"title": "Specific bug name", "description": "Detailed explanation of the problem and its impact", "priority": "critical|high|medium|low", "implementation": "Exact steps: 1. In function X, change Y to Z. 2. Add error check for..."}],
      "features": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}],
      "improvements": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}],
      "upgrades": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}]
    }

    Be thorough but practical. Quality over quantity. Only list GENUINE issues with REAL impact.
    ${depContext}
    FILE: ${filePath}
    ${content}`;

    try {
            const messages: LocalChatMessage[] = [
              { role: 'system', content: 'You are the Lead QA Engineer. Respond with ONLY valid JSON. Every suggestion must have a specific title, detailed description, and actionable implementation steps. No vague or generic items. Quality over quantity.' },
              { role: 'user', content: analysisPrompt },
            ];

      const response = await callLocalModel(config.localEndpoint!, messages);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        for (const cat of ['bugs', 'features', 'improvements', 'upgrades']) {
          if (parsed[cat]) {
            parsed[cat] = parsed[cat].map((item: any) => ({ ...item, filePath }));
          }
        }

        allResults[filePath] = parsed;
        const counts = `${(parsed.bugs?.length || 0)}B ${(parsed.features?.length || 0)}F ${(parsed.improvements?.length || 0)}I ${(parsed.upgrades?.length || 0)}U`;
        printProgress(completed + 1, files.length, filePath, counts);
      } else {
        printProgress(completed + 1, files.length, filePath, '(no results)');
      }
    } catch {
      printProgress(completed + 1, files.length, filePath, '(error)');
    }

    completed++;
  }

  // Save results
  fs.writeFileSync(path.join(resultsDir, 'analysis.json'), JSON.stringify(allResults, null, 2));

  let totalBugs = 0, totalFeatures = 0, totalImprovements = 0, totalUpgrades = 0;
  for (const fileResults of Object.values(allResults)) {
    const r = fileResults as any;
    totalBugs += r.bugs?.length || 0;
    totalFeatures += r.features?.length || 0;
    totalImprovements += r.improvements?.length || 0;
    totalUpgrades += r.upgrades?.length || 0;
  }

  fs.writeFileSync(path.join(resultsDir, 'counts.json'), JSON.stringify({
    bugs: totalBugs,
    features: totalFeatures,
    improvements: totalImprovements,
    upgrades: totalUpgrades,
  }, null, 2));

  console.log('');
  console.log('');
  console.log(chalk.bold.green(`  ✅ Analysis complete: ${projectName}`));
  console.log(GRAY(`  💾 Saved to: ~/.bob/projects/${projectName}/analysis/results/`));
  console.log(GRAY('  Run `bob analyse --results` to view the dashboard.'));
  console.log(GRAY('  Run `bob analyse --auto` for auto-fix mode.'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function loadLocalCounts(): any {
  const cwd = process.cwd();
  const { analysisDir } = ensureProjectStructure(cwd);
  const countsPath = path.join(analysisDir, 'results', 'counts.json');
  if (!fs.existsSync(countsPath)) return null;
  return JSON.parse(fs.readFileSync(countsPath, 'utf-8'));
}

function printProgress(completed: number, total: number, filePath: string, info: string): void {
  const percent = completed / total;
  const barLength = 30;
  const filled = Math.round(percent * barLength);

  let barColor: any;
  if (percent < 0.25) barColor = chalk.red;
  else if (percent < 0.50) barColor = chalk.hex('#FF8C00');
  else if (percent < 0.75) barColor = chalk.yellow;
  else barColor = chalk.green;

  const filledBar = barColor('█'.repeat(filled));
  const emptyBar = GRAY('░'.repeat(barLength - filled));
  const percentText = barColor(`${Math.round(percent * 100)}%`);

  process.stdout.write('\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\r');

  console.log(`  ${chalk.cyan('⚡')} Analysing [${filledBar}${emptyBar}] ${completed}/${total} ${percentText}`);
  console.log(chalk.green(`  ✅ ${filePath}`));
  console.log(GRAY(`     ${info}`));
  console.log('');
}