import { AgentRegistryEntry } from './agent-store.js';
import {
  loadAgentMessages,
  loadAgentSummary,
} from './agent-store.js';
import { buildLocalContext } from './context-builder.js';
import { loadPersonaPrompt } from '../ai/personas/persona-loader.js';
import { STANDARD_STYLE_PROMPT } from '../ai/persona.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const BOB_DIR = path.join(os.homedir(), '.bob');

interface AgentProjectConfig {
  protectedFiles: string[];
  priorityFiles: string[];
}

function loadAgentProjectConfig(cwd: string): AgentProjectConfig {
  const projectName = path.basename(cwd);
  const configPath = path.join(
    BOB_DIR, 'projects', projectName, 'agents', 'agent-config.json'
  );
  if (!fs.existsSync(configPath)) return { protectedFiles: [], priorityFiles: [] };
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return { protectedFiles: [], priorityFiles: [] };
  }
}

export function buildAgentSystemPrompt(
  agent: AgentRegistryEntry,
  projectContext: string,
  allAgents: AgentRegistryEntry[],
  cwd?: string
): string {
  const otherAgents = allAgents
    .filter(a => a.name !== agent.name)
    .map(a => `@${a.name}: ${a.task}`)
    .join('\n');

  const personaPrompt = agent.personaId
    ? loadPersonaPrompt(agent.personaId)
    : null;

  const agentConfig = cwd ? loadAgentProjectConfig(cwd) : null;
  const protectedBlock = agentConfig?.protectedFiles.length
    ? `\nPROTECTED FILES — never modify these:\n${agentConfig.protectedFiles.map(f => `  - ${f}`).join('\n')}\n`
    : '';
  const priorityBlock = agentConfig?.priorityFiles.length
    ? `\nPRIORITY FILES — read these first:\n${agentConfig.priorityFiles.map(f => `  - ${f}`).join('\n')}\n`
    : '';

  // ─── Use the EXACT proven prompt from chat mode ───────────────
  // STANDARD_STYLE_PROMPT is what makes bob chat write // File: headers
  // reliably every time. We start with it verbatim — no modifications.
  return `${STANDARD_STYLE_PROMPT}
${personaPrompt ? `\n${personaPrompt}\n` : ''}
You are @${agent.name} — an autonomous AI agent on a software engineering team.

YOUR ASSIGNED TASK:
${agent.task}

YOUR TEAM:
${otherAgents || 'No other agents currently active.'}

AGENT RULES:
- Speak in first person as @${agent.name}.
- Stay focused on your assigned task.
- Reference teammates as @name when relevant.
- For review/audit tasks: write your findings as a writeOutput action — do not keep reading files indefinitely.
${personaPrompt ? `- Your persona shapes your instincts. Embody it naturally.` : ''}
${protectedBlock}${priorityBlock}
${projectContext ? `PROJECT CONTEXT:\n${projectContext}` : ''}`;
}

export function buildCrossAgentContext(
  targetAgentName: string,
  allAgents: AgentRegistryEntry[],
  cwd: string
): string {
  const contextParts: string[] = [];

  for (const agent of allAgents) {
    if (agent.name === targetAgentName) continue;

    const summary = loadAgentSummary(agent.name, cwd);
    const messages = loadAgentMessages(agent.name, cwd);
    const lastFive = messages.slice(-5);

    if (!summary && lastFive.length === 0) continue;

    contextParts.push(`### Context from @${agent.name} ###`);
    contextParts.push(`Task: ${agent.task}`);

    if (summary) {
      contextParts.push(`Current State:\n${summary}`);
    } else if (lastFive.length > 0) {
      contextParts.push('Recent messages:');
      for (const msg of lastFive) {
        contextParts.push(`  ${msg.sender}: ${msg.content.slice(0, 200)}`);
      }
    }

    contextParts.push('');
  }

  return contextParts.join('\n');
}

export function assembleAgentContext(
  projectContext: string,
  relevantFiles: string,
  crossAgentContext: string
): string {
  let fullContext = projectContext;
  if (relevantFiles) fullContext += `\n\n## RELEVANT FILES ##\n${relevantFiles}`;
  if (crossAgentContext) fullContext += `\n\n## TEAM CONTEXT ##\n${crossAgentContext}`;
  return fullContext;
}

export function shouldAutoSummarize(messageCount: number): boolean {
  return messageCount > 0 && messageCount % 10 === 0;
}