// File: src/core/agent-store.ts

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const BOB_DIR = path.join(os.homedir(), '.bob');

// ─── INTERFACES ──────────────────────────────────────────────────

export interface AgentSession {
  id: string;
  name: string;
  task: string;
  personaId: string | null;
  status: 'active' | 'idle' | 'stopped';
  messageCount: number;
  lastSummary: string | null;
  createdAt: string;
  lastActive: string;
}

export interface AgentRegistry {
  agents: AgentRegistryEntry[];
}

export interface AgentRegistryEntry {
  name: string;
  task: string;
  personaId: string | null;
  status: 'active' | 'idle' | 'stopped';
  createdAt: string;
  lastActive: string;
}

export interface AgentMessage {
  sender: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
}

// ─── NAME RESOLUTION ─────────────────────────────────────────────

/**
 * Resolves a user-provided agent name to a final name.
 * Rules:
 * - Always ends in "Bob" (appended if missing)
 * - If name already exists, auto-increments (architectBob2, architectBob3...)
 */
export function resolveAgentName(input: string, workingDir?: string): string {
  const cwd = workingDir || process.cwd();

  // Ensure ends in "Bob" (case-insensitive check)
  const baseName = input.toLowerCase().endsWith('bob')
    ? input
    : `${input}Bob`;

  // If name doesn't exist yet — use it
  if (!agentExists(baseName, cwd)) return baseName;

  // Auto-increment until we find a free slot
  let counter = 2;
  while (agentExists(`${baseName}${counter}`, cwd)) {
    counter++;
  }
  return `${baseName}${counter}`;
}

// ─── PATHS ───────────────────────────────────────────────────────

export function getAgentsDir(workingDir?: string): string {
  const cwd = workingDir || process.cwd();
  const projectName = path.basename(cwd);
  return path.join(BOB_DIR, 'projects', projectName, 'agents');
}

function getAgentDir(agentName: string, workingDir?: string): string {
  return path.join(getAgentsDir(workingDir), agentName);
}

function getRegistryPath(workingDir?: string): string {
  return path.join(getAgentsDir(workingDir), 'registry.json');
}

function getSessionPath(agentName: string, workingDir?: string): string {
  return path.join(getAgentDir(agentName, workingDir), 'session.json');
}

function getMessagesDir(agentName: string, workingDir?: string): string {
  return path.join(getAgentDir(agentName, workingDir), 'messages');
}

function getSummaryPath(agentName: string, workingDir?: string): string {
  return path.join(getAgentDir(agentName, workingDir), 'summary.txt');
}

// ─── ENSURE DIRS ─────────────────────────────────────────────────

function ensureAgentDir(agentName: string, workingDir?: string): void {
  const agentDir = getAgentDir(agentName, workingDir);
  const messagesDir = getMessagesDir(agentName, workingDir);
  if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
  if (!fs.existsSync(messagesDir)) fs.mkdirSync(messagesDir, { recursive: true });
}

function ensureAgentsDir(workingDir?: string): void {
  const agentsDir = getAgentsDir(workingDir);
  if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });
}

// ─── REGISTRY ────────────────────────────────────────────────────

export function loadRegistry(workingDir?: string): AgentRegistry {
  ensureAgentsDir(workingDir);
  const registryPath = getRegistryPath(workingDir);
  if (!fs.existsSync(registryPath)) return { agents: [] };
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch {
    return { agents: [] };
  }
}

function saveRegistry(registry: AgentRegistry, workingDir?: string): void {
  ensureAgentsDir(workingDir);
  fs.writeFileSync(
    getRegistryPath(workingDir),
    JSON.stringify(registry, null, 2)
  );
}

export function getRegistryEntry(
  agentName: string,
  workingDir?: string
): AgentRegistryEntry | null {
  const registry = loadRegistry(workingDir);
  return registry.agents.find(a => a.name === agentName) || null;
}

function upsertRegistryEntry(
  entry: AgentRegistryEntry,
  workingDir?: string
): void {
  const registry = loadRegistry(workingDir);
  const idx = registry.agents.findIndex(a => a.name === entry.name);
  if (idx >= 0) {
    registry.agents[idx] = entry;
  } else {
    registry.agents.push(entry);
  }
  saveRegistry(registry, workingDir);
}

function removeRegistryEntry(agentName: string, workingDir?: string): void {
  const registry = loadRegistry(workingDir);
  registry.agents = registry.agents.filter(a => a.name !== agentName);
  saveRegistry(registry, workingDir);
}

// ─── SESSION ─────────────────────────────────────────────────────

export function loadSession(
  agentName: string,
  workingDir?: string
): AgentSession | null {
  const sessionPath = getSessionPath(agentName, workingDir);
  if (!fs.existsSync(sessionPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveSession(
  session: AgentSession,
  workingDir?: string
): void {
  ensureAgentDir(session.name, workingDir);
  fs.writeFileSync(
    getSessionPath(session.name, workingDir),
    JSON.stringify(session, null, 2)
  );

  upsertRegistryEntry(
    {
      name: session.name,
      task: session.task,
      personaId: session.personaId,
      status: session.status,
      createdAt: session.createdAt,
      lastActive: session.lastActive,
    },
    workingDir
  );
}

// ─── MESSAGES ────────────────────────────────────────────────────

export function saveAgentMessage(
  agentName: string,
  message: AgentMessage,
  workingDir?: string
): void {
  ensureAgentDir(agentName, workingDir);
  const messagesDir = getMessagesDir(agentName, workingDir);
  const filename = `${Date.now()}_${message.sender}.json`;
  fs.writeFileSync(
    path.join(messagesDir, filename),
    JSON.stringify(message, null, 2)
  );

  const session = loadSession(agentName, workingDir);
  if (session) {
    session.messageCount += 1;
    session.lastActive = new Date().toISOString();
    saveSession(session, workingDir);
  }
}

export function loadAgentMessages(
  agentName: string,
  workingDir?: string
): AgentMessage[] {
  const messagesDir = getMessagesDir(agentName, workingDir);
  if (!fs.existsSync(messagesDir)) return [];

  return fs
    .readdirSync(messagesDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(file => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(messagesDir, file), 'utf-8')
        );
      } catch {
        return null;
      }
    })
    .filter(Boolean) as AgentMessage[];
}

// ─── SUMMARY ─────────────────────────────────────────────────────

export function saveAgentSummary(
  agentName: string,
  summary: string,
  workingDir?: string
): void {
  ensureAgentDir(agentName, workingDir);
  fs.writeFileSync(getSummaryPath(agentName, workingDir), summary, 'utf-8');

  const session = loadSession(agentName, workingDir);
  if (session) {
    session.lastSummary = summary;
    saveSession(session, workingDir);
  }
}

export function loadAgentSummary(
  agentName: string,
  workingDir?: string
): string | null {
  const summaryPath = getSummaryPath(agentName, workingDir);
  if (!fs.existsSync(summaryPath)) return null;
  try {
    return fs.readFileSync(summaryPath, 'utf-8');
  } catch {
    return null;
  }
}

// ─── CREATE / RESET / STOP ────────────────────────────────────────

export function createAgent(
  name: string,
  task: string,
  personaId: string | null,
  workingDir?: string
): AgentSession {
  const now = new Date().toISOString();
  const session: AgentSession = {
    id: `agent_${name}_${Date.now()}`,
    name,
    task,
    personaId,
    status: 'active',
    messageCount: 0,
    lastSummary: null,
    createdAt: now,
    lastActive: now,
  };

  ensureAgentDir(name, workingDir);
  saveSession(session, workingDir);
  return session;
}

export function resetAgent(agentName: string, workingDir?: string): void {
  const agentDir = getAgentDir(agentName, workingDir);
  if (fs.existsSync(agentDir)) {
    fs.rmSync(agentDir, { recursive: true, force: true });
  }
  removeRegistryEntry(agentName, workingDir);
}

export function stopAgent(agentName: string, workingDir?: string): void {
  const session = loadSession(agentName, workingDir);
  if (session) {
    session.status = 'stopped';
    session.lastActive = new Date().toISOString();
    saveSession(session, workingDir);
  }
}

export function agentExists(agentName: string, workingDir?: string): boolean {
  return fs.existsSync(getSessionPath(agentName, workingDir));
}

export function getActiveAgentCount(workingDir?: string): number {
  const registry = loadRegistry(workingDir);
  return registry.agents.filter(
    a => a.status === 'active' || a.status === 'idle'
  ).length;
}