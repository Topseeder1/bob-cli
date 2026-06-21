// File: src/core/agent-summarizer.ts

import { LocalChatMessage } from '../ai/providers/local.js';
import { callLocalModel } from '../ai/providers/local.js';
import {
  loadAgentMessages,
  saveAgentSummary,
  loadAgentSummary,
  AgentRegistryEntry,
} from './agent-store.js';

/**
 * Auto-summarizes an agent's conversation history every 10 messages.
 * Triggered by the shouldSummarize signal from agent-caller.ts.
 *
 * The summary is:
 * - 3-5 bullet points covering key decisions, current status, blockers
 * - Saved to agents/{name}/summary.txt
 * - Injected into cross-agent context for all other agents
 * - Used by DirectorBob in Phase 4 to understand team state
 */
export async function autoSummarizeAgent(
  agentName: string,
  agent: AgentRegistryEntry,
  allAgents: AgentRegistryEntry[],
  cwd: string,
  localEndpoint: string
): Promise<string | null> {
  const messages = loadAgentMessages(agentName, cwd);

  if (messages.length === 0) return null;

  // ─── Build conversation text for summarization ────────────────
  const conversationText = messages
    .slice(-30) // Last 30 messages — enough context without overwhelming
    .map(msg => {
      const label = msg.sender === 'agent'
        ? `@${agentName}`
        : msg.sender === 'user'
        ? 'User'
        : 'System';
      return `[${label}]: ${msg.content}`;
    })
    .join('\n\n');

  // ─── Previous summary for continuity ─────────────────────────
  const previousSummary = loadAgentSummary(agentName, cwd);

  const otherAgents = allAgents
    .filter(a => a.name !== agentName)
    .map(a => `@${a.name}: ${a.task}`)
    .join('\n');

  const prompt = `You are analyzing the work session of @${agentName}, an autonomous AI agent.

AGENT TASK:
${agent.task}

TEAM CONTEXT:
${otherAgents || 'No other agents.'}

${previousSummary ? `PREVIOUS SUMMARY:\n${previousSummary}\n` : ''}

RECENT CONVERSATION:
${conversationText}

Generate a concise summary of this agent's current state. Return ONLY a plain text summary with NO markdown formatting. Use exactly this structure:

STATUS: one sentence on what the agent is currently doing
DECISIONS: key decisions or recommendations made (one per line, start each with -)
PROGRESS: what has been completed so far (one per line, start each with -)
BLOCKERS: anything blocking progress or unresolved questions (one per line, start each with -, or "None" if clear)
NEXT: what the agent plans to do next

Keep each section tight — 1-3 lines maximum per section.`;

  try {
    const messages: LocalChatMessage[] = [
      {
        role: 'system',
        content: 'You are summarizing an AI agent session. Return ONLY plain text. No markdown. No headers with #. No bold. No code fences. Follow the exact structure provided.',
      },
      { role: 'user', content: prompt },
    ];

    const rawResponse = await callLocalModel(localEndpoint, messages);
    const summary =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    const cleanSummary = summary.trim();

    // Persist
    saveAgentSummary(agentName, cleanSummary, cwd);

    return cleanSummary;

  } catch (error: any) {
    // Non-fatal — summarization failure should never block the agent
    console.error(`[AGENT_SUMMARIZER] Failed to summarize @${agentName}: ${error.message}`);
    return null;
  }
}

/**
 * Generates a one-sentence status line for DirectorBob's awareness.
 * Faster than a full summary — used for real-time monitoring.
 */
export async function generateAgentStatusLine(
  agentName: string,
  agent: AgentRegistryEntry,
  cwd: string,
  localEndpoint: string
): Promise<string> {
  const messages = loadAgentMessages(agentName, cwd);
  const lastFew = messages.slice(-4);

  if (lastFew.length === 0) {
    return `@${agentName} has not started work yet.`;
  }

  const recentText = lastFew
    .map(msg => {
      const label = msg.sender === 'agent' ? `@${agentName}` : 'User';
      return `${label}: ${msg.content.slice(0, 150)}`;
    })
    .join('\n');

  const prompt = `Based on this recent exchange, write ONE sentence describing what @${agentName} is currently doing or has just completed. No markdown. Plain text only.\n\n${recentText}`;

  try {
    const aiMessages: LocalChatMessage[] = [
      { role: 'system', content: 'Write one plain text sentence. No markdown.' },
      { role: 'user', content: prompt },
    ];

    const rawResponse = await callLocalModel(localEndpoint, aiMessages);
    const statusLine =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    return statusLine.trim().split('\n')[0]; // First line only

  } catch {
    const summary = loadAgentSummary(agentName, cwd);
    if (summary) {
      const statusLine = summary.split('\n').find(l =>
        l.toLowerCase().startsWith('status:')
      );
      if (statusLine) return statusLine.replace(/^status:\s*/i, '').trim();
    }
    return `@${agentName} is working on: ${agent.task.slice(0, 80)}`;
  }
}

/**
 * Generates summaries for ALL agents in the registry.
 * Used by DirectorBob in Phase 4 to get full team awareness
 * before building the task map.
 */
export async function summarizeAllAgents(
  agents: AgentRegistryEntry[],
  cwd: string,
  localEndpoint: string,
  onProgress?: (agentName: string) => void
): Promise<Record<string, string>> {
  const summaries: Record<string, string> = {};

  for (const agent of agents) {
    if (onProgress) onProgress(agent.name);

    const messages = loadAgentMessages(agent.name, cwd);
    if (messages.length === 0) {
      // No messages yet — use task description as placeholder summary
      summaries[agent.name] = `STATUS: Not started yet.\nDECISIONS: None\nPROGRESS: None\nBLOCKERS: None\nNEXT: ${agent.task}`;
      continue;
    }

    const summary = await autoSummarizeAgent(
      agent.name,
      agent,
      agents,
      cwd,
      localEndpoint
    );

    summaries[agent.name] = summary || `STATUS: Working on ${agent.task}`;
  }

  return summaries;
}