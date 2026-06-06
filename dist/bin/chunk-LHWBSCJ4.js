// src/commands/analyse-results.ts
import chalk3 from "chalk";
import inquirer from "inquirer";
import * as fs4 from "fs";
import * as path4 from "path";

// src/core/api-client.ts
import axios2 from "axios";

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
  autoMode: false,
  idrp: false,
  idrpFilter: "free",
  activeProject: null,
  conversationId: null,
  activePersona: null,
  hasSeenWelcome: false
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
    activePersona: store.get("activePersona"),
    hasSeenWelcome: store.get("hasSeenWelcome"),
    autoMode: store.get("autoMode")
  };
}
function setConfigValue(key, value) {
  store.set(key, value);
}
function getConfigPath() {
  return store.path;
}

// src/commands/login.ts
import chalk from "chalk";
import http from "http";
import open from "open";
import axios from "axios";
import { URL } from "url";
import * as readline from "readline";
var CLI_AUTH_URL = "https://bobs-workshop.web.app/cli-auth";
var CALLBACK_PORT = 9876;
var FIREBASE_API_KEY = "AIzaSyB-hUZEonRIzbExVDwuneJaDjJZBvHdIps";
function registerLoginCommand(program) {
  program.command("login").description("Authenticate with Bob's Workshop via browser").action(async () => {
    console.log("");
    console.log(chalk.bold.cyan("  \u{1F510} Bob CLI \u2014 Login"));
    console.log(chalk.gray("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
    console.log("");
    console.log(chalk.yellow("  \u26A0\uFE0F  Important:"));
    console.log(chalk.gray("  \u2022 Local conversations (Tier 1) will NOT sync to the platform."));
    console.log(chalk.gray("  \u2022 Only NEW conversations created after login will save to Firebase."));
    console.log(chalk.gray("  \u2022 Your local history stays in ~/.bob/projects/ (backup via `bob backup`)."));
    console.log(chalk.gray("  \u2022 Logging in upgrades you to Tier 3 (Platform) with full features."));
    console.log("");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve2) => {
      rl.question(chalk.cyan("  Continue with login? (y/n): "), resolve2);
    });
    rl.close();
    if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
      console.log("");
      console.log(chalk.gray("  Login cancelled."));
      console.log("");
      return;
    }
    console.log("");
    console.log(chalk.gray("  Opening browser for authentication..."));
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
        console.log(chalk.green(`  \u2705 Logged in as ${result.email}`));
        console.log(chalk.gray("  Tier: Platform (Tier 3)"));
        console.log(chalk.gray("  All platform features are now available."));
        console.log("");
      }
    } catch (error) {
      console.log(chalk.red(`  \u274C Login failed: ${error.message}`));
      console.log("");
    }
  });
  program.command("logout").description("Sign out and clear stored credentials").action(() => {
    setConfigValue("authToken", null);
    setConfigValue("refreshToken", null);
    setConfigValue("email", null);
    setConfigValue("uid", null);
    setConfigValue("loggedIn", false);
    setConfigValue("tier", "local");
    console.log("");
    console.log(chalk.gray("  \u{1F44B} Logged out. Switched to Tier 1 (local-first)."));
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
      console.log(chalk.gray(`  \u{1F310} Waiting for authentication (port ${CALLBACK_PORT})...`));
      console.log(chalk.gray("  If your browser doesn't open, visit:"));
      console.log(chalk.cyan(`  ${CLI_AUTH_URL}`));
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
    const status = error.response?.status;
    if (status === 401 && config.refreshToken) {
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
    if (status === 404) {
      throw new Error(`Function "${functionName}" not found. Is it deployed?`);
    }
    if (status === 403) {
      throw new Error("Permission denied. You may not have access to this feature.");
    }
    if (status === 500) {
      const serverMsg = error.response?.data?.error?.message || error.response?.data?.error || "Internal server error";
      throw new Error(`Server error: ${serverMsg}`);
    }
    if (status === 429) {
      throw new Error("Rate limited. Please wait a moment and try again.");
    }
    const errorMsg = error.response?.data?.error?.message || error.message || `Request failed with status ${status}`;
    throw new Error(errorMsg);
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

// src/core/context-builder.ts
import * as fs from "fs";
import * as path from "path";
var IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".dart_tool", ".idea", ".gradle", ".pub-cache", ".bob"];
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

// src/core/file-writer.ts
import * as fs2 from "fs";
import * as path2 from "path";
import * as readline2 from "readline";
import chalk2 from "chalk";
function extractProposedFile(response) {
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/;
  const match = response.match(codeBlockRegex);
  if (!match) return null;
  const codeContent = match[1].trim();
  const lines = codeContent.split("\n");
  if (lines.length === 0) return null;
  const firstLine = lines[0].trim();
  let filePathMatch = firstLine.match(/^\/\/\s*File:\s*(.+)$/);
  if (!filePathMatch) {
    filePathMatch = firstLine.match(/^\/\/\s*([\w\-\.\/\\]+\.\w+)\s*$/);
  }
  if (!filePathMatch) {
    filePathMatch = firstLine.match(/^#\s*File:\s*(.+)$/);
  }
  if (!filePathMatch) {
    filePathMatch = firstLine.match(/^#\s*([\w\-\.\/\\]+\.\w+)\s*$/);
  }
  if (!filePathMatch) return null;
  const filePath = filePathMatch[1].trim();
  if (!filePath.includes("/") && !filePath.includes("\\")) return null;
  if (!filePath.includes(".")) return null;
  const fileContent = lines.slice(1).join("\n").trim();
  const absolutePath = path2.join(process.cwd(), filePath);
  const isNew = !fs2.existsSync(absolutePath);
  return {
    filePath,
    content: fileContent,
    isNew
  };
}
function stripCodeBlockFromResponse(response) {
  return response.replace(/```[\w]*\n[\s\S]*?```/g, "").trim();
}
async function proposeAndWriteFile(proposed) {
  const absolutePath = path2.join(process.cwd(), proposed.filePath);
  const action = proposed.isNew ? "CREATE" : "UPDATE";
  const icon = proposed.isNew ? "\u{1F4C4}" : "\u270F\uFE0F";
  const color = proposed.isNew ? chalk2.green : chalk2.yellow;
  const totalLines = proposed.content.split("\n").length;
  console.log("");
  console.log(color(`  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510`));
  console.log(color(`  \u2502 ${icon}  ${action}: ${proposed.filePath} (${totalLines} lines)`));
  console.log(color(`  \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`));
  const previewLines = proposed.content.split("\n").slice(0, 6);
  for (const line of previewLines) {
    console.log(chalk2.gray(`  \u2502 ${line}`));
  }
  if (totalLines > 6) {
    console.log(chalk2.gray(`  \u2502 ... (${totalLines - 6} more lines)`));
  }
  console.log(color(`  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`));
  console.log("");
  const rl = readline2.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve2) => {
    rl.question(chalk2.cyan(`  \u{1F4BE} ${action === "CREATE" ? "Write this file" : "Apply changes"}? (y/n/path): `), resolve2);
  });
  rl.close();
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === "n" || trimmed === "no") {
    console.log(chalk2.gray("  \u23ED\uFE0F  Skipped."));
    return false;
  }
  let targetPath = absolutePath;
  if (trimmed !== "y" && trimmed !== "yes" && trimmed.length > 0) {
    targetPath = path2.join(process.cwd(), trimmed);
  }
  try {
    const dir = path2.dirname(targetPath);
    if (!fs2.existsSync(dir)) {
      fs2.mkdirSync(dir, { recursive: true });
    }
    if (!proposed.isNew && fs2.existsSync(targetPath)) {
      const backupDir = path2.join(process.cwd(), ".bob-backups");
      if (!fs2.existsSync(backupDir)) fs2.mkdirSync(backupDir, { recursive: true });
      const timestamp = Date.now();
      const backupName = proposed.filePath.replace(/[\/\\]/g, "_") + `.${timestamp}.bak`;
      fs2.copyFileSync(targetPath, path2.join(backupDir, backupName));
    }
    fs2.writeFileSync(targetPath, proposed.content, "utf-8");
    const relativePath = path2.relative(process.cwd(), targetPath);
    console.log(chalk2.green(`  \u2705 Written: ${relativePath}`));
    if (!proposed.isNew) {
      console.log(chalk2.gray(`  \u{1F4E6} Backup saved to .bob-backups/`));
    }
    console.log("");
    return true;
  } catch (error) {
    console.log(chalk2.red(`  \u274C Write failed: ${error.message}`));
    return false;
  }
}

// src/core/analysis-tracker.ts
import * as fs3 from "fs";
import * as path3 from "path";
var BOB_DIR = path3.join(process.env.HOME || process.env.USERPROFILE || "", ".bob");
function getResultsDir() {
  const projectName = path3.basename(process.cwd());
  return path3.join(BOB_DIR, "projects", projectName, "analysis", "results");
}
function getAnalysisPath() {
  return path3.join(getResultsDir(), "analysis.json");
}
function getStatusLogPath() {
  return path3.join(getResultsDir(), "status-log.json");
}
function markSuggestionStatus(filePath, suggestionIndex, category, status, metadata) {
  const analysisPath = getAnalysisPath();
  const logPath = getStatusLogPath();
  if (!fs3.existsSync(analysisPath)) return;
  const allResults = JSON.parse(fs3.readFileSync(analysisPath, "utf-8"));
  if (allResults[filePath] && allResults[filePath][category]) {
    const items = allResults[filePath][category];
    if (items[suggestionIndex]) {
      items[suggestionIndex].status = status;
      items[suggestionIndex].statusUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
  }
  fs3.writeFileSync(analysisPath, JSON.stringify(allResults, null, 2));
  let log = [];
  if (fs3.existsSync(logPath)) {
    try {
      log = JSON.parse(fs3.readFileSync(logPath, "utf-8"));
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
  fs3.writeFileSync(logPath, JSON.stringify(log, null, 2));
}
function markSuggestionById(id, category, status, metadata) {
  const analysisPath = getAnalysisPath();
  if (!fs3.existsSync(analysisPath)) return;
  const allResults = JSON.parse(fs3.readFileSync(analysisPath, "utf-8"));
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

// src/commands/analyse-results.ts
var RED = chalk3.hex("#EF5350");
var PURPLE = chalk3.hex("#AB47BC");
var BLUE = chalk3.hex("#42A5F5");
var TEAL = chalk3.hex("#26A69A");
var AMBER = chalk3.hex("#FFAB00");
var GRAY = chalk3.gray;
var BORDER = chalk3.hex("#455A64");
var PRIORITY_COLORS = {
  "critical": chalk3.bgHex("#B71C1C").white,
  "high": chalk3.hex("#FF6D00"),
  "medium": chalk3.hex("#FFA726"),
  "low": chalk3.hex("#66BB6A")
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
      console.log(chalk3.red(`  \u274C ${error.message}`));
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
    console.log(chalk3.green("  \u2705 No items found. Clean!"));
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
    const choices = [];
    choices.push({
      name: chalk3.cyan("  \u{1F500} Toggle sort"),
      value: "__sort__",
      short: "Sort"
    });
    choices.push(new inquirer.Separator(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
    for (let idx = 0; idx < displaySuggestions.length; idx++) {
      const item = displaySuggestions[idx];
      const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || GRAY;
      const priorityLabel = (item.priority || "MEDIUM").toUpperCase().padEnd(9);
      const filePath = (item.filePath || "unknown").split("/").pop() || "unknown";
      const desc = (item.description || item.title || "No description").slice(0, 42);
      const displayName = `${pColor(priorityLabel)} ${chalk3.cyan(filePath.padEnd(18))} ${chalk3.white(desc)}`;
      choices.push({
        name: displayName,
        value: idx,
        short: item.title || item.description?.slice(0, 30) || "Item",
        description: `${item.priority} ${item.filePath} ${item.title} ${item.description}`
      });
    }
    choices.push(new inquirer.Separator(GRAY("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
    choices.push({
      name: chalk3.gray("  \u2190 Quit"),
      value: "__quit__",
      short: "Quit"
    });
    const { selected } = await inquirer.prompt([
      {
        type: "search",
        name: "selected",
        message: color(`Search ${category} (type to filter):`),
        source: (input) => {
          if (!input) return choices;
          const query = input.toLowerCase();
          const filtered = choices.filter((c) => {
            if (c.type === "separator") return true;
            if (c.value === "__sort__" || c.value === "__quit__") return true;
            const searchable = c.description?.toLowerCase() || "";
            return searchable.includes(query);
          });
          return filtered;
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
      console.log(chalk3.cyan(`  Sort changed to: ${currentSort}`));
      continue;
    }
    if (typeof selected === "number") {
      const item = displaySuggestions[selected];
      const action = await showExpandedView(item, category);
      if (action === "implement") {
        await handleImplement(item, config, category);
        displaySuggestions.splice(selected, 1);
        const originalIdx = allSuggestions.findIndex((s) => s.id === item.id);
        if (originalIdx !== -1) allSuggestions.splice(originalIdx, 1);
      } else if (action === "dismiss") {
        if (item.id) {
          markSuggestionById(item.id, category, "dismissed", {
            reason: "User dismissed from CLI",
            implementedBy: "user"
          });
        }
        displaySuggestions.splice(selected, 1);
        const originalIdx = allSuggestions.findIndex((s) => s.id === item.id);
        if (originalIdx !== -1) allSuggestions.splice(originalIdx, 1);
        console.log(chalk3.gray("  \u23ED\uFE0F  Dismissed and logged."));
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
  console.log(color("  \u2551") + chalk3.gray("  File: ") + chalk3.cyan(item.filePath || "unknown"));
  console.log(color("  \u2551") + chalk3.gray("  Priority: ") + pColor((item.priority || "medium").toUpperCase()));
  console.log(color("  \u2551"));
  console.log(color("  \u2551") + chalk3.gray("  Title:"));
  console.log(color("  \u2551") + chalk3.white.bold(`  ${item.title || "No title"}`));
  console.log(color("  \u2551"));
  console.log(color("  \u2551") + chalk3.gray("  Description:"));
  const descLines = wrapText(item.description || "No description", 54);
  for (const line of descLines) {
    console.log(color("  \u2551") + chalk3.white(`  ${line}`));
  }
  if (item.implementation) {
    console.log(color("  \u2551"));
    console.log(color("  \u2551") + chalk3.gray("  Implementation:"));
    const implLines = wrapText(item.implementation, 54);
    for (const line of implLines) {
      console.log(color("  \u2551") + chalk3.white(`  ${line}`));
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
        { name: chalk3.green("  \u{1F527} Implement this fix"), value: "implement" },
        { name: chalk3.red("  \u{1F5D1}\uFE0F  Dismiss"), value: "dismiss" },
        { name: chalk3.gray("  \u2190 Back to list"), value: "back" }
      ]
    }
  ]);
  return action;
}
async function handleImplement(item, config, category) {
  console.log("");
  console.log(chalk3.cyan("  \u{1F527} Implementing fix..."));
  console.log("");
  if (config.provider === "local" && config.localEndpoint) {
    const fileContent = readFileContent(item.filePath);
    if (!fileContent) {
      console.log(chalk3.red(`  \u274C Could not read file: ${item.filePath}`));
      return;
    }
    const prompt = `You are MiniBob \u2014 a junior engineer making SURGICAL code fixes under strict supervision.

CURRENT FILE: ${item.filePath}
${fileContent}

CHANGE TO IMPLEMENT:
Title: ${item.title}
Description: ${item.description}
Implementation Instructions: ${item.implementation || "Apply the fix described above."}

RULES (CRITICAL \u2014 VIOLATION = REJECTED):
- Return ONLY valid source code. No markdown, no code fences, no \`\`\`, no explanation text.
- Start the FIRST line with: // File: ${item.filePath}
- PRESERVE ALL existing imports exactly as they are. Do NOT add, remove, or reorder imports.
- PRESERVE ALL existing exports exactly as they are. Do NOT rename exported functions or classes.
- PRESERVE the existing code structure, indentation, patterns, and naming conventions.
- Make the MINIMUM change necessary to implement the fix. Touch NOTHING else.
- Do NOT refactor, reorganize, or "improve" unrelated code.
- Do NOT add comments explaining what you changed.
- Do NOT wrap the response in markdown code blocks.
- The output must be valid TypeScript/JavaScript that compiles without errors.
- If you are unsure about a change, return the file UNCHANGED rather than risk breaking it.

Return the complete file content now:`;
    try {
      const messages = [
        { role: "system", content: "You are MiniBob, a junior engineer making SURGICAL fixes. Return ONLY valid source code. NO markdown. NO code fences. NO explanation. Start with // File: comment. Make the ABSOLUTE MINIMUM change needed. Do NOT restructure, refactor, or touch ANYTHING beyond the specific fix. If unsure, return the file unchanged." },
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
      if (newContent.includes("```") || newContent.includes("## ") || newContent.startsWith("Here") || newContent.startsWith("I have") || newContent.startsWith("Sure")) {
        console.log(chalk3.yellow("  \u26A0\uFE0F  MiniBob returned explanation instead of code. Fix rejected."));
        return;
      }
      if (newContent.length < fileContent.length * 0.5) {
        console.log(chalk3.yellow(`  \u26A0\uFE0F  MiniBob's output is ${Math.round(newContent.length / fileContent.length * 100)}% of original size. Rejecting.`));
        return;
      }
      const originalExports = fileContent.match(/export\s+(function|class|const|interface|type|async\s+function)\s+\w+/g) || [];
      for (const exp of originalExports) {
        const exportName = exp.split(/\s+/).pop();
        if (!newContent.includes(exportName)) {
          console.log(chalk3.yellow(`  \u26A0\uFE0F  MiniBob removed export "${exportName}". Rejecting.`));
          return;
        }
      }
      await proposeAndWriteFile({
        filePath: item.filePath,
        content: newContent,
        isNew: false
      });
      if (item.id) {
        markSuggestionById(item.id, category, "implemented", {
          reason: "User approved implementation from CLI",
          implementedBy: "minibob"
        });
      }
    } catch (error) {
      console.log(chalk3.red(`  \u274C Implementation failed: ${error.message}`));
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
        console.log(chalk3.green(`  \u2705 ${result.message}`));
        if (item.id) {
          markSuggestionById(item.id, category, "implemented", {
            reason: "Platform implementation",
            implementedBy: "platform"
          });
        }
      } else {
        console.log(chalk3.red("  \u274C Implementation failed on platform."));
      }
    } catch (error) {
      console.log(chalk3.red(`  \u274C ${error.message}`));
    }
  } else {
    console.log(chalk3.red("  \u274C No provider configured for implementation."));
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
  const projectName = path4.basename(cwd);
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const analysisPath = path4.join(homeDir, ".bob", "projects", projectName, "analysis", "results", "analysis.json");
  if (!fs4.existsSync(analysisPath)) return [];
  const allResults = JSON.parse(fs4.readFileSync(analysisPath, "utf-8"));
  const suggestions = [];
  for (const [filePath, fileResults] of Object.entries(allResults)) {
    const items = fileResults[category] || [];
    items.forEach((item, idx) => {
      if (!item.status || item.status === "pending") {
        suggestions.push({
          ...item,
          filePath,
          id: `${filePath.replace(/[\/\\]/g, "_")}_${idx}`
        });
      }
    });
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
  getConfig,
  setConfigValue,
  getConfigPath,
  registerLoginCommand,
  callCloudFunction,
  callLocalModel,
  buildLocalContext,
  readFileContent,
  extractProposedFile,
  stripCodeBlockFromResponse,
  proposeAndWriteFile,
  markSuggestionStatus,
  showInteractiveResults,
  loadLocalSuggestions
};
