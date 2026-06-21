// File: src/core/agent-parser.ts

import { AgentRegistryEntry } from './agent-store.js';

export interface ParsedInput {
  type: 'mention' | 'broadcast' | 'slash' | 'unknown';
  targets: string[];
  message: string;
  slash?: string;
  slashArgs?: string[];
}

/**
 * Parses raw hub input into a structured command.
 * Handles @mention, @all broadcast, /slash commands, and unknown input.
 */
export function parseHubInput(
  input: string,
  agents: AgentRegistryEntry[]
): ParsedInput {
  const trimmed = input.trim();
  const agentNames = agents.map(a => a.name.toLowerCase());

  // ─── Slash command ────────────────────────────────────────────
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(' ');
    return {
      type: 'slash',
      targets: [],
      message: trimmed,
      slash: parts[0].toLowerCase(),
      slashArgs: parts.slice(1),
    };
  }

  // ─── @all broadcast ──────────────────────────────────────────
  if (trimmed.toLowerCase().startsWith('@all')) {
    const message = trimmed.slice(4).trim().replace(/^["']|["']$/g, '');
    return {
      type: 'broadcast',
      targets: agents.map(a => a.name),
      message,
    };
  }

  // ─── @mention ─────────────────────────────────────────────────
  const mentionMatch = trimmed.match(/^@(\w+)\s*(.*)/s);
  if (mentionMatch) {
    const name = mentionMatch[1].toLowerCase();
    const message = mentionMatch[2].trim().replace(/^["']|["']$/g, '');
    if (agentNames.includes(name)) {
      const actualName = agents.find(
        a => a.name.toLowerCase() === name
      )!.name;
      return { type: 'mention', targets: [actualName], message };
    }
  }

  return { type: 'unknown', targets: [], message: trimmed };
}