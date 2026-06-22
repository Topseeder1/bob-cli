import { LocalChatMessage } from '../ai/providers/local.js';
import { callLocalModel } from '../ai/providers/local.js';
import { getRelevantFileContents } from './file-retrieval.js';
import { OperationType } from './agent-queue.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const BOB_DIR = path.join(os.homedir(), '.bob');

// ─── INTERFACES ───────────────────────────────────────────────────

export interface FileReviewResult {
  filePath: string;
  verdict: 'APPROVE' | 'DENY' | 'WARN';
  reason: string;
  backupPath: string | null;
}

export interface CommitReview {
  verdict: 'APPROVE' | 'DENY';
  reason: string;
  revisionNote: string | null;
  filesReviewed: FileReviewResult[];
  reviewedAt: string;
}

export interface FileChange {
  filePath: string;
  backupPath: string | null;
}

// ─── BACKUP FINDER ────────────────────────────────────────────────

function findMostRecentBackup(filePath: string, cwd: string): string | null {
  const backupDir = path.join(cwd, '.bob-backups');
  if (!fs.existsSync(backupDir)) return null;
  const safeName = filePath.replace(/[\/\\]/g, '_');
  try {
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(safeName) && f.endsWith('.bak'))
      .sort()
      .reverse();
    if (backups.length === 0) return null;
    return path.join(backupDir, backups[0]);
  } catch {
    return null;
  }
}

// ─── PROGRAMMATIC VALIDATORS ──────────────────────────────────────

interface ProgrammaticCheck {
  passed: boolean;
  reason: string | null;
}

function countImports(content: string): number {
  return (content.match(/^import\s+/gm) || []).length;
}

function extractExports(content: string): string[] {
  const matches = content.match(
    /^export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum|async\s+function)\s+(\w+)/gm
  ) || [];
  return matches.map(m => {
    const nameMatch = m.match(/\s(\w+)\s*$/);
    return nameMatch ? nameMatch[1] : m;
  });
}

function programmaticCheck(
  originalContent: string,
  currentContent: string,
  operationType: OperationType,
  isNewFile: boolean
): ProgrammaticCheck {
  if (isNewFile) return { passed: true, reason: null };

  const originalLines = originalContent.split('\n').length;
  const currentLines = currentContent.split('\n').length;
  const reductionRatio = currentLines / originalLines;

  const minRatios: Record<OperationType, number> = {
    PATCH:    0.85,
    REFACTOR: 0.70,
    REPLACE:  0.10,
    CREATE:   0.0,
  };

  const minRatio = minRatios[operationType] ?? 0.80;

  if (reductionRatio < minRatio) {
    return {
      passed: false,
      reason: `File reduced to ${Math.round(reductionRatio * 100)}% of original (minimum ${Math.round(minRatio * 100)}% for ${operationType}). Agent likely gutted the file instead of making a targeted change.`,
    };
  }

  if (operationType === 'PATCH' || operationType === 'REFACTOR') {
    const originalExports = extractExports(originalContent);
    const currentExports = extractExports(currentContent);
    const missingExports = originalExports.filter(e => !currentExports.includes(e));

    if (missingExports.length > 0) {
      return {
        passed: false,
        reason: `Missing exports after ${operationType}: ${missingExports.join(', ')}. These must be preserved.`,
      };
    }
  }

  if (operationType === 'PATCH') {
    const originalImports = countImports(originalContent);
    const currentImports = countImports(currentContent);
    const importDelta = Math.abs(currentImports - originalImports);

    if (importDelta > 2) {
      return {
        passed: false,
        reason: `Import count changed by ${importDelta} (${originalImports} → ${currentImports}). PATCH operations should add at most 2 imports.`,
      };
    }
  }

  return { passed: true, reason: null };
}

// ─── REVIEWER SYSTEM PROMPT ───────────────────────────────────────

const REVIEWER_SYSTEM_PROMPT = `You are DirectorBob in CODE REVIEW MODE.

Your role is to evaluate whether a code change is safe to commit.
You are an experienced senior engineer reviewing a junior agent's work.

You are SKEPTICAL BY DEFAULT. Your job is to catch problems.

Evaluate against three criteria:
1. CORRECTNESS — Does the change accomplish what the task asked for?
2. SAFETY — Does the change preserve existing functionality without breaking anything?
3. FIT — Does the change follow the project's existing patterns and conventions?

Respond with ONLY this exact JSON format on a single line:
{"verdict":"APPROVE","reason":"one paragraph","revisionNote":null}

VERDICT definitions:
- APPROVE: Change is correct, safe, and fits the project.
- DENY: Change has a critical problem. Agent must revise.
- WARN: Minor concerns but acceptable. Commit with caution.`;

// ─── REVIEW PROMPT BUILDER ────────────────────────────────────────

function buildFileReviewPrompt(
  taskInstruction: string,
  filePath: string,
  originalContent: string,
  currentContent: string,
  projectContext: string,
  isNewFile: boolean,
  operationType: OperationType
): string {
  const originalLines = originalContent.split('\n').length;
  const currentLines = currentContent.split('\n').length;
  const lineDiff = currentLines - originalLines;
  const reductionPercent = originalLines > 0
    ? Math.round(((originalLines - currentLines) / originalLines) * 100)
    : 0;

  return `TASK INSTRUCTION: ${taskInstruction}
OPERATION TYPE: ${operationType}

FILE: ${filePath}
${isNewFile
    ? 'STATUS: NEW FILE'
    : `STATUS: MODIFIED (${originalLines} → ${currentLines} lines, ${lineDiff >= 0 ? '+' : ''}${lineDiff}${reductionPercent > 0 ? `, ${reductionPercent}% reduction` : ''})`
  }

${!isNewFile && originalContent
    ? `ORIGINAL:\n\`\`\`\n${originalContent.slice(0, 3000)}${originalContent.length > 3000 ? '\n...(truncated)' : ''}\n\`\`\`\n`
    : ''
  }
CURRENT:\n\`\`\`\n${currentContent.slice(0, 3000)}${currentContent.length > 3000 ? '\n...(truncated)' : ''}\n\`\`\`

${projectContext ? `RELEVANT CONTEXT:\n${projectContext.slice(0, 1500)}\n` : ''}
Respond with ONLY the JSON verdict on a single line.`;
}

// ─── REVIEW RESPONSE PARSER ───────────────────────────────────────

function parseFileReviewResponse(
  response: string,
  filePath: string,
  backupPath: string | null
): FileReviewResult {
  const jsonMatch = response.match(/\{[^}]*"verdict"[^}]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const verdict = (['APPROVE', 'DENY', 'WARN'] as const).includes(parsed.verdict)
        ? parsed.verdict as 'APPROVE' | 'DENY' | 'WARN'
        : 'WARN';
      return { filePath, verdict, reason: parsed.reason || 'No reason provided.', backupPath };
    } catch { }
  }

  const upper = response.toUpperCase();
  let verdict: 'APPROVE' | 'DENY' | 'WARN' = 'WARN';
  if (upper.includes('DENY')) verdict = 'DENY';
  else if (upper.includes('APPROVE')) verdict = 'APPROVE';

  return { filePath, verdict, reason: response.slice(0, 200).trim() || 'Review completed.', backupPath };
}

// ─── CORE REVIEW FUNCTION ─────────────────────────────────────────

export async function reviewCommit(
  taskInstruction: string,
  commitMessage: string,
  agentName: string,
  filesChanged: FileChange[],
  cwd: string,
  localEndpoint: string,
  operationType?: OperationType
): Promise<CommitReview> {

  const fileReviews: FileReviewResult[] = [];
  const opType: OperationType = operationType || 'PATCH';

  for (const fileChange of filesChanged) {
    const absolutePath = path.join(cwd, fileChange.filePath);

    if (!fs.existsSync(absolutePath)) {
      fileReviews.push({
        filePath: fileChange.filePath,
        verdict: 'DENY',
        reason: 'File does not exist on disk — agent may have failed to write it.',
        backupPath: fileChange.backupPath,
      });
      continue;
    }

    let currentContent = '';
    try {
      currentContent = fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      currentContent = '[Could not read current file]';
    }

    const backupPath = fileChange.backupPath || findMostRecentBackup(fileChange.filePath, cwd);
    let originalContent = '';
    let isNewFile = true;

    if (backupPath && fs.existsSync(backupPath)) {
      try {
        originalContent = fs.readFileSync(backupPath, 'utf-8');
        isNewFile = false;
      } catch {
        originalContent = '[Could not read backup]';
      }
    }

    // ─── Programmatic check first — deterministic, no LLM ──────
    if (!isNewFile && originalContent && originalContent !== '[Could not read backup]') {
      const check = programmaticCheck(originalContent, currentContent, opType, isNewFile);
      if (!check.passed) {
        fileReviews.push({
          filePath: fileChange.filePath,
          verdict: 'DENY',
          reason: check.reason!,
          backupPath,
        });
        continue;
      }
    }

    // ─── RAG context ────────────────────────────────────────────
    let projectContext = '';
    try {
      const retrieval = await getRelevantFileContents(
        `${taskInstruction}\n\nReviewing changes to: ${fileChange.filePath}`,
        localEndpoint
      );
      projectContext = retrieval.fileContents;
    } catch { }

    // ─── LLM review ─────────────────────────────────────────────
    const reviewPrompt = buildFileReviewPrompt(
      taskInstruction,
      fileChange.filePath,
      originalContent,
      currentContent,
      projectContext,
      isNewFile,
      opType
    );

    try {
      const messages: LocalChatMessage[] = [
        { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
        { role: 'user', content: reviewPrompt },
      ];

      const rawResponse = await callLocalModel(localEndpoint, messages);
      const responseText =
        typeof rawResponse === 'object' && rawResponse.text
          ? rawResponse.text
          : (rawResponse as unknown as string);

      fileReviews.push(parseFileReviewResponse(responseText, fileChange.filePath, backupPath));

    } catch (error: any) {
      fileReviews.push({
        filePath: fileChange.filePath,
        verdict: 'WARN',
        reason: `Review failed: ${error.message}. Manual inspection recommended.`,
        backupPath,
      });
    }
  }

  // ─── Overall verdict ──────────────────────────────────────────
  const denied  = fileReviews.filter(f => f.verdict === 'DENY');
  const warned  = fileReviews.filter(f => f.verdict === 'WARN');
  const approved = fileReviews.filter(f => f.verdict === 'APPROVE');

  let overallVerdict: 'APPROVE' | 'DENY';
  let overallReason: string;
  let revisionNote: string | null = null;

  if (denied.length > 0) {
    overallVerdict = 'DENY';
    overallReason = `${denied.length} file(s) failed review: ${denied.map(f => f.filePath).join(', ')}`;
    revisionNote = denied.map(f => `${f.filePath}: ${f.reason}`).join('\n');
  } else if (warned.length > 0) {
    overallVerdict = 'APPROVE';
    overallReason = `${approved.length} file(s) approved. ${warned.length} file(s) have warnings.`;
  } else {
    overallVerdict = 'APPROVE';
    overallReason = `All ${approved.length} file(s) passed review.`;
  }

  return {
    verdict: overallVerdict,
    reason: overallReason,
    revisionNote,
    filesReviewed: fileReviews,
    reviewedAt: new Date().toISOString(),
  };
}

// ─── RESTORE DENIED FILES ─────────────────────────────────────────

export function restoreDeniedFiles(
  review: CommitReview,
  cwd: string
): { restored: string[]; failed: string[] } {
  const restored: string[] = [];
  const failed: string[] = [];

  for (const fileReview of review.filesReviewed) {
    if (fileReview.verdict !== 'DENY') continue;
    if (!fileReview.backupPath) { failed.push(fileReview.filePath); continue; }

    try {
      const absolutePath = path.join(cwd, fileReview.filePath);
      if (fs.existsSync(fileReview.backupPath)) {
        const dir = path.dirname(absolutePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(fileReview.backupPath, absolutePath);
        restored.push(fileReview.filePath);
      } else {
        failed.push(fileReview.filePath);
      }
    } catch {
      failed.push(fileReview.filePath);
    }
  }

  return { restored, failed };
}

// ─── SAVE / LOAD REVIEW ───────────────────────────────────────────

export function saveCommitReview(
  review: CommitReview,
  missionId: string,
  taskId: string,
  cwd: string
): void {
  const projectName = path.basename(cwd);
  const reviewDir = path.join(BOB_DIR, 'projects', projectName, 'agents', 'commit-reviews');
  if (!fs.existsSync(reviewDir)) fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(
    path.join(reviewDir, `${taskId}.json`),
    JSON.stringify(review, null, 2)
  );
}

export function loadCommitReview(taskId: string, cwd: string): CommitReview | null {
  const projectName = path.basename(cwd);
  const reviewFile = path.join(
    BOB_DIR, 'projects', projectName, 'agents', 'commit-reviews', `${taskId}.json`
  );
  if (!fs.existsSync(reviewFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(reviewFile, 'utf-8'));
  } catch {
    return null;
  }
}