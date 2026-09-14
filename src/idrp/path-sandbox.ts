// IDRP Path Sandbox
// Validates and resolves file paths within the project boundary.
// Every local capability handler calls this before touching the filesystem.

import * as path from 'path';
import * as fs from 'fs';
import type { IdrpLocalConfig } from './types';

/**
 * Result of a path validation check.
 */
export interface PathValidationResult {
  /** Whether the path is allowed. */
  allowed: boolean;

  /** The resolved absolute path (only set when allowed). */
  resolvedPath?: string;

  /** The resolved path relative to project root (only set when allowed). */
  relativePath?: string;

  /** Denial reason (only set when not allowed). */
  reason?: string;
}

/**
 * Built-in directories that are blocked by default.
 * Users can override specific entries via idrpUnblockedDirectories config.
 * Users can add more via idrpBlockedDirectories config.
 */
const DEFAULT_BLOCKED_DIRECTORIES: string[] = [
  '.git/objects',
  '.git/hooks',
  'node_modules',
  '.bob-backups',
  '.env',
];

/**
 * File extensions that indicate binary content.
 * Binary files are useless to the model and waste context.
 */
const BINARY_EXTENSIONS: Set<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot',
  '.sqlite', '.db',
]);

/**
 * Computes the effective blocked directory list from defaults and user config.
 * 
 * Effective list = (defaults - unblocked) + user additions
 * 
 * @param config - The IDRP local config (optional — uses pure defaults if not provided).
 * @returns The resolved list of blocked directory prefixes.
 */
export function resolveBlockedDirectories(config?: Partial<IdrpLocalConfig>): string[] {
  const unblocked = new Set(
    (config?.idrpUnblockedDirectories ?? []).map(d => d.trim()).filter(Boolean)
  );

  const userAdditions = (config?.idrpBlockedDirectories ?? [])
    .map(d => d.trim())
    .filter(Boolean);

  // Defaults minus unblocked, plus user additions
  const effective = DEFAULT_BLOCKED_DIRECTORIES
    .filter(d => !unblocked.has(d))
    .concat(userAdditions);

  return effective;
}

/**
 * Validates a requested file path against the project sandbox.
 * 
 * @param requestedPath - The path the model wants to access (relative or absolute).
 * @param projectRoot - The project root directory. Defaults to process.cwd().
 * @param config - IDRP local config for user-customized blocked/unblocked directories.
 * @returns A PathValidationResult indicating whether access is allowed.
 */
export function validatePath(
  requestedPath: string,
  projectRoot: string = process.cwd(),
  config?: Partial<IdrpLocalConfig>
): PathValidationResult {
  // Normalize the project root
  const normalizedRoot = path.resolve(projectRoot);

  // Resolve the requested path against the project root
  const resolvedPath = path.resolve(normalizedRoot, requestedPath);

  // Check: does the resolved path stay within the project?
  // This check is NOT configurable — it's a hard security boundary.
  if (!resolvedPath.startsWith(normalizedRoot + path.sep) && resolvedPath !== normalizedRoot) {
    return {
      allowed: false,
      reason: `Path resolves outside project directory. Requested: "${requestedPath}" → Resolved: "${resolvedPath}" — Project root: "${normalizedRoot}"`,
    };
  }

  // Get the relative path for blocked directory checks
  const relativePath = path.relative(normalizedRoot, resolvedPath);

  // Check: is the path inside a blocked directory?
  const blockedDirs = resolveBlockedDirectories(config);
  for (const blocked of blockedDirs) {
    if (relativePath === blocked || relativePath.startsWith(blocked + path.sep)) {
      return {
        allowed: false,
        reason: `Access to "${blocked}" is restricted. This directory contains internal state or generated content that is not useful for analysis. You can unblock this via: bob config set idrpUnblockedDirectories "${blocked}"`,
      };
    }
  }

  // Check: is this a binary file?
  const ext = path.extname(resolvedPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return {
      allowed: false,
      reason: `"${relativePath}" is a binary file (${ext}). Binary files cannot be meaningfully read as text.`,
    };
  }

  // Check: does the file actually exist?
  if (!fs.existsSync(resolvedPath)) {
    return {
      allowed: false,
      reason: `File not found: "${relativePath}". Verify the path and try again.`,
    };
  }

  // Check: is it actually a file (not a directory)?
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    return {
      allowed: false,
      reason: `"${relativePath}" is a directory, not a file. Use listDirectory to explore directory contents.`,
    };
  }

  return {
    allowed: true,
    resolvedPath,
    relativePath,
  };
}