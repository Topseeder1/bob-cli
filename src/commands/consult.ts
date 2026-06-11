import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { buildPersonalizedPrompt } from '../ai/persona.js';
import { buildLocalContext, readFileContent } from '../core/context-builder.js';
import { saveMessage } from '../core/conversation-store.js';
import { loadSummaries } from '../core/project-map.js';
import { getRelevantFileContents } from '../core/file-retrieval.js';
import { renderSessionHeader } from '../ui/session-header.js';
import { showWelcomeIfFirstRun } from '../ui/welcome.js';
import { enterDeepDive } from './deepdive.js';
import {
  startElapsedTimer,
  stopElapsedTimer,
  renderUserMessage,
  renderBobResponse,
  renderConstraintsTile,
  ResponseMetadata,
} from '../ui/chat-renderer.js';

// ─── DESIGN TOKENS ───
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const MODE_CONSULTANT = chalk.hex('#AB47BC');

// ─── SESSION STATE ───
let lastConstraints: string[] = [];

export function registerConsultCommand(program: Command): void {
  program
    .command('consult [message]')
    .description('Consult with Bob — strategic advice only, no code')
    .option('-f, --file <path>', 'Include a specific file as context')
    .option('--no-context', 'Skip local directory context')
    .option('--new', 'Start a fresh conversation')
    .option('-i, --interactive', 'Enter interactive consultant session')
    .action(async (message: string | undefined, options: { file?: string; context?: boolean; new?: boolean; interactive?: boolean }) => {
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

      if (options.interactive || !message) { await runInteractiveSession(config, conversationId, localContext); return; }
      await sendConsultMessage(message, config, conversationId, localContext, [], undefined);
    });
}

async function sendConsultMessage(message: string, config: any, conversationId: string, localContext: string, history: LocalChatMessage[], existingRl?: readline.Interface): Promise<string> {
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

    if (config.provider === 'local') {
      if (!config.localEndpoint) {
        stopElapsedTimer();
        console.log(ERROR('  ❌ No local endpoint configured.'));
        return '';
      }

      const retrieval = await getRelevantFileContents(message, config.localEndpoint!);
      const relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;

      let fullContext = localContext;
      if (relevantFiles) { fullContext += `\n\n${relevantFiles}`; }

      const systemPrompt = buildPersonalizedPrompt('consultant');
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

      saveMessage(conversationId, { sender: 'user', message, timestamp: new Date().toISOString(), type: 'text' }, { tier: 'local', provider: config.provider, mode: 'consultant' });
      saveMessage(conversationId, { sender: 'bob', message: response, timestamp: new Date().toISOString(), type: 'text' }, { tier: 'local', provider: config.provider, mode: 'consultant' });

    } else {
      if (!config.loggedIn || !config.authToken) {
        stopElapsedTimer();
        console.log(ERROR('  ❌ Not logged in.'));
        return '';
      }

      const result = await callCloudFunction('consultWithBobStream', { userEmail: config.email, userId: config.uid, conversationId, userMessage: message, useContext: true, consultantModelId: 'gemini-2.5-flash', useOrgContext: false, isPassalongActive: false, linkedConvoId: null, localContext: localContext || null });
      response = result?.text || result?.response || result?.message || 'No response received.';
      hasProjectContext = result?.hasProjectContext ?? null;
      constraints = result?.constraints || [];
      tokenCount = result?.responseTokens || undefined;
    }

    // ─── STOP TIMER ───
    const elapsedMs = stopElapsedTimer();

    // ─── STORE CONSTRAINTS ───
    lastConstraints = constraints;

    // ─── RENDER BOB'S RESPONSE ───
    const metadata: ResponseMetadata = {
      elapsedMs,
      tokenCount,
      selectedFiles,
      constraints,
      mode: 'consultant',
      tier: config.provider === 'local' ? 'local' : 'platform',
      conversationId,
    };

    await renderBobResponse(response, metadata);

    return response;

  } catch (error: any) {
    stopElapsedTimer();
    console.log(ERROR(`  ❌ ${error.message || 'Unknown error'}`));
    return '';
  }
}

async function runInteractiveSession(config: any, conversationId: string, localContext: string): Promise<void> {
  if (!config.hasSeenWelcome) { await showWelcomeIfFirstRun(); setConfigValue('hasSeenWelcome', true); }
  renderSessionHeader('consult');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: LocalChatMessage[] = [];

  const prompt = (): void => {
    rl.question(MODE_CONSULTANT('  You: '), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }

      if (trimmed === '/exit' || trimmed === '/quit') {
        console.log('');
        console.log(MUTED(`  💾 Session: ${conversationId.slice(0, 24)}...`));
        if (config.tier === 'platform' && config.provider !== 'local') {
          console.log(MUTED(`  🔗 https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
        }
        console.log(MUTED('  👋 See you next time.'));
        console.log('');
        rl.close();
        return;
      }

      if (trimmed === '/new') {
        history.length = 0;
        lastConstraints = [];
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setConfigValue('conversationId', conversationId);
        console.log(MODE_CONSULTANT('  🔄 New consultant session started.'));
        console.log('');
        prompt(); return;
      }

      if (trimmed === '/clear') { console.clear(); renderSessionHeader('consult'); prompt(); return; }

      if (trimmed === '/constraints') {
        renderConstraintsTile(lastConstraints);
        prompt(); return;
      }

      if (trimmed === '/deepdive') { await enterDeepDive(config, conversationId, rl); prompt(); return; }

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

      const response = await sendConsultMessage(trimmed, config, conversationId, localContext, history, rl);
      if (response) { history.push({ role: 'user', content: trimmed }); history.push({ role: 'assistant', content: response }); }
      prompt();
    });
  };

  prompt();
}