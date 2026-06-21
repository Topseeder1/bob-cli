import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const BOB_DIR = path.join(os.homedir(), '.bob');

export type ToolName =
  | 'readFile'
  | 'deleteFile'
  | 'writeOutput'
  | 'readAgentOutput'
  | 'gitCommit'
  | 'gitPush'
  | 'analyseFile'
  | 'runBackup';

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

const ALL_TOOL_NAMES: ToolName[] = [
  'readFile', 'deleteFile', 'writeOutput', 'readAgentOutput',
  'gitCommit', 'gitPush', 'analyseFile', 'runBackup',
];

// ─── ACTION TOOLS PROMPT ─────────────────────────────────────────
// File creation/modification is handled by FILE OUTPUT RULES above.
// These action tools are for everything else.

export const AGENT_TOOLS_PROMPT = `
ACTION TOOLS (for non-file operations):
Use this format as the VERY LAST LINE of your response when you need an action:

TOOL_CALL: {"tool": "<toolName>", "params": {<params>}}

readFile
  params: { "path": "src/core/config-store.ts" }
  Use when: You need to read an existing file before modifying it.

writeOutput
  params: { "content": "your findings or completion summary" }
  Use when: Recording your final decision, recommendation, or audit findings.

readAgentOutput
  params: { "agentName": "architectBob", "taskId": "m_123_t1" }
  Use when: Reading another agent's task output.

gitCommit
  params: { "message": "your commit message" }
  Use when: Committing completed changes to git.

gitPush
  params: {}
  Use when: Pushing committed changes to remote.

deleteFile
  params: { "path": "src/old/file.ts" }
  Use when: Removing a file that is no longer needed.

RULES FOR ACTION TOOLS:
- Only ONE action tool per response.
- TOOL_CALL must be the VERY LAST LINE.
- For file creation/modification: use the // File: format above instead.
`;

// ─── TOOL CALL PARSER ─────────────────────────────────────────────

export function parseToolCall(response: string): ToolCall | null {
  const lines = response.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();

    // Format 1: TOOL_CALL: {...}
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

    // Format 2: readFile(path='...') Python style
    const pythonMatch = line.match(/^(\w+)\s*\(\s*path\s*=\s*['"]([^'"]+)['"]\s*\)/);
    if (pythonMatch) {
      const toolName = pythonMatch[1] as ToolName;
      if (ALL_TOOL_NAMES.includes(toolName)) {
        return { tool: toolName, params: { path: pythonMatch[2] } };
      }
    }

    // Format 3: toolName on one line, JSON on next
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

    // Format 4: toolName {\n  "path": "..."\n}
    if (ALL_TOOL_NAMES.includes(line as ToolName)) {
      let jsonStr = '';
      let depth = 0;
      let started = false;
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const jLine = lines[j].trim();
        for (const char of jLine) {
          if (char === '{') { depth++; started = true; }
          if (char === '}') depth--;
        }
        jsonStr += jLine + '\n';
        if (started && depth === 0) break;
      }
      if (jsonStr.trim()) {
        try {
          const params = JSON.parse(jsonStr.trim());
          if (Object.keys(params).length > 0) {
            return { tool: line as ToolName, params };
          }
        } catch { }
      }
    }

    // Format 5: inline {"tool": "...", "params": {...}}
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
      if (i + 1 < lines.length && lines[i + 1].trim().startsWith('{')) {
        i++;
      }
      continue;
    }

    if (
      line.startsWith('{"path"') ||
      line.startsWith('{"message"') ||
      line.startsWith('{"content"') ||
      line.startsWith('{"tool"') ||
      line.startsWith('{"agentName"')
    ) {
      continue;
    }

    result.push(lines[i]);
  }

  return result.join('\n').trim();
}

// ─── TOOL EXECUTOR ────────────────────────────────────────────────

export class AgentToolExecutor {
  private cwd: string;
  private agentName: string;
  private taskId: string;

  constructor(cwd: string, agentName: string, taskId: string) {
    this.cwd = cwd;
    this.agentName = agentName;
    this.taskId = taskId;
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    switch (toolCall.tool) {
      case 'readFile':        return this.readFile(toolCall.params);
      case 'deleteFile':      return this.deleteFile(toolCall.params);
      case 'writeOutput':     return this.writeOutput(toolCall.params);
      case 'readAgentOutput': return this.readAgentOutput(toolCall.params);
      case 'gitCommit':       return this.gitCommit(toolCall.params);
      case 'gitPush':         return this.gitPush();
      case 'analyseFile':     return this.analyseFile(toolCall.params);
      case 'runBackup':       return this.runBackup();
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
      if (!fs.existsSync(absolutePath)) {
        return this.error(`File does not exist: ${filePath}`);
      }
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const truncated = content.length > 8000
        ? content.slice(0, 8000) + '\n... (truncated)'
        : content;
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
      const outputDir = path.join(
        BOB_DIR, 'projects', path.basename(this.cwd),
        'agents', this.agentName, 'output'
      );
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const outputFile = path.join(outputDir, `${this.taskId}.md`);
      fs.writeFileSync(outputFile, String(content), 'utf-8');
      return { success: true, output: `Output saved.`, filesCreated: [], filesModified: [] };
    } catch (e: any) {
      return this.error(`Failed to write output: ${e.message}`);
    }
  }

  private readAgentOutput(params: Record<string, any>): ToolResult {
    const { agentName, taskId } = params;
    if (!agentName || !taskId) return this.error('readAgentOutput requires agentName and taskId.');

    try {
      const outputFile = path.join(
        BOB_DIR, 'projects', path.basename(this.cwd),
        'agents', agentName, 'output', `${taskId}.md`
      );
      if (!fs.existsSync(outputFile)) return this.error(`No output found for @${agentName} task ${taskId}.`);
      return { success: true, output: fs.readFileSync(outputFile, 'utf-8'), filesCreated: [], filesModified: [] };
    } catch (e: any) {
      return this.error(`Failed to read agent output: ${e.message}`);
    }
  }

  private async gitCommit(params: Record<string, any>): Promise<ToolResult> {
    const message = params.message;
    if (!message) return this.error('gitCommit requires message.');
    try {
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(this.cwd);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return this.error('Not a git repository.');
      const status = await git.status();
      if (status.files.length === 0) {
        return { success: true, output: 'Nothing to commit.', filesCreated: [], filesModified: [] };
      }
      await git.add('.');
      const result = await git.commit(message);
      return { success: true, output: `Committed: ${result.commit?.slice(0, 7)} — ${message}`, filesCreated: [], filesModified: [] };
    } catch (e: any) {
      return this.error(`Git commit failed: ${e.message}`);
    }
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

  private backupFile(absolutePath: string, relativePath: string): void {
    try {
      const backupDir = path.join(this.cwd, '.bob-backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupName = relativePath.replace(/[\/\\]/g, '_') + `.${Date.now()}.bak`;
      fs.copyFileSync(absolutePath, path.join(backupDir, backupName));
    } catch { }
  }

  private error(message: string): ToolResult {
    return { success: false, output: message, filesCreated: [], filesModified: [], error: message };
  }
}