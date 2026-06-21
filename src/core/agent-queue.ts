import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const BOB_DIR = path.join(os.homedir(), '.bob');

// ─── INTERFACES ──────────────────────────────────────────────────

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stagnated'
  | 'skipped';

export interface AgentTask {
  id: string;
  missionId: string;
  assignedTo: string;
  instruction: string;
  dependsOn: string[];
  status: TaskStatus;
  satisfactionTarget: number;
  stagnationLimit: number;
  directorLimit: number;
  attemptCount: number;
  stagnationCount: number;
  directorSurfaceCount: number;
  lastSatisfactionScore: number | null;
  consecutiveLowCount: number;
  outputFile: string | null;
  result: string | null;
  filesCreated: string[];
  filesModified: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  notes: string[];
}

export interface AgentMission {
  id: string;
  description: string;
  status: 'planning' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';
  tasks: AgentTask[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  totalFilesCreated: number;
  totalFilesModified: number;
}

// ─── PATHS ───────────────────────────────────────────────────────

function getQueueDir(workingDir?: string): string {
  const cwd = workingDir || process.cwd();
  const projectName = path.basename(cwd);
  return path.join(BOB_DIR, 'projects', projectName, 'agents');
}

function getQueuePath(missionId: string, workingDir?: string): string {
  return path.join(getQueueDir(workingDir), `mission_${missionId}.json`);
}

function getActiveMissionPath(workingDir?: string): string {
  return path.join(getQueueDir(workingDir), 'active_mission.json');
}

function ensureQueueDir(workingDir?: string): void {
  const dir = getQueueDir(workingDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── MISSION OPERATIONS ───────────────────────────────────────────

export function createMission(
  description: string,
  tasks: Omit<AgentTask, 'id' | 'missionId' | 'status' | 'attemptCount' |
    'stagnationCount' | 'directorSurfaceCount' | 'lastSatisfactionScore' |
    'consecutiveLowCount' | 'result' | 'filesCreated' | 'filesModified' |
    'createdAt' | 'startedAt' | 'completedAt' | 'notes'>[],
  workingDir?: string
): AgentMission {
  ensureQueueDir(workingDir);

  const missionId = `m_${Date.now()}`;
  const now = new Date().toISOString();

  const fullTasks: AgentTask[] = tasks.map((t, idx) => ({
    ...t,
    id: `${missionId}_t${idx + 1}`,
    missionId,
    status: 'pending',
    attemptCount: 0,
    stagnationCount: 0,
    directorSurfaceCount: 0,
    lastSatisfactionScore: null,
    consecutiveLowCount: 0,
    result: null,
    filesCreated: [],
    filesModified: [],
    createdAt: now,
    startedAt: null,
    completedAt: null,
    notes: [],
  }));

  const mission: AgentMission = {
    id: missionId,
    description,
    status: 'planning',
    tasks: fullTasks,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    totalFilesCreated: 0,
    totalFilesModified: 0,
  };

  saveMission(mission, workingDir);
  setActiveMission(missionId, workingDir);

  return mission;
}

export function saveMission(
  mission: AgentMission,
  workingDir?: string
): void {
  ensureQueueDir(workingDir);
  fs.writeFileSync(
    getQueuePath(mission.id, workingDir),
    JSON.stringify(mission, null, 2)
  );
}

export function loadMission(
  missionId: string,
  workingDir?: string
): AgentMission | null {
  const queuePath = getQueuePath(missionId, workingDir);
  if (!fs.existsSync(queuePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function setActiveMission(
  missionId: string,
  workingDir?: string
): void {
  ensureQueueDir(workingDir);
  fs.writeFileSync(
    getActiveMissionPath(workingDir),
    JSON.stringify({ missionId, setAt: new Date().toISOString() }, null, 2)
  );
}

export function getActiveMissionId(workingDir?: string): string | null {
  const activePath = getActiveMissionPath(workingDir);
  if (!fs.existsSync(activePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    return data.missionId || null;
  } catch {
    return null;
  }
}

export function clearActiveMission(workingDir?: string): void {
  const activePath = getActiveMissionPath(workingDir);
  if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
}

// ─── TASK OPERATIONS ──────────────────────────────────────────────

export function updateTaskStatus(
  mission: AgentMission,
  taskId: string,
  status: TaskStatus,
  workingDir?: string
): AgentMission {
  const task = mission.tasks.find(t => t.id === taskId);
  if (!task) return mission;

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
  return mission;
}

export function updateTaskResult(
  mission: AgentMission,
  taskId: string,
  result: string,
  filesCreated: string[] = [],
  filesModified: string[] = [],
  workingDir?: string
): AgentMission {
  const task = mission.tasks.find(t => t.id === taskId);
  if (!task) return mission;

  task.result = result;
  task.filesCreated = filesCreated;
  task.filesModified = filesModified;
  task.status = 'completed';
  task.completedAt = new Date().toISOString();

  mission.totalFilesCreated += filesCreated.length;
  mission.totalFilesModified += filesModified.length;

  saveMission(mission, workingDir);
  return mission;
}

export function addTaskNote(
  mission: AgentMission,
  taskId: string,
  note: string,
  workingDir?: string
): AgentMission {
  const task = mission.tasks.find(t => t.id === taskId);
  if (!task) return mission;

  task.notes.push(`[${new Date().toLocaleTimeString()}] ${note}`);
  saveMission(mission, workingDir);
  return mission;
}

// ─── DEPENDENCY RESOLUTION ────────────────────────────────────────

/**
 * Returns all tasks that are ready to run right now.
 * A task is ready when:
 * 1. Its status is 'pending'
 * 2. ALL tasks it depends on are 'completed'
 *
 * This enables dependency-aware parallel execution:
 * tasks with no deps fire immediately,
 * dependent tasks fire as soon as their deps complete.
 */
export function getReadyTasks(mission: AgentMission): AgentTask[] {
  const completedIds = new Set(
    mission.tasks
      .filter(t => t.status === 'completed')
      .map(t => t.id)
  );

  return mission.tasks.filter(task => {
    if (task.status !== 'pending') return false;
    return task.dependsOn.every(depId => completedIds.has(depId));
  });
}

export function getRunningTasks(mission: AgentMission): AgentTask[] {
  return mission.tasks.filter(t => t.status === 'running');
}

export function getPendingTasks(mission: AgentMission): AgentTask[] {
  return mission.tasks.filter(t => t.status === 'pending');
}

export function getCompletedTasks(mission: AgentMission): AgentTask[] {
  return mission.tasks.filter(t => t.status === 'completed');
}

export function isMissionComplete(mission: AgentMission): boolean {
  return mission.tasks.every(
    t => t.status === 'completed' ||
         t.status === 'skipped' ||
         t.status === 'failed' ||
         t.status === 'stagnated'
  );
}

export function isMissionBlocked(mission: AgentMission): boolean {
  const running = getRunningTasks(mission);
  const ready = getReadyTasks(mission);
  return running.length === 0 && ready.length === 0 && !isMissionComplete(mission);
}

// ─── MISSION SUMMARY ──────────────────────────────────────────────

export function getMissionSummary(mission: AgentMission): {
  total: number;
  completed: number;
  running: number;
  pending: number;
  failed: number;
  stagnated: number;
  skipped: number;
  percentComplete: number;
} {
  const total = mission.tasks.length;
  const completed = mission.tasks.filter(t => t.status === 'completed').length;
  const running = mission.tasks.filter(t => t.status === 'running').length;
  const pending = mission.tasks.filter(t => t.status === 'pending').length;
  const failed = mission.tasks.filter(t => t.status === 'failed').length;
  const stagnated = mission.tasks.filter(t => t.status === 'stagnated').length;
  const skipped = mission.tasks.filter(t => t.status === 'skipped').length;
  const percentComplete = total > 0
    ? Math.round((completed / total) * 100)
    : 0;

  return {
    total, completed, running, pending,
    failed, stagnated, skipped, percentComplete,
  };
}