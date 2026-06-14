// File: src/commands/command-center.ts
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction, isAuthenticated } from '../core/api-client.js';

// ─── DESIGN TOKENS ───
const ORANGE  = chalk.hex('#E66F24');
const AMBER   = chalk.hex('#FFAB00');
const GREEN   = chalk.hex('#66BB6A');
const RED     = chalk.hex('#EF5350');
const BLUE    = chalk.hex('#42A5F5');
const PURPLE  = chalk.hex('#AB47BC');
const CYAN    = chalk.hex('#26C6DA');
const TEAL    = chalk.hex('#26A69A');
const GRAY    = chalk.gray;
const WHITE   = chalk.white;
const BORDER  = chalk.hex('#455A64');

// ─── STATUS COLORS ───
function statusColor(status: string): chalk.Chalk {
  switch (status) {
    case 'queued':            return GRAY;
    case 'awaiting_approval': return AMBER;
    case 'in_progress':       return BLUE;
    case 'completed':         return GREEN;
    case 'failed':            return RED;
    case 'denied':            return RED;
    default:                  return GRAY;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued':            return 'QUEUED';
    case 'awaiting_approval': return 'NEEDS APPROVAL';
    case 'in_progress':       return 'IN PROGRESS';
    case 'completed':         return 'COMPLETE';
    case 'failed':            return 'FAILED';
    case 'denied':            return 'DENIED';
    default:                  return status.toUpperCase();
  }
}

function categoryColor(category: string): chalk.Chalk {
  const map: Record<string, chalk.Chalk> = {
    security:        RED,
    frontend:        BLUE,
    backend:         GREEN,
    cloud_functions: PURPLE,
    documentation:   TEAL,
    testing:         AMBER,
    review:          CYAN,
    fullstack:       ORANGE,
  };
  return map[category] || GRAY;
}

function confidenceColor(confidence: number): chalk.Chalk {
  if (confidence >= 80) return GREEN;
  if (confidence >= 50) return AMBER;
  return RED;
}

function formatTimestamp(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '  • ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── RENDER STATS BAR ───
function renderStats(stats: any): void {
  console.log('');
  console.log(BORDER('  ─── COMMAND CENTER ──────────────────────────────────────────'));
  const parts: string[] = [];
  if (stats.awaiting_approval > 0) parts.push(AMBER(`${stats.awaiting_approval} PENDING`));
  if (stats.in_progress > 0)       parts.push(BLUE(`${stats.in_progress} RUNNING`));
  if (stats.completed > 0)         parts.push(GREEN(`${stats.completed} DONE`));
  if (stats.failed > 0)            parts.push(RED(`${stats.failed} FAILED`));
  if (stats.denied > 0)            parts.push(GRAY(`${stats.denied} DENIED`));
  parts.push(GRAY(`${stats.total} TOTAL`));
  console.log('  ' + parts.join(GRAY('  │  ')));
  console.log(BORDER('  ────────────────────────────────────────────────────────────────'));
  console.log('');
}

// ─── RENDER TASK DETAIL ───
function renderTaskDetail(task: any): void {
  const catColor = categoryColor(task.request.category);
  const confColor = confidenceColor(task.request.confidence);
  const sColor = statusColor(task.outcome.status);

  console.log('');
  console.log(BORDER('  ┌─ TASK DETAIL ──────────────────────────────────────────────┐'));
  console.log(BORDER('  │'));
  console.log(BORDER('  │  ') + WHITE(task.request.description));
  console.log(BORDER('  │'));
  console.log(BORDER('  │  ') + catColor(`[${task.request.category.toUpperCase()}]`) + '  ' +
    WHITE(`${task.request.taskType.toUpperCase()}`) + '  ' +
    confColor(`${task.request.confidence}% confidence`) + '  ' +
    sColor(`● ${statusLabel(task.outcome.status)}`));

  if (task.request.targetFile) {
    console.log(BORDER('  │  ') + GRAY('File: ') + CYAN(task.request.targetFile));
  }

  console.log(BORDER('  │'));
  console.log(BORDER('  │  ') + GRAY('Priority: ') + WHITE(`P${task.priority}`) +
    GRAY('  │  Difficulty: ') + WHITE(task.difficulty.toUpperCase()) +
    GRAY('  │  Created: ') + WHITE(formatTimestamp(task.createdAt)));

  console.log(BORDER('  │'));
  console.log(BORDER('  │  ') + AMBER('TRIGGER'));
  console.log(BORDER('  │  ') + GRAY(stripMarkdown(task.trigger.reasoning).slice(0, 120) + '...'));

  if (task.trigger.turnSatisfaction !== null) {
    console.log(BORDER('  │  ') + GRAY('SAT at dispatch: ') + CYAN(`${task.trigger.turnSatisfaction}%`));
  }

  if (task.outcome.resultSummary) {
    console.log(BORDER('  │'));
    console.log(BORDER('  │  ') + GREEN('RESULT'));
    console.log(BORDER('  │  ') + GRAY(stripMarkdown(task.outcome.resultSummary).slice(0, 200) + '...'));
  }

  if (task.outcome.filesModified && task.outcome.filesModified.length > 0) {
    console.log(BORDER('  │'));
    console.log(BORDER('  │  ') + AMBER('FILES MODIFIED'));
    for (const file of task.outcome.filesModified) {
      const icon = file.action === 'created' ? GREEN('+') : AMBER('~');
      console.log(BORDER('  │  ') + icon + '  ' + CYAN(file.path || file));
    }
  }

  if (task.outcome.error) {
    console.log(BORDER('  │'));
    console.log(BORDER('  │  ') + RED('ERROR'));
    console.log(BORDER('  │  ') + RED(task.outcome.error.slice(0, 150)));
  }

  if (task.isDenied && task.denyReason) {
    console.log(BORDER('  │'));
    console.log(BORDER('  │  ') + RED('DENIED BY: ') + GRAY(task.deniedBy || 'Unknown'));
    console.log(BORDER('  │  ') + RED('REASON: ') + GRAY(task.denyReason));
  }

  if (task.outcome.turnsUsed || task.outcome.tokensConsumed) {
    console.log(BORDER('  │'));
    if (task.outcome.turnsUsed) {
      console.log(BORDER('  │  ') + GRAY(`Turns: ${task.outcome.turnsUsed}  │  Tokens: ${task.outcome.tokensConsumed || 0}  │  Provider: ${task.outcome.provider || 'unknown'}`));
    }
  }

  console.log(BORDER('  │'));
  console.log(BORDER('  └────────────────────────────────────────────────────────────┘'));
  console.log('');
}

// ─── DECISION STREAM MODE ───
async function runDecisionStream(conversationId: string): Promise<void> {
  console.log('');
  console.log(ORANGE('  ─── DECISION STREAM ─────────────────────────────────────────'));
  console.log(GRAY('  Live feed of all autonomous decisions. Ctrl+C to exit.\n'));

  let lastCount = 0;
  let running = true;

  process.on('SIGINT', () => {
    running = false;
    console.log('\n' + AMBER('  Stream ended.'));
    process.exit(0);
  });

  while (running) {
    try {
      const response = await callCloudFunction('getCLIAutonomousTasks', { conversationId });
      const tasks: any[] = response?.tasks || [];

      if (tasks.length > lastCount) {
        const newTasks = tasks.slice(0, tasks.length - lastCount);
        for (const task of newTasks.reverse()) {
          const sColor = statusColor(task.outcome.status);
          const catColor = categoryColor(task.request.category);
          console.log(
            GRAY(`  ${formatTimestamp(task.createdAt)}  `) +
            catColor(`[${task.request.category.toUpperCase()}]`) + '  ' +
            WHITE(task.request.description.slice(0, 60) + (task.request.description.length > 60 ? '...' : '')) + '  ' +
            sColor(`● ${statusLabel(task.outcome.status)}`)
          );
        }
        lastCount = tasks.length;
      }
    } catch (e: any) {
      console.log(RED(`  ❌ Poll error: ${e.message}`));
    }

    await new Promise(r => setTimeout(r, 3000));
  }
}

// ─── SETTINGS MODE ───
// ─── SETTINGS MODE ───
async function runSettings(conversationId: string): Promise<void> {
  // Fetch current settings
  let response: any;
  try {
    response = await callCloudFunction('getCLIAutonomousTasks', { conversationId });
  } catch (e: any) {
    console.log(RED(`  ❌ Failed to fetch settings: ${e.message}`));
    return;
  }

  const settings = response?.settings || {};

  console.log('');
  console.log(ORANGE('  ─── AUTONOMY SETTINGS ───────────────────────────────────────'));
  console.log(GRAY(`  Current threshold: ${settings.autonomousConfidenceThreshold ?? 75}%`));
  console.log(GRAY('  Tasks below this confidence level require your approval.'));
  console.log('');

  const { threshold } = await inquirer.prompt([
    {
      type: 'number',
      name: 'threshold',
      message: AMBER('  Confidence threshold (0-100):'),
      default: settings.autonomousConfidenceThreshold ?? 75,
      validate: (val: number) => (val >= 0 && val <= 100) ? true : 'Must be 0-100',
    }
  ]);

  const categories = ['security', 'frontend', 'backend', 'cloud_functions', 'documentation', 'testing', 'review', 'fullstack'];
  const overrides: Record<string, string> = { ...(settings.autonomousCategoryOverrides || {}) };

  console.log('');
  console.log(GRAY('  Category overrides:'));
  console.log('');

  for (const cat of categories) {
    const current = overrides[cat] || 'threshold';
    const { override } = await inquirer.prompt([
      {
        type: 'select',
        name: 'override',
        message: categoryColor(cat)(`    ${cat.padEnd(20)}`),
        default: current,
        choices: [
          { name: GRAY('Use Threshold'),           value: 'threshold' },
          { name: GREEN('Always Auto-Execute'),    value: 'autonomous' },
          { name: RED('Always Require Approval'),  value: 'approval_required' },
        ],
      }
    ]);
    if (override === 'threshold') {
      delete overrides[cat];
    } else {
      overrides[cat] = override;
    }
  }

  // Save via CF
  try {
    await callCloudFunction('updateCLIAutonomySettings', {
      conversationId,
      autonomousConfidenceThreshold: threshold,
      autonomousCategoryOverrides: overrides,
    });
    console.log('');
    console.log(GREEN('  ✅ Settings saved.'));
  } catch {
    console.log('');
    console.log(AMBER('  ⚠️  `updateCLIAutonomySettings` not deployed yet.'));
    console.log(GRAY('  Update via web app for now, or deploy the CF first.'));
  }
  console.log('');
}

// ─── MAIN TASK BOARD ───
// ─── MAIN TASK BOARD ───
async function runTaskBoard(conversationId: string): Promise<void> {
  let continueLoop = true;

  while (continueLoop) {
    // Fetch tasks
    let response: any;
    try {
      response = await callCloudFunction('getCLIAutonomousTasks', { conversationId });
    } catch (e: any) {
      console.log(RED(`  ❌ Failed to fetch tasks: ${e.message}`));
      return;
    }

    const tasks: any[] = response?.tasks || [];
    const stats = response?.stats || {};

    renderStats(stats);

    if (tasks.length === 0) {
      console.log(GRAY('  No autonomous tasks found for this conversation.'));
      console.log(GRAY('  Tasks appear here when UserBob dispatches work to Mini Bob.'));
      console.log('');
      return;
    }

    // ─── DEDUPLICATE — keep only most recent per unique description ───
    const seen = new Map<string, any>();
    for (const task of tasks) {
      const key = task.request.description.slice(0, 80);
      if (!seen.has(key) || (task.createdAt || 0) > (seen.get(key).createdAt || 0)) {
        seen.set(key, task);
      }
    }
    const dedupedTasks = Array.from(seen.values());

    // ─── BUILD CHOICES ───
    const taskChoices = dedupedTasks.map((task: any) => {
      const sColor = statusColor(task.outcome.status);
      const catColor = categoryColor(task.request.category);
      const desc = task.request.description.slice(0, 55) + (task.request.description.length > 55 ? '...' : '');
      return {
        name: sColor(`  ● ${statusLabel(task.outcome.status).padEnd(16)}`) + '  ' +
              catColor(`[${task.request.category.padEnd(15)}]`) + '  ' +
              WHITE(desc),
        value: task.id,
        short: task.request.description.slice(0, 40),
      };
    });

    // ─── FOOTER OPTIONS (no Separator — causes re-render flicker) ───
    taskChoices.push({
      name: BORDER('  ────────────────────────────────────────────────────────'),
      value: '__separator__',
      short: '',
      disabled: true,
    } as any);
    taskChoices.push({
      name: GRAY('  ↩  Exit Command Center'),
      value: '__exit__',
      short: 'Exit',
    });

    const { selectedTaskId } = await inquirer.prompt([
      {
        type: 'select',
        name: 'selectedTaskId',
        message: ORANGE('  Select a task to inspect:'),
        choices: taskChoices,
        pageSize: 14,
      }
    ]);

    // ─── EXIT / SEPARATOR GUARDS ───
    if (selectedTaskId === '__exit__' || selectedTaskId === '__separator__') {
      continueLoop = false;
      break;
    }

    // ─── FIND SELECTED TASK ───
    const selectedTask = dedupedTasks.find((t: any) => t.id === selectedTaskId);
    if (!selectedTask) continue;

    // ─── RENDER FULL DETAIL ───
    renderTaskDetail(selectedTask);

    // ─── BUILD ACTIONS ───
    const actions: any[] = [];

    if (selectedTask.outcome.status === 'awaiting_approval') {
      actions.push({ name: GREEN('  ✅  Approve — execute this task now'), value: 'approve', short: 'Approve' });
      actions.push({ name: RED('  ❌  Deny — reject this task'),          value: 'deny',    short: 'Deny'    });
    }

    actions.push({ name: AMBER('  ↩  Back to task list'),                value: 'back',    short: 'Back'    });
    actions.push({ name: GRAY('  ✕  Exit Command Center'),               value: 'exit',    short: 'Exit'    });

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: ORANGE('  What would you like to do?'),
        choices: actions,
      }
    ]);

    // ─── APPROVE ───
    if (action === 'approve') {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: AMBER('  Approve task and execute autonomously?'),
          default: true,
        }
      ]);

      if (confirmed) {
        console.log('');
        console.log(ORANGE('  ─── EXECUTION STREAM ────────────────────────────────────────'));
        console.log(GRAY('  Mini Bob is executing. Streaming live logs...\n'));

        // Fire approval without blocking
        callCloudFunction('approveAutonomousTask', {
          conversationId,
          taskId: selectedTask.id,
          action: 'approve',
        }).then(() => {
          // CF returned — task complete
        }).catch((e: any) => {
          console.log(RED(`\n  ❌ Execution error: ${e.message}`));
        });

        // Poll execution log in real time
        let running = true;
        let seenLogIds = new Set<string>();
        let pollErrors = 0;
        const maxPollErrors = 5;

        const sigintHandler = () => {
          running = false;
          console.log('\n' + AMBER('  Stream ended. Task continues in background.'));
          process.exit(0);
        };
        process.on('SIGINT', sigintHandler);

        while (running) {
          await new Promise(r => setTimeout(r, 2000));

          try {
            // Poll task status
            const taskResponse = await callCloudFunction('getCLIAutonomousTasks', {
              conversationId,
              statusFilter: null,
            });
            const updatedTask = taskResponse?.tasks?.find((t: any) => t.id === selectedTask.id);

            // Poll execution log
            const logResponse = await callCloudFunction('getCLITaskExecutionLog', {
              conversationId,
              taskId: selectedTask.id,
            });
            const logEntries: any[] = logResponse?.entries || [];

            // Render new log entries
            for (const entry of logEntries) {
              if (seenLogIds.has(entry.id)) continue;
              seenLogIds.add(entry.id);

              const stage = entry.stage || 'EXECUTION';
              let prefix: string;
              switch (stage) {
                case 'INIT':              prefix = CYAN('  [INIT]      ');    break;
                case 'TOOL_CALL':         prefix = AMBER('  [TOOL]      ');   break;
                case 'FALLBACK':          prefix = AMBER('  [FALLBACK]  ');   break;
                case 'COMPLETE':          prefix = GREEN('  [DONE]      ');   break;
                case 'ERROR':             prefix = RED('  [ERROR]     ');     break;
                case 'APPROVED':          prefix = GREEN('  [APPROVED]  ');   break;
                case 'DENIED':            prefix = RED('  [DENIED]    ');     break;
                case 'AWAITING_APPROVAL': prefix = AMBER('  [PENDING]   ');   break;
                default:                  prefix = GRAY('  [LOG]       ');    break;
              }
              console.log(prefix + WHITE(entry.text));
            }

            // Check terminal states
            if (updatedTask) {
              const status = updatedTask.outcome.status;

              if (status === 'completed') {
                console.log('');
                console.log(GREEN('  ✅ Task complete!'));

                if (updatedTask.outcome.filesModified?.length > 0) {
                  console.log('');
                  console.log(AMBER('  Files modified:'));
                  for (const file of updatedTask.outcome.filesModified) {
                    const icon = file.action === 'created' ? GREEN('+') : AMBER('~');
                    console.log(`    ${icon}  ${CYAN(file.path || file)}`);
                  }
                }

                if (updatedTask.outcome.resultSummary) {
                  console.log('');
                  console.log(AMBER('  Summary:'));
                  const summary = stripMarkdown(updatedTask.outcome.resultSummary);
                  const lines = summary.split('\n').slice(0, 8);
                  for (const line of lines) {
                    console.log(GRAY(`  ${line}`));
                  }
                }

                if (updatedTask.outcome.turnsUsed) {
                  console.log('');
                  console.log(GRAY(`  Turns: ${updatedTask.outcome.turnsUsed}  │  Tokens: ${updatedTask.outcome.tokensConsumed || 0}  │  Provider: ${updatedTask.outcome.provider || 'unknown'}`));
                }

                running = false;

              } else if (status === 'failed') {
                console.log('');
                console.log(RED(`  ❌ Task failed: ${updatedTask.outcome.error || 'Unknown error'}`));
                running = false;

              } else if (status === 'denied') {
                console.log('');
                console.log(RED('  ❌ Task was denied.'));
                running = false;
              }
            }

            pollErrors = 0;

          } catch (e: any) {
            pollErrors++;
            if (pollErrors >= maxPollErrors) {
              console.log(RED(`  ❌ Lost connection after ${maxPollErrors} errors. Task continues in background.`));
              running = false;
            }
          }
        }

        process.removeListener('SIGINT', sigintHandler);
        console.log('');
      }

    // ─── DENY ───
    } else if (action === 'deny') {
      const { reason } = await inquirer.prompt([
        {
          type: 'input',
          name: 'reason',
          message: AMBER('  Denial reason (optional):'),
          default: '',
        }
      ]);

      try {
        console.log(GRAY('  Denying task...'));
        await callCloudFunction('approveAutonomousTask', {
          conversationId,
          taskId: selectedTask.id,
          action: 'deny',
          reason: reason.trim() || null,
        });
        console.log('');
        console.log(RED('  ❌ Task denied.'));
        console.log('');
      } catch (e: any) {
        console.log(RED(`  ❌ Failed to deny: ${e.message}`));
      }

    // ─── EXIT ───
    } else if (action === 'exit') {
      continueLoop = false;
      break;
    }
    // 'back' falls through — re-renders the task list
  }
}

// ─── REGISTER COMMAND ───
export function registerCommandCenterCommand(program: Command): void {
  program
    .command('command-center')
    .alias('cc')
    .description('Autonomous Command Center — inspect, approve, and manage UserBob dispatch tasks')
    .option('--stream', 'Live decision stream feed')
    .option('--settings', 'Configure autonomy threshold and category overrides')
    .action(async (options: { stream?: boolean; settings?: boolean }) => {

      if (!isAuthenticated()) {
        console.log('');
        console.log(RED('  ❌ Authentication required.'));
        console.log(GRAY('  Run `bob login` first.'));
        console.log('');
        process.exit(1);
      }

      const config = getConfig();
      const conversationId = config.conversationId;

      if (!conversationId) {
        console.log('');
        console.log(RED('  ❌ No active conversation.'));
        console.log(GRAY('  Run `bob conversations join` first.'));
        console.log('');
        process.exit(1);
      }

      console.log('');
      console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
      console.log(BORDER('  ║') + ORANGE('  ◉ AUTONOMOUS COMMAND CENTER'));
      console.log(BORDER('  ║') + GRAY(`  Conversation: ${conversationId.slice(0, 24)}...`));
      console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));

      if (options.stream) {
        await runDecisionStream(conversationId);
        return;
      }

      if (options.settings) {
        await runSettings(conversationId);
        return;
      }

      await runTaskBoard(conversationId);
    });
}