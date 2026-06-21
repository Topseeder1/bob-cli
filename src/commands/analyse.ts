// File: src/commands/analyse.ts

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { loadSummaries, loadDependencies, ensureProjectStructure, getProjectName, getActiveConversationId } from '../core/project-map.js';
import * as fs from 'fs';
import * as path from 'path';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const MODE_CONSULTANT = chalk.hex('#AB47BC');
const BORDER = chalk.hex('#455A64');

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

      if (options.bugs || options.features || options.improvements || options.upgrades) {
        const { showInteractiveResults } = await import('./analyse-results.js');
        const category = options.bugs ? 'bugs' : options.features ? 'features' : options.improvements ? 'improvements' : 'upgrades';
        await showInteractiveResults(config, category, options.sort, options.search);
        return;
      }

      if (options.results) {
        await showDashboard();
        return;
      }

      if (options.status) {
        await showStatus(config);
        return;
      }

      await runAnalysis(config);
    });
}

async function callAnalysisProvider(config: any, messages: LocalChatMessage[]): Promise<string> {
  const provider = config.provider || 'local';

  if (provider === 'local') {
    if (!config.localEndpoint) {
      throw new Error('No local endpoint configured. Run `bob config set localEndpoint <url>`');
    }
    const response = await callLocalModel(config.localEndpoint, messages);
    if (typeof response === 'object' && response.text) {
      return response.text;
    }
    return response as unknown as string;
  }

  if (!config.loggedIn || !config.authToken) {
    throw new Error('Provider requires authentication. Run `bob login` first.');
  }

  const systemContent = messages.find(m => m.role === 'system')?.content || '';
  const userContent = messages.find(m => m.role === 'user')?.content || '';

  const result = await callCloudFunction('cliAnalyseFile', {
    prompt: userContent,
    systemPrompt: systemContent,
  });

  return result?.text || '';
}

const DASH_WIDTH = 62;

function topRule(): string { return BORDER('  ╔' + '═'.repeat(DASH_WIDTH) + '╗'); }
function botRule(): string { return BORDER('  ╚' + '═'.repeat(DASH_WIDTH) + '╝'); }
function midRule(): string { return BORDER('  ╠' + '═'.repeat(DASH_WIDTH) + '╣'); }
function row(content: string): string {
  const stripped = content.replace(/\x1B\[[0-9;]*m/g, '');
  const pad = DASH_WIDTH - stripped.length;
  return BORDER('  ║') + content + (pad > 0 ? ' '.repeat(pad) : '') + BORDER('║');
}

async function showDashboard(): Promise<void> {
  const spinner = ora({ text: INFO('  Loading analysis results...'), spinner: 'dots' }).start();

  try {
    const counts = loadLocalCounts();
    spinner.stop();

    if (!counts) {
      console.log('');
      console.log(WARNING('  ⚠️  No analysis results found.'));
      console.log(MUTED('  Run `bob analyse` first to analyse your project.'));
      console.log('');
      return;
    }

    renderAnalysisDashboard(counts);

  } catch (error: any) {
    spinner.stop();
    console.log(ERROR(`  ❌ ${error.message}`));
    console.log('');
  }
}

export function renderAnalysisDashboard(counts: { bugs: number; features: number; improvements: number; upgrades: number }): void {
  const total = counts.bugs + counts.features + counts.improvements + counts.upgrades;
  const addressed = loadAddressedCount();
  const totalFound = total + addressed;
  const completionPercent = totalFound === 0 ? 100 : Math.round((addressed / totalFound) * 100);

  console.log('');
  console.log(topRule());
  console.log(row(BRAND_SECONDARY(' ◆ MINIBOB ANALYSIS DASHBOARD')));
  console.log(midRule());
  console.log(row(''));

  const bugLabel = ERROR(`  🔴 BUGS`);
  const featLabel = MODE_CONSULTANT(`  🟣 FEATURES`);
  const imprLabel = INFO(`  🔵 IMPROVEMENTS`);
  const upgrLabel = SUCCESS(`  🟢 UPGRADES`);

  console.log(row(bugLabel + '       ' + featLabel + '    ' + imprLabel + ' ' + upgrLabel));
  console.log(row(''));

  const bugCount = ERROR(String(counts.bugs).padStart(6));
  const featCount = MODE_CONSULTANT(String(counts.features).padStart(6));
  const imprCount = INFO(String(counts.improvements).padStart(6));
  const upgrCount = SUCCESS(String(counts.upgrades).padStart(6));

  console.log(row(bugCount + '          ' + featCount + '          ' + imprCount + '          ' + upgrCount));
  console.log(row(''));

  const barWidth = 50;
  const filled = Math.round((completionPercent / 100) * barWidth);
  const empty = barWidth - filled;

  let barColor;
  if (completionPercent >= 75) barColor = chalk.hex('#66BB6A');
  else if (completionPercent >= 50) barColor = chalk.hex('#FFAB00');
  else if (completionPercent >= 25) barColor = chalk.hex('#E66F24');
  else barColor = chalk.hex('#EF5350');

  const progressBar = barColor('█'.repeat(filled)) + chalk.hex('#333333')('░'.repeat(empty));
  console.log(row(`  Progress: [${progressBar}] ${barColor(completionPercent + '%')}`));
  console.log(row(MUTED(`  ${addressed} addressed · ${total} remaining`)));

  console.log(row(''));
  console.log(botRule());

  console.log('');
  console.log(MUTED('  View details (interactive):'));
  console.log(MUTED('    ▸ bob analyse --bugs'));
  console.log(MUTED('    ▸ bob analyse --features'));
  console.log(MUTED('    ▸ bob analyse --improvements'));
  console.log(MUTED('    ▸ bob analyse --upgrades'));
  console.log('');
  console.log(MUTED('  Auto-fix:'));
  console.log(MUTED('    ▸ bob analyse --auto'));
  console.log(MUTED('    ▸ bob analyse --auto --bugs --confidence 80'));
  console.log(MUTED('    ▸ bob analyse --auto --priority high'));
  console.log('');
}

async function showStatus(config: any): Promise<void> {
  // ─── Read conversation ID from project scope ───
  const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;

  if (!config.loggedIn || !config.authToken || !conversationId) {
    console.log('');
    console.log(WARNING('  ⚠️  Status check requires Tier 3 with an active conversation.'));
    console.log('');
    return;
  }

  const spinner = ora({ text: INFO('  Checking analysis status...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('getCLIAnalysisResults', {
      conversationId,
      action: 'status',
    });

    spinner.stop();

    if (result?.status) {
      console.log('');
      console.log(BRAND_SECONDARY(`  ◆ Analysis Status: ${result.status.toUpperCase()}`));
      if (result.progress) {
        const pct = Math.round((result.progress.completed / result.progress.total) * 100);
        const barLen = 30;
        const filled = Math.round((pct / 100) * barLen);
        let barColor: any;
        if (pct < 25) barColor = chalk.red;
        else if (pct < 50) barColor = chalk.hex('#FF8C00');
        else if (pct < 75) barColor = chalk.yellow;
        else barColor = chalk.green;

        const bar = barColor('█'.repeat(filled)) + MUTED('░'.repeat(barLen - filled));
        console.log(`  [${bar}] ${result.progress.completed}/${result.progress.total} (${pct}%)`);
      }
      console.log('');
    } else {
      console.log('');
      console.log(MUTED('  No active analysis job found.'));
      console.log('');
    }
  } catch (error: any) {
    spinner.stop();
    console.log(ERROR(`  ❌ ${error.message}`));
    console.log('');
  }
}

async function runAnalysis(config: any): Promise<void> {
  const cwd = process.cwd();
  const projectName = getProjectName(cwd);

  console.log('');
  console.log(chalk.bold(INFO(`  ⚡ Analysing project: ${projectName}`)));
  console.log(MUTED(`  📁 ${cwd}`));
  console.log(MUTED('  ─────────────────────────────────────'));
  console.log('');

  const provider = config.provider || 'local';

  if (provider === 'local' && !config.localEndpoint) {
    console.log(ERROR('  ❌ Local analysis requires a local model.'));
    console.log(MUTED('  Run `bob config set provider local`'));
    console.log(MUTED('  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`'));
    console.log('');
    return;
  }

  if (provider !== 'local' && (!config.loggedIn || !config.authToken)) {
    console.log(ERROR('  ❌ Platform providers require authentication.'));
    console.log(MUTED('  Run `bob login` to authenticate.'));
    console.log(MUTED('  Or set provider to local: `bob config set provider local`'));
    console.log('');
    return;
  }

  const summaries = loadSummaries(cwd);
  if (!summaries || Object.keys(summaries).length === 0) {
    console.log(WARNING('  ⚠️  Project not indexed. Run `bob index` first.'));
    console.log('');
    return;
  }

  const dependencies = loadDependencies(cwd) || {};
  const files = Object.keys(summaries);

  console.log(INFO(`  🔧 Provider: ${provider}`));
  console.log(MUTED(`  Found ${files.length} indexed files. Starting deep analysis...`));
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
      console.error(ERROR(`  ❌ Could not read file ${filePath}: ${error.message}`));
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

Respond with ONLY a JSON object:
{
  "bugs": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}],
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

      const responseText = await callAnalysisProvider(config, messages);

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
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
    } catch (err: any) {
      printProgress(completed + 1, files.length, filePath, `(error: ${err.message?.slice(0, 40) || 'unknown'})`);
    }

    completed++;
  }

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
  console.log(chalk.bold(SUCCESS(`  ✅ Analysis complete: ${projectName}`)));
  console.log(MUTED(`  💾 Saved to: ~/.bob/projects/${projectName}/analysis/results/`));
  console.log(MUTED('  Run `bob analyse --results` to view the dashboard.'));
  console.log(MUTED('  Run `bob analyse --auto` for auto-fix mode.'));
  console.log('');
}

function loadLocalCounts(): any {
  const cwd = process.cwd();
  const { analysisDir } = ensureProjectStructure(cwd);
  const countsPath = path.join(analysisDir, 'results', 'counts.json');
  if (!fs.existsSync(countsPath)) return null;
  return JSON.parse(fs.readFileSync(countsPath, 'utf-8'));
}

function loadAddressedCount(): number {
  const cwd = process.cwd();
  const projectName = path.basename(cwd);
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const analysisPath = path.join(homeDir, '.bob', 'projects', projectName, 'analysis', 'results', 'analysis.json');

  if (!fs.existsSync(analysisPath)) return 0;

  try {
    const allResults = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
    let addressed = 0;

    for (const fileResults of Object.values(allResults)) {
      for (const category of ['bugs', 'features', 'improvements', 'upgrades']) {
        const items = (fileResults as any)[category] || [];
        for (const item of items) {
          if (item.status === 'implemented' || item.status === 'dismissed') {
            addressed++;
          }
        }
      }
    }

    return addressed;
  } catch {
    return 0;
  }
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
  const emptyBar = MUTED('░'.repeat(barLength - filled));
  const percentText = barColor(`${Math.round(percent * 100)}%`);

  process.stdout.write('\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\r');

  console.log(`  ${INFO('⚡')} Analysing [${filledBar}${emptyBar}] ${completed}/${total} ${percentText}`);
  console.log(SUCCESS(`  ✅ ${filePath}`));
  console.log(MUTED(`     ${info}`));
  console.log('');
}