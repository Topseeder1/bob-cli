import {
  loadLocalSuggestions
} from "./chunk-TEVQLSGD.js";
import {
  callLocalModel,
  getConfig,
  readFileContent
} from "./chunk-6W7WDF4Q.js";

// src/commands/analyse-auto.ts
import chalk from "chalk";
import ora from "ora";
import * as fs from "fs";
import * as path from "path";
var RED = chalk.hex("#EF5350");
var GREEN = chalk.hex("#66BB6A");
var AMBER = chalk.hex("#FFAB00");
var BLUE = chalk.hex("#42A5F5");
var GRAY = chalk.gray;
var BORDER = chalk.hex("#455A64");
async function runAutoFix(options) {
  const config = getConfig();
  if (config.provider !== "local" || !config.localEndpoint) {
    console.log("");
    console.log(chalk.red("  \u274C Auto-fix requires a local model."));
    console.log(GRAY("  Run `bob config set provider local`"));
    console.log(GRAY("  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`"));
    console.log("");
    return;
  }
  const confidenceGate = options.confidence || 90;
  const priorityGate = options.priority || "critical";
  const categories = options.category ? [options.category] : ["bugs", "features", "improvements", "upgrades"];
  console.log("");
  console.log(chalk.bold.cyan("  \u26A1 MiniBob Auto-Fix Mode"));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(GRAY(`  Confidence gate: ${confidenceGate}%`));
  console.log(GRAY(`  Priority gate: ${priorityGate}+`));
  console.log(GRAY(`  Categories: ${categories.join(", ")}`));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  let allSuggestions = [];
  for (const cat of categories) {
    const catSuggestions = loadLocalSuggestions(cat);
    allSuggestions.push(...catSuggestions);
  }
  const priorityOrder = ["critical", "high", "medium", "low"];
  const gateIndex = priorityOrder.indexOf(priorityGate.toLowerCase());
  if (gateIndex >= 0) {
    allSuggestions = allSuggestions.filter((s) => {
      const idx = priorityOrder.indexOf(s.priority?.toLowerCase());
      return idx >= 0 && idx <= gateIndex;
    });
  }
  if (allSuggestions.length === 0) {
    console.log(chalk.green("  \u2705 No suggestions match your gates. Project is clean!"));
    console.log("");
    return;
  }
  console.log(GRAY(`  Found ${allSuggestions.length} suggestions matching criteria.`));
  console.log("");
  console.log(AMBER("  \u{1F9E0} Phase 1: Triage \u2014 Bob is evaluating suggestions..."));
  console.log("");
  const triageResults = [];
  const triageSpinner = ora({ text: chalk.cyan("  Triaging..."), spinner: "dots" }).start();
  const triagePrompt = `You are a senior engineering lead triaging code suggestions. For each suggestion below, decide whether to WORK on it or DISMISS it.

DECISION CRITERIA:
- WORK: The fix is clear, well-defined, and will improve code quality. You are ${confidenceGate}%+ confident the fix is correct and won't break anything.
- DISMISS: The suggestion is vague, risky, or the effort outweighs the benefit.

SUGGESTIONS:
${allSuggestions.map((s, i) => `[${i}] ${s.priority?.toUpperCase()} | ${s.filePath} | ${s.title} | ${s.description}`).join("\n")}

Respond with ONLY a JSON array. Each element: {"index": 0, "action": "work"|"dismiss", "confidence": 0-100, "reason": "brief reason"}

Example:
[{"index": 0, "action": "work", "confidence": 95, "reason": "Clear fix, low risk"}, {"index": 1, "action": "dismiss", "confidence": 40, "reason": "Too vague to implement safely"}]

Return ONLY the JSON array:`;
  try {
    const messages = [
      { role: "system", content: "You are a senior engineering lead. Respond with ONLY a valid JSON array. No explanation." },
      { role: "user", content: triagePrompt }
    ];
    const triageResponse = await callLocalModel(config.localEndpoint, messages);
    triageSpinner.stop();
    const jsonMatch = triageResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      for (const decision of parsed) {
        if (decision.index !== void 0 && decision.index < allSuggestions.length) {
          triageResults.push({
            action: decision.action === "work" ? "work" : "dismiss",
            confidence: decision.confidence || 0,
            reason: decision.reason || "",
            suggestion: allSuggestions[decision.index]
          });
        }
      }
    }
  } catch (error) {
    triageSpinner.stop();
    console.log(chalk.red(`  \u274C Triage failed: ${error.message}`));
    console.log("");
    return;
  }
  const workItems = triageResults.filter((r) => r.action === "work" && r.confidence >= confidenceGate);
  const dismissItems = triageResults.filter((r) => r.action === "dismiss" || r.confidence < confidenceGate);
  console.log("");
  console.log(BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(BORDER("  \u2551") + AMBER(" \u25C6 TRIAGE COMPLETE"));
  console.log(BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER("  \u2551") + GREEN(`  \u2705 Work: ${workItems.length} items (confidence \u2265 ${confidenceGate}%)`));
  console.log(BORDER("  \u2551") + GRAY(`  \u23F8\uFE0F  Held: ${dismissItems.length} items (dismissed or low confidence)`));
  console.log(BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  if (workItems.length === 0) {
    console.log(chalk.yellow("  \u26A0\uFE0F  No items passed the confidence gate. Nothing to auto-fix."));
    console.log("");
    if (dismissItems.length > 0) {
      console.log(GRAY("  Held items:"));
      for (const item of dismissItems.slice(0, 5)) {
        console.log(GRAY(`    \u2022 ${item.suggestion.filePath}: ${item.reason} (${item.confidence}%)`));
      }
      console.log("");
    }
    return;
  }
  console.log(AMBER("  \u{1F4CB} Phase 2: MiniBob Work Queue"));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  for (let i = 0; i < workItems.length; i++) {
    const item = workItems[i];
    console.log(GRAY(`  \u2610 [${i + 1}/${workItems.length}] ${item.suggestion.filePath}`));
    console.log(GRAY(`    ${item.suggestion.title} (${item.confidence}% confidence)`));
  }
  console.log("");
  console.log(AMBER("  \u{1F527} Phase 3: MiniBob Implementing..."));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  console.log("");
  console.log("");
  console.log("");
  let fixed = 0;
  let failed = 0;
  const fixedItems = [];
  const failedItems = [];
  for (let i = 0; i < workItems.length; i++) {
    const item = workItems[i];
    const suggestion = item.suggestion;
    printAutoProgress(i + 1, workItems.length, suggestion.filePath, "working");
    const fileContent = readFileContent(suggestion.filePath);
    if (!fileContent) {
      failed++;
      failedItems.push(`${suggestion.filePath}: Could not read file`);
      printAutoProgress(i + 1, workItems.length, suggestion.filePath, "failed");
      continue;
    }
    const implPrompt = `You are an expert programmer implementing a specific code change.

CURRENT FILE: ${suggestion.filePath}
${fileContent}

CHANGE TO IMPLEMENT:
Title: ${suggestion.title}
Description: ${suggestion.description}
Implementation Instructions: ${suggestion.implementation || "Apply the fix described above."}

RULES:
- Return ONLY the complete updated file content with the change applied.
- Start the code with: // File: ${suggestion.filePath}
- PRESERVE all existing code structure. Only change what's needed.
- Do NOT include any explanation outside the code.`;
    try {
      const messages = [
        { role: "system", content: "You are an expert programmer. Return ONLY the complete updated file. Start with // File: path comment. Preserve existing structure." },
        { role: "user", content: implPrompt }
      ];
      const response = await callLocalModel(config.localEndpoint, messages);
      const lines = response.split("\n");
      const firstLine = lines[0].trim();
      let newContent;
      if (firstLine.match(/^\/\/\s*(File:)?\s*/)) {
        newContent = lines.slice(1).join("\n").trim();
      } else {
        newContent = response.trim();
      }
      const absolutePath = path.join(process.cwd(), suggestion.filePath);
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const backupDir = path.join(process.cwd(), ".bob-backups");
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      if (fs.existsSync(absolutePath)) {
        const timestamp = Date.now();
        const backupName = suggestion.filePath.replace(/[\/\\]/g, "_") + `.${timestamp}.bak`;
        fs.copyFileSync(absolutePath, path.join(backupDir, backupName));
      }
      fs.writeFileSync(absolutePath, newContent, "utf-8");
      fixed++;
      fixedItems.push(suggestion.filePath);
      printAutoProgress(i + 1, workItems.length, suggestion.filePath, "done");
    } catch (error) {
      failed++;
      failedItems.push(`${suggestion.filePath}: ${error.message}`);
      printAutoProgress(i + 1, workItems.length, suggestion.filePath, "failed");
    }
  }
  console.log("");
  console.log("");
  console.log(BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(BORDER("  \u2551") + AMBER(" \u25C6 MINIBOB AUTO-FIX REPORT"));
  console.log(BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER("  \u2551") + GREEN(`  \u2705 Fixed: ${fixed} items`));
  console.log(BORDER("  \u2551") + GRAY(`  \u23F8\uFE0F  Held: ${dismissItems.length} items (low confidence/dismissed)`));
  if (failed > 0) {
    console.log(BORDER("  \u2551") + RED(`  \u274C Failed: ${failed} items`));
  }
  console.log(BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  if (fixedItems.length > 0) {
    console.log(BORDER("  \u2551") + chalk.gray("  Fixed files:"));
    for (const file of fixedItems) {
      console.log(BORDER("  \u2551") + GREEN(`    \u2705 ${file}`));
    }
  }
  if (failedItems.length > 0) {
    console.log(BORDER("  \u2551") + chalk.gray("  Failed:"));
    for (const item of failedItems) {
      console.log(BORDER("  \u2551") + RED(`    \u274C ${item}`));
    }
  }
  if (dismissItems.length > 0) {
    console.log(BORDER("  \u2551") + chalk.gray("  Held (not auto-fixed):"));
    for (const item of dismissItems.slice(0, 5)) {
      console.log(BORDER("  \u2551") + GRAY(`    \u23F8\uFE0F  ${item.suggestion.filePath}: ${item.reason}`));
    }
    if (dismissItems.length > 5) {
      console.log(BORDER("  \u2551") + GRAY(`    ... and ${dismissItems.length - 5} more`));
    }
  }
  console.log(BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  console.log(GRAY("  \u{1F4E6} All original files backed up to .bob-backups/"));
  console.log(GRAY('  Run `bob push "MiniBob auto-fix batch"` to commit changes.'));
  console.log("");
}
function printAutoProgress(current, total, filePath, status) {
  const percent = current / total;
  const barLength = 30;
  const filled = Math.round(percent * barLength);
  let barColor;
  if (percent < 0.25) barColor = chalk.red;
  else if (percent < 0.5) barColor = chalk.hex("#FF8C00");
  else if (percent < 0.75) barColor = chalk.yellow;
  else barColor = chalk.green;
  const filledBar = barColor("\u2588".repeat(filled));
  const emptyBar = GRAY("\u2591".repeat(barLength - filled));
  let statusIcon;
  let statusColor;
  if (status === "working") {
    statusIcon = "\u23F3";
    statusColor = AMBER;
  } else if (status === "done") {
    statusIcon = "\u2705";
    statusColor = GREEN;
  } else {
    statusIcon = "\u274C";
    statusColor = RED;
  }
  process.stdout.write("\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\r");
  console.log(`  [${filledBar}${emptyBar}] ${current}/${total}`);
  console.log(statusColor(`  ${statusIcon} MiniBob ${status === "working" ? "working" : status === "done" ? "completed" : "failed"}: ${filePath}`));
  console.log(status === "working" ? AMBER(`    Assigned \u2192 Working...`) : status === "done" ? GREEN(`    Assigned \u2192 Working \u2192 Completed \u2713`) : RED(`    Assigned \u2192 Failed \u2717`));
  console.log("");
}
export {
  runAutoFix
};
