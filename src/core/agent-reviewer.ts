// File: src/core/agent-reviewer.ts

import { LocalChatMessage } from '../ai/providers/local.js';
import { callLocalModel } from '../ai/providers/local.js';
import { getRelevantFileContents } from './file-retrieval.js';
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

/**
 * Finds the most recent backup of a file in .bob-backups/
 */
function findMostRecentBackup(filePath: string, cwd: string): string | null {
  const backupDir = path.join(cwd, '.bob-backups');
  if (!fs.existsSync(backupDir)) return null;

  const safeName = filePath.replace(/[\/\\]/g, '_');

  try {
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(safeName) && f.endsWith('.bak'))
      .sort()
      .reverse(); // most recent first

    if (backups.length === 0) return null;
    return path.join(backupDir, backups[0]);
  } catch {
    return null;
  }
}

// ─── CORE REVIEW FUNCTION ─────────────────────────────────────────

/**
 * DirectorBob's intelligent commit review system.
 *
 * Completely separate from agent execution — different persona,
 * different prompt structure, fresh context, auditor mindset.
 *
 * For each file changed:
 * 1. Reads the current file (what agent wrote)
 * 2. Reads the backup (what it looked like before)
 * 3. Uses two-step retrieval to understand project context
 * 4. Evaluates change against task instruction
 * 5. Returns structured APPROVE/DENY verdict per file and overall
 */
export async function reviewCommit(
  taskInstruction: string,
  commitMessage: string,
  agentName: string,
  filesChanged: FileChange[],
  cwd: string,
  localEndpoint: string
): Promise<CommitReview> {

  const fileReviews: FileReviewResult[] = [];

  // ─── Review each changed file individually ─────────────────────
  for (const fileChange of filesChanged) {
    const absolutePath = path.join(cwd, fileChange.filePath);

    // ─── Read current file (what agent wrote) ─────────────────
    let currentContent = '';
    if (fs.existsSync(absolutePath)) {
      try {
        currentContent = fs.readFileSync(absolutePath, 'utf-8');
      } catch {
        currentContent = '[Could not read current file]';
      }
    } else {
      // File was deleted or never written
      fileReviews.push({
        filePath: fileChange.filePath,
        verdict: 'DENY',
        reason: 'File does not exist on disk — agent may have failed to write it.',
        backupPath: fileChange.backupPath,
      });
      continue;
    }

    // ─── Read backup (original before agent changes) ───────────
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

    // ─── Two-step retrieval for project context ─────────────────
    let projectContext = '';
    try {
      const retrieval = await getRelevantFileContents(
        `${taskInstruction}\n\nReviewing changes to: ${fileChange.filePath}`,
        localEndpoint
      );
      projectContext = retrieval.fileContents;
    } catch { /* non-fatal */ }

    // ─── Build review prompt ────────────────────────────────────
    const reviewPrompt = buildFileReviewPrompt(
      taskInstruction,
      fileChange.filePath,
      originalContent,
      currentContent,
      projectContext,
      isNewFile
    );

    // ─── Call model in reviewer mode ────────────────────────────
    try {
      const messages: LocalChatMessage[] = [
        {
          role: 'system',
          content: REVIEWER_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: reviewPrompt,
        },
      ];

      const rawResponse = await callLocalModel(localEndpoint, messages);
      const responseText =
        typeof rawResponse === 'object' && rawResponse.text
          ? rawResponse.text
          : (rawResponse as unknown as string);

      const fileReview = parseFileReviewResponse(responseText, fileChange.filePath, backupPath);
      fileReviews.push(fileReview);

    } catch (error: any) {
      // If review fails, default to WARN — don't block commit but flag it
      fileReviews.push({
        filePath: fileChange.filePath,
        verdict: 'WARN',
        reason: `Review failed: ${error.message}. Manual inspection recommended.`,
        backupPath,
      });
    }
  }

  // ─── Build overall verdict ─────────────────────────────────────
  const denied = fileReviews.filter(f => f.verdict === 'DENY');
  const warned = fileReviews.filter(f => f.verdict === 'WARN');
  const approved = fileReviews.filter(f => f.verdict === 'APPROVE');

  let overallVerdict: 'APPROVE' | 'DENY';
  let overallReason: string;
  let revisionNote: string | null = null;

  if (denied.length > 0) {
    overallVerdict = 'DENY';
    overallReason = `${denied.length} file(s) failed review: ${denied.map(f => f.filePath).join(', ')}`;
    revisionNote = denied.map(f =>
      `${f.filePath}: ${f.reason}`
    ).join('\n');
  } else if (warned.length > 0) {
    overallVerdict = 'APPROVE';
    overallReason = `${approved.length} file(s) approved. ${warned.length} file(s) have warnings — review recommended.`;
  } else {
    overallVerdict = 'APPROVE';
    overallReason = `All ${approved.length} file(s) passed review. Changes align with task instruction.`;
  }

  return {
    verdict: overallVerdict,
    reason: overallReason,
    revisionNote,
    filesReviewed: fileReviews,
    reviewedAt: new Date().toISOString(),
  };
}

// ─── REVIEWER SYSTEM PROMPT ───────────────────────────────────────
// Completely separate from STANDARD_STYLE_PROMPT used by agents.
// Auditor mindset — skeptical, precise, structured output only.

const REVIEWER_SYSTEM_PROMPT = `You are DirectorBob in CODE REVIEW MODE.

Your role is to evaluate whether a code change is safe to commit.
You are an experienced senior engineer reviewing a junior agent's work.

You are SKEPTICAL BY DEFAULT. Your job is to catch problems.

You evaluate against three criteria:
1. CORRECTNESS — Does the change accomplish what the task asked for?
2. SAFETY — Does the change preserve existing functionality without breaking anything?
3. FIT — Does the change follow the project's existing patterns and conventions?

You respond with ONLY this exact JSON format on a single line:
{"verdict":"APPROVE"|"DENY"|"WARN","reason":"one paragraph","revisionNote":"specific fix instruction or null"}

VERDICT definitions:
- APPROVE: Change is correct, safe, and fits the project. Commit it.
- DENY: Change has a critical problem. Do not commit. Agent must revise.
- WARN: Change has minor concerns but is acceptable. Commit with caution.

You MUST DENY if:
- The file was substantially rewritten when only a small change was needed
- Existing imports or exports were removed without being replaced
- The change breaks obvious functionality
- The file is shorter than the original by more than 30% with no clear justification

You MUST APPROVE if:
- The change correctly implements the task
- Existing code structure is preserved
- New code fits the project's patterns`;

// ─── REVIEW PROMPT BUILDER ────────────────────────────────────────

function buildFileReviewPrompt(
  taskInstruction: string,
  filePath: string,
  originalContent: string,
  currentContent: string,
  projectContext: string,
  isNewFile: boolean
): string {
  const originalLines = originalContent.split('\n').length;
  const currentLines = currentContent.split('\n').length;
  const lineDiff = currentLines - originalLines;
  const reductionPercent = originalLines > 0
    ? Math.round(((originalLines - currentLines) / originalLines) * 100)
    : 0;

  return `TASK INSTRUCTION:
${taskInstruction}

FILE BEING REVIEWED: ${filePath}
${isNewFile ? 'STATUS: NEW FILE (no original to compare)' : `STATUS: MODIFIED (${originalLines} → ${currentLines} lines, ${lineDiff >= 0 ? '+' : ''}${lineDiff} change${reductionPercent > 0 ? `, ${reductionPercent}% reduction` : ''})`}

${!isNewFile && originalContent ? `ORIGINAL FILE (before agent changes):
\`\`\`
${originalContent.slice(0, 4000)}${originalContent.length > 4000 ? '\n... (truncated)' : ''}
\`\`\`

` : ''}CURRENT FILE (what agent wrote):
\`\`\`
${currentContent.slice(0, 4000)}${currentContent.length > 4000 ? '\n... (truncated)' : ''}
\`\`\`

${projectContext ? `RELEVANT PROJECT CONTEXT:
${projectContext.slice(0, 2000)}

` : ''}Evaluate this change. Respond with ONLY the JSON verdict on a single line.`;
}

// ─── REVIEW RESPONSE PARSER ───────────────────────────────────────

function parseFileReviewResponse(
  response: string,
  filePath: string,
  backupPath: string | null
): FileReviewResult {
  // Try to extract JSON from response
  const jsonMatch = response.match(/\{[^}]*"verdict"[^}]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const verdict = ['APPROVE', 'DENY', 'WARN'].includes(parsed.verdict)
        ? parsed.verdict as 'APPROVE' | 'DENY' | 'WARN'
        : 'WARN';

      return {
        filePath,
        verdict,
        reason: parsed.reason || 'No reason provided.',
        backupPath,
      };
    } catch { }
  }

  // If JSON parse fails, look for APPROVE/DENY/WARN keywords
  const upper = response.toUpperCase();
  let verdict: 'APPROVE' | 'DENY' | 'WARN' = 'WARN';
  if (upper.includes('DENY')) verdict = 'DENY';
  else if (upper.includes('APPROVE')) verdict = 'APPROVE';

  return {
    filePath,
    verdict,
    reason: response.slice(0, 200).trim() || 'Review completed.',
    backupPath,
  };
}

// ─── RESTORE DENIED FILES ─────────────────────────────────────────

/**
 * Restores files that were DENIED in a commit review.
 * Uses the backup from .bob-backups/ to restore the original.
 */
export function restoreDeniedFiles(
  review: CommitReview,
  cwd: string
): { restored: string[]; failed: string[] } {
  const restored: string[] = [];
  const failed: string[] = [];

  for (const fileReview of review.filesReviewed) {
    if (fileReview.verdict !== 'DENY') continue;
    if (!fileReview.backupPath) {
      failed.push(fileReview.filePath);
      continue;
    }

    try {
      const absolutePath = path.join(cwd, fileReview.filePath);
      if (fs.existsSync(fileReview.backupPath)) {
        // Ensure directory exists
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
  const reviewFile = path.join(reviewDir, `${taskId}.json`);
  fs.writeFileSync(reviewFile, JSON.stringify(review, null, 2));
}

export function loadCommitReview(
  taskId: string,
  cwd: string
): CommitReview | null {
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