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
  let suggestions = [];
  if (config.tier === "platform" && config.provider !== "local" && config.loggedIn && config.conversationId) {
    try {
      const result = await callCloudFunction("getCLIAnalysisResults", {
        conversationId: config.conversationId,
        category,
        sort: sort || "priority",
        search: search || null
      });
      suggestions = result?.suggestions || [];
    } catch (error) {
      console.log(chalk.red(`  \u274C ${error.message}`));
      return;
    }
  } else {
    suggestions = loadLocalSuggestions(category);
  }
  if (search) {
    const query = search.toLowerCase();
    suggestions = suggestions.filter(
      (s) => (s.description || "").toLowerCase().includes(query) || (s.title || "").toLowerCase().includes(query) || (s.filePath || "").toLowerCase().includes(query)
    );
  }
  if (sort === "file") {
    suggestions.sort((a, b) => (a.filePath || "").localeCompare(b.filePath || ""));
  } else {
    const priorityMap = { "critical": 0, "high": 1, "medium": 2, "low": 3 };
    suggestions.sort((a, b) => {
      const pA = priorityMap[a.priority?.toLowerCase()] ?? 99;
      const pB = priorityMap[b.priority?.toLowerCase()] ?? 99;
      return pA - pB;
    });
  }
  if (suggestions.length === 0) {
    console.log("");
    console.log(chalk.green("  \u2705 No items found. Clean!"));
    console.log("");
    return;
  }
  const color = CATEGORY_COLORS[category] || GRAY;
  let running = true;
  while (running) {
    console.log("");
    console.log(color(`  \u25C6 ${category.toUpperCase()} (${suggestions.length} items)`));
    console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    const choices = suggestions.map((item2, idx) => {
      const pColor = PRIORITY_COLORS[item2.priority?.toLowerCase()] || GRAY;
      const priorityLabel = (item2.priority || "MEDIUM").toUpperCase().padEnd(9);
      const filePath = (item2.filePath || "unknown").split("/").pop() || "unknown";
      const desc = (item2.description || item2.title || "No description").slice(0, 45);
      return {
        name: `${pColor(priorityLabel)} ${chalk.cyan(filePath.padEnd(20))} ${chalk.white(desc)}`,
        value: idx,
        short: item2.title || item2.description?.slice(0, 30) || "Item"
      };
    });
    choices.push({
      name: chalk.gray("  \u2190 Back (quit)"),
      value: -1,
      short: "Quit"
    });
    const { selected } = await inquirer.prompt([
      {
        type: "list",
        name: "selected",
        message: color("Select a suggestion:"),
        choices,
        pageSize: 10,
        loop: false
      }
    ]);
    if (selected === -1) {
      running = false;
      break;
    }
    const item = suggestions[selected];
    const action = await showExpandedView(item, category);
    if (action === "implement") {
      await handleImplement(item, config);
    } else if (action === "dismiss") {
      suggestions.splice(selected, 1);
      console.log(chalk.gray("  \u23ED\uFE0F  Dismissed."));
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
      type: "list",
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
  showInteractiveResults
};
