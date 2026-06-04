import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { STANDARD_STYLE_PROMPT } from '../ai/persona.js';
import { buildLocalContext, readFileContent } from '../core/context-builder.js';
import { renderMarkdown } from '../ui/renderer.js';
import { saveMessage } from '../core/conversation-store.js';

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
        await runInteractiveSession(config, conversationId, localContext, options.personalized || false, 'standard');
        return;
      }

      // ─── SINGLE MESSAGE MODE ───
      await sendMessage(message, config, conversationId, localContext, options.personalized || false, 'standard', []);
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
): Promise<string> {
  const spinner = ora({
    text: chalk.cyan('  Bob is thinking...'),
    spinner: 'dots',
  }).start();

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

      const messages: LocalChatMessage[] = [
        { role: 'system', content: STANDARD_STYLE_PROMPT + (localContext ? `\n\n## PROJECT CONTEXT ##\n${localContext}` : '') },
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
      }, { tier: 'local', provider: config.provider, mode });

      saveMessage(conversationId, {
        sender: 'bob',
        message: response,
        timestamp: new Date().toISOString(),
        type: 'text',
      }, { tier: 'local', provider: config.provider, mode });

    // ─── PERSONALIZATION MODE (Tier 3) ───
    } else if (personalized || config.personalizationMode) {
      if (!config.loggedIn || !config.authToken) {
        spinner.stop();
        console.log(chalk.red('  ❌ Personalization mode requires Tier 3 (platform login).'));
        return '';
      }

      const result = await callCloudFunction('getPersonalizedResponse', {
        userEmail: config.email,
        userId: config.uid,
        conversationId: conversationId,
        userMessage: message,
        useContext: true,
        localContext: localContext || null,
      });

      response = result?.text || result?.response || result?.message || 'No response received.';
      // Tier 3: backend saves messages automatically

    // ─── STANDARD PLATFORM MODE ───
    } else {
      if (!config.loggedIn || !config.authToken) {
        spinner.stop();
        console.log(chalk.red('  ❌ Not logged in.'));
        console.log(chalk.gray('  Run `bob login` to authenticate, or set provider to local.'));
        return '';
      }

      const result = await callCloudFunction('chatWithBobStream', {
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
      // Tier 3: backend saves messages automatically
    }

    spinner.stop();

    // ─── RENDER ───
    const rendered = renderMarkdown(response);
    console.log('');
    console.log(chalk.gray('  ─────────────────────────────────────'));
    console.log(chalk.bold.cyan('  🤖 Bob:'));
    console.log('');
    for (const line of rendered.split('\n')) {
      console.log(`  ${line}`);
    }
    console.log('');
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
  personalized: boolean,
  mode: 'standard' | 'consultant' | 'personalized',
): Promise<void> {
  console.log('');
  console.log(chalk.bold.cyan('  🤖 Bob — Interactive Session'));
  console.log(chalk.gray('  ─────────────────────────────────────'));
  console.log(chalk.gray('  Type your message and press Enter.'));
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
        console.log(chalk.gray('  👋 See you next time.'));
        console.log('');
        rl.close();
        return;
      }

      if (trimmed === '/new') {
        history.length = 0;
        conversationId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setConfigValue('conversationId', conversationId);
        console.log(chalk.cyan('  🔄 New session started.'));
        console.log('');
        prompt();
        return;
      }

      if (trimmed === '/clear') {
        console.clear();
        console.log(chalk.bold.cyan('  🤖 Bob — Interactive Session'));
        console.log(chalk.gray('  ─────────────────────────────────────'));
        console.log('');
        prompt();
        return;
      }

      // ─── SEND MESSAGE ───
      const response = await sendMessage(trimmed, config, conversationId, localContext, personalized, mode, history);

      if (response) {
        history.push({ role: 'user', content: trimmed });
        history.push({ role: 'assistant', content: response });
      }

      prompt();
    });
  };

  prompt();
}