// File: src/ui/chat-renderer.ts
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { diffLines } from 'diff';
import { renderMarkdown } from './renderer.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const MODE_CHAT = chalk.hex('#26C6DA');
const MODE_CONSULTANT = chalk.hex('#AB47BC');
const MODE_DEEPDIVE = chalk.hex('#0097A7');

// ─── BACKGROUND COLORS ───
const USER_BG = chalk.bgHex('#2A1F1F');
const BOB_BG = chalk.bgHex('#0A2A2A');
const CODE_BG = chalk.bgHex('#061616');
const DIFF_ADD_BG = chalk.bgHex('#0D2B0D');
const DIFF_REMOVE_BG = chalk.bgHex('#2D0D0D');

// ─── RESPONSE MAX WIDTH ───
const MAX_CONTENT_WIDTH = 88;

// ─── TYPES ───
export interface ResponseMetadata {
  elapsedMs: number;
  tokenCount?: number;
  selectedFiles?: string[];
  constraints?: string[];
  mode: 'chat' | 'consultant' | 'deepdive';
  tier: 'local' | 'platform';
  conversationId?: string;
}

export interface FileChange {
  filePath: string;
  content: string;
  isNew: boolean;
}

// ─── STATUS MESSAGES ───
const STATUS_MESSAGES_ORDERED = [
  'Reading your message...',
  'Understanding your intent...',
  'Considering your tone and context...',
  'Reviewing conversation history...',
  'Searching for relevant files...',
];

const STATUS_MESSAGES_RANDOM = [
  'Reading project structure...',
  'Analyzing code patterns...',
  'Cross-referencing dependencies...',
  'Checking past constraints...',
  'Evaluating architectural implications...',
  'Reviewing similar patterns in codebase...',
  'Weighing implementation tradeoffs...',
  'Drafting response structure...',
  'Refining technical accuracy...',
  'Validating against project conventions...',
  'Polishing delivery for clarity...',
  'Deep analysis in progress...',
  'Complex reasoning — almost there...',
  'Final synthesis...',
  'Still working — this is a complex one...',
];

// ─── ELAPSED TIMER WITH SPINNER + STATUS MESSAGES ───
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let timerInterval: NodeJS.Timeout | null = null;
let timerStartMs: number = 0;
let spinnerIndex: number = 0;
let currentMessageIndex: number = 0;
let nextMessageChangeAt: number = 3000;
let shuffledRandomMessages: string[] = [];
let currentStatusMessage: string = STATUS_MESSAGES_ORDERED[0];

function shuffleArray(arr: string[]): string[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function startElapsedTimer(): void {
  timerStartMs = Date.now();
  spinnerIndex = 0;
  currentMessageIndex = 0;
  nextMessageChangeAt = 3000;
  shuffledRandomMessages = shuffleArray(STATUS_MESSAGES_RANDOM);
  currentStatusMessage = STATUS_MESSAGES_ORDERED[0];

  timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - timerStartMs;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const frame = SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length];
    spinnerIndex++;

    if (elapsedMs >= nextMessageChangeAt) {
      currentMessageIndex++;

      if (currentMessageIndex < STATUS_MESSAGES_ORDERED.length) {
        currentStatusMessage = STATUS_MESSAGES_ORDERED[currentMessageIndex];
      } else {
        const randomIdx = currentMessageIndex - STATUS_MESSAGES_ORDERED.length;
        if (randomIdx < shuffledRandomMessages.length) {
          currentStatusMessage = shuffledRandomMessages[randomIdx];
        } else {
          currentStatusMessage = 'Still working — this is a complex one...';
        }
      }

      const randomDelay = 5000 + Math.floor(Math.random() * 5000);
      nextMessageChangeAt = elapsedMs + randomDelay;
    }

    process.stdout.write(`\r\x1B[2K  ${BRAND_SECONDARY(frame)} ${chalk.white(currentStatusMessage)} ${MUTED(`${elapsedSec}s`)}`);
  }, 80);
}

export function stopElapsedTimer(): number {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    process.stdout.write('\r\x1B[2K');
  }
  return Date.now() - timerStartMs;
}

// ─── USER MESSAGE (RIGHT-ALIGNED) ───
export function renderUserMessage(message: string): void {
  const termWidth = process.stdout.columns || 80;
  const timestamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const maxMsgWidth = Math.min(60, termWidth - 16);
  const wrappedLines = wrapText(message, maxMsgWidth);

  process.stdout.write('\x1B[1A\x1B[2K');

  console.log('');
  for (const line of wrappedLines) {
    const padLeft = termWidth - line.length - 6;
    const padding = padLeft > 0 ? ' '.repeat(padLeft) : '';
    console.log(padding + USER_BG(chalk.white(` ${line} `)) + '  ');
  }
  const tsPad = termWidth - timestamp.length - 4;
  console.log(' '.repeat(tsPad > 0 ? tsPad : 0) + MUTED(`${timestamp}`));
  console.log('');
}

// ─── BOB RESPONSE (CONSTRAINED WIDTH, FLOATING BG, ANIMATED) ───
export async function renderBobResponse(response: string, metadata: ResponseMetadata): Promise<void> {
  const modeColor = getModeColor(metadata.mode);
  const termWidth = process.stdout.columns || 80;
  const contentWidth = Math.min(MAX_CONTENT_WIDTH, termWidth - 6);

  // ─── HEADER ───
  console.log('');
  console.log(`  ${BOB_BG(modeColor(' 🤖 Bob: '))}`);
  console.log('');

  // ─── SPLIT RESPONSE INTO TEXT AND CODE BLOCKS ───
  const segments = splitResponseIntoSegments(response);

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];

    if (segment.type === 'code') {
      // Code block with character-by-character typewriter
      console.log('');
      const codeLines = segment.content.split('\n');
      for (const line of codeLines) {
        const truncatedLine = line.length > contentWidth - 6 ? line.slice(0, contentWidth - 9) + '...' : line;
        await typewriterCharByChar(CODE_BG, chalk.white, `  │ ${truncatedLine}`, contentWidth + 6);
      }
      console.log('');
    } else {
      // Render markdown then reveal line-by-line
      const rendered = renderMarkdown(segment.content);
      const renderedLines = rendered.split('\n');
      // Re-wrap to content width
      const textLines: string[] = [];
      for (const rLine of renderedLines) {
        const visibleLen = stripAnsi(rLine).length;
        if (visibleLen <= contentWidth) {
          textLines.push(rLine);
        } else {
          const rawLine = stripAnsi(rLine);
          const wrapped = wrapText(rawLine, contentWidth);
          textLines.push(...wrapped);
        }
      }
      for (const line of textLines) {
        await sleep(120);
        console.log(`  ${BOB_BG(` ${line} `)}`);
      }
    }

    // Pause between segments
    if (s < segments.length - 1) {
      await sleep(180);
    }
  }

  // ─── CLOSING ───
  console.log('');

  // ─── METADATA ZONE ───
  renderMetadata(metadata);
}

// ─── METADATA ZONE ───
function renderMetadata(metadata: ResponseMetadata): void {
  // Referenced files
  if (metadata.selectedFiles && metadata.selectedFiles.length > 0) {
    const fileList = metadata.selectedFiles.map(f => f.split('/').pop()).join(', ');
    console.log(MUTED(`  └─ 📂 Referenced: ${fileList}`));
  }

  // Constraints (Tier 3 only)
  if (metadata.constraints && metadata.constraints.length > 0) {
    const count = metadata.constraints.length;
    if (count <= 3) {
      console.log(WARNING(`  └─ ⚠️ ${count} constraint${count > 1 ? 's' : ''} active`));
      for (let i = 0; i < count; i++) {
        const prefix = i === count - 1 ? '└─' : '├─';
        const truncated = metadata.constraints[i].length > 50
          ? metadata.constraints[i].slice(0, 47) + '...'
          : metadata.constraints[i];
        console.log(MUTED(`     ${prefix} ${truncated}`));
      }
    } else {
      console.log(WARNING(`  └─ ⚠️ ${count} constraints active`) + MUTED(` (type /constraints to view)`));
    }
  }

  // Deep dive hint — context-aware
  if (metadata.mode !== 'deepdive') {
    console.log(BRAND_SECONDARY(`  └─ 🍴 /deepdive`));
  } else {
    console.log(MODE_DEEPDIVE(`  └─ 🏊 /surface to exit`));
  }

  // Elapsed + tokens (NOT indented)
  const elapsed = (metadata.elapsedMs / 1000).toFixed(1);
  const tokenStr = metadata.tokenCount ? ` · ${metadata.tokenCount} tok` : '';
  console.log(MUTED(`  ⏱ ${elapsed}s${tokenStr}`));

  console.log('');
}

// ─── DIFF VIEW FOR FILE CHANGES ───
export function renderFileDiff(filePath: string, newContent: string, isNew: boolean): void {
  if (isNew) {
    const lineCount = newContent.split('\n').length;
    console.log('');
    console.log(SUCCESS(`  ◆ Created ${filePath}`));
    console.log(DIFF_ADD_BG(chalk.white(`    + New file (${lineCount} lines)`)));
    console.log('');
    return;
  }

  const absolutePath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    const lineCount = newContent.split('\n').length;
    console.log('');
    console.log(SUCCESS(`  ◆ Created ${filePath}`));
    console.log(DIFF_ADD_BG(chalk.white(`    + New file (${lineCount} lines)`)));
    console.log('');
    return;
  }

  const existingContent = fs.readFileSync(absolutePath, 'utf-8');
  const changes = diffLines(existingContent, newContent);

  let additions = 0;
  let removals = 0;
  const diffOutput: string[] = [];

  for (const change of changes) {
    const lines = change.value.split('\n').filter(l => l !== '');
    for (const line of lines) {
      if (change.added) {
        additions++;
        diffOutput.push(DIFF_ADD_BG(chalk.white(`    + ${line}`)));
      } else if (change.removed) {
        removals++;
        diffOutput.push(DIFF_REMOVE_BG(chalk.white(`    - ${line}`)));
      }
    }
  }

  if (additions === 0 && removals === 0) {
    console.log(MUTED(`  ◆ ${filePath} (no changes detected)`));
    console.log('');
    return;
  }

  console.log('');
  console.log(BRAND_SECONDARY(`  ◆ Modified ${filePath}`));

  const maxDiffLines = 10;
  const showLines = diffOutput.slice(0, maxDiffLines);
  for (const line of showLines) {
    console.log(line);
  }
  if (diffOutput.length > maxDiffLines) {
    console.log(MUTED(`    ... ${diffOutput.length - maxDiffLines} more changes`));
  }

  console.log(MUTED(`    ${SUCCESS(`+${additions}`)} ${ERROR(`-${removals}`)}`));
  console.log('');
}

// ─── CONSTRAINTS TILE (for /constraints command) ───
export function renderConstraintsTile(constraints: string[]): void {
  if (constraints.length === 0) {
    console.log('');
    console.log(MUTED('  No active constraints for this conversation.'));
    console.log('');
    return;
  }

  console.log('');
  console.log(WARNING('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(WARNING('  ║') + ERROR(' ⚠️  ACTIVE NEGATIVE CONSTRAINTS'));
  console.log(WARNING('  ╠══════════════════════════════════════════════════════════╣'));

  for (const constraint of constraints) {
    const wrapped = wrapText(constraint, 54);
    for (let i = 0; i < wrapped.length; i++) {
      if (i === 0) {
        console.log(WARNING('  ║') + ERROR(`  • ${wrapped[i]}`));
      } else {
        console.log(WARNING('  ║') + ERROR(`    ${wrapped[i]}`));
      }
    }
  }

  console.log(WARNING('  ║'));
  console.log(WARNING('  ║') + MUTED('  These approaches were previously attempted and FAILED.'));
  console.log(WARNING('  ║') + MUTED('  Bob is actively avoiding these patterns.'));
  console.log(WARNING('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function getModeColor(mode: string): typeof MODE_CHAT {
  switch (mode) {
    case 'consultant': return MODE_CONSULTANT;
    case 'deepdive': return MODE_DEEPDIVE;
    default: return MODE_CHAT;
  }
}

interface Segment {
  type: 'text' | 'code';
  content: string;
}

function splitResponseIntoSegments(response: string): Segment[] {
  const segments: Segment[] = [];
  const codeBlockRegex = new RegExp('```[\\w]*\\n([\\s\\S]*?)```', 'g');
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    if (match.index > lastIndex) {
      const text = response.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: 'text', content: text });
    }
    segments.push({ type: 'code', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < response.length) {
    const text = response.slice(lastIndex).trim();
    if (text) segments.push({ type: 'text', content: text });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', content: response });
  }

  return segments;
}

function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxWidth) {
      lines.push(paragraph);
      continue;
    }
    const words = paragraph.split(' ');
    let currentLine = '';
    for (const word of words) {
      if (currentLine.length + word.length + 1 > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine += (currentLine ? ' ' : '') + word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

async function typewriterCharByChar(bgColor: any, textColor: any, line: string, maxWidth: number): Promise<void> {
  const rawText = stripAnsi(line);
  const displayText = rawText.length > maxWidth ? rawText.slice(0, maxWidth) : rawText;

  process.stdout.write('  ');
  for (let i = 0; i < displayText.length; i++) {
    process.stdout.write(bgColor(textColor(displayText[i])));
    await sleep(30);
  }
  process.stdout.write('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}