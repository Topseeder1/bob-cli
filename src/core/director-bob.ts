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
  createMission,
  loadMission,
  saveMission,
  updateTaskResult,
  addTaskNote,
  getReadyTasks,
  getMissionSummary,
  isMissionComplete,
  isMissionBlocked,
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
} from './agent-tools.js';
import {
  reviewCommit,
  restoreDeniedFiles,
  saveCommitReview,
} from './agent-reviewer.js';

// ─── CONSTANTS ────────────────────────────────────────────────────

const DEFAULT_DIRECTOR_LIMIT = 2;
const MAX_PARALLEL_TASKS = 4;
const TASK_LOOP_INTERVAL_MS = 500;
const MAX_COMMIT_DENIALS = 3; // After this many denials, surface to user

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

// ─── PROJECT CONTEXT ──────────────────────────────────────────────

function buildDirectorProjectContext(cwd: string): {
  existingFiles: string;
  hasTests: boolean;
  fileAssessment: string;
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
        } else {
          assessmentLines.push(`✅ EXISTS (${lines} lines): ${filePath}`);
        }
      } else {
        assessmentLines.push(`🔲 MISSING: ${filePath}`);
      }
    }
  }

  return { existingFiles, hasTests, fileAssessment: assessmentLines.join('\n') };
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
  const { existingFiles, hasTests, fileAssessment } = buildDirectorProjectContext(cwd);

  const prompt = `You are DirectorBob — a senior engineering lead.

MISSION: ${missionDescription}

AGENTS:
${agentList}

FILE ASSESSMENT (current project state):
${fileAssessment || 'No assessment available — project may not be indexed.'}

ALL EXISTING FILES:
${existingFiles}

CRITICAL RULES:
1. Generate 3 to 6 specific, actionable tasks.
2. Each task must reference EXACT file paths.
3. For files marked ✅ EXISTS — agents must make SURGICAL changes only. They must NOT rewrite or gut these files.
4. For files marked ❌ EMPTY or 🔲 MISSING — agents should create or fill them.
5. ${hasTests ? 'Test tasks allowed.' : 'NO test tasks — no test framework configured.'}
6. Agent names must NOT include @ symbol.
7. dependsOn uses t1, t2, t3 format.

Respond with ONLY a valid JSON array. No explanation. No markdown:
[{"assignedTo":"agentName","instruction":"specific instruction with exact file path","dependsOn":[]},...]`;

  try {
    const messages: LocalChatMessage[] = [
      {
        role: 'system',
        content: 'You are DirectorBob. Return ONLY a valid JSON array. No markdown. No explanation. Agent names must NOT include @ symbol.',
      },
      { role: 'user', content: prompt },
    ];

    const rawResponse = await callLocalModel(localEndpoint, messages);
    const responseText =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    let rawTasks: any[] | null = null;

    try {
      const trimmed = responseText.trim();
      if (trimmed.startsWith('[')) rawTasks = JSON.parse(trimmed);
    } catch { }

    if (!rawTasks) {
      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) { try { rawTasks = JSON.parse(jsonMatch[0]); } catch { } }
    }

    if (!rawTasks) {
      const startIdx = responseText.indexOf('[');
      if (startIdx !== -1) {
        let attempt = responseText.slice(startIdx);
        if (!attempt.trim().endsWith(']')) attempt = attempt + ']';
        try { rawTasks = JSON.parse(attempt); } catch { }
      }
    }

    if (!rawTasks || !Array.isArray(rawTasks) || rawTasks.length === 0) {
      throw new Error('Invalid task map response from model.');
    }

    return rawTasks.map((t: any) => {
      const deps = (t.dependsOn || [])
        .map((dep: string) => {
          const match = dep.match(/t(\d+)/i);
          if (match) {
            const depIdx = parseInt(match[1]) - 1;
            return depIdx >= 0 && depIdx < rawTasks!.length
              ? `__TASK_${depIdx}__`
              : null;
          }
          return null;
        })
        .filter(Boolean);

      return {
        assignedTo: (t.assignedTo || '').replace(/^@+/, ''),
        instruction: t.instruction,
        dependsOn: deps,
        outputFile: t.outputFile || null,
        satisfactionTarget: inferSatisfactionTarget(t.instruction || ''),
        stagnationLimit: inferStagnationLimit(t.instruction || ''),
        directorLimit: DEFAULT_DIRECTOR_LIMIT,
      };
    });

  } catch (error: any) {
    console.error(`[DIRECTORBOB] Task map failed: ${error.message}`);
    return agents.map((agent, idx) => ({
      assignedTo: agent.name.replace(/^@+/, ''),
      instruction: `${agent.task}. Context: ${missionDescription}. Make surgical changes only.`,
      dependsOn: idx > 0 ? [`__TASK_${idx - 1}__`] : [],
      outputFile: null,
      satisfactionTarget: 75,
      stagnationLimit: 3,
      directorLimit: DEFAULT_DIRECTOR_LIMIT,
    }));
  }
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
AGENT: ${stuckAgent.name} — ${stuckAgent.task}
LAST SCORE: ${task.lastSatisfactionScore}% / TARGET: ${task.satisfactionTarget}%
ATTEMPTS: ${task.attemptCount}

RECENT NOTES:
${task.notes.slice(-3).join('\n')}

TEAM: ${agentSummaries}
EXISTING FILES: ${existingFiles}

Give ONE specific directive. Reference actual file paths. 2 sentences max. Plain text only.`;

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
    return `Use the // File: header format to write the actual complete file content now. Make surgical changes only.`;
  }
}

// ─── INTELLIGENT COMMIT REVIEW ────────────────────────────────────

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
      localEndpoint
    );

    saveCommitReview(review, commit.missionId, commit.taskId, cwd);

    if (review.verdict === 'APPROVE') {
      try {
        const simpleGit = (await import('simple-git')).default;
        const git = simpleGit(cwd);
        await git.add('.');
        const result = await git.commit(commit.message);
        clearPendingCommit(commit.id, cwd);
        emit('done', `DirectorBob approved ✅ committed: ${result.commit?.slice(0, 7)} — ${commit.message}`);

        // Reset denial count on successful commit
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
        clearPendingCommit(commit.id, cwd);
        emit('error', `Commit failed after approval: ${e.message}`);
      }

    } else {
      // ─── DENY: restore files + track denial count ─────────────
      const { restored, failed } = restoreDeniedFiles(review, cwd);
      clearPendingCommit(commit.id, cwd);

      // Increment denial count for this task
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
        // ─── Max denials hit → surface to user, do NOT reopen ───
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
        // ─── Under limit → inject revision note and reopen ───────
        const revisionMessage = `COMMIT DENIED (${denials}/${MAX_COMMIT_DENIALS}): ${review.revisionNote}`;
        addTaskNote(mission, task.id, revisionMessage, cwd);
        emit('response', `DirectorBob → @${commit.agentName}: ${review.revisionNote}`);

        // Reopen task with feedback
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

    if (state.aborted) {
      mission.status = 'aborted';
      saveMission(mission, cwd);
      return { mission, completed: false, aborted: true, surfacedToUser: false };
    }

    if (state.paused) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    if (activeExecutions.size === 0) {
      await handlePendingCommits(cwd, localEndpoint, taskMap, mission, state, onEvent);
    }

    if (isMissionComplete(mission)) {
      if (activeExecutions.size === 0) {
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
      emit('thinking', `Dispatching @${agent.name} → ${task.instruction.slice(0, 50)}...`);

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

        if (result.isDone) {
          updateTaskResult(
            mission,
            task.id,
            result.response,
            result.filesCreated,
            result.filesModified,
            cwd
          );
          emit('done', `@${agent.name} ✅ ${task.instruction.slice(0, 50)}`);

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