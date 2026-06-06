import * as fs from 'fs';
import * as path from 'path';

const BOB_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.bob');

function getResultsDir(): string {
  const projectName = path.basename(process.cwd());
  return path.join(BOB_DIR, 'projects', projectName, 'analysis', 'results');
}

function getAnalysisPath(): string {
  return path.join(getResultsDir(), 'analysis.json');
}

function getStatusLogPath(): string {
  return path.join(getResultsDir(), 'status-log.json');
}

/**
 * Marks a suggestion's status in analysis.json and logs to status-log.json.
 */
export function markSuggestionStatus(
  filePath: string,
  suggestionIndex: number,
  category: string,
  status: 'implemented' | 'dismissed',
  metadata?: { confidence?: number; reason?: string; implementedBy?: string }
): void {
  const analysisPath = getAnalysisPath();
  const logPath = getStatusLogPath();

  if (!fs.existsSync(analysisPath)) return;

  // ─── Update analysis.json ───
  const allResults = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));

  if (allResults[filePath] && allResults[filePath][category]) {
    const items = allResults[filePath][category];
    if (items[suggestionIndex]) {
      items[suggestionIndex].status = status;
      items[suggestionIndex].statusUpdatedAt = new Date().toISOString();
    }
  }

  fs.writeFileSync(analysisPath, JSON.stringify(allResults, null, 2));

  // ─── Append to status-log.json ───
  let log: any[] = [];
  if (fs.existsSync(logPath)) {
    try {
      log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    } catch {
      log = [];
    }
  }

  log.push({
    timestamp: new Date().toISOString(),
    filePath: filePath,
    category: category,
    suggestionIndex: suggestionIndex,
    action: status,
    confidence: metadata?.confidence || null,
    reason: metadata?.reason || null,
    implementedBy: metadata?.implementedBy || 'minibob',
    previousStatus: 'pending',
  });

  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

/**
 * Marks a suggestion by its ID string (filePath_index format).
 */
export function markSuggestionById(
  id: string,
  category: string,
  status: 'implemented' | 'dismissed',
  metadata?: { confidence?: number; reason?: string; implementedBy?: string }
): void {
  const analysisPath = getAnalysisPath();
  if (!fs.existsSync(analysisPath)) return;

  const allResults = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));

  // Find the suggestion by iterating
  for (const [filePath, fileResults] of Object.entries(allResults)) {
    const items = (fileResults as any)[category];
    if (!items) continue;

    for (let i = 0; i < items.length; i++) {
      const itemId = `${filePath.replace(/[\/\\]/g, '_')}_${i}`;
      if (itemId === id) {
        markSuggestionStatus(filePath, i, category, status, metadata);
        return;
      }
    }
  }
}

/**
 * Gets the status log for review/audit.
 */
export function getStatusLog(): any[] {
  const logPath = getStatusLogPath();
  if (!fs.existsSync(logPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Gets a summary of actions taken.
 */
export function getStatusSummary(): { implemented: number; dismissed: number; pending: number } {
  const analysisPath = getAnalysisPath();
  if (!fs.existsSync(analysisPath)) return { implemented: 0, dismissed: 0, pending: 0 };

  const allResults = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  let implemented = 0, dismissed = 0, pending = 0;

  for (const fileResults of Object.values(allResults)) {
    for (const category of ['bugs', 'features', 'improvements', 'upgrades']) {
      const items = (fileResults as any)[category] || [];
      for (const item of items) {
        if (item.status === 'implemented') implemented++;
        else if (item.status === 'dismissed') dismissed++;
        else pending++;
      }
    }
  }

  return { implemented, dismissed, pending };
}