// File: src/idrp/capability-prompt.ts
// IDRP Capability Prompt
// Returns the system prompt instructions that tell the model
// about available local capabilities and how to invoke them.
// Supports auto-invoke and manual modes via config.

/**
 * Returns the IDRP capability instructions to append to the system prompt.
 *
 * @param autoInvoke - Whether the model can use capabilities on its own judgment.
 *   When false, the model should only suggest what it would invoke and wait for confirmation.
 */
export function getCapabilityPrompt(autoInvoke: boolean = true): string {
  const invocationRules = autoInvoke
    ? getAutoInvokeRules()
    : getManualInvokeRules();

  return `
## LOCAL CAPABILITIES (IDRP)

You have access to local project capabilities. When you need to interact with the user's filesystem, invoke a capability using this exact format:

<capability>capabilityName</capability>
<params>{"key": "value"}</params>

### Available Capabilities:

**readFile** — Read the contents of a file in the project.
Parameters:
- path (required): Relative path to the file from the project root.
- startLine (optional): First line to return (1-based). Defaults to 1.
- endLine (optional): Last line to return (1-based). Defaults to the configured maximum.

Example:
<capability>readFile</capability>
<params>{"path": "src/auth.ts"}</params>

Example with line range:
<capability>readFile</capability>
<params>{"path": "src/auth.ts", "startLine": 50, "endLine": 100}</params>

---

**listDirectory** — List the contents of a directory in the project.
Parameters:
- path (optional): Relative path to the directory. Defaults to project root.
- recursive (optional): Whether to list recursively. Defaults to false.
- maxDepth (optional): Maximum recursion depth. Defaults to configured limit.

Example:
<capability>listDirectory</capability>
<params>{"path": "src"}</params>

Example recursive:
<capability>listDirectory</capability>
<params>{"path": "src", "recursive": true, "maxDepth": 2}</params>

---

**searchFiles** — Search for a text pattern across project files.
Parameters:
- pattern (required): The text to search for.
- directory (optional): Directory to search in. Defaults to project root.
- filePattern (optional): File extension filter (e.g., "*.ts" or ".ts").
- caseSensitive (optional): Whether search is case-sensitive. Defaults to false.

Example:
<capability>searchFiles</capability>
<params>{"pattern": "login", "filePattern": "*.ts"}</params>

Example in specific directory:
<capability>searchFiles</capability>
<params>{"pattern": "TODO", "directory": "src/core"}</params>

---

**runCommand** — Execute a shell command in the project directory.
Parameters:
- command (required): The shell command to run.

Note: Only safe commands are allowed by default (ls, cat, grep, find, git, npm, node, etc.). Dangerous or destructive commands are blocked unless the user has explicitly enabled them.

Example:
<capability>runCommand</capability>
<params>{"command": "git status"}</params>

Example:
<capability>runCommand</capability>
<params>{"command": "npm test"}</params>

${invocationRules}
`.trim();
}

/**
 * Rules for auto-invoke mode (default).
 * The model uses capabilities on its own judgment but with restraint.
 */
function getAutoInvokeRules(): string {
  return `### Rules:
- Use listDirectory to answer questions about project structure, file organization, or what files exist.
- File names are often self-documenting — do NOT read a file just to confirm what its name already tells you.
- Only use readFile when the user specifically asks about implementation details, code logic, or specific functionality inside a file.
- Only use searchFiles when you need to find where something appears across the codebase.
- Only use runCommand when the user asks you to run something, check runtime status, or when you need execution output to answer their question.
- Before invoking any capability, ask yourself: "Can I answer this well from what I already have in context?" If yes, answer directly without invoking.
- When you do need project information, prefer this discovery order: listDirectory first (to find what exists), then readFile (to examine specific files only when needed), then searchFiles (to find patterns across the codebase).
- Place invocation blocks on their own line, not inline with other text.
- After invocation, you will receive the results in the next message. Use that information to give accurate, specific answers.
- If a file is truncated, you will be told how many lines remain and how to request the next section.
- If access is denied, you will receive an error explaining why. Do not retry the same request — adapt your approach.`;
}

/**
 * Rules for manual-invoke mode.
 * The model describes what it would invoke and waits for the user to confirm.
 */
function getManualInvokeRules(): string {
  return `### Rules:
- You have access to the capabilities listed above, but you must NOT invoke them directly.
- Instead, when you need project information, describe what you would like to do and ask the user for permission.
- Format your request like this: "I'd like to read src/auth.ts to check the login implementation. Should I go ahead?"
- Only invoke the capability AFTER the user confirms (e.g., "yes", "go ahead", "do it").
- If the user says no, work with what you have and let them know if your answer might be incomplete.
- This mode exists so the user stays in full control of when the model accesses their filesystem.
- When the user explicitly tells you to read a file, search, list a directory, or run a command, that IS confirmation — invoke immediately.`;
}