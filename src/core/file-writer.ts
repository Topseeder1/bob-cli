// File: src/core/file-writer.ts
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';

// ─── DESIGN TOKENS ───
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const BORDER = chalk.hex('#455A64');

export interface ProposedFile {
  filePath: string;
  content: string;
  isNew: boolean;
  isLocal: boolean;
}

export function extractAllProposedFiles(response: string): ProposedFile[] {
  const proposals: ProposedFile[] = [];
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    const codeContent = match[1].trim();
    const lines = codeContent.split('\n');
    if (lines.length === 0) continue;

    const firstLine = lines[0].trim();
    let filePathMatch = firstLine.match(/^\/\/\s*File:\s*(.+)$/);
    if (!filePathMatch) filePathMatch = firstLine.match(/^\/\/\s*([\w\-\.\/\\]+\.\w+)\s*$/);
    if (!filePathMatch) filePathMatch = firstLine.match(/^#\s*File:\s*(.+)$/);
    if (!filePathMatch) filePathMatch = firstLine.match(/^#\s*([\w\-\.\/\\]+\.\w+)\s*$/);
    if (!filePathMatch) filePathMatch = firstLine.match(/^\*\s*\[FILE:\s*(.+?)\]/);
    if (!filePathMatch) continue;

    const filePath = filePathMatch[1].trim();
    if (!filePath.includes('/') && !filePath.includes('\\')) continue;
    if (!filePath.includes('.')) continue;

    const fileContent = lines.slice(1).join('\n').trim();
    const isLocal = isLocalProjectFile(filePath);
    const absolutePath = path.join(process.cwd(), filePath);
    const isNew = !fs.existsSync(absolutePath);

    proposals.push({ filePath, content: fileContent, isNew, isLocal });
  }

  return proposals;
}

export function extractProposedFile(response: string): ProposedFile | null {
  const all = extractAllProposedFiles(response);
  return all.length > 0 ? all[0] : null;
}

export function stripCodeBlockFromResponse(response: string): string {
  let stripped = response.replace(/```[\w]*\n\s*(?:\/\/\s*(?:File:)?\s*[\w\-\.\/\\]+\.\w+|#\s*(?:File:)?\s*[\w\-\.\/\\]+\.\w+|\*\s*\[FILE:)[^\n]*\n[\s\S]*?```/g, '').trim();
  // Also strip capability_invocation blocks
  stripped = stripped.replace(/```capability_invocation\s*[\s\S]*?```/g, '').trim();
  return stripped;
}

function isLocalProjectFile(filePath: string): boolean {
  const cwd = process.cwd();
  const externalPatterns = ['functions/', 'lib/', 'android/', 'ios/', 'macos/', 'windows/', 'web/'];

  for (const pattern of externalPatterns) {
    if (filePath.startsWith(pattern)) {
      const localPath = path.join(cwd, pattern.replace('/', ''));
      if (!fs.existsSync(localPath)) return false;
    }
  }

  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd)) return false;

  return true;
}

export async function processAllProposedFiles(response: string, autoApprove: boolean = false, existingRl?: readline.Interface): Promise<void> {
  // Standard file proposals (// File: pattern)
  const proposals = extractAllProposedFiles(response);

  // IDRP capability invocation proposals
  const idrpProposals = extractIDRPFileProposals(response);

  const allProposals = [...proposals, ...idrpProposals];
  if (allProposals.length === 0) return;

  for (const proposed of allProposals) {
    if (proposed.isLocal) {
      await proposeAndWriteFile(proposed, autoApprove, existingRl);
    } else {
      displayExternalFile(proposed);
    }
  }
}

function displayExternalFile(proposed: ProposedFile): void {
  const totalLines = proposed.content.split('\n').length;

  console.log('');
  console.log(WARNING(`  ╔══════════════════════════════════════════════════════════╗`));
  console.log(WARNING(`  ║`) + BRAND_SECONDARY(` 📋  EXTERNAL: ${proposed.filePath}`));
  console.log(WARNING(`  ║`) + MUTED(`     This file belongs to another project.`));
  console.log(WARNING(`  ╠══════════════════════════════════════════════════════════╣`));

  const previewLines = proposed.content.split('\n').slice(0, 6);
  for (const line of previewLines) {
    console.log(WARNING(`  ║`) + MUTED(` ${line}`));
  }
  if (totalLines > 6) {
    console.log(WARNING(`  ║`) + MUTED(` ... (${totalLines - 6} more lines)`));
  }

  console.log(WARNING(`  ╚══════════════════════════════════════════════════════════╝`));
  console.log(MUTED(`  Copy this file manually to your project at: ${proposed.filePath}`));
  console.log('');
}

export async function proposeAndWriteFile(proposed: ProposedFile, autoApprove: boolean = false, existingRl?: readline.Interface): Promise<boolean> {
  if (!proposed.isLocal) {
    displayExternalFile(proposed);
    return false;
  }

  const absolutePath = path.join(process.cwd(), proposed.filePath);
  const action = proposed.isNew ? 'CREATE' : 'UPDATE';
  const icon = proposed.isNew ? '📄' : '✏️';
  const accentColor = proposed.isNew ? SUCCESS : BRAND_SECONDARY;
  const totalLines = proposed.content.split('\n').length;

  if (!autoApprove) {
    console.log('');
    console.log(BORDER(`  ╔══════════════════════════════════════════════════════════╗`));
    console.log(BORDER(`  ║`) + accentColor(` ${icon}  ${action}: `) + chalk.white(`${proposed.filePath}`) + MUTED(` (${totalLines} lines)`));
    console.log(BORDER(`  ╠══════════════════════════════════════════════════════════╣`));

    const previewLines = proposed.content.split('\n').slice(0, 6);
    for (const line of previewLines) {
      console.log(BORDER(`  ║`) + MUTED(` ${line}`));
    }
    if (totalLines > 6) {
      console.log(BORDER(`  ║`) + MUTED(` ... (${totalLines - 6} more lines)`));
    }

    console.log(BORDER(`  ╚══════════════════════════════════════════════════════════╝`));
    console.log('');

    const promptText = INFO(`  💾 ${action === 'CREATE' ? 'Write this file' : 'Apply changes'}? `) + MUTED(`(y/n/path): `);
    let answer: string;

    if (existingRl) {
      // Windows + Node 24: readline interfaces deadlock on shared stdin.
      // Use synchronous stdin read — no buffering, no race conditions.
      existingRl.pause();
      process.stdout.write(promptText);
      const buf = Buffer.alloc(1024);
      const bytesRead = fs.readSync(0, buf, 0, 1024, null);
      answer = buf.toString('utf-8', 0, bytesRead).replace(/\r?\n/, '').trim();
      existingRl.resume();
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      answer = await new Promise<string>(resolve => {
        rl.question(promptText, (ans) => {
          rl.close();
          resolve(ans);
        });
      });
    }

    const trimmed = answer.trim().toLowerCase();

    if (trimmed === 'n' || trimmed === 'no') {
      console.log(MUTED('  ⏭️  Skipped.'));
      return false;
    }

    if (trimmed !== 'y' && trimmed !== 'yes' && trimmed.length > 0) {
      const customPath = path.join(process.cwd(), trimmed);
      return writeFile(customPath, proposed.content, proposed.filePath, proposed.isNew);
    }
  }

  return writeFile(absolutePath, proposed.content, proposed.filePath, proposed.isNew);
}

function writeFile(targetPath: string, content: string, originalFilePath: string, isNew: boolean): boolean {
  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!isNew && fs.existsSync(targetPath)) {
      const backupDir = path.join(process.cwd(), '.bob-backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = Date.now();
      const backupName = originalFilePath.replace(/[\/\\]/g, '_') + `.${timestamp}.bak`;
      fs.copyFileSync(targetPath, path.join(backupDir, backupName));
    }

    fs.writeFileSync(targetPath, content, 'utf-8');

    const relativePath = path.relative(process.cwd(), targetPath);
    console.log(SUCCESS(`  ✅ Written: ${relativePath}`));
    if (!isNew) {
      console.log(MUTED(`  📦 Backup saved to .bob-backups/`));
    }
    console.log('');
    return true;

  } catch (error: any) {
    console.log(ERROR(`  ❌ Write failed: ${error.message}`));
    return false;
  }
}

/**
 * Extracts file proposals from IDRP capability_invocation blocks.
 * Handles workspace_create_file and workspace_update_file capabilities.
 */
function extractIDRPFileProposals(response: string): ProposedFile[] {
  const proposals: ProposedFile[] = [];
  const invocationRegex = /```capability_invocation\s*([\s\S]*?)```/g;
  let match;

  while ((match = invocationRegex.exec(response)) !== null) {
    try {
      const invocation = JSON.parse(match[1].trim());

      if (invocation.action !== 'invoke') continue;
      if (!['workspace_create_file', 'workspace_update_file'].includes(invocation.capabilityId)) continue;

      const filePath = invocation.params?.filePath;
      const content = invocation.params?.content || invocation.params?.newContent;

      if (!filePath || !content) continue;

      const absolutePath = path.join(process.cwd(), filePath);
      const isNew = !fs.existsSync(absolutePath);
      const isLocal = isLocalProjectFile(filePath);

      proposals.push({ filePath, content, isNew, isLocal });
    } catch {
      // Invalid JSON in invocation block — skip
    }
  }

  return proposals;
}