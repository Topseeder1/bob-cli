import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { getConfig } from '../core/config-store.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { ensureProjectStructure } from '../core/project-map.js';
import { readFileContent } from '../core/context-builder.js';
import { loadLocalSuggestions } from './analyse-results.js';
import { markSuggestionStatus } from '../core/analysis-tracker.js';

const RED = chalk.hex('#EF5350');
const GREEN = chalk.hex('#66BB6A');
const AMBER = chalk.hex('#FFAB00');
const BLUE = chalk.hex('#42A5F5');
const GRAY = chalk.gray;
const BORDER = chalk.hex('#455A64');

interface Suggestion {
  title: string;
  description: string;
  priority: string;
  implementation?: string;
  filePath: string;
  id?: string;
}

interface TriageResult {
  action: 'work' | 'review' | 'dismiss';
  confidence: number;
  reason: string;
  suggestion: Suggestion;
}

interface TaskItem {
  suggestion: Suggestion;
  confidence: number;
  reason: string;
  status: 'pending' | 'working' | 'done' | 'failed' | 'skipped';
}

export async function runAutoFix(options: {
  category?: string;
  confidence?: number;
  priority?: string;
}): Promise<void> {
  const config = getConfig();

  if (config.provider !== 'local' || !config.localEndpoint) {
    console.log('');
    console.log(chalk.red('  ❌ Auto-fix requires a local model.'));
    console.log(GRAY('  Run `bob config set provider local`'));
    console.log(GRAY('  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`'));
    console.log('');
    return;
  }

  const confidenceGate = options.confidence || 90;
  const priorityGate = options.priority || 'critical';
  const categories = options.category ? [options.category] : ['bugs', 'features', 'improvements', 'upgrades'];
  const isAutoMode = config.autoMode || false;

  console.log('');
  console.log(chalk.bold.cyan('  ⚡ MiniBob Auto-Fix Mode'));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log(GRAY(`  Confidence gate: ${confidenceGate}%`));
  console.log(GRAY(`  Priority gate: ${priorityGate}+`));
  console.log(GRAY(`  Categories: ${categories.join(', ')}`));
  console.log(GRAY(`  Auto mode: ${isAutoMode ? 'ON (no approval prompts)' : 'OFF (approval required)'}`));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log('');

  // ─── 1. LOAD SUGGESTIONS ───
  let allSuggestions: Suggestion[] = [];
  for (const cat of categories) {
    allSuggestions.push(...loadLocalSuggestions(cat));
  }

  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const gateIndex = priorityOrder.indexOf(priorityGate.toLowerCase());
  if (gateIndex >= 0) {
    allSuggestions = allSuggestions.filter(s => {
      const idx = priorityOrder.indexOf(s.priority?.toLowerCase());
      return idx >= 0 && idx <= gateIndex;
    });
  }

  if (allSuggestions.length === 0) {
    console.log(chalk.green('  ✅ No suggestions match your gates. Project is clean!'));
    console.log('');
    return;
  }

  console.log(GRAY(`  Found ${allSuggestions.length} suggestions matching criteria.`));
  console.log('');

  // ─── 2. TRIAGE ───
  console.log(AMBER('  🧠 Phase 1: Triage — Bob is evaluating suggestions...'));
  console.log('');

  const triageResults = await performTriage(allSuggestions, confidenceGate, config.localEndpoint!);
  if (!triageResults) return;

  const autoApprove = triageResults.filter(r => r.action === 'work' && r.confidence >= confidenceGate);
  const needsReview = triageResults.filter(r => r.action === 'review' || (r.action === 'work' && r.confidence < confidenceGate && r.confidence >= confidenceGate - 15));
  const dismissed = triageResults.filter(r => r.action === 'dismiss' || r.confidence < confidenceGate - 15);

  // ─── 3. SHOW TRIAGE ───
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + AMBER(' ◆ TRIAGE COMPLETE'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GREEN(`  ✅ Auto-approve: ${autoApprove.length} items (confidence ≥ ${confidenceGate}%)`));
  if (needsReview.length > 0) {
    console.log(BORDER('  ║') + AMBER(`  🤔 Needs review: ${needsReview.length} items`));
  }
  console.log(BORDER('  ║') + GRAY(`  ⏸️  Dismissed: ${dismissed.length} items`));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  if (autoApprove.length > 0) {
    console.log(GREEN('  ✅ APPROVE (auto-fix these):'));
    for (let i = 0; i < autoApprove.length; i++) {
      const item = autoApprove[i];
      console.log(GRAY(`    ${i + 1}. ${item.suggestion.filePath} — ${item.suggestion.title || item.suggestion.description?.slice(0, 40) || 'No title'} (${item.confidence}%)`));
    }
    console.log('');
  }

  if (needsReview.length > 0) {
    console.log(AMBER('  🤔 REVIEW (Bob wants your input):'));
    for (let i = 0; i < needsReview.length; i++) {
      const item = needsReview[i];
      console.log(GRAY(`    ${i + 1}. ${item.suggestion.filePath} — ${item.reason} (${item.confidence}%)`));
    }
    console.log('');
  }

  // Mark dismissed
  for (const item of dismissed) {
    const suggestionIndex = parseInt(item.suggestion.id?.split('_').pop() || '0');
    const category = detectCategory(item.suggestion);
    markSuggestionStatus(item.suggestion.filePath, suggestionIndex, category, 'dismissed', {
      confidence: item.confidence,
      reason: item.reason,
      implementedBy: 'bob-triage',
    });
  }

  // ─── APPROVAL ───
  let workQueue: TaskItem[] = [];

  if (isAutoMode) {
    workQueue = autoApprove.map(r => ({ suggestion: r.suggestion, confidence: r.confidence, reason: r.reason, status: 'pending' as const }));
    console.log(GRAY('  [Auto mode] Proceeding without approval prompt.'));
  } else {
    const { choice } = await inquirer.prompt([{
      type: 'select',
      name: 'choice',
      message: AMBER('How would you like to proceed?'),
      choices: [
        { name: GREEN(`  ✅ Auto-fix approved items only (${autoApprove.length} items)`), value: 'approved_only' },
        { name: GREEN(`  ✅ Auto-fix ALL including review items (${autoApprove.length + needsReview.length} items)`), value: 'all' },
        { name: BLUE('  🗣️  Talk to Bob about these suggestions'), value: 'talk' },
        { name: GRAY('  ← Cancel'), value: 'cancel' },
      ],
    }]);

    if (choice === 'cancel') { console.log(GRAY('  Cancelled.')); return; }

    if (choice === 'talk') {
      const updatedQueue = await talkToBobAboutSuggestions(autoApprove, needsReview, dismissed, config.localEndpoint!);
      if (updatedQueue.length === 0) { console.log(GRAY('  No items to implement.')); return; }
      workQueue = updatedQueue;
    } else if (choice === 'approved_only') {
      workQueue = autoApprove.map(r => ({ suggestion: r.suggestion, confidence: r.confidence, reason: r.reason, status: 'pending' as const }));
    } else {
      workQueue = [...autoApprove, ...needsReview].map(r => ({ suggestion: r.suggestion, confidence: r.confidence, reason: r.reason, status: 'pending' as const }));
    }
  }

  if (workQueue.length === 0) { console.log(chalk.yellow('  ⚠️  Nothing to implement.')); return; }

  // ─── 4. EXECUTION ───
  console.log('');
  console.log(AMBER('  🔧 Phase 3: MiniBob Implementing...'));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log(GRAY('  💬 /skip <file> to skip. /done to stop early.'));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log('');

  await executeWithChat(workQueue, config);

  // ─── 5. REPORT ───
  const fixed = workQueue.filter(t => t.status === 'done');
  const failed = workQueue.filter(t => t.status === 'failed');
  const skipped = workQueue.filter(t => t.status === 'skipped');

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + AMBER(' ◆ MINIBOB AUTO-FIX REPORT'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GREEN(`  ✅ Fixed: ${fixed.length} items`));
  console.log(BORDER('  ║') + GRAY(`  ⏸️  Held: ${dismissed.length + skipped.length} items`));
  if (failed.length > 0) { console.log(BORDER('  ║') + RED(`  ❌ Failed: ${failed.length} items`)); }
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));

  if (fixed.length > 0) {
    console.log(BORDER('  ║') + GRAY('  Fixed files:'));
    for (const item of fixed) { console.log(BORDER('  ║') + GREEN(`    ✅ ${item.suggestion.filePath}`)); }
  }
  if (failed.length > 0) {
    console.log(BORDER('  ║') + GRAY('  Failed:'));
    for (const item of failed) { console.log(BORDER('  ║') + RED(`    ❌ ${item.suggestion.filePath}`)); }
  }
  if (skipped.length > 0) {
    console.log(BORDER('  ║') + GRAY('  Skipped:'));
    for (const item of skipped) { console.log(BORDER('  ║') + GRAY(`    ⏸️  ${item.suggestion.filePath}`)); }
  }

  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log(GRAY('  📦 All original files backed up to .bob-backups/'));
  console.log(GRAY('  Run `bob push "MiniBob auto-fix batch"` to commit changes.'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════
// TRIAGE
// ═══════════════════════════════════════════════════════════

async function performTriage(suggestions: Suggestion[], confidenceGate: number, endpoint: string): Promise<TriageResult[] | null> {
    const triagePrompt = `You are the Lead QA Engineer triaging code suggestions for auto-implementation by MiniBob (a junior engineer).

  For each suggestion, decide: WORK, REVIEW, or DISMISS.

  DECISION CRITERIA:
  - WORK: The fix is clear, specific, well-defined, and you are CONFIDENT it will not break anything. MiniBob can implement it without supervision.
  - REVIEW: The fix is good but has side effects, touches shared logic, or behavioral changes that need human approval first.
  - DISMISS: The suggestion is vague, risky, poorly defined, or the effort/risk outweighs the benefit.

  CONFIDENCE SCORING — Your confidence represents:
  "How certain am I that this fix will NOT break anything AND will ACTUALLY contribute positively to the project?"
  - 95-100%: Fix is 1-5 lines, explicit instructions, zero side effects, purely additive improvement
  - 85-94%: Clear fix, well-scoped, touches isolated logic, minimal risk
  - 75-84%: Good fix but touches shared modules or has minor behavioral implications
  - <75%: Requires judgment, structural changes, or has unpredictable side effects

  SUGGESTIONS:
  ${suggestions.map((s, i) => `[${i}] ${s.priority?.toUpperCase()} | ${s.filePath} | ${s.title || 'No title'} | ${s.description || 'No description'} | Implementation: ${s.implementation || 'None provided'}`).join('\n')}

  Respond with ONLY a JSON array:
  [{"index": 0, "action": "work"|"review"|"dismiss", "confidence": 0-100, "reason": "brief reason for this confidence level"}]`;

  try {
    const messages: LocalChatMessage[] = [
      { role: 'system', content: 'You are a senior engineering lead. Respond with ONLY a valid JSON array.' },
      { role: 'user', content: triagePrompt },
    ];
    const response = await callLocalModel(endpoint, messages);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) { console.log(chalk.red('  ❌ Triage failed: Could not parse.')); return null; }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((d: any) => ({
      action: d.action === 'work' ? 'work' : d.action === 'review' ? 'review' : 'dismiss',
      confidence: d.confidence || 0,
      reason: d.reason || '',
      suggestion: suggestions[d.index],
    })).filter((r: any) => r.suggestion);
  } catch (error: any) {
    console.log(chalk.red(`  ❌ Triage failed: ${error.message}`));
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// TALK TO BOB
// ═══════════════════════════════════════════════════════════

async function talkToBobAboutSuggestions(approved: TriageResult[], review: TriageResult[], dismissed: TriageResult[], endpoint: string): Promise<TaskItem[]> {
  console.log('');
  console.log(BLUE('  🗣️  Chat with Bob about the suggestions'));
  console.log(GRAY('  Commands: skip <file>, add <file>, /done'));
  console.log(GRAY('  ─────────────────────────────────────'));
  console.log('');

  const history: LocalChatMessage[] = [
    { role: 'system', content: `You are Bob, helping decide which suggestions to implement. Be concise.\n\nAPPROVED: ${approved.map(r => `${r.suggestion.filePath}: ${r.suggestion.title || r.suggestion.description}`).join('\n')}\n\nREVIEW: ${review.map(r => `${r.suggestion.filePath}: ${r.reason}`).join('\n')}\n\nDISMISSED: ${dismissed.map(r => `${r.suggestion.filePath}: ${r.reason}`).join('\n')}` },
  ];

  let finalApproved = [...approved];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise<TaskItem[]>((resolve) => {
    const prompt = (): void => {
      rl.question(chalk.green('  You: '), async (input) => {
        const trimmed = input.trim();
        if (!trimmed) { prompt(); return; }

        if (trimmed === '/done') {
          rl.close();
          resolve(finalApproved.map(r => ({ suggestion: r.suggestion, confidence: r.confidence, reason: r.reason, status: 'pending' as const })));
          return;
        }

        if (trimmed.toLowerCase().startsWith('skip ') || trimmed.toLowerCase().startsWith('remove ')) {
          const target = trimmed.slice(trimmed.indexOf(' ') + 1).trim().toLowerCase();
          const before = finalApproved.length;
          finalApproved = finalApproved.filter(r => !r.suggestion.filePath.toLowerCase().includes(target));
          console.log(before > finalApproved.length ? chalk.yellow(`  ⏸️  Removed ${before - finalApproved.length} item(s)`) : GRAY(`  No match for "${target}"`));
          prompt(); return;
        }

        if (trimmed.toLowerCase().startsWith('add ')) {
          const target = trimmed.slice(4).trim().toLowerCase();
          const toAdd = [...review, ...dismissed].filter(r => r.suggestion.filePath.toLowerCase().includes(target));
          if (toAdd.length > 0) { finalApproved.push(...toAdd); console.log(chalk.green(`  ✅ Added ${toAdd.length} item(s)`)); }
          else { console.log(GRAY(`  No match for "${target}"`)); }
          prompt(); return;
        }

        history.push({ role: 'user', content: trimmed });
        try {
          const response = await callLocalModel(endpoint, history);
          history.push({ role: 'assistant', content: response });
          console.log(chalk.bold.cyan('  🤖 Bob: ') + response.split('\n')[0]);
          if (response.split('\n').length > 1) { response.split('\n').slice(1).forEach(l => console.log(`       ${l}`)); }
          console.log('');
        } catch { /* continue */ }
        prompt();
      });
    };
    prompt();
  });
}

// ═══════════════════════════════════════════════════════════
// EXECUTION WITH CHAT
// ═══════════════════════════════════════════════════════════

async function executeWithChat(workQueue: TaskItem[], config: any): Promise<void> {
  renderTodoList(workQueue);

  let userMessages: string[] = [];
  let chatActive = true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const inputPromise = new Promise<void>((resolve) => {
    const askForInput = () => {
      if (!chatActive) { resolve(); return; }
      rl.question(chalk.gray('  💬 '), (input) => {
        const trimmed = input.trim();
        if (trimmed === '/done') {
          for (const task of workQueue) { if (task.status === 'pending') task.status = 'skipped'; }
          chatActive = false; resolve(); return;
        }
        if (trimmed.startsWith('/skip ')) {
          const target = trimmed.slice(6).trim().toLowerCase();
          for (const task of workQueue) {
            if (task.status === 'pending' && task.suggestion.filePath.toLowerCase().includes(target)) {
              task.status = 'skipped';
              console.log(chalk.yellow(`  ⏸️  Skipping: ${task.suggestion.filePath}`));
            }
          }
        } else if (trimmed) { userMessages.push(trimmed); }
        if (chatActive) askForInput(); else resolve();
      });
    };
    askForInput();
  });

  for (let i = 0; i < workQueue.length; i++) {
    const task = workQueue[i];
    if (task.status === 'skipped') continue;

    task.status = 'working';
    renderTodoList(workQueue);

    if (userMessages.length > 0) {
      const userMsg = userMessages.shift()!;
      try {
        const bobResponse = await callLocalModel(config.localEndpoint!, [
          { role: 'system', content: `You are Bob supervising MiniBob. Respond in 1-2 sentences. Current task: ${task.suggestion.filePath}` },
          { role: 'user', content: userMsg },
        ]);
        console.log(chalk.bold.cyan(`  🤖 Bob: `) + bobResponse.split('\n')[0]);
        console.log('');
      } catch { /* continue */ }
    }

    const success = await implementTask(task, config.localEndpoint!);
    task.status = success ? 'done' : 'failed';

    if (success) {
      const suggestionIndex = parseInt(task.suggestion.id?.split('_').pop() || '0');
      const category = detectCategory(task.suggestion);
      markSuggestionStatus(task.suggestion.filePath, suggestionIndex, category, 'implemented', {
        confidence: task.confidence,
        reason: task.reason,
        implementedBy: 'minibob-auto',
      });
    }

    renderTodoList(workQueue);
  }

  chatActive = false;
  rl.close();
  await Promise.race([inputPromise, new Promise(resolve => setTimeout(resolve, 100))]);
}

// ═══════════════════════════════════════════════════════════
// IMPLEMENT TASK — WITH STRICT CONSTRAINTS
// ═══════════════════════════════════════════════════════════

async function implementTask(task: TaskItem, endpoint: string): Promise<boolean> {
  const suggestion = task.suggestion;
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
- PRESERVE ALL existing imports exactly as they are. Do NOT add, remove, or reorder imports.
- PRESERVE ALL existing exports exactly as they are. Do NOT rename exported functions or classes.
- PRESERVE the existing code structure, indentation, patterns, and naming conventions.
- Make the MINIMUM change necessary to implement the fix. Touch NOTHING else.
- Do NOT refactor, reorganize, or "improve" unrelated code.
- Do NOT add comments explaining what you changed.
- Do NOT wrap the response in markdown code blocks.
- The output must be valid TypeScript/JavaScript that compiles without errors.
- If you are unsure about a change, return the file UNCHANGED rather than risk breaking it.

Return the complete file content now:`;

  try {
    const messages: LocalChatMessage[] = [
      { role: 'system', content: 'You are MiniBob, a junior engineer making SURGICAL fixes. Return ONLY valid source code. NO markdown. NO code fences. NO explanation. Start with // File: comment. Make the ABSOLUTE MINIMUM change needed. Do NOT restructure, refactor, or touch ANYTHING beyond the specific fix. If unsure, return the file unchanged.' },
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

    // ─── VALIDATION CHECKS ───
    // Reject if response contains markdown or explanation
    if (newContent.includes('```') || newContent.includes('## ') || newContent.startsWith('Here') || newContent.startsWith('I have') || newContent.startsWith('Sure')) {
      console.log(chalk.yellow(`  ⚠️  MiniBob returned explanation instead of code. Skipping ${suggestion.filePath}.`));
      return false;
    }

    // Reject if file is suspiciously short (less than 50% of original)
    if (newContent.length < fileContent.length * 0.5) {
      console.log(chalk.yellow(`  ⚠️  MiniBob's output is ${Math.round((newContent.length / fileContent.length) * 100)}% of original size. Rejecting to prevent data loss.`));
      return false;
    }

    // Reject if original exports are missing
    const originalExports = fileContent.match(/export\s+(function|class|const|interface|type|async\s+function)\s+\w+/g) || [];
    for (const exp of originalExports) {
      const exportName = exp.split(/\s+/).pop()!;
      if (!newContent.includes(exportName)) {
        console.log(chalk.yellow(`  ⚠️  MiniBob removed export "${exportName}". Rejecting change to ${suggestion.filePath}.`));
        return false;
      }
    }

    // Reject if original imports are significantly different
    const originalImportCount = (fileContent.match(/^import\s+/gm) || []).length;
    const newImportCount = (newContent.match(/^import\s+/gm) || []).length;
    if (Math.abs(originalImportCount - newImportCount) > 2) {
      console.log(chalk.yellow(`  ⚠️  MiniBob changed import count from ${originalImportCount} to ${newImportCount}. Rejecting.`));
      return false;
    }

    // ─── WRITE WITH BACKUP ───
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

function detectCategory(suggestion: Suggestion): string {
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

let lastTodoLines = 0;

function renderTodoList(queue: TaskItem[]): void {
  const lines: string[] = [];

  lines.push('');
  lines.push(AMBER('  📋 MiniBob Work Queue'));
  lines.push(GRAY('  ─────────────────────────────────────'));

  for (let i = 0; i < queue.length; i++) {
    const task = queue[i];
    const label = task.suggestion.title || task.suggestion.description?.slice(0, 40) || 'No title';
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
    lines.push(color(`    ${label} (${task.confidence}%)`));
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

  if (lastTodoLines > 0) {
    process.stdout.write(`\x1B[${lastTodoLines}A`);
    for (let i = 0; i < lastTodoLines; i++) { process.stdout.write('\x1B[2K\n'); }
    process.stdout.write(`\x1B[${lastTodoLines}A`);
  }

  for (const line of lines) { process.stdout.write(line + '\n'); }
  lastTodoLines = lines.length;
}