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
import * as fs from 'fs';
import * as path from 'path';

const RED = chalk.hex('#EF5350');
const GREEN = chalk.hex('#66BB6A');
const AMBER = chalk.hex('#FFAB00');
const BLUE = chalk.hex('#42A5F5');
const GRAY = chalk.gray;
const BORDER = chalk.hex('#455A64');
const CYAN = chalk.cyan;

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

export function registerAutonomyCommand(program: Command): void {
  program
    .command('autonomy')
    .description('Launch autonomous repair mode — MiniBob fixes all analysed issues')
    .option('--status', 'Check current autonomy run progress (Tier 3)')
    .option('--stop', 'Stop the current autonomy run (Tier 3)')
    .option('--category <cat>', 'Limit to: bugs, features, improvements, upgrades')
    .option('--priority <level>', 'Minimum priority: critical, high, medium, low (default: high)', 'high')
    .option('--no-push', 'Skip git push after completion')
    .action(async (options: { status?: boolean; stop?: boolean; category?: string; priority?: string; push?: boolean }) => {
      const config = getConfig();

      if (options.status) {
        await showAutonomyStatus(config);
        return;
      }

      if (options.stop) {
        console.log(chalk.yellow('  ⚠️  Stop command not yet implemented for Tier 3.'));
        return;
      }

      // Route based on tier
      if (config.tier === 'platform' && config.provider !== 'local' && config.loggedIn && config.conversationId) {
        await runTier3Autonomy(config);
      } else {
        await runTier1Autonomy(config, options);
      }
    });
}

// ═══════════════════════════════════════════════════════════
// TIER 3 — PLATFORM AUTONOMY (Streams from Cloud Workers)
// ═══════════════════════════════════════════════════════════

async function runTier3Autonomy(config: any): Promise<void> {
  console.log('');
  console.log(chalk.bold.cyan('  ⚡ MiniBob Autonomy Mode (Platform)'));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log(GRAY(`  📡 Conversation: ${config.conversationId?.slice(0, 24)}...`));
  console.log(GRAY(`  🔗 https://bobs-workshop.web.app/#/bobcodeassistant/${config.conversationId}`));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log('');

  // 1. Ignite the autonomy loop
  const spinner = ora({ text: CYAN('  Igniting autonomy workers...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('startMiniBobAutonomy', {
      conversationId: config.conversationId,
      proxyEmail: null,
    });

    spinner.stop();

    if (!result?.success) {
      console.log(RED(`  ❌ ${result?.message || 'Failed to start autonomy.'}`));
      return;
    }

    console.log(GREEN('  ✅ Autonomy loop ignited!'));
    console.log(GRAY('  Streaming progress...'));
    console.log('');

  } catch (error: any) {
    spinner.stop();
    console.log(RED(`  ❌ ${error.message}`));
    return;
  }

  // 2. Poll for terminal updates
  let lastTimestamp = new Date().toISOString();
  let running = true;
  let tasksDone = 0;
  let totalTasks = 0;

  console.log(GRAY('  ─────────────────────────────────────'));
  console.log(GRAY('  Press Ctrl+C to stop streaming (workers continue in background)'));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log('');

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    running = false;
    console.log('');
    console.log(GRAY('  📡 Stopped streaming. Workers continue in the background.'));
    console.log(GRAY(`  Check progress: bob autonomy --status`));
    console.log('');
    process.exit(0);
  });

  while (running) {
    try {
      const updates = await callCloudFunction('getCLITerminalUpdates', {
        conversationId: config.conversationId,
        since: lastTimestamp,
      });

      if (updates?.lines && updates.lines.length > 0) {
        for (const line of updates.lines) {
          const text = line.text || '';
          const type = line.type || 'system';

          // Parse ticker
          if (text.includes('[ACTION:AUTONOMY_TICKER:')) {
            const parts = text.match(/\[ACTION:AUTONOMY_TICKER:(\d+):(\d+):(\d+):(\d+):(\d+):(\d+):(\d+)\]/);
            if (parts) {
              const bugs = parseInt(parts[2]);
              const features = parseInt(parts[3]);
              const improvements = parseInt(parts[4]);
              const upgrades = parseInt(parts[5]);
              const tokens = parseInt(parts[6]);
              totalTasks = parseInt(parts[7]);
              tasksDone = bugs + features + improvements + upgrades;

              renderTickerHUD(tasksDone, totalTasks, bugs, features, improvements, upgrades, tokens);
            }
            continue;
          }

          // Parse push request
          if (text.includes('[ACTION:GITHUB_PUSH_REQUEST:')) {
            console.log('');
            console.log(GREEN('  ✅ All tasks complete!'));
            console.log(AMBER('  📤 MiniBob wants to push to GitHub.'));

            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise<string>(resolve => {
              rl.question(CYAN('  Approve push? (y/n): '), resolve);
            });
            rl.close();

            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
              try {
                await callCloudFunction('commitAndPushChanges', { conversationId: config.conversationId });
                console.log(GREEN('  ✅ Pushed to GitHub!'));
              } catch (pushErr: any) {
                console.log(RED(`  ❌ Push failed: ${pushErr.message}`));
              }
            } else {
              console.log(GRAY('  Push skipped. You can push manually later.'));
            }

            running = false;
            continue;
          }

          // Parse completion
          if (text.includes('ALL TASKS COMPLETE')) {
            running = false;
          }

          // Render line
          let lineColor: any;
          if (type === 'stderr') lineColor = RED;
          else if (type === 'stdout') lineColor = GREEN;
          else lineColor = GRAY;

          console.log(lineColor(`  ${text}`));

          lastTimestamp = line.timestamp || lastTimestamp;
        }
      }

    } catch (pollError: any) {
      // Silent failure on polling — just retry
    }

    // Wait 2.5 seconds between polls
    if (running) {
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
  }

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + AMBER(' ◆ AUTONOMY SESSION COMPLETE'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GREEN(`  ✅ Tasks completed: ${tasksDone}/${totalTasks}`));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════
// TIER 1 — LOCAL AUTONOMY (Uses Ollama directly)
// ═══════════════════════════════════════════════════════════

async function runTier1Autonomy(config: any, options: any): Promise<void> {
  if (config.provider !== 'local' || !config.localEndpoint) {
    console.log(RED('  ❌ Local autonomy requires a local model.'));
    console.log(GRAY('  Run `bob config set provider local`'));
    console.log(GRAY('  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`'));
    return;
  }

  const categories = options.category ? [options.category] : ['bugs', 'features', 'improvements', 'upgrades'];
  const priorityGate = options.priority || 'high';
  const shouldPush = options.push !== false;

  console.log('');
  console.log(chalk.bold.cyan('  ⚡ MiniBob Autonomy Mode (Local)'));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log(GRAY(`  Priority gate: ${priorityGate}+`));
  console.log(GRAY(`  Categories: ${categories.join(', ')}`));
  console.log(GRAY(`  Git push: ${shouldPush ? 'enabled' : 'disabled'}`));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log('');

  // 1. Load all pending suggestions
  let allSuggestions: Suggestion[] = [];
  for (const cat of categories) {
    allSuggestions.push(...loadLocalSuggestions(cat));
  }

  // Filter by priority
  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const gateIndex = priorityOrder.indexOf(priorityGate.toLowerCase());
  if (gateIndex >= 0) {
    allSuggestions = allSuggestions.filter(s => {
      const idx = priorityOrder.indexOf(s.priority?.toLowerCase());
      return idx >= 0 && idx <= gateIndex;
    });
  }

  if (allSuggestions.length === 0) {
    console.log(GREEN('  ✅ No pending tasks. Project is clean!'));
    return;
  }

  console.log(GRAY(`  Found ${allSuggestions.length} tasks to process.`));
  console.log('');

  // 2. Build work queue
  const workQueue: TaskItem[] = allSuggestions.map(s => ({
    suggestion: s,
    status: 'pending' as const,
  }));

  // 3. Process each task
  renderLocalTodoList(workQueue);

  let fixed = 0;
  let failed = 0;
  const fixedFiles: string[] = [];

  for (let i = 0; i < workQueue.length; i++) {
    const task = workQueue[i];
    task.status = 'working';
    renderLocalTodoList(workQueue);

    const success = await implementLocalTask(task.suggestion, config.localEndpoint!);
    task.status = success ? 'done' : 'failed';

    if (success) {
      fixed++;
      fixedFiles.push(task.suggestion.filePath);

      // Mark in analysis.json
      const suggestionIndex = parseInt(task.suggestion.id?.split('_').pop() || '0');
      const category = detectLocalCategory(task.suggestion);
      markSuggestionStatus(task.suggestion.filePath, suggestionIndex, category, 'implemented', {
        confidence: 100,
        reason: 'MiniBob autonomy',
        implementedBy: 'minibob-local-autonomy',
      });
    } else {
      failed++;
    }

    renderLocalTodoList(workQueue);
  }

  // 4. Report
  console.log('');
  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + AMBER(' ◆ MINIBOB AUTONOMY REPORT'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GREEN(`  ✅ Fixed: ${fixed} files`));
  if (failed > 0) { console.log(BORDER('  ║') + RED(`  ❌ Failed: ${failed} files`)); }
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  // 5. Git push
  if (shouldPush && fixed > 0) {
    const git = simpleGit(process.cwd());
    const isRepo = await git.checkIsRepo();

    if (isRepo) {
      console.log(CYAN('  📤 Committing and pushing to git...'));

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

        console.log(GREEN(`  ✅ Pushed to ${branch}!`));
        console.log(GRAY(`  Commit: MiniBob Autonomy: Fixed ${fixed} issue(s)`));

      } catch (gitErr: any) {
        console.log(RED(`  ❌ Git push failed: ${gitErr.message}`));
        console.log(GRAY('  Files are saved locally. Push manually with `bob push "message"`.'));
      }
    } else {
      console.log(GRAY('  Not a git repo. Files saved locally only.'));
    }
  }

  console.log('');
  console.log(GRAY('  📦 All original files backed up to .bob-backups/'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════
// STATUS CHECK
// ═══════════════════════════════════════════════════════════

async function showAutonomyStatus(config: any): Promise<void> {
  if (!config.loggedIn || !config.conversationId) {
    console.log(chalk.yellow('  ⚠️  Status requires Tier 3 with an active conversation.'));
    return;
  }

  const spinner = ora({ text: CYAN('  Checking autonomy status...'), spinner: 'dots' }).start();

  try {
    const result = await callCloudFunction('getCLITerminalUpdates', {
      conversationId: config.conversationId,
      since: new Date(Date.now() - 60000).toISOString(), // Last 60 seconds
      limit: 5,
    });

    spinner.stop();

    if (result?.lines && result.lines.length > 0) {
      console.log('');
      console.log(AMBER('  ◆ Recent Autonomy Activity:'));
      console.log(GRAY('  ─────────────────────────────────────'));
      for (const line of result.lines) {
        console.log(GRAY(`  ${line.text}`));
      }
      console.log('');
    } else {
      console.log('');
      console.log(GRAY('  No recent autonomy activity.'));
      console.log('');
    }
  } catch (error: any) {
    spinner.stop();
    console.log(RED(`  ❌ ${error.message}`));
  }
}

// ═══════════════════════════════════════════════════════════
// LOCAL IMPLEMENTATION
// ═══════════════════════════════════════════════════════════

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
      { role: 'system', content: 'You are MiniBob making SURGICAL fixes. Return ONLY valid source code. NO markdown. NO code fences. Start with // File: comment. MINIMUM change only.' },
      { role: 'user', content: prompt },
    ];

    const response = await callLocalModel(endpoint, messages);

    const lines = response.split('\n');
    const firstLine = lines[0].trim();
    let newContent: string;

    if (firstLine.match(/^\/\/\s*(File:)?\s*/)) {
      newContent = lines.slice(1).join('\n').trim();
    } else {
      newContent = response.trim();
    }

    // Validation
    if (newContent.includes('```') || newContent.includes('## ') || newContent.startsWith('Here') || newContent.startsWith('I have') || newContent.startsWith('Sure')) {
      return false;
    }

    if (newContent.length < fileContent.length * 0.5) {
      return false;
    }

    const originalExports = fileContent.match(/export\s+(function|class|const|interface|type|async\s+function)\s+\w+/g) || [];
    for (const exp of originalExports) {
      const exportName = exp.split(/\s+/).pop()!;
      if (!newContent.includes(exportName)) {
        return false;
      }
    }

    // Backup + write
    const absolutePath = path.join(process.cwd(), suggestion.filePath);
    const backupDir = path.join(process.cwd(), '.bob-backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    if (fs.existsSync(absolutePath)) {
      const timestamp = Date.now();
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

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function detectLocalCategory(suggestion: Suggestion): string {
  const cwd = process.cwd();
  const projectName = path.basename(cwd);
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const analysisPath = path.join(homeDir, '.bob', 'projects', projectName, 'analysis', 'results', 'analysis.json');

  if (!fs.existsSync(analysisPath)) return 'bugs';

  const allResults = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
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

function renderTickerHUD(done: number, total: number, bugs: number, features: number, improvements: number, upgrades: number, tokens: number): void {
  const percent = total > 0 ? done / total : 0;
  const barLen = 30;
  const filled = Math.round(percent * barLen);

  let barColor: any;
  if (percent < 0.25) barColor = chalk.red;
  else if (percent < 0.50) barColor = chalk.hex('#FF8C00');
  else if (percent < 0.75) barColor = chalk.yellow;
  else barColor = chalk.green;

  const bar = barColor('█'.repeat(filled)) + GRAY('░'.repeat(barLen - filled));
  console.log(`  ⚡ [${bar}] ${done}/${total}  ${barColor(Math.round(percent * 100) + '%')}`);
  console.log(GRAY(`  🐛 ${bugs}  ⭐ ${features}  🔧 ${improvements}  ⬆️ ${upgrades}  |  Tokens: ${tokens.toLocaleString()}`));
}

let lastLocalTodoLines = 0;

function renderLocalTodoList(queue: TaskItem[]): void {
  const lines: string[] = [];
  lines.push('');
  lines.push(AMBER('  📋 MiniBob Autonomy Queue'));
  lines.push(GRAY('  ─────────────────────────────────────'));

  for (let i = 0; i < queue.length; i++) {
    const task = queue[i];
    const label = task.suggestion.title || task.suggestion.description?.slice(0, 35) || 'No title';
    let icon: string;
    let color: any;

    switch (task.status) {
      case 'done': icon = '☑'; color = GREEN; break;
      case 'working': icon = '⏳'; color = AMBER; break;
      case 'failed': icon = '✗'; color = RED; break;
      case 'skipped': icon = '⏸️'; color = GRAY; break;
      default: icon = '☐'; color = GRAY;
    }

    lines.push(color(`  ${icon} [${i + 1}/${queue.length}] ${task.suggestion.filePath}`));
    lines.push(color(`    ${label}`));
  }

  const completed = queue.filter(t => t.status === 'done' || t.status === 'failed' || t.status === 'skipped').length;
  const total = queue.length;
  const percent = total > 0 ? completed / total : 0;
  const barLen = 30;
  const filled = Math.round(percent * barLen);

  let barColor: any;
  if (percent < 0.25) barColor = chalk.red;
  else if (percent < 0.50) barColor = chalk.hex('#FF8C00');
  else if (percent < 0.75) barColor = chalk.yellow;
  else barColor = chalk.green;

  lines.push('');
  lines.push(`  [${barColor('█'.repeat(filled))}${GRAY('░'.repeat(barLen - filled))}] ${completed}/${total}  ${barColor(Math.round(percent * 100) + '%')}`);
  lines.push('');

  if (lastLocalTodoLines > 0) {
    process.stdout.write(`\x1B[${lastLocalTodoLines}A`);
    for (let i = 0; i < lastLocalTodoLines; i++) { process.stdout.write('\x1B[2K\n'); }
    process.stdout.write(`\x1B[${lastLocalTodoLines}A`);
  }

  for (const line of lines) { process.stdout.write(line + '\n'); }
  lastLocalTodoLines = lines.length;
}