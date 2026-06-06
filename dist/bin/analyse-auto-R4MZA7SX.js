import {
  loadLocalSuggestions
} from "./chunk-7CXM3RLM.js";
import {
  callLocalModel,
  getConfig,
  readFileContent
} from "./chunk-J4BSKFCW.js";

// src/commands/analyse-auto.ts
import chalk from "chalk";
import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
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
  const isAutoMode = config.autoMode || false;
  console.log("");
  console.log(chalk.bold.cyan("  \u26A1 MiniBob Auto-Fix Mode"));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(GRAY(`  Confidence gate: ${confidenceGate}%`));
  console.log(GRAY(`  Priority gate: ${priorityGate}+`));
  console.log(GRAY(`  Categories: ${categories.join(", ")}`));
  console.log(GRAY(`  Auto mode: ${isAutoMode ? "ON (no approval prompts)" : "OFF (approval required)"}`));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  let allSuggestions = [];
  for (const cat of categories) {
    allSuggestions.push(...loadLocalSuggestions(cat));
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
  const triageResults = await performTriage(allSuggestions, confidenceGate, config.localEndpoint);
  if (!triageResults) return;
  const autoApprove = triageResults.filter((r) => r.action === "work" && r.confidence >= confidenceGate);
  const needsReview = triageResults.filter((r) => r.action === "review" || r.action === "work" && r.confidence < confidenceGate && r.confidence >= confidenceGate - 15);
  const dismissed = triageResults.filter((r) => r.action === "dismiss" || r.confidence < confidenceGate - 15);
  console.log(BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(BORDER("  \u2551") + AMBER(" \u25C6 TRIAGE COMPLETE"));
  console.log(BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER("  \u2551") + GREEN(`  \u2705 Auto-approve: ${autoApprove.length} items (confidence \u2265 ${confidenceGate}%)`));
  if (needsReview.length > 0) {
    console.log(BORDER("  \u2551") + AMBER(`  \u{1F914} Needs review: ${needsReview.length} items`));
  }
  console.log(BORDER("  \u2551") + GRAY(`  \u23F8\uFE0F  Dismissed: ${dismissed.length} items`));
  console.log(BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  if (autoApprove.length > 0) {
    console.log(GREEN("  \u2705 APPROVE (auto-fix these):"));
    for (let i = 0; i < autoApprove.length; i++) {
      const item = autoApprove[i];
      console.log(GRAY(`    ${i + 1}. ${item.suggestion.filePath} \u2014 ${item.suggestion.title || item.suggestion.description?.slice(0, 40) || "No title"} (${item.confidence}%)`));
    }
    console.log("");
  }
  if (needsReview.length > 0) {
    console.log(AMBER("  \u{1F914} REVIEW (Bob wants your input):"));
    for (let i = 0; i < needsReview.length; i++) {
      const item = needsReview[i];
      console.log(GRAY(`    ${i + 1}. ${item.suggestion.filePath} \u2014 ${item.reason} (${item.confidence}%)`));
    }
    console.log("");
  }
  let workQueue = [];
  if (isAutoMode) {
    workQueue = autoApprove.map((r) => ({
      suggestion: r.suggestion,
      confidence: r.confidence,
      reason: r.reason,
      status: "pending"
    }));
    console.log(GRAY("  [Auto mode] Proceeding without approval prompt."));
  } else {
    const { choice } = await inquirer.prompt([
      {
        type: "select",
        name: "choice",
        message: AMBER("How would you like to proceed?"),
        choices: [
          { name: GREEN(`  \u2705 Auto-fix approved items only (${autoApprove.length} items)`), value: "approved_only" },
          { name: GREEN(`  \u2705 Auto-fix ALL including review items (${autoApprove.length + needsReview.length} items)`), value: "all" },
          { name: BLUE("  \u{1F5E3}\uFE0F  Talk to Bob about these suggestions"), value: "talk" },
          { name: GRAY("  \u2190 Cancel"), value: "cancel" }
        ]
      }
    ]);
    if (choice === "cancel") {
      console.log(GRAY("  Cancelled."));
      console.log("");
      return;
    }
    if (choice === "talk") {
      const updatedQueue = await talkToBobAboutSuggestions(autoApprove, needsReview, dismissed, config.localEndpoint);
      if (updatedQueue.length === 0) {
        console.log(GRAY("  No items to implement after discussion."));
        console.log("");
        return;
      }
      workQueue = updatedQueue;
    } else if (choice === "approved_only") {
      workQueue = autoApprove.map((r) => ({
        suggestion: r.suggestion,
        confidence: r.confidence,
        reason: r.reason,
        status: "pending"
      }));
    } else {
      workQueue = [...autoApprove, ...needsReview].map((r) => ({
        suggestion: r.suggestion,
        confidence: r.confidence,
        reason: r.reason,
        status: "pending"
      }));
    }
  }
  if (workQueue.length === 0) {
    console.log(chalk.yellow("  \u26A0\uFE0F  Nothing to implement."));
    console.log("");
    return;
  }
  console.log("");
  console.log(AMBER("  \u{1F527} Phase 3: MiniBob Implementing..."));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(GRAY("  \u{1F4AC} You can type messages to Bob while MiniBobs work."));
  console.log(GRAY("     Your input adjusts remaining tasks. Type /done when finished."));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  await executeWithChat(workQueue, config);
  const fixed = workQueue.filter((t) => t.status === "done");
  const failed = workQueue.filter((t) => t.status === "failed");
  const skipped = workQueue.filter((t) => t.status === "skipped");
  console.log("");
  console.log(BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(BORDER("  \u2551") + AMBER(" \u25C6 MINIBOB AUTO-FIX REPORT"));
  console.log(BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER("  \u2551") + GREEN(`  \u2705 Fixed: ${fixed.length} items`));
  console.log(BORDER("  \u2551") + GRAY(`  \u23F8\uFE0F  Held: ${dismissed.length + skipped.length} items`));
  if (failed.length > 0) {
    console.log(BORDER("  \u2551") + RED(`  \u274C Failed: ${failed.length} items`));
  }
  console.log(BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  if (fixed.length > 0) {
    console.log(BORDER("  \u2551") + GRAY("  Fixed files:"));
    for (const item of fixed) {
      console.log(BORDER("  \u2551") + GREEN(`    \u2705 ${item.suggestion.filePath}`));
    }
  }
  if (failed.length > 0) {
    console.log(BORDER("  \u2551") + GRAY("  Failed:"));
    for (const item of failed) {
      console.log(BORDER("  \u2551") + RED(`    \u274C ${item.suggestion.filePath}`));
    }
  }
  if (skipped.length > 0) {
    console.log(BORDER("  \u2551") + GRAY("  Skipped (by user):"));
    for (const item of skipped) {
      console.log(BORDER("  \u2551") + GRAY(`    \u23F8\uFE0F  ${item.suggestion.filePath}`));
    }
  }
  console.log(BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  console.log(GRAY("  \u{1F4E6} All original files backed up to .bob-backups/"));
  console.log(GRAY('  Run `bob push "MiniBob auto-fix batch"` to commit changes.'));
  console.log("");
}
async function performTriage(suggestions, confidenceGate, endpoint) {
  const triagePrompt = `You are a senior engineering lead triaging code suggestions. For each suggestion, decide: WORK (safe to auto-fix), REVIEW (needs human input), or DISMISS (skip it).

CRITERIA:
- WORK: Clear fix, well-defined, won't break anything. High confidence.
- REVIEW: Fix is good but has side effects or behavioral changes that a human should approve.
- DISMISS: Vague, risky, or effort outweighs benefit.

SUGGESTIONS:
${suggestions.map((s, i) => `[${i}] ${s.priority?.toUpperCase()} | ${s.filePath} | ${s.title || "No title"} | ${s.description || "No description"}`).join("\n")}

Respond with ONLY a JSON array:
[{"index": 0, "action": "work"|"review"|"dismiss", "confidence": 0-100, "reason": "brief reason"}]`;
  try {
    const messages = [
      { role: "system", content: "You are a senior engineering lead. Respond with ONLY a valid JSON array. No explanation." },
      { role: "user", content: triagePrompt }
    ];
    const response = await callLocalModel(endpoint, messages);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(chalk.red("  \u274C Triage failed: Could not parse response."));
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    const results = [];
    for (const decision of parsed) {
      if (decision.index !== void 0 && decision.index < suggestions.length) {
        results.push({
          action: decision.action === "work" ? "work" : decision.action === "review" ? "review" : "dismiss",
          confidence: decision.confidence || 0,
          reason: decision.reason || "",
          suggestion: suggestions[decision.index]
        });
      }
    }
    return results;
  } catch (error) {
    console.log(chalk.red(`  \u274C Triage failed: ${error.message}`));
    return null;
  }
}
async function talkToBobAboutSuggestions(approved, review, dismissed, endpoint) {
  console.log("");
  console.log(BLUE("  \u{1F5E3}\uFE0F  Chat with Bob about the suggestions"));
  console.log(GRAY("  Ask questions, adjust the plan. Type /done when ready."));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  const allItems = [...approved, ...review, ...dismissed];
  const context = `You are Bob, helping the user decide which code suggestions to implement.

APPROVED (will auto-fix): ${approved.map((r) => `${r.suggestion.filePath}: ${r.suggestion.title || r.suggestion.description} (${r.confidence}% \u2014 ${r.reason})`).join("\n")}

NEEDS REVIEW: ${review.map((r) => `${r.suggestion.filePath}: ${r.suggestion.title || r.suggestion.description} (${r.confidence}% \u2014 ${r.reason})`).join("\n")}

DISMISSED: ${dismissed.map((r) => `${r.suggestion.filePath}: ${r.suggestion.title || r.suggestion.description} (${r.confidence}% \u2014 ${r.reason})`).join("\n")}

Help the user understand the suggestions and decide what to implement. Be concise and direct.
If the user says to add/remove items, acknowledge it.`;
  const history = [
    { role: "system", content: context }
  ];
  let finalApproved = [...approved];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const prompt = () => {
      rl.question(chalk.green("  You: "), async (input) => {
        const trimmed = input.trim();
        if (!trimmed) {
          prompt();
          return;
        }
        if (trimmed === "/done") {
          rl.close();
          console.log("");
          console.log(GRAY(`  Proceeding with ${finalApproved.length} items.`));
          console.log("");
          resolve(finalApproved.map((r) => ({
            suggestion: r.suggestion,
            confidence: r.confidence,
            reason: r.reason,
            status: "pending"
          })));
          return;
        }
        if (trimmed.toLowerCase().startsWith("skip ") || trimmed.toLowerCase().startsWith("remove ")) {
          const target = trimmed.slice(trimmed.indexOf(" ") + 1).trim().toLowerCase();
          const before = finalApproved.length;
          finalApproved = finalApproved.filter((r) => !r.suggestion.filePath.toLowerCase().includes(target));
          const removed = before - finalApproved.length;
          if (removed > 0) {
            console.log(chalk.yellow(`  \u23F8\uFE0F  Removed ${removed} item(s) matching "${target}"`));
          } else {
            console.log(GRAY(`  No items found matching "${target}"`));
          }
          console.log("");
          prompt();
          return;
        }
        if (trimmed.toLowerCase().startsWith("add ")) {
          const target = trimmed.slice(4).trim().toLowerCase();
          const toAdd = [...review, ...dismissed].filter((r) => r.suggestion.filePath.toLowerCase().includes(target));
          if (toAdd.length > 0) {
            finalApproved.push(...toAdd);
            console.log(chalk.green(`  \u2705 Added ${toAdd.length} item(s) matching "${target}"`));
          } else {
            console.log(GRAY(`  No items found matching "${target}"`));
          }
          console.log("");
          prompt();
          return;
        }
        history.push({ role: "user", content: trimmed });
        try {
          const response = await callLocalModel(endpoint, history);
          history.push({ role: "assistant", content: response });
          console.log("");
          console.log(chalk.bold.cyan("  \u{1F916} Bob:"));
          const lines = response.split("\n");
          for (const line of lines) {
            console.log(`  ${line}`);
          }
          console.log("");
        } catch (error) {
          console.log(chalk.red(`  \u274C ${error.message}`));
          console.log("");
        }
        prompt();
      });
    };
    prompt();
  });
}
async function executeWithChat(workQueue, config) {
  renderTodoList(workQueue);
  let userMessages = [];
  let chatActive = true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const inputPromise = new Promise((resolve) => {
    const askForInput = () => {
      if (!chatActive) {
        resolve();
        return;
      }
      rl.question(chalk.gray("  \u{1F4AC} (type to talk to Bob, /skip <file>, /done to finish early): "), (input) => {
        const trimmed = input.trim();
        if (trimmed === "/done") {
          for (const task of workQueue) {
            if (task.status === "pending") {
              task.status = "skipped";
            }
          }
          chatActive = false;
          resolve();
          return;
        }
        if (trimmed.startsWith("/skip ")) {
          const target = trimmed.slice(6).trim().toLowerCase();
          for (const task of workQueue) {
            if (task.status === "pending" && task.suggestion.filePath.toLowerCase().includes(target)) {
              task.status = "skipped";
              console.log(chalk.yellow(`  \u23F8\uFE0F  Skipping: ${task.suggestion.filePath}`));
            }
          }
        } else if (trimmed) {
          userMessages.push(trimmed);
        }
        if (chatActive) {
          askForInput();
        } else {
          resolve();
        }
      });
    };
    askForInput();
  });
  for (let i = 0; i < workQueue.length; i++) {
    const task = workQueue[i];
    if (task.status === "skipped") continue;
    task.status = "working";
    renderTodoList(workQueue);
    if (userMessages.length > 0) {
      const userMsg = userMessages.shift();
      try {
        const bobResponse = await callLocalModel(config.localEndpoint, [
          { role: "system", content: `You are Bob supervising MiniBob auto-fixes. The user said something during execution. Respond briefly (1-2 sentences). Current task: ${task.suggestion.filePath} \u2014 ${task.suggestion.title || task.suggestion.description}` },
          { role: "user", content: userMsg }
        ]);
        console.log(chalk.bold.cyan(`  \u{1F916} Bob: `) + bobResponse.split("\n")[0]);
        console.log("");
      } catch {
      }
    }
    const success = await implementTask(task, config.localEndpoint);
    task.status = success ? "done" : "failed";
    renderTodoList(workQueue);
  }
  chatActive = false;
  rl.close();
  await Promise.race([inputPromise, new Promise((resolve) => setTimeout(resolve, 100))]);
}
async function implementTask(task, endpoint) {
  const suggestion = task.suggestion;
  const fileContent = readFileContent(suggestion.filePath);
  if (!fileContent) return false;
  const prompt = `You are an expert programmer implementing a specific code change.

CURRENT FILE: ${suggestion.filePath}
${fileContent}

CHANGE TO IMPLEMENT:
Title: ${suggestion.title || "Fix"}
Description: ${suggestion.description}
Implementation Instructions: ${suggestion.implementation || "Apply the fix described above."}

RULES:
- Return ONLY the complete updated file content.
- Start with: // File: ${suggestion.filePath}
- PRESERVE existing structure. Only change what's needed.
- No explanation outside the code.`;
  try {
    const messages = [
      { role: "system", content: "You are an expert programmer. Return ONLY the complete updated file. Preserve existing structure." },
      { role: "user", content: prompt }
    ];
    const response = await callLocalModel(endpoint, messages);
    const lines = response.split("\n");
    const firstLine = lines[0].trim();
    let newContent;
    if (firstLine.match(/^\/\/\s*(File:)?\s*/)) {
      newContent = lines.slice(1).join("\n").trim();
    } else {
      newContent = response.trim();
    }
    const absolutePath = path.join(process.cwd(), suggestion.filePath);
    const backupDir = path.join(process.cwd(), ".bob-backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    if (fs.existsSync(absolutePath)) {
      const timestamp = Date.now();
      const backupName = suggestion.filePath.replace(/[\/\\]/g, "_") + `.${timestamp}.bak`;
      fs.copyFileSync(absolutePath, path.join(backupDir, backupName));
    }
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(absolutePath, newContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}
var lastTodoLines = 0;
function renderTodoList(queue) {
  const lines = [];
  lines.push("");
  lines.push(AMBER("  \u{1F4CB} MiniBob Work Queue"));
  lines.push(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  for (let i = 0; i < queue.length; i++) {
    const task = queue[i];
    const label = task.suggestion.title || task.suggestion.description?.slice(0, 40) || "No title";
    let icon;
    let color;
    switch (task.status) {
      case "done":
        icon = "\u2611";
        color = GREEN;
        break;
      case "working":
        icon = "\u23F3";
        color = AMBER;
        break;
      case "failed":
        icon = "\u2717";
        color = RED;
        break;
      case "skipped":
        icon = "\u23F8\uFE0F";
        color = GRAY;
        break;
      default:
        icon = "\u2610";
        color = GRAY;
    }
    lines.push(color(`  ${icon} [${i + 1}/${queue.length}] ${task.suggestion.filePath}`));
    lines.push(color(`    ${label} (${task.confidence}%)`));
  }
  const completed = queue.filter((t) => t.status === "done" || t.status === "failed" || t.status === "skipped").length;
  const total = queue.length;
  const percent = total > 0 ? completed / total : 0;
  const barLen = 30;
  const filled = Math.round(percent * barLen);
  let barColor;
  if (percent < 0.25) barColor = chalk.red;
  else if (percent < 0.5) barColor = chalk.hex("#FF8C00");
  else if (percent < 0.75) barColor = chalk.yellow;
  else barColor = chalk.green;
  lines.push("");
  lines.push(`  [${barColor("\u2588".repeat(filled))}${GRAY("\u2591".repeat(barLen - filled))}] ${completed}/${total}  ${barColor(Math.round(percent * 100) + "%")}`);
  lines.push("");
  if (lastTodoLines > 0) {
    process.stdout.write(`\x1B[${lastTodoLines}A`);
    for (let i = 0; i < lastTodoLines; i++) {
      process.stdout.write("\x1B[2K\n");
    }
    process.stdout.write(`\x1B[${lastTodoLines}A`);
  }
  for (const line of lines) {
    process.stdout.write(line + "\n");
  }
  lastTodoLines = lines.length;
}
export {
  runAutoFix
};
