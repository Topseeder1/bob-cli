import {
  callCloudFunction,
  callLocalModel,
  ensureProjectStructure,
  proposeAndWriteFile,
  readFileContent
} from "./chunk-6W7WDF4Q.js";

// src/commands/analyse-results.ts
import chalk from "chalk";
import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
var RED = chalk.hex("#EF5350");
var PURPLE = chalk.hex("#AB47BC");
var BLUE = chalk.hex("#42A5F5");
var TEAL = chalk.hex("#26A69A");
var AMBER = chalk.hex("#FFAB00");
var GRAY = chalk.gray;
var BORDER = chalk.hex("#455A64");
var PRIORITY_COLORS = {
  "critical": chalk.bgHex("#B71C1C").white,
  "high": chalk.hex("#FF6D00"),
  "medium": chalk.hex("#FFA726"),
  "low": chalk.hex("#66BB6A")
};
var CATEGORY_COLORS = {
  "bugs": RED,
  "features": PURPLE,
  "improvements": BLUE,
  "upgrades": TEAL
};
async function showInteractiveResults(config, category, sort, search) {
  let allSuggestions = [];
  if (config.tier === "platform" && config.provider !== "local" && config.loggedIn && config.conversationId) {
    try {
      const result = await callCloudFunction("getCLIAnalysisResults", {
        conversationId: config.conversationId,
        category,
        sort: sort || "priority",
        search: search || null
      });
      allSuggestions = result?.suggestions || [];
    } catch (error) {
      console.log(chalk.red(`  \u274C ${error.message}`));
      return;
    }
  } else {
    allSuggestions = loadLocalSuggestions(category);
  }
  if (search) {
    const query = search.toLowerCase();
    allSuggestions = allSuggestions.filter(
      (s) => (s.description || "").toLowerCase().includes(query) || (s.title || "").toLowerCase().includes(query) || (s.filePath || "").toLowerCase().includes(query)
    );
  }
  sortSuggestions(allSuggestions, sort || "priority");
  if (allSuggestions.length === 0) {
    console.log("");
    console.log(chalk.green("  \u2705 No items found. Clean!"));
    console.log("");
    return;
  }
  const color = CATEGORY_COLORS[category] || GRAY;
  let running = true;
  let displaySuggestions = [...allSuggestions];
  let currentSort = sort || "priority";
  while (running) {
    console.log("");
    console.log(color(`  \u25C6 ${category.toUpperCase()} (${displaySuggestions.length} items) | Sort: ${currentSort}`));
    console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    const choices = displaySuggestions.map((item, idx) => {
      const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || GRAY;
      const priorityLabel = (item.priority || "MEDIUM").toUpperCase().padEnd(9);
      const filePath = (item.filePath || "unknown").split("/").pop() || "unknown";
      const desc = (item.description || item.title || "No description").slice(0, 42);
      const displayName = `${pColor(priorityLabel)} ${chalk.cyan(filePath.padEnd(18))} ${chalk.white(desc)}`;
      return {
        name: displayName,
        value: idx,
        short: item.title || item.description?.slice(0, 30) || "Item",
        // Used for search matching
        description: `${item.priority} ${item.filePath} ${item.title} ${item.description}`
      };
    });
    const { selected } = await inquirer.prompt([
      {
        type: "search",
        name: "selected",
        message: color(`Search ${category} (type to filter, arrows to navigate):`),
        source: (input) => {
          if (!input) return [...choices, { name: chalk.cyan("  \u{1F500} Toggle sort"), value: "__sort__", short: "Sort" }, { name: chalk.gray("  \u2190 Quit"), value: "__quit__", short: "Quit" }];
          const query = input.toLowerCase();
          const filtered = choices.filter((c) => {
            const searchable = c.description?.toLowerCase() || "";
            return searchable.includes(query);
          });
          return [...filtered, { name: chalk.gray("  \u2190 Quit"), value: "__quit__", short: "Quit" }];
        },
        pageSize: 12
      }
    ]);
    if (selected === "__quit__") {
      running = false;
      break;
    }
    if (selected === "__sort__") {
      currentSort = currentSort === "priority" ? "file" : "priority";
      sortSuggestions(displaySuggestions, currentSort);
      console.log(chalk.cyan(`  Sort changed to: ${currentSort}`));
      continue;
    }
    if (typeof selected === "number") {
      const item = displaySuggestions[selected];
      const action = await showExpandedView(item, category);
      if (action === "implement") {
        await handleImplement(item, config);
      } else if (action === "dismiss") {
        displaySuggestions.splice(selected, 1);
        const originalIdx = allSuggestions.findIndex((s) => s.id === item.id);
        if (originalIdx !== -1) allSuggestions.splice(originalIdx, 1);
        console.log(chalk.gray("  \u23ED\uFE0F  Dismissed."));
      }
    }
  }
}
async function showExpandedView(item, category) {
  const color = CATEGORY_COLORS[category] || GRAY;
  const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || GRAY;
  console.log("");
  console.log(color("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(color("  \u2551 ") + pColor(`${(item.priority || "MEDIUM").toUpperCase()} ${category.toUpperCase().slice(0, -1)}`));
  console.log(color("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(color("  \u2551") + chalk.gray("  File: ") + chalk.cyan(item.filePath || "unknown"));
  console.log(color("  \u2551") + chalk.gray("  Priority: ") + pColor((item.priority || "medium").toUpperCase()));
  console.log(color("  \u2551"));
  console.log(color("  \u2551") + chalk.gray("  Title:"));
  console.log(color("  \u2551") + chalk.white.bold(`  ${item.title || "No title"}`));
  console.log(color("  \u2551"));
  console.log(color("  \u2551") + chalk.gray("  Description:"));
  const descLines = wrapText(item.description || "No description", 54);
  for (const line of descLines) {
    console.log(color("  \u2551") + chalk.white(`  ${line}`));
  }
  if (item.implementation) {
    console.log(color("  \u2551"));
    console.log(color("  \u2551") + chalk.gray("  Implementation:"));
    const implLines = wrapText(item.implementation, 54);
    for (const line of implLines) {
      console.log(color("  \u2551") + chalk.white(`  ${line}`));
    }
  }
  console.log(color("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  const { action } = await inquirer.prompt([
    {
      type: "select",
      name: "action",
      message: "What do you want to do?",
      choices: [
        { name: chalk.green("  \u{1F527} Implement this fix"), value: "implement" },
        { name: chalk.red("  \u{1F5D1}\uFE0F  Dismiss"), value: "dismiss" },
        { name: chalk.gray("  \u2190 Back to list"), value: "back" }
      ]
    }
  ]);
  return action;
}
async function handleImplement(item, config) {
  console.log("");
  console.log(chalk.cyan("  \u{1F527} Implementing fix..."));
  console.log("");
  if (config.provider === "local" && config.localEndpoint) {
    const fileContent = readFileContent(item.filePath);
    if (!fileContent) {
      console.log(chalk.red(`  \u274C Could not read file: ${item.filePath}`));
      return;
    }
    const prompt = `You are an expert programmer implementing a specific code change.

CURRENT FILE: ${item.filePath}
${fileContent}

CHANGE TO IMPLEMENT:
Title: ${item.title}
Description: ${item.description}
Implementation Instructions: ${item.implementation || "Apply the fix described above."}

RULES:
- Return ONLY the complete updated file content with the change applied.
- Start the code with: // File: ${item.filePath}
- PRESERVE all existing code structure. Only change what's needed.
- Do NOT include any explanation outside the code.`;
    try {
      const messages = [
        { role: "system", content: "You are an expert programmer. Return ONLY the complete updated file. Start with // File: path comment. Preserve existing structure." },
        { role: "user", content: prompt }
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
      await proposeAndWriteFile({
        filePath: item.filePath,
        content: newContent,
        isNew: false
      });
    } catch (error) {
      console.log(chalk.red(`  \u274C Implementation failed: ${error.message}`));
    }
  } else if (config.loggedIn && config.conversationId) {
    try {
      const result = await callCloudFunction("implementSuggestion", {
        conversationId: config.conversationId,
        filePath: item.filePath,
        suggestionId: item.id || "unknown",
        category: "bugs",
        jobId: `cli_impl_${Date.now()}`
      });
      if (result?.success) {
        console.log(chalk.green(`  \u2705 ${result.message}`));
      } else {
        console.log(chalk.red("  \u274C Implementation failed on platform."));
      }
    } catch (error) {
      console.log(chalk.red(`  \u274C ${error.message}`));
    }
  } else {
    console.log(chalk.red("  \u274C No provider configured for implementation."));
  }
  console.log("");
}
function sortSuggestions(suggestions, method) {
  if (method === "file") {
    suggestions.sort((a, b) => (a.filePath || "").localeCompare(b.filePath || ""));
  } else {
    const priorityMap = { "critical": 0, "high": 1, "medium": 2, "low": 3 };
    suggestions.sort((a, b) => {
      const pA = priorityMap[a.priority?.toLowerCase()] ?? 99;
      const pB = priorityMap[b.priority?.toLowerCase()] ?? 99;
      return pA - pB;
    });
  }
}
function loadLocalSuggestions(category) {
  const cwd = process.cwd();
  const { analysisDir } = ensureProjectStructure(cwd);
  const analysisPath = path.join(analysisDir, "results", "analysis.json");
  if (!fs.existsSync(analysisPath)) return [];
  const allResults = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
  const suggestions = [];
  for (const [filePath, fileResults] of Object.entries(allResults)) {
    const items = fileResults[category] || [];
    suggestions.push(...items.map((item, idx) => ({
      ...item,
      filePath,
      id: `${filePath.replace(/[\/\\]/g, "_")}_${idx}`
    })));
  }
  return suggestions;
}
function wrapText(text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";
  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export {
  showInteractiveResults,
  loadLocalSuggestions
};
