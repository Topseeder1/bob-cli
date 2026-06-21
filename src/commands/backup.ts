// File: src/commands/backup.ts

// TEST RESTORE COMMENT
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import axios from 'axios';
import inquirer from 'inquirer';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';

// backup.ts does NOT manage conversationId — no changes needed here.
// It uses getCurrentProjectName() from process.cwd() for project scoping.
// conversationId is not used in any backup operation.

const BRAND = chalk.hex('#E66F24');
const CYAN = chalk.cyan;
const GREEN = chalk.hex('#66BB6A');
const RED = chalk.hex('#EF5350');
const AMBER = chalk.hex('#FFAB00');
const GRAY = chalk.gray;
const BORDER = chalk.hex('#455A64');
const BOB_DIR = path.join(os.homedir(), '.bob');
const ALGORITHM = 'aes-256-cbc';

// ─── ENCRYPTION ─────────────────────────────────────────────────

function deriveKey(uid: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(uid, salt, 100000, 32, 'sha256');
}

function encrypt(inputPath: string, outputPath: string, uid: string): void {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = deriveKey(uid, salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const input = fs.readFileSync(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const header = Buffer.from(salt + iv.toString('hex'), 'utf-8');
  fs.writeFileSync(outputPath, Buffer.concat([header, encrypted]));
}

function decrypt(inputPath: string, outputPath: string, uid: string): void {
  const data = fs.readFileSync(inputPath);
  const header = data.slice(0, 64).toString('utf-8');
  const salt = header.slice(0, 32);
  const iv = Buffer.from(header.slice(32, 64), 'hex');
  const encrypted = data.slice(64);
  const key = deriveKey(uid, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  fs.writeFileSync(outputPath, decrypted);
}

// ─── HELPERS ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getTempDir(): string {
  const tmpDir = path.join(os.tmpdir(), `bob-backup-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTemp(tmpDir: string): void {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
}

function requireAuth(config: any): boolean {
  if (!config.loggedIn || !config.authToken) {
    console.log('');
    console.log(RED('  ❌ Backup requires authentication.'));
    console.log(GRAY('  Run `bob login` to authenticate.'));
    console.log('');
    return false;
  }
  return true;
}

function getCurrentProjectName(): string {
  return path.basename(process.cwd());
}

function getProjectBackupDir(projectName: string): string {
  return path.join(BOB_DIR, 'projects', projectName);
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function handleBackupError(error: any): void {
  if (error.message?.includes('BOB_BACKUP_LICENSE_REQUIRED')) {
    console.log('');
    console.log(AMBER('  ⚠️  No active backup license found.'));
    console.log(GRAY('  Purchase one at: app.bobsworkshop.com/iap → Bob Backup'));
  } else if (error.message?.includes('STORAGE_QUOTA_EXCEEDED')) {
    console.log('');
    console.log(AMBER('  ⚠️  Storage quota exceeded.'));
    console.log(GRAY('  Purchase a storage pack: app.bobsworkshop.com/iap → Storage Packs'));
  } else if (error.message?.includes('ARCHIVE_SLOTS_EXHAUSTED')) {
    console.log('');
    console.log(AMBER('  ⚠️  All archive slots are used.'));
    console.log(GRAY('  Upgrade your Workshop SKU for more archive slots.'));
  } else if (error.message?.includes('GRID_REQUIRED')) {
    console.log('');
    console.log(AMBER('  ⚠️  Global backup requires the Grid Workshop plan.'));
    console.log(GRAY('  Upgrade at: app.bobsworkshop.com/iap → Workshop'));
  } else {
    console.log('');
    console.log(RED(`  ❌ ${error.message}`));
  }
  console.log('');
}

// ─── GITIGNORE PARSER ────────────────────────────────────────────

function loadGitignorePatterns(projectDir: string): string[] {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const defaultIgnore = [
    'node_modules', '.git', 'dist', 'build', '.dart_tool',
    '.idea', '.gradle', '.pub-cache', '*.log', '.env',
    '.env.local', '.env.*', 'coverage', '.nyc_output',
  ];
  if (!fs.existsSync(gitignorePath)) return defaultIgnore;
  try {
    const lines = fs.readFileSync(gitignorePath, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    return [...defaultIgnore, ...lines];
  } catch {
    return defaultIgnore;
  }
}

function shouldIgnore(filePath: string, patterns: string[]): boolean {
  const parts = filePath.split(/[/\\]/);
  return patterns.some(pattern => {
    const clean = pattern.replace(/^\//, '').replace(/\/$/, '');
    return parts.some(part => {
      if (clean.includes('*')) {
        const regex = new RegExp('^' + clean.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        return regex.test(part);
      }
      return part === clean;
    });
  });
}

// ─── CORE CONTEXT BACKUP ─────────────────────────────────────────

async function runBackup(options: {
  config: any;
  projectName: string;
  isGlobal: boolean;
  archiveName?: string;
  sourceDir: string;
  displayName: string;
}): Promise<void> {
  const { config, projectName, isGlobal, archiveName, sourceDir, displayName } = options;

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + BRAND('  ☁️  Bob Backup                                          ') + BORDER('║'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GRAY(`  Scope:   ${isGlobal ? '🌐 Global (~/.bob/)' : `📁 Project: ${projectName}`}`));
  if (archiveName) console.log(BORDER('  ║') + GRAY(`  Archive: "${archiveName}"`));
  console.log(BORDER('  ║'));

  if (!fs.existsSync(sourceDir)) {
    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(RED(`  ❌ Source directory not found: ${sourceDir}`));
    console.log(GRAY(`  Run \`bob index\` first to initialize this project.`));
    console.log('');
    return;
  }

  const tmpDir = getTempDir();
  const archivePath = path.join(tmpDir, 'bob-backup.tar.gz');
  const encryptedPath = path.join(tmpDir, 'bob-backup.bob.enc');

  try {
    const compressSpinner = ora({ text: GRAY('  Compressing ...'), spinner: 'dots' }).start();
    const tar = await import('tar');
    const relativeSource = path.relative(os.homedir(), sourceDir);

    await tar.create(
      { gzip: true, file: archivePath, cwd: os.homedir() },
      [relativeSource]
    );

    const archiveStats = fs.statSync(archivePath);
    const estimatedSizeGB = archiveStats.size / (1024 * 1024 * 1024);
    compressSpinner.succeed(GREEN(`  Compressing ${displayName} ...`) + GRAY(` ${formatBytes(archiveStats.size)}`));

    const encryptSpinner = ora({ text: GRAY('  Encrypting archive ...'), spinner: 'dots' }).start();
    encrypt(archivePath, encryptedPath, config.uid!);
    const encryptedStats = fs.statSync(encryptedPath);
    encryptSpinner.succeed(GREEN('  Encrypting archive ...') + GRAY(` ${formatBytes(encryptedStats.size)}`));

    const urlSpinner = ora({ text: GRAY('  Requesting upload authorization ...'), spinner: 'dots' }).start();
    let uploadResult: any;
    try {
      if (archiveName) {
        uploadResult = await callCloudFunction('cliBackupLicense', {
          action: 'requestArchiveUpload',
          projectName,
          isGlobal,
          isSource: false,
          archiveName,
          estimatedSizeGB,
        });
      } else {
        uploadResult = await callCloudFunction('cliBackupLicense', {
          action: 'requestUpload',
          projectName,
          isGlobal,
          isSource: false,
          estimatedSizeGB,
        });
      }
      urlSpinner.succeed(GREEN('  Requesting upload authorization ...'));
    } catch (error: any) {
      urlSpinner.fail(RED('  ❌ Authorization failed.'));
      console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
      handleBackupError(error);
      return;
    }

    const uploadSpinner = ora({ text: GRAY('  Uploading to S3 ...'), spinner: 'dots' }).start();
    const encryptedData = fs.readFileSync(encryptedPath);
    await axios.put(uploadResult.uploadUrl, encryptedData, {
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': encryptedData.length },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    uploadSpinner.succeed(GREEN('  Uploading to S3 ...'));

    const recordSpinner = ora({ text: GRAY('  Recording usage ...'), spinner: 'dots' }).start();
    try {
      if (archiveName && uploadResult.archiveId) {
        await callCloudFunction('cliBackupLicense', {
          action: 'recordArchiveUsage',
          projectName,
          isGlobal,
          isSource: false,
          archiveId: uploadResult.archiveId,
        });
      } else {
        await callCloudFunction('cliBackupLicense', {
          action: 'recordUsage',
          projectName,
          isGlobal,
          isSource: false,
        });
      }
      recordSpinner.succeed(GREEN('  Recording usage ...'));
    } catch {
      recordSpinner.warn(AMBER('  Usage recording failed (non-fatal). Backup was saved.'));
    }

    const now = new Date().toLocaleString();
    console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
    if (archiveName) {
      console.log(BORDER('  ║') + GREEN(`  ✅ Archive saved: "${archiveName}" — ${now}`));
    } else {
      console.log(BORDER('  ║') + GREEN(`  ✅ Backup complete — ${now}`));
    }
    console.log(BORDER('  ║') + GRAY('  Run `bob backup list` to see all revisions.'));
    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');

  } catch (error: any) {
    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    handleBackupError(error);
  } finally {
    cleanupTemp(tmpDir);
  }
}

// ─── CORE SOURCE BACKUP ──────────────────────────────────────────

async function runSourceBackup(options: {
  config: any;
  projectName: string;
  projectDir: string;
  filePath?: string;
  archiveName?: string;
}): Promise<void> {
  const { config, projectName, projectDir, archiveName } = options;

  const filePath = options.filePath ? normalizeFilePath(options.filePath) : undefined;
  const isFileMode = !!filePath;
  const scopeLabel = isFileMode ? `📄 File: ${filePath}` : `💾 Source: ${projectName}`;

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + BRAND('  ☁️  Bob Source Backup                                   ') + BORDER('║'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GRAY(`  Scope:   ${scopeLabel}`));
  if (archiveName) console.log(BORDER('  ║') + GRAY(`  Archive: "${archiveName}"`));
  console.log(BORDER('  ║'));

  if (isFileMode) {
    const absoluteFilePath = path.resolve(projectDir, filePath!);
    if (!fs.existsSync(absoluteFilePath)) {
      console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
      console.log('');
      console.log(RED(`  ❌ File not found: ${filePath}`));
      console.log('');
      return;
    }
  } else {
    if (!fs.existsSync(projectDir)) {
      console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
      console.log('');
      console.log(RED(`  ❌ Project directory not found: ${projectDir}`));
      console.log('');
      return;
    }
  }

  const tmpDir = getTempDir();
  const archivePath = path.join(tmpDir, 'bob-source.tar.gz');
  const encryptedPath = path.join(tmpDir, 'bob-source.bob.enc');

  try {
    const compressSpinner = ora({ text: GRAY('  Compressing source ...'), spinner: 'dots' }).start();
    const tar = await import('tar');

    if (isFileMode) {
      const relativeFilePath = path.normalize(filePath!).replace(/\\/g, '/');
      await tar.create(
        { gzip: true, file: archivePath, cwd: projectDir },
        [relativeFilePath]
      );
    } else {
      const ignorePatterns = loadGitignorePatterns(projectDir);
      const parentDir = path.dirname(projectDir);
      const projectDirName = path.basename(projectDir);
      await tar.create(
        {
          gzip: true,
          file: archivePath,
          cwd: parentDir,
          filter: (fp: string) => !shouldIgnore(fp, ignorePatterns),
        },
        [projectDirName]
      );
    }

    const archiveStats = fs.statSync(archivePath);
    const estimatedSizeGB = archiveStats.size / (1024 * 1024 * 1024);
    compressSpinner.succeed(
      GREEN(`  Compressing ${isFileMode ? filePath : projectName} ...`) +
      GRAY(` ${formatBytes(archiveStats.size)}`)
    );

    const encryptSpinner = ora({ text: GRAY('  Encrypting ...'), spinner: 'dots' }).start();
    encrypt(archivePath, encryptedPath, config.uid!);
    const encryptedStats = fs.statSync(encryptedPath);
    encryptSpinner.succeed(GREEN('  Encrypting ...') + GRAY(` ${formatBytes(encryptedStats.size)}`));

    const urlSpinner = ora({ text: GRAY('  Requesting upload authorization ...'), spinner: 'dots' }).start();
    let uploadResult: any;

    const uploadPayload = {
      action: archiveName ? 'requestSourceArchiveUpload' : 'requestSourceUpload',
      projectName,
      isGlobal: false,
      isSource: true,
      filePath: filePath || null,
      archiveName: archiveName || null,
      estimatedSizeGB,
    };

    try {
      uploadResult = await callCloudFunction('cliBackupLicense', uploadPayload);
      urlSpinner.succeed(GREEN('  Requesting upload authorization ...'));
    } catch (error: any) {
      urlSpinner.fail(RED('  ❌ Authorization failed.'));
      console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
      handleBackupError(error);
      return;
    }

    const uploadSpinner = ora({ text: GRAY('  Uploading to S3 ...'), spinner: 'dots' }).start();
    const encryptedData = fs.readFileSync(encryptedPath);
    await axios.put(uploadResult.uploadUrl, encryptedData, {
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': encryptedData.length },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    uploadSpinner.succeed(GREEN('  Uploading to S3 ...'));

    const recordSpinner = ora({ text: GRAY('  Recording usage ...'), spinner: 'dots' }).start();

    const recordPayload = {
      action: archiveName ? 'recordSourceArchiveUsage' : 'recordSourceUsage',
      projectName,
      isGlobal: false,
      isSource: true,
      filePath: filePath || null,
      archiveId: uploadResult.archiveId || null,
    };

    try {
      await callCloudFunction('cliBackupLicense', recordPayload);
      recordSpinner.succeed(GREEN('  Recording usage ...'));
    } catch {
      recordSpinner.warn(AMBER('  Usage recording failed (non-fatal). Backup was saved.'));
    }

    const now = new Date().toLocaleString();
    console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
    if (archiveName) {
      console.log(BORDER('  ║') + GREEN(`  ✅ Source archive saved: "${archiveName}" — ${now}`));
    } else {
      console.log(BORDER('  ║') + GREEN(`  ✅ Source backup complete — ${now}`));
    }
    console.log(BORDER('  ║') + GRAY(`  ${isFileMode ? `File: ${filePath}` : `Project: ${projectName} (gitignore respected)`}`));
    console.log(BORDER('  ║') + GRAY('  Run `bob backup list --source` to see all source revisions.'));
    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    console.log('');

  } catch (error: any) {
    console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
    handleBackupError(error);
  } finally {
    cleanupTemp(tmpDir);
  }
}

// ─── REGISTER COMMAND ────────────────────────────────────────────

export function registerBackupCommand(program: Command): void {
  const backupCmd = program
    .command('backup')
    .description('Encrypt and upload your Bob CLI data to secure cloud storage');

  backupCmd
    .command('create')
    .description('Create a new encrypted backup')
    .option('--archive <name>', 'Save as a named archive snapshot')
    .option('--global', 'Back up entire ~/.bob/ (Grid Workshop SKU required)')
    .option('--source', 'Back up actual project source code (gitignore respected)')
    .option('--file <path>', 'Back up a single file (use with --source)')
    .action(async (options: {
      archive?: string;
      global?: boolean;
      source?: boolean;
      file?: string;
    }) => {
      const config = getConfig();
      if (!requireAuth(config)) return;

      const projectName = getCurrentProjectName();
      const projectDir = process.cwd();

      if (options.source) {
        await runSourceBackup({
          config,
          projectName,
          projectDir,
          filePath: options.file,
          archiveName: options.archive,
        });
        return;
      }

      const isGlobal = options.global || false;
      let sourceDir: string;
      let displayName: string;

      if (isGlobal) {
        sourceDir = BOB_DIR;
        displayName = '~/.bob/ (global)';
      } else {
        sourceDir = getProjectBackupDir(projectName);
        displayName = `~/.bob/projects/${projectName}/`;
      }

      await runBackup({
        config,
        projectName,
        isGlobal,
        archiveName: options.archive,
        sourceDir,
        displayName,
      });
    });

  backupCmd
    .command('list')
    .description('List all backup revisions and named archives')
    .option('--global', 'Show global backup revisions')
    .option('--source', 'Show source code backup revisions')
    .option('--file <path>', 'Show revisions for a specific file (use with --source)')
    .action(async (options: { global?: boolean; source?: boolean; file?: string }) => {
      const config = getConfig();
      if (!requireAuth(config)) return;

      const isGlobal = options.global || false;
      const isSource = options.source || false;
      const projectName = getCurrentProjectName();
      const filePath = options.file ? normalizeFilePath(options.file) : null;

      const spinner = ora({ text: CYAN('  Loading backup history...'), spinner: 'dots' }).start();

      try {
        const result = await callCloudFunction('getCLIBackupStatus', {
          projectName,
          isGlobal,
          isSource,
          filePath,
        });
        spinner.stop();

        const { storage, retention, lastBackedUpAt, versions, archives } = result;
        const scopeLabel = isGlobal ? '🌐 Global'
          : isSource ? (filePath ? `📄 ${filePath}` : `💾 Source: ${projectName}`)
          : `📁 ${projectName}`;

        console.log('');
        console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
        console.log(BORDER('  ║') + BRAND('  ☁️  Bob Backup Status                                   ') + BORDER('║'));
        console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
        console.log(BORDER('  ║') + GRAY(`  Scope:      ${scopeLabel}`));
        console.log(BORDER('  ║') + GRAY(`  Storage:    ${storage.usedGB.toFixed(2)} GB / ${storage.totalGB} GB (${storage.usedPercent}% used)`));
        console.log(BORDER('  ║') + GRAY(`  Retention:  ${retention.months} months`));
        console.log(BORDER('  ║') + GRAY(`  Archives:   ${retention.usedArchiveSlots}/${retention.archiveSlots} slots used`));
        if (lastBackedUpAt) {
          console.log(BORDER('  ║') + GRAY(`  Last backup: ${new Date(lastBackedUpAt).toLocaleString()}`));
        }

        if (versions.length > 0) {
          console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
          console.log(BORDER('  ║') + CYAN('  Revisions'));
          console.log(BORDER('  ║') + GRAY('  ─────────────────────────────────────────────────────'));
          for (const v of versions) {
            const date = new Date(v.lastModified).toLocaleString();
            const label = v.isLatest
              ? GREEN(`  ${v.label.padEnd(10)}`)
              : GRAY(`  ${v.label.padEnd(10)}`);
            console.log(BORDER('  ║') + `${label} ${GRAY(formatBytes(v.sizeBytes).padEnd(10))} ${GRAY(date)}`);
          }
        } else {
          console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
          console.log(BORDER('  ║') + GRAY(`  No revisions found.`));
        }

        if (archives.length > 0) {
          console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
          console.log(BORDER('  ║') + AMBER('  Named Archives'));
          console.log(BORDER('  ║') + GRAY('  ─────────────────────────────────────────────────────'));
          for (const a of archives) {
            const date = new Date(a.createdAt).toLocaleString();
            const expires = new Date(a.expiresAt).toLocaleString();
            console.log(BORDER('  ║') + `  📌 ${AMBER(a.name.padEnd(24))} ${GRAY(formatBytes(a.sizeGB * 1024 * 1024 * 1024))}`);
            console.log(BORDER('  ║') + GRAY(`     Created: ${date} | Expires: ${expires}`));
          }
        }

        console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
        console.log('');
        console.log(GRAY('  Commands:'));
        console.log(GRAY('    bob backup create                          — Context backup'));
        console.log(GRAY('    bob backup create --source                 — Full source backup'));
        console.log(GRAY('    bob backup create --source --file <path>   — Single file backup'));
        console.log(GRAY('    bob backup create --global                 — Full ~/.bob/ (Grid)'));
        console.log(GRAY('    bob backup restore                         — Restore context'));
        console.log(GRAY('    bob backup restore --source                — Restore source'));
        console.log(GRAY('    bob backup restore --source --file <path>  — Restore single file'));
        console.log('');

      } catch (error: any) {
        spinner.stop();
        handleBackupError(error);
      }
    });

  backupCmd
    .command('restore')
    .description('Restore from a backup revision or named archive')
    .option('--global', 'Restore from global backup')
    .option('--source', 'Restore source code backup')
    .option('--file <path>', 'Restore a single file (use with --source)')
    .action(async (options: { global?: boolean; source?: boolean; file?: string }) => {
      const config = getConfig();
      if (!requireAuth(config)) return;

      const isGlobal = options.global || false;
      const isSource = options.source || false;
      const projectName = getCurrentProjectName();
      const projectDir = process.cwd();
      const filePath = options.file ? normalizeFilePath(options.file) : null;

      const spinner = ora({ text: CYAN('  Loading available backups...'), spinner: 'dots' }).start();

      let statusResult: any;
      try {
        statusResult = await callCloudFunction('getCLIBackupStatus', {
          projectName,
          isGlobal,
          isSource,
          filePath,
        });
        spinner.stop();
      } catch (error: any) {
        spinner.stop();
        handleBackupError(error);
        return;
      }

      const { versions, archives } = statusResult;

      if (versions.length === 0 && archives.length === 0) {
        console.log('');
        const scopeMsg = isSource
          ? (filePath ? `file "${filePath}"` : `source of ${projectName}`)
          : isGlobal ? 'global' : projectName;
        console.log(AMBER(`  ⚠️  No backups found for ${scopeMsg}.`));
        console.log('');
        return;
      }

      const choices: any[] = [];

      if (versions.length > 0) {
        choices.push(new inquirer.Separator(CYAN('  ── Revisions ─────────────────────────────────')));
        for (const v of versions) {
          const date = new Date(v.lastModified).toLocaleString();
          choices.push({
            name: `  ${v.isLatest ? GREEN('● ') : '  '}${v.label.padEnd(12)} ${GRAY(formatBytes(v.sizeBytes).padEnd(10))} ${GRAY(date)}`,
            value: { type: 'revision', versionId: v.versionId, label: v.label },
          });
        }
      }

      if (archives.length > 0) {
        choices.push(new inquirer.Separator(AMBER('  ── Named Archives ────────────────────────────')));
        for (const a of archives) {
          const date = new Date(a.createdAt).toLocaleString();
          choices.push({
            name: `  📌 ${AMBER(a.name.padEnd(24))} ${GRAY(date)}`,
            value: { type: 'archive', archiveId: a.archiveId, name: a.name },
          });
        }
      }

      choices.push(new inquirer.Separator());
      choices.push({ name: GRAY('  ← Cancel'), value: null });

      console.log('');
      const scopeLabel = isSource
        ? (filePath ? `file "${filePath}"` : `source: ${projectName}`)
        : isGlobal ? 'global' : projectName;

      const { selected } = await inquirer.prompt([{
        type: 'select',
        name: 'selected',
        message: CYAN(`  Select a backup to restore (${scopeLabel}):`),
        choices,
        pageSize: 12,
      }]);

      if (!selected) {
        console.log(GRAY('  Cancelled.'));
        console.log('');
        return;
      }

      const label = selected.type === 'archive'
        ? `archive "${selected.name}"`
        : selected.label;

      console.log('');
      if (isSource && filePath) {
        console.log(AMBER(`  ⚠️  This will restore ${filePath} from ${label}.`));
        console.log(GRAY('  Current file will be backed up to .bob-backups/ first.'));
      } else if (isSource) {
        console.log(AMBER(`  ⚠️  This will restore source code of ${projectName} from ${label}.`));
        console.log(GRAY('  Current project will be backed up locally first.'));
      } else {
        console.log(AMBER(`  ⚠️  This will restore ${isGlobal ? '~/.bob/' : `~/.bob/projects/${projectName}/`} from ${label}.`));
        console.log(GRAY('  Your current data will be backed up locally first.'));
      }
      console.log('');

      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: AMBER('  Continue with restore?'),
        default: false,
      }]);

      if (!confirmed) {
        console.log(GRAY('  Cancelled.'));
        console.log('');
        return;
      }

      const tmpDir = getTempDir();
      const downloadPath = path.join(tmpDir, 'bob-backup.bob.enc');
      const decryptedPath = path.join(tmpDir, 'bob-backup.tar.gz');

      try {
        const dlSpinner = ora({ text: GRAY(`  Downloading ${label} ...`), spinner: 'dots' }).start();

        let downloadAction: string;
        if (isSource) {
          downloadAction = selected.type === 'archive' ? 'requestSourceArchiveDownload' : 'requestSourceDownload';
        } else {
          downloadAction = selected.type === 'archive' ? 'requestArchiveDownload' : 'requestDownload';
        }

        const downloadResult = await callCloudFunction('cliBackupLicense', {
          action: downloadAction,
          projectName,
          isGlobal,
          isSource,
          filePath,
          s3VersionId: selected.type === 'revision' ? selected.versionId : null,
          archiveId: selected.type === 'archive' ? selected.archiveId : null,
        });

        const response = await axios.get(downloadResult.downloadUrl, {
          responseType: 'arraybuffer',
          maxContentLength: Infinity,
        });

        fs.writeFileSync(downloadPath, Buffer.from(response.data));
        dlSpinner.succeed(GREEN(`  Downloading ${label} ...`));

        const decryptSpinner = ora({ text: GRAY('  Decrypting ...'), spinner: 'dots' }).start();
        decrypt(downloadPath, decryptedPath, config.uid!);
        decryptSpinner.succeed(GREEN('  Decrypting ...'));

        const backupSpinner = ora({ text: GRAY('  Backing up current state ...'), spinner: 'dots' }).start();

        let preRestoreBackup: string;

        if (isSource && filePath) {
          const absoluteFilePath = path.resolve(projectDir, filePath);
          const backupDir = path.join(projectDir, '.bob-backups');
          if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
          const backupFileName = filePath.replace(/[\/\\]/g, '_') + `.${Date.now()}.bak`;
          preRestoreBackup = path.join(backupDir, backupFileName);
          if (fs.existsSync(absoluteFilePath)) {
            fs.copyFileSync(absoluteFilePath, preRestoreBackup);
          }
        } else if (isSource) {
          preRestoreBackup = `${projectDir}-pre-restore-${Date.now()}`;
          if (fs.existsSync(projectDir)) {
            fs.cpSync(projectDir, preRestoreBackup, { recursive: true });
          }
        } else {
          const restoreTarget = isGlobal ? BOB_DIR : getProjectBackupDir(projectName);
          preRestoreBackup = `${restoreTarget}-pre-restore-${Date.now()}`;
          if (fs.existsSync(restoreTarget)) {
            fs.cpSync(restoreTarget, preRestoreBackup, { recursive: true });
          }
        }

        backupSpinner.succeed(GREEN('  Backing up current state ...') + GRAY(` → ${path.basename(preRestoreBackup)}`));

        const extractSpinner = ora({ text: GRAY('  Extracting ...'), spinner: 'dots' }).start();
        const tar = await import('tar');

        if (isSource && filePath) {
          await tar.extract({ file: decryptedPath, cwd: projectDir });
        } else if (isSource) {
          const parentDir = path.dirname(projectDir);
          await tar.extract({ file: decryptedPath, cwd: parentDir });
        } else {
          await tar.extract({ file: decryptedPath, cwd: os.homedir() });
        }

        extractSpinner.succeed(GREEN('  Extracting ...'));

        console.log('');
        console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
        console.log(BORDER('  ║') + GREEN('  ✅ Restore complete.                                    ') + BORDER('║'));
        if (isSource && filePath) {
          console.log(BORDER('  ║') + GRAY(`  Restored: ${filePath}`));
          console.log(BORDER('  ║') + GRAY(`  Backup:   .bob-backups/${path.basename(preRestoreBackup)}`));
        } else if (isSource) {
          console.log(BORDER('  ║') + GRAY(`  Restored: ${projectName}/ source`));
          console.log(BORDER('  ║') + GRAY(`  Backup:   ${path.basename(preRestoreBackup)}/`));
        } else {
          console.log(BORDER('  ║') + GRAY(`  Restored: ${isGlobal ? '~/.bob/' : `~/.bob/projects/${projectName}/`}`));
          console.log(BORDER('  ║') + GRAY(`  Backup:   ${path.basename(preRestoreBackup)}`));
        }
        console.log(BORDER('  ║') + GRAY(`  From:     ${label}`));
        console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
        console.log('');

      } catch (error: any) {
        console.log('');
        console.log(RED(`  ❌ Restore failed: ${error.message}`));
        console.log(GRAY('  Your original data was not modified.'));
        console.log('');
      } finally {
        cleanupTemp(tmpDir);
      }
    });

  backupCmd.action(async () => {
    const config = getConfig();
    if (!requireAuth(config)) return;

    const projectName = getCurrentProjectName();
    console.log('');
    console.log(GRAY(`  Current project: ${projectName}`));
    console.log('');
    console.log(GRAY('  Bob Backup commands:'));
    console.log('');
    console.log(GRAY('    bob backup create                          — Context backup (Bob data)'));
    console.log(GRAY('    bob backup create --source                 — Source code backup'));
    console.log(GRAY('    bob backup create --source --file <path>   — Single file backup'));
    console.log(GRAY('    bob backup create --archive "name"         — Named archive'));
    console.log(GRAY('    bob backup create --global                 — Full ~/.bob/ (Grid only)'));
    console.log(GRAY('    bob backup list                            — List context revisions'));
    console.log(GRAY('    bob backup list --source                   — List source revisions'));
    console.log(GRAY('    bob backup list --source --file <path>     — List file revisions'));
    console.log(GRAY('    bob backup restore                         — Restore context'));
    console.log(GRAY('    bob backup restore --source                — Restore source code'));
    console.log(GRAY('    bob backup restore --source --file <path>  — Restore single file'));
    console.log(GRAY('    bob backup restore --global                — Restore full ~/.bob/'));
    console.log('');
  });
}