// File: src/idrp/types.ts
// IDRP Local Capability Types
// Shared interfaces for all local IDRP capability handlers.

// ─── READ FILE ───────────────────────────────────────────────────

/**
 * Parameters for the readFile capability.
 */
export interface ReadFileParams {
  /** Relative or absolute path to the file within the project. */
  path: string;

  /** Optional: first line to include (1-based). Defaults to 1. */
  startLine?: number;

  /** Optional: last line to include (1-based). Defaults to maxLines from config. */
  endLine?: number;
}

/**
 * Metadata returned alongside readFile results.
 */
export interface ReadFileMetadata {
  filePath: string;
  totalLines: number;
  returnedRange: { start: number; end: number };
  wasTruncated: boolean;
}

// ─── LIST DIRECTORY ──────────────────────────────────────────────

/**
 * Parameters for the listDirectory capability.
 */
export interface ListDirectoryParams {
  /** Relative path to the directory. Defaults to project root. */
  path?: string;

  /** Whether to list recursively. Defaults to config defaultDepth > 1. */
  recursive?: boolean;

  /** Maximum depth for recursive listing. Capped by config maxDepth. */
  maxDepth?: number;
}

/**
 * Metadata returned alongside listDirectory results.
 */
export interface ListDirectoryMetadata {
  directoryPath: string;
  totalFiles: number;
  totalDirectories: number;
  depth: number;
  wasCapped: boolean;
}

// ─── SEARCH FILES ────────────────────────────────────────────────

/**
 * Parameters for the searchFiles capability.
 */
export interface SearchFilesParams {
  /** The text pattern to search for (case-insensitive by default). */
  pattern: string;

  /** Directory to search in. Defaults to project root. */
  directory?: string;

  /** File extension filter (e.g., '*.ts' or '.ts'). Searches all files if omitted. */
  filePattern?: string;

  /** Whether the search is case-sensitive. Defaults to false. */
  caseSensitive?: boolean;
}

/**
 * Metadata returned alongside searchFiles results.
 */
export interface SearchFilesMetadata {
  pattern: string;
  directory: string;
  totalMatches: number;
  filesSearched: number;
  filesWithMatches: number;
  wasCapped: boolean;
}

// ─── RUN COMMAND ─────────────────────────────────────────────────

/**
 * Parameters for the runCommand capability.
 */
export interface RunCommandParams {
  /** The shell command to execute. */
  command: string;
}

/**
 * Metadata returned alongside runCommand results.
 */
export interface RunCommandMetadata {
  command: string;
  exitCode: number | null;
  durationMs: number;
  wasTimedOut: boolean;
}

// ─── SHARED ──────────────────────────────────────────────────────

/**
 * Standard result shape for all local IDRP capability handlers.
 * Handlers never throw — they return errors as structured results
 * so the model can see and adapt to failures.
 */
export interface CapabilityResult {
  success: boolean;
  content: string;
  metadata?: ReadFileMetadata | ListDirectoryMetadata | SearchFilesMetadata | RunCommandMetadata;
  error?: string;
}

// ─── CONFIG ──────────────────────────────────────────────────────

/**
 * IDRP local configuration fields.
 * These get merged into the existing BobConfig interface.
 */
export interface IdrpLocalConfig {
  // ─── Read File ───
  /** Max lines returned per readFile call. Floor: 50. Default: 500. */
  idrpReadFileMaxLines: number;
  /** Additional blocked directories (comma-separated in CLI). */
  idrpBlockedDirectories: string[];
  /** Default blocked directories to unblock (comma-separated in CLI). */
  idrpUnblockedDirectories: string[];

  // ─── List Directory ───
  /** Max recursion depth for listDirectory. Floor: 1, ceiling: 10. Default: 3. */
  idrpListDirMaxDepth: number;
  /** Default depth when recursive is not specified. Default: 1. */
  idrpListDirDefaultDepth: number;

  // ─── Search Files ───
  /** Max search results returned. Floor: 10. Default: 50. */
  idrpSearchMaxResults: number;
  /** Max file size (bytes) to search. Files larger are skipped. Default: 100000. */
  idrpSearchMaxFileSize: number;

  // ─── Run Command ───
  /** Allow unrestricted command execution. Default: false. */
  idrpDangerousCommands: boolean;
  /** Additional commands to whitelist (comma-separated in CLI). */
  idrpCommandWhitelist: string[];
  /** Command execution timeout in seconds. Floor: 5. Default: 30. */
  idrpCommandTimeout: number;
}

// ─── DEFAULTS & RESOLUTION ───────────────────────────────────────

export const IDRP_READ_FILE_MIN_LINES = 50;
export const IDRP_READ_FILE_DEFAULT_MAX_LINES = 500;

export const IDRP_LIST_DIR_MIN_DEPTH = 1;
export const IDRP_LIST_DIR_MAX_DEPTH = 10;
export const IDRP_LIST_DIR_DEFAULT_MAX_DEPTH = 3;
export const IDRP_LIST_DIR_DEFAULT_DEPTH = 1;

export const IDRP_SEARCH_MIN_RESULTS = 10;
export const IDRP_SEARCH_DEFAULT_MAX_RESULTS = 50;
export const IDRP_SEARCH_DEFAULT_MAX_FILE_SIZE = 100_000;

export const IDRP_COMMAND_MIN_TIMEOUT = 5;
export const IDRP_COMMAND_DEFAULT_TIMEOUT = 30;

/**
 * Default safe commands that are always allowed
 * regardless of idrpCommandWhitelist config.
 */
export const DEFAULT_SAFE_COMMANDS: string[] = [
  'ls', 'cat', 'find', 'grep', 'head', 'tail', 'wc',
  'pwd', 'which', 'echo', 'env', 'date', 'whoami',
  'git log', 'git status', 'git diff', 'git branch', 'git show',
  'npm test', 'npm run', 'npm list', 'npm outdated',
  'node', 'python', 'python3',
  'tsc', 'npx', 'pnpm',
  'tree', 'file', 'sort', 'uniq', 'diff',
];

export function resolveMaxLines(configValue?: number): number {
  const value = configValue ?? IDRP_READ_FILE_DEFAULT_MAX_LINES;
  return Math.max(value, IDRP_READ_FILE_MIN_LINES);
}

export function resolveListDirDepth(configValue?: number): number {
  const value = configValue ?? IDRP_LIST_DIR_DEFAULT_MAX_DEPTH;
  return Math.min(Math.max(value, IDRP_LIST_DIR_MIN_DEPTH), IDRP_LIST_DIR_MAX_DEPTH);
}

export function resolveSearchMaxResults(configValue?: number): number {
  const value = configValue ?? IDRP_SEARCH_DEFAULT_MAX_RESULTS;
  return Math.max(value, IDRP_SEARCH_MIN_RESULTS);
}

export function resolveCommandTimeout(configValue?: number): number {
  const value = configValue ?? IDRP_COMMAND_DEFAULT_TIMEOUT;
  return Math.max(value, IDRP_COMMAND_MIN_TIMEOUT);
}

/**
 * Resolves the effective command whitelist from defaults and user config.
 * Effective list = DEFAULT_SAFE_COMMANDS + user additions
 */
export function resolveCommandWhitelist(userAdditions?: string[]): string[] {
  const additions = (userAdditions ?? []).map(s => s.trim()).filter(Boolean);
  return [...DEFAULT_SAFE_COMMANDS, ...additions];
}