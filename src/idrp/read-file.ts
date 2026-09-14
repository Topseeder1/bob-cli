// IDRP Local Capability: Read File
// Reads the contents of a file within the project sandbox.
// Returns structured content with metadata for the model to reason about.

import * as fs from 'fs';
import type {
  ReadFileParams,
  CapabilityResult,
  IdrpLocalConfig,
} from './types.js';
import { resolveMaxLines } from './types.js';
import { validatePath } from './path-sandbox.js';

/**
 * Reads a file from the local filesystem within the project sandbox.
 *
 * The model invokes this when it needs to see actual source code
 * or file contents during a conversation. Results are injected
 * back into the conversation context.
 *
 * @param params - The file path and optional line range from the model.
 * @param projectRoot - The project root directory. Defaults to process.cwd().
 * @param config - IDRP local config for max lines and sandbox settings.
 * @returns A CapabilityResult with file contents or a clear error.
 */
export function readFile(
  params: ReadFileParams,
  projectRoot: string = process.cwd(),
  config?: Partial<IdrpLocalConfig>
): CapabilityResult {
  // Step 1: Validate the path against the sandbox
  const validation = validatePath(params.path, projectRoot, config);

  if (!validation.allowed) {
    return {
      success: false,
      content: '',
      error: validation.reason,
    };
  }

  const { resolvedPath, relativePath } = validation;

  // Step 2: Read the file
  let rawContent: string;
  try {
    rawContent = fs.readFileSync(resolvedPath!, 'utf-8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      content: '',
      error: `Failed to read "${relativePath}": ${message}`,
    };
  }

  // Step 3: Split into lines
  const allLines = rawContent.split('\n');
  const totalLines = allLines.length;

  // Step 4: Determine the line range to return
  const maxLines = resolveMaxLines(config?.idrpReadFileMaxLines);
  const startLine = Math.max(1, params.startLine ?? 1);
  const requestedEnd = params.endLine ?? startLine + maxLines - 1;
  const endLine = Math.min(requestedEnd, totalLines);

  // Apply the max lines cap to the effective range
  const effectiveEnd = Math.min(endLine, startLine + maxLines - 1);

  // Step 5: Extract the requested slice (convert to 0-based index)
  const slicedLines = allLines.slice(startLine - 1, effectiveEnd);
  const wasTruncated = effectiveEnd < totalLines && !params.endLine;

  // Step 6: Build line-numbered content
  const numberedLines = slicedLines.map((line, index) => {
    const lineNum = String(startLine + index).padStart(5, ' ');
    return `${lineNum}: ${line}`;
  });

  // Step 7: Assemble the final content
  let content = `📄 ${relativePath} (${totalLines} lines)\n`;
  content += `--- lines ${startLine}-${effectiveEnd} ---\n`;
  content += numberedLines.join('\n');

  if (wasTruncated) {
    const remaining = totalLines - effectiveEnd;
    content += `\n--- truncated: ${remaining} more lines remaining ---`;
    content += `\n--- to see more, use readFile with startLine: ${effectiveEnd + 1} ---`;
  }

  return {
    success: true,
    content,
    metadata: {
      filePath: relativePath!,
      totalLines,
      returnedRange: {
        start: startLine,
        end: effectiveEnd,
      },
      wasTruncated,
    },
  };
}