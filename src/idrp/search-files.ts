// IDRP Local Capability: Search Files
// Searches for text patterns across project files.
// Returns matching lines with file paths and line numbers.

import * as fs from 'fs';
import * as path from 'path';
import type {
  SearchFilesParams,
  CapabilityResult,
  IdrpLocalConfig,
  SearchFilesMetadata,
} from './types.js';
import {
  resolveSearchMaxResults,
  IDRP_SEARCH_DEFAULT_MAX_FILE_SIZE,
} from './types.js';
import { resolveBlockedDirectories } from './path-sandbox.js';

/**
 * Binary file extensions to skip during search.
 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot',
  '.sqlite', '.db',
]);

/**
 * Searches for a text pattern across files in the project.
 *
 * The model invokes this to find where specific code, variables,
 * imports, or text patterns appear across the codebase without
 * needing to know individual file paths.
 *
 * @param params - Search pattern, directory, and filters.
 * @param projectRoot - The project root directory.
 * @param config - IDRP local config for result limits and sandbox settings.
 * @returns A CapabilityResult with matching lines or error.
 */
export function searchFiles(
  params: SearchFilesParams,
  projectRoot: string = process.cwd(),
  config?: Partial<IdrpLocalConfig>
): CapabilityResult {
  if (!params.pattern || params.pattern.trim().length === 0) {
    return {
      success: false,
      content: '',
      error: 'Search pattern cannot be empty. Provide a text pattern to search for.',
    };
  }

  const normalizedRoot = path.resolve(projectRoot);
  const searchDir = params.directory
    ? path.resolve(normalizedRoot, params.directory)
    : normalizedRoot;

  // Validate search directory is within sandbox
  if (!searchDir.startsWith(normalizedRoot + path.sep) && searchDir !== normalizedRoot) {
    return {
      success: false,
      content: '',
      error: `Search directory resolves outside project: "${params.directory}"`,
    };
  }

  if (!fs.existsSync(searchDir) || !fs.statSync(searchDir).isDirectory()) {
    return {
      success: false,
      content: '',
      error: `Search directory not found: "${params.directory || '.'}"`,
    };
  }

  // Resolve config
  const maxResults = resolveSearchMaxResults(config?.idrpSearchMaxResults);
  const maxFileSize = config?.idrpSearchMaxFileSize ?? IDRP_SEARCH_DEFAULT_MAX_FILE_SIZE;
  const blockedDirs = resolveBlockedDirectories(config);

  // Compile the search pattern
  const flags = params.caseSensitive ? 'g' : 'gi';
  let regex: RegExp;
  try {
    // Escape special regex characters for literal search
    const escaped = params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped, flags);
  } catch {
    return {
      success: false,
      content: '',
      error: `Invalid search pattern: "${params.pattern}"`,
    };
  }

  // Resolve file extension filter
  let extFilter: string | null = null;
  if (params.filePattern) {
    extFilter = params.filePattern.startsWith('.')
      ? params.filePattern.toLowerCase()
      : params.filePattern.startsWith('*.')
        ? params.filePattern.slice(1).toLowerCase()
        : `.${params.filePattern.toLowerCase()}`;
  }

  // Walk the directory tree and search
  const matches: string[] = [];
  let filesSearched = 0;
  let filesWithMatches = 0;
  let wasCapped = false;

  function walkAndSearch(dirPath: string): void {
    if (matches.length >= maxResults) {
      wasCapped = true;
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matches.length >= maxResults) {
        wasCapped = true;
        return;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(normalizedRoot, fullPath);

      // Skip blocked directories
      const isBlocked = blockedDirs.some(
        blocked => relPath === blocked || relPath.startsWith(blocked + path.sep)
      );
      if (isBlocked) continue;

      if (entry.isDirectory()) {
        walkAndSearch(fullPath);
      } else if (entry.isFile()) {
        // Skip binary files
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        // Apply extension filter
        if (extFilter && ext !== extFilter) continue;

        // Skip files that are too large
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > maxFileSize) continue;
        } catch {
          continue;
        }

        // Read and search the file
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          filesSearched++;
          let fileHasMatch = false;

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxResults) {
              wasCapped = true;
              break;
            }

            regex.lastIndex = 0;
            if (regex.test(lines[i])) {
              if (!fileHasMatch) {
                fileHasMatch = true;
                filesWithMatches++;
              }
              const lineNum = String(i + 1).padStart(5, ' ');
              matches.push(`${relPath}:${lineNum}: ${lines[i].trim()}`);
            }
          }
        } catch {
          // Skip unreadable files silently
          continue;
        }
      }
    }
  }

  walkAndSearch(searchDir);

  const searchRelDir = path.relative(normalizedRoot, searchDir) || '.';

  if (matches.length === 0) {
    return {
      success: true,
      content: `🔍 No matches found for "${params.pattern}" in ${searchRelDir}/ (searched ${filesSearched} files)`,
      metadata: {
        pattern: params.pattern,
        directory: searchRelDir,
        totalMatches: 0,
        filesSearched,
        filesWithMatches: 0,
        wasCapped: false,
      } as SearchFilesMetadata,
    };
  }

  let content = `🔍 Search: "${params.pattern}" in ${searchRelDir}/`;
  if (extFilter) content += ` (${extFilter} files only)`;
  content += `\n--- ${matches.length} matches in ${filesWithMatches} files (${filesSearched} searched) ---\n`;
  content += matches.join('\n');

  if (wasCapped) {
    content += `\n--- results capped at ${maxResults} matches ---`;
    content += `\n--- narrow your search with a filePattern or specific directory ---`;
  }

  return {
    success: true,
    content,
    metadata: {
      pattern: params.pattern,
      directory: searchRelDir,
      totalMatches: matches.length,
      filesSearched,
      filesWithMatches,
      wasCapped,
    } as SearchFilesMetadata,
  };
}