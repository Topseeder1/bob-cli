// File: src/idrp/local-router.ts
// IDRP Local Router
// Detects capability invocations in model responses, executes handlers,
// renders user feedback, and manages the invoke-execute-reinject cycle.

import type {
  ReadFileParams,
  ListDirectoryParams,
  SearchFilesParams,
  RunCommandParams,
  CapabilityResult,
  IdrpLocalConfig,
} from './types.js';
import { readFile } from './read-file.js';
import { listDirectory } from './list-directory.js';
import { searchFiles } from './search-files.js';
import { runCommand } from './run-command.js';
import {
  renderReadFileResult,
  renderListDirectoryResult,
  renderSearchFilesResult,
  renderRunCommandResult,
  type RenderSignal,
} from './capability-renderer.js';

/**
 * A parsed capability invocation extracted from a model response.
 */
export interface ParsedInvocation {
  capability: string;
  params: Record<string, unknown>;
  rawMatch: string;
}

/**
 * Result of processing a model response through the IDRP router.
 */
export interface RouterResult {
  shouldRecall: boolean;
  displayText: string;
  contextInjections: string[];
}

/**
 * Regex pattern to detect capability invocations in model responses.
 * NOTE: This regex is NOT global — we recreate it per call to avoid
 * lastIndex state issues across multiple processResponse calls,
 * especially on Windows paths where backslashes in params can cause
 * silent mismatches when lastIndex is stale.
 */
function buildInvocationPattern(): RegExp {
  return /<capability>\s*([\w]+)\s*<\/capability>\s*<params>\s*([\s\S]*?)\s*<\/params>/g;
}

/**
 * Registry of local capability handlers.
 */
const CAPABILITY_HANDLERS: Record<
  string,
  (params: Record<string, unknown>, projectRoot: string, config?: Partial<IdrpLocalConfig>) => CapabilityResult
> = {
  readFile: (params, root, config) =>
    readFile(params as unknown as ReadFileParams, root, config),
  listDirectory: (params, root, config) =>
    listDirectory(params as unknown as ListDirectoryParams, root, config),
  searchFiles: (params, root, config) =>
    searchFiles(params as unknown as SearchFilesParams, root, config),
  runCommand: (params, root, config) =>
    runCommand(params as unknown as RunCommandParams, root, config),
};

/**
 * Registry of capability renderers.
 */
const CAPABILITY_RENDERERS: Record<
  string,
  (result: CapabilityResult) => Promise<RenderSignal>
> = {
  readFile: renderReadFileResult,
  listDirectory: renderListDirectoryResult,
  searchFiles: renderSearchFilesResult,
  runCommand: renderRunCommandResult,
};

/**
 * Parses capability invocations from a model response string.
 * Creates a fresh regex per call to avoid lastIndex state pollution.
 */
export function parseInvocations(responseText: string): ParsedInvocation[] {
  const invocations: ParsedInvocation[] = [];
  const pattern = buildInvocationPattern();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(responseText)) !== null) {
    const capability = match[1].trim();
    const rawParams = match[2].trim();

    try {
      const params = JSON.parse(rawParams);
      invocations.push({ capability, params, rawMatch: match[0] });
    } catch {
      // Malformed params — skip silently
      continue;
    }
  }

  return invocations;
}

/**
 * Processes a model response through the IDRP local router.
 * Main entry point for the interactive chat loop.
 */
export async function processResponse(
  responseText: string,
  projectRoot: string = process.cwd(),
  config?: Partial<IdrpLocalConfig>
): Promise<RouterResult> {
  const invocations = parseInvocations(responseText);

  if (invocations.length === 0) {
    return { shouldRecall: false, displayText: responseText, contextInjections: [] };
  }

  let displayText = responseText;
  const contextInjections: string[] = [];

  for (const invocation of invocations) {
    displayText = displayText.replace(invocation.rawMatch, '').trim();

    const handler = CAPABILITY_HANDLERS[invocation.capability];
    if (!handler) {
      const errorMsg = `Unknown IDRP capability: "${invocation.capability}". Available: ${Object.keys(CAPABILITY_HANDLERS).join(', ')}`;
      contextInjections.push(errorMsg);
      continue;
    }

    const result = handler(invocation.params, projectRoot, config);

    const renderer = CAPABILITY_RENDERERS[invocation.capability];
    let signal: RenderSignal = { shouldContinue: false };

    if (renderer) {
      signal = await renderer(result);
    }

    if (result.success) {
      contextInjections.push(result.content);
    } else {
      contextInjections.push(`IDRP Error (${invocation.capability}): ${result.error}`);
    }

    // Handle follow-up (readFile truncation prompt)
    if (signal.shouldContinue && signal.followUpParams) {
      const followUpResult = handler(signal.followUpParams, projectRoot, config);
      if (renderer) {
        const followUpSignal = await renderer(followUpResult);
        if (followUpResult.success) {
          contextInjections.push(followUpResult.content);
        }
        // One more level of follow-up
        if (followUpSignal.shouldContinue && followUpSignal.followUpParams) {
          const thirdResult = handler(followUpSignal.followUpParams, projectRoot, config);
          if (renderer) await renderer(thirdResult);
          if (thirdResult.success) contextInjections.push(thirdResult.content);
        }
      }
    }
  }

  return {
    shouldRecall: contextInjections.length > 0,
    displayText,
    contextInjections,
  };
}