// File: src/commands/autonomy.ts

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import simpleGit from 'simple-git';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { readFileContent } from '../core/context-builder.js';
import { loadLocalSuggestions } from './analyse-results.js';
import { markSuggestionStatus } from '../core/analysis-tracker.js';
import { getActiveConversationId } from '../core/project-map.js';
import * as fs from 'fs';
import * as path from 'path';

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

// ─── INTERFACES ───
interface Suggestion {
  title: string;
  description: string;
  priority: string;
  implementation?: string;
  filePath: string;
  id?: string;
}

interface TaskItem {
  suggestion: Suggestion;
  status: 'pending' | 'working' | 'done' | 'failed' | 'skipped';
}

// ─── REGISTER COMMAND ─────────────────────────────────────────────────────────

export function registerAutonomyCommand(program: Command): void {
  program
    .command('autonomy')
    .description('Launch autonomous repair mode — MiniBob fixes all analysed issues')
    .option('--status',             'Check current autonomy run progress (Tier 3)')
    .option('--stop',               'Stop the current autonomy run (Tier 3)')
    .option('--category <cat>',     'Limit to: bugs, features, improvements, upgrades')
    .option('--priority <level>',   'Minimum priority: critical, high, medium, low (default: high)', 'high')
    .option('--no-push',            'Skip git push after completion')
    .action(async (options: { status?: boolean; stop?: boolean; category?: string; priority?: string; push?: boolean }) => {
      const config = getConfig();
      const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;

      if (options.status) {
        await showAutonomyStatus(config, conversationId);
        return;
      }

      if (options.stop) {
        console.log('');
        console.log(WARNING('  ⚠️  Stop command not yet implemented for Tier 3.'));
        console.log('');
        return;
      }

      if (config.tier === 'platform' && config.provider !== 'local' && config.loggedIn && conversationId) {
        await runTier3Autonomy(config, conversationId);
      } else {
        await runTier1Autonomy(config, options);
      }
    });
}

// ─── TIER 3 AUTONOMY ──────────────────────────────────────────────────────────

async function runTier3Autonomy(config: any, conversationId: string): Promise<void> {
  console.log('');
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('⚡  MINIBOB AUTONOMY MODE') + MUTED('  ·  Platform')));
  console.log(hRule());
  console.log(row(MUTED(`▸ Conversation: ${conversationId?.slice(0, 32)}...`)));
  console.log(row(MUTED(`▸ https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId?.slice(0, 20)}...`)));
  console.log(botRule());
  console.log('');

  const spinner = ora({ text: INFO('  Igniting autonomy workers...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('startMiniBobAutonomy', {
      conversationId,
      proxyEmail: null,
    });

    spinner.stop();

    if (!result?.success) {
      console.log(ERROR(`  ❌ ${result?.message || 'Failed to start autonomy.'}`));
      return;
    }

    console.log(SUCCESS('  ✅ Autonomy loop ignited!'));
    console.log(MUTED('  Streaming progress...'));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log(ERROR(`  ❌ ${error.message}`));
    return;
  }

  let lastTimestamp = new Date().toISOString();
  let running       = true;
  let tasksDone     = 0;
  let totalTasks    = 0;

  console.log(MUTED('  ▸ Press Ctrl+C to stop streaming (workers continue in background)'));
  console.log('');

  process.on('SIGINT', () => {
    running = false;
    console.log('');
    console.log(MUTED('  📡 Stopped streaming. Workers continue in the background.'));
    console.log(MUTED('  Check progress: bob autonomy --status'));
    console.log('');
    process.exit(0);
  });

  while (running) {
    try {
      const updates = await callCloudFunction('getCLITerminalUpdates', {
        conversationId,
        since: lastTimestamp,
      });

      if (updates?.lines && updates.lines.length > 0) {
        for (const line of updates.lines) {
          const text = line.text || '';
          const type = line.type || 'system';

          if (text.includes('[ACTION:AUTONOMY_TICKER:')) {
            const parts = text.match(/\[ACTION:AUTONOMY_TICKER:(\d+):(\d+):(\d+):(\d+):(\d+):(\d+):(\d+)\]/);
            if (parts) {
              const bugs         = parseInt(parts[2]);
              const features     = parseInt(parts[3]);
              const improvements = parseInt(parts[4]);
              const upgrades     = parseInt(parts[5]);
              const tokens       = parseInt(parts[6]);
              totalTasks         = parseInt(parts[7]);
              tasksDone          = bugs + features + improvements + upgrades;
              renderTickerHUD(tasksDone, totalTasks, bugs, features, improvements, upgrades, tokens);
            }
            continue;
          }

          if (text.includes('[ACTION:GITHUB_PUSH_REQUEST:')) {
            console.log('');
            console.log(SUCCESS('  ✅ All tasks complete!'));
            console.log(WARNING('  📤 MiniBob wants to push to GitHub.'));
            console.log('');

            const rl     = readline.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise<string>(resolve => {
              rl.question(INFO('  Approve push? (y/n): '), resolve);
            });
            rl.close();

            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
              try {
                await callCloudFunction('commitAndPushChanges', { conversationId });
                console.log(SUCCESS('  ✅ Pushed to GitHub!'));
              } catch (pushErr: any) {
                console.log(ERROR(`  ❌ Push failed: ${pushErr.message}`));
              }
            } else {
              console.log(MUTED('  Push skipped. You can push manually later.'));
            }

            running = false;
            continue;
          }

          if (text.includes('ALL TASKS COMPLETE')) {
            running = false;
          }

          let lineColor: any;
          if (type === 'stderr')      lineColor = ERROR;
          else if (type === 'stdout') lineColor = SUCCESS;
          else                        lineColor = MUTED;

          console.log(lineColor(`  ${text}`));
          lastTimestamp = line.timestamp || lastTimestamp;
        }
      }

    } catch {
      // Silent failure on polling — just retry
    }

    if (running) {
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
  }

  // ─── Completion card ───
  console.log('');
  console.log(topRule());
  console.log(row(BRAND_SECONDARY('◆  AUTONOMY SESSION COMPLETE')));
  console.log(hRule());
  console.log(row(SUCCESS(`✅  Tasks completed: ${tasksDone}/${totalTasks}`)));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}

// ─── TIER 1 AUTONOMY ──────────────────────────────────────────────────────────

async function runTier1Autonomy(config: any, options: any): Promise<void> {
  if (config.provider !== 'local' || !config.localEndpoint) {
    console.log('');
    console.log(topRule());
    console.log(row(ERROR('◈  CONFIGURATION ERROR')));
    console.log(hRule());
    console.log(row(MUTED('▸ Local autonomy requires a local model.')));
    console.log(row(MUTED('▸ bob config set provider local')));
    console.log(row(MUTED('▸ bob config set localEndpoint http://127.0.0.1:11434/api/chat')));
    console.log(emptyRow());
    console.log(botRule());
    console.log('');
    return;
  }

  const categories  = options.category ? [options.category] : ['bugs', 'features', 'improvements', 'upgrades'];
  const priorityGate = options.priority || 'high';
  const shouldPush  = options.push !== false;

  console.log('');
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('⚡  MINIBOB AUTONOMY MODE') + MUTED('  ·  Local')));
  console.log(hRule());
  console.log(row(MUTED(`▸ Priority gate: ${priorityGate}+`)));
  console.log(row(MUTED(`▸ Categories:    ${categories.join(', ')}`)));
  console.log(row(MUTED(`▸ Git push:      ${shouldPush ? 'enabled' : 'disabled'}`)));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');

  let allSuggestions: Suggestion[] = [];
  for (const cat of categories) {
    allSuggestions.push(...loadLocalSuggestions(cat));
  }

  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const gateIndex     = priorityOrder.indexOf(priorityGate.toLowerCase());
  if (gateIndex >= 0) {
    allSuggestions = allSuggestions.filter(s => {
      const idx = priorityOrder.indexOf(s.priority?.toLowerCase());
      return idx >= 0 && idx <= gateIndex;
    });
  }

  if (allSuggestions.length === 0) {
    console.log('');
    console.log(topRule());
    console.log(row(SUCCESS('◉  ALL CLEAR')));
    console.log(hRule());
    console.log(row(SUCCESS('✅  No pending tasks. Project is clean!')));
    console.log(emptyRow());
    console.log(botRule());
    console.log('');
    return;
  }

  console.log(MUTED(`  ▸ Found ${allSuggestions.length} tasks to process.`));
  console.log('');

  const workQueue: TaskItem[] = allSuggestions.map(s => ({
    suggestion: s,
    status:     'pending' as const,
  }));

  renderLocalTodoList(workQueue);

  let fixed      = 0;
  let failed     = 0;
  const fixedFiles: string[] = [];

  for (let i = 0; i < workQueue.length; i++) {
    const task   = workQueue[i];
    task.status  = 'working';
    renderLocalTodoList(workQueue);

    const success = await implementLocalTask(task.suggestion, config.localEndpoint!);
    task.status   = success ? 'done' : 'failed';

    if (success) {
      fixed++;
      fixedFiles.push(task.suggestion.filePath);
      const suggestionIndex = parseInt(task.suggestion.id?.split('_').pop() || '0');
      const category        = detectLocalCategory(task.suggestion);
      markSuggestionStatus(task.suggestion.filePath, suggestionIndex, category, 'implemented', {
        confidence:      100,
        reason:          'MiniBob autonomy',
        implementedBy:   'minibob-local-autonomy',
      });
    } else {
      failed++;
    }

    renderLocalTodoList(workQueue);
  }

  console.log('');
  console.log('');

  // ─── Report card ───
  console.log(topRule());
  console.log(row(BRAND_SECONDARY('◆  MINIBOB AUTONOMY REPORT')));
  console.log(hRule());
  console.log(row(SUCCESS(`✅  Fixed:  ${fixed} file${fixed !== 1 ? 's' : ''}`)));
  if (failed > 0) {
    console.log(row(ERROR(`❌  Failed: ${failed} file${failed !== 1 ? 's' : ''}`)));
  }
  console.log(row(MUTED(`▸ All originals backed up to .bob-backups/`)));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');

  // ─── Git push ───
  if (shouldPush && fixed > 0) {
    const git    = simpleGit(process.cwd());
    const isRepo = await git.checkIsRepo();

    if (isRepo) {
      console.log(INFO('  📤 Committing and pushing to git...'));
      console.log('');

      try {
        await git.add('.');
        const commitMessage = `MiniBob Autonomy: Fixed ${fixed} issue(s)\n\nFiles modified:\n${fixedFiles.map(f => `- ${f}`).join('\n')}\n\nAutonomous repair by Bob's CLI.`;
        await git.commit(commitMessage);
        const branch = (await git.branchLocal()).current;

        try {
          await git.push('origin', branch);
        } catch (pushErr: any) {
          if (pushErr.message?.includes('no upstream')) {
            await git.push(['--set-upstream', 'origin', branch]);
          } else {
            throw pushErr;
          }
        }

        console.log(SUCCESS(`  ✅ Pushed to ${branch}!`));
        console.log(MUTED(`  ▸ Commit: MiniBob Autonomy: Fixed ${fixed} issue(s)`));

      } catch (gitErr: any) {
        console.log(ERROR(`  ❌ Git push failed: ${gitErr.message}`));
        console.log(MUTED('  Files are saved locally. Push manually with `bob push "message"`.'));
      }
    } else {
      console.log(MUTED('  ▸ Not a git repo. Files saved locally only.'));
    }

    console.log('');
  }
}

// ─── AUTONOMY STATUS ──────────────────────────────────────────────────────────

async function showAutonomyStatus(config: any, conversationId: string | null): Promise<void> {
  if (!config.loggedIn || !conversationId) {
    console.log('');
    console.log(WARNING('  ⚠️  Status requires Tier 3 with an active conversation.'));
    console.log('');
    return;
  }

  const spinner = ora({ text: INFO('  Checking autonomy status...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('getCLITerminalUpdates', {
      conversationId,
      since: new Date(Date.now() - 60000).toISOString(),
      limit: 5,
    });

    spinner.stop();

    if (result?.lines && result.lines.length > 0) {
      console.log('');
      console.log(topRule());
      console.log(row(BRAND_SECONDARY('◆  RECENT AUTONOMY ACTIVITY')));
      console.log(hRule());
      for (const line of result.lines) {
        console.log(row(MUTED(`▸ ${line.text}`)));
      }
      console.log(emptyRow());
      console.log(botRule());
      console.log('');
    } else {
      console.log('');
      console.log(MUTED('  ▸ No recent autonomy activity.'));
      console.log('');
    }
  } catch (error: any) {
    spinner.stop();
    console.log(ERROR(`  ❌ ${error.message}`));
  }
}

// ─── IMPLEMENT LOCAL TASK ─────────────────────────────────────────────────────

async function implementLocalTask(suggestion: Suggestion, endpoint: string): Promise<boolean> {
  const fileContent = readFileContent(suggestion.filePath);
  if (!fileContent) return false;

  const prompt = `You are MiniBob — a junior engineer making SURGICAL code fixes under strict supervision.

CURRENT FILE: ${suggestion.filePath}
${fileContent}

CHANGE TO IMPLEMENT:
Title: ${suggestion.title || 'Fix'}
Description: ${suggestion.description}
Implementation Instructions: ${suggestion.implementation || 'Apply the fix described above.'}

RULES (CRITICAL — VIOLATION = REJECTED):
- Return ONLY valid source code. No markdown, no code fences, no \`\`\`, no explanation text.
- Start the FIRST line with: // File: ${suggestion.filePath}
- PRESERVE ALL existing imports exactly as they are.
- PRESERVE ALL existing exports exactly as they are.
- PRESERVE existing code structure, indentation, patterns, naming conventions.
- Make the MINIMUM change necessary. Touch NOTHING else.
- Do NOT refactor, reorganize, or "improve" unrelated code.
- Do NOT add comments explaining what you changed.
- If unsure, return the file UNCHANGED.

Return the complete file content now:`;

  try {
    const messages: LocalChatMessage[] = [
      {
        role:    'system',
        content: 'You are MiniBob making SURGICAL fixes. Return ONLY valid source code. NO markdown. NO code fences. Start with // File: comment. MINIMUM change only.',
      },
      { role: 'user', content: prompt },
    ];

    const response   = await callLocalModel(endpoint, messages);
    const lines      = response.split('\n');
    const firstLine  = lines[0].trim();
    let newContent: string;

    if (firstLine.match(/^\/\/\s*(File:)?\s*/)) {
      newContent = lines.slice(1).join('\n').trim();
    } else {
      newContent = response.trim();
    }

    if (
      newContent.includes('```') ||
      newContent.includes('## ')  ||
      newContent.startsWith('Here')  ||
      newContent.startsWith('I have') ||
      newContent.startsWith('Sure')
    ) {
      return false;
    }

    if (newContent.length < fileContent.length * 0.5) return false;

    const originalExports = fileContent.match(
      /export\s+(function|class|const|interface|type|async\s+function)\s+\w+/g
    ) || [];

    for (const exp of originalExports) {
      const exportName = exp.split(/\s+/).pop()!;
      if (!newContent.includes(exportName)) return false;
    }

    const absolutePath = path.join(process.cwd(), suggestion.filePath);
    const backupDir    = path.join(process.cwd(), '.bob-backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    if (fs.existsSync(absolutePath)) {
      const timestamp  = Date.now();
      const backupName = suggestion.filePath.replace(/[\/\\]/g, '_') + `.${timestamp}.bak`;
      fs.copyFileSync(absolutePath, path.join(backupDir, backupName));
    }

    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(absolutePath, newContent, 'utf-8');
    return true;

  } catch {
    return false;
  }
}

// ─── DETECT LOCAL CATEGORY ────────────────────────────────────────────────────

function detectLocalCategory(suggestion: Suggestion): string {
  const cwd         = process.cwd();
  const projectName = path.basename(cwd);
  const homeDir     = process.env.HOME || process.env.USERPROFILE || '';
  const analysisPath = path.join(
    homeDir, '.bob', 'projects', projectName,
    'analysis', 'results', 'analysis.json'
  );

  if (!fs.existsSync(analysisPath)) return 'bugs';

  const allResults  = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  const fileResults = allResults[suggestion.filePath];
  if (!fileResults) return 'bugs';

  for (const cat of ['bugs', 'features', 'improvements', 'upgrades']) {
    const items = fileResults[cat] || [];
    for (const item of items) {
      if (item.title === suggestion.title && item.description === suggestion.description) return cat;
    }
  }

  return 'bugs';
}

// ─── TICKER HUD ───────────────────────────────────────────────────────────────

function renderTickerHUD(
  done: number,
  total: number,
  bugs: number,
  features: number,
  improvements: number,
  upgrades: number,
  tokens: number,
): void {
  const percent = total > 0 ? done / total : 0;
  const barLen  = 30;
  const filled  = Math.round(percent * barLen);

  let barColor: any;
  if (percent < 0.25)      barColor = ERROR;
  else if (percent < 0.50) barColor = chalk.hex('#FF8C00');
  else if (percent < 0.75) barColor = WARNING;
  else                     barColor = SUCCESS;

  const bar = barColor('█'.repeat(filled)) + MUTED('░'.repeat(barLen - filled));

  console.log(`  ⚡ [${bar}] ${done}/${total}  ${barColor(Math.round(percent * 100) + '%')}`);
  console.log(MUTED(`  🐛 ${bugs}  ⭐ ${features}  🔧 ${improvements}  ⬆️  ${upgrades}  │  Tokens: ${tokens.toLocaleString()}`));
}

// ─── LOCAL TODO LIST ──────────────────────────────────────────────────────────

let lastLocalTodoLines = 0;

function renderLocalTodoList(queue: TaskItem[]): void {
  const lines: string[] = [];

  lines.push('');
  lines.push(topRule());
  lines.push(row(BRAND_SECONDARY('◆  MINIBOB AUTONOMY QUEUE')));
  lines.push(hRule());

  for (let i = 0; i < queue.length; i++) {
    const task  = queue[i];
    const label = task.suggestion.title || task.suggestion.description?.slice(0, 35) || 'No title';

    let icon: string;
    let color: any;

    switch (task.status) {
      case 'done':    icon = '☑';  color = SUCCESS;          break;
      case 'working': icon = '⏳'; color = BRAND_SECONDARY;  break;
      case 'failed':  icon = '✗';  color = ERROR;            break;
      case 'skipped': icon = '⏸'; color = MUTED;            break;
      default:        icon = '☐';  color = MUTED;
    }

    lines.push(row(color(`${icon} [${i + 1}/${queue.length}] ${task.suggestion.filePath}`)));
    lines.push(row(color(`  ${label}`)));
  }

  // ─── Progress bar ───
  const completed = queue.filter(t =>
    t.status === 'done' || t.status === 'failed' || t.status === 'skipped'
  ).length;
  const total   = queue.length;
  const percent = total > 0 ? completed / total : 0;
  const barLen  = BOX_WIDTH - 12;
  const filled  = Math.round(percent * barLen);

  let barColor: any;
  if (percent < 0.25)      barColor = ERROR;
  else if (percent < 0.50) barColor = chalk.hex('#FF8C00');
  else if (percent < 0.75) barColor = WARNING;
  else                     barColor = SUCCESS;

  lines.push(hRule());
  lines.push(row(
    `[${barColor('█'.repeat(filled))}${MUTED('░'.repeat(barLen - filled))}] ` +
    `${completed}/${total}  ${barColor(Math.round(percent * 100) + '%')}`
  ));
  lines.push(botRule());
  lines.push('');

  if (lastLocalTodoLines > 0) {
    process.stdout.write(`\x1B[${lastLocalTodoLines}A`);
    for (let i = 0; i < lastLocalTodoLines; i++) { process.stdout.write('\x1B[2K\n'); }
    process.stdout.write(`\x1B[${lastLocalTodoLines}A`);
  }

  for (const line of lines) { process.stdout.write(line + '\n'); }
  lastLocalTodoLines = lines.length;
}