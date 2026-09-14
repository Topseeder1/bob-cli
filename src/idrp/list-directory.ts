// IDRP Local Capability: List Directory
// Explores project directory structure within the sandbox.
// Returns a formatted tree view the model can use to discover files.

import * as fs from 'fs';
import * as path from 'path';
import type {
  ListDirectoryParams,
  CapabilityResult,
  IdrpLocalConfig,
  ListDirectoryMetadata,
} from './types.js';
import { resolveListDirDepth, IDRP_LIST_DIR_DEFAULT_DEPTH } from './types.js';
import { validatePath, resolveBlockedDirectories } from './path-sandbox.js';

/**
 * Lists the contents of a directory within the project sandbox.
 *
 * The model invokes this to discover what files and folders exist
 * before deciding what to read or search. Supports recursive listing
 * with configurable depth limits.
 *
 * @param params - Directory path and recursion options.
 * @param projectRoot - The project root directory.
 * @param config - IDRP local config for depth limits and sandbox settings.
 * @returns A CapabilityResult with the directory listing or error.
 */
export function listDirectory(
  params: ListDirectoryParams,
  projectRoot: string = process.cwd(),
  config?: Partial<IdrpLocalConfig>
): CapabilityResult {
  const targetPath = params.path || '.';
  const normalizedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(normalizedRoot, targetPath);

  // Validate the directory path is within sandbox
  if (!resolvedPath.startsWith(normalizedRoot + path.sep) && resolvedPath !== normalizedRoot) {
    return {
      success: false,
      content: '',
      error: `Path resolves outside project directory. Requested: "${targetPath}" → Resolved: "${resolvedPath}"`,
    };
  }

  // Check existence
  if (!fs.existsSync(resolvedPath)) {
    return {
      success: false,
      content: '',
      error: `Directory not found: "${targetPath}". Verify the path and try again.`,
    };
  }

  // Check it's actually a directory
  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    return {
      success: false,
      content: '',
      error: `"${targetPath}" is a file, not a directory. Use readFile to view its contents.`,
    };
  }

  // Resolve depth settings
  const maxDepth = resolveListDirDepth(config?.idrpListDirMaxDepth);
  const defaultDepth = config?.idrpListDirDefaultDepth ?? IDRP_LIST_DIR_DEFAULT_DEPTH;
  const requestedDepth = params.recursive
    ? Math.min(params.maxDepth ?? maxDepth, maxDepth)
    : Math.min(defaultDepth, maxDepth);

  // Get blocked directories for filtering
  const blockedDirs = resolveBlockedDirectories(config);

  // Build the tree
  const relativePath = path.relative(normalizedRoot, resolvedPath) || '.';
  let totalFiles = 0;
  let totalDirectories = 0;
  let wasCapped = false;
  const MAX_ENTRIES = 500; // Hard cap to prevent massive outputs
  let entryCount = 0;

  function buildTree(dirPath: string, depth: number, prefix: string): string[] {
    if (depth > requestedDepth || entryCount >= MAX_ENTRIES) {
      if (entryCount >= MAX_ENTRIES) wasCapped = true;
      return [];
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [`${prefix}[permission denied]`];
    }

    // Sort: directories first, then files, alphabetically within each group
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const lines: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      if (entryCount >= MAX_ENTRIES) {
        wasCapped = true;
        break;
      }

      const entry = entries[i];
      const entryRelPath = path.relative(normalizedRoot, path.join(dirPath, entry.name));
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');

      // Check if this entry is in a blocked directory
      const isBlocked = blockedDirs.some(
        blocked => entryRelPath === blocked || entryRelPath.startsWith(blocked + path.sep)
      );

      if (entry.isDirectory()) {
        totalDirectories++;
        entryCount++;

        if (isBlocked) {
          lines.push(`${prefix}${connector}📁 ${entry.name}/ [restricted]`);
        } else {
          lines.push(`${prefix}${connector}📁 ${entry.name}/`);
          // Recurse into subdirectory
          const childLines = buildTree(
            path.join(dirPath, entry.name),
            depth + 1,
            childPrefix
          );
          lines.push(...childLines);
        }
      } else {
        totalFiles++;
        entryCount++;
        lines.push(`${prefix}${connector}📄 ${entry.name}`);
      }
    }

    return lines;
  }

  const treeLines = buildTree(resolvedPath, 1, '');

  // Assemble output
  let content = `📁 ${relativePath}/ (${totalFiles} files, ${totalDirectories} directories)\n`;
  content += `--- depth: ${requestedDepth}, max: ${maxDepth} ---\n`;
  content += treeLines.join('\n');

  if (wasCapped) {
    content += `\n--- listing capped at ${MAX_ENTRIES} entries ---`;
    content += `\n--- use listDirectory with a specific subdirectory for more detail ---`;
  }

  return {
    success: true,
    content,
    metadata: {
      directoryPath: relativePath,
      totalFiles,
      totalDirectories,
      depth: requestedDepth,
      wasCapped,
    } as ListDirectoryMetadata,
  };
}