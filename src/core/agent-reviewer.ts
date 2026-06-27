// File: src/core/agent-reviewer.ts

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

export interface TaskCompletionReview {
  verdict: 'APPROVED' | 'REVISION_NEEDED' | 'ESCALATE';
  reason: string;
  revisionNote: string | null;
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

function findOldestBackup(filePath: string, cwd: string): string | null {
  const backupDir = path.join(cwd, '.bob-backups');
  if (!fs.existsSync(backupDir)) return null;
  const safeName = filePath.replace(/[\/\\]/g, '_');
  try {
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(safeName) && f.endsWith('.bak'))
      .sort(); // oldest first
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
      reason: `File reduced to ${Math.round(reductionRatio * 100)}% of original size (minimum ${Math.round(minRatio * 100)}% for ${operationType} operations). Agent likely gutted the file instead of making a targeted change.`,
    };
  }

  if (operationType === 'PATCH' || operationType === 'REFACTOR') {
    const originalExports = extractExports(originalContent);
    const currentExports = extractExports(currentContent);
    const missingExports = originalExports.filter(e => !currentExports.includes(e));

    if (missingExports.length > 0) {
      return {
        passed: false,
        reason: `Missing exports after ${operationType}: ${missingExports.join(', ')}. These were present in the original and must be preserved.`,
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
        reason: `Import count changed by ${importDelta} (${originalImports} → ${currentImports}). PATCH operations should add at most 2 imports. Agent may have rewritten the file.`,
      };
    }
  }

  return { passed: true, reason: null };
}

// ─── TASK COMPLETION REVIEW ───────────────────────────────────────

/**
 * DirectorBob's full intelligent review of a completed task.
 *
 * Disposition: APPROVAL-BIASED. The agent already passed satisfaction
 * scoring. DirectorBob's job here is to CONFIRM correctness, not hunt
 * for problems. Only reject if there is a concrete, obvious problem.
 *
 * Uses two-step RAG retrieval + full project context + oldest backup
 * as the baseline (pre-mission original, not last attempt).
 */
export async function reviewTaskCompletion(
  taskInstruction: string,
  agentName: string,
  agentMessage: string,
  filesWritten: Array<{ filePath: string; isNew: boolean }>,
  attemptCount: number,
  cwd: string,
  localEndpoint: string,
  operationType?: OperationType
): Promise<TaskCompletionReview> {

  const opType: OperationType = operationType || 'CREATE';

  // ─── 1. Two-step RAG retrieval ─────────────────────────────────
  let projectContext = '';
  try {
    const retrieval = await getRelevantFileContents(
      `${taskInstruction}\n\nReviewing completed task for: ${filesWritten.map(f => f.filePath).join(', ')}`,
      localEndpoint
    );
    projectContext = retrieval.fileContents;
  } catch { /* non-fatal */ }

  // ─── 2. Build file evidence ────────────────────────────────────
  // Uses OLDEST backup as baseline — the pre-mission original.
  // This ensures we're comparing final result against where we
  // started, not against a previous attempt's intermediate state.
  let fileEvidence = '';

  for (const file of filesWritten) {
    const absolutePath = path.join(cwd, file.filePath);

    let currentContent = '[File not found on disk]';
    if (fs.existsSync(absolutePath)) {
      try {
        currentContent = fs.readFileSync(absolutePath, 'utf-8');
      } catch {
        currentContent = '[Could not read file]';
      }
    }

    let originalContent = '';
    if (!file.isNew) {
      // Use OLDEST backup — pre-mission baseline, not last attempt
      const backupPath = findOldestBackup(file.filePath, cwd);
      if (backupPath && fs.existsSync(backupPath)) {
        try {
          originalContent = fs.readFileSync(backupPath, 'utf-8');
        } catch { }
      }
    }

    const currentLines = currentContent.split('\n').length;
    const originalLines = originalContent ? originalContent.split('\n').length : 0;

    fileEvidence += `\n--- FILE: ${file.filePath} ---\n`;
    fileEvidence += file.isNew
      ? `STATUS: NEW FILE (${currentLines} lines)\n`
      : `STATUS: MODIFIED (${originalLines} → ${currentLines} lines)\n`;

    if (!file.isNew && originalContent) {
      fileEvidence += `\nORIGINAL (pre-mission):\n\`\`\`\n${originalContent.slice(0, 2000)}${originalContent.length > 2000 ? '\n...(truncated)' : ''}\n\`\`\`\n`;
    }

    fileEvidence += `\nCURRENT:\n\`\`\`\n${currentContent.slice(0, 2000)}${currentContent.length > 2000 ? '\n...(truncated)' : ''}\n\`\`\`\n`;
    fileEvidence += `--- END FILE ---\n`;
  }

  // ─── 3. Build review prompt ────────────────────────────────────
  const reviewPrompt = `TASK INSTRUCTION:
${taskInstruction}

OPERATION TYPE: ${opType}
AGENT: @${agentName}
ATTEMPT COUNT: ${attemptCount}

AGENT'S SUMMARY:
"${agentMessage}"

FILES WRITTEN:
${fileEvidence}

${projectContext ? `RELEVANT PROJECT CONTEXT:\n${projectContext.slice(0, 2000)}\n` : ''}

Your job is to CONFIRM whether this task is complete and correct.

Ask yourself ONE question: Does the current file correctly implement what the task instruction asked for?

Only flag REVISION_NEEDED if you can identify a SPECIFIC, CONCRETE problem:
- The specific feature/function requested is missing entirely
- The code has an obvious syntax error that would prevent it from running
- Existing functionality that was working before is now broken

Do NOT flag REVISION_NEEDED for:
- Minor style differences
- Comments being slightly different
- The code looking different from what you would have written
- Small variations between attempts that don't affect correctness
- Things that look "not quite right" but work correctly

Respond with ONLY this JSON on a single line:
{"verdict":"APPROVED"|"REVISION_NEEDED"|"ESCALATE","reason":"one concrete sentence","revisionNote":"specific actionable fix OR null if approved"}

VERDICT definitions:
- APPROVED: The task instruction has been correctly implemented. Mark it done.
- REVISION_NEEDED: There is a specific concrete problem stated above. Provide exact fix instruction.
- ESCALATE: ${attemptCount >= 3 ? 'Agent has made ' + attemptCount + ' attempts — escalate to user.' : 'Fundamental blocker requiring user intervention.'}`;

  // ─── 4. Call model ─────────────────────────────────────────────
  try {
    const messages: LocalChatMessage[] = [
      { role: 'system', content: TASK_COMPLETION_REVIEWER_PROMPT },
      { role: 'user', content: reviewPrompt },
    ];

    const rawResponse = await callLocalModel(localEndpoint, messages);
    const responseText =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    return parseTaskCompletionResponse(responseText);

  } catch (error: any) {
    return {
      verdict: 'APPROVED',
      reason: `Review failed: ${error.message}. Defaulting to approved.`,
      revisionNote: null,
      reviewedAt: new Date().toISOString(),
    };
  }
}

// ─── TASK COMPLETION REVIEWER PROMPT ──────────────────────────────
// Approval-biased. Confirms correctness rather than hunting for problems.
// The agent already passed satisfaction scoring — this is a sanity check,
// not an adversarial review.

const TASK_COMPLETION_REVIEWER_PROMPT = `You are DirectorBob in TASK CONFIRMATION MODE.

Your job is to confirm whether an agent has correctly completed its assigned task.
You are NOT hunting for problems. You are confirming correctness.

The agent has already self-evaluated and believes the task is done.
Your role is to verify that belief is correct.

APPROVE unless you can point to a SPECIFIC, CONCRETE problem:
- The requested feature is completely missing from the code
- There is an obvious syntax error that would prevent compilation
- Critical existing functionality has been removed or broken

Do NOT reject for vague reasons like "could be improved" or "slightly different than expected."
Do NOT reject because something looks different between two versions of the file.
Do NOT reject because you would have written it differently.

If the code implements what was asked and doesn't break anything — APPROVE IT.

Respond with ONLY valid JSON on a single line.`;

// ─── TASK COMPLETION RESPONSE PARSER ─────────────────────────────

function parseTaskCompletionResponse(response: string): TaskCompletionReview {
  let jsonStr = response.trim();

  // Strip markdown fences
  const fencedMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fencedMatch) jsonStr = fencedMatch[1].trim();

  // Find JSON object via bracket depth
  const firstBrace = jsonStr.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let lastBrace = -1;
    for (let i = firstBrace; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') depth++;
      if (jsonStr[i] === '}') {
        depth--;
        if (depth === 0) { lastBrace = i; break; }
      }
    }

    if (lastBrace !== -1) {
      try {
        const parsed = JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1));
        const verdict = ['APPROVED', 'REVISION_NEEDED', 'ESCALATE'].includes(parsed.verdict)
          ? parsed.verdict as 'APPROVED' | 'REVISION_NEEDED' | 'ESCALATE'
          : 'APPROVED';

        return {
          verdict,
          reason: typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided.',
          revisionNote: typeof parsed.revisionNote === 'string' && parsed.revisionNote !== 'null'
            ? parsed.revisionNote
            : null,
          reviewedAt: new Date().toISOString(),
        };
      } catch { }
    }
  }

  // Keyword fallback
  const upper = response.toUpperCase();
  let verdict: 'APPROVED' | 'REVISION_NEEDED' | 'ESCALATE' = 'APPROVED';
  if (upper.includes('ESCALATE')) verdict = 'ESCALATE';
  else if (upper.includes('REVISION_NEEDED') || upper.includes('REVISION NEEDED')) verdict = 'REVISION_NEEDED';

  return {
    verdict,
    reason: response.slice(0, 200).trim() || 'Review completed.',
    revisionNote: verdict !== 'APPROVED' ? response.slice(0, 200).trim() : null,
    reviewedAt: new Date().toISOString(),
  };
}

// ─── COMMIT REVIEW ────────────────────────────────────────────────

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

    let currentContent = '';
    if (fs.existsSync(absolutePath)) {
      try {
        currentContent = fs.readFileSync(absolutePath, 'utf-8');
      } catch {
        currentContent = '[Could not read current file]';
      }
    } else {
      fileReviews.push({
        filePath: fileChange.filePath,
        verdict: 'DENY',
        reason: 'File does not exist on disk — agent may have failed to write it.',
        backupPath: fileChange.backupPath,
      });
      continue;
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

    // ─── Programmatic check FIRST ──────────────────────────────
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

    // ─── Two-step retrieval ─────────────────────────────────────
    let projectContext = '';
    try {
      const retrieval = await getRelevantFileContents(
        `${taskInstruction}\n\nReviewing changes to: ${fileChange.filePath}`,
        localEndpoint
      );
      projectContext = retrieval.fileContents;
    } catch { }

    // ─── LLM review ────────────────────────────────────────────
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
        { role: 'system', content: COMMIT_REVIEWER_SYSTEM_PROMPT },
        { role: 'user', content: reviewPrompt },
      ];

      const rawResponse = await callLocalModel(localEndpoint, messages);
      const responseText =
        typeof rawResponse === 'object' && rawResponse.text
          ? rawResponse.text
          : (rawResponse as unknown as string);

      const fileReview = parseFileReviewResponse(responseText, fileChange.filePath, backupPath);
      fileReviews.push(fileReview);

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
  const denied = fileReviews.filter(f => f.verdict === 'DENY');
  const warned = fileReviews.filter(f => f.verdict === 'WARN');
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

// ─── COMMIT REVIEWER SYSTEM PROMPT ───────────────────────────────

const COMMIT_REVIEWER_SYSTEM_PROMPT = `You are DirectorBob in CODE REVIEW MODE.

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

// ─── FILE REVIEW PROMPT BUILDER ───────────────────────────────────

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

FILE BEING REVIEWED: ${filePath}
${isNewFile ? 'STATUS: NEW FILE' : `STATUS: MODIFIED (${originalLines} → ${currentLines} lines, ${lineDiff >= 0 ? '+' : ''}${lineDiff}${reductionPercent > 0 ? `, ${reductionPercent}% reduction` : ''})`}

${!isNewFile && originalContent ? `ORIGINAL FILE:\n\`\`\`\n${originalContent.slice(0, 3000)}${originalContent.length > 3000 ? '\n...(truncated)' : ''}\n\`\`\`\n` : ''}
CURRENT FILE:\n\`\`\`\n${currentContent.slice(0, 3000)}${currentContent.length > 3000 ? '\n...(truncated)' : ''}\n\`\`\`

${projectContext ? `RELEVANT PROJECT CONTEXT:\n${projectContext.slice(0, 1500)}\n` : ''}
Evaluate this ${operationType} change. Respond with ONLY the JSON verdict on a single line.`;
}

// ─── FILE REVIEW RESPONSE PARSER ──────────────────────────────────

function parseFileReviewResponse(
  response: string,
  filePath: string,
  backupPath: string | null
): FileReviewResult {
  const jsonMatch = response.match(/\{[^{}]*"verdict"[^{}]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const verdict = ['APPROVE', 'DENY', 'WARN'].includes(parsed.verdict)
        ? parsed.verdict as 'APPROVE' | 'DENY' | 'WARN'
        : 'WARN';
      return { filePath, verdict, reason: parsed.reason || 'No reason provided.', backupPath };
    } catch { }
  }

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