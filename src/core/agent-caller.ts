// File: src/core/agent-caller.ts

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
  buildAgentSystemPrompt,
  buildCrossAgentContext,
  assembleAgentContext,
  shouldAutoSummarize,
} from './agent-context.js';
import { autoSummarizeAgent } from './agent-summarizer.js';

export interface AgentCallResult {
  response: string;
  agentName: string;
  messageCount: number;
  shouldSummarize: boolean;
  summaryGenerated: boolean;
  summary: string | null;
}

export async function callAgent(
  agentName: string,
  userMessage: string,
  allAgents: AgentRegistryEntry[],
  cwd: string,
  localEndpoint: string
): Promise<AgentCallResult> {
  const agent = allAgents.find(a => a.name === agentName);
  if (!agent) {
    throw new Error(`Agent "@${agentName}" not found.`);
  }

  // ─── 1. Project context ───────────────────────────────────────
  const projectContext = buildLocalContext(cwd);

  // ─── 2. Two-step file retrieval ───────────────────────────────
  let relevantFiles = '';
  try {
    const retrieval = await getRelevantFileContents(
      `${agent.task}\n\n${userMessage}`,
      localEndpoint
    );
    relevantFiles = retrieval.fileContents;
  } catch {
    // Non-fatal
  }

  // ─── 3. Cross-agent context ───────────────────────────────────
  const crossAgentContext = buildCrossAgentContext(
    agentName,
    allAgents,
    cwd
  );

  // ─── 4. Assemble full context ─────────────────────────────────
  const fullContext = assembleAgentContext(
    projectContext,
    relevantFiles,
    crossAgentContext
  );

  // ─── 5. Load conversation history ────────────────────────────
  const agentMessages = loadAgentMessages(agentName, cwd);
  const history: LocalChatMessage[] = agentMessages.map(msg => ({
    role: msg.sender === 'agent' ? 'assistant' as const : 'user' as const,
    content: msg.content,
  }));

  // ─── 6. Build system prompt ───────────────────────────────────
  const systemPrompt = buildAgentSystemPrompt(
    agent,
    fullContext,
    allAgents
  );

  // ─── 7. Call local model ──────────────────────────────────────
  const messages: LocalChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const rawResponse = await callLocalModel(localEndpoint, messages);
  const responseText =
    typeof rawResponse === 'object' && rawResponse.text
      ? rawResponse.text
      : (rawResponse as unknown as string);

  // ─── 8. Persist messages ──────────────────────────────────────
  const now = new Date().toISOString();
  saveAgentMessage(
    agentName,
    { sender: 'user', content: userMessage, timestamp: now },
    cwd
  );
  saveAgentMessage(
    agentName,
    { sender: 'agent', content: responseText, timestamp: now },
    cwd
  );

  const newMessageCount = agentMessages.length + 2;
  const triggerSummarize = shouldAutoSummarize(newMessageCount);

  // ─── 9. Auto-summarize if threshold reached ───────────────────
  let summaryGenerated = false;
  let summary: string | null = null;

  if (triggerSummarize) {
    summary = await autoSummarizeAgent(
      agentName,
      agent,
      allAgents,
      cwd,
      localEndpoint
    );
    summaryGenerated = summary !== null;
  }

  return {
    response: responseText,
    agentName,
    messageCount: newMessageCount,
    shouldSummarize: triggerSummarize,
    summaryGenerated,
    summary,
  };
}