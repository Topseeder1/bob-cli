import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { buildPersonalizedPrompt } from '../ai/persona.js';
import { buildLocalContext, readFileContent } from '../core/context-builder.js';
import { renderMarkdown } from '../ui/renderer.js';
import { saveMessage } from '../core/conversation-store.js';
import { loadSummaries } from '../core/project-map.js';
import { getRelevantFileContents } from '../core/file-retrieval.js';
import { stripCodeBlockFromResponse, processAllProposedFiles } from '../core/file-writer.js';
import { enterDeepDive } from './deepdive.js';
import { renderSessionHeader } from '../ui/session-header.js';
import { showWelcomeIfFirstRun } from '../ui/welcome.js';

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
        else { console.log(chalk.yellow(`  ⚠️  Could not read file: ${options.file}`)); }
      }

      if (options.interactive || !message || options.personalized) {
        // If personalized with a message, send it first then go interactive
        if (options.personalized && message) {
          await runInteractiveSession(config, conversationId, localContext, true, 'personalized', message);
        } else {
          await runInteractiveSession(config, conversationId, localContext, options.personalized || false, 'standard');
        }
        return;
      }

      await sendMessage(message, config, conversationId, localContext, options.personalized || false, 'standard', []);
    });
}

async function sendMessage(message: string, config: any, conversationId: string, localContext: string, personalized: boolean, mode: 'standard' | 'consultant' | 'personalized', history: LocalChatMessage[]): Promise<string> {
  const spinner = ora({ text: chalk.cyan('  Bob is thinking...'), spinner: 'dots' }).start();

  let selectedFiles: string[] = [];
  let hasProjectContext: boolean | null = null;

  try {
    let response: string;

    let relevantFiles = '';
    if (config.localEndpoint) {
      spinner.text = chalk.cyan('  Bob is finding relevant files...');
      // Use last assistant message for context when current message is short/vague
      const lastAssistantMsg = history.length > 0 ? history[history.length - 1]?.content?.slice(0, 500) || '' : '';
      const retrievalQuery = lastAssistantMsg
        ? `Previous context: ${lastAssistantMsg}\n\nCurrent request: ${message}`
        : message;
      const retrieval = await getRelevantFileContents(retrievalQuery, config.localEndpoint);
      relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;
    }

    spinner.text = chalk.cyan('  Bob is thinking...');

    let fullContext = localContext;
    if (relevantFiles) { fullContext += `\n\n${relevantFiles}`; }

    if (config.provider === 'local') {
      if (!config.localEndpoint) { spinner.stop(); console.log(chalk.red('  ❌ No local endpoint configured.')); return ''; }

      const systemPrompt = buildPersonalizedPrompt('standard');
      const messages: LocalChatMessage[] = [
        { role: 'system', content: systemPrompt + (fullContext ? `\n\n## PROJECT CONTEXT ##\n${fullContext}` : '') },
        ...history,
        { role: 'user', content: message },
      ];

      response = await callLocalModel(config.localEndpoint, messages);
      saveMessage(conversationId, { sender: 'user', message, timestamp: new Date().toISOString(), type: 'text' }, { tier: 'local', provider: config.provider, mode });
      saveMessage(conversationId, { sender: 'bob', message: response, timestamp: new Date().toISOString(), type: 'text' }, { tier: 'local', provider: config.provider, mode });

    } else if (personalized || config.personalizationMode) {
      if (!config.loggedIn || !config.authToken) { spinner.stop(); console.log(chalk.red('  ❌ Personalization mode requires Tier 3.')); return ''; }
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

    } else {
      if (!config.loggedIn || !config.authToken) { spinner.stop(); console.log(chalk.red('  ❌ Not logged in.')); console.log(chalk.gray('  Run `bob login` to authenticate, or set provider to local.')); return ''; }
      const result = await callCloudFunction('chatWithBobStream', { userEmail: config.email, userId: config.uid, conversationId, userMessage: message, useContext: true, consultantModelId: 'gemini-2.5-flash', useOrgContext: false, isPassalongActive: false, linkedConvoId: null, localContext: fullContext || null });
      response = result?.text || result?.response || result?.message || 'No response received.';
      hasProjectContext = result?.hasProjectContext ?? null;
    }

    spinner.stop();

    const displayResponse = stripCodeBlockFromResponse(response);
    const rendered = renderMarkdown(displayResponse);

    console.log('');
    console.log(chalk.gray('  ─────────────────────────────────────'));
    console.log(chalk.bold.cyan('  🤖 Bob:'));
    console.log('');
    for (const line of rendered.split('\n')) { console.log(`  ${line}`); }
    console.log('');
    if (selectedFiles.length > 0) { console.log(chalk.gray(`  📂 Referenced: ${selectedFiles.join(', ')}`)); }

    if (config.tier === 'platform' && config.provider !== 'local') {
      console.log(chalk.gray(`  🔗 https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
      if (hasProjectContext === false) {
        console.log(chalk.red('  ⚠️  No project workspace connected. Upload a project via the web app'));
        console.log(chalk.red('     for full RAG + workspace capabilities.'));
      }
    }

    console.log(chalk.gray('  ─────────────────────────────────────'));
    console.log('');

    await processAllProposedFiles(response);

    return response;

  } catch (error: any) { spinner.stop(); console.log(chalk.red(`  ❌ ${error.message || 'Unknown error'}`)); return ''; }
}

async function runInteractiveSession(config: any, conversationId: string, localContext: string, personalized: boolean, mode: 'standard' | 'consultant' | 'personalized', initialMessage?: string): Promise<void> {

  if (!config.hasSeenWelcome) { await showWelcomeIfFirstRun(); setConfigValue('hasSeenWelcome', true); }
  renderSessionHeader('chat');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: LocalChatMessage[] = [];
  if (initialMessage) {
    const response = await sendMessage(initialMessage, config, conversationId, localContext, personalized, mode, history);
    if (response) {
      history.push({ role: 'user', content: initialMessage });
      history.push({ role: 'assistant', content: response });
    }
  }
  const prompt = (): void => {
    rl.question(chalk.green('  You: '), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }

      if (trimmed === '/exit' || trimmed === '/quit') {
        console.log('');
        console.log(chalk.gray(`  💾 Session: ${conversationId.slice(0, 24)}...`));
        if (config.tier === 'platform' && config.provider !== 'local') { console.log(chalk.gray(`  🔗 https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`)); }
        console.log(chalk.gray('  👋 See you next time.'));
        console.log('');
        rl.close(); return;
      }

      if (trimmed === '/new') { history.length = 0; conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; setConfigValue('conversationId', conversationId); console.log(chalk.cyan('  🔄 New session started.')); console.log(''); prompt(); return; }
      if (trimmed === '/clear') { console.clear(); renderSessionHeader('chat'); prompt(); return; }

      if (trimmed.startsWith('/include ')) {
        const filePath = trimmed.slice(9).trim();
        const content = readFileContent(filePath);
        if (content) { localContext += `\n\n--- INCLUDED FILE: ${filePath} ---\n${content}\n--- END FILE ---`; console.log(chalk.green(`  📄 Loaded: ${filePath} (${content.split('\n').length} lines)`)); }
        else { console.log(chalk.red(`  ❌ Could not read: ${filePath}`)); }
        console.log(''); prompt(); return;
      }

      if (trimmed.startsWith('/delete ')) {
        const filePath = trimmed.slice(8).trim();
        const absolutePath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(absolutePath)) { console.log(chalk.red(`  ❌ File not found: ${filePath}`)); console.log(''); prompt(); return; }
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        const confirm = await new Promise<string>(resolve => { rl2.question(chalk.red(`  🗑️  Delete ${filePath}? (y/n): `), resolve); });
        rl2.close();
        if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
          try {
            const backupDir = path.join(process.cwd(), '.bob-backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            fs.copyFileSync(absolutePath, path.join(backupDir, filePath.replace(/[\/\\]/g, '_') + `.${Date.now()}.deleted`));
            fs.unlinkSync(absolutePath);
            console.log(chalk.green(`  ✅ Deleted: ${filePath}`));
            console.log(chalk.gray(`  📦 Backup saved to .bob-backups/`));
          } catch (e: any) { console.log(chalk.red(`  ❌ Delete failed: ${e.message}`)); }
        } else { console.log(chalk.gray('  Cancelled.')); }
        console.log(''); prompt(); return;
      }

      if (trimmed === '/deepdive') { await enterDeepDive(config, conversationId, rl); prompt(); return; }

      const response = await sendMessage(trimmed, config, conversationId, localContext, personalized, mode, history);
      if (response) { history.push({ role: 'user', content: trimmed }); history.push({ role: 'assistant', content: response }); }
      prompt();
    });
  };

  prompt();
}