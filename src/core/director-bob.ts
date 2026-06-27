// File: src/core/director-bob.ts

import { LocalChatMessage } from '../ai/providers/local.js';
import { callLocalModel } from '../ai/providers/local.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  AgentRegistryEntry,
  loadAgentSummary,
} from './agent-store.js';
import {
  AgentTask,
  AgentMission,
  OperationType,
  createMission,
  loadMission,
  saveMission,
  updateTaskResult,
  addTaskNote,
  getReadyTasks,
  getMissionSummary,
  isMissionComplete,
  isMissionBlocked,
  inferOperationType,
} from './agent-queue.js';
import {
  inferSatisfactionTarget,
  inferStagnationLimit,
} from './agent-satisfaction.js';
import {
  executeTaskAttempt,
  ExecutionEvent,
  TaskExecutionResult,
} from './agent-executor.js';
import { loadSummaries } from './project-map.js';
import {
  loadPendingCommits,
  clearPendingCommit,
  clearPendingCommitsForTask,
} from './agent-tools.js';
import {
  reviewCommit,
  reviewTaskCompletion,
  restoreDeniedFiles,
  saveCommitReview,
} from './agent-reviewer.js';

// ─── CONSTANTS ────────────────────────────────────────────────────

const DEFAULT_DIRECTOR_LIMIT = 2;
const MAX_PARALLEL_TASKS = 4;
const TASK_LOOP_INTERVAL_MS = 500;
const MAX_COMMIT_DENIALS = 3;

// ─── INTERFACES ───────────────────────────────────────────────────

export interface DirectorResult {
  mission: AgentMission;
  completed: boolean;
  aborted: boolean;
  surfacedToUser: boolean;
  surfaceReason?: string;
}

export interface DirectorState {
  paused: boolean;
  aborted: boolean;
  userInjections: string[];
  satisfactionOverrides: Record<string, number>;
  pendingCommitApproval: null;
  commitDenialCounts: Map<string, number>;
}

// ─── STRUCTURED TASK MAP RESPONSE ─────────────────────────────────

interface DirectorTaskMapResponse {
  thinking: string;
  tasks: Array<{
    assignedTo: string;
    instruction: string;
    operationType: OperationType;
    dependsOn: string[];
    outputFile?: string | null;
  }>;
}

// ─── TASK MAP JSON PARSER ─────────────────────────────────────────

function parseTaskMapResponse(rawResponse: string): DirectorTaskMapResponse | null {
  let jsonStr = rawResponse.trim();

  const fencedMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fencedMatch) {
    jsonStr = fencedMatch[1].trim();
  }

  const firstBrace = jsonStr.indexOf('{');
  if (firstBrace === -1) return null;

  let depth = 0;
  let lastBrace = -1;
  for (let i = firstBrace; i < jsonStr.length; i++) {
    if (jsonStr[i] === '{') depth++;
    if (jsonStr[i] === '}') {
      depth--;
      if (depth === 0) { lastBrace = i; break; }
    }
  }

  if (lastBrace === -1) return null;

  const candidate = jsonStr.slice(firstBrace, lastBrace + 1);

  try {
    const parsed = JSON.parse(candidate);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null;

    return {
      thinking: typeof parsed.thinking === 'string' ? parsed.thinking : '',
      tasks: parsed.tasks,
    };
  } catch {
    return null;
  }
}

// ─── PROJECT CONTEXT ──────────────────────────────────────────────

function buildDirectorProjectContext(cwd: string): {
  existingFiles: string;
  hasTests: boolean;
  fileAssessment: string;
  fileExistsMap: Record<string, boolean>;
} {
  const summaries = loadSummaries(cwd);
  const existingFiles = summaries
    ? Object.keys(summaries).slice(0, 20).join('\n')
    : 'No indexed files found.';

  const hasVitest =
    fs.existsSync(path.join(cwd, 'vitest.config.ts')) ||
    fs.existsSync(path.join(cwd, 'vitest.config.js'));
  const hasJest =
    fs.existsSync(path.join(cwd, 'jest.config.ts')) ||
    fs.existsSync(path.join(cwd, 'jest.config.js'));
  const hasTests = hasVitest || hasJest;

  const assessmentLines: string[] = [];
  const fileExistsMap: Record<string, boolean> = {};

  if (summaries) {
    for (const filePath of Object.keys(summaries).slice(0, 15)) {
      const absolutePath = path.join(cwd, filePath);
      if (fs.existsSync(absolutePath)) {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const lines = content.split('\n').length;
        const isEmpty = content.trim().length < 20;
        const isPlaceholder =
          content.includes('// file content here') ||
          content.includes('// TODO implement');

        if (isEmpty || isPlaceholder) {
          assessmentLines.push(`❌ EMPTY: ${filePath}`);
          fileExistsMap[filePath] = false;
        } else {
          assessmentLines.push(`✅ EXISTS (${lines} lines): ${filePath}`);
          fileExistsMap[filePath] = true;
        }
      } else {
        assessmentLines.push(`🔲 MISSING: ${filePath}`);
        fileExistsMap[filePath] = false;
      }
    }
  }

  return { existingFiles, hasTests, fileAssessment: assessmentLines.join('\n'), fileExistsMap };
}

// ─── TASK MAP GENERATION ──────────────────────────────────────────

export async function generateTaskMap(
  missionDescription: string,
  agents: AgentRegistryEntry[],
  cwd: string,
  localEndpoint: string
): Promise<Omit<AgentTask, 'id' | 'missionId' | 'status' | 'attemptCount' |
  'stagnationCount' | 'directorSurfaceCount' | 'lastSatisfactionScore' |
  'consecutiveLowCount' | 'result' | 'filesCreated' | 'filesModified' |
  'createdAt' | 'startedAt' | 'completedAt' | 'notes'>[]> {

  const agentList = agents.map(a => `${a.name}: ${a.task}`).join('\n');
  const { existingFiles, hasTests, fileAssessment, fileExistsMap } = buildDirectorProjectContext(cwd);

  const systemPrompt = `You are DirectorBob — a senior engineering lead.
You MUST respond with ONLY valid JSON matching the exact schema provided.
No markdown. No explanation before or after the JSON object.`;

  const userPrompt = `MISSION: ${missionDescription}

AGENTS:
${agentList}

FILE ASSESSMENT (current project state):
${fileAssessment || 'No assessment available — project may not be indexed.'}

ALL EXISTING FILES:
${existingFiles}

RULES:
1. Generate 3 to 6 specific, actionable tasks.
2. Each task must reference EXACT file paths.
3. For files marked ✅ EXISTS — write instructions as "ADD [specific thing] to [file]". Never "refactor" or "rewrite". Never generate CREATE tasks for files that already exist.
4. For files marked ❌ EMPTY or 🔲 MISSING — agents should create or fill them.
5. ${hasTests ? 'Test tasks allowed.' : 'NO test tasks — no test framework configured.'}
6. Agent names must NOT include @ symbol.
7. dependsOn uses t1, t2, t3 format.
8. operationType must be one of: CREATE, PATCH, REFACTOR, REPLACE
   - CREATE: file does not exist yet — NEVER use for files marked ✅ EXISTS
   - PATCH: add or change a specific function or block in existing file
   - REFACTOR: structural change that preserves all exports
   - REPLACE: full rewrite — only for empty or placeholder files

Respond with ONLY this JSON structure:
{
  "thinking": "<your reasoning about task decomposition — 2-3 sentences>",
  "tasks": [
    {
      "assignedTo": "agentName",
      "instruction": "specific instruction referencing exact file path",
      "operationType": "CREATE|PATCH|REFACTOR|REPLACE",
      "dependsOn": []
    }
  ]
}`;

  const messages: LocalChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let parsed: DirectorTaskMapResponse | null = null;

  // ─── Attempt 1 ────────────────────────────────────────────────
  try {
    const rawResponse = await callLocalModel(localEndpoint, messages);
    const responseText =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    parsed = parseTaskMapResponse(responseText);
    if (parsed) {
      console.log(`[DIRECTORBOB] Thinking: ${parsed.thinking.slice(0, 100)}...`);
    }
  } catch { }

  // ─── Attempt 2 — retry once ───────────────────────────────────
  if (!parsed) {
    console.error(`[DIRECTORBOB] Task map attempt 1 failed — retrying...`);
    try {
      const retryMessages: LocalChatMessage[] = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: userPrompt + '\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY the JSON object. No text before or after it.',
        },
      ];
      const retryResponse = await callLocalModel(localEndpoint, retryMessages);
      const retryText =
        typeof retryResponse === 'object' && retryResponse.text
          ? retryResponse.text
          : (retryResponse as unknown as string);
      parsed = parseTaskMapResponse(retryText);
    } catch { }
  }

  // ─── Fallback ─────────────────────────────────────────────────
  if (!parsed) {
    console.error(`[DIRECTORBOB] Task map failed after retry — using fallback.`);
    return agents.map((agent, idx) => ({
      assignedTo: agent.name.replace(/^@+/, ''),
      instruction: `${agent.task}. Context: ${missionDescription}. Make surgical changes only.`,
      operationType: 'CREATE' as OperationType,
      dependsOn: idx > 0 ? [`__TASK_${idx - 1}__`] : [],
      outputFile: null,
      satisfactionTarget: 75,
      stagnationLimit: 3,
      directorLimit: DEFAULT_DIRECTOR_LIMIT,
    }));
  }

  return parsed.tasks.map((t) => {
    const deps = (t.dependsOn || [])
      .map((dep: string) => {
        const match = dep.match(/t(\d+)/i);
        if (match) {
          const depIdx = parseInt(match[1]) - 1;
          return depIdx >= 0 && depIdx < parsed!.tasks.length
            ? `__TASK_${depIdx}__`
            : null;
        }
        return null;
      })
      .filter(Boolean);

    const instructionLower = (t.instruction || '').toLowerCase();
    const mentionedFile = Object.keys(fileExistsMap).find(f =>
      instructionLower.includes(f.toLowerCase())
    );
    const fileExists = mentionedFile ? fileExistsMap[mentionedFile] : false;

    const operationType: OperationType =
      (['CREATE', 'PATCH', 'REFACTOR', 'REPLACE'].includes(t.operationType))
        ? t.operationType
        : inferOperationType(t.instruction || '', fileExists);

    return {
      assignedTo: (t.assignedTo || '').replace(/^@+/, ''),
      instruction: t.instruction,
      operationType,
      dependsOn: deps,
      outputFile: t.outputFile || null,
      satisfactionTarget: inferSatisfactionTarget(t.instruction || ''),
      stagnationLimit: inferStagnationLimit(t.instruction || ''),
      directorLimit: DEFAULT_DIRECTOR_LIMIT,
    };
  });
}

// ─── DIRECTOR INTERVENTION ────────────────────────────────────────

export async function directorIntervene(
  task: AgentTask,
  stuckAgent: AgentRegistryEntry,
  allAgents: AgentRegistryEntry[],
  mission: AgentMission,
  cwd: string,
  localEndpoint: string
): Promise<string> {

  const agentSummaries = allAgents
    .map(a => {
      const summary = loadAgentSummary(a.name, cwd);
      return `@${a.name} (${a.task}):\n${summary || 'No summary yet.'}`;
    })
    .join('\n\n');

  const { existingFiles } = buildDirectorProjectContext(cwd);

  const prompt = `You are DirectorBob. @${stuckAgent.name} is stagnating.

STUCK TASK: ${task.instruction}
OPERATION TYPE: ${task.operationType}
AGENT: ${stuckAgent.name} — ${stuckAgent.task}
LAST SCORE: ${task.lastSatisfactionScore}% / TARGET: ${task.satisfactionTarget}%
ATTEMPTS: ${task.attemptCount}

RECENT NOTES:
${task.notes.slice(-3).join('\n')}

TEAM: ${agentSummaries}
EXISTING FILES: ${existingFiles}

Give ONE specific directive. Reference actual file paths. 2 sentences max. Plain text only.
${task.operationType === 'PATCH' ? 'Remind the agent: output the COMPLETE file with ONLY the targeted change in the JSON files array — do NOT write a partial file.' : ''}`;

  try {
    const messages: LocalChatMessage[] = [
      { role: 'system', content: 'You are DirectorBob. 2-sentence directive. Reference real files. Plain text only.' },
      { role: 'user', content: prompt },
    ];
    const rawResponse = await callLocalModel(localEndpoint, messages);
    const note = typeof rawResponse === 'object' && rawResponse.text
      ? rawResponse.text
      : (rawResponse as unknown as string);
    return note.trim().split('\n')[0].slice(0, 200);
  } catch {
    return `Output the complete file with only the targeted change in your JSON response files array. Make surgical changes only.`;
  }
}

// ─── HANDLE PENDING COMMITS ───────────────────────────────────────

async function handlePendingCommits(
  cwd: string,
  localEndpoint: string,
  taskMap: Map<string, AgentTask>,
  mission: AgentMission,
  state: DirectorState,
  onEvent?: (event: ExecutionEvent) => void
): Promise<void> {
  const pending = loadPendingCommits(cwd);
  if (pending.length === 0) return;

  const emit = (type: any, message: string, data?: any) => {
    if (onEvent) onEvent({ type, agentName: 'directorBob', taskId: 'director', message, data });
  };

  for (const commit of pending) {
    emit('thinking', `DirectorBob reviewing commit from @${commit.agentName}: "${commit.message}"`);

    const task = taskMap.get(commit.taskId);
    const taskInstruction = task?.instruction || commit.message;

    const review = await reviewCommit(
      taskInstruction,
      commit.message,
      commit.agentName,
      commit.filesChanged,
      cwd,
      localEndpoint,
      task?.operationType
    );

    saveCommitReview(review, commit.missionId, commit.taskId, cwd);

    if (review.verdict === 'APPROVE') {
      try {
        const simpleGit = (await import('simple-git')).default;
        const git = simpleGit(cwd);
        await git.add('.');
        const result = await git.commit(commit.message);

        // ─── Clear ALL pending commits for this task on approve ─
        clearPendingCommitsForTask(commit.taskId, cwd);

        emit('done', `DirectorBob approved ✅ committed: ${result.commit?.slice(0, 7)} — ${commit.message}`);

        state.commitDenialCounts.delete(commit.taskId);

        if (review.filesReviewed.some(f => f.verdict === 'WARN')) {
          emit(
            'thinking',
            `⚠️  Warnings on: ${review.filesReviewed
              .filter(f => f.verdict === 'WARN')
              .map(f => f.filePath)
              .join(', ')}`
          );
        }
      } catch (e: any) {
        clearPendingCommitsForTask(commit.taskId, cwd);
        emit('error', `Commit failed after approval: ${e.message}`);
      }

    } else {
      const { restored, failed } = restoreDeniedFiles(review, cwd);

      clearPendingCommit(commit.id, cwd);

      const denials = (state.commitDenialCounts.get(commit.taskId) || 0) + 1;
      state.commitDenialCounts.set(commit.taskId, denials);

      emit('error', `DirectorBob DENIED commit from @${commit.agentName}: ${review.reason}`);

      if (restored.length > 0) {
        emit('thinking', `Restored ${restored.length} file(s) from backup: ${restored.join(', ')}`);
      }
      if (failed.length > 0) {
        emit('error', `Could not restore ${failed.length} file(s): ${failed.join(', ')}`);
      }

      if (denials >= MAX_COMMIT_DENIALS) {
        if (task) {
          updateTaskStatus(mission, task.id, 'stagnated', cwd);
          addTaskNote(
            mission,
            task.id,
            `COMMIT DENIED ${denials} times. User intervention required. Last reason: ${review.reason}`,
            cwd
          );
        }
        state.paused = true;
        emit(
          'error',
          `@${commit.agentName} reached maximum commit denials (${MAX_COMMIT_DENIALS}). Mission paused — user intervention needed.`
        );
        emit(
          'thinking',
          `Type /resume after reviewing the task, or /skip ${commit.taskId} to skip it.`
        );

      } else if (review.revisionNote && task) {
        const revisionMessage = `COMMIT DENIED (${denials}/${MAX_COMMIT_DENIALS}): ${review.revisionNote}`;
        addTaskNote(mission, task.id, revisionMessage, cwd);
        emit('response', `DirectorBob → @${commit.agentName}: ${review.revisionNote}`);

        task.status = 'pending';
        task.lastSatisfactionScore = null;
        saveMission(mission, cwd);

        emit(
          'thinking',
          `Task reopened for @${commit.agentName} (denial ${denials}/${MAX_COMMIT_DENIALS}). Agent will retry with feedback.`
        );
      } else if (review.revisionNote) {
        emit('response', `DirectorBob → @${commit.agentName}: ${review.revisionNote}`);
      }
    }
  }
}

// ─── AUTONOMOUS LOOP ──────────────────────────────────────────────

export async function runAutonomousLoop(
  mission: AgentMission,
  agents: AgentRegistryEntry[],
  cwd: string,
  localEndpoint: string,
  state: DirectorState,
  onEvent?: (event: ExecutionEvent) => void
): Promise<DirectorResult> {

  const emit = (type: any, message: string, data?: any) => {
    if (onEvent) onEvent({ type, agentName: 'directorBob', taskId: 'director', message, data });
  };

  emit('thinking', 'DirectorBob online. Autonomous loop starting...');

  const activeExecutions = new Map<string, Promise<TaskExecutionResult>>();

  const taskMap = new Map<string, AgentTask>();
  for (const task of mission.tasks) {
    taskMap.set(task.id, task);
  }

  while (true) {

    // ─── ABORT — check first, before anything else ────────────
    if (state.aborted) {
      mission.status = 'aborted';
      saveMission(mission, cwd);
      return { mission, completed: false, aborted: true, surfacedToUser: false };
    }

    if (state.paused) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    // ─── FIXED: only process commits if NOT aborted ───────────
    if (activeExecutions.size === 0 && !state.aborted) {
      await handlePendingCommits(cwd, localEndpoint, taskMap, mission, state, onEvent);
    }

    if (isMissionComplete(mission)) {
      if (activeExecutions.size === 0 && !state.aborted) {
        await handlePendingCommits(cwd, localEndpoint, taskMap, mission, state, onEvent);
      }
      mission.status = 'completed';
      mission.completedAt = new Date().toISOString();
      saveMission(mission, cwd);
      emit('done', 'All tasks complete. Mission accomplished.');
      return { mission, completed: true, aborted: false, surfacedToUser: false };
    }

    if (isMissionBlocked(mission) && activeExecutions.size === 0) {
      mission.status = 'failed';
      saveMission(mission, cwd);
      emit('error', 'Mission blocked — no tasks can proceed.');
      return {
        mission,
        completed: false,
        aborted: false,
        surfacedToUser: true,
        surfaceReason: 'Mission blocked — dependency cycle or all tasks stagnated.',
      };
    }

    const readyTasks = getReadyTasks(mission).filter(t => !activeExecutions.has(t.id));
    const availableSlots = MAX_PARALLEL_TASKS - activeExecutions.size;
    const tasksToFire = readyTasks.slice(0, availableSlots);

    for (const task of tasksToFire) {
      const agent = agents.find(a => a.name === task.assignedTo);
      if (!agent) {
        emit('error', `No agent found for: ${task.assignedTo}`);
        updateTaskStatus(mission, task.id, 'failed', cwd);
        continue;
      }

      updateTaskStatus(mission, task.id, 'running', cwd);
      emit('thinking', `Dispatching @${agent.name} → [${task.operationType}] ${task.instruction.slice(0, 50)}...`);

      if (state.satisfactionOverrides[agent.name] !== undefined) {
        task.satisfactionTarget = state.satisfactionOverrides[agent.name];
        addTaskNote(mission, task.id, `Target overridden to ${task.satisfactionTarget}% by user.`, cwd);
      }

      if (state.userInjections.length > 0) {
        const injection = state.userInjections.shift();
        if (injection) addTaskNote(mission, task.id, `Injection: ${injection}`, cwd);
      }

      const executionPromise = executeTaskAttempt(
        task, agent, agents, mission, cwd, localEndpoint, onEvent
      ).then(async (result) => {
        activeExecutions.delete(task.id);

        // ─── Don't process results if aborted ──────────────
        if (state.aborted) return result;

        if (result.isDone) {
          emit('thinking', `DirectorBob reviewing @${agent.name}'s completed work...`);

          const filesWritten = [
            ...result.filesCreated.map(f => ({ filePath: f, isNew: true })),
            ...result.filesModified.map(f => ({ filePath: f, isNew: false })),
          ];

          const completionReview = await reviewTaskCompletion(
            task.instruction,
            agent.name,
            result.response,
            filesWritten,
            task.attemptCount,
            cwd,
            localEndpoint,
            task.operationType
          );

          if (completionReview.verdict === 'APPROVED') {
            updateTaskResult(
              mission,
              task.id,
              result.response,
              result.filesCreated,
              result.filesModified,
              cwd
            );
            emit('done', `DirectorBob ✅ approved @${agent.name}'s work: ${task.instruction.slice(0, 50)}`);

          } else if (completionReview.verdict === 'REVISION_NEEDED') {
            const revisionMsg = `TASK REVIEW: ${completionReview.revisionNote || completionReview.reason}`;
            addTaskNote(mission, task.id, revisionMsg, cwd);
            emit('response', `DirectorBob → @${agent.name}: ${completionReview.revisionNote || completionReview.reason}`);
            updateTaskStatus(mission, task.id, 'pending', cwd);
            emit('thinking', `Task reopened for @${agent.name} — revision needed before marking complete.`);

          } else {
            updateTaskStatus(mission, task.id, 'stagnated', cwd);
            addTaskNote(mission, task.id, `ESCALATED: ${completionReview.reason}`, cwd);
            emit('error', `DirectorBob escalating @${agent.name}'s task — user intervention needed: ${completionReview.reason}`);
            state.paused = true;
          }

        } else if (result.needsUser) {
          updateTaskStatus(mission, task.id, 'stagnated', cwd);
          emit('error', `@${agent.name} needs user help: ${task.instruction.slice(0, 50)}`);
          state.paused = true;

        } else if (result.isStagnating && result.needsDirector) {
          emit('thinking', `DirectorBob intervening for @${agent.name}...`);
          const note = await directorIntervene(task, agent, agents, mission, cwd, localEndpoint);
          emit('response', `DirectorBob → @${agent.name}: ${note}`);
          addTaskNote(mission, task.id, `Director: ${note}`, cwd);
          updateTaskStatus(mission, task.id, 'pending', cwd);

        } else {
          updateTaskStatus(mission, task.id, 'pending', cwd);
        }

        return result;
      });

      activeExecutions.set(task.id, executionPromise);
    }

    if (activeExecutions.size > 0) {
      await Promise.race(activeExecutions.values());
    } else {
      await new Promise(r => setTimeout(r, TASK_LOOP_INTERVAL_MS));
    }
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────

function updateTaskStatus(
  mission: AgentMission,
  taskId: string,
  status: any,
  workingDir?: string
): void {
  const task = mission.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.status = status;
  if (status === 'running' && !task.startedAt) {
    task.startedAt = new Date().toISOString();
  }
  if (
    (status === 'completed' || status === 'failed' || status === 'stagnated') &&
    !task.completedAt
  ) {
    task.completedAt = new Date().toISOString();
  }
  saveMission(mission, workingDir);
}