// src/core/analysis-tracker.ts
import * as fs from "fs";
import * as path from "path";
var BOB_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "", ".bob");
function getResultsDir() {
  const projectName = path.basename(process.cwd());
  return path.join(BOB_DIR, "projects", projectName, "analysis", "results");
}
function getAnalysisPath() {
  return path.join(getResultsDir(), "analysis.json");
}
function getStatusLogPath() {
  return path.join(getResultsDir(), "status-log.json");
}
function markSuggestionStatus(filePath, suggestionIndex, category, status, metadata) {
  const analysisPath = getAnalysisPath();
  const logPath = getStatusLogPath();
  if (!fs.existsSync(analysisPath)) return;
  const allResults = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
  if (allResults[filePath] && allResults[filePath][category]) {
    const items = allResults[filePath][category];
    if (items[suggestionIndex]) {
      items[suggestionIndex].status = status;
      items[suggestionIndex].statusUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
  }
  fs.writeFileSync(analysisPath, JSON.stringify(allResults, null, 2));
  let log = [];
  if (fs.existsSync(logPath)) {
    try {
      log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    } catch {
      log = [];
    }
  }
  log.push({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    filePath,
    category,
    suggestionIndex,
    action: status,
    confidence: metadata?.confidence || null,
    reason: metadata?.reason || null,
    implementedBy: metadata?.implementedBy || "minibob",
    previousStatus: "pending"
  });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}
function markSuggestionById(id, category, status, metadata) {
  const analysisPath = getAnalysisPath();
  if (!fs.existsSync(analysisPath)) return;
  const allResults = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
  for (const [filePath, fileResults] of Object.entries(allResults)) {
    const items = fileResults[category];
    if (!items) continue;
    for (let i = 0; i < items.length; i++) {
      const itemId = `${filePath.replace(/[\/\\]/g, "_")}_${i}`;
      if (itemId === id) {
        markSuggestionStatus(filePath, i, category, status, metadata);
        return;
      }
    }
  }
}
function getStatusLog() {
  const logPath = getStatusLogPath();
  if (!fs.existsSync(logPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(logPath, "utf-8"));
  } catch {
    return [];
  }
}
function getStatusSummary() {
  const analysisPath = getAnalysisPath();
  if (!fs.existsSync(analysisPath)) return { implemented: 0, dismissed: 0, pending: 0 };
  const allResults = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
  let implemented = 0, dismissed = 0, pending = 0;
  for (const fileResults of Object.values(allResults)) {
    for (const category of ["bugs", "features", "improvements", "upgrades"]) {
      const items = fileResults[category] || [];
      for (const item of items) {
        if (item.status === "implemented") implemented++;
        else if (item.status === "dismissed") dismissed++;
        else pending++;
      }
    }
  }
  return { implemented, dismissed, pending };
}

export {
  markSuggestionStatus,
  markSuggestionById,
  getStatusLog,
  getStatusSummary
};
