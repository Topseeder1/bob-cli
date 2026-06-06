import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';

export interface ProposedFile {
  filePath: string;
  content: string;
  isNew: boolean;
}

/**
 * Extracts a proposed file from Bob's response.
 * Handles multiple patterns:
 * - // File: src/core/auth.ts
 * - // src/core/auth.ts
 * - Detects path-like first line in code blocks
 */
export function extractProposedFile(response: string): ProposedFile | null {
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/;
  const match = response.match(codeBlockRegex);

  if (!match) return null;

  const codeContent = match[1].trim();
  const lines = codeContent.split('\n');

  if (lines.length === 0) return null;

  const firstLine = lines[0].trim();

  // Pattern 1: // File: src/core/auth.ts
  let filePathMatch = firstLine.match(/^\/\/\s*File:\s*(.+)$/);

  // Pattern 2: // src/core/auth.ts (just a path-like comment)
  if (!filePathMatch) {
    filePathMatch = firstLine.match(/^\/\/\s*([\w\-\.\/\\]+\.\w+)\s*$/);
  }

  // Pattern 3: # File: src/core/auth.py (for Python/shell)
  if (!filePathMatch) {
    filePathMatch = firstLine.match(/^#\s*File:\s*(.+)$/);
  }

  // Pattern 4: # src/core/auth.py
  if (!filePathMatch) {
    filePathMatch = firstLine.match(/^#\s*([\w\-\.\/\\]+\.\w+)\s*$/);
  }

  if (!filePathMatch) return null;

  const filePath = filePathMatch[1].trim();

  // Validate it looks like a real file path
  if (!filePath.includes('/') && !filePath.includes('\\')) return null;
  if (!filePath.includes('.')) return null;

  const fileContent = lines.slice(1).join('\n').trim();
  const absolutePath = path.join(process.cwd(), filePath);
  const isNew = !fs.existsSync(absolutePath);

  return {
    filePath,
    content: fileContent,
    isNew,
  };
}

/**
 * Strips the code block from Bob's response text for cleaner display.
 * Returns the response with the code block removed.
 */
export function stripCodeBlockFromResponse(response: string): string {
  return response.replace(/```[\w]*\n[\s\S]*?```/g, '').trim();
}

/**
 * Prompts the user for approval and writes the file to disk.
 * Returns true if written, false if skipped.
 */
export async function proposeAndWriteFile(proposed: ProposedFile): Promise<boolean> {
  const absolutePath = path.join(process.cwd(), proposed.filePath);
  const action = proposed.isNew ? 'CREATE' : 'UPDATE';
  const icon = proposed.isNew ? '📄' : '✏️';
  const color = proposed.isNew ? chalk.green : chalk.yellow;
  const totalLines = proposed.content.split('\n').length;

  console.log('');
  console.log(color(`  ┌─────────────────────────────────────────┐`));
  console.log(color(`  │ ${icon}  ${action}: ${proposed.filePath} (${totalLines} lines)`));
  console.log(color(`  ├─────────────────────────────────────────┤`));

  // Show preview (first 6 lines only)
  const previewLines = proposed.content.split('\n').slice(0, 6);
  for (const line of previewLines) {
    console.log(chalk.gray(`  │ ${line}`));
  }
  if (totalLines > 6) {
    console.log(chalk.gray(`  │ ... (${totalLines - 6} more lines)`));
  }

  console.log(color(`  └─────────────────────────────────────────┘`));
  console.log('');

  // ─── APPROVAL PROMPT ───
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question(chalk.cyan(`  💾 ${action === 'CREATE' ? 'Write this file' : 'Apply changes'}? (y/n/path): `), resolve);
  });
  rl.close();

  const trimmed = answer.trim().toLowerCase();

  if (trimmed === 'n' || trimmed === 'no') {
    console.log(chalk.gray('  ⏭️  Skipped.'));
    return false;
  }

  // Allow custom path override
  let targetPath = absolutePath;
  if (trimmed !== 'y' && trimmed !== 'yes' && trimmed.length > 0) {
    targetPath = path.join(process.cwd(), trimmed);
  }

  try {
    // Create directories if needed
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Backup original if updating
    if (!proposed.isNew && fs.existsSync(targetPath)) {
      const backupDir = path.join(process.cwd(), '.bob-backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = Date.now();
      const backupName = proposed.filePath.replace(/[\/\\]/g, '_') + `.${timestamp}.bak`;
      fs.copyFileSync(targetPath, path.join(backupDir, backupName));
    }

    // Write the file
    fs.writeFileSync(targetPath, proposed.content, 'utf-8');

    const relativePath = path.relative(process.cwd(), targetPath);
    console.log(chalk.green(`  ✅ Written: ${relativePath}`));
    if (!proposed.isNew) {
      console.log(chalk.gray(`  📦 Backup saved to .bob-backups/`));
    }
    console.log('');
    return true;

  } catch (error: any) {
    console.log(chalk.red(`  ❌ Write failed: ${error.message}`));
    return false;
  }
}