#!/usr/bin/env node

// bin/bob.ts
import { Command } from "commander";
import chalk8 from "chalk";
import * as path6 from "path";

// src/core/config-store.ts
import Conf from "conf";

// src/types/config.ts
var DEFAULT_CONFIG = {
  tier: "local",
  loggedIn: false,
  email: null,
  uid: null,
  authToken: null,
  refreshToken: null,
  provider: null,
  providerKey: null,
  localEndpoint: null,
  personalizationMode: false,
  consultantMode: false,
  idrp: false,
  idrpFilter: "free",
  activeProject: null,
  conversationId: null,
  activePersona: null
};

// src/core/config-store.ts
var store = new Conf({
  projectName: "bob-cli",
  defaults: DEFAULT_CONFIG
});
function getConfig() {
  return {
    tier: store.get("tier"),
    loggedIn: store.get("loggedIn"),
    email: store.get("email"),
    uid: store.get("uid"),
    authToken: store.get("authToken"),
    refreshToken: store.get("refreshToken"),
    provider: store.get("provider"),
    providerKey: store.get("providerKey"),
    localEndpoint: store.get("localEndpoint"),
    personalizationMode: store.get("personalizationMode"),
    consultantMode: store.get("consultantMode"),
    idrp: store.get("idrp"),
    idrpFilter: store.get("idrpFilter"),
    activeProject: store.get("activeProject"),
    conversationId: store.get("conversationId"),
    activePersona: store.get("activePersona")
  };
}
function setConfigValue(key, value) {
  store.set(key, value);
}
function getConfigPath() {
  return store.path;
}

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
  "activePersona"
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
    console.log(`  ${chalk.cyan("Active Project:")} ${config.activeProject || "None"}`);
    console.log(`  ${chalk.cyan("Active Persona:")} ${config.activePersona || "None"}`);
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
import chalk4 from "chalk";
import ora from "ora";
import * as readline2 from "readline";

// src/core/api-client.ts
import axios2 from "axios";

// src/commands/login.ts
import chalk2 from "chalk";
import http from "http";
import open from "open";
import axios from "axios";
import { URL } from "url";
import * as readline from "readline";
var CLI_AUTH_URL = "https://bobs-workshop.web.app/cli-auth";
var CALLBACK_PORT = 9876;
var FIREBASE_API_KEY = "AIzaSyB-hUZEonRIzbExVDwuneJaDjJZBvHdIps";
function registerLoginCommand(program2) {
  program2.command("login").description("Authenticate with Bob's Workshop via browser").action(async () => {
    console.log("");
    console.log(chalk2.bold.cyan("  \u{1F510} Bob CLI \u2014 Login"));
    console.log(chalk2.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    console.log(chalk2.yellow("  \u26A0\uFE0F  Important:"));
    console.log(chalk2.gray("  \u2022 Local conversations (Tier 1) will NOT sync to the platform."));
    console.log(chalk2.gray("  \u2022 Only NEW conversations created after login will save to Firebase."));
    console.log(chalk2.gray("  \u2022 Your local history stays in ~/.bob/projects/ (backup via `bob backup`)."));
    console.log(chalk2.gray("  \u2022 Logging in upgrades you to Tier 3 (Platform) with full features."));
    console.log("");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve2) => {
      rl.question(chalk2.cyan("  Continue with login? (y/n): "), resolve2);
    });
    rl.close();
    if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
      console.log("");
      console.log(chalk2.gray("  Login cancelled."));
      console.log("");
      return;
    }
    console.log("");
    console.log(chalk2.gray("  Opening browser for authentication..."));
    console.log("");
    try {
      const result = await startAuthFlow();
      if (result) {
        const exchangeResult = await exchangeCustomToken(result.token);
        setConfigValue("authToken", exchangeResult.idToken);
        setConfigValue("refreshToken", exchangeResult.refreshToken);
        setConfigValue("email", result.email);
        setConfigValue("uid", result.uid);
        setConfigValue("loggedIn", true);
        setConfigValue("tier", "platform");
        console.log("");
        console.log(chalk2.green(`  \u2705 Logged in as ${result.email}`));
        console.log(chalk2.gray("  Tier: Platform (Tier 3)"));
        console.log(chalk2.gray("  All platform features are now available."));
        console.log("");
      }
    } catch (error) {
      console.log(chalk2.red(`  \u274C Login failed: ${error.message}`));
      console.log("");
    }
  });
  program2.command("logout").description("Sign out and clear stored credentials").action(() => {
    setConfigValue("authToken", null);
    setConfigValue("refreshToken", null);
    setConfigValue("email", null);
    setConfigValue("uid", null);
    setConfigValue("loggedIn", false);
    setConfigValue("tier", "local");
    console.log("");
    console.log(chalk2.gray("  \u{1F44B} Logged out. Switched to Tier 1 (local-first)."));
    console.log("");
  });
}
async function exchangeCustomToken(customToken) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`;
  const response = await axios.post(url, {
    token: customToken,
    returnSecureToken: true
  });
  if (!response.data?.idToken || !response.data?.refreshToken) {
    throw new Error("Token exchange failed \u2014 no ID token returned.");
  }
  return {
    idToken: response.data.idToken,
    refreshToken: response.data.refreshToken
  };
}
async function refreshAuthToken(refreshToken) {
  const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
  const response = await axios.post(url, {
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  if (!response.data?.id_token) {
    throw new Error("Token refresh failed.");
  }
  setConfigValue("authToken", response.data.id_token);
  return response.data.id_token;
}
function startAuthFlow() {
  return new Promise((resolve2, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 120 seconds. Please try again."));
    }, 12e4);
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      try {
        const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        const token = url.searchParams.get("token");
        const email = url.searchParams.get("email");
        const uid = url.searchParams.get("uid");
        if (!token || !email || !uid) {
          res.writeHead(400);
          res.end("Missing parameters");
          reject(new Error("Invalid callback \u2014 missing token, email, or uid."));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="background: #0a0a0a; color: white; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
              <div style="text-align: center;">
                <h1>\u2705 Authenticated!</h1>
                <p style="color: #888;">You can close this tab and return to your terminal.</p>
              </div>
            </body>
          </html>
        `);
        clearTimeout(timeout);
        server.close();
        resolve2({ token, email, uid });
      } catch (e) {
        res.writeHead(500);
        res.end("Error");
        reject(e);
      }
    });
    server.listen(CALLBACK_PORT, () => {
      console.log(chalk2.gray(`  \u{1F310} Waiting for authentication (port ${CALLBACK_PORT})...`));
      console.log(chalk2.gray("  If your browser doesn't open, visit:"));
      console.log(chalk2.cyan(`  ${CLI_AUTH_URL}`));
      console.log("");
      open(CLI_AUTH_URL).catch(() => {
      });
    });
    server.on("error", (err) => {
      clearTimeout(timeout);
      if (err.code === "EADDRINUSE") {
        reject(new Error("Port 9876 is already in use. Close other instances and try again."));
      } else {
        reject(err);
      }
    });
  });
}

// src/core/api-client.ts
var FUNCTIONS_BASE = "https://us-central1-seedlingapp.cloudfunctions.net";
async function callCloudFunction(functionName, data) {
  const config = getConfig();
  if (!config.authToken) {
    throw new Error("Not authenticated. Run `bob login` first.");
  }
  try {
    const response = await axios2.post(
      `${FUNCTIONS_BASE}/${functionName}`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.authToken}`
        },
        timeout: 18e4
      }
    );
    return response.data?.result || response.data;
  } catch (error) {
    if (error.response?.status === 401 && config.refreshToken) {
      try {
        const newToken = await refreshAuthToken(config.refreshToken);
        const retryResponse = await axios2.post(
          `${FUNCTIONS_BASE}/${functionName}`,
          { data },
          {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${newToken}`
            },
            timeout: 18e4
          }
        );
        return retryResponse.data?.result || retryResponse.data;
      } catch (refreshError) {
        setConfigValue("loggedIn", false);
        throw new Error("Session expired. Run `bob login` again.");
      }
    }
    throw error;
  }
}

// src/ai/providers/local.ts
import axios3 from "axios";
async function callLocalModel(endpoint, messages) {
  try {
    const response = await axios3.post(
      endpoint,
      {
        model: "bob-local-dna:latest",
        messages,
        stream: false
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 18e4
      }
    );
    if (response.data?.message?.content) {
      return response.data.message.content;
    }
    const choice = response.data?.choices?.[0];
    if (choice?.message?.content) {
      return choice.message.content;
    }
    if (typeof response.data?.response === "string") {
      return response.data.response;
    }
    return "No response received from local model.";
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error("Cannot connect to local model. Is Ollama running? Check your endpoint: " + endpoint);
    }
    throw new Error("Local model error: " + (error.response?.status ? `Status ${error.response.status}` : error.message));
  }
}

// src/ai/persona.ts
var STANDARD_STYLE_PROMPT = `You are Bob: friendly, direct, senior-level engineering partner.
CONVERSATIONAL + BREVITY RULES (strict):
- Warm + concise.
- If code is appropriate, lead with code.
- Preface: at most 20 short sentence(s) (<= 500 words).
- After code: up to 5 bullets (<= 100 words).
- One fenced block only.
- Expand only if asked to "explain" or "why" next turn.`;
var CONSULTANT_STYLE_PROMPT = `You are Bob in "Consultant Mode": a friendly, direct, senior-level engineering partner.
CONSULTANT MODE RULES (VERY STRICT):
- Your ONLY goal is to provide strategic advice, conceptual guidance, and high-level architectural ideas.
- DO NOT, under any circumstances, generate code.
- Focus entirely on the conceptual and strategic aspects of the user's query.
- Be warm, concise, and direct in your advice.`;

// src/core/context-builder.ts
import * as fs from "fs";
import * as path from "path";
var IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".dart_tool", ".idea", ".gradle", ".pub-cache"];
var MAX_DEPTH = 3;
function buildLocalContext(rootDir) {
  const tree = getDirectoryTree(rootDir, 0);
  return `Working Directory: ${rootDir}

File Tree:
${tree}`;
}
function getDirectoryTree(dir, depth) {
  if (depth >= MAX_DEPTH) return "";
  let result = "";
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith(".") && depth === 0) continue;
      const indent = "  ".repeat(depth);
      if (entry.isDirectory()) {
        result += `${indent}${entry.name}/
`;
        result += getDirectoryTree(path.join(dir, entry.name), depth + 1);
      } else {
        result += `${indent}${entry.name}
`;
      }
    }
  } catch (e) {
  }
  return result;
}
function readFileContent(filePath) {
  try {
    return fs.readFileSync(path.resolve(filePath), "utf-8");
  } catch (e) {
    return null;
  }
}

// src/ui/renderer.ts
import chalk3 from "chalk";
function renderMarkdown(text) {
  return text.replace(/^#{1,6}\s+(.+)$/gm, chalk3.bold.cyan("$1")).replace(/\*\*(.+?)\*\*/g, chalk3.bold("$1")).replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, chalk3.italic("$1")).replace(/^\s*[\*\-]\s+/gm, "  \u2022 ").replace(/^\s*(\d+)\.\s+/gm, "  $1. ").replace(/^[\-\*]{3,}$/gm, chalk3.gray("\u2500".repeat(60))).replace(/`([^`]+)`/g, chalk3.yellow("$1")).replace(/```[\w]*\n?/g, "").replace(/\n{3,}/g, "\n\n");
}

// src/core/conversation-store.ts
import * as fs3 from "fs";
import * as path3 from "path";

// src/core/project-map.ts
import * as fs2 from "fs";
import * as path2 from "path";
import * as os from "os";
var BOB_DIR = path2.join(os.homedir(), ".bob");
var PROJECTS_DIR = path2.join(BOB_DIR, "projects");
function getProjectName(workingDir) {
  return path2.basename(workingDir);
}
function getProjectDir(workingDir) {
  const name = getProjectName(workingDir);
  return path2.join(PROJECTS_DIR, name);
}
function ensureProjectStructure(workingDir) {
  const projectDir = getProjectDir(workingDir);
  const conversationsDir = path2.join(projectDir, "conversations");
  const analysisDir = path2.join(projectDir, "analysis");
  const runsDir = path2.join(analysisDir, "runs");
  for (const dir of [BOB_DIR, PROJECTS_DIR, projectDir, conversationsDir, analysisDir, runsDir]) {
    if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
  }
  const metaPath = path2.join(projectDir, "project.json");
  if (!fs2.existsSync(metaPath)) {
    const meta = {
      name: getProjectName(workingDir),
      path: workingDir,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastIndexed: null
    };
    fs2.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
  return { projectDir, conversationsDir, analysisDir, runsDir };
}
function createAnalysisRun(workingDir, files) {
  const { runsDir } = ensureProjectStructure(workingDir);
  const runId = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const runDir = path2.join(runsDir, runId);
  const tasksDir = path2.join(runDir, "tasks");
  fs2.mkdirSync(runDir, { recursive: true });
  fs2.mkdirSync(tasksDir, { recursive: true });
  const manifest = {
    runId,
    status: "in_progress",
    totalFiles: files.length,
    completedFiles: 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    projectPath: workingDir
  };
  fs2.writeFileSync(path2.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  for (const filePath of files) {
    const taskId = filePath.replace(/[\/\\]/g, "_");
    const task = {
      filePath,
      status: false,
      summary: null,
      dependencies: [],
      error: null
    };
    fs2.writeFileSync(path2.join(tasksDir, `${taskId}.json`), JSON.stringify(task, null, 2));
  }
  return { runId, runDir, tasksDir };
}
function completeTask(tasksDir, filePath, summary) {
  const taskId = filePath.replace(/[\/\\]/g, "_");
  const taskPath = path2.join(tasksDir, `${taskId}.json`);
  if (fs2.existsSync(taskPath)) {
    const task = JSON.parse(fs2.readFileSync(taskPath, "utf-8"));
    task.status = true;
    task.summary = summary;
    fs2.writeFileSync(taskPath, JSON.stringify(task, null, 2));
  }
}
function updateManifestProgress(runDir, completedFiles, status) {
  const manifestPath = path2.join(runDir, "manifest.json");
  if (fs2.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs2.readFileSync(manifestPath, "utf-8"));
    manifest.completedFiles = completedFiles;
    if (status) manifest.status = status;
    fs2.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}
function saveSummaries(workingDir, summaries) {
  const { analysisDir } = ensureProjectStructure(workingDir);
  fs2.writeFileSync(path2.join(analysisDir, "summaries.json"), JSON.stringify(summaries, null, 2));
  const projectDir = getProjectDir(workingDir);
  const metaPath = path2.join(projectDir, "project.json");
  if (fs2.existsSync(metaPath)) {
    const meta = JSON.parse(fs2.readFileSync(metaPath, "utf-8"));
    meta.lastIndexed = (/* @__PURE__ */ new Date()).toISOString();
    fs2.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
}
function saveDependencies(workingDir, dependencies) {
  const { analysisDir } = ensureProjectStructure(workingDir);
  fs2.writeFileSync(path2.join(analysisDir, "dependencies.json"), JSON.stringify(dependencies, null, 2));
}
function loadSummaries(workingDir) {
  const { analysisDir } = ensureProjectStructure(workingDir);
  const summariesPath = path2.join(analysisDir, "summaries.json");
  if (!fs2.existsSync(summariesPath)) return null;
  try {
    return JSON.parse(fs2.readFileSync(summariesPath, "utf-8"));
  } catch {
    return null;
  }
}
function loadDependencies(workingDir) {
  const { analysisDir } = ensureProjectStructure(workingDir);
  const depsPath = path2.join(analysisDir, "dependencies.json");
  if (!fs2.existsSync(depsPath)) return null;
  try {
    return JSON.parse(fs2.readFileSync(depsPath, "utf-8"));
  } catch {
    return null;
  }
}

// src/core/conversation-store.ts
function saveMessage(conversationId, message, meta) {
  const { conversationsDir } = ensureProjectStructure(process.cwd());
  const convoDir = path3.join(conversationsDir, conversationId);
  const messagesDir = path3.join(convoDir, "messages");
  if (!fs3.existsSync(convoDir)) fs3.mkdirSync(convoDir, { recursive: true });
  if (!fs3.existsSync(messagesDir)) fs3.mkdirSync(messagesDir, { recursive: true });
  const messageFilename = `${Date.now()}_${message.sender}.json`;
  fs3.writeFileSync(
    path3.join(messagesDir, messageFilename),
    JSON.stringify(message, null, 2)
  );
  const metaPath = path3.join(convoDir, "conversation.json");
  let convoMeta;
  if (fs3.existsSync(metaPath)) {
    try {
      convoMeta = JSON.parse(fs3.readFileSync(metaPath, "utf-8"));
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
  fs3.writeFileSync(metaPath, JSON.stringify(convoMeta, null, 2));
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
import * as fs4 from "fs";
import * as path4 from "path";
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
      const absolutePath = path4.join(cwd, filePath);
      try {
        if (fs4.existsSync(absolutePath)) {
          const content = fs4.readFileSync(absolutePath, "utf-8");
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
        console.log(chalk4.yellow(`  \u26A0\uFE0F  Could not read file: ${options.file}`));
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
  const spinner = ora({
    text: chalk4.cyan("  Bob is thinking..."),
    spinner: "dots"
  }).start();
  let selectedFiles = [];
  let hasProjectContext = null;
  try {
    let response;
    if (config.provider === "local") {
      if (!config.localEndpoint) {
        spinner.stop();
        console.log(chalk4.red("  \u274C No local endpoint configured."));
        console.log(chalk4.gray("  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`"));
        return "";
      }
      spinner.text = chalk4.cyan("  Bob is finding relevant files...");
      const retrieval = await getRelevantFileContents(message, config.localEndpoint);
      const relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;
      spinner.text = chalk4.cyan("  Bob is thinking...");
      let fullContext = localContext;
      if (relevantFiles) {
        fullContext += `

${relevantFiles}`;
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
        console.log(chalk4.red("  \u274C Personalization mode requires Tier 3 (platform login)."));
        return "";
      }
      const result = await callCloudFunction("getPersonalizedResponse", {
        userEmail: config.email,
        userId: config.uid,
        conversationId,
        userMessage: message,
        useContext: true,
        localContext: localContext || null
      });
      response = result?.text || result?.response || result?.message || "No response received.";
      hasProjectContext = result?.hasProjectContext ?? null;
    } else {
      if (!config.loggedIn || !config.authToken) {
        spinner.stop();
        console.log(chalk4.red("  \u274C Not logged in."));
        console.log(chalk4.gray("  Run `bob login` to authenticate, or set provider to local."));
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
        localContext: localContext || null
      });
      response = result?.text || result?.response || result?.message || "No response received.";
      hasProjectContext = result?.hasProjectContext ?? null;
    }
    spinner.stop();
    const rendered = renderMarkdown(response);
    console.log("");
    console.log(chalk4.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log(chalk4.bold.cyan("  \u{1F916} Bob:"));
    console.log("");
    for (const line of rendered.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log("");
    if (selectedFiles.length > 0) {
      console.log(chalk4.gray(`  \u{1F4C2} Referenced: ${selectedFiles.join(", ")}`));
    }
    if (config.tier === "platform" && config.provider !== "local") {
      console.log(chalk4.gray(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
      if (hasProjectContext === false) {
        console.log(chalk4.red("  \u26A0\uFE0F  No project workspace connected. Upload a project via the web app"));
        console.log(chalk4.red("     for full RAG + workspace capabilities."));
      }
    }
    console.log(chalk4.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    return response;
  } catch (error) {
    spinner.stop();
    console.log(chalk4.red(`  \u274C ${error.message || "Unknown error"}`));
    return "";
  }
}
async function runInteractiveSession(config, conversationId, localContext, personalized, mode) {
  const summaries = loadSummaries(process.cwd());
  const isIndexed = summaries && Object.keys(summaries).length > 0;
  console.log("");
  console.log(chalk4.bold.cyan("  \u{1F916} Bob \u2014 Interactive Session"));
  console.log(chalk4.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  if (isIndexed) {
    console.log(chalk4.green(`  \u{1F4DA} Project indexed (${Object.keys(summaries).length} files). Intelligent file selection active.`));
  } else {
    console.log(chalk4.yellow("  \u26A0\uFE0F  Project not indexed. Run `bob index` for smarter responses."));
  }
  if (config.tier === "platform" && config.provider !== "local") {
    console.log(chalk4.gray(`  \u{1F517} ${conversationId}`));
  }
  console.log(chalk4.gray("  Commands: /exit  /new  /clear"));
  console.log(chalk4.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  const rl = readline2.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const history = [];
  const prompt = () => {
    rl.question(chalk4.green("  You: "), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }
      if (trimmed === "/exit" || trimmed === "/quit") {
        console.log("");
        console.log(chalk4.gray(`  \u{1F4BE} Session: ${conversationId.slice(0, 24)}...`));
        if (config.tier === "platform" && config.provider !== "local") {
          console.log(chalk4.gray(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
        }
        console.log(chalk4.gray("  \u{1F44B} See you next time."));
        console.log("");
        rl.close();
        return;
      }
      if (trimmed === "/new") {
        history.length = 0;
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setConfigValue("conversationId", conversationId);
        console.log(chalk4.cyan("  \u{1F504} New session started."));
        console.log("");
        prompt();
        return;
      }
      if (trimmed === "/clear") {
        console.clear();
        console.log(chalk4.bold.cyan("  \u{1F916} Bob \u2014 Interactive Session"));
        console.log(chalk4.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
        console.log("");
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
import chalk5 from "chalk";
import ora2 from "ora";
import * as readline3 from "readline";
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
        console.log(chalk5.yellow(`  \u26A0\uFE0F  Could not read file: ${options.file}`));
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
  const spinner = ora2({
    text: chalk5.cyan("  Bob is thinking (consultant mode)..."),
    spinner: "dots"
  }).start();
  let selectedFiles = [];
  let hasProjectContext = null;
  try {
    let response;
    if (config.provider === "local") {
      if (!config.localEndpoint) {
        spinner.stop();
        console.log(chalk5.red("  \u274C No local endpoint configured."));
        console.log(chalk5.gray("  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`"));
        return "";
      }
      spinner.text = chalk5.cyan("  Bob is finding relevant files...");
      const retrieval = await getRelevantFileContents(message, config.localEndpoint);
      const relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;
      spinner.text = chalk5.cyan("  Bob is thinking (consultant mode)...");
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
        console.log(chalk5.red("  \u274C Not logged in."));
        console.log(chalk5.gray("  Run `bob login` to authenticate, or set provider to local."));
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
    console.log(chalk5.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log(chalk5.bold.magenta("  \u{1F3AF} Bob (Consultant):"));
    console.log("");
    for (const line of rendered.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log("");
    if (selectedFiles.length > 0) {
      console.log(chalk5.gray(`  \u{1F4C2} Referenced: ${selectedFiles.join(", ")}`));
    }
    if (config.tier === "platform" && config.provider !== "local") {
      console.log(chalk5.gray(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
      if (hasProjectContext === false) {
        console.log(chalk5.red("  \u26A0\uFE0F  No project workspace connected. Upload a project via the web app"));
        console.log(chalk5.red("     for full RAG + workspace capabilities."));
      }
    }
    console.log(chalk5.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    return response;
  } catch (error) {
    spinner.stop();
    console.log(chalk5.red(`  \u274C ${error.message || "Unknown error"}`));
    return "";
  }
}
async function runInteractiveSession2(config, conversationId, localContext) {
  const summaries = loadSummaries(process.cwd());
  const isIndexed = summaries && Object.keys(summaries).length > 0;
  console.log("");
  console.log(chalk5.bold.magenta("  \u{1F3AF} Bob \u2014 Consultant Session"));
  console.log(chalk5.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  if (isIndexed) {
    console.log(chalk5.green(`  \u{1F4DA} Project indexed (${Object.keys(summaries).length} files). Intelligent file selection active.`));
  } else {
    console.log(chalk5.yellow("  \u26A0\uFE0F  Project not indexed. Run `bob index` for smarter responses."));
  }
  if (config.tier === "platform" && config.provider !== "local") {
    console.log(chalk5.gray(`  \u{1F517} ${conversationId}`));
  }
  console.log(chalk5.gray("  Strategic advice only. No code."));
  console.log(chalk5.gray("  Commands: /exit  /new  /clear"));
  console.log(chalk5.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log("");
  const rl = readline3.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const history = [];
  const prompt = () => {
    rl.question(chalk5.green("  You: "), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }
      if (trimmed === "/exit" || trimmed === "/quit") {
        console.log("");
        console.log(chalk5.gray(`  \u{1F4BE} Session: ${conversationId.slice(0, 24)}...`));
        if (config.tier === "platform" && config.provider !== "local") {
          console.log(chalk5.gray(`  \u{1F517} https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
        }
        console.log(chalk5.gray("  \u{1F44B} See you next time."));
        console.log("");
        rl.close();
        return;
      }
      if (trimmed === "/new") {
        history.length = 0;
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setConfigValue("conversationId", conversationId);
        console.log(chalk5.magenta("  \u{1F504} New consultant session started."));
        console.log("");
        prompt();
        return;
      }
      if (trimmed === "/clear") {
        console.clear();
        console.log(chalk5.bold.magenta("  \u{1F3AF} Bob \u2014 Consultant Session"));
        console.log(chalk5.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
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
import chalk6 from "chalk";
import * as fs5 from "fs";
import * as path5 from "path";
var IGNORE_DIRS2 = ["node_modules", ".git", "dist", "build", ".dart_tool", ".idea", ".gradle", ".pub-cache", ".bob"];
var CODE_EXTENSIONS = /* @__PURE__ */ new Set([".dart", ".js", ".ts", ".html", ".css", ".json", ".yaml", ".yml", ".xml", ".sh", ".md"]);
function registerIndexCommand(program2) {
  program2.command("index").description("Index the current project \u2014 generates summaries and dependency map").option("--verbose", "Show detailed progress with summaries").action(async (options) => {
    const config = getConfig();
    const cwd = process.cwd();
    const projectName = getProjectName(cwd);
    if (config.provider !== "local" || !config.localEndpoint) {
      console.log("");
      console.log(chalk6.red("  \u274C Indexing requires a local model."));
      console.log(chalk6.gray("  Run `bob config set provider local`"));
      console.log(chalk6.gray("  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`"));
      console.log("");
      return;
    }
    console.log("");
    console.log(chalk6.bold.cyan(`  \u26A1 Indexing project: ${projectName}`));
    console.log(chalk6.gray(`  \u{1F4C1} ${cwd}`));
    console.log(chalk6.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    const files = scanProjectFiles(cwd);
    if (files.length === 0) {
      console.log(chalk6.yellow("  \u26A0\uFE0F  No code files found to index."));
      return;
    }
    console.log(chalk6.gray(`  Found ${files.length} files to analyze.`));
    console.log("");
    console.log("");
    console.log("");
    console.log("");
    console.log("");
    const { runId, runDir, tasksDir } = createAnalysisRun(cwd, files);
    const summaries = {};
    let completed = 0;
    for (const filePath of files) {
      const absolutePath = path5.join(cwd, filePath);
      let content;
      try {
        content = fs5.readFileSync(absolutePath, "utf-8");
      } catch {
        console.log(chalk6.red(`  \u274C Could not read: ${filePath}`));
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
        console.log(chalk6.red(`  \u274C Failed: ${filePath} \u2014 ${error.message}`));
        completed++;
        updateManifestProgress(runDir, completed);
      }
    }
    console.log("");
    console.log("");
    console.log(chalk6.cyan("  \u{1F517} Generating dependency map..."));
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
        console.log(chalk6.yellow("  \u26A0\uFE0F  Could not parse dependency map. Saving empty map."));
        dependencies = {};
      }
      saveSummaries(cwd, summaries);
      saveDependencies(cwd, dependencies);
      for (const [filePath, deps] of Object.entries(dependencies)) {
        const taskId = filePath.replace(/[\/\\]/g, "_");
        const taskPath = path5.join(tasksDir, `${taskId}.json`);
        if (fs5.existsSync(taskPath)) {
          const task = JSON.parse(fs5.readFileSync(taskPath, "utf-8"));
          task.dependencies = deps;
          fs5.writeFileSync(taskPath, JSON.stringify(task, null, 2));
        }
      }
      updateManifestProgress(runDir, completed, "completed");
      console.log(chalk6.green(`  \u2705 Dependency map generated for ${Object.keys(dependencies).length} files.`));
    } catch (error) {
      console.log(chalk6.red(`  \u274C Dependency mapping failed: ${error.message}`));
      saveSummaries(cwd, summaries);
      saveDependencies(cwd, {});
      updateManifestProgress(runDir, completed, "completed_partial");
    }
    console.log("");
    console.log(chalk6.bold.green(`  \u2705 Indexing complete: ${projectName}`));
    console.log(chalk6.gray(`  \u{1F4C4} ${Object.keys(summaries).length} files summarized`));
    console.log(chalk6.gray(`  \u{1F4BE} Saved to: ~/.bob/projects/${projectName}/analysis/`));
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
      if (IGNORE_DIRS2.includes(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path5.join(dir, entry.name);
      const relativePath = path5.relative(rootDir, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        files.push(...scanProjectFiles(rootDir, fullPath, depth + 1));
      } else {
        const ext = path5.extname(entry.name).toLowerCase();
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
    barColor = chalk6.red;
  } else if (percent < 0.5) {
    barColor = chalk6.hex("#FF8C00");
  } else if (percent < 0.75) {
    barColor = chalk6.yellow;
  } else {
    barColor = chalk6.green;
  }
  const filledBar = barColor("\u2588".repeat(filled));
  const emptyBar = chalk6.gray("\u2591".repeat(barLength - filled));
  const percentText = barColor(`${Math.round(percent * 100)}%`);
  process.stdout.write("\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\r");
  console.log(`  ${chalk6.cyan("\u26A1")} Indexing [${filledBar}${emptyBar}] ${completed}/${total} ${percentText}`);
  console.log(chalk6.green(`  \u2705 ${filePath}`));
  if (verbose) {
    console.log(chalk6.gray(`     "${summary.slice(0, 120)}${summary.length > 120 ? "..." : ""}"`));
    if (dependencies.length > 0) {
      console.log(chalk6.gray(`     \u2192 depends on: ${dependencies.join(", ")}`));
    } else {
      console.log(chalk6.gray(`     \u2192 depends on: (mapping after all summaries)`));
    }
  } else {
    console.log(chalk6.gray(`     "${summary.slice(0, 80)}${summary.length > 80 ? "..." : ""}"`));
    console.log("");
  }
}

// src/commands/push.ts
import chalk7 from "chalk";
import ora3 from "ora";
import simpleGit from "simple-git";
function registerPushCommand(program2) {
  program2.command("push <message>").description("Stage all changes, commit, and push to remote").option("--no-stage", "Skip staging (commit only tracked changes)").option("-b, --branch <name>", "Push to a specific branch").action(async (message, options) => {
    const git = simpleGit(process.cwd());
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      console.log("");
      console.log(chalk7.red("  \u274C Not a git repository."));
      console.log(chalk7.gray("  Run this command from inside a git project."));
      console.log("");
      return;
    }
    const spinner = ora3({
      text: chalk7.cyan("  Preparing commit..."),
      spinner: "dots"
    }).start();
    try {
      const status = await git.status();
      if (status.files.length === 0) {
        spinner.stop();
        console.log("");
        console.log(chalk7.yellow("  \u26A0\uFE0F  Nothing to commit. Working tree is clean."));
        console.log("");
        return;
      }
      if (options.stage !== false) {
        spinner.text = chalk7.cyan(`  Staging ${status.files.length} file(s)...`);
        await git.add(".");
      }
      spinner.text = chalk7.cyan("  Committing...");
      const commitResult = await git.commit(message);
      const commitHash = commitResult.commit ? commitResult.commit.slice(0, 7) : "unknown";
      spinner.text = chalk7.cyan("  Pushing to remote...");
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
      console.log(chalk7.green("  \u2705 Pushed successfully"));
      console.log(chalk7.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      console.log(`  ${chalk7.cyan("Commit:")}   ${commitHash}`);
      console.log(`  ${chalk7.cyan("Branch:")}   ${currentBranch}`);
      console.log(`  ${chalk7.cyan("Message:")}  ${message}`);
      console.log(`  ${chalk7.cyan("Files:")}    ${status.files.length} changed`);
      console.log(chalk7.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
      console.log("");
      if (status.files.length <= 10) {
        for (const file of status.files) {
          const icon = file.index === "?" ? "\u2795" : file.index === "D" ? "\u{1F5D1}\uFE0F" : "\u270F\uFE0F";
          console.log(chalk7.gray(`  ${icon} ${file.path}`));
        }
        console.log("");
      } else {
        console.log(chalk7.gray(`  ${status.created.length} added, ${status.modified.length} modified, ${status.deleted.length} deleted`));
        console.log("");
      }
    } catch (error) {
      spinner.stop();
      console.log("");
      console.log(chalk7.red(`  \u274C Push failed: ${error.message}`));
      if (error.message?.includes("Authentication failed") || error.message?.includes("could not read Username")) {
        console.log(chalk7.gray("  Make sure your git credentials are configured."));
        console.log(chalk7.gray("  Run: git config --global credential.helper store"));
      }
      if (error.message?.includes("conflict") || error.message?.includes("rejected")) {
        console.log(chalk7.gray("  There may be remote changes. Try: git pull --rebase"));
      }
      console.log("");
    }
  });
}

// bin/bob.ts
var program = new Command();
program.name("bob").description("Bob's CLI \u2014 AI coding assistant and Forge orchestrator").version("0.1.0");
program.command("whoami").description("Show current authentication status and configuration").action(() => {
  const config = getConfig();
  const projectName = path6.basename(process.cwd());
  console.log("");
  console.log(chalk8.bold("  \u{1F916} Bob's CLI"));
  console.log(chalk8.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log(`  ${chalk8.cyan("Status:")}    ${config.loggedIn ? chalk8.green("Logged in as " + config.email) : "Not logged in"}`);
  console.log(`  ${chalk8.cyan("Tier:")}      ${config.tier === "platform" ? "Platform (Tier 3)" : "Local-first (Tier 1)"}`);
  console.log(`  ${chalk8.cyan("Provider:")}  ${config.provider || "Not configured"}`);
  console.log(`  ${chalk8.cyan("Mode:")}      ${config.personalizationMode ? "Personalized" : config.consultantMode ? "Consultant" : "Standard"}`);
  console.log(`  ${chalk8.cyan("IDRP:")}      ${config.idrp ? "Enabled" : "Disabled"}`);
  console.log(`  ${chalk8.cyan("Project:")}   ${projectName} (${process.cwd()})`);
  console.log(`  ${chalk8.cyan("Session:")}   ${config.conversationId ? config.conversationId.slice(0, 20) + "..." : "None"}`);
  console.log("");
  if (!config.loggedIn) {
    console.log(chalk8.gray("  Run `bob login` to authenticate."));
    console.log("");
  }
});
registerConfigCommand(program);
registerChatCommand(program);
registerConsultCommand(program);
registerIndexCommand(program);
registerLoginCommand(program);
registerPushCommand(program);
program.parse();
