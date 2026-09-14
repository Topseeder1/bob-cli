// File: src/idrp/capability-renderer.ts
// IDRP Capability Renderer
// Renders user-facing feedback when local capabilities execute.
// Features: color-coded status, line-by-line reveal, truncation prompt.
// Pauses the elapsed timer spinner before rendering to prevent collision.

import chalk from 'chalk';
import inquirer from 'inquirer';
import type {
  CapabilityResult,
  ListDirectoryMetadata,
  SearchFilesMetadata,
  RunCommandMetadata,
  ReadFileMetadata,
} from './types.js';
import { pauseElapsedTimer, resumeElapsedTimer } from '../ui/chat-renderer.js';

/**
 * Signal returned after rendering, telling the IDRP loop
 * whether to queue a follow-up capability invocation.
 */
export interface RenderSignal {
  shouldContinue: boolean;
  followUpParams?: Record<string, unknown>;
}

// ─── DESIGN TOKENS ───
const BRAND    = chalk.hex('#E66F24');
const CAP_NAME = chalk.white.bold;
const SUCCESS  = chalk.hex('#66BB6A');
const CAUTION  = chalk.hex('#FFC107');
const DANGER   = chalk.hex('#EF5350');
const INFO     = chalk.hex('#26C6DA');
const MUTED    = chalk.hex('#78909C');
const DIVIDER  = chalk.hex('#455A64');
const VALUE    = chalk.white;

const LINE_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function revealLine(text: string, delay: boolean = true): Promise<void> {
  if (delay) await sleep(LINE_DELAY_MS);
  console.log(text);
}

// ─── STATUS HELPERS ───

function getStatusFromResult(result: CapabilityResult): {
  icon: string;
  text: string;
  color: chalk.Chalk;
} {
  if (!result.success) {
    if (result.error?.includes('restricted') || result.error?.includes('blocked')) {
      return { icon: '✗', text: 'blocked', color: DANGER };
    }
    if (result.error?.includes('not found')) {
      return { icon: '✗', text: 'not found', color: DANGER };
    }
    if (result.error?.includes('binary')) {
      return { icon: '✗', text: 'binary file', color: DANGER };
    }
    if (result.error?.includes('outside project')) {
      return { icon: '✗', text: 'outside project', color: DANGER };
    }
    if (result.error?.includes('whitelist') || result.error?.includes('not in whitelist')) {
      return { icon: '✗', text: 'not allowed', color: DANGER };
    }
    if (result.error?.includes('timed out') || result.error?.includes('TIMED OUT')) {
      return { icon: '⚠', text: 'timed out', color: CAUTION };
    }
    return { icon: '✗', text: 'error', color: DANGER };
  }

  const meta = result.metadata;
  if (meta && 'wasTruncated' in meta && meta.wasTruncated) {
    return { icon: '✓', text: 'loaded (truncated)', color: CAUTION };
  }
  if (meta && 'wasCapped' in meta && meta.wasCapped) {
    return { icon: '✓', text: 'loaded (capped)', color: CAUTION };
  }
  if (meta && 'wasTimedOut' in meta && meta.wasTimedOut) {
    return { icon: '⚠', text: 'timed out', color: CAUTION };
  }

  return { icon: '✓', text: 'done', color: SUCCESS };
}

function extractPathFromError(error?: string): string {
  if (!error) return '(unknown)';
  const patterns = [
    /File not found: "([^"]+)"/,
    /Directory not found: "([^"]+)"/,
    /Access to "([^"]+)"/,
    /"([^"]+)" is a binary file/,
    /"([^"]+)" is a directory/,
    /"([^"]+)" is a file/,
    /Requested: "([^"]+)"/,
    /Failed to read "([^"]+)"/,
    /Search directory not found: "([^"]+)"/,
  ];
  for (const pattern of patterns) {
    const match = error.match(pattern);
    if (match) return match[1];
  }
  return '(unknown)';
}

// ─── READ FILE RENDERER ───

export async function renderReadFileResult(
  result: CapabilityResult
): Promise<RenderSignal> {
  pauseElapsedTimer();

  const dividerLine = DIVIDER('  ─────────────────────────');
  const status = getStatusFromResult(result);

  console.log('');
  await revealLine(`  ${BRAND('📂 IDRP')} → ${CAP_NAME('readFile')}`, false);
  await revealLine(dividerLine);

  if (!result.success) {
    const errorPath = extractPathFromError(result.error);
    await revealLine(`  ${MUTED('Path:')}   ${VALUE(errorPath)}`);
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
    if (result.error) {
      await revealLine(`  ${MUTED('Reason:')} ${DANGER(result.error)}`);
    }
    await revealLine(dividerLine);
    console.log('');
    resumeElapsedTimer();
    return { shouldContinue: false };
  }

  const meta = result.metadata as ReadFileMetadata | undefined;
  if (!meta) {
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
    await revealLine(dividerLine);
    console.log('');
    resumeElapsedTimer();
    return { shouldContinue: false };
  }

  await revealLine(`  ${MUTED('Path:')}   ${VALUE(meta.filePath)}`);
  await revealLine(`  ${MUTED('Lines:')}  ${INFO(`${meta.returnedRange.start}-${meta.returnedRange.end} of ${meta.totalLines}`)}`);
  await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
  await revealLine(dividerLine);

  if (meta.wasTruncated) {
    const remaining = meta.totalLines - meta.returnedRange.end;
    console.log('');
    const { loadMore } = await inquirer.prompt([{
      type: 'confirm',
      name: 'loadMore',
      message: MUTED(`  📎 ${remaining} lines remaining. Load next section?`),
      default: false,
    }]);

    if (loadMore) {
      resumeElapsedTimer();
      return {
        shouldContinue: true,
        followUpParams: {
          path: meta.filePath,
          startLine: meta.returnedRange.end + 1,
        },
      };
    }
  }

  console.log('');
  resumeElapsedTimer();
  return { shouldContinue: false };
}

// ─── LIST DIRECTORY RENDERER ───

export async function renderListDirectoryResult(
  result: CapabilityResult
): Promise<RenderSignal> {
  pauseElapsedTimer();

  const dividerLine = DIVIDER('  ─────────────────────────');
  const status = getStatusFromResult(result);

  console.log('');
  await revealLine(`  ${BRAND('📂 IDRP')} → ${CAP_NAME('listDirectory')}`, false);
  await revealLine(dividerLine);

  if (!result.success) {
    const errorPath = extractPathFromError(result.error);
    await revealLine(`  ${MUTED('Path:')}   ${VALUE(errorPath)}`);
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
    if (result.error) {
      await revealLine(`  ${MUTED('Reason:')} ${DANGER(result.error)}`);
    }
    await revealLine(dividerLine);
    console.log('');
    resumeElapsedTimer();
    return { shouldContinue: false };
  }

  const meta = result.metadata as ListDirectoryMetadata | undefined;
  if (meta) {
    await revealLine(`  ${MUTED('Path:')}   ${VALUE(meta.directoryPath + '/')}`);
    await revealLine(`  ${MUTED('Found:')}  ${INFO(`${meta.totalFiles} files, ${meta.totalDirectories} directories`)}`);
    await revealLine(`  ${MUTED('Depth:')}  ${INFO(String(meta.depth))}`);
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
  } else {
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
  }

  await revealLine(dividerLine);
  console.log('');
  resumeElapsedTimer();
  return { shouldContinue: false };
}

// ─── SEARCH FILES RENDERER ───

export async function renderSearchFilesResult(
  result: CapabilityResult
): Promise<RenderSignal> {
  pauseElapsedTimer();

  const dividerLine = DIVIDER('  ─────────────────────────');
  const status = getStatusFromResult(result);

  console.log('');
  await revealLine(`  ${BRAND('🔍 IDRP')} → ${CAP_NAME('searchFiles')}`, false);
  await revealLine(dividerLine);

  if (!result.success) {
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
    if (result.error) {
      await revealLine(`  ${MUTED('Reason:')} ${DANGER(result.error)}`);
    }
    await revealLine(dividerLine);
    console.log('');
    resumeElapsedTimer();
    return { shouldContinue: false };
  }

  const meta = result.metadata as SearchFilesMetadata | undefined;
  if (meta) {
    await revealLine(`  ${MUTED('Pattern:')} ${VALUE(`"${meta.pattern}"`)}`);
    await revealLine(`  ${MUTED('Scope:')}   ${INFO(`${meta.directory}/ (${meta.filesSearched} files searched)`)}`);
    await revealLine(
      `  ${MUTED('Matches:')} ${meta.totalMatches > 0 ? INFO(String(meta.totalMatches)) : MUTED('0')} ${MUTED(`in ${meta.filesWithMatches} files`)}`
    );
    await revealLine(`  ${MUTED('Status:')}  ${status.color(`${status.icon} ${status.text}`)}`);
  } else {
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
  }

  await revealLine(dividerLine);
  console.log('');
  resumeElapsedTimer();
  return { shouldContinue: false };
}

// ─── RUN COMMAND RENDERER ───

export async function renderRunCommandResult(
  result: CapabilityResult
): Promise<RenderSignal> {
  pauseElapsedTimer();

  const dividerLine = DIVIDER('  ─────────────────────────');
  const status = getStatusFromResult(result);

  console.log('');
  await revealLine(`  ${BRAND('⚙️  IDRP')} → ${CAP_NAME('runCommand')}`, false);
  await revealLine(dividerLine);

  if (!result.success && !result.metadata) {
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
    if (result.error) {
      await revealLine(`  ${MUTED('Reason:')} ${DANGER(result.error)}`);
    }
    await revealLine(dividerLine);
    console.log('');
    resumeElapsedTimer();
    return { shouldContinue: false };
  }

  const meta = result.metadata as RunCommandMetadata | undefined;
  if (meta) {
    const cmdDisplay = meta.command.length > 50
      ? meta.command.slice(0, 47) + '...'
      : meta.command;
    await revealLine(`  ${MUTED('Cmd:')}    ${VALUE(cmdDisplay)}`);
    await revealLine(
      `  ${MUTED('Exit:')}   ${meta.exitCode === 0 ? SUCCESS(String(meta.exitCode)) : DANGER(String(meta.exitCode ?? 'unknown'))}`
    );
    await revealLine(`  ${MUTED('Time:')}   ${INFO(`${meta.durationMs}ms`)}`);
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
  } else {
    await revealLine(`  ${MUTED('Status:')} ${status.color(`${status.icon} ${status.text}`)}`);
  }

  await revealLine(dividerLine);
  console.log('');
  resumeElapsedTimer();
  return { shouldContinue: false };
}