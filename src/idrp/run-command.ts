// IDRP Local Capability: Run Command
// Executes shell commands within the project directory.
// Enforces a safety whitelist by default with optional unrestricted mode.

import { execSync } from 'child_process';
import type {
  RunCommandParams,
  CapabilityResult,
  IdrpLocalConfig,
  RunCommandMetadata,
} from './types.js';
import {
  resolveCommandTimeout,
  resolveCommandWhitelist,
  DEFAULT_SAFE_COMMANDS,
} from './types.js';

/**
 * Commands that are NEVER allowed, even in dangerous mode.
 * These can cause immediate, irreversible system damage.
 */
const ABSOLUTE_BLOCKLIST: string[] = [
  'rm -rf /',
  'rm -rf ~',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',  // fork bomb
  '> /dev/sda',
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
];

/**
 * Executes a shell command within the project directory.
 *
 * The model invokes this to run builds, tests, git commands,
 * file searches, and other shell operations. Commands are checked
 * against a whitelist unless dangerous mode is explicitly enabled.
 *
 * @param params - The command to execute.
 * @param projectRoot - The project root directory (used as cwd).
 * @param config - IDRP local config for whitelist, timeout, and danger mode.
 * @returns A CapabilityResult with command output or error.
 */
export function runCommand(
  params: RunCommandParams,
  projectRoot: string = process.cwd(),
  config?: Partial<IdrpLocalConfig>
): CapabilityResult {
  const command = params.command?.trim();

  if (!command) {
    return {
      success: false,
      content: '',
      error: 'Command cannot be empty.',
    };
  }

  // Absolute blocklist — checked regardless of dangerous mode
  const commandLower = command.toLowerCase();
  for (const blocked of ABSOLUTE_BLOCKLIST) {
    if (commandLower.includes(blocked)) {
      return {
        success: false,
        content: '',
        error: `Command blocked (absolute restriction): contains "${blocked}". This command is never allowed as it can cause irreversible system damage.`,
      };
    }
  }

  const dangerousMode = config?.idrpDangerousCommands ?? false;

  // If not in dangerous mode, check whitelist
  if (!dangerousMode) {
    const whitelist = resolveCommandWhitelist(config?.idrpCommandWhitelist);
    const isAllowed = whitelist.some(prefix => {
      const normalizedPrefix = prefix.toLowerCase().trim();
      return commandLower.startsWith(normalizedPrefix);
    });

    if (!isAllowed) {
      const availableCommands = [...new Set([...DEFAULT_SAFE_COMMANDS, ...(config?.idrpCommandWhitelist ?? [])])]
        .sort()
        .join(', ');

      return {
        success: false,
        content: '',
        error: `Command not in whitelist: "${command}". Allowed command prefixes: ${availableCommands}. To add commands: bob config set idrpCommandWhitelist "your-command". To allow all commands: bob config set idrpDangerousCommands true`,
      };
    }
  }

  // Resolve timeout
  const timeoutSeconds = resolveCommandTimeout(config?.idrpCommandTimeout);
  const timeoutMs = timeoutSeconds * 1000;

  // Execute the command
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = 0;
  let wasTimedOut = false;

  try {
    const result = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB output limit
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Don't leak sensitive env vars to commands
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        API_KEY: undefined,
        SECRET: undefined,
        TOKEN: undefined,
        PASSWORD: undefined,
      },
    });

    stdout = typeof result === 'string' ? result : '';
  } catch (err: unknown) {
    if (err && typeof err === 'object') {
      const execErr = err as {
        stdout?: string;
        stderr?: string;
        status?: number;
        killed?: boolean;
        signal?: string;
      };

      stdout = execErr.stdout || '';
      stderr = execErr.stderr || '';
      exitCode = execErr.status ?? null;

      if (execErr.killed || execErr.signal === 'SIGTERM') {
        wasTimedOut = true;
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // Trim output
  stdout = stdout.trim();
  stderr = stderr.trim();

  // Cap output length to prevent context flooding
  const MAX_OUTPUT_CHARS = 50_000;
  let outputCapped = false;

  if (stdout.length > MAX_OUTPUT_CHARS) {
    stdout = stdout.slice(0, MAX_OUTPUT_CHARS) + '\n[... output truncated]';
    outputCapped = true;
  }
  if (stderr.length > MAX_OUTPUT_CHARS) {
    stderr = stderr.slice(0, MAX_OUTPUT_CHARS) + '\n[... stderr truncated]';
    outputCapped = true;
  }

  // Build result content
  let content = `⚙️ Command: ${command}\n`;
  content += `--- exit: ${exitCode ?? 'unknown'} | ${durationMs}ms${wasTimedOut ? ' | TIMED OUT' : ''}${dangerousMode ? ' | ⚠️ unrestricted mode' : ''} ---\n`;

  if (stdout) {
    content += stdout;
  }
  if (stderr) {
    content += `\n--- stderr ---\n${stderr}`;
  }
  if (!stdout && !stderr) {
    content += '(no output)';
  }
  if (outputCapped) {
    content += `\n--- output capped at ${MAX_OUTPUT_CHARS} characters ---`;
  }

  return {
    success: exitCode === 0 && !wasTimedOut,
    content,
    metadata: {
      command,
      exitCode,
      durationMs,
      wasTimedOut,
    } as RunCommandMetadata,
  };
}