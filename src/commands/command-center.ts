import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction, isAuthenticated } from '../core/api-client.js';
import { getActiveConversationId } from '../core/project-map.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY    = chalk.hex('#E66F24');
const BRAND_SECONDARY  = chalk.hex('#FFAB00');
const SUCCESS          = chalk.hex('#66BB6A');
const ERROR            = chalk.hex('#EF5350');
const WARNING          = chalk.hex('#FFC107');
const INFO             = chalk.hex('#26C6DA');
const MUTED            = chalk.hex('#78909C');
const WHITE            = chalk.white;
const BORDER           = chalk.hex('#455A64');

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

// ─── STATUS HELPERS ───
function statusColor(status: string): chalk.Chalk {
  switch (status) {
    case 'queued':            return MUTED;
    case 'awaiting_approval': return WARNING;
    case 'in_progress':       return INFO;
    case 'completed':         return SUCCESS;
    case 'failed':            return ERROR;
    case 'denied':            return ERROR;
    default:                  return MUTED;
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
    security:        ERROR,
    frontend:        INFO,
    backend:         SUCCESS,
    cloud_functions: chalk.hex('#AB47BC'),
    documentation:   chalk.hex('#26A69A'),
    testing:         WARNING,
    review:          INFO,
    fullstack:       BRAND_PRIMARY,
  };
  return map[category] || MUTED;
}

function confidenceColor(confidence: number): chalk.Chalk {
  if (confidence >= 80) return SUCCESS;
  if (confidence >= 50) return WARNING;
  return ERROR;
}

function formatTimestamp(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
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

// ─── RENDER STATS ─────────────────────────────────────────────────────────────

function renderStats(stats: any, conversationId: string): void {
  const pending  = stats.awaiting_approval || 0;
  const running  = stats.in_progress       || 0;
  const done     = stats.completed         || 0;
  const failed   = (stats.failed || 0) + (stats.denied || 0);
  const total    = stats.total             || 0;

  const statsLine =
    (pending > 0 ? WARNING(`${pending} PENDING`) + MUTED('  │  ') : '') +
    (running > 0 ? INFO(`${running} RUNNING`)    + MUTED('  │  ') : '') +
    (done    > 0 ? SUCCESS(`${done} DONE`)        + MUTED('  │  ') : '') +
    (failed  > 0 ? ERROR(`${failed} FAILED`)      + MUTED('  │  ') : '') +
    BRAND_SECONDARY(`${total} TOTAL`);

  console.log('');
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('◉  AUTONOMOUS COMMAND CENTER')));
  console.log(row(MUTED(`Conversation: ${conversationId.slice(0, 28)}...`)));
  console.log(hRule());
  console.log(emptyRow());
  console.log(row(statsLine));
  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}

// ─── RENDER TASK DETAIL ───────────────────────────────────────────────────────

function renderTaskDetail(task: any): void {
  const catColor  = categoryColor(task.request.category);
  const confColor = confidenceColor(task.request.confidence);
  const sColor    = statusColor(task.outcome.status);

  const desc = task.request.description.length > BOX_WIDTH - 4
    ? task.request.description.slice(0, BOX_WIDTH - 7) + '...'
    : task.request.description;

  console.log('');
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('◈  TASK DETAIL')));
  console.log(hRule());
  console.log(emptyRow());
  console.log(row(WHITE(desc)));
  console.log(emptyRow());

  // ─── Metadata row ───
  console.log(row(
    catColor(`[${task.request.category.toUpperCase()}]`) + '  ' +
    WHITE(task.request.taskType.toUpperCase()) + '  ' +
    confColor(`${task.request.confidence}% conf`) + '  ' +
    sColor(`● ${statusLabel(task.outcome.status)}`)
  ));

  if (task.request.targetFile) {
    console.log(row(MUTED('▸ File: ') + INFO(task.request.targetFile)));
  }

  console.log(emptyRow());
  console.log(row(
    MUTED('Priority: ') + WHITE(`P${task.priority}`) +
    MUTED('  │  Difficulty: ') + WHITE(task.difficulty.toUpperCase()) +
    MUTED('  │  ') + MUTED(formatTimestamp(task.createdAt))
  ));

  // ─── Trigger ───
  console.log(hRule());
  console.log(row(WARNING('▸ TRIGGER')));
  const reasoning = stripMarkdown(task.trigger.reasoning).slice(0, BOX_WIDTH * 2);
  const reasoningLines = reasoning.match(new RegExp(`.{1,${BOX_WIDTH - 4}}`, 'g')) || [];
  for (const line of reasoningLines.slice(0, 2)) {
    console.log(row(MUTED(line)));
  }
  if (task.trigger.turnSatisfaction !== null) {
    console.log(row(MUTED('SAT at dispatch: ') + INFO(`${task.trigger.turnSatisfaction}%`)));
  }

  // ─── Result ───
  if (task.outcome.resultSummary) {
    console.log(hRule());
    console.log(row(SUCCESS('▸ RESULT')));
    const summary = stripMarkdown(task.outcome.resultSummary).slice(0, BOX_WIDTH * 2);
    const summaryLines = summary.match(new RegExp(`.{1,${BOX_WIDTH - 4}}`, 'g')) || [];
    for (const line of summaryLines.slice(0, 3)) {
      console.log(row(MUTED(line)));
    }
  }

  // ─── Files modified ───
  if (task.outcome.filesModified && task.outcome.filesModified.length > 0) {
    console.log(hRule());
    console.log(row(BRAND_SECONDARY('▸ FILES TOUCHED')));
    for (const file of task.outcome.filesModified) {
      const icon = file.action === 'created' ? SUCCESS('+') : BRAND_SECONDARY('~');
      console.log(row('  ' + icon + '  ' + INFO(file.path || file)));
    }
  }

  // ─── Error ───
  if (task.outcome.error) {
    console.log(hRule());
    console.log(row(ERROR('▸ ERROR')));
    console.log(row(ERROR(task.outcome.error.slice(0, BOX_WIDTH - 4))));
  }

  // ─── Denied ───
  if (task.isDenied && task.denyReason) {
    console.log(hRule());
    console.log(row(ERROR('▸ DENIED BY: ') + MUTED(task.deniedBy || 'Unknown')));
    console.log(row(MUTED(task.denyReason.slice(0, BOX_WIDTH - 4))));
  }

  // ─── Usage ───
  if (task.outcome.turnsUsed) {
    console.log(hRule());
    console.log(row(
      MUTED(`Turns: ${task.outcome.turnsUsed}`) +
      MUTED(`  │  Tokens: ${task.outcome.tokensConsumed || 0}`) +
      MUTED(`  │  ${task.outcome.provider || 'unknown'}`)
    ));
  }

  console.log(emptyRow());
  console.log(botRule());
  console.log('');
}

// ─── DECISION STREAM ──────────────────────────────────────────────────────────

async function runDecisionStream(conversationId: string): Promise<void> {
  console.log('');
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('◉  DECISION STREAM')));
  console.log(row(MUTED('Live feed of all autonomous decisions. Ctrl+C to exit.')));
  console.log(botRule());
  console.log('');

  let lastCount = 0;
  let running   = true;

  process.on('SIGINT', () => {
    running = false;
    console.log('');
    console.log(WARNING('  Stream ended.'));
    process.exit(0);
  });

  while (running) {
    try {
      const response = await callCloudFunction('getCLIAutonomousTasks', { conversationId });
      const tasks: any[] = response?.tasks || [];

      if (tasks.length > lastCount) {
        const newTasks = tasks.slice(0, tasks.length - lastCount);
        for (const task of newTasks.reverse()) {
          const sColor   = statusColor(task.outcome.status);
          const catColor = categoryColor(task.request.category);
          const ts       = MUTED(formatTimestamp(task.createdAt).padEnd(18));
          const cat      = catColor(`[${task.request.category.toUpperCase().padEnd(14)}]`);
          const label    = sColor(`● ${statusLabel(task.outcome.status).padEnd(14)}`);
          const desc     = WHITE(task.request.description.slice(0, 30) +
            (task.request.description.length > 30 ? '...' : ''));
          console.log(`  ${ts}  ${cat}  ${label}  ${desc}`);
        }
        lastCount = tasks.length;
      }
    } catch (e: any) {
      console.log(ERROR(`  ❌ Poll error: ${e.message}`));
    }

    await new Promise(r => setTimeout(r, 3000));
  }
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

async function runSettings(conversationId: string): Promise<void> {
  let response: any;
  try {
    response = await callCloudFunction('getCLIAutonomousTasks', { conversationId });
  } catch (e: any) {
    console.log(ERROR(`  ❌ Failed to fetch settings: ${e.message}`));
    return;
  }

  const settings = response?.settings || {};

  console.log('');
  console.log(topRule());
  console.log(row(BRAND_PRIMARY('◈  AUTONOMY SETTINGS')));
  console.log(row(MUTED(`Current threshold: ${settings.autonomousConfidenceThreshold ?? 75}%`)));
  console.log(row(MUTED('Tasks below this confidence level require your approval.')));
  console.log(botRule());
  console.log('');

  const { threshold } = await inquirer.prompt([
    {
      type: 'number',
      name: 'threshold',
      message: WARNING('  Confidence threshold (0-100):'),
      default: settings.autonomousConfidenceThreshold ?? 75,
      validate: (val: number) => (val >= 0 && val <= 100) ? true : 'Must be 0-100',
    },
  ]);

  const categories = ['security', 'frontend', 'backend', 'cloud_functions', 'documentation', 'testing', 'review', 'fullstack'];
  const overrides: Record<string, string> = { ...(settings.autonomousCategoryOverrides || {}) };

  console.log('');
  console.log(MUTED('  ─── Category Overrides ') + MUTED('─'.repeat(35)));
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
          { name: MUTED('  Use Threshold'),              value: 'threshold'        },
          { name: SUCCESS('  Always Auto-Execute'),      value: 'autonomous'       },
          { name: ERROR('  Always Require Approval'),    value: 'approval_required'},
        ],
      },
    ]);
    if (override === 'threshold') {
      delete overrides[cat];
    } else {
      overrides[cat] = override;
    }
  }

  try {
    await callCloudFunction('updateCLIAutonomySettings', {
      conversationId,
      autonomousConfidenceThreshold: threshold,
      autonomousCategoryOverrides: overrides,
    });
    console.log('');
    console.log(SUCCESS('  ✅ Settings saved successfully.'));
    console.log(MUTED(`  ▸ Threshold: ${threshold}%`));
    const overrideCount = Object.keys(overrides).length;
    if (overrideCount > 0) {
      console.log(MUTED(`  ▸ Category overrides: ${overrideCount} active`));
    }
  } catch {
    console.log('');
    console.log(WARNING('  ⚠️  `updateCLIAutonomySettings` not deployed yet.'));
    console.log(MUTED('  Update via web app for now, or deploy the CF first.'));
  }
  console.log('');
}

// ─── TASK BOARD ───────────────────────────────────────────────────────────────

async function runTaskBoard(conversationId: string): Promise<void> {
  let continueLoop = true;

  while (continueLoop) {
    let response: any;
    try {
      response = await callCloudFunction('getCLIAutonomousTasks', { conversationId });
    } catch (e: any) {
      console.log(ERROR(`  ❌ Failed to fetch tasks: ${e.message}`));
      return;
    }

    const tasks: any[]  = response?.tasks || [];
    const stats         = response?.stats || {};

    renderStats(stats, conversationId);

    if (tasks.length === 0) {
      console.log(MUTED('  No autonomous tasks found for this conversation.'));
      console.log(MUTED('  Tasks appear here when UserBob dispatches work to Mini Bob.'));
      console.log('');
      return;
    }

    // ─── Deduplicate ───
    const seen = new Map<string, any>();
    for (const task of tasks) {
      const key = task.request.description.slice(0, 80);
      if (!seen.has(key) || (task.createdAt || 0) > (seen.get(key).createdAt || 0)) {
        seen.set(key, task);
      }
    }
    const dedupedTasks = Array.from(seen.values());

    // ─── Build choices ───
    const STATUS_WIDTH   = 16;
    const CATEGORY_WIDTH = 16;
    const DESC_WIDTH     = 42;

    const taskChoices = dedupedTasks.map((task: any) => {
      const sColor   = statusColor(task.outcome.status);
      const catColor = categoryColor(task.request.category);

      const statusStr   = sColor(`● ${statusLabel(task.outcome.status)}`.padEnd(STATUS_WIDTH));
      const categoryStr = catColor(`[${task.request.category.toUpperCase()}]`.padEnd(CATEGORY_WIDTH));
      const desc        = task.request.description.slice(0, DESC_WIDTH) +
        (task.request.description.length > DESC_WIDTH ? '...' : '');

      return {
        name:  `  ${statusStr}  ${categoryStr}  ${WHITE(desc)}`,
        value: task.id,
        short: task.request.description.slice(0, 40),
      };
    });

    // ─── Separator + exit ───
    taskChoices.push({
      name:     MUTED('  ' + '─'.repeat(BOX_WIDTH - 2)),
      value:    '__separator__',
      short:    '',
      disabled: true,
    } as any);

    taskChoices.push({
      name:  MUTED('  ↩  Exit Command Center'),
      value: '__exit__',
      short: 'Exit',
    });

    const { selectedTaskId } = await inquirer.prompt([
      {
        type:     'select',
        name:     'selectedTaskId',
        message:  BRAND_PRIMARY('  Select a task to inspect:'),
        choices:  taskChoices,
        pageSize: 14,
      },
    ]);

    if (selectedTaskId === '__exit__' || selectedTaskId === '__separator__') {
      continueLoop = false;
      break;
    }

    const selectedTask = dedupedTasks.find((t: any) => t.id === selectedTaskId);
    if (!selectedTask) continue;

    renderTaskDetail(selectedTask);

    // ─── Action prompt ───
    const actions: any[] = [];

    if (selectedTask.outcome.status === 'awaiting_approval') {
      actions.push({ name: SUCCESS('  ✅  Approve — execute this task now'), value: 'approve', short: 'Approve' });
      actions.push({ name: ERROR('  ❌  Deny — reject this task'),           value: 'deny',    short: 'Deny'    });
    }

    actions.push({ name: WARNING('  ↩  Back to task list'),                 value: 'back',    short: 'Back'    });
    actions.push({ name: MUTED('  ✕  Exit Command Center'),                 value: 'exit',    short: 'Exit'    });

    const { action } = await inquirer.prompt([
      {
        type:    'select',
        name:    'action',
        message: BRAND_PRIMARY('  What would you like to do?'),
        choices: actions,
      },
    ]);

    // ─── APPROVE ───
    if (action === 'approve') {
      const { confirmed } = await inquirer.prompt([
        {
          type:    'confirm',
          name:    'confirmed',
          message: WARNING('  Approve task and execute autonomously?'),
          default: true,
        },
      ]);

      if (confirmed) {
        console.log('');
        console.log(topRule());
        console.log(row(BRAND_PRIMARY('◉  EXECUTION STREAM')));
        console.log(row(MUTED('Mini Bob is executing. Streaming live logs...')));
        console.log(botRule());
        console.log('');

        callCloudFunction('approveAutonomousTask', {
          conversationId,
          taskId: selectedTask.id,
          action: 'approve',
        }).catch((e: any) => {
          console.log(ERROR(`\n  ❌ Execution error: ${e.message}`));
        });

        let running      = true;
        let seenLogIds   = new Set<string>();
        let pollErrors   = 0;
        const maxErrors  = 5;

        const sigintHandler = () => {
          running = false;
          console.log('');
          console.log(WARNING('  Stream ended. Task continues in background.'));
          process.exit(0);
        };
        process.on('SIGINT', sigintHandler);

        // ─── Stage prefix map ───
        const stagePrefix = (stage: string): string => {
          switch (stage) {
            case 'INIT':              return INFO(`  [INIT    ] `);
            case 'TOOL_CALL':         return WARNING(`  [TOOL    ] `);
            case 'FALLBACK':          return WARNING(`  [FALLBACK] `);
            case 'COMPLETE':          return SUCCESS(`  [DONE    ] `);
            case 'ERROR':             return ERROR(`  [ERROR   ] `);
            case 'APPROVED':          return SUCCESS(`  [APPROVED] `);
            case 'DENIED':            return ERROR(`  [DENIED  ] `);
            case 'AWAITING_APPROVAL': return WARNING(`  [PENDING ] `);
            default:                  return MUTED(`  [LOG     ] `);
          }
        };

        while (running) {
          await new Promise(r => setTimeout(r, 2000));

          try {
            const taskResponse = await callCloudFunction('getCLIAutonomousTasks', {
              conversationId,
              statusFilter: null,
            });
            const updatedTask = taskResponse?.tasks?.find((t: any) => t.id === selectedTask.id);

            const logResponse = await callCloudFunction('getCLITaskExecutionLog', {
              conversationId,
              taskId: selectedTask.id,
            });
            const logEntries: any[] = logResponse?.entries || [];

            for (const entry of logEntries) {
              if (seenLogIds.has(entry.id)) continue;
              seenLogIds.add(entry.id);
              console.log(stagePrefix(entry.stage || 'LOG') + WHITE(entry.text));
            }

            if (updatedTask) {
              const status = updatedTask.outcome.status;

              if (status === 'completed') {
                console.log('');
                console.log(topRule());
                console.log(row(SUCCESS('◈  TASK COMPLETE')));
                console.log(hRule());

                if (updatedTask.outcome.filesModified?.length > 0) {
                  console.log(row(BRAND_SECONDARY('▸ Files Touched')));
                  for (const file of updatedTask.outcome.filesModified) {
                    const icon = file.action === 'created' ? SUCCESS('+') : BRAND_SECONDARY('~');
                    console.log(row(`  ${icon}  ${INFO(file.path || file)}`));
                  }
                }

                if (updatedTask.outcome.resultSummary) {
                  console.log(hRule());
                  console.log(row(BRAND_SECONDARY('▸ Summary')));
                  const summary = stripMarkdown(updatedTask.outcome.resultSummary);
                  const lines   = summary.split('\n').slice(0, 4);
                  for (const line of lines) {
                    console.log(row(MUTED(line)));
                  }
                }

                if (updatedTask.outcome.turnsUsed) {
                  console.log(hRule());
                  console.log(row(
                    MUTED(`Turns: ${updatedTask.outcome.turnsUsed}`) +
                    MUTED(`  │  Tokens: ${updatedTask.outcome.tokensConsumed || 0}`) +
                    MUTED(`  │  ${updatedTask.outcome.provider || 'unknown'}`)
                  ));
                }

                console.log(emptyRow());
                console.log(botRule());
                console.log('');
                running = false;

              } else if (status === 'failed') {
                console.log('');
                console.log(ERROR(`  ❌ Task failed: ${updatedTask.outcome.error || 'Unknown error'}`));
                running = false;

              } else if (status === 'denied') {
                console.log('');
                console.log(ERROR('  ❌ Task was denied.'));
                running = false;
              }
            }

            pollErrors = 0;

          } catch (e: any) {
            pollErrors++;
            if (pollErrors >= maxErrors) {
              console.log(ERROR(`  ❌ Lost connection after ${maxErrors} errors. Task continues in background.`));
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
          type:    'input',
          name:    'reason',
          message: WARNING('  Denial reason (optional):'),
          default: '',
        },
      ]);

      try {
        console.log(MUTED('  Denying task...'));
        await callCloudFunction('approveAutonomousTask', {
          conversationId,
          taskId: selectedTask.id,
          action: 'deny',
          reason: reason.trim() || null,
        });
        console.log('');
        console.log(ERROR('  ❌ Task denied.'));
        console.log('');
      } catch (e: any) {
        console.log(ERROR(`  ❌ Failed to deny: ${e.message}`));
      }

    } else if (action === 'exit') {
      continueLoop = false;
      break;
    }
  }
}

// ─── REGISTER COMMAND ─────────────────────────────────────────────────────────

export function registerCommandCenterCommand(program: Command): void {
  program
    .command('command-center')
    .alias('cc')
    .description('Autonomous Command Center — inspect, approve, and manage UserBob dispatch tasks')
    .option('--stream',   'Live decision stream feed')
    .option('--settings', 'Configure autonomy threshold and category overrides')
    .action(async (options: { stream?: boolean; settings?: boolean }) => {

      if (!isAuthenticated()) {
        console.log('');
        console.log(ERROR('  ❌ Authentication required.'));
        console.log(MUTED('  Run `bob login` first.'));
        console.log('');
        process.exit(1);
      }

      const config = getConfig();
      const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;

      if (!conversationId) {
        console.log('');
        console.log(ERROR('  ❌ No active conversation.'));
        console.log(MUTED('  Run `bob conversations join` first.'));
        console.log('');
        process.exit(1);
      }

      console.log('');
      console.log(topRule());
      console.log(row(BRAND_PRIMARY('◉  AUTONOMOUS COMMAND CENTER')));
      console.log(row(MUTED(`Conversation: ${conversationId.slice(0, 28)}...`)));
      console.log(botRule());

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