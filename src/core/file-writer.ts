import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';

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
  return response.replace(/```[\w]*\n\s*(?:\/\/\s*(?:File:)?\s*[\w\-\.\/\\]+\.\w+|#\s*(?:File:)?\s*[\w\-\.\/\\]+\.\w+|\*\s*\[FILE:)[^\n]*\n[\s\S]*?```/g, '').trim();
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
  const proposals = extractAllProposedFiles(response);
  if (proposals.length === 0) return;

  for (const proposed of proposals) {
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
  console.log(chalk.yellow(`  ┌─────────────────────────────────────────┐`));
  console.log(chalk.yellow(`  │ 📋  EXTERNAL: ${proposed.filePath}`));
  console.log(chalk.yellow(`  │     This file belongs to another project.`));
  console.log(chalk.yellow(`  ├─────────────────────────────────────────┤`));

  const previewLines = proposed.content.split('\n').slice(0, 6);
  for (const line of previewLines) {
    console.log(chalk.gray(`  │ ${line}`));
  }
  if (totalLines > 6) {
    console.log(chalk.gray(`  │ ... (${totalLines - 6} more lines)`));
  }

  console.log(chalk.yellow(`  └─────────────────────────────────────────┘`));
  console.log(chalk.gray(`  Copy this file manually to your project at: ${proposed.filePath}`));
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
  const color = proposed.isNew ? chalk.green : chalk.yellow;
  const totalLines = proposed.content.split('\n').length;

  if (!autoApprove) {
    console.log('');
    console.log(color(`  ┌─────────────────────────────────────────┐`));
    console.log(color(`  │ ${icon}  ${action}: ${proposed.filePath} (${totalLines} lines)`));
    console.log(color(`  ├─────────────────────────────────────────┤`));

    const previewLines = proposed.content.split('\n').slice(0, 6);
    for (const line of previewLines) {
      console.log(chalk.gray(`  │ ${line}`));
    }
    if (totalLines > 6) {
      console.log(chalk.gray(`  │ ... (${totalLines - 6} more lines)`));
    }

    console.log(color(`  └─────────────────────────────────────────┘`));
    console.log('');

    let answer: string;
    if (existingRl) {
      answer = await new Promise<string>(resolve => {
        existingRl.question(chalk.cyan(`  💾 ${action === 'CREATE' ? 'Write this file' : 'Apply changes'}? (y/n/path): `), resolve);
      });
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      answer = await new Promise<string>(resolve => {
        rl.question(chalk.cyan(`  💾 ${action === 'CREATE' ? 'Write this file' : 'Apply changes'}? (y/n/path): `), resolve);
      });
      rl.close();
    }

    const trimmed = answer.trim().toLowerCase();

    if (trimmed === 'n' || trimmed === 'no') {
      console.log(chalk.gray('  ⏭️  Skipped.'));
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
    console.log(chalk.green(`  ✅ Written: ${relativePath}`));
    if (!isNew) {
      console.log(chalk.gray(`  📦 Backup saved to .bob-backups/`));
    }
    console.log('');
    return true;

  } catch (error: any) {
    console.log(chalk.red(`  ❌ Write failed: ${error.message}`));
    return false;
  }
}