import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { CONSULTANT_STYLE_PROMPT } from '../ai/persona.js';
import { buildLocalContext, readFileContent } from '../core/context-builder.js';
import { renderMarkdown } from '../ui/renderer.js';
import { saveMessage } from '../core/conversation-store.js';
import { loadSummaries } from '../core/project-map.js';
import { getRelevantFileContents } from '../core/file-retrieval.js';

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

      // ─── CONVERSATION ID ───
      let conversationId = config.conversationId;
      if (options.new || !conversationId) {
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setConfigValue('conversationId', conversationId);
      }

      // ─── BUILD LOCAL CONTEXT ───
      let localContext = '';
      if (options.context !== false) {
        localContext = buildLocalContext(process.cwd());
      }
      if (options.file) {
        const fileContent = readFileContent(options.file);
        if (fileContent) {
          localContext += `\n\n--- INCLUDED FILE: ${options.file} ---\n${fileContent}\n--- END FILE ---`;
        } else {
          console.log(chalk.yellow(`  ⚠️  Could not read file: ${options.file}`));
        }
      }

      // ─── INTERACTIVE MODE ───
      if (options.interactive || !message) {
        await runInteractiveSession(config, conversationId, localContext);
        return;
      }

      // ─── SINGLE MESSAGE MODE ───
      await sendConsultMessage(message, config, conversationId, localContext, []);
    });
}

async function sendConsultMessage(
  message: string,
  config: any,
  conversationId: string,
  localContext: string,
  history: LocalChatMessage[],
): Promise<string> {
  const spinner = ora({
    text: chalk.cyan('  Bob is thinking (consultant mode)...'),
    spinner: 'dots',
  }).start();

  let selectedFiles: string[] = [];
  let hasProjectContext: boolean | null = null;

  try {
    let response: string;

    // ─── LOCAL MODE ───
    if (config.provider === 'local') {
      if (!config.localEndpoint) {
        spinner.stop();
        console.log(chalk.red('  ❌ No local endpoint configured.'));
        console.log(chalk.gray('  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`'));
        return '';
      }

      // ─── TWO-STEP RETRIEVAL ───
      spinner.text = chalk.cyan('  Bob is finding relevant files...');
      const retrieval = await getRelevantFileContents(message, config.localEndpoint!);
      const relevantFiles = retrieval.fileContents;
      selectedFiles = retrieval.selectedFiles;

      spinner.text = chalk.cyan('  Bob is thinking (consultant mode)...');

      let fullContext = localContext;
      if (relevantFiles) {
        fullContext += `\n\n${relevantFiles}`;
      }

      const messages: LocalChatMessage[] = [
        { role: 'system', content: CONSULTANT_STYLE_PROMPT + (fullContext ? `\n\n## PROJECT CONTEXT ##\n${fullContext}` : '') },
        ...history,
        { role: 'user', content: message },
      ];

      response = await callLocalModel(config.localEndpoint, messages);

      // ─── AUTO-SAVE (Tier 1 local) ───
      saveMessage(conversationId, {
        sender: 'user',
        message: message,
        timestamp: new Date().toISOString(),
        type: 'text',
      }, { tier: 'local', provider: config.provider, mode: 'consultant' });

      saveMessage(conversationId, {
        sender: 'bob',
        message: response,
        timestamp: new Date().toISOString(),
        type: 'text',
      }, { tier: 'local', provider: config.provider, mode: 'consultant' });

    // ─── PLATFORM MODE ───
    } else {
      if (!config.loggedIn || !config.authToken) {
        spinner.stop();
        console.log(chalk.red('  ❌ Not logged in.'));
        console.log(chalk.gray('  Run `bob login` to authenticate, or set provider to local.'));
        return '';
      }

      const result = await callCloudFunction('consultWithBobStream', {
        userEmail: config.email,
        userId: config.uid,
        conversationId: conversationId,
        userMessage: message,
        useContext: true,
        consultantModelId: 'gemini-2.5-flash',
        useOrgContext: false,
        isPassalongActive: false,
        linkedConvoId: null,
        localContext: localContext || null,
      });

      response = result?.text || result?.response || result?.message || 'No response received.';
      hasProjectContext = result?.hasProjectContext ?? null;
    }

    spinner.stop();

    // ─── RENDER ───
    const rendered = renderMarkdown(response);
    console.log('');
    console.log(chalk.gray('  ─────────────────────────────────────'));
    console.log(chalk.bold.magenta('  🎯 Bob (Consultant):'));
    console.log('');
    for (const line of rendered.split('\n')) {
      console.log(`  ${line}`);
    }
    console.log('');
    if (selectedFiles.length > 0) {
      console.log(chalk.gray(`  📂 Referenced: ${selectedFiles.join(', ')}`));
    }

    // ─── TIER 3 FOOTER ───
    if (config.tier === 'platform' && config.provider !== 'local') {
      console.log(chalk.gray(`  🔗 https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
      if (hasProjectContext === false) {
        console.log(chalk.red('  ⚠️  No project workspace connected. Upload a project via the web app'));
        console.log(chalk.red('     for full RAG + workspace capabilities.'));
      }
    }

    console.log(chalk.gray('  ─────────────────────────────────────'));
    console.log('');

    return response;

  } catch (error: any) {
    spinner.stop();
    console.log(chalk.red(`  ❌ ${error.message || 'Unknown error'}`));
    return '';
  }
}

async function runInteractiveSession(
  config: any,
  conversationId: string,
  localContext: string,
): Promise<void> {
  const summaries = loadSummaries(process.cwd());
  const isIndexed = summaries && Object.keys(summaries).length > 0;

  console.log('');
  console.log(chalk.bold.magenta('  🎯 Bob — Consultant Session'));
  console.log(chalk.gray('  ─────────────────────────────────────'));
  if (isIndexed) {
    console.log(chalk.green(`  📚 Project indexed (${Object.keys(summaries!).length} files). Intelligent file selection active.`));
  } else {
    console.log(chalk.yellow('  ⚠️  Project not indexed. Run `bob index` for smarter responses.'));
  }
  if (config.tier === 'platform' && config.provider !== 'local') {
    console.log(chalk.gray(`  🔗 ${conversationId}`));
  }
  console.log(chalk.gray('  Strategic advice only. No code.'));
  console.log(chalk.gray('  Commands: /exit  /new  /clear'));
  console.log(chalk.gray('  ─────────────────────────────────────'));
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history: LocalChatMessage[] = [];

  const prompt = (): void => {
    rl.question(chalk.green('  You: '), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // ─── SLASH COMMANDS ───
      if (trimmed === '/exit' || trimmed === '/quit') {
        console.log('');
        console.log(chalk.gray(`  💾 Session: ${conversationId.slice(0, 24)}...`));
        if (config.tier === 'platform' && config.provider !== 'local') {
          console.log(chalk.gray(`  🔗 https://bobs-workshop.web.app/#/bobcodeassistant/${conversationId}`));
        }
        console.log(chalk.gray('  👋 See you next time.'));
        console.log('');
        rl.close();
        return;
      }

      if (trimmed === '/new') {
        history.length = 0;
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setConfigValue('conversationId', conversationId);
        console.log(chalk.magenta('  🔄 New consultant session started.'));
        console.log('');
        prompt();
        return;
      }

      if (trimmed === '/clear') {
        console.clear();
        console.log(chalk.bold.magenta('  🎯 Bob — Consultant Session'));
        console.log(chalk.gray('  ─────────────────────────────────────'));
        console.log('');
        prompt();
        return;
      }

      // ─── SEND MESSAGE ───
      const response = await sendConsultMessage(trimmed, config, conversationId, localContext, history);

      if (response) {
        history.push({ role: 'user', content: trimmed });
        history.push({ role: 'assistant', content: response });
      }

      prompt();
    });
  };

  prompt();
}