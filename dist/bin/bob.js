#!/usr/bin/env node
import {
  buildLocalContext,
  callCloudFunction,
  callLocalModel,
  extractProposedFile,
  getConfig,
  getConfigPath,
  loadLocalSuggestions,
  markSuggestionStatus,
  proposeAndWriteFile,
  readFileContent,
  registerLoginCommand,
  setConfigValue,
  stripCodeBlockFromResponse
} from "./chunk-LHWBSCJ4.js";

// bin/bob.ts
import { Command } from "commander";
import chalk17 from "chalk";
import * as path9 from "path";

// src/commands/config.ts
import chalk from "chalk";
var VALID_KEYS = [
  "provider",
  "providerKey",
  "localEndpoint",
  "tier",
  "idrp",
  "idrpFilter",
  "activeProject",
  "activePersona",
  "hasSeenWelcome",
  "autoMode"
];
var VALID_PROVIDERS = ["claude", "gemini", "openai", "grok", "local"];
function registerConfigCommand(program2) {
  const configCmd = program2.command("config").description("View or update Bob CLI configuration");
  configCmd.command("show").description("Display current configuration").action(() => {
    const config = getConfig();
    console.log("");
    console.log(chalk.bold("  \u2699\uFE0F  Bob CLI Configuration"));
    console.log(chalk.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log(`  ${chalk.cyan("Tier:")}           ${config.tier}`);
    console.log(`  ${chalk.cyan("Logged In:")}      ${config.loggedIn}`);
    console.log(`  ${chalk.cyan("Email:")}          ${config.email || "None"}`);
    console.log(`  ${chalk.cyan("Provider:")}       ${config.provider || "Not set"}`);
    console.log(`  ${chalk.cyan("Provider Key:")}   ${config.providerKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Not set"}`);
    console.log(`  ${chalk.cyan("Local Endpoint:")} ${config.localEndpoint || "Not set"}`);
    console.log(`  ${chalk.cyan("IDRP:")}           ${config.idrp ? "Enabled" : "Disabled"}`);
    console.log(`  ${chalk.cyan("IDRP Filter:")}    ${config.idrpFilter}`);
    console.log(`  ${chalk.cyan("Auto Mode:")}      ${config.autoMode ? "Enabled" : "Disabled"}`);
    console.log(`  ${chalk.cyan("Active Project:")} ${config.activeProject || "None"}`);
    console.log(`  ${chalk.cyan("Active Persona:")} ${config.activePersona || "None"}`);
    console.log(`  ${chalk.cyan("Has Seen Welcome:")} ${config.hasSeenWelcome}`);
    console.log("");
    console.log(chalk.gray(`  Config file: ${getConfigPath()}`));
    console.log("");
  });
  configCmd.command("set <key> <value>").description("Set a configuration value").action((key, value) => {
    if (!VALID_KEYS.includes(key)) {
      console.log("");
      console.log(chalk.red(`  \u274C Invalid key: "${key}"`));
      console.log(chalk.gray(`  Valid keys: ${VALID_KEYS.join(", ")}`));
      console.log("");
      return;
    }
    if (key === "provider" && !VALID_PROVIDERS.includes(value)) {
      console.log("");
      console.log(chalk.red(`  \u274C Invalid provider: "${value}"`));
      console.log(chalk.gray(`  Valid providers: ${VALID_PROVIDERS.join(", ")}`));
      console.log("");
      return;
    }
    let finalValue = value;
    if (key === "idrp") {
      finalValue = value === "true" || value === "enabled" || value === "on";
    }
    if (key === "hasSeenWelcome") {
      finalValue = value === "true";
    }
    if (key === "autoMode") {
      finalValue = value === "true" || value === "enabled" || value === "on";
    }
    if (key === "tier") {
      if (value !== "local" && value !== "platform") {
        console.log("");
        console.log(chalk.red(`  \u274C Invalid tier: "${value}"`));
        console.log(chalk.gray(`  Valid tiers: local, platform`));
        console.log("");
        return;
      }
    }
    setConfigValue(key, finalValue);
    console.log("");
    console.log(chalk.green(`  \u2705 ${key} \u2192 ${key === "providerKey" ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : finalValue}`));
    console.log("");
  });
  configCmd.command("path").description("Show the config file location").action(() => {
    console.log("");
    console.log(chalk.cyan(`  \u{1F4C1} ${getConfigPath()}`));
    console.log("");
  });
}

// src/commands/chat.ts
import chalk7 from "chalk";
import ora2 from "ora";
import * as fs4 from "fs";
import * as path5 from "path";
import * as readline from "readline";

// src/ai/persona.ts
var STANDARD_STYLE_PROMPT = `You are Bob: friendly, direct, senior-level engineering partner.
CONVERSATIONAL + BREVITY RULES (strict):
- Warm + concise.
- If code is appropriate, lead with code.
- Preface: at most 20 short sentence(s) (<= 500 words).
- After code: up to 5 bullets (<= 100 words).
- One fenced block only.
- Expand only if asked to "explain" or "why" next turn.

FILE OUTPUT RULES (strict):
- When you generate or modify a file, ALWAYS start the code block with a comment on the first line indicating the FULL file path from the project root.
- Format: // File: <relative-path-from-project-root>
- Examples: // File: src/core/auth.ts   or   // File: lib/services/api_service.dart
- This applies to NEW files and EDITED files.
- If you are showing a code snippet that is NOT a full file, do NOT include the file path comment.
- When editing an existing file, output the COMPLETE updated file contents, not just the changed section.
- When editing an existing file, PRESERVE the existing code structure, imports, naming conventions, and patterns.
- Do NOT rewrite the file from scratch unless the user explicitly asks for a full rewrite.
- ADD your changes surgically into the existing code \u2014 keep everything else intact.
- If you believe a structural change would be significantly better, ASK the user first before implementing it. Do not assume permission to refactor.`;
var CONSULTANT_STYLE_PROMPT = `You are Bob in "Consultant Mode": a friendly, direct, senior-level engineering partner.
CONSULTANT MODE RULES (VERY STRICT):
- Your ONLY goal is to provide strategic advice, conceptual guidance, and high-level architectural ideas.
- DO NOT, under any circumstances, generate code.
- Focus entirely on the conceptual and strategic aspects of the user's query.
- Be warm, concise, and direct in your advice.`;

// src/ui/renderer.ts
import chalk2 from "chalk";
function renderMarkdown(text) {
  return text.replace(/^#{1,6}\s+(.+)$/gm, chalk2.bold.cyan("$1")).replace(/\*\*(.+?)\*\*/g, chalk2.bold("$1")).replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, chalk2.italic("$1")).replace(/^\s*[\*\-]\s+/gm, "  \u2022 ").replace(/^\s*(\d+)\.\s+/gm, "  $1. ").replace(/^[\-\*]{3,}$/gm, chalk2.gray("\u2500".repeat(60))).replace(/`([^`]+)`/g, chalk2.yellow("$1")).replace(/```[\w]*\n?/g, "").replace(/\n{3,}/g, "\n\n");
}

// src/core/conversation-store.ts
import * as fs2 from "fs";
import * as path2 from "path";

// src/core/project-map.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
var BOB_DIR = path.join(os.homedir(), ".bob");
var PROJECTS_DIR = path.join(BOB_DIR, "projects");
function getProjectName(workingDir) {
  return path.basename(workingDir);
}
function getProjectDir(workingDir) {
  const name = getProjectName(workingDir);
  return path.join(PROJECTS_DIR, name);
}
function ensureProjectStructure(workingDir) {
  const projectDir = getProjectDir(workingDir);
  const conversationsDir = path.join(projectDir, "conversations");
  const analysisDir = path.join(projectDir, "analysis");
  const runsDir = path.join(analysisDir, "runs");
  for (const dir of [BOB_DIR, PROJECTS_DIR, projectDir, conversationsDir, analysisDir, runsDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const metaPath = path.join(projectDir, "project.json");
  if (!fs.existsSync(metaPath)) {
    const meta = {
      name: getProjectName(workingDir),
      path: workingDir,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastIndexed: null
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
  return { projectDir, conversationsDir, analysisDir, runsDir };
}
function createAnalysisRun(workingDir, files) {
  const { runsDir } = ensureProjectStructure(workingDir);
  const runId = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(runsDir, runId);
  const tasksDir = path.join(runDir, "tasks");
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(tasksDir, { recursive: true });
  const manifest = {
    runId,
    status: "in_progress",
    totalFiles: files.length,
    completedFiles: 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    projectPath: workingDir
  };
  fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  for (const filePath of files) {
    const taskId = filePath.replace(/[\/\\]/g, "_");
    const task = {
      filePath,
      status: false,
      summary: null,
      dependencies: [],
      error: null
    };
    fs.writeFileSync(path.join(tasksDir, `${taskId}.json`), JSON.stringify(task, null, 2));
  }
  return { runId, runDir, tasksDir };
}
function completeTask(tasksDir, filePath, summary) {
  const taskId = filePath.replace(/[\/\\]/g, "_");
  const taskPath = path.join(tasksDir, `${taskId}.json`);
  if (fs.existsSync(taskPath)) {
    const task = JSON.parse(fs.readFileSync(taskPath, "utf-8"));
    task.status = true;
    task.summary = summary;
    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
  }
}
function updateManifestProgress(runDir, completedFiles, status) {
  const manifestPath = path.join(runDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifest.completedFiles = completedFiles;
    if (status) manifest.status = status;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}
function saveSummaries(workingDir, summaries) {
  const { analysisDir } = ensureProjectStructure(workingDir);
  fs.writeFileSync(path.join(analysisDir, "summaries.json"), JSON.stringify(summaries, null, 2));
  const projectDir = getProjectDir(workingDir);
  const metaPath = path.join(projectDir, "project.json");
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    meta.lastIndexed = (/* @__PURE__ */ new Date()).toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
}
function saveDependencies(workingDir, dependencies) {
  const { analysisDir } = ensureProjectStructure(workingDir);
  fs.writeFileSync(path.join(analysisDir, "dependencies.json"), JSON.stringify(dependencies, null, 2));
}
function loadSummaries(workingDir) {
  const { analysisDir } = ensureProjectStructure(workingDir);
  const summariesPath = path.join(analysisDir, "summaries.json");
  if (!fs.existsSync(summariesPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(summariesPath, "utf-8"));
  } catch {
    return null;
  }
}
function loadDependencies(workingDir) {
  const { analysisDir } = ensureProjectStructure(workingDir);
  const depsPath = path.join(analysisDir, "dependencies.json");
  if (!fs.existsSync(depsPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(depsPath, "utf-8"));
  } catch {
    return null;
  }
}

// src/core/conversation-store.ts
function saveMessage(conversationId, message, meta) {
  const { conversationsDir } = ensureProjectStructure(process.cwd());
  const convoDir = path2.join(conversationsDir, conversationId);
  const messagesDir = path2.join(convoDir, "messages");
  if (!fs2.existsSync(convoDir)) fs2.mkdirSync(convoDir, { recursive: true });
  if (!fs2.existsSync(messagesDir)) fs2.mkdirSync(messagesDir, { recursive: true });
  const messageFilename = `${Date.now()}_${message.sender}.json`;
  fs2.writeFileSync(
    path2.join(messagesDir, messageFilename),
    JSON.stringify(message, null, 2)
  );
  const metaPath = path2.join(convoDir, "conversation.json");
  let convoMeta;
  if (fs2.existsSync(metaPath)) {
    try {
      convoMeta = JSON.parse(fs2.readFileSync(metaPath, "utf-8"));
    } catch {
      convoMeta = createMeta(conversationId, meta);
    }
  } else {
    convoMeta = createMeta(conversationId, meta);
  }
  convoMeta.lastUpdated = message.timestamp;
  convoMeta.lastMessage = message.message.slice(0, 200);
  convoMeta.sender = message.sender;
  if (!convoMeta.title && message.sender === "user") {
    convoMeta.title = message.message.slice(0, 80);
  }
  fs2.writeFileSync(metaPath, JSON.stringify(convoMeta, null, 2));
}
function createMeta(conversationId, meta) {
  return {
    conversationId,
    title: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
    lastMessage: "",
    sender: "",
    source: "cli",
    tier: meta.tier,
    provider: meta.provider,
    mode: meta.mode
  };
}

// src/core/file-retrieval.ts
import * as fs3 from "fs";
import * as path3 from "path";
async function getRelevantFileContents(userMessage, localEndpoint) {
  const cwd = process.cwd();
  const summaries = loadSummaries(cwd);
  const dependencies = loadDependencies(cwd);
  if (!summaries || Object.keys(summaries).length === 0) {
    return { fileContents: "", selectedFiles: [] };
  }
  let mapContext = "PROJECT MAP:\n";
  for (const [filePath, summary] of Object.entries(summaries)) {
    mapContext += `- ${filePath}: "${summary}"
`;
  }
  if (dependencies && Object.keys(dependencies).length > 0) {
    mapContext += "\nDEPENDENCIES:\n";
    for (const [filePath, deps] of Object.entries(dependencies)) {
      if (deps.length > 0) {
        mapContext += `- ${filePath} depends on: [${deps.join(", ")}]
`;
      }
    }
  }
  const selectionMessages = [
    {
      role: "system",
      content: 'You are a file selector. Based on the user request and project map, return ONLY a JSON array of file paths that are relevant to answering this request. Maximum 5 files. No explanation, no markdown, no code fences. Just a raw JSON array like: ["path/to/file.ts", "path/to/other.ts"]'
    },
    {
      role: "user",
      content: `USER REQUEST: "${userMessage}"

${mapContext}

Return ONLY the JSON array of relevant file paths:`
    }
  ];
  try {
    const selectionResponse = await callLocalModel(localEndpoint, selectionMessages);
    const jsonMatch = selectionResponse.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return { fileContents: "", selectedFiles: [] };
    const selectedFiles = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(selectedFiles) || selectedFiles.length === 0) {
      return { fileContents: "", selectedFiles: [] };
    }
    let fileContents = "## RELEVANT FILES (selected by Bob from project index) ##\n\n";
    const validFiles = [];
    for (const filePath of selectedFiles.slice(0, 5)) {
      const absolutePath = path3.join(cwd, filePath);
      try {
        if (fs3.existsSync(absolutePath)) {
          const content = fs3.readFileSync(absolutePath, "utf-8");
          fileContents += `--- FILE: ${filePath} ---
${content}
--- END FILE ---

`;
          validFiles.push(filePath);
        }
      } catch {
      }
    }
    return { fileContents, selectedFiles: validFiles };
  } catch {
    return { fileContents: "", selectedFiles: [] };
  }
}

// src/commands/deepdive.ts
import chalk4 from "chalk";
import ora from "ora";

// src/ui/animations/deep-dive.ts
import chalk3 from "chalk";

// src/ui/animations/engine.ts
function startAnimation(frames, config, statusText) {
  let running = true;
  const { frameDelay, frameHeight, loop = false } = config;
  for (let i = 0; i < frameHeight + (statusText ? 2 : 0); i++) {
    console.log("");
  }
  const promise = (async () => {
    for (const frame of frames) {
      if (!running) return;
      renderFrame(frame, frameHeight, statusText);
      await sleep(frameDelay);
    }
    if (loop) {
      let toggle = false;
      while (running) {
        const idx = toggle ? frames.length - 1 : frames.length - 2;
        renderFrame(frames[Math.max(0, idx)], frameHeight, statusText);
        toggle = !toggle;
        await sleep(frameDelay * 2);
      }
    }
  })();
  return {
    stop: () => {
      running = false;
    },
    promise
  };
}
function renderFrame(frame, frameHeight, statusText) {
  const totalHeight = frameHeight + (statusText ? 2 : 0);
  process.stdout.write(`\x1B[${totalHeight}A`);
  for (let i = 0; i < frameHeight; i++) {
    process.stdout.write("\x1B[2K");
    if (i < frame.lines.length) {
      process.stdout.write(frame.lines[i]);
    }
    process.stdout.write("\n");
  }
  if (statusText) {
    process.stdout.write("\x1B[2K");
    process.stdout.write(statusText + "\n");
    process.stdout.write("\x1B[2K\n");
  }
}
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}

// src/ui/animations/deep-dive.ts
var WATER = chalk3.bgHex("#1565C0").hex("#42A5F5");
var DEEP_WATER = chalk3.bgHex("#0D47A1").hex("#1565C0");
var BOARD = chalk3.hex("#8D6E63");
var FIGURE = chalk3.hex("#FFAB00");
var SPLASH = chalk3.hex("#81D4FA");
var SKY = chalk3.hex("#90CAF9");
var POOL_EDGE = chalk3.hex("#455A64");
var LIGHT = "\u2591";
var MED = "\u2592";
var DARK = "\u2593";
var FRAME_HEIGHT = 12;
function buildFrames() {
  const frames = [];
  frames.push({ lines: [
    SKY("                                                        "),
    SKY("                                                        "),
    `  ${BOARD("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2513")}                                              `,
    `  ${BOARD("       \u2503")} ${FIGURE("\u2593\u2588\u2593")}                                          `,
    `  ${BOARD("       \u2503")} ${FIGURE(" \u2588 ")}                                          `,
    `  ${BOARD("       \u2503")} ${FIGURE("\u2590 \u258C")}                                          `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE("\u2551")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE("\u2551")}           `,
    `  ${POOL_EDGE("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u253B\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")}${POOL_EDGE("\u2551")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE("\u2551")}           `,
    `                    ${POOL_EDGE("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D")}           `,
    `                                                          `
  ] });
  frames.push({ lines: [
    SKY("                                                        "),
    SKY("                                                        "),
    `  ${BOARD("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2513")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")} ${FIGURE("\u2593\u2588\u2593")}                                          `,
    `  ${BOARD("       \u2503")} ${FIGURE("\u2590\u2588\u258C")}                                          `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE("\u2551")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE("\u2551")}           `,
    `  ${POOL_EDGE("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u253B\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")}${POOL_EDGE("\u2551")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE("\u2551")}           `,
    `                    ${POOL_EDGE("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D")}           `,
    `                                                          `
  ] });
  frames.push({ lines: [
    SKY("                                                        "),
    `                  ${FIGURE("\u2593\u2588\u2593")}                                    `,
    `  ${BOARD("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2513")}   ${FIGURE(" \u2588 ")}                                        `,
    `  ${BOARD("       \u2503")}   ${FIGURE("\u2590 \u258C")}                                        `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE("\u2551")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE("\u2551")}           `,
    `  ${POOL_EDGE("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u253B\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")}${POOL_EDGE("\u2551")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE("\u2551")}           `,
    `                    ${POOL_EDGE("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D")}           `,
    `                                                          `
  ] });
  frames.push({ lines: [
    SKY("                                                        "),
    SKY("                                                        "),
    `  ${BOARD("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2513")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}           ${FIGURE("\u2590\u2588\u258C")}                                `,
    `  ${BOARD("       \u2503")}           ${FIGURE(" \u25BC ")}                                `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE("\u2551")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE("\u2551")}           `,
    `  ${POOL_EDGE("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u253B\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")}${POOL_EDGE("\u2551")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE("\u2551")}           `,
    `                    ${POOL_EDGE("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D")}           `,
    `                                                          `
  ] });
  frames.push({ lines: [
    SKY("                                                        "),
    SKY("                                                        "),
    `  ${BOARD("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2513")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2554\u2550\u2550\u2550\u2550")}${SPLASH("\u{1F4A6}\u{1F4A6}\u{1F4A6}")}${POOL_EDGE("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${LIGHT}${LIGHT}${LIGHT}`)}${FIGURE("\u2593\u2588\u2593")}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE("\u2551")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE("\u2551")}           `,
    `  ${POOL_EDGE("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u253B\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")}${POOL_EDGE("\u2551")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE("\u2551")}           `,
    `                    ${POOL_EDGE("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D")}           `,
    `                                                          `
  ] });
  frames.push({ lines: [
    SKY("                                                        "),
    SKY("                                                        "),
    `  ${BOARD("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2513")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE("\u2551")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${MED}${MED}${MED}`)}${FIGURE("\u2593\u2588\u2593")}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE("\u2551")}           `,
    `  ${POOL_EDGE("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u253B\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")}${POOL_EDGE("\u2551")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE("\u2551")}           `,
    `                    ${POOL_EDGE("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D")}           `,
    `                                                          `
  ] });
  frames.push({ lines: [
    SKY("                                                        "),
    SKY("                                                        "),
    `  ${BOARD("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2513")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE("\u2551")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE("\u2551")}           `,
    `  ${POOL_EDGE("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u253B\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")}${POOL_EDGE("\u2551")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${FIGURE("\u{1F93F}")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE("\u2551")}           `,
    `                    ${POOL_EDGE("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D")}           `,
    `                                                          `
  ] });
  frames.push({ lines: [
    SKY("                                                        "),
    SKY("                                                        "),
    `  ${BOARD("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2513")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}                                              `,
    `  ${BOARD("       \u2503")}         ${chalk3.bold.blue("\u26A1 DEEP DIVE ACTIVE")}                   `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}${LIGHT}`)}${POOL_EDGE("\u2551")}           `,
    `         ${POOL_EDGE("\u2503")}         ${POOL_EDGE("\u2551")}${WATER(`${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}${MED}`)}${POOL_EDGE("\u2551")}           `,
    `  ${POOL_EDGE("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u253B\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")}${POOL_EDGE("\u2551")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${FIGURE("\u{1F93F}")}${DEEP_WATER(`${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}${DARK}`)}${POOL_EDGE("\u2551")}           `,
    `                    ${POOL_EDGE("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D")}           `,
    `                                                          `
  ] });
  return frames;
}
function startDeepDiveAnimation() {
  const frames = buildFrames();
  return startAnimation(frames, {
    frameDelay: 400,
    frameHeight: FRAME_HEIGHT,
    loop: true
  }, chalk3.blue("  \u{1F93F} Initiating deep dive..."));
}

// src/commands/deepdive.ts
var DIVE_BORDER = chalk4.blue;
function registerDeepDiveCommand(program2) {
  program2.command("deepdives").description("List all deep dives in the current conversation").action(async () => {
    const config = getConfig();
    if (!config.loggedIn || !config.authToken) {
      console.log("");
      console.log(chalk4.red("  \u274C Not logged in. Deep dives require Tier 3."));
      console.log("");
      return;
    }
    if (!config.conversationId) {
      console.log("");
      console.log(chalk4.red("  \u274C No active conversation."));
      console.log("");
      return;
    }
    const spinner = ora({ text: chalk4.cyan("  Loading deep dives..."), spinner: "dots" }).start();
    try {
      const result = await callCloudFunction("listCLIDeepDives", {
        conversationId: config.conversationId
      });
      spinner.stop();
      const dives = result.deepDives || [];
      console.log("");
      console.log(DIVE_BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
      console.log(DIVE_BORDER("  \u2551") + chalk4.bold.blue("  \u{1F93F} Deep Dives                          ") + DIVE_BORDER("\u2551"));
      console.log(DIVE_BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
      if (dives.length === 0) {
        console.log(DIVE_BORDER("  \u2551") + chalk4.gray("  No deep dives yet.                      ") + DIVE_BORDER("\u2551"));
        console.log(DIVE_BORDER("  \u2551") + chalk4.gray("  Use /deepdive in interactive mode.       ") + DIVE_BORDER("\u2551"));
      } else {
        for (const dive of dives) {
          const preview = (dive.initiatingPrompt || "No prompt").slice(0, 35);
          const msgs = dive.messageCount || 0;
          console.log(DIVE_BORDER("  \u2551") + `  ${chalk4.blue(dive.parentMessageId.slice(0, 8))}  ${chalk4.white(preview)}${preview.length >= 35 ? "..." : ""}`);
          console.log(DIVE_BORDER("  \u2551") + chalk4.gray(`    ${msgs} messages | ${dive.status || "active"}`));
        }
      }
      console.log(DIVE_BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
      console.log("");
    } catch (error) {
      spinner.stop();
      console.log(chalk4.red(`  \u274C ${error.message}`));
      console.log("");
    }
  });
}
async function enterDeepDive(config, conversationId, rl) {
  if (!config.loggedIn || !config.authToken) {
    console.log(chalk4.red("  \u274C Deep dives require Tier 3 (platform login)."));
    return;
  }
  const spinner = ora({ text: chalk4.cyan("  Loading messages..."), spinner: "dots" }).start();
  let messages;
  try {
    const result = await callCloudFunction("listCLIDeepDives", {
      conversationId,
      action: "listMessages"
    });
    messages = result.messages || [];
    spinner.stop();
  } catch (error) {
    spinner.stop();
    console.log(chalk4.red(`  \u274C ${error.message}`));
    return;
  }
  if (messages.length === 0) {
    console.log(chalk4.yellow("  \u26A0\uFE0F  No Bob messages found to deep dive on."));
    return;
  }
  console.log("");
  console.log(DIVE_BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(DIVE_BORDER("  \u2551") + chalk4.bold.blue("  \u{1F93F} Select a message to deep dive on     ") + DIVE_BORDER("\u2551"));
  console.log(DIVE_BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const preview = (msg.message || "").slice(0, 40);
    console.log(DIVE_BORDER("  \u2551") + `  ${chalk4.cyan(String(i + 1).padStart(2))}. ${chalk4.white(preview)}${preview.length >= 40 ? "..." : ""}`);
  }
  console.log(DIVE_BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  const answer = await new Promise((resolve2) => {
    rl.question(chalk4.blue("  Select (1-" + messages.length + ") or 0 to cancel: "), resolve2);
  });
  const selection = parseInt(answer.trim());
  if (isNaN(selection) || selection === 0 || selection < 1 || selection > messages.length) {
    console.log(chalk4.gray("  Cancelled."));
    return;
  }
  const selectedMessage = messages[selection - 1];
  const parentMessageId = selectedMessage.id;
  const initiatingPrompt = selectedMessage.message.slice(0, 100);
  const animation = startDeepDiveAnimation();
  const divePromise = callCloudFunction("initiateCLIDeepDive", {
    conversationId,
    parentMessageId,
    initiatingPrompt
  });
  try {
    await divePromise;
    animation.stop();
    await new Promise((resolve2) => setTimeout(resolve2, 300));
    await runDeepDiveSession(config, conversationId, parentMessageId, initiatingPrompt, rl);
  } catch (error) {
    animation.stop();
    await new Promise((resolve2) => setTimeout(resolve2, 200));
    console.log(chalk4.red(`  \u274C Could not initiate deep dive: ${error.message}`));
  }
}
async function runDeepDiveSession(config, conversationId, parentMessageId, initiatingPrompt, rl) {
  const previewText = initiatingPrompt.slice(0, 50) + (initiatingPrompt.length > 50 ? "..." : "");
  console.log("");
  console.log(DIVE_BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(DIVE_BORDER("  \u2551") + chalk4.bold.blue("  \u{1F93F} DEEP DIVE                                       ") + DIVE_BORDER("\u2551"));
  console.log(DIVE_BORDER("  \u2551") + chalk4.gray(`  On: "${previewText}"`));
  console.log(DIVE_BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(DIVE_BORDER("  \u2551") + chalk4.gray("  Commands: /surface  /promote  /clear                ") + DIVE_BORDER("\u2551"));
  console.log(DIVE_BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  return new Promise((resolve2) => {
    const deepDivePrompt = () => {
      rl.question(chalk4.blue("  \u{1F93F} You: "), async (input) => {
        const trimmed = input.trim();
        if (!trimmed) {
          deepDivePrompt();
          return;
        }
        if (trimmed === "/surface" || trimmed === "/exit") {
          console.log("");
          console.log(DIVE_BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
          console.log(DIVE_BORDER("  \u2551") + chalk4.bold.blue("  \u{1F3CA} Surfaced from Deep Dive              ") + DIVE_BORDER("\u2551"));
          console.log(DIVE_BORDER("  \u2551") + chalk4.gray(`  Back in: ${conversationId.slice(0, 24)}...`));
          console.log(DIVE_BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
          console.log("");
          resolve2();
          return;
        }
        if (trimmed === "/promote") {
          const promoSpinner = ora({ text: chalk4.blue("  Promoting deep dive..."), spinner: "dots" }).start();
          try {
            await callCloudFunction("promoteDeepDive", {
              conversationId,
              parentMessageId
            });
            promoSpinner.stop();
            console.log("");
            console.log(chalk4.green("  \u2705 Deep dive promoted! Summary merged into main conversation."));
            console.log("");
          } catch (error) {
            promoSpinner.stop();
            console.log(chalk4.red(`  \u274C Promote failed: ${error.message}`));
            console.log("");
          }
          resolve2();
          return;
        }
        if (trimmed === "/clear") {
          console.clear();
          console.log(DIVE_BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
          console.log(DIVE_BORDER("  \u2551") + chalk4.bold.blue("  \u{1F93F} DEEP DIVE (continued)                ") + DIVE_BORDER("\u2551"));
          console.log(DIVE_BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
          console.log("");
          deepDivePrompt();
          return;
        }
        const msgSpinner = ora({ text: chalk4.blue("  \u{1F93F} Bob is diving deep..."), spinner: "dots" }).start();
        try {
          await callCloudFunction("generateDeepDiveResponse", {
            conversationId,
            parentMessageId,
            userMessage: trimmed,
            isLocalModel: false,
            activePersonaId: null
          });
          msgSpinner.stop();
          const latestResult = await callCloudFunction("listCLIDeepDives", {
            conversationId,
            action: "getLatestSandboxMessage",
            parentMessageId
          });
          const responseText = latestResult?.message || "Deep dive response saved.";
          const rendered = renderMarkdown(responseText);
          console.log("");
          console.log(DIVE_BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
          console.log(DIVE_BORDER("  \u2551") + chalk4.bold.blue("  \u{1F93F} Bob (Deep Dive):                                 ") + DIVE_BORDER("\u2551"));
          console.log(DIVE_BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
          for (const line of rendered.split("\n")) {
            console.log(DIVE_BORDER("  \u2551") + `  ${line}`);
          }
          console.log(DIVE_BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
          console.log("");
        } catch (error) {
          msgSpinner.stop();
          console.log(chalk4.red(`  \u274C ${error.message}`));
          console.log("");
        }
        deepDivePrompt();
      });
    };
    deepDivePrompt();
  });
}

// src/ui/session-header.ts
import chalk5 from "chalk";
import * as path4 from "path";
var AMBER = chalk5.hex("#FFAB00");
var ORANGE = chalk5.hex("#E66F24");
var GREEN = chalk5.hex("#2E7D32");
var BLUE = chalk5.hex("#42A5F5");
var DARK_BG = chalk5.bgHex("#222C22");
function renderSessionHeader(mode) {
  const config = getConfig();
  const projectName = path4.basename(process.cwd());
  const summaries = loadSummaries(process.cwd());
  const fileCount = summaries ? Object.keys(summaries).length : 0;
  const isIndexed = fileCount > 0;
  const modeLabel = mode === "chat" ? "\u{1F916} Code Mode" : "\u{1F3AF} Consultant Mode";
  const modeColor = mode === "chat" ? chalk5.cyan : chalk5.magenta;
  console.log("");
  console.log(DARK_BG(chalk5.gray("   \u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E")));
  console.log(DARK_BG(chalk5.gray("   \u2502  ") + ORANGE("\u25C9") + AMBER(" BOB CLI") + chalk5.gray("  v0.1.0") + chalk5.gray("                          \u2502")));
  console.log(DARK_BG(chalk5.gray("   \u2502  ") + modeColor(modeLabel) + chalk5.gray("                               \u2502")));
  console.log(DARK_BG(chalk5.gray("   \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F")));
  console.log("");
  const projectStatus = isIndexed ? GREEN(`  \u{1F4DA} ${projectName}`) + chalk5.gray(` (${fileCount} files indexed)`) : chalk5.yellow(`  \u26A0\uFE0F  ${projectName}`) + chalk5.gray(" (not indexed \u2014 run `bob index`)");
  console.log(projectStatus);
  if (config.loggedIn && config.tier === "platform") {
    console.log(BLUE(`  \u{1F4E1} ${config.email}`) + chalk5.gray(` \xB7 Tier 3 \xB7 Provider: ${config.provider || "default"}`));
  } else {
    console.log(chalk5.gray(`  \u{1F512} Local-first (Tier 1) \xB7 Provider: ${config.provider || "not set"}`));
  }
  console.log("");
  console.log(chalk5.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  if (mode === "chat") {
    console.log(chalk5.gray("  /exit \xB7 /new \xB7 /clear \xB7 /include \xB7 /delete \xB7 /deepdive"));
  } else {
    console.log(chalk5.gray("  /exit \xB7 /new \xB7 /clear \xB7 /include"));
  }
  console.log(chalk5.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
}

// src/ui/welcome.ts
import chalk6 from "chalk";
var AMBER2 = chalk6.hex("#FFAB00");
var ORANGE2 = chalk6.hex("#E66F24");
var GREEN2 = chalk6.hex("#2E7D32");
var SKY2 = chalk6.hex("#87CEEB");
var WHITE = chalk6.white;
var BORDER = chalk6.hex("#2E7D32");
var TYPEWRITER_DELAY = 80;
async function showWelcomeIfFirstRun() {
  const config = getConfig();
  if (config.hasSeenWelcome) return;
  await playWelcomeAnimation();
  setConfigValue("hasSeenWelcome", true);
}
async function playWelcomeAnimation() {
  console.clear();
  console.log("");
  console.log(BORDER("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(BORDER("  \u2551") + SKY2("  \u2601        \u2601           \u2601    \u2601         \u2601        \u2601     \u2601") + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + SKY2("       \u2601        \u2601   ") + chalk6.yellow("\u2600\uFE0F") + SKY2("        \u2601       \u2601           \u2601") + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + SKY2("    \u2601      \u2601        \u2601      \u2601    \u2601        \u2601   \u2601      \u2601") + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + SKY2("  \u2601    \u2601       \u2601          \u2601       \u2601    \u2601       \u2601    ") + BORDER(" \u2551"));
  console.log(BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER("  \u2551") + ORANGE2("    \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 ") + AMBER2("\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557") + "          " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + ORANGE2("    \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557") + AMBER2("\u255A\u2550\u255D \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D") + "          " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + ORANGE2("    \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D") + AMBER2("    \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557") + "          " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + ORANGE2("    \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557") + AMBER2("    \u255A\u2550\u2550\u2550\u2550\u2588\u2588\u2551") + "          " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + ORANGE2("    \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D") + AMBER2("    \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551") + "          " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + ORANGE2("    \u255A\u2550\u2550\u2550\u2550\u2550\u255D  \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D ") + AMBER2("    \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D") + "          " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + "                                                        " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + WHITE("                          C  L  I") + chalk6.gray("  v0.1.0") + "              " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + "                                                        " + BORDER("\u2551"));
  console.log(BORDER("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER("  \u2551") + "                                                        " + BORDER("\u2551"));
  process.stdout.write(BORDER("  \u2551"));
  const tagline = "    \u{1F528}\u{1FA9B}\u{1F4BB}  We Can Build It!";
  for (let i = 0; i <= tagline.length; i++) {
    process.stdout.write(`\r${BORDER("  \u2551")}${AMBER2(tagline.slice(0, i))}`);
    await sleep2(TYPEWRITER_DELAY);
  }
  const pad = 56 - tagline.length;
  process.stdout.write(" ".repeat(pad > 0 ? pad : 0) + BORDER("\u2551") + "\n");
  console.log(BORDER("  \u2551") + "                                                        " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + chalk6.gray("    \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500") + "       " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + GREEN2("    \u{1F331} Bob's Workshop") + chalk6.gray(" | A Seedling Company") + "            " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + chalk6.gray("    \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500") + "       " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + "                                                        " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + chalk6.gray("    Quick Start:") + "                                        " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + chalk6.gray("    ") + AMBER2("bob chat") + chalk6.gray("           \u2014 Talk to Bob") + "                 " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + chalk6.gray("    ") + AMBER2("bob consult") + chalk6.gray("        \u2014 Strategic advice (no code)") + "   " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + chalk6.gray("    ") + AMBER2("bob index") + chalk6.gray("          \u2014 Index your project") + "           " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + chalk6.gray("    ") + AMBER2("bob login") + chalk6.gray("          \u2014 Connect to the platform") + "      " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + chalk6.gray("    ") + AMBER2('bob push "msg"') + chalk6.gray("     \u2014 Git commit + push") + "            " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + chalk6.gray("    ") + AMBER2("bob --help") + chalk6.gray("         \u2014 See all commands") + "             " + BORDER("\u2551"));
  console.log(BORDER("  \u2551") + "                                                        " + BORDER("\u2551"));
  console.log(BORDER("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  await sleep2(800);
}
function sleep2(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}

// src/commands/chat.ts
function registerChatCommand(program2) {
  program2.command("chat [message]").description("Chat with Bob \u2014 code-friendly engineering partner").option("-f, --file <path>", "Include a specific file as context").option("--no-context", "Skip local directory context").option("--personalized", "Use personalization mode (Tier 3 only)").option("--new", "Start a fresh conversation").option("-i, --interactive", "Enter interactive conversation mode").action(async (message, options) => {
    const config = getConfig();
    let conversationId = config.conversationId;
    if (options.new || !conversationId) {
      conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setConfigValue("conversationId", conversationId);
    }
    let localContext = "";
    if (options.context !== false) {
      localContext = buildLocalContext(process.cwd());
    }
    if (options.file) {
      const fileContent = readFileContent(options.file);
      if (fileContent) {
        localContext += `

--- INCLUDED FILE: ${options.file} ---
${fileContent}
--- END FILE ---`;
      } else {
        console.log(chalk7.yellow(`  \u26A0\uFE0F  Could not read file: ${options.file}`));
      }
    }
    if (options.interactive || !message) {
      await runInteractiveSession(config, conversationId, localContext, options.personalized || false, "standard");
      return;
    }
    await sendMessage(message, config, conversationId, localContext, options.personalized || false, "standard", []);
  });
}
async function sendMessage(message, config, conversationId, localContext, personalized, mode, history) {
  const spinner = ora2({
    text: chalk7.cyan("  Bob is thinking..."),
    spinner: "dots"
  }).start();
  let selectedFiles = [];
  let hasProjectContext = null;
  try {
    let response;
    let relevantFiles = "";
    if (config.localEndpoint) {
      spinner.text = chalk7.cyan("  Bob is finding relevant files...");
      const retrieval = await getRelevantFileContents(message, config.localEndpoint);
      relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;
    }
    spinner.text = chalk7.cyan("  Bob is thinking...");
    let fullContext = localContext;
    if (relevantFiles) {
      fullContext += `

${relevantFiles}`;
    }
    if (config.provider === "local") {
      if (!config.localEndpoint) {
        spinner.stop();
        console.log(chalk7.red("  \u274C No local endpoint configured."));
        console.log(chalk7.gray("  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`"));
        return "";
      }
      const messages = [
        { role: "system", content: STANDARD_STYLE_PROMPT + (fullContext ? `

## PROJECT CONTEXT ##
${fullContext}` : "") },
        ...history,
        { role: "user", content: message }
      ];
      response = await callLocalModel(config.localEndpoint, messages);
      saveMessage(conversationId, {
        sender: "user",
        message,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "text"
      }, { tier: "local", provider: config.provider, mode });
      saveMessage(conversationId, {
        sender: "bob",
        message: response,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "text"
      }, { tier: "local", provider: config.provider, mode });
    } else if (personalized || config.personalizationMode) {
      if (!config.loggedIn || !config.authToken) {
        spinner.stop();
        console.log(chalk7.red("  \u274C Personalization mode requires Tier 3 (platform login)."));
        return "";
      }
      const result = await callCloudFunction("getPersonalizedResponse", {
        userEmail: config.email,
        userId: config.uid,
        conversationId,
        userMessage: message,
        useContext: true,
        localContext: fullContext || null
      });
      response = result?.text || result?.response || result?.message || "No response received.";
      hasProjectContext = result?.hasProjectContext ?? null;
    } else {
      if (!config.loggedIn || !config.authToken) {
        spinner.stop();
        console.log(chalk7.red("  \u274C Not logged in."));
        console.log(chalk7.gray("  Run `bob login` to authenticate, or set provider to local."));
        return "";
      }
      const result = await callCloudFunction("chatWithBobStream", {
        userEmail: config.email,
        userId: config.uid,
        conversationId,
        userMessage: message,
        useContext: true,
        consultantModelId: "gemini-2.5-flash",
        useOrgContext: false,
        isPassalongActive: false,
        linkedConvoId: null,
        localContext: fullContext || null
      });
      response = result?.text || result?.response || result?.message || "No response received.";
      hasProjectContext = result?.hasProjectContext ?? null;
    }
    spinner.stop();
    const proposed = extractProposedFile(response);
    let displayResponse = response;
    if (proposed) {
      displayResponse = stripCodeBlockFromResponse(response);
    }
    const rendered = renderMarkdown(displayResponse);
    console.log("");
    console.log(chalk7.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log(chalk7.bold.cyan("  \u{1F916} Bob:"));
    console.log("");
    for (const line of rendered.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log("");
    if (selectedFiles.length > 0) {
      console.log(chalk7.gray(`  \u{1F4C2} Referenced: ${selectedFiles.join(", ")}`));
    }
    if (config.tier === "platform" && config.provider !== "local") {
      console.log(chalk7.gray(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
      if (hasProjectContext === false) {
        console.log(chalk7.red("  \u26A0\uFE0F  No project workspace connected. Upload a project via the web app"));
        console.log(chalk7.red("     for full RAG + workspace capabilities."));
      }
    }
    console.log(chalk7.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    if (proposed) {
      await proposeAndWriteFile(proposed);
    }
    return response;
  } catch (error) {
    spinner.stop();
    console.log(chalk7.red(`  \u274C ${error.message || "Unknown error"}`));
    return "";
  }
}
async function runInteractiveSession(config, conversationId, localContext, personalized, mode) {
  if (!config.hasSeenWelcome) {
    await showWelcomeIfFirstRun();
    setConfigValue("hasSeenWelcome", true);
  }
  renderSessionHeader("chat");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const history = [];
  const prompt = () => {
    rl.question(chalk7.green("  You: "), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }
      if (trimmed === "/exit" || trimmed === "/quit") {
        console.log("");
        console.log(chalk7.gray(`  \u{1F4BE} Session: ${conversationId.slice(0, 24)}...`));
        if (config.tier === "platform" && config.provider !== "local") {
          console.log(chalk7.gray(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
        }
        console.log(chalk7.gray("  \u{1F44B} See you next time."));
        console.log("");
        rl.close();
        return;
      }
      if (trimmed === "/new") {
        history.length = 0;
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setConfigValue("conversationId", conversationId);
        console.log(chalk7.cyan("  \u{1F504} New session started."));
        console.log("");
        prompt();
        return;
      }
      if (trimmed === "/clear") {
        console.clear();
        renderSessionHeader("chat");
        prompt();
        return;
      }
      if (trimmed.startsWith("/include ")) {
        const filePath = trimmed.slice(9).trim();
        const content = readFileContent(filePath);
        if (content) {
          localContext += `

--- INCLUDED FILE: ${filePath} ---
${content}
--- END FILE ---`;
          const lineCount = content.split("\n").length;
          console.log(chalk7.green(`  \u{1F4C4} Loaded: ${filePath} (${lineCount} lines)`));
        } else {
          console.log(chalk7.red(`  \u274C Could not read: ${filePath}`));
        }
        console.log("");
        prompt();
        return;
      }
      if (trimmed.startsWith("/delete ")) {
        const filePath = trimmed.slice(8).trim();
        const absolutePath = path5.resolve(process.cwd(), filePath);
        if (!fs4.existsSync(absolutePath)) {
          console.log(chalk7.red(`  \u274C File not found: ${filePath}`));
          console.log("");
          prompt();
          return;
        }
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        const confirm = await new Promise((resolve2) => {
          rl2.question(chalk7.red(`  \u{1F5D1}\uFE0F  Delete ${filePath}? This cannot be undone. (y/n): `), resolve2);
        });
        rl2.close();
        if (confirm.toLowerCase() === "y" || confirm.toLowerCase() === "yes") {
          try {
            const backupDir = path5.join(process.cwd(), ".bob-backups");
            if (!fs4.existsSync(backupDir)) fs4.mkdirSync(backupDir, { recursive: true });
            const timestamp = Date.now();
            const backupName = filePath.replace(/[\/\\]/g, "_") + `.${timestamp}.deleted`;
            fs4.copyFileSync(absolutePath, path5.join(backupDir, backupName));
            fs4.unlinkSync(absolutePath);
            console.log(chalk7.green(`  \u2705 Deleted: ${filePath}`));
            console.log(chalk7.gray(`  \u{1F4E6} Backup saved to .bob-backups/ (recoverable)`));
          } catch (e) {
            console.log(chalk7.red(`  \u274C Delete failed: ${e.message}`));
          }
        } else {
          console.log(chalk7.gray("  Cancelled."));
        }
        console.log("");
        prompt();
        return;
      }
      if (trimmed === "/deepdive") {
        await enterDeepDive(config, conversationId, rl);
        prompt();
        return;
      }
      const response = await sendMessage(trimmed, config, conversationId, localContext, personalized, mode, history);
      if (response) {
        history.push({ role: "user", content: trimmed });
        history.push({ role: "assistant", content: response });
      }
      prompt();
    });
  };
  prompt();
}

// src/commands/consult.ts
import chalk8 from "chalk";
import ora3 from "ora";
import * as readline2 from "readline";
function registerConsultCommand(program2) {
  program2.command("consult [message]").description("Consult with Bob \u2014 strategic advice only, no code").option("-f, --file <path>", "Include a specific file as context").option("--no-context", "Skip local directory context").option("--new", "Start a fresh conversation").option("-i, --interactive", "Enter interactive consultant session").action(async (message, options) => {
    const config = getConfig();
    let conversationId = config.conversationId;
    if (options.new || !conversationId) {
      conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setConfigValue("conversationId", conversationId);
    }
    let localContext = "";
    if (options.context !== false) {
      localContext = buildLocalContext(process.cwd());
    }
    if (options.file) {
      const fileContent = readFileContent(options.file);
      if (fileContent) {
        localContext += `

--- INCLUDED FILE: ${options.file} ---
${fileContent}
--- END FILE ---`;
      } else {
        console.log(chalk8.yellow(`  \u26A0\uFE0F  Could not read file: ${options.file}`));
      }
    }
    if (options.interactive || !message) {
      await runInteractiveSession2(config, conversationId, localContext);
      return;
    }
    await sendConsultMessage(message, config, conversationId, localContext, []);
  });
}
async function sendConsultMessage(message, config, conversationId, localContext, history) {
  const spinner = ora3({
    text: chalk8.cyan("  Bob is thinking (consultant mode)..."),
    spinner: "dots"
  }).start();
  let selectedFiles = [];
  let hasProjectContext = null;
  try {
    let response;
    if (config.provider === "local") {
      if (!config.localEndpoint) {
        spinner.stop();
        console.log(chalk8.red("  \u274C No local endpoint configured."));
        console.log(chalk8.gray("  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`"));
        return "";
      }
      spinner.text = chalk8.cyan("  Bob is finding relevant files...");
      const retrieval = await getRelevantFileContents(message, config.localEndpoint);
      const relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;
      spinner.text = chalk8.cyan("  Bob is thinking (consultant mode)...");
      let fullContext = localContext;
      if (relevantFiles) {
        fullContext += `

${relevantFiles}`;
      }
      const messages = [
        { role: "system", content: CONSULTANT_STYLE_PROMPT + (fullContext ? `

## PROJECT CONTEXT ##
${fullContext}` : "") },
        ...history,
        { role: "user", content: message }
      ];
      response = await callLocalModel(config.localEndpoint, messages);
      saveMessage(conversationId, {
        sender: "user",
        message,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "text"
      }, { tier: "local", provider: config.provider, mode: "consultant" });
      saveMessage(conversationId, {
        sender: "bob",
        message: response,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "text"
      }, { tier: "local", provider: config.provider, mode: "consultant" });
    } else {
      if (!config.loggedIn || !config.authToken) {
        spinner.stop();
        console.log(chalk8.red("  \u274C Not logged in."));
        console.log(chalk8.gray("  Run `bob login` to authenticate, or set provider to local."));
        return "";
      }
      const result = await callCloudFunction("consultWithBobStream", {
        userEmail: config.email,
        userId: config.uid,
        conversationId,
        userMessage: message,
        useContext: true,
        consultantModelId: "gemini-2.5-flash",
        useOrgContext: false,
        isPassalongActive: false,
        linkedConvoId: null,
        localContext: localContext || null
      });
      response = result?.text || result?.response || result?.message || "No response received.";
      hasProjectContext = result?.hasProjectContext ?? null;
    }
    spinner.stop();
    const rendered = renderMarkdown(response);
    console.log("");
    console.log(chalk8.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log(chalk8.bold.magenta("  \u{1F3AF} Bob (Consultant):"));
    console.log("");
    for (const line of rendered.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log("");
    if (selectedFiles.length > 0) {
      console.log(chalk8.gray(`  \u{1F4C2} Referenced: ${selectedFiles.join(", ")}`));
    }
    if (config.tier === "platform" && config.provider !== "local") {
      console.log(chalk8.gray(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
      if (hasProjectContext === false) {
        console.log(chalk8.red("  \u26A0\uFE0F  No project workspace connected. Upload a project via the web app"));
        console.log(chalk8.red("     for full RAG + workspace capabilities."));
      }
    }
    console.log(chalk8.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    return response;
  } catch (error) {
    spinner.stop();
    console.log(chalk8.red(`  \u274C ${error.message || "Unknown error"}`));
    return "";
  }
}
async function runInteractiveSession2(config, conversationId, localContext) {
  if (config.hasSeenWelcome === void 0 || !config.hasSeenWelcome) {
    await showWelcomeIfFirstRun();
    setConfigValue("hasSeenWelcome", true);
  }
  renderSessionHeader("consult");
  const rl = readline2.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const history = [];
  const prompt = () => {
    rl.question(chalk8.green("  You: "), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }
      if (trimmed === "/exit" || trimmed === "/quit") {
        console.log("");
        console.log(chalk8.gray(`  \u{1F4BE} Session: ${conversationId.slice(0, 24)}...`));
        if (config.tier === "platform" && config.provider !== "local") {
          console.log(chalk8.gray(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
        }
        console.log(chalk8.gray("  \u{1F44B} See you next time."));
        console.log("");
        rl.close();
        return;
      }
      if (trimmed === "/new") {
        history.length = 0;
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setConfigValue("conversationId", conversationId);
        console.log(chalk8.magenta("  \u{1F504} New consultant session started."));
        console.log("");
        prompt();
        return;
      }
      if (trimmed === "/clear") {
        console.clear();
        renderSessionHeader("consult");
        prompt();
        return;
      }
      if (trimmed.startsWith("/include ")) {
        const filePath = trimmed.slice(9).trim();
        const content = readFileContent(filePath);
        if (content) {
          localContext += `

--- INCLUDED FILE: ${filePath} ---
${content}
--- END FILE ---`;
          const lineCount = content.split("\n").length;
          console.log(chalk8.green(`  \u{1F4C4} Loaded: ${filePath} (${lineCount} lines)`));
        } else {
          console.log(chalk8.red(`  \u274C Could not read: ${filePath}`));
        }
        console.log("");
        prompt();
        return;
      }
      const response = await sendConsultMessage(trimmed, config, conversationId, localContext, history);
      if (response) {
        history.push({ role: "user", content: trimmed });
        history.push({ role: "assistant", content: response });
      }
      prompt();
    });
  };
  prompt();
}

// src/commands/index.ts
import chalk9 from "chalk";
import * as fs5 from "fs";
import * as path6 from "path";
var IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".dart_tool", ".idea", ".gradle", ".pub-cache", ".bob"];
var CODE_EXTENSIONS = /* @__PURE__ */ new Set([".dart", ".js", ".ts", ".html", ".css", ".json", ".yaml", ".yml", ".xml", ".sh", ".md"]);
function registerIndexCommand(program2) {
  program2.command("index").description("Index the current project \u2014 generates summaries and dependency map").option("--verbose", "Show detailed progress with summaries").action(async (options) => {
    const config = getConfig();
    const cwd = process.cwd();
    const projectName = getProjectName(cwd);
    if (config.provider !== "local" || !config.localEndpoint) {
      console.log("");
      console.log(chalk9.red("  \u274C Indexing requires a local model."));
      console.log(chalk9.gray("  Run `bob config set provider local`"));
      console.log(chalk9.gray("  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`"));
      console.log("");
      return;
    }
    console.log("");
    console.log(chalk9.bold.cyan(`  \u26A1 Indexing project: ${projectName}`));
    console.log(chalk9.gray(`  \u{1F4C1} ${cwd}`));
    console.log(chalk9.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    const files = scanProjectFiles(cwd);
    if (files.length === 0) {
      console.log(chalk9.yellow("  \u26A0\uFE0F  No code files found to index."));
      return;
    }
    console.log(chalk9.gray(`  Found ${files.length} files to analyze.`));
    console.log("");
    console.log("");
    console.log("");
    console.log("");
    console.log("");
    const { runId, runDir, tasksDir } = createAnalysisRun(cwd, files);
    const summaries = {};
    let completed = 0;
    for (const filePath of files) {
      const absolutePath = path6.join(cwd, filePath);
      let content;
      try {
        content = fs5.readFileSync(absolutePath, "utf-8");
      } catch {
        console.log(chalk9.red(`  \u274C Could not read: ${filePath}`));
        continue;
      }
      if (content.length > 5e4) {
        const shortSummary = `Large file (${Math.round(content.length / 1e3)}KB). Skipped detailed analysis.`;
        summaries[filePath] = shortSummary;
        completeTask(tasksDir, filePath, shortSummary);
        completed++;
        updateManifestProgress(runDir, completed);
        printProgress(completed, files.length, filePath, shortSummary, [], options.verbose);
        continue;
      }
      try {
        const messages = [
          {
            role: "system",
            content: "You are a code analyst. Respond with ONLY a 2-3 sentence summary. No formatting, no headers, no bullets. Just plain sentences."
          },
          {
            role: "user",
            content: `Summarize this file. What does it do, what does it export, and what does it depend on?

File: ${filePath}

${content}`
          }
        ];
        const summary = await callLocalModel(config.localEndpoint, messages);
        summaries[filePath] = summary.trim();
        completeTask(tasksDir, filePath, summary.trim());
        completed++;
        updateManifestProgress(runDir, completed);
        printProgress(completed, files.length, filePath, summary.trim(), [], options.verbose);
      } catch (error) {
        console.log(chalk9.red(`  \u274C Failed: ${filePath} \u2014 ${error.message}`));
        completed++;
        updateManifestProgress(runDir, completed);
      }
    }
    console.log("");
    console.log("");
    console.log(chalk9.cyan("  \u{1F517} Generating dependency map..."));
    try {
      const summaryContext = Object.entries(summaries).map(([fp, summary]) => `[${fp}]: ${summary}`).join("\n\n");
      const messages = [
        {
          role: "system",
          content: "You are a senior software architect. Respond with ONLY a valid JSON object. No explanation, no markdown, no code fences. Just raw JSON."
        },
        {
          role: "user",
          content: `Based on these file summaries, generate a JSON dependency map. Each key is a file path, each value is an array of file paths that file depends on or interacts with. Only include direct, meaningful dependencies.

FILE SUMMARIES:
${summaryContext}

Respond with ONLY the JSON object:`
        }
      ];
      const depResponse = await callLocalModel(config.localEndpoint, messages);
      let dependencies = {};
      try {
        const jsonMatch = depResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          dependencies = JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.log(chalk9.yellow("  \u26A0\uFE0F  Could not parse dependency map. Saving empty map."));
        dependencies = {};
      }
      saveSummaries(cwd, summaries);
      saveDependencies(cwd, dependencies);
      for (const [filePath, deps] of Object.entries(dependencies)) {
        const taskId = filePath.replace(/[\/\\]/g, "_");
        const taskPath = path6.join(tasksDir, `${taskId}.json`);
        if (fs5.existsSync(taskPath)) {
          const task = JSON.parse(fs5.readFileSync(taskPath, "utf-8"));
          task.dependencies = deps;
          fs5.writeFileSync(taskPath, JSON.stringify(task, null, 2));
        }
      }
      updateManifestProgress(runDir, completed, "completed");
      console.log(chalk9.green(`  \u2705 Dependency map generated for ${Object.keys(dependencies).length} files.`));
    } catch (error) {
      console.log(chalk9.red(`  \u274C Dependency mapping failed: ${error.message}`));
      saveSummaries(cwd, summaries);
      saveDependencies(cwd, {});
      updateManifestProgress(runDir, completed, "completed_partial");
    }
    console.log("");
    console.log(chalk9.bold.green(`  \u2705 Indexing complete: ${projectName}`));
    console.log(chalk9.gray(`  \u{1F4C4} ${Object.keys(summaries).length} files summarized`));
    console.log(chalk9.gray(`  \u{1F4BE} Saved to: ~/.bob/projects/${projectName}/analysis/`));
    console.log("");
  });
}
function scanProjectFiles(rootDir, currentDir, depth = 0) {
  if (depth > 6) return [];
  const dir = currentDir || rootDir;
  const files = [];
  try {
    const entries = fs5.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path6.join(dir, entry.name);
      const relativePath = path6.relative(rootDir, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        files.push(...scanProjectFiles(rootDir, fullPath, depth + 1));
      } else {
        const ext = path6.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) {
          files.push(relativePath);
        }
      }
    }
  } catch {
  }
  return files;
}
function printProgress(completed, total, filePath, summary, dependencies, verbose) {
  const percent = completed / total;
  const barLength = 30;
  const filled = Math.round(percent * barLength);
  let barColor;
  if (percent < 0.25) {
    barColor = chalk9.red;
  } else if (percent < 0.5) {
    barColor = chalk9.hex("#FF8C00");
  } else if (percent < 0.75) {
    barColor = chalk9.yellow;
  } else {
    barColor = chalk9.green;
  }
  const filledBar = barColor("\u2588".repeat(filled));
  const emptyBar = chalk9.gray("\u2591".repeat(barLength - filled));
  const percentText = barColor(`${Math.round(percent * 100)}%`);
  process.stdout.write("\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\r");
  console.log(`  ${chalk9.cyan("\u26A1")} Indexing [${filledBar}${emptyBar}] ${completed}/${total} ${percentText}`);
  console.log(chalk9.green(`  \u2705 ${filePath}`));
  if (verbose) {
    console.log(chalk9.gray(`     "${summary.slice(0, 120)}${summary.length > 120 ? "..." : ""}"`));
    if (dependencies.length > 0) {
      console.log(chalk9.gray(`     \u2192 depends on: ${dependencies.join(", ")}`));
    } else {
      console.log(chalk9.gray(`     \u2192 depends on: (mapping after all summaries)`));
    }
  } else {
    console.log(chalk9.gray(`     "${summary.slice(0, 80)}${summary.length > 80 ? "..." : ""}"`));
    console.log("");
  }
}

// src/commands/push.ts
import chalk10 from "chalk";
import ora4 from "ora";
import simpleGit from "simple-git";
function registerPushCommand(program2) {
  program2.command("push <message>").description("Stage all changes, commit, and push to remote").option("--no-stage", "Skip staging (commit only tracked changes)").option("-b, --branch <name>", "Push to a specific branch").action(async (message, options) => {
    const git = simpleGit(process.cwd());
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      console.log("");
      console.log(chalk10.red("  \u274C Not a git repository."));
      console.log(chalk10.gray("  Run this command from inside a git project."));
      console.log("");
      return;
    }
    const spinner = ora4({
      text: chalk10.cyan("  Preparing commit..."),
      spinner: "dots"
    }).start();
    try {
      const status = await git.status();
      if (status.files.length === 0) {
        spinner.stop();
        console.log("");
        console.log(chalk10.yellow("  \u26A0\uFE0F  Nothing to commit. Working tree is clean."));
        console.log("");
        return;
      }
      if (options.stage !== false) {
        spinner.text = chalk10.cyan(`  Staging ${status.files.length} file(s)...`);
        await git.add(".");
      }
      spinner.text = chalk10.cyan("  Committing...");
      const commitResult = await git.commit(message);
      const commitHash = commitResult.commit ? commitResult.commit.slice(0, 7) : "unknown";
      spinner.text = chalk10.cyan("  Pushing to remote...");
      const currentBranch = options.branch || (await git.branchLocal()).current;
      try {
        await git.push("origin", currentBranch);
      } catch (pushError) {
        if (pushError.message?.includes("no upstream") || pushError.message?.includes("has no upstream")) {
          await git.push(["--set-upstream", "origin", currentBranch]);
        } else {
          throw pushError;
        }
      }
      spinner.stop();
      console.log("");
      console.log(chalk10.green("  \u2705 Pushed successfully"));
      console.log(chalk10.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      console.log(`  ${chalk10.cyan("Commit:")}   ${commitHash}`);
      console.log(`  ${chalk10.cyan("Branch:")}   ${currentBranch}`);
      console.log(`  ${chalk10.cyan("Message:")}  ${message}`);
      console.log(`  ${chalk10.cyan("Files:")}    ${status.files.length} changed`);
      console.log(chalk10.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      console.log("");
      if (status.files.length <= 10) {
        for (const file of status.files) {
          const icon = file.index === "?" ? "\u2795" : file.index === "D" ? "\u{1F5D1}\uFE0F" : "\u270F\uFE0F";
          console.log(chalk10.gray(`  ${icon} ${file.path}`));
        }
        console.log("");
      } else {
        console.log(chalk10.gray(`  ${status.created.length} added, ${status.modified.length} modified, ${status.deleted.length} deleted`));
        console.log("");
      }
    } catch (error) {
      spinner.stop();
      console.log("");
      console.log(chalk10.red(`  \u274C Push failed: ${error.message}`));
      if (error.message?.includes("Authentication failed") || error.message?.includes("could not read Username")) {
        console.log(chalk10.gray("  Make sure your git credentials are configured."));
        console.log(chalk10.gray("  Run: git config --global credential.helper store"));
      }
      if (error.message?.includes("conflict") || error.message?.includes("rejected")) {
        console.log(chalk10.gray("  There may be remote changes. Try: git pull --rebase"));
      }
      console.log("");
    }
  });
}

// src/commands/byok.ts
import chalk11 from "chalk";
import ora5 from "ora";
import * as readline3 from "readline";
var VALID_PROVIDERS2 = ["google", "bedrock", "claude", "openai", "grok"];
function registerByokCommand(program2) {
  const byokCmd = program2.command("byok").description("Manage your Bring Your Own Key (BYOK) configuration");
  byokCmd.command("set <provider> <key>").description("Configure an API key for a provider").action(async (provider, key) => {
    const config = getConfig();
    if (!config.loggedIn || !config.authToken) {
      console.log("");
      console.log(chalk11.red("  \u274C Not logged in."));
      console.log(chalk11.gray("  Run `bob login` first."));
      console.log("");
      return;
    }
    if (!VALID_PROVIDERS2.includes(provider.toLowerCase())) {
      console.log("");
      console.log(chalk11.red(`  \u274C Invalid provider: "${provider}"`));
      console.log(chalk11.gray(`  Valid providers: ${VALID_PROVIDERS2.join(", ")}`));
      console.log("");
      return;
    }
    const spinner = ora5({
      text: chalk11.cyan("  Saving key..."),
      spinner: "dots"
    }).start();
    try {
      const result = await callCloudFunction("updateBYOKFromCLI", {
        action: "set",
        provider: provider.toLowerCase(),
        apiKey: key
      });
      spinner.stop();
      console.log("");
      console.log(chalk11.green(`  \u2705 ${result.message}`));
      console.log(chalk11.gray(`  Provider: ${provider.toLowerCase()}`));
      console.log(chalk11.gray("  Key stored securely on the platform."));
      console.log("");
    } catch (error) {
      spinner.stop();
      if (error.message?.includes("ORG_USER_BLOCKED") || error.response?.data?.error?.message?.includes("ORG_USER_BLOCKED")) {
        console.log("");
        console.log(chalk11.yellow("  \u26A0\uFE0F  BYOK configuration for Organization accounts is managed by your admin."));
        console.log(chalk11.gray("  Contact your administrator to update keys from the Admin Dashboard:"));
        console.log(chalk11.cyan("  https://bobs-workshop.web.app/#/bobsadmindashboard"));
        console.log("");
      } else {
        console.log("");
        console.log(chalk11.red(`  \u274C ${error.message || "Failed to save key."}`));
        console.log("");
      }
    }
  });
  byokCmd.command("remove <provider>").description("Remove an API key for a provider").action(async (provider) => {
    const config = getConfig();
    if (!config.loggedIn || !config.authToken) {
      console.log("");
      console.log(chalk11.red("  \u274C Not logged in."));
      console.log(chalk11.gray("  Run `bob login` first."));
      console.log("");
      return;
    }
    if (!VALID_PROVIDERS2.includes(provider.toLowerCase())) {
      console.log("");
      console.log(chalk11.red(`  \u274C Invalid provider: "${provider}"`));
      console.log(chalk11.gray(`  Valid providers: ${VALID_PROVIDERS2.join(", ")}`));
      console.log("");
      return;
    }
    const rl = readline3.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve2) => {
      rl.question(chalk11.yellow(`  Remove ${provider} key? (y/n): `), resolve2);
    });
    rl.close();
    if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
      console.log(chalk11.gray("  Cancelled."));
      return;
    }
    const spinner = ora5({
      text: chalk11.cyan("  Removing key..."),
      spinner: "dots"
    }).start();
    try {
      const result = await callCloudFunction("updateBYOKFromCLI", {
        action: "remove",
        provider: provider.toLowerCase()
      });
      spinner.stop();
      console.log("");
      console.log(chalk11.green(`  \u2705 ${result.message}`));
      console.log("");
    } catch (error) {
      spinner.stop();
      if (error.message?.includes("ORG_USER_BLOCKED") || error.response?.data?.error?.message?.includes("ORG_USER_BLOCKED")) {
        console.log("");
        console.log(chalk11.yellow("  \u26A0\uFE0F  BYOK configuration for Organization accounts is managed by your admin."));
        console.log(chalk11.gray("  Contact your administrator to update keys from the Admin Dashboard:"));
        console.log(chalk11.cyan("  https://bobs-workshop.web.app/#/bobsadmindashboard"));
        console.log("");
      } else {
        console.log("");
        console.log(chalk11.red(`  \u274C ${error.message || "Failed to remove key."}`));
        console.log("");
      }
    }
  });
  byokCmd.command("status").description("Show which BYOK keys are configured").action(async () => {
    const config = getConfig();
    if (!config.loggedIn || !config.authToken) {
      console.log("");
      console.log(chalk11.red("  \u274C Not logged in."));
      console.log(chalk11.gray("  Run `bob login` first."));
      console.log("");
      return;
    }
    const spinner = ora5({
      text: chalk11.cyan("  Checking BYOK status..."),
      spinner: "dots"
    }).start();
    try {
      const result = await callCloudFunction("updateBYOKFromCLI", {
        action: "status"
      });
      spinner.stop();
      const keys = result.keys || [];
      console.log("");
      console.log(chalk11.bold("  \u{1F511} BYOK Status"));
      console.log(chalk11.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      if (keys.length === 0) {
        console.log(chalk11.gray("  No keys configured."));
        console.log(chalk11.gray("  Run `bob byok set <provider> <key>` to add one."));
      } else {
        for (const key of keys) {
          const statusIcon = key.isActive ? chalk11.green("\u25CF") : chalk11.red("\u25CB");
          const statusText = key.isActive ? chalk11.green("Active") : chalk11.red("Inactive");
          console.log(`  ${statusIcon} ${chalk11.cyan(key.provider.padEnd(12))} ${statusText}  (via ${key.source})`);
        }
      }
      console.log(chalk11.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      console.log("");
    } catch (error) {
      spinner.stop();
      if (error.message?.includes("ORG_USER_BLOCKED") || error.response?.data?.error?.message?.includes("ORG_USER_BLOCKED")) {
        console.log("");
        console.log(chalk11.yellow("  \u26A0\uFE0F  BYOK configuration for Organization accounts is managed by your admin."));
        console.log(chalk11.gray("  Contact your administrator to update keys from the Admin Dashboard:"));
        console.log(chalk11.cyan("  https://bobs-workshop.web.app/#/bobsadmindashboard"));
        console.log("");
      } else {
        console.log("");
        console.log(chalk11.red(`  \u274C ${error.message || "Failed to check status."}`));
        console.log("");
      }
    }
  });
}

// src/commands/conversations.ts
import chalk12 from "chalk";
import ora6 from "ora";
import * as readline4 from "readline";
function registerConversationsCommand(program2) {
  const convosCmd = program2.command("conversations").description("List, search, and join existing conversations").option("-p, --page <number>", "Page number", "1").option("-s, --search <query>", "Search conversations by title or content").action(async (options) => {
    const config = getConfig();
    if (!config.loggedIn || !config.authToken) {
      console.log("");
      console.log(chalk12.red("  \u274C Not logged in."));
      console.log(chalk12.gray("  Run `bob login` first."));
      console.log("");
      return;
    }
    const spinner = ora6({
      text: chalk12.cyan("  Loading conversations..."),
      spinner: "dots"
    }).start();
    try {
      const result = await callCloudFunction("listCLIConversations", {
        page: parseInt(options.page || "1"),
        limit: 10,
        search: options.search || null
      });
      spinner.stop();
      const conversations = result.conversations || [];
      if (conversations.length === 0) {
        console.log("");
        console.log(chalk12.yellow("  No conversations found."));
        if (options.search) {
          console.log(chalk12.gray(`  Search: "${options.search}"`));
        }
        console.log("");
        return;
      }
      console.log("");
      console.log(chalk12.bold("  \u{1F4AC} Your Conversations"));
      console.log(chalk12.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      if (options.search) {
        console.log(chalk12.gray(`  Search: "${options.search}" (${result.total} results)`));
        console.log("");
      }
      conversations.forEach((convo, index) => {
        const num = index + 1;
        const timeAgo = convo.lastUpdated ? getTimeAgo(convo.lastUpdated) : "unknown";
        const sourceIcon = convo.source === "cli" ? "\u2328\uFE0F" : "\u{1F310}";
        const projectIcon = convo.hasProject ? "\u{1F4C1}" : "  ";
        console.log(`  ${chalk12.cyan(String(num).padStart(2, " "))}. ${projectIcon} ${chalk12.white(convo.title)}`);
        console.log(chalk12.gray(`      ${sourceIcon} ${timeAgo} \xB7 ${convo.sender === "bob" ? "Bob" : "You"}: ${convo.lastMessage.slice(0, 60)}${convo.lastMessage.length > 60 ? "..." : ""}`));
        console.log("");
      });
      if (result.totalPages && result.totalPages > 1) {
        console.log(chalk12.gray(`  Page ${result.page}/${result.totalPages} (${result.total} total)`));
        if (result.page < result.totalPages) {
          console.log(chalk12.gray(`  Run: bob conversations --page ${result.page + 1}`));
        }
      }
      console.log(chalk12.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      console.log(chalk12.gray("  Join: bob conversations join"));
      console.log("");
    } catch (error) {
      spinner.stop();
      console.log("");
      console.log(chalk12.red(`  \u274C ${error.message}`));
      console.log("");
    }
  });
  convosCmd.command("join").description("Pick a conversation to continue").option("-s, --search <query>", "Search first").action(async (options) => {
    const config = getConfig();
    if (!config.loggedIn || !config.authToken) {
      console.log("");
      console.log(chalk12.red("  \u274C Not logged in."));
      console.log(chalk12.gray("  Run `bob login` first."));
      console.log("");
      return;
    }
    const spinner = ora6({
      text: chalk12.cyan("  Loading conversations..."),
      spinner: "dots"
    }).start();
    try {
      const result = await callCloudFunction("listCLIConversations", {
        page: 1,
        limit: 15,
        search: options.search || null
      });
      spinner.stop();
      const conversations = result.conversations || [];
      if (conversations.length === 0) {
        console.log("");
        console.log(chalk12.yellow("  No conversations found."));
        console.log("");
        return;
      }
      console.log("");
      console.log(chalk12.bold("  \u{1F4AC} Select a Conversation"));
      console.log(chalk12.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      console.log("");
      conversations.forEach((convo, index) => {
        const num = index + 1;
        const timeAgo = convo.lastUpdated ? getTimeAgo(convo.lastUpdated) : "unknown";
        const sourceIcon = convo.source === "cli" ? "\u2328\uFE0F" : "\u{1F310}";
        const projectIcon = convo.hasProject ? "\u{1F4C1}" : "  ";
        console.log(`  ${chalk12.cyan(String(num).padStart(2, " "))}. ${projectIcon} ${chalk12.white(convo.title)}`);
        console.log(chalk12.gray(`      ${sourceIcon} ${timeAgo}`));
      });
      console.log("");
      const rl = readline4.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise((resolve2) => {
        rl.question(chalk12.cyan("  Select (1-" + conversations.length + ") or 0 to cancel: "), resolve2);
      });
      rl.close();
      const selection = parseInt(answer.trim());
      if (isNaN(selection) || selection === 0) {
        console.log(chalk12.gray("  Cancelled."));
        console.log("");
        return;
      }
      if (selection < 1 || selection > conversations.length) {
        console.log(chalk12.red("  \u274C Invalid selection."));
        console.log("");
        return;
      }
      const selected = conversations[selection - 1];
      setConfigValue("conversationId", selected.id);
      console.log("");
      console.log(chalk12.green(`  \u2705 Joined: "${selected.title}"`));
      console.log(chalk12.gray(`  Session ID: ${selected.id}`));
      console.log(chalk12.gray("  Your next `bob chat` message will continue this conversation."));
      console.log("");
    } catch (error) {
      spinner.stop();
      console.log("");
      console.log(chalk12.red(`  \u274C ${error.message}`));
      console.log("");
    }
  });
}
function getTimeAgo(isoDate) {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 6e4);
  const diffHours = Math.floor(diffMs / 36e5);
  const diffDays = Math.floor(diffMs / 864e5);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// src/commands/fork.ts
import chalk14 from "chalk";

// src/ui/animations/fork-split.ts
import chalk13 from "chalk";
var FRAME_DELAY_MS = 350;
var FRAMES = [
  `
  \u{1F477} \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501 \u{1F374} \u2501\u2501\u256E
                                 \u2503
                                 \u2570\u2501\u2501
  `,
  `
       \u{1F477} \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501 \u{1F374} \u2501\u2501\u256E
                                  \u2503
                                  \u2570\u2501\u2501
  `,
  `
            \u{1F477} \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501 \u{1F374} \u2501\u2501\u256E
                                 \u2503
                                 \u2570\u2501\u2501
  `,
  `
                 \u{1F477} \u2501\u2501\u2501\u2501\u2501\u2501 \u{1F374} \u2501\u2501\u256E
                                \u2503
                                \u2570\u2501\u2501
  `,
  `
                      \u{1F477}  \u{1F374} \u2501\u2501\u2501\u256E
                                \u2503
                                \u2570\u2501\u2501
  `,
  `
                         \u{1F477}\u{1F374}
                          \u2571 \u2572
                         \u2571   \u2572
  `,
  `
                         \u{1F374}
                        \u2571   \u2572
                       \u2571     \u2572
                      \u2502       \u2502
                      \u25BC       \u25BC
  `
];
var FRAME_HEIGHT2 = 6;
function startForkAnimation(parentTitle, forkTitle) {
  let running = true;
  for (let i = 0; i < FRAME_HEIGHT2 + 2; i++) {
    console.log("");
  }
  const run = async () => {
    for (const frame of FRAMES) {
      if (!running) return;
      renderFrame2(frame);
      await sleep3(FRAME_DELAY_MS);
    }
    let toggle = false;
    while (running) {
      if (!running) return;
      renderFrame2(FRAMES[toggle ? FRAMES.length - 1 : FRAMES.length - 2]);
      toggle = !toggle;
      await sleep3(600);
    }
  };
  run();
  return {
    stop: () => {
      running = false;
      setTimeout(() => {
        renderFinalFrame(parentTitle, forkTitle);
      }, 100);
    }
  };
}
function renderFrame2(frame) {
  const totalHeight = FRAME_HEIGHT2 + 2;
  process.stdout.write(`\x1B[${totalHeight}A`);
  for (let i = 0; i < totalHeight; i++) {
    process.stdout.write("\x1B[2K\n");
  }
  process.stdout.write(`\x1B[${totalHeight}A`);
  const lines = frame.split("\n").filter((l) => l.length > 0);
  for (const line of lines) {
    console.log(line);
  }
  for (let i = lines.length; i < FRAME_HEIGHT2; i++) {
    console.log("");
  }
  console.log(chalk13.magenta("  \u26A1 Fork initializing..."));
  console.log("");
}
function renderFinalFrame(parentTitle, forkTitle) {
  const totalHeight = FRAME_HEIGHT2 + 2;
  process.stdout.write(`\x1B[${totalHeight}A`);
  for (let i = 0; i < totalHeight; i++) {
    process.stdout.write("\x1B[2K\n");
  }
  process.stdout.write(`\x1B[${totalHeight}A`);
  console.log(chalk13.gray("                         \u{1F374}"));
  console.log(chalk13.gray("                        \u2571   \u2572"));
  console.log(`             ${chalk13.green("\u25CB")} ${chalk13.gray(truncate(parentTitle, 18))}   ${chalk13.magenta("\u26A1")} ${chalk13.bold(truncate(forkTitle, 18))}`);
  console.log(chalk13.gray("                       \u2571       \u2572"));
  console.log(chalk13.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(chalk13.green("  \u2705 Fork created!"));
  console.log("");
  console.log("");
}
function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}
function sleep3(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}

// src/commands/fork.ts
function registerForkCommand(program2) {
  program2.command("fork <title>").description("Fork the current conversation into a focused sub-project").action(async (title) => {
    const config = getConfig();
    if (!config.loggedIn || !config.authToken) {
      console.log("");
      console.log(chalk14.red("  \u274C Not logged in. Forks require Tier 3 (platform)."));
      console.log(chalk14.gray("  Run `bob login` to authenticate."));
      console.log("");
      return;
    }
    if (!config.conversationId) {
      console.log("");
      console.log(chalk14.red("  \u274C No active conversation to fork from."));
      console.log(chalk14.gray("  Start a conversation first with `bob chat`, or join one with `bob conversations join`."));
      console.log("");
      return;
    }
    const parentConvoId = config.conversationId;
    console.log("");
    console.log(chalk14.bold.magenta(`  \u26A1 Forking: "${title}"`));
    console.log(chalk14.gray(`  From: ${parentConvoId.slice(0, 24)}...`));
    console.log("");
    const forkPromise = callCloudFunction("createConversationFork", {
      parentConversationId: parentConvoId,
      forkTitle: title,
      userEmail: config.email,
      userId: config.uid
    });
    const animation = startForkAnimation("Parent", title);
    try {
      const result = await forkPromise;
      animation.stop();
      await new Promise((resolve2) => setTimeout(resolve2, 200));
      if (result?.conversationId) {
        setConfigValue("conversationId", result.conversationId);
        console.log("");
        console.log(chalk14.green(`  \u2705 Fork created: "${title}"`));
        console.log(chalk14.gray(`  Session: ${result.conversationId.slice(0, 24)}...`));
        console.log(chalk14.gray("  Your next `bob chat` message continues in this fork."));
        console.log(chalk14.gray(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${result.conversationId}`));
        console.log("");
        if (result.kickstartMessage) {
          console.log(chalk14.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
          console.log(chalk14.bold.cyan("  \u{1F916} Bob:"));
          console.log("");
          for (const line of result.kickstartMessage.split("\n")) {
            console.log(`  ${line}`);
          }
          console.log("");
          console.log(chalk14.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
          console.log("");
        }
        if (result.keyPoints && result.keyPoints.length > 0) {
          console.log(chalk14.gray("  \u{1F4CB} Context carried forward:"));
          for (const point of result.keyPoints.slice(0, 4)) {
            console.log(chalk14.gray(`    \u2022 ${point}`));
          }
          console.log("");
        }
      } else {
        console.log("");
        console.log(chalk14.red("  \u274C Fork failed \u2014 no conversation ID returned."));
        console.log("");
      }
    } catch (error) {
      animation.stop();
      await new Promise((resolve2) => setTimeout(resolve2, 200));
      console.log("");
      console.log(chalk14.red(`  \u274C Fork failed: ${error.message}`));
      console.log("");
    }
  });
  program2.command("forks").description("List all forks of the current conversation").action(async () => {
    const config = getConfig();
    if (!config.loggedIn || !config.authToken) {
      console.log("");
      console.log(chalk14.red("  \u274C Not logged in."));
      console.log("");
      return;
    }
    if (!config.conversationId) {
      console.log("");
      console.log(chalk14.red("  \u274C No active conversation."));
      console.log("");
      return;
    }
    console.log("");
    console.log(chalk14.bold.magenta("  \u{1F500} Loading forks..."));
    try {
      const result = await callCloudFunction("listConversationForks", {
        conversationId: config.conversationId
      });
      const forks = result.forks || [];
      console.log("");
      console.log(chalk14.bold.magenta("  \u{1F500} Forks"));
      console.log(chalk14.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      if (forks.length === 0) {
        console.log(chalk14.gray("  No forks yet."));
        console.log(chalk14.gray('  Run `bob fork "title"` to create one.'));
      } else {
        for (const fork of forks) {
          console.log(`  ${chalk14.magenta("\u26A1")} ${chalk14.white(fork.title || "Untitled")}`);
          console.log(chalk14.gray(`    ${fork.summary?.slice(0, 60) || "No summary"}${fork.summary?.length > 60 ? "..." : ""}`));
          console.log(chalk14.gray(`    ID: ${fork.forkConversationId?.slice(0, 24) || fork.id.slice(0, 24)}...`));
          console.log("");
        }
      }
      console.log(chalk14.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      console.log(chalk14.gray("  Join a fork: bob conversations join \u2192 select it"));
      console.log("");
    } catch (error) {
      console.log("");
      console.log(chalk14.red(`  \u274C ${error.message}`));
      console.log("");
    }
  });
}

// src/commands/analyse.ts
import chalk15 from "chalk";
import ora7 from "ora";
import * as fs6 from "fs";
import * as path7 from "path";
var RED = chalk15.hex("#EF5350");
var PURPLE = chalk15.hex("#AB47BC");
var BLUE2 = chalk15.hex("#42A5F5");
var TEAL = chalk15.hex("#26A69A");
var AMBER3 = chalk15.hex("#FFAB00");
var GRAY = chalk15.gray;
var BORDER2 = chalk15.hex("#455A64");
var BG_RED = chalk15.bgHex("#2D1111");
var BG_PURPLE = chalk15.bgHex("#1A0D2B");
var BG_BLUE = chalk15.bgHex("#0D1B2A");
var BG_TEAL = chalk15.bgHex("#0D2420");
function registerAnalyseCommand(program2) {
  program2.command("analyse").description("Analyse the current project for bugs, features, improvements, and upgrades").option("--results", "Show analysis dashboard or filtered list").option("--bugs", "Show bugs list (interactive)").option("--features", "Show features list (interactive)").option("--improvements", "Show improvements list (interactive)").option("--upgrades", "Show upgrades list (interactive)").option("--sort <method>", "Sort by: priority (default) or file").option("--search <query>", "Filter results by keyword").option("--status", "Show current analysis job status").option("--auto", "Auto-fix mode: Bob triages and MiniBob implements").option("--confidence <number>", "Confidence gate for auto-fix (default: 90)", "90").option("--priority <level>", "Priority gate for auto-fix: critical, high, medium, low (default: critical)", "critical").action(async (options) => {
    const config = getConfig();
    if (options.auto) {
      const { runAutoFix } = await import("./analyse-auto-OBCDWYWX.js");
      const category = options.bugs ? "bugs" : options.features ? "features" : options.improvements ? "improvements" : options.upgrades ? "upgrades" : void 0;
      await runAutoFix({
        category,
        confidence: parseInt(options.confidence || "90"),
        priority: options.priority || "critical"
      });
      return;
    }
    if (options.bugs || options.features || options.improvements || options.upgrades) {
      const { showInteractiveResults } = await import("./analyse-results-QSOD3KVC.js");
      const category = options.bugs ? "bugs" : options.features ? "features" : options.improvements ? "improvements" : "upgrades";
      await showInteractiveResults(config, category, options.sort, options.search);
      return;
    }
    if (options.results) {
      await showDashboard(config);
      return;
    }
    if (options.status) {
      await showStatus(config);
      return;
    }
    await runAnalysis(config);
  });
}
async function showDashboard(config) {
  const spinner = ora7({ text: chalk15.cyan("  Loading analysis results..."), spinner: "dots" }).start();
  try {
    let counts;
    if (config.tier === "platform" && config.provider !== "local" && config.loggedIn && config.conversationId) {
      const result = await callCloudFunction("getCLIAnalysisResults", {
        conversationId: config.conversationId,
        category: "all"
      });
      counts = result?.counts;
    } else {
      counts = loadLocalCounts();
    }
    spinner.stop();
    if (!counts) {
      console.log("");
      console.log(chalk15.yellow("  \u26A0\uFE0F  No analysis results found."));
      console.log(GRAY("  Run `bob analyse` first to analyse your project."));
      console.log("");
      return;
    }
    renderDashboard(counts);
  } catch (error) {
    spinner.stop();
    console.log(chalk15.red(`  \u274C ${error.message}`));
    console.log("");
  }
}
function renderDashboard(counts) {
  const total = counts.bugs + counts.features + counts.improvements + counts.upgrades;
  console.log("");
  console.log(BORDER2("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2566\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2566\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2566\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(BORDER2("  \u2551") + AMBER3(" \u25C6 MINIBOB ANALYSIS COMPLETE") + GRAY(`  ${total} pts`) + BORDER2("       \u2551"));
  console.log(BORDER2("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256C\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256C\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256C\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER2("  \u2551") + BG_RED("              ") + BORDER2("\u2551") + BG_PURPLE("              ") + BORDER2("\u2551") + BG_BLUE("              ") + BORDER2("\u2551") + BG_TEAL("              ") + BORDER2("\u2551"));
  console.log(BORDER2("  \u2551") + BG_RED(`  ${RED("\u{1F534} BUGS")}    `) + BORDER2("\u2551") + BG_PURPLE(`  ${PURPLE("\u{1F7E3} FEAT")}    `) + BORDER2("\u2551") + BG_BLUE(`  ${BLUE2("\u{1F535} OPTZ")}    `) + BORDER2("\u2551") + BG_TEAL(`  ${TEAL("\u{1F7E2} UPGR")}    `) + BORDER2("\u2551"));
  const bugsStr = String(counts.bugs).padStart(4);
  const featStr = String(counts.features).padStart(4);
  const imprStr = String(counts.improvements).padStart(4);
  const upgrStr = String(counts.upgrades).padStart(4);
  console.log(BORDER2("  \u2551") + BG_RED(`     ${RED(bugsStr)}     `) + BORDER2("\u2551") + BG_PURPLE(`     ${PURPLE(featStr)}     `) + BORDER2("\u2551") + BG_BLUE(`     ${BLUE2(imprStr)}     `) + BORDER2("\u2551") + BG_TEAL(`     ${TEAL(upgrStr)}     `) + BORDER2("\u2551"));
  console.log(BORDER2("  \u2551") + BG_RED("              ") + BORDER2("\u2551") + BG_PURPLE("              ") + BORDER2("\u2551") + BG_BLUE("              ") + BORDER2("\u2551") + BG_TEAL("              ") + BORDER2("\u2551"));
  console.log(BORDER2("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2569\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2569\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2569\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER2("  \u2551") + chalk15.white(`        ${total} POINTS IDENTIFIED`) + BORDER2("                        \u2551"));
  console.log(BORDER2("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  console.log(GRAY("  View details (interactive):"));
  console.log(GRAY("    bob analyse --results --bugs"));
  console.log(GRAY("    bob analyse --results --features"));
  console.log(GRAY("    bob analyse --results --improvements"));
  console.log(GRAY("    bob analyse --results --upgrades"));
  console.log("");
  console.log(GRAY("  Auto-fix:"));
  console.log(GRAY("    bob analyse --auto"));
  console.log(GRAY("    bob analyse --auto --bugs --confidence 80"));
  console.log(GRAY("    bob analyse --auto --priority high"));
  console.log("");
}
async function showStatus(config) {
  if (!config.loggedIn || !config.authToken || !config.conversationId) {
    console.log("");
    console.log(chalk15.yellow("  \u26A0\uFE0F  Status check requires Tier 3 with an active conversation."));
    console.log("");
    return;
  }
  const spinner = ora7({ text: chalk15.cyan("  Checking analysis status..."), spinner: "dots" }).start();
  try {
    const result = await callCloudFunction("getCLIAnalysisResults", {
      conversationId: config.conversationId,
      action: "status"
    });
    spinner.stop();
    if (result?.status) {
      console.log("");
      console.log(AMBER3(`  \u25C6 Analysis Status: ${result.status.toUpperCase()}`));
      if (result.progress) {
        const pct = Math.round(result.progress.completed / result.progress.total * 100);
        const barLen = 30;
        const filled = Math.round(pct / 100 * barLen);
        let barColor;
        if (pct < 25) barColor = chalk15.red;
        else if (pct < 50) barColor = chalk15.hex("#FF8C00");
        else if (pct < 75) barColor = chalk15.yellow;
        else barColor = chalk15.green;
        const bar = barColor("\u2588".repeat(filled)) + GRAY("\u2591".repeat(barLen - filled));
        console.log(`  [${bar}] ${result.progress.completed}/${result.progress.total} (${pct}%)`);
      }
      console.log("");
    } else {
      console.log("");
      console.log(GRAY("  No active analysis job found."));
      console.log("");
    }
  } catch (error) {
    spinner.stop();
    console.log(chalk15.red(`  \u274C ${error.message}`));
    console.log("");
  }
}
async function runAnalysis(config) {
  const cwd = process.cwd();
  const projectName = getProjectName(cwd);
  console.log("");
  console.log(chalk15.bold.cyan(`  \u26A1 Analysing project: ${projectName}`));
  console.log(GRAY(`  \u{1F4C1} ${cwd}`));
  console.log(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  if (config.tier === "platform" && config.provider !== "local" && config.loggedIn && config.conversationId) {
    const spinner = ora7({ text: chalk15.cyan("  Triggering platform analysis..."), spinner: "dots" }).start();
    try {
      const result = await callCloudFunction("analyzeProjectWorkspace", {
        conversationId: config.conversationId
      });
      spinner.stop();
      if (result?.success) {
        console.log(chalk15.green(`  \u2705 Analysis job created: ${result.jobId}`));
        console.log(GRAY("  Run `bob analyse --status` to check progress."));
        console.log(GRAY("  Run `bob analyse --results` when complete."));
      } else {
        console.log(chalk15.red(`  \u274C ${result?.message || "Failed to start analysis."}`));
      }
      console.log("");
    } catch (error) {
      spinner.stop();
      console.log(chalk15.red(`  \u274C ${error.message}`));
      console.log("");
    }
    return;
  }
  if (config.provider !== "local" || !config.localEndpoint) {
    console.log(chalk15.red("  \u274C Local analysis requires a local model."));
    console.log(GRAY("  Run `bob config set provider local`"));
    console.log(GRAY("  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`"));
    console.log("");
    return;
  }
  const summaries = loadSummaries(cwd);
  if (!summaries || Object.keys(summaries).length === 0) {
    console.log(chalk15.yellow("  \u26A0\uFE0F  Project not indexed. Run `bob index` first."));
    console.log("");
    return;
  }
  const dependencies = loadDependencies(cwd) || {};
  const files = Object.keys(summaries);
  console.log(GRAY(`  Found ${files.length} indexed files. Starting deep analysis...`));
  console.log("");
  console.log("");
  console.log("");
  console.log("");
  const { analysisDir } = ensureProjectStructure(cwd);
  const resultsDir = path7.join(analysisDir, "results");
  if (!fs6.existsSync(resultsDir)) fs6.mkdirSync(resultsDir, { recursive: true });
  let completed = 0;
  const allResults = {};
  for (const filePath of files) {
    const absolutePath = path7.join(cwd, filePath);
    let content;
    try {
      content = fs6.readFileSync(absolutePath, "utf-8");
    } catch (error) {
      console.error(chalk15.red(`  \u274C Could not read file ${filePath}: ${error.message}`));
      completed++;
      continue;
    }
    if (content.length > 3e4) {
      completed++;
      printProgress2(completed, files.length, filePath, "(skipped \u2014 too large)");
      continue;
    }
    const fileDeps = dependencies[filePath] || [];
    let depContext = "";
    if (fileDeps.length > 0) {
      depContext = `
RELATED FILES:
${fileDeps.map((d) => `- ${d}: ${summaries[d] || "unknown"}`).join("\n")}
`;
    }
    const analysisPrompt = `You are the Lead QA Engineer on this project. Your job is to perform a thorough, production-grade code review.

    For each issue you find, you MUST provide:
    - A CLEAR, SPECIFIC title (not generic \u2014 name the exact problem)
    - A DETAILED description explaining WHY this is a problem and WHAT the impact is
    - A SPECIFIC implementation instruction \u2014 exact steps to fix it, referencing actual function/variable names from the code
    - An honest priority based on real-world impact

    PRIORITY DEFINITIONS:
    - critical: Will cause crashes, data loss, security vulnerabilities, or breaks core functionality
    - high: Causes bugs in normal usage, performance degradation, or makes code unmaintainable
    - medium: Code smell, minor inefficiency, or could cause issues under edge cases
    - low: Style improvements, minor optimizations, or nice-to-haves

    CONFIDENCE RUBRIC (you will use this later during triage):
    Your confidence should reflect: "How certain am I that implementing this fix will NOT break anything AND will ACTUALLY contribute positively to the project?"
    - 95-100%: Fix is 1-5 lines, explicit, zero side effects, purely additive
    - 85-94%: Clear fix, well-scoped, minimal risk, touches isolated logic
    - 75-84%: Good fix but touches shared logic or has minor behavioral implications
    - <75%: Requires judgment, structural changes, or has unpredictable side effects

    DO NOT include vague suggestions like "improve error handling" without specifying EXACTLY what to change.
    DO NOT include items without clear implementation steps.
    Every suggestion must be actionable by a junior engineer reading only your instructions.

    Respond with ONLY a JSON object:
    {
      "bugs": [{"title": "Specific bug name", "description": "Detailed explanation of the problem and its impact", "priority": "critical|high|medium|low", "implementation": "Exact steps: 1. In function X, change Y to Z. 2. Add error check for..."}],
      "features": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}],
      "improvements": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}],
      "upgrades": [{"title": "...", "description": "...", "priority": "...", "implementation": "..."}]
    }

    Be thorough but practical. Quality over quantity. Only list GENUINE issues with REAL impact.
    ${depContext}
    FILE: ${filePath}
    ${content}`;
    try {
      const messages = [
        { role: "system", content: "You are the Lead QA Engineer. Respond with ONLY valid JSON. Every suggestion must have a specific title, detailed description, and actionable implementation steps. No vague or generic items. Quality over quantity." },
        { role: "user", content: analysisPrompt }
      ];
      const response = await callLocalModel(config.localEndpoint, messages);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const cat of ["bugs", "features", "improvements", "upgrades"]) {
          if (parsed[cat]) {
            parsed[cat] = parsed[cat].map((item) => ({ ...item, filePath }));
          }
        }
        allResults[filePath] = parsed;
        const counts = `${parsed.bugs?.length || 0}B ${parsed.features?.length || 0}F ${parsed.improvements?.length || 0}I ${parsed.upgrades?.length || 0}U`;
        printProgress2(completed + 1, files.length, filePath, counts);
      } else {
        printProgress2(completed + 1, files.length, filePath, "(no results)");
      }
    } catch {
      printProgress2(completed + 1, files.length, filePath, "(error)");
    }
    completed++;
  }
  fs6.writeFileSync(path7.join(resultsDir, "analysis.json"), JSON.stringify(allResults, null, 2));
  let totalBugs = 0, totalFeatures = 0, totalImprovements = 0, totalUpgrades = 0;
  for (const fileResults of Object.values(allResults)) {
    const r = fileResults;
    totalBugs += r.bugs?.length || 0;
    totalFeatures += r.features?.length || 0;
    totalImprovements += r.improvements?.length || 0;
    totalUpgrades += r.upgrades?.length || 0;
  }
  fs6.writeFileSync(path7.join(resultsDir, "counts.json"), JSON.stringify({
    bugs: totalBugs,
    features: totalFeatures,
    improvements: totalImprovements,
    upgrades: totalUpgrades
  }, null, 2));
  console.log("");
  console.log("");
  console.log(chalk15.bold.green(`  \u2705 Analysis complete: ${projectName}`));
  console.log(GRAY(`  \u{1F4BE} Saved to: ~/.bob/projects/${projectName}/analysis/results/`));
  console.log(GRAY("  Run `bob analyse --results` to view the dashboard."));
  console.log(GRAY("  Run `bob analyse --auto` for auto-fix mode."));
  console.log("");
}
function loadLocalCounts() {
  const cwd = process.cwd();
  const { analysisDir } = ensureProjectStructure(cwd);
  const countsPath = path7.join(analysisDir, "results", "counts.json");
  if (!fs6.existsSync(countsPath)) return null;
  return JSON.parse(fs6.readFileSync(countsPath, "utf-8"));
}
function printProgress2(completed, total, filePath, info) {
  const percent = completed / total;
  const barLength = 30;
  const filled = Math.round(percent * barLength);
  let barColor;
  if (percent < 0.25) barColor = chalk15.red;
  else if (percent < 0.5) barColor = chalk15.hex("#FF8C00");
  else if (percent < 0.75) barColor = chalk15.yellow;
  else barColor = chalk15.green;
  const filledBar = barColor("\u2588".repeat(filled));
  const emptyBar = GRAY("\u2591".repeat(barLength - filled));
  const percentText = barColor(`${Math.round(percent * 100)}%`);
  process.stdout.write("\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\r");
  console.log(`  ${chalk15.cyan("\u26A1")} Analysing [${filledBar}${emptyBar}] ${completed}/${total} ${percentText}`);
  console.log(chalk15.green(`  \u2705 ${filePath}`));
  console.log(GRAY(`     ${info}`));
  console.log("");
}

// src/commands/autonomy.ts
import chalk16 from "chalk";
import ora8 from "ora";
import * as readline5 from "readline";
import simpleGit2 from "simple-git";
import * as fs7 from "fs";
import * as path8 from "path";
var RED2 = chalk16.hex("#EF5350");
var GREEN3 = chalk16.hex("#66BB6A");
var AMBER4 = chalk16.hex("#FFAB00");
var BLUE3 = chalk16.hex("#42A5F5");
var GRAY2 = chalk16.gray;
var BORDER3 = chalk16.hex("#455A64");
var CYAN = chalk16.cyan;
function registerAutonomyCommand(program2) {
  program2.command("autonomy").description("Launch autonomous repair mode \u2014 MiniBob fixes all analysed issues").option("--status", "Check current autonomy run progress (Tier 3)").option("--stop", "Stop the current autonomy run (Tier 3)").option("--category <cat>", "Limit to: bugs, features, improvements, upgrades").option("--priority <level>", "Minimum priority: critical, high, medium, low (default: high)", "high").option("--no-push", "Skip git push after completion").action(async (options) => {
    const config = getConfig();
    if (options.status) {
      await showAutonomyStatus(config);
      return;
    }
    if (options.stop) {
      console.log(chalk16.yellow("  \u26A0\uFE0F  Stop command not yet implemented for Tier 3."));
      return;
    }
    if (config.tier === "platform" && config.provider !== "local" && config.loggedIn && config.conversationId) {
      await runTier3Autonomy(config);
    } else {
      await runTier1Autonomy(config, options);
    }
  });
}
async function runTier3Autonomy(config) {
  console.log("");
  console.log(chalk16.bold.cyan("  \u26A1 MiniBob Autonomy Mode (Platform)"));
  console.log(GRAY2("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(GRAY2(`  \u{1F4E1} Conversation: ${config.conversationId?.slice(0, 24)}...`));
  console.log(GRAY2(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${config.conversationId}`));
  console.log(GRAY2("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  const spinner = ora8({ text: CYAN("  Igniting autonomy workers..."), spinner: "dots" }).start();
  try {
    const result = await callCloudFunction("startMiniBobAutonomy", {
      conversationId: config.conversationId,
      proxyEmail: null
    });
    spinner.stop();
    if (!result?.success) {
      console.log(RED2(`  \u274C ${result?.message || "Failed to start autonomy."}`));
      return;
    }
    console.log(GREEN3("  \u2705 Autonomy loop ignited!"));
    console.log(GRAY2("  Streaming progress..."));
    console.log("");
  } catch (error) {
    spinner.stop();
    console.log(RED2(`  \u274C ${error.message}`));
    return;
  }
  let lastTimestamp = (/* @__PURE__ */ new Date()).toISOString();
  let running = true;
  let tasksDone = 0;
  let totalTasks = 0;
  console.log(GRAY2("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(GRAY2("  Press Ctrl+C to stop streaming (workers continue in background)"));
  console.log(GRAY2("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  process.on("SIGINT", () => {
    running = false;
    console.log("");
    console.log(GRAY2("  \u{1F4E1} Stopped streaming. Workers continue in the background."));
    console.log(GRAY2(`  Check progress: bob autonomy --status`));
    console.log("");
    process.exit(0);
  });
  while (running) {
    try {
      const updates = await callCloudFunction("getCLITerminalUpdates", {
        conversationId: config.conversationId,
        since: lastTimestamp
      });
      if (updates?.lines && updates.lines.length > 0) {
        for (const line of updates.lines) {
          const text = line.text || "";
          const type = line.type || "system";
          if (text.includes("[ACTION:AUTONOMY_TICKER:")) {
            const parts = text.match(/\[ACTION:AUTONOMY_TICKER:(\d+):(\d+):(\d+):(\d+):(\d+):(\d+):(\d+)\]/);
            if (parts) {
              const bugs = parseInt(parts[2]);
              const features = parseInt(parts[3]);
              const improvements = parseInt(parts[4]);
              const upgrades = parseInt(parts[5]);
              const tokens = parseInt(parts[6]);
              totalTasks = parseInt(parts[7]);
              tasksDone = bugs + features + improvements + upgrades;
              renderTickerHUD(tasksDone, totalTasks, bugs, features, improvements, upgrades, tokens);
            }
            continue;
          }
          if (text.includes("[ACTION:GITHUB_PUSH_REQUEST:")) {
            console.log("");
            console.log(GREEN3("  \u2705 All tasks complete!"));
            console.log(AMBER4("  \u{1F4E4} MiniBob wants to push to GitHub."));
            const rl = readline5.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise((resolve2) => {
              rl.question(CYAN("  Approve push? (y/n): "), resolve2);
            });
            rl.close();
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
              try {
                await callCloudFunction("commitAndPushChanges", { conversationId: config.conversationId });
                console.log(GREEN3("  \u2705 Pushed to GitHub!"));
              } catch (pushErr) {
                console.log(RED2(`  \u274C Push failed: ${pushErr.message}`));
              }
            } else {
              console.log(GRAY2("  Push skipped. You can push manually later."));
            }
            running = false;
            continue;
          }
          if (text.includes("ALL TASKS COMPLETE")) {
            running = false;
          }
          let lineColor;
          if (type === "stderr") lineColor = RED2;
          else if (type === "stdout") lineColor = GREEN3;
          else lineColor = GRAY2;
          console.log(lineColor(`  ${text}`));
          lastTimestamp = line.timestamp || lastTimestamp;
        }
      }
    } catch (pollError) {
    }
    if (running) {
      await new Promise((resolve2) => setTimeout(resolve2, 2500));
    }
  }
  console.log("");
  console.log(BORDER3("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(BORDER3("  \u2551") + AMBER4(" \u25C6 AUTONOMY SESSION COMPLETE"));
  console.log(BORDER3("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER3("  \u2551") + GREEN3(`  \u2705 Tasks completed: ${tasksDone}/${totalTasks}`));
  console.log(BORDER3("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
}
async function runTier1Autonomy(config, options) {
  if (config.provider !== "local" || !config.localEndpoint) {
    console.log(RED2("  \u274C Local autonomy requires a local model."));
    console.log(GRAY2("  Run `bob config set provider local`"));
    console.log(GRAY2("  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`"));
    return;
  }
  const categories = options.category ? [options.category] : ["bugs", "features", "improvements", "upgrades"];
  const priorityGate = options.priority || "high";
  const shouldPush = options.push !== false;
  console.log("");
  console.log(chalk16.bold.cyan("  \u26A1 MiniBob Autonomy Mode (Local)"));
  console.log(GRAY2("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(GRAY2(`  Priority gate: ${priorityGate}+`));
  console.log(GRAY2(`  Categories: ${categories.join(", ")}`));
  console.log(GRAY2(`  Git push: ${shouldPush ? "enabled" : "disabled"}`));
  console.log(GRAY2("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
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
    console.log(GREEN3("  \u2705 No pending tasks. Project is clean!"));
    return;
  }
  console.log(GRAY2(`  Found ${allSuggestions.length} tasks to process.`));
  console.log("");
  const workQueue = allSuggestions.map((s) => ({
    suggestion: s,
    status: "pending"
  }));
  renderLocalTodoList(workQueue);
  let fixed = 0;
  let failed = 0;
  const fixedFiles = [];
  for (let i = 0; i < workQueue.length; i++) {
    const task = workQueue[i];
    task.status = "working";
    renderLocalTodoList(workQueue);
    const success = await implementLocalTask(task.suggestion, config.localEndpoint);
    task.status = success ? "done" : "failed";
    if (success) {
      fixed++;
      fixedFiles.push(task.suggestion.filePath);
      const suggestionIndex = parseInt(task.suggestion.id?.split("_").pop() || "0");
      const category = detectLocalCategory(task.suggestion);
      markSuggestionStatus(task.suggestion.filePath, suggestionIndex, category, "implemented", {
        confidence: 100,
        reason: "MiniBob autonomy",
        implementedBy: "minibob-local-autonomy"
      });
    } else {
      failed++;
    }
    renderLocalTodoList(workQueue);
  }
  console.log("");
  console.log("");
  console.log(BORDER3("  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(BORDER3("  \u2551") + AMBER4(" \u25C6 MINIBOB AUTONOMY REPORT"));
  console.log(BORDER3("  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(BORDER3("  \u2551") + GREEN3(`  \u2705 Fixed: ${fixed} files`));
  if (failed > 0) {
    console.log(BORDER3("  \u2551") + RED2(`  \u274C Failed: ${failed} files`));
  }
  console.log(BORDER3("  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  console.log("");
  if (shouldPush && fixed > 0) {
    const git = simpleGit2(process.cwd());
    const isRepo = await git.checkIsRepo();
    if (isRepo) {
      console.log(CYAN("  \u{1F4E4} Committing and pushing to git..."));
      try {
        await git.add(".");
        const commitMessage = `MiniBob Autonomy: Fixed ${fixed} issue(s)

Files modified:
${fixedFiles.map((f) => `- ${f}`).join("\n")}

Autonomous repair by Bob's CLI.`;
        await git.commit(commitMessage);
        const branch = (await git.branchLocal()).current;
        try {
          await git.push("origin", branch);
        } catch (pushErr) {
          if (pushErr.message?.includes("no upstream")) {
            await git.push(["--set-upstream", "origin", branch]);
          } else {
            throw pushErr;
          }
        }
        console.log(GREEN3(`  \u2705 Pushed to ${branch}!`));
        console.log(GRAY2(`  Commit: MiniBob Autonomy: Fixed ${fixed} issue(s)`));
      } catch (gitErr) {
        console.log(RED2(`  \u274C Git push failed: ${gitErr.message}`));
        console.log(GRAY2('  Files are saved locally. Push manually with `bob push "message"`.'));
      }
    } else {
      console.log(GRAY2("  Not a git repo. Files saved locally only."));
    }
  }
  console.log("");
  console.log(GRAY2("  \u{1F4E6} All original files backed up to .bob-backups/"));
  console.log("");
}
async function showAutonomyStatus(config) {
  if (!config.loggedIn || !config.conversationId) {
    console.log(chalk16.yellow("  \u26A0\uFE0F  Status requires Tier 3 with an active conversation."));
    return;
  }
  const spinner = ora8({ text: CYAN("  Checking autonomy status..."), spinner: "dots" }).start();
  try {
    const result = await callCloudFunction("getCLITerminalUpdates", {
      conversationId: config.conversationId,
      since: new Date(Date.now() - 6e4).toISOString(),
      // Last 60 seconds
      limit: 5
    });
    spinner.stop();
    if (result?.lines && result.lines.length > 0) {
      console.log("");
      console.log(AMBER4("  \u25C6 Recent Autonomy Activity:"));
      console.log(GRAY2("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      for (const line of result.lines) {
        console.log(GRAY2(`  ${line.text}`));
      }
      console.log("");
    } else {
      console.log("");
      console.log(GRAY2("  No recent autonomy activity."));
      console.log("");
    }
  } catch (error) {
    spinner.stop();
    console.log(RED2(`  \u274C ${error.message}`));
  }
}
async function implementLocalTask(suggestion, endpoint) {
  const fileContent = readFileContent(suggestion.filePath);
  if (!fileContent) return false;
  const prompt = `You are MiniBob \u2014 a junior engineer making SURGICAL code fixes under strict supervision.

CURRENT FILE: ${suggestion.filePath}
${fileContent}

CHANGE TO IMPLEMENT:
Title: ${suggestion.title || "Fix"}
Description: ${suggestion.description}
Implementation Instructions: ${suggestion.implementation || "Apply the fix described above."}

RULES (CRITICAL \u2014 VIOLATION = REJECTED):
- Return ONLY valid source code. No markdown, no code fences, no \`\`\`, no explanation text.
- Start the FIRST line with: // File: ${suggestion.filePath}
- PRESERVE ALL existing imports exactly as they are.
- PRESERVE ALL existing exports exactly as they are.
- PRESERVE existing code structure, indentation, patterns, naming conventions.
- Make the MINIMUM change necessary. Touch NOTHING else.
- Do NOT refactor, reorganize, or "improve" unrelated code.
- Do NOT add comments explaining what you changed.
- If unsure, return the file UNCHANGED.

Return the complete file content now:`;
  try {
    const messages = [
      { role: "system", content: "You are MiniBob making SURGICAL fixes. Return ONLY valid source code. NO markdown. NO code fences. Start with // File: comment. MINIMUM change only." },
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
    if (newContent.includes("```") || newContent.includes("## ") || newContent.startsWith("Here") || newContent.startsWith("I have") || newContent.startsWith("Sure")) {
      return false;
    }
    if (newContent.length < fileContent.length * 0.5) {
      return false;
    }
    const originalExports = fileContent.match(/export\s+(function|class|const|interface|type|async\s+function)\s+\w+/g) || [];
    for (const exp of originalExports) {
      const exportName = exp.split(/\s+/).pop();
      if (!newContent.includes(exportName)) {
        return false;
      }
    }
    const absolutePath = path8.join(process.cwd(), suggestion.filePath);
    const backupDir = path8.join(process.cwd(), ".bob-backups");
    if (!fs7.existsSync(backupDir)) fs7.mkdirSync(backupDir, { recursive: true });
    if (fs7.existsSync(absolutePath)) {
      const timestamp = Date.now();
      const backupName = suggestion.filePath.replace(/[\/\\]/g, "_") + `.${timestamp}.bak`;
      fs7.copyFileSync(absolutePath, path8.join(backupDir, backupName));
    }
    const dir = path8.dirname(absolutePath);
    if (!fs7.existsSync(dir)) fs7.mkdirSync(dir, { recursive: true });
    fs7.writeFileSync(absolutePath, newContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}
function detectLocalCategory(suggestion) {
  const cwd = process.cwd();
  const projectName = path8.basename(cwd);
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const analysisPath = path8.join(homeDir, ".bob", "projects", projectName, "analysis", "results", "analysis.json");
  if (!fs7.existsSync(analysisPath)) return "bugs";
  const allResults = JSON.parse(fs7.readFileSync(analysisPath, "utf-8"));
  const fileResults = allResults[suggestion.filePath];
  if (!fileResults) return "bugs";
  for (const cat of ["bugs", "features", "improvements", "upgrades"]) {
    const items = fileResults[cat] || [];
    for (const item of items) {
      if (item.title === suggestion.title && item.description === suggestion.description) return cat;
    }
  }
  return "bugs";
}
function renderTickerHUD(done, total, bugs, features, improvements, upgrades, tokens) {
  const percent = total > 0 ? done / total : 0;
  const barLen = 30;
  const filled = Math.round(percent * barLen);
  let barColor;
  if (percent < 0.25) barColor = chalk16.red;
  else if (percent < 0.5) barColor = chalk16.hex("#FF8C00");
  else if (percent < 0.75) barColor = chalk16.yellow;
  else barColor = chalk16.green;
  const bar = barColor("\u2588".repeat(filled)) + GRAY2("\u2591".repeat(barLen - filled));
  console.log(`  \u26A1 [${bar}] ${done}/${total}  ${barColor(Math.round(percent * 100) + "%")}`);
  console.log(GRAY2(`  \u{1F41B} ${bugs}  \u2B50 ${features}  \u{1F527} ${improvements}  \u2B06\uFE0F ${upgrades}  |  Tokens: ${tokens.toLocaleString()}`));
}
var lastLocalTodoLines = 0;
function renderLocalTodoList(queue) {
  const lines = [];
  lines.push("");
  lines.push(AMBER4("  \u{1F4CB} MiniBob Autonomy Queue"));
  lines.push(GRAY2("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  for (let i = 0; i < queue.length; i++) {
    const task = queue[i];
    const label = task.suggestion.title || task.suggestion.description?.slice(0, 35) || "No title";
    let icon;
    let color;
    switch (task.status) {
      case "done":
        icon = "\u2611";
        color = GREEN3;
        break;
      case "working":
        icon = "\u23F3";
        color = AMBER4;
        break;
      case "failed":
        icon = "\u2717";
        color = RED2;
        break;
      case "skipped":
        icon = "\u23F8\uFE0F";
        color = GRAY2;
        break;
      default:
        icon = "\u2610";
        color = GRAY2;
    }
    lines.push(color(`  ${icon} [${i + 1}/${queue.length}] ${task.suggestion.filePath}`));
    lines.push(color(`    ${label}`));
  }
  const completed = queue.filter((t) => t.status === "done" || t.status === "failed" || t.status === "skipped").length;
  const total = queue.length;
  const percent = total > 0 ? completed / total : 0;
  const barLen = 30;
  const filled = Math.round(percent * barLen);
  let barColor;
  if (percent < 0.25) barColor = chalk16.red;
  else if (percent < 0.5) barColor = chalk16.hex("#FF8C00");
  else if (percent < 0.75) barColor = chalk16.yellow;
  else barColor = chalk16.green;
  lines.push("");
  lines.push(`  [${barColor("\u2588".repeat(filled))}${GRAY2("\u2591".repeat(barLen - filled))}] ${completed}/${total}  ${barColor(Math.round(percent * 100) + "%")}`);
  lines.push("");
  if (lastLocalTodoLines > 0) {
    process.stdout.write(`\x1B[${lastLocalTodoLines}A`);
    for (let i = 0; i < lastLocalTodoLines; i++) {
      process.stdout.write("\x1B[2K\n");
    }
    process.stdout.write(`\x1B[${lastLocalTodoLines}A`);
  }
  for (const line of lines) {
    process.stdout.write(line + "\n");
  }
  lastLocalTodoLines = lines.length;
}

// bin/bob.ts
var program = new Command();
program.name("bob").description("Bob's CLI \u2014 AI coding assistant and Forge orchestrator").version("0.1.0");
program.command("whoami").description("Show current authentication status and configuration").action(() => {
  const config = getConfig();
  const projectName = path9.basename(process.cwd());
  console.log("");
  console.log(chalk17.bold("  \u{1F916} Bob's CLI"));
  console.log(chalk17.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(`  ${chalk17.cyan("Status:")}    ${config.loggedIn ? chalk17.green("Logged in as " + config.email) : "Not logged in"}`);
  console.log(`  ${chalk17.cyan("Tier:")}      ${config.tier === "platform" ? "Platform (Tier 3)" : "Local-first (Tier 1)"}`);
  console.log(`  ${chalk17.cyan("Provider:")}  ${config.provider || "Not configured"}`);
  console.log(`  ${chalk17.cyan("Mode:")}      ${config.personalizationMode ? "Personalized" : config.consultantMode ? "Consultant" : "Standard"}`);
  console.log(`  ${chalk17.cyan("IDRP:")}      ${config.idrp ? "Enabled" : "Disabled"}`);
  console.log(`  ${chalk17.cyan("Project:")}   ${projectName} (${process.cwd()})`);
  console.log(`  ${chalk17.cyan("Session:")}   ${config.conversationId ? config.conversationId.slice(0, 20) + "..." : "None"}`);
  console.log("");
  if (!config.loggedIn) {
    console.log(chalk17.gray("  Run `bob login` to authenticate."));
    console.log("");
  }
});
registerConfigCommand(program);
registerChatCommand(program);
registerConsultCommand(program);
registerIndexCommand(program);
registerLoginCommand(program);
registerPushCommand(program);
registerByokCommand(program);
registerConversationsCommand(program);
registerForkCommand(program);
registerDeepDiveCommand(program);
registerAnalyseCommand(program);
registerAutonomyCommand(program);
program.parse();
