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
  await interactiveSelector(suggestions, category, config);
}
async function interactiveSelector(suggestions, category, config) {
  let selectedIndex = 0;
  let page = 0;
  const totalPages = Math.ceil(suggestions.length / PAGE_SIZE);
  const color = CATEGORY_COLORS[category] || GRAY;
  let lastRenderLines = 0;
  const render = () => {
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, suggestions.length);
    const pageItems = suggestions.slice(start, end);
    let out = "\n";
    out += color(`  \u25C6 ${category.toUpperCase()} (${suggestions.length} items) \u2014 Page ${page + 1}/${totalPages}
`);
    out += GRAY("  \u2191\u2193 Navigate | Enter: Expand | n: Next page | p: Prev | q: Quit\n");
    out += GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n");
    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      const globalIndex = start + i;
      const isSelected = globalIndex === selectedIndex;
      const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || GRAY;
      const priorityLabel = (item.priority || "MEDIUM").toUpperCase().padEnd(8);
      const filePath = (item.filePath || "unknown").slice(-28).padStart(28);
      const description = (item.description || item.title || "No description").slice(0, 52).padEnd(52);
      if (isSelected) {
        out += HIGHLIGHT("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n");
        out += HIGHLIGHT("  \u2551 ") + pColor(priorityLabel) + " ".repeat(22) + chalk.cyan(filePath) + HIGHLIGHT(" \u2551\n");
        out += HIGHLIGHT("  \u2551 ") + chalk.white(description) + HIGHLIGHT("      \u2551\n");
        out += HIGHLIGHT("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n");
      } else {
        out += BORDER("  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n");
        out += BORDER("  \u2502 ") + pColor(priorityLabel) + " ".repeat(22) + chalk.cyan(filePath) + BORDER(" \u2502\n");
        out += BORDER("  \u2502 ") + chalk.white(description) + BORDER("      \u2502\n");
        out += BORDER("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n");
      }
      out += "\n";
    }
    if (lastRenderLines > 0) {
      process.stdout.write(`\x1B[${lastRenderLines}A\x1B[G\x1B[J`);
    }
    process.stdout.write(out);
    lastRenderLines = out.split("\n").length - 1;
  };
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
        if (selectedIndex > pageStart) selectedIndex--;
        render();
        return;
      }
      if (key === "\x1B[B") {
        if (selectedIndex < pageEnd) selectedIndex++;
        render();
        return;
      }
      if (key === "n" && page < totalPages - 1) {
        page++;
        selectedIndex = page * PAGE_SIZE;
        render();
        return;
      }
      if (key === "p" && page > 0) {
        page--;
        selectedIndex = page * PAGE_SIZE;
        render();
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup();
        if (lastRenderLines > 0) {
          process.stdout.write(`\x1B[${lastRenderLines}A\x1B[G\x1B[J`);
          lastRenderLines = 0;
        }
        const selected = suggestions[selectedIndex];
        await showExpandedView(selected, category, config);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", onKey);
        render();
        return;
      }
    };
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onKey);
    };
    process.stdin.on("data", onKey);
  });
}
async function showExpandedView(item, category, config) {
  const color = CATEGORY_COLORS[category] || GRAY;
  const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || GRAY;
  let out = "\n";
  out += color("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n");
  const headerText = `${(item.priority || "MEDIUM").toUpperCase()} ${category.toUpperCase().slice(0, -1)}`;
  const headerPad = " ".repeat(58 - headerText.length);
  out += color("  \u2551 ") + pColor(headerText) + color(headerPad + " \u2551\n");
  out += color("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563\n");
  const printRow = (label, value, valueColor) => {
    const rawVisibleString = `  ${label}${value}`;
    const padding = " ".repeat(Math.max(0, 58 - rawVisibleString.length));
    out += color("  \u2551") + chalk.gray(`  ${label}`) + valueColor(value) + color(padding + "\u2551\n");
  };
  printRow("File: ", item.filePath || "unknown", chalk.cyan);
  printRow("Priority: ", (item.priority || "medium").toUpperCase(), pColor);
  printRow("", "", chalk.white);
  printRow("Title:", "", chalk.white);
  printRow("", item.title || "No title", chalk.white);
  printRow("", "", chalk.white);
  printRow("Description:", "", chalk.white);
  const descLines = wrapText(item.description || "No description", 54);
  for (const line of descLines) {
    printRow("", line, chalk.white);
  }
  if (item.implementation) {
    printRow("", "", chalk.white);
    printRow("Implementation:", "", chalk.white);
    const implLines = wrapText(item.implementation, 54);
    for (const line of implLines) {
      printRow("", line, chalk.white);
    }
  }
  printRow("", "", chalk.white);
  out += color("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563\n");
  const footerText = "  [i] Implement  [d] Dismiss  [esc] Back";
  const footerPad = " ".repeat(58 - footerText.length);
  out += color("  \u2551") + chalk.white(footerText) + color(footerPad + "\u2551\n");
  out += color("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n");
  process.stdout.write(out);
  const linesPrinted = out.split("\n").length - 1;
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const handler = async (key) => {
      process.stdin.removeListener("data", handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(`\x1B[${linesPrinted}A\x1B[G\x1B[J`);
      if (key === "i") {
        await handleImplement(item, config);
      } else if (key === "d") {
        console.log(chalk.gray("  \u23ED\uFE0F  Dismissed.\n"));
      }
      resolve();
    };
    process.stdin.on("data", handler);
  });
}
async function handleImplement(item, config) {
  console.log("");
  console.log(chalk.cyan("  \u{1F527} Implementing fix..."));
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

Return ONLY the complete updated file content with the change applied.
Start with: // File: ${item.filePath}
Do not include explanations outside the code.`;
    try {
      const messages = [
        { role: "system", content: "You are an expert programmer. Return ONLY the complete updated file. Start with // File: path comment." },
        { role: "user", content: prompt }
      ];
      const response = await callLocalModel(config.localEndpoint, messages);
      const lines = response.split("\n");
      const filePathLine = lines[0];
      let newContent;
      if (filePathLine.match(/^\/\/\s*(File:)?\s*/)) {
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
        // TODO: pass actual category
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
    suggestions.push(...items.map((item) => ({ ...item, filePath })));
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
