import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const BOB_DIR = path.join(os.homedir(), '.bob');
const PROJECTS_DIR = path.join(BOB_DIR, 'projects');

export interface ProjectMeta {
  name: string;
  path: string;
  createdAt: string;
  lastIndexed: string | null;
}

export interface TaskFile {
  filePath: string;
  status: boolean;
  summary: string | null;
  dependencies: string[];
  error: string | null;
}

/**
 * Derives a project name from the working directory.
 */
export function getProjectName(workingDir: string): string {
  return path.basename(workingDir);
}

/**
 * Returns the full path to the project's .bob folder.
 */
export function getProjectDir(workingDir: string): string {
  const name = getProjectName(workingDir);
  return path.join(PROJECTS_DIR, name);
}

/**
 * Ensures the project folder structure exists.
 */
export function ensureProjectStructure(workingDir: string): {
  projectDir: string;
  conversationsDir: string;
  analysisDir: string;
  runsDir: string;
} {
  const projectDir = getProjectDir(workingDir);
  const conversationsDir = path.join(projectDir, 'conversations');
  const analysisDir = path.join(projectDir, 'analysis');
  const runsDir = path.join(analysisDir, 'runs');

  for (const dir of [BOB_DIR, PROJECTS_DIR, projectDir, conversationsDir, analysisDir, runsDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // Create project.json if it doesn't exist
  const metaPath = path.join(projectDir, 'project.json');
  if (!fs.existsSync(metaPath)) {
    const meta: ProjectMeta = {
      name: getProjectName(workingDir),
      path: workingDir,
      createdAt: new Date().toISOString(),
      lastIndexed: null,
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  return { projectDir, conversationsDir, analysisDir, runsDir };
}

/**
 * Creates a new analysis run with task files for each source file.
 */
export function createAnalysisRun(workingDir: string, files: string[]): {
  runId: string;
  runDir: string;
  tasksDir: string;
} {
  const { runsDir } = ensureProjectStructure(workingDir);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(runsDir, runId);
  const tasksDir = path.join(runDir, 'tasks');

  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(tasksDir, { recursive: true });

  // Create manifest
  const manifest = {
    runId,
    status: 'in_progress',
    totalFiles: files.length,
    completedFiles: 0,
    createdAt: new Date().toISOString(),
    projectPath: workingDir,
  };
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Create task files
  for (const filePath of files) {
    const taskId = filePath.replace(/[\/\\]/g, '_');
    const task: TaskFile = {
      filePath,
      status: false,
      summary: null,
      dependencies: [],
      error: null,
    };
    fs.writeFileSync(path.join(tasksDir, `${taskId}.json`), JSON.stringify(task, null, 2));
  }

  return { runId, runDir, tasksDir };
}

/**
 * Marks a task as complete with summary.
 */
export function completeTask(tasksDir: string, filePath: string, summary: string): void {
  const taskId = filePath.replace(/[\/\\]/g, '_');
  const taskPath = path.join(tasksDir, `${taskId}.json`);

  if (fs.existsSync(taskPath)) {
    const task: TaskFile = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
    task.status = true;
    task.summary = summary;
    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
  }
}

/**
 * Updates the manifest progress count.
 */
export function updateManifestProgress(runDir: string, completedFiles: number, status?: string): void {
  const manifestPath = path.join(runDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.completedFiles = completedFiles;
    if (status) manifest.status = status;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

/**
 * Saves the final summaries.json for the project.
 */
export function saveSummaries(workingDir: string, summaries: Record<string, string>): void {
  const { analysisDir } = ensureProjectStructure(workingDir);
  fs.writeFileSync(path.join(analysisDir, 'summaries.json'), JSON.stringify(summaries, null, 2));

  // Update project meta
  const projectDir = getProjectDir(workingDir);
  const metaPath = path.join(projectDir, 'project.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.lastIndexed = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
}

/**
 * Saves the final dependencies.json for the project.
 */
export function saveDependencies(workingDir: string, dependencies: Record<string, string[]>): void {
  const { analysisDir } = ensureProjectStructure(workingDir);
  fs.writeFileSync(path.join(analysisDir, 'dependencies.json'), JSON.stringify(dependencies, null, 2));
}

/**
 * Loads summaries for the current project. Returns null if not indexed.
 */
export function loadSummaries(workingDir: string): Record<string, string> | null {
  const { analysisDir } = ensureProjectStructure(workingDir);
  const summariesPath = path.join(analysisDir, 'summaries.json');
  if (!fs.existsSync(summariesPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(summariesPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Loads dependencies for the current project. Returns null if not indexed.
 */
export function loadDependencies(workingDir: string): Record<string, string[]> | null {
  const { analysisDir } = ensureProjectStructure(workingDir);
  const depsPath = path.join(analysisDir, 'dependencies.json');
  if (!fs.existsSync(depsPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(depsPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Gets incomplete tasks from the latest run (for re-running).
 */
export function getIncompleteTasks(workingDir: string): TaskFile[] {
  const { runsDir } = ensureProjectStructure(workingDir);
  const runs = fs.readdirSync(runsDir).sort().reverse();

  if (runs.length === 0) return [];

  const latestRun = runs[0];
  const tasksDir = path.join(runsDir, latestRun, 'tasks');

  if (!fs.existsSync(tasksDir)) return [];

  const tasks: TaskFile[] = [];
  for (const file of fs.readdirSync(tasksDir)) {
    try {
      const task: TaskFile = JSON.parse(fs.readFileSync(path.join(tasksDir, file), 'utf-8'));
      if (!task.status) tasks.push(task);
    } catch {
      // Skip corrupted
    }
  }

  return tasks;
}