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
import axios2 from "axios";
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
    let status = void 0;
    const hasResponse = typeof error === "object" && error !== null && "response" in error && typeof error.response === "object" && error.response !== null;
    if (hasResponse) {
      status = error.response?.status;
    }
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
      const safeError2 = error;
      const serverMsg = safeError2.response?.data?.error?.message || safeError2.response?.data?.error || "Internal server error";
      throw new Error(`Server error: ${serverMsg}`);
    }
    if (status === 429) {
      throw new Error("Rate limited. Please wait a moment and try again.");
    }
    let errorMsg;
    const safeError = error;
    if (safeError.response?.data?.error?.message) {
      errorMsg = safeError.response.data.error.message;
    } else if (typeof error === "object" && error !== null && "message" in error) {
      errorMsg = error.message;
    } else {
      errorMsg = `Request failed with status ${status ?? "unknown"}`;
    }
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
var IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".dart_tool", ".idea", ".gradle", ".pub-cache"];
var MAX_DEPTH = 3;
async function buildLocalContext(rootDir) {
  const tree = await getDirectoryTree(rootDir, 0);
  return `Working Directory: ${rootDir}

File Tree:
${tree}`;
}
async function getDirectoryTree(dir, depth) {
  if (depth >= MAX_DEPTH) return "";
  let result = "";
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith(".") && depth === 0) continue;
      const indent = "  ".repeat(depth);
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result += `${indent}${entry.name}/
`;
        result += await getDirectoryTree(fullPath, depth + 1);
      } else {
        result += `${indent}${entry.name}
`;
      }
    }
  } catch (e) {
  }
  return result;
}
async function readFileContent(filePath) {
  try {
    return await fs.promises.readFile(path.resolve(filePath), "utf-8");
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
  proposeAndWriteFile
};
