// File: src/ui/agent-renderer.ts

import chalk from 'chalk';
import { AgentRegistryEntry } from '../core/agent-store.js';
import { loadAgentSummary, loadSession } from '../core/agent-store.js';

// ─── DESIGN TOKENS ────────────────────────────────────────────────
export const PURPLE = chalk.hex('#AB47BC');
export const AMBER  = chalk.hex('#FFAB00');
export const GREEN  = chalk.hex('#66BB6A');
export const RED    = chalk.hex('#EF5350');
export const CYAN   = chalk.cyan;
export const GRAY   = chalk.gray;
export const BLUE   = chalk.hex('#42A5F5');
export const BORDER = chalk.hex('#455A64');
export const WHITE  = chalk.white;

// ─── AGENT COLOR CYCLE ────────────────────────────────────────────
// Each agent gets a unique foreground + background chip color pair
const AGENT_COLOR_PAIRS: Array<{
  fg: chalk.Chalk;
  bg: chalk.Chalk;
  chip: chalk.Chalk;
}> = [
  {
    fg:   chalk.hex('#AB47BC'),
    bg:   chalk.hex('#AB47BC'),
    chip: chalk.bgHex('#2D1F33').hex('#CE93D8'),
  },
  {
    fg:   chalk.hex('#42A5F5'),
    bg:   chalk.hex('#42A5F5'),
    chip: chalk.bgHex('#1A2A3A').hex('#90CAF9'),
  },
  {
    fg:   chalk.hex('#66BB6A'),
    bg:   chalk.hex('#66BB6A'),
    chip: chalk.bgHex('#1A2E1A').hex('#A5D6A7'),
  },
  {
    fg:   chalk.hex('#FF7043'),
    bg:   chalk.hex('#FF7043'),
    chip: chalk.bgHex('#2E1F1A').hex('#FFAB91'),
  },
  {
    fg:   chalk.hex('#26C6DA'),
    bg:   chalk.hex('#26C6DA'),
    chip: chalk.bgHex('#1A2A2E').hex('#80DEEA'),
  },
  {
    fg:   chalk.hex('#EC407A'),
    bg:   chalk.hex('#EC407A'),
    chip: chalk.bgHex('#2E1A22').hex('#F48FB1'),
  },
  {
    fg:   chalk.hex('#FFCA28'),
    bg:   chalk.hex('#FFCA28'),
    chip: chalk.bgHex('#2E2A1A').hex('#FFE082'),
  },
  {
    fg:   chalk.hex('#78909C'),
    bg:   chalk.hex('#78909C'),
    chip: chalk.bgHex('#1E2A2E').hex('#B0BEC5'),
  },
];

export function getAgentColorPair(
  name: string,
  allNames: string[]
): { fg: chalk.Chalk; chip: chalk.Chalk } {
  const idx = allNames.indexOf(name) % AGENT_COLOR_PAIRS.length;
  const pair = AGENT_COLOR_PAIRS[Math.max(0, idx)];
  return { fg: pair.fg, chip: pair.chip };
}

// Kept for backwards compat
export function getAgentColor(
  name: string,
  allNames: string[]
): chalk.Chalk {
  return getAgentColorPair(name, allNames).fg;
}

// ─── AGENT CHIP ───────────────────────────────────────────────────
/**
 * Renders a shaded background "chip" for an agent name.
 * Example: ▌ architectBob ▐  with dark background
 */
export function renderAgentChip(
  name: string,
  allNames: string[],
  active: boolean = true
): string {
  const { chip } = getAgentColorPair(name, allNames);
  const label = ` @${name} `;
  if (active) {
    return chip(` ${label} `);
  }
  return chalk.bgHex('#1A1A1A').hex('#555555')(` ${label} `);
}

// ─── MARKDOWN STRIPPER ────────────────────────────────────────────
export function stripMarkdown(text: string): string {
  return text
    // Remove code fences — keep code content indented
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) =>
      code
        .split('\n')
        .map((line: string) => `  ${line}`)
        .join('\n')
    )
    .replace(/```/g, '')
    // Headers → plain text
    .replace(/^#{1,6}\s+(.+)$/gm, '$1')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '$1')
    // Italic
    .replace(/\*(.+?)\*/g, '$1')
    // Inline code
    .replace(/`([^`]+)`/g, '$1')
    // Horizontal rules
    .replace(/^[-*]{3,}$/gm, '─'.repeat(50))
    // Blockquotes
    .replace(/^>\s?/gm, '  ')
    // Numbered lists
    .replace(/^\s*(\d+)\.\s+/gm, '  $1. ')
    // Bullet lists
    .replace(/^\s*[-*+]\s+/gm, '  • ')
    // Collapse 3+ newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── TEXT WRAPPER ─────────────────────────────────────────────────
export function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    const words = paragraph.split(' ');
    let currentLine = '';
    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length > maxWidth) {
        if (currentLine) lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
  }

  return lines;
}

// ─── RENDER AGENT RESPONSE BOX ────────────────────────────────────
export function renderAgentResponse(
  agentName: string,
  response: string,
  agentColor: chalk.Chalk
): void {
  const maxWidth = 66;
  const cleanResponse = stripMarkdown(response);
  const lines = wrapText(cleanResponse, maxWidth - 4);
  const headerPad = Math.max(0, maxWidth - agentName.length - 7);
  const header = `┌─ @${agentName} ${'─'.repeat(headerPad)}┐`;
  const footer = `└${'─'.repeat(maxWidth - 2)}┘`;

  console.log('');
  console.log(agentColor(`  ${header}`));
  for (const line of lines) {
    const padded = line.padEnd(maxWidth - 4);
    console.log(agentColor('  │') + `  ${padded}` + agentColor('  │'));
  }
  console.log(agentColor(`  ${footer}`));
}

// ─── RENDER USER MESSAGE ──────────────────────────────────────────
export function renderUserMessage(message: string): void {
  console.log('');
  console.log(GRAY('  ─────────────────────────────────────────────────────────'));
  console.log(GREEN('  You: ') + WHITE(message));
  console.log(GRAY('  ─────────────────────────────────────────────────────────'));
}

// ─── RENDER SYSTEM MESSAGE ────────────────────────────────────────
export function renderSystemMessage(message: string): void {
  console.log('');
  console.log(AMBER(`  ◆ ${message}`));
}

// ─── RENDER HUB HEADER ────────────────────────────────────────────
export function renderHubHeader(
  projectName: string,
  agents: AgentRegistryEntry[]
): void {
  const agentNames = agents.map(a => a.name);

  // ─── Build chip row ───────────────────────────────────────────
  const chips = agentNames
    .map(n => renderAgentChip(n, agentNames, true))
    .join('  ');

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + PURPLE('  🌐 Agent Hub') + GRAY(`  —  ${projectName}`));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║'));
  console.log(BORDER('  ║') + `  ${chips}`);
  console.log(BORDER('  ║'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + WHITE('  Talk:'));
  console.log(
    BORDER('  ║') +
    CYAN('    @agentname "message"') +
    GRAY(' — one agent')
  );
  console.log(
    BORDER('  ║') +
    CYAN('    @all "message"') +
    GRAY('       — all agents')
  );
  console.log(BORDER('  ║') + WHITE('  Commands:'));
  console.log(BORDER('  ║') + CYAN('    /messages') + GRAY('         — unified message view'));
  console.log(BORDER('  ║') + CYAN('    /status') + GRAY('           — all agent statuses'));
  console.log(BORDER('  ║') + CYAN('    /summary') + GRAY('          — agent summaries'));
  console.log(BORDER('  ║') + CYAN('    /exit') + GRAY('             — leave hub'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

// ─── RENDER /STATUS OUTPUT ────────────────────────────────────────
export function renderHubStatus(
  agents: AgentRegistryEntry[],
  allNames: string[],
  cwd: string
): void {
  console.log('');
  for (const agent of agents) {
    const session = loadSession(agent.name, cwd);
    const { fg } = getAgentColorPair(agent.name, allNames);
    const chip = renderAgentChip(agent.name, allNames, true);
    console.log(
      `  ${chip}  ` +
      GREEN('ACTIVE') + `  ` +
      GRAY(`${session?.messageCount || 0} messages`)
    );
    console.log(
      GRAY(
        `    Task: ${agent.task.slice(0, 55)}` +
        `${agent.task.length > 55 ? '...' : ''}`
      )
    );
  }
  console.log('');
}

// ─── RENDER /SUMMARY OUTPUT ───────────────────────────────────────
export function renderHubSummary(
  agents: AgentRegistryEntry[],
  allNames: string[],
  cwd: string
): void {
  console.log('');
  for (const agent of agents) {
    const summary = loadAgentSummary(agent.name, cwd);
    const chip = renderAgentChip(agent.name, allNames, true);
    console.log(`  ${chip}`);
    if (summary) {
      const lines = summary
        .split('\n')
        .filter(l => l.trim())
        .slice(0, 4);
      for (const line of lines) {
        console.log(GRAY(`    ${line.slice(0, 60)}`));
      }
    } else {
      console.log(GRAY('    No summary yet.'));
    }
    console.log('');
  }
}

// ─── RENDER UNIFIED MESSAGE VIEW ──────────────────────────────────

export interface UnifiedMessage {
  agentName: string | null; // null = user message
  content: string;
  timestamp: string;
}

/**
 * Renders the unified message view with optional filter and search.
 * Each agent has its own chip color. User messages in green.
 * Paginated at 50 messages per page.
 */
export function renderUnifiedMessages(
  messages: UnifiedMessage[],
  allAgentNames: string[],
  options: {
    filterAgent?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}
): { totalPages: number; currentPage: number; totalMessages: number } {
  const PAGE_SIZE = options.pageSize || 50;
  const page = options.page || 1;

  // ─── Apply filters ────────────────────────────────────────────
  let filtered = [...messages];

  if (options.filterAgent) {
    filtered = filtered.filter(
      m => m.agentName?.toLowerCase() === options.filterAgent!.toLowerCase()
    );
  }

  if (options.search) {
    const query = options.search.toLowerCase();
    filtered = filtered.filter(
      m => m.content.toLowerCase().includes(query)
    );
  }

  const totalMessages = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalMessages / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageMessages = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  // ─── Header ───────────────────────────────────────────────────
  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(
    BORDER('  ║') +
    AMBER('  📋 Messages') +
    GRAY(
      `  ${totalMessages} total` +
      (options.filterAgent ? `  filter: @${options.filterAgent}` : '') +
      (options.search ? `  search: "${options.search}"` : '')
    )
  );
  console.log(
    BORDER('  ║') +
    GRAY(`  Page ${currentPage}/${totalPages}`)
  );
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));

  if (pageMessages.length === 0) {
    console.log(BORDER('  ║') + GRAY('  No messages found.'));
    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');
    return { totalPages, currentPage, totalMessages };
  }

  // ─── Messages ─────────────────────────────────────────────────
  for (const msg of pageMessages) {
    const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (msg.agentName === null) {
      // User message — green
      console.log(BORDER('  ║'));
      console.log(
        BORDER('  ║') +
        chalk.bgHex('#1A2E1A').hex('#A5D6A7')('  You  ') +
        GRAY(`  ${time}`)
      );
      const lines = wrapText(msg.content, 54);
      for (const line of lines) {
        console.log(BORDER('  ║') + GREEN(`  ${line}`));
      }
    } else {
      // Agent message — agent chip color
      const chip = renderAgentChip(msg.agentName, allAgentNames, true);
      const { fg } = getAgentColorPair(msg.agentName, allAgentNames);
      const clean = stripMarkdown(msg.content);
      console.log(BORDER('  ║'));
      console.log(
        BORDER('  ║') +
        `  ${chip}` +
        GRAY(`  ${time}`)
      );
      const lines = wrapText(clean, 54);
      for (const line of lines) {
        console.log(BORDER('  ║') + fg(`  ${line}`));
      }
    }
  }

  // ─── Footer ───────────────────────────────────────────────────
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(
    BORDER('  ║') +
    GRAY(`  Page ${currentPage}/${totalPages}`) +
    (currentPage < totalPages
      ? CYAN('  /page ' + (currentPage + 1)) + GRAY(' for next')
      : '')
  );
  console.log(BORDER('  ║') + GRAY('  /filter <name>  /search <keyword>  /back'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  return { totalPages, currentPage, totalMessages };
}