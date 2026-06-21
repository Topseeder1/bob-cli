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
  updateTaskStatus,
  updateTaskResult,
  addTaskNote,
  getReadyTasks,
  getRunningTasks,
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
import { buildLocalContext } from './context-builder.js';
import { loadSummaries } from './project-map.js';

// ─── CONSTANTS ────────────────────────────────────────────────────

const DEFAULT_DIRECTOR_LIMIT = 2;
const MAX_PARALLEL_TASKS = 4;
const TASK_LOOP_INTERVAL_MS = 500;

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
}

// ─── FILE ASSESSMENT ──────────────────────────────────────────────

interface FileAssessment {
  filePath: string;
  exists: boolean;
  lineCount: number;
  isEmpty: boolean;
  hasPlaceholder: boolean;
  preview: string;
  status: 'working' | 'incomplete' | 'empty' | 'missing';
}

/**
 * DirectorBob scans the project to understand what already exists,
 * what is broken, and what is missing — before generating any tasks.
 *
 * This is the "senior engineer walking in cold" assessment.
 */
async function scanAndAssessMission(
  missionDescription: string,
  agents: AgentRegistryEntry[],
  cwd: string,
  localEndpoint: string
): Promise<{
  assessments: FileAssessment[];
  existingFiles: string;
  hasTests: boolean;
  assessmentSummary: string;
}> {

  // ─── Get all indexed files ─────────────────────────────────────
  const summaries = loadSummaries(cwd);
  const allIndexedFiles = summaries ? Object.keys(summaries) : [];

  // ─── Check for test framework ──────────────────────────────────
  const hasVitest =
    fs.existsSync(path.join(cwd, 'vitest.config.ts')) ||
    fs.existsSync(path.join(cwd, 'vitest.config.js'));
  const hasJest =
    fs.existsSync(path.join(cwd, 'jest.config.ts')) ||
    fs.existsSync(path.join(cwd, 'jest.config.js'));
  const hasTests = hasVitest || hasJest;

  // ─── Build existing files list for prompt ─────────────────────
  const existingFiles = allIndexedFiles.slice(0, 20).join('\n');

  // ─── Ask the model what files are relevant to this mission ────
  const relevancePrompt = `You are DirectorBob. Given this mission and the list of existing project files, identify which files are directly relevant to completing the mission.

MISSION: ${missionDescription}

EXISTING PROJECT FILES:
${existingFiles}

Return ONLY a JSON array of the most relevant file paths from the list above.
Maximum 8 files. No explanation. No markdown.
["src/path/file.ts", ...]`;

  let relevantFilePaths: string[] = [];
  try {
    const messages: LocalChatMessage[] = [
      { role: 'system', content: 'Return ONLY a valid JSON array of file paths. No markdown.' },
      { role: 'user', content: relevancePrompt },
    ];
    const rawResponse = await callLocalModel(localEndpoint, messages);
    const responseText =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      relevantFilePaths = JSON.parse(jsonMatch[0]);
    }
  } catch { }

  // ─── Assess each relevant file ─────────────────────────────────
  const assessments: FileAssessment[] = [];

  for (const filePath of relevantFilePaths.slice(0, 8)) {
    const absolutePath = path.join(cwd, filePath);
    const exists = fs.existsSync(absolutePath);

    if (!exists) {
      assessments.push({
        filePath,
        exists: false,
        lineCount: 0,
        isEmpty: true,
        hasPlaceholder: false,
        preview: '',
        status: 'missing',
      });
      continue;
    }

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const lines = content.split('\n');
      const lineCount = lines.length;
      const preview = lines.slice(0, 6).join('\n');

      const isEmpty = content.trim().length < 20;
      const hasPlaceholder =
        content.includes('// file content here') ||
        content.includes('// TODO') ||
        content.includes('// implement this') ||
        (lineCount < 5 && content.trim().startsWith('//'));

      let status: FileAssessment['status'];
      if (isEmpty || hasPlaceholder) {
        status = 'empty';
      } else if (lineCount < 10) {
        status = 'incomplete';
      } else {
        status = 'working';
      }

      assessments.push({
        filePath,
        exists: true,
        lineCount,
        isEmpty,
        hasPlaceholder,
        preview,
        status,
      });
    } catch {
      assessments.push({
        filePath,
        exists: true,
        lineCount: 0,
        isEmpty: true,
        hasPlaceholder: false,
        preview: '',
        status: 'incomplete',
      });
    }
  }

  // ─── Build assessment summary for DirectorBob ─────────────────
  const summaryLines: string[] = [];

  const working = assessments.filter(a => a.status === 'working');
  const incomplete = assessments.filter(a => a.status === 'incomplete');
  const empty = assessments.filter(a => a.status === 'empty');
  const missing = assessments.filter(a => a.status === 'missing');

  if (working.length > 0) {
    summaryLines.push('WORKING (do not overwrite unless specifically instructed):');
    for (const a of working) {
      summaryLines.push(`  ✅ ${a.filePath} (${a.lineCount} lines)`);
    }
  }

  if (incomplete.length > 0) {
    summaryLines.push('INCOMPLETE (exists but needs work):');
    for (const a of incomplete) {
      summaryLines.push(`  ⚠️  ${a.filePath} (${a.lineCount} lines)`);
      if (a.preview) {
        summaryLines.push(`     Preview: ${a.preview.split('\n')[0].slice(0, 60)}`);
      }
    }
  }

  if (empty.length > 0) {
    summaryLines.push('EMPTY/PLACEHOLDER (needs real implementation):');
    for (const a of empty) {
      summaryLines.push(`  ❌ ${a.filePath} — empty or placeholder`);
    }
  }

  if (missing.length > 0) {
    summaryLines.push('MISSING (does not exist yet — needs to be created):');
    for (const a of missing) {
      summaryLines.push(`  🔲 ${a.filePath} — does not exist`);
    }
  }

  const assessmentSummary = summaryLines.join('\n');

  return { assessments, existingFiles, hasTests, assessmentSummary };
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

  // ─── Step 1: Scan and assess the project first ────────────────
  const { assessments, existingFiles, hasTests, assessmentSummary } =
    await scanAndAssessMission(missionDescription, agents, cwd, localEndpoint);

  const agentList = agents
    .map(a => `${a.name}: ${a.task}`)
    .join('\n');

  // ─── Step 2: Generate tasks based on assessment ───────────────
  const prompt = `You are DirectorBob — a senior engineering lead.

You have just assessed the codebase. Here is what you found:

${assessmentSummary || 'No relevant files found yet — everything needs to be created.'}

MISSION: ${missionDescription}

ALL PROJECT FILES:
${existingFiles}

AGENTS:
${agentList}

Based on the assessment above, generate a task map to complete the mission.

KEY RULES:
- Do NOT assign tasks to create files that are already WORKING — leave them alone.
- DO assign tasks to fix EMPTY or PLACEHOLDER files — they need real implementation.
- DO assign tasks to complete INCOMPLETE files — they need more work.
- DO assign tasks to create MISSING files that the mission requires.
- Every task instruction must reference the EXACT file path.
- ${hasTests ? 'Test tasks allowed.' : 'NO test tasks — no test framework configured.'}
- 3 to 6 tasks maximum.
- dependsOn uses t1, t2, t3 format.
- Agent names must NOT include @ symbol.

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

    // Strategy 1: direct parse
    try {
      const trimmed = responseText.trim();
      if (trimmed.startsWith('[')) {
        rawTasks = JSON.parse(trimmed);
      }
    } catch { }

    // Strategy 2: regex extract
    if (!rawTasks) {
      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        try { rawTasks = JSON.parse(jsonMatch[0]); } catch { }
      }
    }

    // Strategy 3: greedy
    if (!rawTasks) {
      const startIdx = responseText.indexOf('[');
      if (startIdx !== -1) {
        let attempt = responseText.slice(startIdx);
        if (!attempt.trim().endsWith(']')) attempt = attempt + ']';
        try { rawTasks = JSON.parse(attempt); } catch { }
      }
    }

    if (!rawTasks || !Array.isArray(rawTasks) || rawTasks.length === 0) {
      console.error('[DIRECTORBOB] Failed to parse task map. Model returned:');
      console.error(responseText.slice(0, 500));
      throw new Error('Invalid task map response from model.');
    }

    return rawTasks.map((t: any, idx: number) => {
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

    // Fallback — one meaningful task per agent
    return agents.map((agent, idx) => ({
      assignedTo: agent.name.replace(/^@+/, ''),
      instruction: `${agent.task}. Context: ${missionDescription}. Reference existing project files.`,
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

  const summaries = loadSummaries(cwd);
  const existingFiles = summaries
    ? Object.keys(summaries).slice(0, 20).join('\n')
    : 'No indexed files.';

  const prompt = `You are DirectorBob. @${stuckAgent.name} is stagnating.

STUCK TASK: ${task.instruction}
AGENT: ${stuckAgent.name} — ${stuckAgent.task}
LAST SCORE: ${task.lastSatisfactionScore}% / TARGET: ${task.satisfactionTarget}%
ATTEMPTS: ${task.attemptCount} | DIRECTOR SURFACES: ${task.directorSurfaceCount}

RECENT NOTES:
${task.notes.slice(-3).join('\n')}

TEAM:
${agentSummaries}

EXISTING FILES:
${existingFiles}

Give @${stuckAgent.name} ONE specific directive to unblock them.
Reference actual file paths. Tell them exactly what to do RIGHT NOW.
Plain text only. 2 sentences maximum.`;

  try {
    const messages: LocalChatMessage[] = [
      {
        role: 'system',
        content: 'You are DirectorBob. Give a specific 2-sentence directive. Reference real files. Plain text only.',
      },
      { role: 'user', content: prompt },
    ];

    const rawResponse = await callLocalModel(localEndpoint, messages);
    const note =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    return note.trim().split('\n')[0].slice(0, 200);

  } catch {
    return `Use the // File: header format to write the actual complete file content now. Stop planning and execute immediately.`;
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
    if (onEvent) {
      onEvent({ type, agentName: 'directorBob', taskId: 'director', message, data });
    }
  };

  emit('thinking', 'DirectorBob online. Autonomous loop starting...');

  const activeExecutions = new Map<string, Promise<TaskExecutionResult>>();

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

    if (isMissionComplete(mission)) {
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

    const readyTasks = getReadyTasks(mission).filter(
      t => !activeExecutions.has(t.id)
    );

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
        if (injection) {
          addTaskNote(mission, task.id, `Injection: ${injection}`, cwd);
        }
      }

      const executionPromise = executeTaskAttempt(
        task, agent, agents, mission, cwd, localEndpoint, onEvent
      ).then(async (result) => {
        activeExecutions.delete(task.id);

        if (result.isDone) {
          // ─── Track files in mission summary ──────────────────
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

// ─── MISSING IMPORT FIX ───────────────────────────────────────────
// updateTaskStatus is used above but wasn't imported — add it here

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