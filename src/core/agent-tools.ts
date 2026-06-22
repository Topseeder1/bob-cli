import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

const BOB_DIR = path.join(os.homedir(), '.bob');

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────

export type ToolName =
  | 'readFile'
  | 'deleteFile'
  | 'writeOutput'
  | 'readAgentOutput'
  | 'gitCommit'
  | 'gitPush'
  | 'analyseFile'
  | 'runBackup'
  | 'runCommand';

export interface ToolCall {
  tool: ToolName;
  params: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  filesCreated: string[];
  filesModified: string[];
  error?: string;
}

// ─── SAFE COMMAND WHITELIST ───────────────────────────────────────
// Only these command prefixes are permitted.
// Protects users from agents running destructive commands.

const SAFE_COMMAND_PREFIXES: string[] = [
  'flutter pub add',
  'flutter pub get',
  'flutter pub upgrade',
  'dart pub add',
  'dart pub get',
  'npm install',
  'npm i ',
  'npm add',
  'yarn add',
  'yarn install',
  'pnpm add',
  'pnpm install',
  'pip install',
  'pip3 install',
  'cargo add',
  'go get',
  'composer require',
  'bundle add',
  'gem install',
  'pod install',
  'pod update',
];

function isCommandSafe(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return SAFE_COMMAND_PREFIXES.some(prefix =>
    normalized.startsWith(prefix.toLowerCase())
  );
}

// ─── PENDING COMMIT (multi-queue) ────────────────────────────────

export interface PendingCommit {
  id: string;
  message: string;
  agentName: string;
  taskId: string;
  missionId: string;
  filesChanged: Array<{
    filePath: string;
    backupPath: string | null;
    isNew: boolean;
  }>;
  timestamp: string;
}

function getPendingCommitsDir(cwd: string): string {
  const projectName = path.basename(cwd);
  return path.join(BOB_DIR, 'projects', projectName, 'agents', 'pending-commits');
}

export function savePendingCommit(commit: PendingCommit, cwd: string): void {
  const dir = getPendingCommitsDir(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${commit.timestamp.replace(/[:.]/g, '-')}_${commit.taskId}.json`;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(commit, null, 2));
}

export function loadPendingCommits(cwd: string): PendingCommit[] {
  const dir = getPendingCommitsDir(cwd);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean) as PendingCommit[];
  } catch {
    return [];
  }
}

export function clearPendingCommit(commitId: string, cwd: string): void {
  const dir = getPendingCommitsDir(cwd);
  if (!fs.existsSync(dir)) return;
  try {
    const files = fs.readdirSync(dir).filter(f => f.includes(commitId));
    for (const file of files) {
      fs.unlinkSync(path.join(dir, file));
    }
  } catch { }
}

export function clearAllPendingCommits(cwd: string): void {
  const dir = getPendingCommitsDir(cwd);
  if (!fs.existsSync(dir)) return;
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      fs.unlinkSync(path.join(dir, file));
    }
  } catch { }
}

// ─── TOOL NAMES ───────────────────────────────────────────────────

const ALL_TOOL_NAMES: ToolName[] = [
  'readFile', 'deleteFile', 'writeOutput', 'readAgentOutput',
  'gitCommit', 'gitPush', 'analyseFile', 'runBackup', 'runCommand',
];

// ─── TOOL PROMPT ──────────────────────────────────────────────────

export const AGENT_TOOLS_PROMPT = `
ACTION TOOLS (for non-file operations):
Use the "toolCall" field in your JSON response when you need an action.

readFile
  params: { "path": "src/core/config-store.ts" }
  Use when: You need to read an existing file before modifying it.

writeOutput
  params: { "content": "your findings or completion summary" }
  Use when: Recording your final decision, recommendation, or audit findings.

readAgentOutput
  params: { "agentName": "architectBob", "taskId": "m_123_t1" }
  Use when: Reading another agent's task output.

runCommand
  params: { "command": "flutter pub add intl" }
  Use when: A required package is missing and needs to be installed.
  SAFE commands only: flutter pub add, npm install, yarn add, pip install, etc.
  NEVER use for: rm, delete, format, drop, or any destructive operation.

gitCommit
  params: { "message": "your commit message" }
  Use when: Your work is complete and ready for DirectorBob review.
  NOTE: Queues a commit request — DirectorBob reviews before approving.

gitPush
  params: {}
  Use when: DirectorBob has approved a commit and you need to push.

deleteFile
  params: { "path": "src/old/file.ts" }
  Use when: Removing a file that is no longer needed.

RULES:
- Only ONE toolCall per JSON response.
- For file creation/modification use the "files" array in your JSON response.
- Always readFile before modifying an existing file.
- If a package import fails, use runCommand to install it first.
- gitCommit queues a review request — DirectorBob approves or denies.
`;

// ─── TOOL CALL PARSER ─────────────────────────────────────────────

export function parseToolCall(response: string): ToolCall | null {
  const lines = response.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();

    if (line.toLowerCase().startsWith('tool_call:')) {
      try {
        const colonIdx = line.indexOf(':');
        const jsonStr = line.slice(colonIdx + 1).trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed.tool && parsed.params !== undefined) {
          return parsed as ToolCall;
        }
      } catch { }
    }

    const pythonMatch = line.match(/^(\w+)\s*\(\s*path\s*=\s*['"]([^'"]+)['"]\s*\)/);
    if (pythonMatch) {
      const toolName = pythonMatch[1] as ToolName;
      if (ALL_TOOL_NAMES.includes(toolName)) {
        return { tool: toolName, params: { path: pythonMatch[2] } };
      }
    }

    if (ALL_TOOL_NAMES.includes(line as ToolName) && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine.startsWith('{')) {
        try {
          const params = JSON.parse(nextLine);
          if (Object.keys(params).length > 0) {
            return { tool: line as ToolName, params };
          }
        } catch { }
      }
    }

    if (line.startsWith('{') && line.includes('"tool"')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.tool && parsed.params !== undefined) {
          return parsed as ToolCall;
        }
      } catch { }
    }
  }

  return null;
}

export function stripToolCall(response: string): string {
  const lines = response.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toLowerCase().startsWith('tool_call:')) continue;
    if (ALL_TOOL_NAMES.includes(line as ToolName)) {
      if (i + 1 < lines.length && lines[i + 1].trim().startsWith('{')) i++;
      continue;
    }
    if (
      line.startsWith('{"path"') || line.startsWith('{"message"') ||
      line.startsWith('{"content"') || line.startsWith('{"tool"') ||
      line.startsWith('{"agentName"') || line.startsWith('{"command"')
    ) continue;
    result.push(lines[i]);
  }

  return result.join('\n').trim();
}

// ─── TOOL EXECUTOR ────────────────────────────────────────────────

export class AgentToolExecutor {
  private cwd: string;
  private agentName: string;
  private taskId: string;
  private missionId: string;
  private filesWrittenThisTask: Array<{ filePath: string; backupPath: string | null; isNew: boolean }>;

  constructor(
    cwd: string,
    agentName: string,
    taskId: string,
    missionId: string = '',
    filesWrittenThisTask: Array<{ filePath: string; backupPath: string | null; isNew: boolean }> = []
  ) {
    this.cwd = cwd;
    this.agentName = agentName;
    this.taskId = taskId;
    this.missionId = missionId;
    this.filesWrittenThisTask = filesWrittenThisTask;
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    switch (toolCall.tool) {
      case 'readFile':        return this.readFile(toolCall.params);
      case 'deleteFile':      return this.deleteFile(toolCall.params);
      case 'writeOutput':     return this.writeOutput(toolCall.params);
      case 'readAgentOutput': return this.readAgentOutput(toolCall.params);
      case 'gitCommit':       return this.gitCommitQueue(toolCall.params);
      case 'gitPush':         return this.gitPush();
      case 'analyseFile':     return this.analyseFile(toolCall.params);
      case 'runBackup':       return this.runBackup();
      case 'runCommand':      return this.runCommand(toolCall.params);
      default:
        return this.error(`Unknown tool: ${(toolCall as any).tool}`);
    }
  }

  private readFile(params: Record<string, any>): ToolResult {
    const filePath = params.path;
    if (!filePath) return this.error('readFile requires path.');
    const absolutePath = this.resolvePath(filePath);
    if (!absolutePath) return this.error(`Path outside project: ${filePath}`);
    try {
      if (!fs.existsSync(absolutePath)) return this.error(`File does not exist: ${filePath}`);
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const truncated = content.length > 8000 ? content.slice(0, 8000) + '\n... (truncated)' : content;
      return { success: true, output: truncated, filesCreated: [], filesModified: [] };
    } catch (e: any) {
      return this.error(`Failed to read file: ${e.message}`);
    }
  }

  private deleteFile(params: Record<string, any>): ToolResult {
    const filePath = params.path;
    if (!filePath) return this.error('deleteFile requires path.');
    const absolutePath = this.resolvePath(filePath);
    if (!absolutePath) return this.error(`Path outside project: ${filePath}`);
    try {
      if (!fs.existsSync(absolutePath)) return this.error(`File does not exist: ${filePath}`);
      this.backupFile(absolutePath, filePath);
      fs.unlinkSync(absolutePath);
      return { success: true, output: `Deleted: ${filePath} (backup saved)`, filesCreated: [], filesModified: [] };
    } catch (e: any) {
      return this.error(`Failed to delete file: ${e.message}`);
    }
  }

  private writeOutput(params: Record<string, any>): ToolResult {
    const content = params.content;
    if (!content) return this.error('writeOutput requires content.');
    try {
      const outputDir = path.join(BOB_DIR, 'projects', path.basename(this.cwd), 'agents', this.agentName, 'output');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, `${this.taskId}.md`), String(content), 'utf-8');
      return { success: true, output: `Output saved.`, filesCreated: [], filesModified: [] };
    } catch (e: any) {
      return this.error(`Failed to write output: ${e.message}`);
    }
  }

  private readAgentOutput(params: Record<string, any>): ToolResult {
    const { agentName, taskId } = params;
    if (!agentName || !taskId) return this.error('readAgentOutput requires agentName and taskId.');
    try {
      const outputFile = path.join(BOB_DIR, 'projects', path.basename(this.cwd), 'agents', agentName, 'output', `${taskId}.md`);
      if (!fs.existsSync(outputFile)) return this.error(`No output found for @${agentName} task ${taskId}.`);
      return { success: true, output: fs.readFileSync(outputFile, 'utf-8'), filesCreated: [], filesModified: [] };
    } catch (e: any) {
      return this.error(`Failed to read agent output: ${e.message}`);
    }
  }

  // ─── RUN COMMAND ──────────────────────────────────────────────
  // Executes a whitelisted shell command in the project directory.
  // Only package installation commands are permitted.
  // Protects users from agents running destructive operations.

  private runCommand(params: Record<string, any>): ToolResult {
    const command = params.command;
    if (!command) return this.error('runCommand requires command.');

    // ─── Safety check — whitelist only ────────────────────────
    if (!isCommandSafe(command)) {
      return this.error(
        `Command not permitted: "${command}". ` +
        `Only package installation commands are allowed (flutter pub add, npm install, etc.). ` +
        `Never use runCommand for file operations or destructive commands.`
      );
    }

    try {
      const output = execSync(command, {
        cwd: this.cwd,
        timeout: 60000, // 60 second timeout
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return {
        success: true,
        output: `Command succeeded: ${command}\n${output.slice(0, 500)}`,
        filesCreated: [],
        filesModified: [],
      };
    } catch (e: any) {
      const stderr = e.stderr ? e.stderr.toString().slice(0, 300) : '';
      return this.error(
        `Command failed: "${command}"\n${e.message}\n${stderr}`
      );
    }
  }

  // ─── GIT COMMIT → MULTI-QUEUE ─────────────────────────────────

  private gitCommitQueue(params: Record<string, any>): ToolResult {
    const message = params.message;
    if (!message) return this.error('gitCommit requires message.');

    const commitId = `${this.taskId}_${Date.now()}`;

    const pending: PendingCommit = {
      id: commitId,
      message,
      agentName: this.agentName,
      taskId: this.taskId,
      missionId: this.missionId,
      filesChanged: this.filesWrittenThisTask,
      timestamp: new Date().toISOString(),
    };

    savePendingCommit(pending, this.cwd);

    return {
      success: true,
      output: `Commit queued for DirectorBob review: "${message}". ${this.filesWrittenThisTask.length} file(s) to review.`,
      filesCreated: [],
      filesModified: [],
    };
  }

  private async gitPush(): Promise<ToolResult> {
    try {
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(this.cwd);
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
      return { success: true, output: `Pushed to ${branch}.`, filesCreated: [], filesModified: [] };
    } catch (e: any) {
      return this.error(`Git push failed: ${e.message}`);
    }
  }

  private analyseFile(params: Record<string, any>): ToolResult {
    const filePath = params.path;
    if (!filePath) return this.error('analyseFile requires path.');
    return { success: true, output: `Analysis queued for ${filePath}.`, filesCreated: [], filesModified: [] };
  }

  private runBackup(): ToolResult {
    return { success: true, output: 'Backup initiated.', filesCreated: [], filesModified: [] };
  }

  private resolvePath(filePath: string): string | null {
    const resolved = path.resolve(this.cwd, filePath);
    if (!resolved.startsWith(this.cwd)) return null;
    return resolved;
  }

  private backupFile(absolutePath: string, relativePath: string): string | null {
    try {
      const backupDir = path.join(this.cwd, '.bob-backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupName = relativePath.replace(/[\/\\]/g, '_') + `.${Date.now()}.bak`;
      const backupPath = path.join(backupDir, backupName);
      fs.copyFileSync(absolutePath, backupPath);
      return backupPath;
    } catch {
      return null;
    }
  }

  private error(message: string): ToolResult {
    return { success: false, output: message, filesCreated: [], filesModified: [], error: message };
  }
}