// File: src/core/agent-executor.ts

import { LocalChatMessage } from '../ai/providers/local.js';
import { callLocalModel } from '../ai/providers/local.js';
import { getRelevantFileContents } from './file-retrieval.js';
import { buildLocalContext } from './context-builder.js';
import {
  loadAgentMessages,
  saveAgentMessage,
  AgentRegistryEntry,
} from './agent-store.js';
import {
  buildCrossAgentContext,
  assembleAgentContext,
} from './agent-context.js';
import {
  AgentTask,
  AgentMission,
  OperationType,
  updateTaskResult,
  saveMission,
} from './agent-queue.js';
import {
  evaluateSatisfaction,
  applySatisfactionResult,
  SatisfactionResult,
} from './agent-satisfaction.js';
import {
  AGENT_TOOLS_PROMPT,
  parseToolCall,
  stripToolCall,
  AgentToolExecutor,
  ToolResult,
  ToolCall,
} from './agent-tools.js';
import {
  processAllProposedFiles,
  extractAllProposedFiles,
} from './file-writer.js';
import { renderFileDiff } from '../ui/chat-renderer.js';
import { STANDARD_STYLE_PROMPT } from '../ai/persona.js';
import { loadPersonaPrompt } from '../ai/personas/persona-loader.js';
import * as path from 'path';
import * as fs from 'fs';

// ─── INTERFACES ───────────────────────────────────────────────────

export interface TaskExecutionResult {
  taskId: string;
  agentName: string;
  response: string;
  toolResult: ToolResult | null;
  satisfaction: SatisfactionResult;
  isDone: boolean;
  isStagnating: boolean;
  needsDirector: boolean;
  needsUser: boolean;
  filesCreated: string[];
  filesModified: string[];
}

export type ExecutionEventType =
  | 'thinking'
  | 'response'
  | 'tool_call'
  | 'tool_result'
  | 'satisfaction'
  | 'done'
  | 'stagnating'
  | 'error';

export interface ExecutionEvent {
  type: ExecutionEventType;
  agentName: string;
  taskId: string;
  message: string;
  data?: any;
}

// ─── STRUCTURED AGENT RESPONSE ────────────────────────────────────

interface AgentFileOutput {
  path: string;
  operation: OperationType;
  content: string;
}

interface StructuredAgentResponse {
  thinking: string;
  files: AgentFileOutput[];
  toolCall: ToolCall | null;
  message: string;
}

// ─── JSON RESPONSE FORMAT SPEC ────────────────────────────────────

const STRUCTURED_RESPONSE_SPEC = `
RESPONSE FORMAT — you MUST respond with ONLY valid JSON matching this schema:
{
  "thinking": "<your internal reasoning about how to approach this task — 1-3 sentences>",
  "files": [
    {
      "path": "<relative file path e.g. lib/utils/string_utils.dart>",
      "operation": "CREATE" | "PATCH" | "REFACTOR" | "REPLACE",
      "content": "<the COMPLETE file content as a string>"
    }
  ],
  "toolCall": null | { "tool": "<toolName>", "params": { <params> } },
  "message": "<brief summary of what you did — 1-2 sentences>"
}

RULES:
- Respond with ONLY the JSON object. No markdown. No explanation before or after.
- "files" array can contain 0 or more file entries.
- "content" must be the COMPLETE file content — not a diff, not a snippet.
- "toolCall" is null unless you need to invoke an action tool.
- If a package import is missing, use toolCall with runCommand to install it first, then write the file on your next attempt.
- If you need to readFile before making changes, set toolCall to readFile and leave files empty.
- "thinking" is for your reasoning — it will NOT be written to any file.
- "message" is shown to the user — keep it concise.
`;

// ─── PUBSPEC READER ───────────────────────────────────────────────

/**
 * Reads pubspec.yaml if present and extracts package name + dependencies.
 * Gives agents awareness of what packages are actually available.
 */
function readPubspec(cwd: string): string {
  const pubspecPath = path.join(cwd, 'pubspec.yaml');
  if (!fs.existsSync(pubspecPath)) return '';
  try {
    const content = fs.readFileSync(pubspecPath, 'utf-8');
    // Extract just the relevant parts — name + dependencies sections
    const lines = content.split('\n');
    const relevant: string[] = [];
    let inDeps = false;
    for (const line of lines) {
      if (line.startsWith('name:') || line.startsWith('description:')) {
        relevant.push(line);
      }
      if (line.startsWith('dependencies:') || line.startsWith('dev_dependencies:')) {
        inDeps = true;
        relevant.push(line);
        continue;
      }
      if (inDeps && (line.startsWith('  ') || line.trim() === '')) {
        relevant.push(line);
        continue;
      }
      if (inDeps && !line.startsWith(' ')) {
        inDeps = false;
      }
    }
    return relevant.join('\n').trim();
  } catch {
    return '';
  }
}

// ─── PACKAGE.JSON READER ──────────────────────────────────────────

/**
 * Reads package.json if present and extracts name + dependencies.
 * Gives agents awareness of installed npm packages.
 */
function readPackageJson(cwd: string): string {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return '';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const lines: string[] = [];
    if (pkg.name) lines.push(`name: ${pkg.name}`);
    if (pkg.dependencies) {
      lines.push('dependencies:');
      for (const dep of Object.keys(pkg.dependencies).slice(0, 20)) {
        lines.push(`  ${dep}: ${pkg.dependencies[dep]}`);
      }
    }
    if (pkg.devDependencies) {
      lines.push('devDependencies:');
      for (const dep of Object.keys(pkg.devDependencies).slice(0, 10)) {
        lines.push(`  ${dep}: ${pkg.devDependencies[dep]}`);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * Reads the project's dependency manifest — pubspec.yaml, package.json,
 * requirements.txt, etc. Returns a formatted string for injection into
 * agent context so agents know what packages are actually available.
 */
function readProjectDependencies(cwd: string): string {
  const pubspec = readPubspec(cwd);
  if (pubspec) return `PUBSPEC.YAML:\n${pubspec}`;

  const pkg = readPackageJson(cwd);
  if (pkg) return `PACKAGE.JSON:\n${pkg}`;

  const requirements = path.join(cwd, 'requirements.txt');
  if (fs.existsSync(requirements)) {
    try {
      const content = fs.readFileSync(requirements, 'utf-8');
      return `REQUIREMENTS.TXT:\n${content.slice(0, 500)}`;
    } catch { }
  }

  return '';
}

// ─── JSON RESPONSE PARSER ─────────────────────────────────────────

function parseStructuredResponse(rawResponse: string): StructuredAgentResponse | null {
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
      if (depth === 0) {
        lastBrace = i;
        break;
      }
    }
  }

  if (lastBrace === -1) return null;

  const candidate = jsonStr.slice(firstBrace, lastBrace + 1);

  try {
    const parsed = JSON.parse(candidate);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const response: StructuredAgentResponse = {
      thinking: typeof parsed.thinking === 'string' ? parsed.thinking : '',
      files: [],
      toolCall: null,
      message: typeof parsed.message === 'string' ? parsed.message : '',
    };

    if (Array.isArray(parsed.files)) {
      for (const file of parsed.files) {
        if (
          typeof file === 'object' && file !== null &&
          typeof file.path === 'string' && file.path.trim() &&
          typeof file.content === 'string'
        ) {
          const op: OperationType =
            ['CREATE', 'PATCH', 'REFACTOR', 'REPLACE'].includes(file.operation)
              ? file.operation
              : 'CREATE';

          response.files.push({
            path: file.path.trim(),
            operation: op,
            content: file.content,
          });
        }
      }
    }

    if (
      parsed.toolCall &&
      typeof parsed.toolCall === 'object' &&
      typeof parsed.toolCall.tool === 'string'
    ) {
      response.toolCall = {
        tool: parsed.toolCall.tool,
        params: parsed.toolCall.params || {},
      };
    }

    return response;
  } catch {
    return null;
  }
}

// ─── BACKUP FINDER ────────────────────────────────────────────────

function findMostRecentBackup(filePath: string, cwd: string): string | null {
  const backupDir = path.join(cwd, '.bob-backups');
  if (!fs.existsSync(backupDir)) return null;
  const safeName = filePath.replace(/[\/\\]/g, '_');
  try {
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(safeName) && f.endsWith('.bak'))
      .sort()
      .reverse();
    if (backups.length === 0) return null;
    return path.join(backupDir, backups[0]);
  } catch {
    return null;
  }
}

// ─── LEGACY NORMALIZE (fallback only) ─────────────────────────────

function normalizeFileBlocks(response: string): string {
  if (response.match(/```[\w]*\n\/\/ File:/)) return response;

  if (response.includes('// File:')) {
    const parts = response.split(/(\/\/ File: [^\n]+\n)/);
    let result = '';
    let i = 0;

    while (i < parts.length) {
      const part = parts[i];
      if (part.match(/^\/\/ File: [^\n]+\n$/)) {
        const fileHeader = part;
        const fileContent = parts[i + 1] || '';
        i += 2;
        result += '```typescript\n' + fileHeader + fileContent.trimEnd() + '\n```\n';
      } else {
        result += part;
        i++;
      }
    }

    return result;
  }

  return response;
}

// ─── OPERATION-AWARE CONTEXT BUILDER ──────────────────────────────

function buildOperationContext(
  task: AgentTask,
  cwd: string
): string {
  const op = task.operationType;

  const filePathMatch = task.instruction.match(
    /(?:in|to|for|update|modify|patch|add to|refactor)\s+([\w\-\.\/\\]+\.\w+)/i
  ) || task.instruction.match(/(src\/[\w\-\.\/\\]+\.\w+|lib\/[\w\-\.\/\\]+\.\w+)/);

  const mentionedFile = filePathMatch ? filePathMatch[1] : null;
  const absolutePath = mentionedFile ? path.join(cwd, mentionedFile) : null;
  const fileExists = absolutePath ? fs.existsSync(absolutePath) : false;

  if (op === 'CREATE' || !fileExists || !mentionedFile) {
    return `OPERATION: CREATE — write a new file with the complete implementation.`;
  }

  let currentContent = '';
  try {
    currentContent = fs.readFileSync(absolutePath!, 'utf-8');
  } catch {
    return `OPERATION: ${op} — could not read existing file. Use readFile tool first.`;
  }

  const lineCount = currentContent.split('\n').length;

  if (op === 'PATCH') {
    return `OPERATION: PATCH — make a TARGETED change to a specific section only.

CURRENT FILE: ${mentionedFile} (${lineCount} lines)
\`\`\`
${currentContent}
\`\`\`

PATCH RULES (MANDATORY):
1. In your "files" array, output the COMPLETE file with ONLY your targeted change applied.
2. PRESERVE every import — do not add, remove, or reorder imports unless the task explicitly requires it.
3. PRESERVE every export — every function/class that is currently exported must remain exported.
4. PRESERVE all existing logic — only touch the specific section the task describes.
5. If you are unsure where to make the change, set toolCall to readFile and leave files empty.
6. The output file must be at least ${Math.floor(lineCount * 0.85)} lines (85% of original ${lineCount} lines).`;
  }

  if (op === 'REFACTOR') {
    return `OPERATION: REFACTOR — restructure the file while preserving its contract.

CURRENT FILE: ${mentionedFile} (${lineCount} lines)
\`\`\`
${currentContent}
\`\`\`

REFACTOR RULES (MANDATORY):
1. In your "files" array, output the COMPLETE refactored file.
2. PRESERVE every export — the public API of this file must not change.
3. PRESERVE all import references that other files depend on.
4. You may reorganize internals but must not remove functionality.
5. The output file must be at least ${Math.floor(lineCount * 0.7)} lines (70% of original ${lineCount} lines).`;
  }

  if (op === 'REPLACE') {
    return `OPERATION: REPLACE — full rewrite of this file is explicitly authorized.

CURRENT FILE: ${mentionedFile} (${lineCount} lines)
\`\`\`
${currentContent.slice(0, 2000)}${currentContent.length > 2000 ? '\n... (truncated for context)' : ''}
\`\`\`

Write the complete replacement file in your "files" array. Preserve the same exports so dependents don't break.`;
  }

  return `OPERATION: ${op}`;
}

// ─── FILE EXISTENCE VALIDATOR ─────────────────────────────────────

/**
 * After a CREATE task completes with high satisfaction,
 * verify the file actually exists on disk.
 *
 * Ghost completions happen when the agent reports success in its
 * "message" field but the "files" array was empty or had wrong paths.
 * This catches that and forces a retry by returning score 0.
 */
function validateCreateTaskFiles(
  task: AgentTask,
  filesCreated: string[],
  cwd: string
): { valid: boolean; missingFiles: string[] } {
  if (task.operationType !== 'CREATE') return { valid: true, missingFiles: [] };

  // Extract expected file paths from the task instruction
  const filePathMatches = task.instruction.match(
    /(?:lib|src|test)\/[\w\-\.\/\\]+\.\w+/g
  ) || [];

  const missingFiles: string[] = [];

  for (const expectedPath of filePathMatches) {
    const absolutePath = path.join(cwd, expectedPath);
    const wasCreated = filesCreated.some(f =>
      f.toLowerCase() === expectedPath.toLowerCase() ||
      path.join(cwd, f).toLowerCase() === absolutePath.toLowerCase()
    );

    if (!wasCreated || !fs.existsSync(absolutePath)) {
      missingFiles.push(expectedPath);
    }
  }

  return {
    valid: missingFiles.length === 0,
    missingFiles,
  };
}

// ─── WRITE FILE TO DISK ───────────────────────────────────────────

function writeFileToDisk(
  filePath: string,
  content: string,
  cwd: string
): { success: boolean; isNew: boolean; backupPath: string | null } {
  const absolutePath = path.join(cwd, filePath);
  const isNew = !fs.existsSync(absolutePath);
  let backupPath: string | null = null;

  try {
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!isNew) {
      const backupDir = path.join(cwd, '.bob-backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const safeName = filePath.replace(/[\/\\]/g, '_');
      const backupName = `${safeName}.${Date.now()}.bak`;
      backupPath = path.join(backupDir, backupName);
      fs.copyFileSync(absolutePath, backupPath);
    }

    fs.writeFileSync(absolutePath, content, 'utf-8');
    return { success: true, isNew, backupPath };
  } catch {
    return { success: false, isNew, backupPath: null };
  }
}

// ─── MAIN EXECUTOR ────────────────────────────────────────────────

export async function executeTaskAttempt(
  task: AgentTask,
  agent: AgentRegistryEntry,
  allAgents: AgentRegistryEntry[],
  mission: AgentMission,
  cwd: string,
  localEndpoint: string,
  onEvent?: (event: ExecutionEvent) => void
): Promise<TaskExecutionResult> {

  const emit = (type: ExecutionEventType, message: string, data?: any) => {
    if (onEvent) onEvent({ type, agentName: agent.name, taskId: task.id, message, data });
  };

  emit('thinking', `@${agent.name} [${task.operationType}] working on: ${task.instruction.slice(0, 60)}...`);

  try {
    // ─── 1. Project context ────────────────────────────────────
    const projectContext = buildLocalContext(cwd);

    // ─── 2. Two-step RAG retrieval ─────────────────────────────
    let relevantFiles = '';
    try {
      const retrieval = await getRelevantFileContents(
        `${agent.task}\n\n${task.instruction}`,
        localEndpoint
      );
      relevantFiles = retrieval.fileContents;
    } catch { }

    // ─── 3. Cross-agent context ────────────────────────────────
    const crossAgentContext = buildCrossAgentContext(agent.name, allAgents, cwd);

    // ─── 4. Full context ───────────────────────────────────────
    const fullContext = assembleAgentContext(projectContext, relevantFiles, crossAgentContext);

    // ─── 5. Project dependencies ───────────────────────────────
    const projectDependencies = readProjectDependencies(cwd);

    // ─── 6. Conversation history ───────────────────────────────
    const agentMessages = loadAgentMessages(agent.name, cwd);
    const history: LocalChatMessage[] = agentMessages.slice(-20).map(msg => ({
      role: msg.sender === 'agent' ? 'assistant' as const : 'user' as const,
      content: msg.content,
    }));

    // ─── 7. Persona ────────────────────────────────────────────
    const personaPrompt = agent.personaId
      ? loadPersonaPrompt(agent.personaId)
      : null;

    const otherAgents = allAgents
      .filter(a => a.name !== agent.name)
      .map(a => `@${a.name}: ${a.task}`)
      .join('\n');

    // ─── 8. Operation-aware context ────────────────────────────
    const operationContext = buildOperationContext(task, cwd);

    // ─── 9. System prompt ──────────────────────────────────────
    const systemMessage = `${STANDARD_STYLE_PROMPT}\n\nYou are an autonomous AI agent. You MUST respond with ONLY valid JSON. No markdown wrapping. No text before or after the JSON object.`;

    // ─── 10. User turn ─────────────────────────────────────────
    const directorNotes = task.notes.length > 0
      ? `\nDIRECTOR NOTES:\n${task.notes.slice(-2).join('\n')}`
      : '';

    const userTurn = `You are @${agent.name} — an autonomous AI agent.
${personaPrompt ? `\nYOUR PERSONA:\n${personaPrompt}\n` : ''}
YOUR SPECIALTY: ${agent.task}

YOUR TEAM:
${otherAgents || 'No other agents currently active.'}

${projectDependencies ? `--- PROJECT DEPENDENCIES ---\n${projectDependencies}\nIMPORTANT: Only import packages that are listed above. If you need a package that is NOT listed, use runCommand to install it first.\n--- END DEPENDENCIES ---\n` : ''}

${fullContext ? `--- PROJECT CONTEXT ---\n${fullContext}\n--- END CONTEXT ---\n` : ''}

AVAILABLE TOOLS:
- readFile: { "path": "relative/path" } — read a file before modifying it
- writeOutput: { "content": "findings" } — save audit/review findings
- readAgentOutput: { "agentName": "name", "taskId": "id" } — read another agent's output
- runCommand: { "command": "flutter pub add intl" } — install a missing package (safe commands only)
- gitCommit: { "message": "commit message" } — queue a commit for DirectorBob review
- gitPush: {} — push after commit is approved
- deleteFile: { "path": "relative/path" } — delete a file

--- CURRENT TASK ---
Task ID: ${task.id}
Instruction: ${task.instruction}
Attempt: ${task.attemptCount + 1}
Satisfaction Target: ${task.satisfactionTarget}%
${task.attemptCount > 0 ? `Previous score: ${task.lastSatisfactionScore}% — not done yet. Keep working.` : ''}${directorNotes}

${operationContext}

${STRUCTURED_RESPONSE_SPEC}

Execute this task now. Respond with ONLY the JSON object.`;

    const messages: LocalChatMessage[] = [
      { role: 'system', content: systemMessage },
      ...history,
      { role: 'user', content: userTurn },
    ];

    // ─── 11. Call local model ──────────────────────────────────
    const rawResponse = await callLocalModel(localEndpoint, messages);
    const fullResponse =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    // ─── 12. Parse structured JSON response ───────────────────
    const structured = parseStructuredResponse(fullResponse);

    let allFilesCreated: string[] = [];
    let allFilesModified: string[] = [];
    let allFilesWithBackups: Array<{
      filePath: string;
      backupPath: string | null;
      isNew: boolean;
    }> = [];
    let toolResult: ToolResult | null = null;
    let cleanResponse = '';

    if (structured) {
      // ─── 13A. STRUCTURED PATH ──────────────────────────────
      cleanResponse = structured.message || structured.thinking || '';
      emit('response', cleanResponse);

      // ─── Write files ──────────────────────────────────────
      for (const file of structured.files) {
        const writeResult = writeFileToDisk(file.path, file.content, cwd);

        if (writeResult.success) {
          renderFileDiff(file.path, file.content, writeResult.isNew);

          if (writeResult.isNew) {
            allFilesCreated.push(file.path);
          } else {
            allFilesModified.push(file.path);
          }

          allFilesWithBackups.push({
            filePath: file.path,
            backupPath: writeResult.backupPath,
            isNew: writeResult.isNew,
          });

          emit(
            'tool_call',
            `@${agent.name} ${writeResult.isNew ? 'created' : 'modified'}: ${file.path}`,
            { tool: writeResult.isNew ? 'createFile' : 'modifyFile', params: { path: file.path } }
          );
        }
      }

      if (allFilesCreated.length > 0 || allFilesModified.length > 0) {
        emit(
          'tool_result',
          `✅ Written: ${[...allFilesCreated, ...allFilesModified].join(', ')}`,
          { success: true, filesCreated: allFilesCreated, filesModified: allFilesModified }
        );
      }

      // ─── Execute tool call ────────────────────────────────
      if (structured.toolCall) {
        emit('tool_call', `@${agent.name} using tool: ${structured.toolCall.tool}`, structured.toolCall);

        const executor = new AgentToolExecutor(
          cwd,
          agent.name,
          task.id,
          mission.id,
          allFilesWithBackups
        );

        toolResult = await executor.execute(structured.toolCall);
        emit(
          'tool_result',
          toolResult.success
            ? `✅ ${structured.toolCall.tool}: ${toolResult.output.slice(0, 80)}`
            : `❌ ${structured.toolCall.tool} failed: ${toolResult.error}`,
          toolResult
        );
      }

    } else {
      // ─── 13B. FALLBACK PATH ────────────────────────────────
      emit('thinking', `@${agent.name} response was not valid JSON — using fallback parser.`);

      const normalizedResponse = normalizeFileBlocks(fullResponse);
      const proposals = extractAllProposedFiles(normalizedResponse);

      for (const proposed of proposals) {
        if (!proposed.isLocal) continue;

        renderFileDiff(proposed.filePath, proposed.content, proposed.isNew);

        const backupPath = proposed.isNew
          ? null
          : findMostRecentBackup(proposed.filePath, cwd);

        if (proposed.isNew) {
          allFilesCreated.push(proposed.filePath);
        } else {
          allFilesModified.push(proposed.filePath);
        }

        allFilesWithBackups.push({
          filePath: proposed.filePath,
          backupPath,
          isNew: proposed.isNew,
        });

        emit(
          'tool_call',
          `@${agent.name} using tool: ${proposed.isNew ? 'createFile' : 'modifyFile'}`,
          { tool: proposed.isNew ? 'createFile' : 'modifyFile', params: { path: proposed.filePath } }
        );
      }

      await processAllProposedFiles(normalizedResponse, true);

      if (allFilesCreated.length > 0 || allFilesModified.length > 0) {
        emit(
          'tool_result',
          `✅ Written: ${[...allFilesCreated, ...allFilesModified].join(', ')}`,
          { success: true, filesCreated: allFilesCreated, filesModified: allFilesModified }
        );
      }

      const toolCall = parseToolCall(normalizedResponse);
      if (toolCall) {
        emit('tool_call', `@${agent.name} using tool: ${toolCall.tool}`, toolCall);

        const executor = new AgentToolExecutor(
          cwd,
          agent.name,
          task.id,
          mission.id,
          allFilesWithBackups
        );

        toolResult = await executor.execute(toolCall);
        emit(
          'tool_result',
          toolResult.success
            ? `✅ ${toolCall.tool}: ${toolResult.output.slice(0, 80)}`
            : `❌ ${toolCall.tool} failed: ${toolResult.error}`,
          toolResult
        );
      }

      cleanResponse = stripToolCall(fullResponse).trim();
      emit('response', cleanResponse);
    }

    // ─── 14. Persist messages ──────────────────────────────────
    const now = new Date().toISOString();
    saveAgentMessage(agent.name, { sender: 'user', content: userTurn, timestamp: now }, cwd);
    saveAgentMessage(
      agent.name,
      { sender: 'agent', content: fullResponse, timestamp: now },
      cwd
    );

    // ─── 15. Accumulate files across attempts ──────────────────
    if (allFilesCreated.length > 0 || allFilesModified.length > 0) {
      const currentTask = mission.tasks.find(t => t.id === task.id);
      if (currentTask) {
        currentTask.filesCreated.push(...allFilesCreated);
        currentTask.filesModified.push(...allFilesModified);
        saveMission(mission, cwd);
      }
    }

    // ─── 16. File existence validation for CREATE tasks ────────
    // Catches ghost completions — agent claims success but file
    // was never actually written to disk.
    const existenceCheck = validateCreateTaskFiles(task, allFilesCreated, cwd);
    if (!existenceCheck.valid) {
      emit(
        'error',
        `@${agent.name} ghost completion detected — expected files not found on disk: ${existenceCheck.missingFiles.join(', ')}. Forcing retry.`
      );

      // Force satisfaction score to 0 — task must retry
      const ghostSatisfaction: SatisfactionResult = {
        score: 0,
        reasoning: `Ghost completion — the following files were expected but not written to disk: ${existenceCheck.missingFiles.join(', ')}. Agent must write the actual files.`,
        isDone: false,
        isStagnating: false,
        needsDirector: false,
        needsUser: false,
      };

      applySatisfactionResult(mission, task.id, ghostSatisfaction, cwd);

      return {
        taskId: task.id,
        agentName: agent.name,
        response: cleanResponse,
        toolResult,
        satisfaction: ghostSatisfaction,
        isDone: false,
        isStagnating: false,
        needsDirector: false,
        needsUser: false,
        filesCreated: allFilesCreated,
        filesModified: allFilesModified,
      };
    }

    // ─── 17. Evaluate satisfaction ─────────────────────────────
    const filesWritten = allFilesCreated.length + allFilesModified.length;
    const satisfactionInput = [
      cleanResponse,
      filesWritten > 0
        ? `Files written: ${[...allFilesCreated, ...allFilesModified].join(', ')}`
        : '',
      toolResult?.success
        ? `Tool: ${structured?.toolCall?.tool || 'unknown'} — ${toolResult.output.slice(0, 200)}`
        : '',
    ].filter(Boolean).join('\n\n');

    const satisfaction = await evaluateSatisfaction(task, satisfactionInput, localEndpoint);

    emit(
      'satisfaction',
      `SAT: ${satisfaction.score}% → target ${task.satisfactionTarget}% — ${
        satisfaction.isDone ? 'DONE' : satisfaction.isStagnating ? 'STAGNATING' : 'working'
      }`,
      satisfaction
    );

    applySatisfactionResult(mission, task.id, satisfaction, cwd);

    if (satisfaction.isDone) {
      emit('done', `@${agent.name} completed: ${task.instruction.slice(0, 50)}`);
    } else if (satisfaction.isStagnating) {
      emit('stagnating', `@${agent.name} stagnating: ${task.instruction.slice(0, 50)}`);
    }

    // ─── 18. Return ────────────────────────────────────────────
    const finalTask = mission.tasks.find(t => t.id === task.id);

    return {
      taskId: task.id,
      agentName: agent.name,
      response: cleanResponse,
      toolResult,
      satisfaction,
      isDone: satisfaction.isDone,
      isStagnating: satisfaction.isStagnating,
      needsDirector: satisfaction.needsDirector,
      needsUser: satisfaction.needsUser,
      filesCreated: finalTask?.filesCreated || allFilesCreated,
      filesModified: finalTask?.filesModified || allFilesModified,
    };

  } catch (error: any) {
    emit('error', `@${agent.name} error: ${error.message}`);
    return {
      taskId: task.id,
      agentName: agent.name,
      response: '',
      toolResult: null,
      satisfaction: {
        score: 0,
        reasoning: `Execution error: ${error.message}`,
        isDone: false,
        isStagnating: false,
        needsDirector: false,
        needsUser: false,
      },
      isDone: false,
      isStagnating: false,
      needsDirector: false,
      needsUser: false,
      filesCreated: [],
      filesModified: [],
    };
  }
}