// IDRP Agent Adapter
// Non-interactive wrapper around the IDRP router for autonomous contexts.
// Used by UserBob, crew agents, and the Director — any context where
// the model runs without a human watching and approving each step.
//
// Key differences from the interactive router:
// - No truncation y/n prompts — auto-continues to next section
// - No line-by-line reveal delay — tiles render instantly
// - Always auto-invoke — agents decide on their own
// - Still renders tiles for visibility (simulation output is watched)
// - Still respects all config: line limits, blocked dirs, whitelist, timeout

import type {
  ReadFileParams,
  ListDirectoryParams,
  SearchFilesParams,
  RunCommandParams,
  CapabilityResult,
  IdrpLocalConfig,
  ReadFileMetadata,
} from './types.js';
import { readFile } from './read-file.js';
import { listDirectory } from './list-directory.js';
import { searchFiles } from './search-files.js';
import { runCommand } from './run-command.js';
import { getCapabilityPrompt } from './capability-prompt.js';
import chalk from 'chalk';

// ─── DESIGN TOKENS (same as capability-renderer) ───

const BRAND    = chalk.hex('#E66F24');
const CAP_NAME = chalk.white.bold;
const SUCCESS  = chalk.hex('#66BB6A');
const CAUTION  = chalk.hex('#FFC107');
const DANGER   = chalk.hex('#EF5350');
const INFO     = chalk.hex('#26C6DA');
const MUTED    = chalk.hex('#78909C');
const DIVIDER  = chalk.hex('#455A64');
const VALUE    = chalk.white;

/**
 * Result of processing a model response through the agent adapter.
 * Same shape as RouterResult for compatibility.
 */
export interface AgentRouterResult {
  shouldRecall: boolean;
  displayText: string;
  contextInjections: string[];
}

/**
 * Regex pattern to detect capability invocations.
 * Same as local-router.ts — shared pattern.
 */
const INVOCATION_PATTERN =
  /<capability>\s*([\w]+)\s*<\/capability>\s*<params>\s*([\s\S]*?)\s*<\/params>/g;

/**
 * Handler registry — same capabilities as the interactive router.
 */
const HANDLERS: Record<
  string,
  (params: Record<string, unknown>, root: string, config?: Partial<IdrpLocalConfig>) => CapabilityResult
> = {
  readFile: (p, r, c) => readFile(p as unknown as ReadFileParams, r, c),
  listDirectory: (p, r, c) => listDirectory(p as unknown as ListDirectoryParams, r, c),
  searchFiles: (p, r, c) => searchFiles(p as unknown as SearchFilesParams, r, c),
  runCommand: (p, r, c) => runCommand(p as unknown as RunCommandParams, r, c),
};

/**
 * Renders a compact, non-blocking tile for autonomous contexts.
 * No delays, no prompts — just immediate visual feedback.
 */
function renderAgentTile(capability: string, result: CapabilityResult): void {
  const isSuccess = result.success;
  const statusIcon = isSuccess ? SUCCESS('✓') : DANGER('✗');
  const statusText = isSuccess ? 'done' : 'error';

  // Extract a short summary based on capability type
  let detail = '';
  if (result.metadata) {
    const meta = result.metadata;
    if ('filePath' in meta) detail = (meta as ReadFileMetadata).filePath;
    if ('directoryPath' in meta) detail = (meta as any).directoryPath + '/';
    if ('pattern' in meta) detail = `"${(meta as any).pattern}"`;
    if ('command' in meta) {
      const cmd = (meta as any).command;
      detail = cmd.length > 40 ? cmd.slice(0, 37) + '...' : cmd;
    }
  }

  // Check for truncation/capping warnings
  let warning = '';
  if (result.metadata && 'wasTruncated' in result.metadata && result.metadata.wasTruncated) {
    warning = CAUTION(' (truncated)');
  }
  if (result.metadata && 'wasCapped' in result.metadata && (result.metadata as any).wasCapped) {
    warning = CAUTION(' (capped)');
  }

  console.log(
    `  ${BRAND('IDRP')} ${MUTED('→')} ${CAP_NAME(capability)} ${MUTED('→')} ${VALUE(detail)} ${statusIcon} ${MUTED(statusText)}${warning}`
  );
}

/**
 * Returns the capability prompt configured for autonomous operation.
 * Always auto-invoke, no manual confirmation.
 */
export function getAgentCapabilityPrompt(): string {
  return getCapabilityPrompt(true);
}

/**
 * Processes a model response for autonomous (non-interactive) contexts.
 *
 * This is the main entry point for UserBob, crew agents, and the Director.
 * It detects invocations, executes them, renders compact feedback,
 * auto-continues on truncation, and returns context injections.
 *
 * @param responseText - The raw model response text.
 * @param projectRoot - The project root directory.
 * @param config - IDRP local config.
 * @returns An AgentRouterResult with display text and context injections.
 */
export function processResponseForAgent(
  responseText: string,
  projectRoot: string = process.cwd(),
  config?: Partial<IdrpLocalConfig>
): AgentRouterResult {
  const invocations: Array<{ capability: string; params: Record<string, unknown>; rawMatch: string }> = [];
  let match: RegExpExecArray | null;

  INVOCATION_PATTERN.lastIndex = 0;
  while ((match = INVOCATION_PATTERN.exec(responseText)) !== null) {
    try {
      const params = JSON.parse(match[2].trim());
      invocations.push({ capability: match[1].trim(), params, rawMatch: match[0] });
    } catch {
      continue;
    }
  }

  if (invocations.length === 0) {
    return { shouldRecall: false, displayText: responseText, contextInjections: [] };
  }

  let displayText = responseText;
  const contextInjections: string[] = [];

  for (const inv of invocations) {
    displayText = displayText.replace(inv.rawMatch, '').trim();

    const handler = HANDLERS[inv.capability];
    if (!handler) {
      contextInjections.push(`Unknown IDRP capability: "${inv.capability}". Available: ${Object.keys(HANDLERS).join(', ')}`);
      continue;
    }

    // Execute the capability
    const result = handler(inv.params, projectRoot, config);

    // Render compact tile (no delay, no prompt)
    renderAgentTile(inv.capability, result);

    // Inject result into context
    if (result.success) {
      contextInjections.push(result.content);
    } else {
      contextInjections.push(`IDRP Error (${inv.capability}): ${result.error}`);
    }

    // Auto-continue on truncation (readFile only)
    if (
      result.success &&
      inv.capability === 'readFile' &&
      result.metadata &&
      'wasTruncated' in result.metadata &&
      result.metadata.wasTruncated
    ) {
      const meta = result.metadata as ReadFileMetadata;
      const followUp = handler(
        { path: meta.filePath, startLine: meta.returnedRange.end + 1 },
        projectRoot,
        config
      );
      renderAgentTile(inv.capability, followUp);
      if (followUp.success) {
        contextInjections.push(followUp.content);
      }
    }
  }

  return {
    shouldRecall: contextInjections.length > 0,
    displayText,
    contextInjections,
  };
}