// File: src/commands/chat.ts

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { buildPersonalizedPrompt } from '../ai/persona.js';
import { buildLocalContext, readFileContent } from '../core/context-builder.js';
import { saveMessage } from '../core/conversation-store.js';
import { loadSummaries, getActiveConversationId, setActiveConversationId } from '../core/project-map.js';
import { getRelevantFileContents } from '../core/file-retrieval.js';
import { stripCodeBlockFromResponse, processAllProposedFiles, extractAllProposedFiles } from '../core/file-writer.js';
import { enterDeepDive } from './deepdive.js';
import { renderSessionHeader } from '../ui/session-header.js';
import { showWelcomeIfFirstRun } from '../ui/welcome.js';
import { ensureProvider } from '../core/provider-detect.js';
import {
  startElapsedTimer,
  stopElapsedTimer,
  renderUserMessage,
  renderBobResponse,
  renderFileDiff,
  renderConstraintsTile,
  ResponseMetadata,
} from '../ui/chat-renderer.js';
import { detectReference, fetchAvailableReferences, fetchProjectFiles, loadStickyReference, saveStickyReference } from '../core/reference-resolver.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const MODE_CHAT = chalk.hex('#26C6DA');
const AMBER = chalk.hex('#FFAB00');

// ─── SESSION STATE ───
let lastConstraints: string[] = [];

export function registerChatCommand(program: Command): void {
  program
    .command('chat [message]')
    .description('Chat with Bob — code-friendly engineering partner')
    .option('-f, --file <path>', 'Include a specific file as context')
    .option('--no-context', 'Skip local directory context')
    .option('--personalized', 'Use personalization mode (Tier 3 only)')
    .option('--new', 'Start a fresh conversation')
    .option('-i, --interactive', 'Enter interactive conversation mode')
    .action(async (message: string | undefined, options: { file?: string; context?: boolean; personalized?: boolean; new?: boolean; interactive?: boolean }) => {
      const config = getConfig();

      // ─── PROJECT-SCOPED conversation ID ──────────────────────────
      let conversationId = getActiveConversationId(process.cwd())
        || config.conversationId
        || null;

      if (options.new || !conversationId) {
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setActiveConversationId(conversationId, process.cwd());
        setConfigValue('conversationId', conversationId);
      }
      // ─────────────────────────────────────────────────────────────

      let localContext = '';
      if (options.context !== false) { localContext = buildLocalContext(process.cwd()); }
      if (options.file) {
        const fileContent = readFileContent(options.file);
        if (fileContent) { localContext += `\n\n--- INCLUDED FILE: ${options.file} ---\n${fileContent}\n--- END FILE ---`; }
        else { console.log(WARNING(`  ⚠️  Could not read file: ${options.file}`)); }
      }

      if (options.interactive || !message || options.personalized) {
        if (options.personalized && message) {
          await runInteractiveSession(config, conversationId, localContext, true, 'personalized', message);
        } else {
          await runInteractiveSession(config, conversationId, localContext, options.personalized || false, 'standard');
        }
        return;
      }

      await sendMessage(message, config, conversationId, localContext, options.personalized || false, 'standard', [], undefined);
    });
}

async function sendMessage(
  message: string,
  config: any,
  conversationId: string,
  localContext: string,
  personalized: boolean,
  mode: 'standard' | 'consultant' | 'personalized',
  history: LocalChatMessage[],
  existingRl?: readline.Interface,
  activeRef?: { alias: string; filename?: string } | null
): Promise<string> {
  const providerReady = await ensureProvider();
  if (!providerReady) return '';
  config = getConfig();
  renderUserMessage(message);
  startElapsedTimer();

  let selectedFiles: string[] = [];
  let hasProjectContext: boolean | null = null;
  let constraints: string[] = [];
  let tokenCount: number | undefined = undefined;

  try {
    let response: string;

    let relevantFiles = '';
    if (config.localEndpoint) {
      const lastAssistantMsg = history.length > 0 ? history[history.length - 1]?.content?.slice(0, 500) || '' : '';
      const retrievalQuery = lastAssistantMsg
        ? `Previous context: ${lastAssistantMsg}\n\nCurrent request: ${message}`
        : message;
      const retrieval = await getRelevantFileContents(retrievalQuery, config.localEndpoint);
      relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;
    }

    let fullContext = localContext;
    if (relevantFiles) { fullContext += `\n\n${relevantFiles}`; }

    if (config.provider === 'local') {
      if (!config.localEndpoint) {
        stopElapsedTimer();
        console.log(ERROR('  ❌ No local endpoint configured.'));
        return '';
      }

      const systemPrompt = buildPersonalizedPrompt('standard');
      const messages: LocalChatMessage[] = [
        { role: 'system', content: systemPrompt + (fullContext ? `\n\n## PROJECT CONTEXT ##\n${fullContext}` : '') },
        ...history,
        { role: 'user', content: message },
      ];

      const localResult = await callLocalModel(config.localEndpoint, messages);

      if (typeof localResult === 'object' && localResult.text) {
        response = localResult.text;
        tokenCount = localResult.evalCount || undefined;
      } else {
        response = localResult as unknown as string;
      }

      saveMessage(conversationId, { sender: 'user', message, timestamp: new Date().toISOString(), type: 'text' }, { tier: 'local', provider: config.provider, mode });
      saveMessage(conversationId, { sender: 'bob', message: response, timestamp: new Date().toISOString(), type: 'text' }, { tier: 'local', provider: config.provider, mode });

    } else if (personalized || config.personalizationMode) {
      if (!config.loggedIn || !config.authToken) {
        stopElapsedTimer();
        console.log(ERROR('  ❌ Personalization mode requires Tier 3.'));
        return '';
      }
      await callCloudFunction('saveCLIConversationMessage', { conversationId, message, sender: 'user' });
      const result = await callCloudFunction('getPersonalizedResponse', {
        email: config.email,
        uid: config.uid,
        conversationId,
        userMessage: message,
        additionalContext: { localContext: fullContext || null },
        isLocalModel: false,
        activePersonaId: null,
        // ─── REFERENCE PARAMS ───
        ...(activeRef && { referenceAlias: activeRef.alias }),
        ...(activeRef?.filename && { referenceFilename: activeRef.filename }),
      });
      response = result?.response || result?.data?.response || result?.text || result?.message || 'No response received.';
      hasProjectContext = result?.hasProjectContext ?? null;
      constraints = result?.constraints || result?.data?.constraints || [];
      tokenCount = result?.usageMetadata?.candidatesTokenCount || result?.data?.usageMetadata?.candidatesTokenCount || undefined;

    } else {
      if (!config.loggedIn || !config.authToken) {
        stopElapsedTimer();
        console.log(ERROR('  ❌ Not logged in.'));
        console.log(MUTED('  Run `bob login` to authenticate, or set provider to local.'));
        return '';
      }
      const result = await callCloudFunction('chatWithBobStream', {
        userEmail: config.email,
        userId: config.uid,
        conversationId,
        userMessage: message,
        useContext: true,
        consultantModelId: 'gemini-2.5-flash',
        useOrgContext: false,
        isPassalongActive: false,
        linkedConvoId: null,
        localContext: fullContext || null,
        // ─── REFERENCE PARAMS ───
        ...(activeRef && { referenceAlias: activeRef.alias }),
        ...(activeRef?.filename && { referenceFilename: activeRef.filename }),
      });
      response = result?.text || result?.response || result?.message || 'No response received.';
      hasProjectContext = result?.hasProjectContext ?? null;
      constraints = result?.constraints || [];
      tokenCount = result?.responseTokens || undefined;
    }

    const elapsedMs = stopElapsedTimer();
    lastConstraints = constraints;

    const displayResponse = stripCodeBlockFromResponse(response);
    const metadata: ResponseMetadata = {
      elapsedMs,
      tokenCount,
      selectedFiles,
      constraints,
      mode: mode === 'standard' ? 'chat' : mode === 'consultant' ? 'consultant' : 'chat',
      tier: config.provider === 'local' ? 'local' : 'platform',
      conversationId,
    };

    await renderBobResponse(displayResponse, metadata);

    const proposals = extractAllProposedFiles(response);
    for (const proposed of proposals) {
      if (proposed.isLocal) {
        renderFileDiff(proposed.filePath, proposed.content, proposed.isNew);
      }
    }

    await processAllProposedFiles(response, false, existingRl);

    return response;

  } catch (error: any) {
    stopElapsedTimer();
    console.log(ERROR(`  ❌ ${error.message || 'Unknown error'}`));
    return '';
  }
}

async function runInteractiveSession(
  config: any,
  conversationId: string,
  localContext: string,
  personalized: boolean,
  mode: 'standard' | 'consultant' | 'personalized',
  initialMessage?: string
): Promise<void> {

  if (!config.hasSeenWelcome) { await showWelcomeIfFirstRun(); setConfigValue('hasSeenWelcome', true); }
  renderSessionHeader('chat');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: LocalChatMessage[] = [];

  // ─── REFERENCE STATE ───
  const domain = config.email?.split('@').pop()?.toLowerCase() ?? '';
  const uid = config.uid ?? '';
  const convoDocPath = `Organizations/${domain}/OrgUsers/${uid}/BobGlobalChat/${conversationId}`;
  let stickyRef = await loadStickyReference(convoDocPath);

  if (initialMessage) {
    const inlineRef = detectReference(initialMessage);
    const activeRef = inlineRef ?? stickyRef ?? null;
    const response = await sendMessage(initialMessage, config, conversationId, localContext, personalized, mode, history, rl, activeRef);
    if (response) {
      history.push({ role: 'user', content: initialMessage });
      history.push({ role: 'assistant', content: response });
    }
  }

  const prompt = (): void => {
    const promptText = stickyRef
      ? AMBER(`  📌 /${stickyRef!.alias} › `)
      : SUCCESS('  You: ');

    rl.question(promptText, async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }

      // ─── SLASH COMMANDS ───
      if (trimmed === '/exit' || trimmed === '/quit') {
        console.log('');
        console.log(MUTED(`  💾 Session: ${conversationId.slice(0, 24)}...`));
        if (config.tier === 'platform' && config.provider !== 'local') {
          console.log(MUTED(`  🔗 https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
        }
        console.log(MUTED('  👋 See you next time.'));
        console.log('');
        rl.close(); return;
      }

      if (trimmed === '/new') {
        history.length = 0;
        lastConstraints = [];
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setActiveConversationId(conversationId, process.cwd());
        setConfigValue('conversationId', conversationId);
        console.log(INFO('  🔄 New session started.'));
        console.log('');
        prompt(); return;
      }

      if (trimmed === '/clear') { console.clear(); renderSessionHeader('chat'); prompt(); return; }

      if (trimmed === '/constraints') {
        renderConstraintsTile(lastConstraints);
        prompt(); return;
      }

      // ─── /ref — Browse reference projects ───
      if (trimmed === '/ref') {
        stickyRef = await handleRefBrowser(domain, uid, convoDocPath, rl);
        prompt(); return;
      }

      // ─── /pin — Toggle sticky reference ───
      if (trimmed === '/pin') {
        if (stickyRef) {
          await saveStickyReference(convoDocPath, null, false);
          stickyRef = null;
          console.log('');
          console.log(MUTED('  📌 Sticky reference cleared.'));
          console.log('');
        } else {
          stickyRef = await handleRefBrowser(domain, uid, convoDocPath, rl);
        }
        prompt(); return;
      }

      if (trimmed.startsWith('/include ')) {
        const filePath = trimmed.slice(9).trim();
        const content = readFileContent(filePath);
        if (content) {
          localContext += `\n\n--- INCLUDED FILE: ${filePath} ---\n${content}\n--- END FILE ---`;
          console.log(SUCCESS(`  📄 Loaded: ${filePath} (${content.split('\n').length} lines)`));
        } else {
          console.log(ERROR(`  ❌ Could not read: ${filePath}`));
        }
        console.log('');
        prompt(); return;
      }

      if (trimmed.startsWith('/delete ')) {
        const filePath = trimmed.slice(8).trim();
        const absolutePath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(absolutePath)) { console.log(ERROR(`  ❌ File not found: ${filePath}`)); console.log(''); prompt(); return; }

        rl.pause();
        const confirmPromptText = ERROR(`  🗑️  Delete ${filePath}? (y/n): `);
        const confirm = await new Promise<string>(resolve => {
          process.stdout.write(confirmPromptText);
          process.stdin.resume();
          process.stdin.setEncoding('utf-8');
          let inputBuffer = '';
          const onData = (chunk: string) => {
            const newlineIdx = chunk.indexOf('\n');
            if (newlineIdx !== -1) {
              inputBuffer += chunk.slice(0, newlineIdx);
              process.stdin.removeListener('data', onData);
              process.stdin.pause();
              resolve(inputBuffer.replace(/\r/g, '').trim());
            } else {
              inputBuffer += chunk;
            }
          };
          process.stdin.on('data', onData);
        });
        rl.resume();

        if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
          try {
            const backupDir = path.join(process.cwd(), '.bob-backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            fs.copyFileSync(absolutePath, path.join(backupDir, filePath.replace(/[\/\\]/g, '_') + `.${Date.now()}.deleted`));
            fs.unlinkSync(absolutePath);
            console.log(SUCCESS(`  ✅ Deleted: ${filePath}`));
            console.log(MUTED(`  📦 Backup saved to .bob-backups/`));
          } catch (e: any) { console.log(ERROR(`  ❌ Delete failed: ${e.message}`)); }
        } else { console.log(MUTED('  Cancelled.')); }
        console.log('');
        prompt(); return;
      }

      if (trimmed === '/deepdive') { await enterDeepDive(config, conversationId, rl); prompt(); return; }

      // ─── Detect inline reference — falls back to sticky ───
      const inlineRef = detectReference(trimmed);
      const activeRef = inlineRef ?? stickyRef ?? null;

      if (activeRef) {
        console.log('');
        console.log(AMBER(`  📎 Referencing /${activeRef.alias}${activeRef.filename ? ` — ${activeRef.filename}` : ''}...`));
      }

      // ─── SEND MESSAGE ───
      const response = await sendMessage(trimmed, config, conversationId, localContext, personalized, mode, history, rl, activeRef);
      if (response) { history.push({ role: 'user', content: trimmed }); history.push({ role: 'assistant', content: response }); }
      prompt();
    });
  };

  prompt();
}

// ─── REF BROWSER ─────────────────────────────────────────────────

async function handleRefBrowser(
  domain: string,
  uid: string,
  docPath: string,
  rl: readline.Interface
): Promise<{ alias: string; filename?: string } | null> {
  const refs = await fetchAvailableReferences(domain, uid);

  if (refs.length === 0) {
    console.log('');
    console.log(MUTED('  No shared references available for your account.'));
    console.log('');
    return null;
  }

  console.log('');
  console.log(AMBER('  ╔══════════════════════════════════════════╗'));
  console.log(AMBER('  ║') + chalk.bold('  📎 AVAILABLE REFERENCES                ') + AMBER('║'));
  console.log(AMBER('  ╠══════════════════════════════════════════╣'));

  refs.forEach((ref, i) => {
    const line = `  ${String(i + 1).padStart(2)}. /${ref.alias.padEnd(18)} ${MUTED(ref.repoDisplayName)}`;
    console.log(AMBER('  ║') + line);
  });

  console.log(AMBER('  ╠══════════════════════════════════════════╣'));
  console.log(AMBER('  ║') + MUTED('  Enter number to select, 0 to cancel     ') + AMBER('║'));
  console.log(AMBER('  ╚══════════════════════════════════════════╝'));
  console.log('');

  const answer = await new Promise<string>(resolve => {
    rl.question(AMBER('  Select reference: '), resolve);
  });

  const num = parseInt(answer.trim());
  if (isNaN(num) || num === 0 || num < 1 || num > refs.length) {
    console.log(MUTED('  Cancelled.'));
    console.log('');
    return null;
  }

  const selected = refs[num - 1];

  const modeAnswer = await new Promise<string>(resolve => {
    rl.question(AMBER(`  /${selected.alias} — whole project (p) or specific file (f)? `), resolve);
  });

  if (modeAnswer.trim().toLowerCase() === 'f') {
    return await handleFileBrowser(domain, selected, rl, docPath);
  }

  // Whole project — save as sticky
  await saveStickyReference(docPath, selected.alias, true);
  console.log('');
  console.log(AMBER(`  📌 Sticky reference set: /${selected.alias}`));
  console.log('');
  return { alias: selected.alias };
}

async function handleFileBrowser(
  domain: string,
  project: { alias: string; projectId: string; repoDisplayName: string },
  rl: readline.Interface,
  docPath: string
): Promise<{ alias: string; filename?: string } | null> {
  const filterAnswer = await new Promise<string>(resolve => {
    rl.question(AMBER('  Filter files (or Enter for all): '), resolve);
  });

  const files = await fetchProjectFiles(domain, project.projectId, filterAnswer.trim());

  if (files.length === 0) {
    console.log(MUTED('  No files found. Referencing whole project.'));
    console.log('');
    return { alias: project.alias };
  }

  console.log('');
  console.log(AMBER(`  ╔══════════════════════════════════════════╗`));
  console.log(AMBER(`  ║`) + chalk.bold(`  📄 /${project.alias} — Files               `) + AMBER(`║`));
  console.log(AMBER(`  ╠══════════════════════════════════════════╣`));

  files.slice(0, 20).forEach((fp, i) => {
    const line = `  ${String(i + 1).padStart(2)}. ${fp}`;
    console.log(AMBER('  ║') + MUTED(line.slice(0, 42).padEnd(42)) + AMBER('║'));
  });

  console.log(AMBER(`  ╚══════════════════════════════════════════╝`));
  console.log('');

  const fileAnswer = await new Promise<string>(resolve => {
    rl.question(AMBER('  Select file (or Enter for whole project): '), resolve);
  });

  const fileNum = parseInt(fileAnswer.trim());
  if (isNaN(fileNum) || fileNum < 1 || fileNum > files.length) {
    return { alias: project.alias };
  }

  const filename = files[fileNum - 1];
  console.log('');
  console.log(AMBER(`  📎 File reference: /${project.alias} — ${filename}`));
  console.log('');
  return { alias: project.alias, filename };
}