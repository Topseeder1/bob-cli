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
import { loadSummaries } from '../core/project-map.js';
import { getRelevantFileContents } from '../core/file-retrieval.js';
import { stripCodeBlockFromResponse, processAllProposedFiles, extractAllProposedFiles } from '../core/file-writer.js';
import { enterDeepDive } from './deepdive.js';
import { renderSessionHeader } from '../ui/session-header.js';
import { showWelcomeIfFirstRun } from '../ui/welcome.js';
import {
  startElapsedTimer,
  stopElapsedTimer,
  renderUserMessage,
  renderBobResponse,
  renderFileDiff,
  renderConstraintsTile,
  ResponseMetadata,
} from '../ui/chat-renderer.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const MODE_CHAT = chalk.hex('#26C6DA');

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

      let conversationId = config.conversationId;
      if (options.new || !conversationId) {
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setConfigValue('conversationId', conversationId);
      }

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

async function sendMessage(message: string, config: any, conversationId: string, localContext: string, personalized: boolean, mode: 'standard' | 'consultant' | 'personalized', history: LocalChatMessage[], existingRl?: readline.Interface): Promise<string> {
  // ─── RENDER USER MESSAGE (RIGHT-ALIGNED) ───
  renderUserMessage(message);

  // ─── START ELAPSED TIMER ───
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

      // Handle extended response from local model (if available)
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
      const result = await callCloudFunction('chatWithBobStream', { userEmail: config.email, userId: config.uid, conversationId, userMessage: message, useContext: true, consultantModelId: 'gemini-2.5-flash', useOrgContext: false, isPassalongActive: false, linkedConvoId: null, localContext: fullContext || null });
      response = result?.text || result?.response || result?.message || 'No response received.';
      hasProjectContext = result?.hasProjectContext ?? null;
      constraints = result?.constraints || [];
      tokenCount = result?.responseTokens || undefined;
    }

    // ─── STOP TIMER ───
    const elapsedMs = stopElapsedTimer();

    // ─── STORE CONSTRAINTS FOR /constraints COMMAND ───
    lastConstraints = constraints;

    // ─── RENDER BOB'S RESPONSE FIRST ───
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

    // ─── RENDER DIFF AFTER BOB'S RESPONSE ───
    const proposals = extractAllProposedFiles(response);
    for (const proposed of proposals) {
      if (proposed.isLocal) {
        renderFileDiff(proposed.filePath, proposed.content, proposed.isNew);
      }
    }

    // ─── PROCESS FILE PROPOSALS (APPROVAL PROMPTS) ───
    await processAllProposedFiles(response, false, existingRl);

    return response;

  } catch (error: any) {
    stopElapsedTimer();
    console.log(ERROR(`  ❌ ${error.message || 'Unknown error'}`));
    return '';
  }
}

async function runInteractiveSession(config: any, conversationId: string, localContext: string, personalized: boolean, mode: 'standard' | 'consultant' | 'personalized', initialMessage?: string): Promise<void> {

  if (!config.hasSeenWelcome) { await showWelcomeIfFirstRun(); setConfigValue('hasSeenWelcome', true); }
  renderSessionHeader('chat');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: LocalChatMessage[] = [];

  if (initialMessage) {
    const response = await sendMessage(initialMessage, config, conversationId, localContext, personalized, mode, history, rl);
    if (response) {
      history.push({ role: 'user', content: initialMessage });
      history.push({ role: 'assistant', content: response });
    }
  }

  const prompt = (): void => {
    rl.question(SUCCESS('  You: '), async (input) => {
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

        // ─── FIX: Pause main rl, use raw stdin for delete confirmation ───
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

      // ─── SEND MESSAGE ───
      const response = await sendMessage(trimmed, config, conversationId, localContext, personalized, mode, history, rl);
      if (response) { history.push({ role: 'user', content: trimmed }); history.push({ role: 'assistant', content: response }); }
      prompt();
    });
  };

  prompt();
}