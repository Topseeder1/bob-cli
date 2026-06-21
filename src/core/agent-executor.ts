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

// ─── NORMALIZE FILE BLOCKS ────────────────────────────────────────

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

  emit('thinking', `@${agent.name} working on: ${task.instruction.slice(0, 60)}...`);

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

    // ─── 5. Conversation history ───────────────────────────────
    const agentMessages = loadAgentMessages(agent.name, cwd);
    const history: LocalChatMessage[] = agentMessages.slice(-20).map(msg => ({
      role: msg.sender === 'agent' ? 'assistant' as const : 'user' as const,
      content: msg.content,
    }));

    // ─── 6. Persona ────────────────────────────────────────────
    const personaPrompt = agent.personaId
      ? loadPersonaPrompt(agent.personaId)
      : null;

    const otherAgents = allAgents
      .filter(a => a.name !== agent.name)
      .map(a => `@${a.name}: ${a.task}`)
      .join('\n');

    // ─── 7. System = STANDARD_STYLE_PROMPT only ────────────────
    const systemMessage = STANDARD_STYLE_PROMPT;

    // ─── 8. User turn ─────────────────────────────────────────
    const directorNotes = task.notes.length > 0
      ? `\nDIRECTOR NOTES:\n${task.notes.slice(-2).join('\n')}`
      : '';

    const userTurn = `You are @${agent.name} — an autonomous AI agent.
${personaPrompt ? `\nYOUR PERSONA:\n${personaPrompt}\n` : ''}
YOUR SPECIALTY: ${agent.task}

YOUR TEAM:
${otherAgents || 'No other agents currently active.'}

AGENT RULES:
- Speak and act as @${agent.name}.
- Stay focused on your assigned task.
- Reference teammates as @name when relevant.
- For review/audit tasks: write your findings using writeOutput.
- Make SURGICAL changes to existing files — preserve all existing functionality.
- Never gut or rewrite a file when a small change is needed.

${fullContext ? `--- PROJECT CONTEXT ---\n${fullContext}\n--- END CONTEXT ---\n` : ''}

${AGENT_TOOLS_PROMPT}

CURRENT TASK:
Task ID: ${task.id}
Instruction: ${task.instruction}
Attempt: ${task.attemptCount + 1}
Satisfaction Target: ${task.satisfactionTarget}%
${task.attemptCount > 0 ? `Previous score: ${task.lastSatisfactionScore}% — not done yet. Keep working.` : ''}${directorNotes}

Execute this task now: ${task.instruction}`;

    const messages: LocalChatMessage[] = [
      { role: 'system', content: systemMessage },
      ...history,
      { role: 'user', content: userTurn },
    ];

    // ─── 9. Call local model ───────────────────────────────────
    const rawResponse = await callLocalModel(localEndpoint, messages);
    const fullResponse =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    // ─── 10. Normalize bare // File: blocks ───────────────────
    const normalizedResponse = normalizeFileBlocks(fullResponse);

    let allFilesCreated: string[] = [];
    let allFilesModified: string[] = [];
    let allFilesWithBackups: Array<{
      filePath: string;
      backupPath: string | null;
      isNew: boolean;
    }> = [];
    let toolResult: ToolResult | null = null;

    // ─── 11. Extract and write file proposals ──────────────────
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

    // Auto-approve all file writes
    await processAllProposedFiles(normalizedResponse, true);

    if (allFilesCreated.length > 0 || allFilesModified.length > 0) {
      emit(
        'tool_result',
        `✅ Written: ${[...allFilesCreated, ...allFilesModified].join(', ')}`,
        { success: true, filesCreated: allFilesCreated, filesModified: allFilesModified }
      );
    }

    // ─── 12. Parse non-file action tools ──────────────────────
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

    // ─── 13. Clean response for display ───────────────────────
    const cleanResponse = stripToolCall(fullResponse).trim();
    emit('response', cleanResponse);

    // ─── 14. Persist full raw response ────────────────────────
    const now = new Date().toISOString();
    saveAgentMessage(agent.name, { sender: 'user', content: userTurn, timestamp: now }, cwd);
    saveAgentMessage(
      agent.name,
      {
        sender: 'agent',
        content: fullResponse,
        timestamp: now,
      },
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

    // ─── 16. Evaluate satisfaction ─────────────────────────────
    const filesWritten = allFilesCreated.length + allFilesModified.length;
    const satisfactionInput = [
      cleanResponse,
      filesWritten > 0
        ? `Files written: ${[...allFilesCreated, ...allFilesModified].join(', ')}`
        : '',
      toolResult?.success
        ? `Tool: ${toolCall?.tool} — ${toolResult.output.slice(0, 200)}`
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

    // ─── 17. Return with accumulated file arrays ───────────────
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