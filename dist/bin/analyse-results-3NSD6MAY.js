import {
  callCloudFunction,
  callLocalModel,
  ensureProjectStructure,
  proposeAndWriteFile,
  readFileContent
} from "./chunk-6W7WDF4Q.js";

// src/commands/analyse-results.ts
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
var RED = chalk.hex("#EF5350");
var PURPLE = chalk.hex("#AB47BC");
var BLUE = chalk.hex("#42A5F5");
var TEAL = chalk.hex("#26A69A");
var AMBER = chalk.hex("#FFAB00");
var GRAY = chalk.gray;
var BORDER = chalk.hex("#455A64");
var HIGHLIGHT = chalk.hex("#FFAB00");
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
var PAGE_SIZE = 5;
async function showInteractiveResults(config, category2, sort, search) {
  let suggestions = [];
  if (config.tier === "platform" && config.provider !== "local" && config.loggedIn && config.conversationId) {
    try {
      const result = await callCloudFunction("getCLIAnalysisResults", {
        conversationId: config.conversationId,
        category: category2,
        sort: sort || "priority",
        search: search || null
      });
      suggestions = result?.suggestions || [];
    } catch (error) {
      console.log(chalk.red(`  \u274C ${error.message}`));
      return;
    }
  } else {
    suggestions = loadLocalSuggestions(category2);
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
  await interactiveSelector(suggestions, category2, config);
}
async function interactiveSelector(suggestions, category2, config) {
  let selectedIndex = 0;
  let page = 0;
  const totalPages = Math.ceil(suggestions.length / PAGE_SIZE);
  const color = CATEGORY_COLORS[category2] || GRAY;
  const getRenderedLines = () => {
    const lines = [];
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, suggestions.length);
    const pageItems = suggestions.slice(start, end);
    lines.push("");
    lines.push(color(`  \u25C6 ${category2.toUpperCase()} (${suggestions.length} items) \u2014 Page ${page + 1}/${totalPages}`));
    lines.push(GRAY("  \u2191\u2193 Navigate | Enter: Expand | n: Next | p: Prev | q: Quit"));
    lines.push(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    lines.push("");
    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      const globalIndex = start + i;
      const isSelected = globalIndex === selectedIndex;
      const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || GRAY;
      const priorityLabel = (item.priority || "MEDIUM").toUpperCase().padEnd(10);
      const filePath = (item.filePath || "unknown").slice(-24);
      const description = (item.description || item.title || "No description").slice(0, 50);
      if (isSelected) {
        lines.push(HIGHLIGHT("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
        lines.push(HIGHLIGHT("  \u2551 ") + pColor(priorityLabel) + "  " + chalk.cyan(filePath) + HIGHLIGHT(""));
        lines.push(HIGHLIGHT("  \u2551 ") + chalk.white.bold(description));
        lines.push(HIGHLIGHT("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
      } else {
        lines.push(BORDER("  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510"));
        lines.push(BORDER("  \u2502 ") + pColor(priorityLabel) + "  " + chalk.cyan(filePath));
        lines.push(BORDER("  \u2502 ") + chalk.white(description));
        lines.push(BORDER("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518"));
      }
      lines.push("");
    }
    return lines;
  };
  let lastLineCount = 0;
  const render = () => {
    const lines = getRenderedLines();
    if (lastLineCount > 0) {
      process.stdout.write(`\x1B[${lastLineCount}A`);
      for (let i = 0; i < lastLineCount; i++) {
        process.stdout.write("\x1B[2K\n");
      }
      process.stdout.write(`\x1B[${lastLineCount}A`);
    }
    for (const line of lines) {
      process.stdout.write(line + "\n");
    }
    lastLineCount = lines.length;
  };
  const initialLines = getRenderedLines();
  for (let i = 0; i < initialLines.length; i++) {
    console.log("");
  }
  lastLineCount = initialLines.length;
  render();
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      console.log(GRAY("  (Interactive mode requires a TTY terminal)"));
      resolve();
      return;
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners("data");
    };
    const onKey = async (key) => {
      const pageStart = page * PAGE_SIZE;
      const pageEnd = Math.min(pageStart + PAGE_SIZE, suggestions.length) - 1;
      if (key === "" || key === "q") {
        cleanup();
        console.log("");
        resolve();
        return;
      }
      if (key === "\x1B[A") {
        if (selectedIndex > pageStart) {
          selectedIndex--;
          render();
        }
        return;
      }
      if (key === "\x1B[B") {
        if (selectedIndex < pageEnd) {
          selectedIndex++;
          render();
        }
        return;
      }
      if (key === "n") {
        if (page < totalPages - 1) {
          page++;
          selectedIndex = page * PAGE_SIZE;
          render();
        }
        return;
      }
      if (key === "p") {
        if (page > 0) {
          page--;
          selectedIndex = page * PAGE_SIZE;
          render();
        }
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup();
        const selected = suggestions[selectedIndex];
        await showExpandedView(selected, category2, config);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", onKey);
        lastLineCount = 0;
        const lines = getRenderedLines();
        for (let i = 0; i < lines.length; i++) {
          console.log("");
        }
        lastLineCount = lines.length;
        render();
        return;
      }
    };
    process.stdin.on("data", onKey);
  });
}
async function showExpandedView(item, category2, config) {
  const color = CATEGORY_COLORS[category2] || GRAY;
  const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || GRAY;
  process.stdout.write("\x1B[H\x1B[2J");
  console.log("");
  console.log(color("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(color("  \u2551 ") + pColor(`${(item.priority || "MEDIUM").toUpperCase()} ${category2.toUpperCase().slice(0, -1)}`) + color(""));
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
  console.log(color("  \u2551"));
  console.log(color("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(color("  \u2551") + chalk.white("  [i] Implement  [d] Dismiss  [esc/q] Back"));
  console.log(color("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const handler = async (key) => {
      process.stdin.removeListener("data", handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      if (key === "i") {
        await handleImplement(item, config);
      } else if (key === "d") {
        console.log(chalk.gray("  \u23ED\uFE0F  Dismissed."));
        console.log("");
      }
      process.stdout.write("\x1B[H\x1B[2J");
      resolve();
    };
    process.stdin.on("data", handler);
  });
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
        category,
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
  await new Promise((resolve) => setTimeout(resolve, 2e3));
}
function loadLocalSuggestions(category2) {
  const cwd = process.cwd();
  const { analysisDir } = ensureProjectStructure(cwd);
  const analysisPath = path.join(analysisDir, "results", "analysis.json");
  if (!fs.existsSync(analysisPath)) return [];
  const allResults = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
  const suggestions = [];
  for (const [filePath, fileResults] of Object.entries(allResults)) {
    const items = fileResults[category2] || [];
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
