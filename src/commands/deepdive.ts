import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { renderMarkdown } from '../ui/renderer.js';
import { startDeepDiveAnimation } from '../ui/animations/deep-dive.js';

const DIVE_BORDER = chalk.blue;

export function registerDeepDiveCommand(program: Command): void {
  program
    .command('deepdives')
    .description('List all deep dives in the current conversation')
    .action(async () => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(chalk.red('  ❌ Not logged in. Deep dives require Tier 3.'));
        console.log('');
        return;
      }

      if (!config.conversationId) {
        console.log('');
        console.log(chalk.red('  ❌ No active conversation.'));
        console.log('');
        return;
      }

      const spinner = ora({ text: chalk.cyan('  Loading deep dives...'), spinner: 'dots' }).start();

      try {
        const result = await callCloudFunction('listCLIDeepDives', {
          conversationId: config.conversationId,
        });

        spinner.stop();
        const dives = result.deepDives || [];

        console.log('');
        console.log(DIVE_BORDER('  ╔══════════════════════════════════════════╗'));
        console.log(DIVE_BORDER('  ║') + chalk.bold.blue('  🤿 Deep Dives                          ') + DIVE_BORDER('║'));
        console.log(DIVE_BORDER('  ╠══════════════════════════════════════════╣'));

        if (dives.length === 0) {
          console.log(DIVE_BORDER('  ║') + chalk.gray('  No deep dives yet.                      ') + DIVE_BORDER('║'));
          console.log(DIVE_BORDER('  ║') + chalk.gray('  Use `bob deepdive` to create one.       ') + DIVE_BORDER('║'));
        } else {
          for (const dive of dives) {
            const preview = (dive.initiatingPrompt || 'No prompt').slice(0, 35);
            const msgs = dive.messageCount || 0;
            console.log(DIVE_BORDER('  ║') + `  ${chalk.blue(dive.parentMessageId.slice(0, 8))}  ${chalk.white(preview)}${preview.length >= 35 ? '...' : ''}`);
            console.log(DIVE_BORDER('  ║') + chalk.gray(`    ${msgs} messages | ${dive.status || 'active'}`));
          }
        }

        console.log(DIVE_BORDER('  ╚══════════════════════════════════════════╝'));
        console.log('');
        console.log(chalk.gray('  Commands:'));
        console.log(chalk.gray('    bob deepdive        — Create a new deep dive'));
        console.log(chalk.gray('    bob deepdives-join  — Re-enter an existing deep dive'));
        console.log('');

      } catch (error: any) {
        spinner.stop();
        console.log(chalk.red(`  ❌ ${error.message}`));
        console.log('');
      }
    });

  // bob deepdives-join
  program
    .command('deepdives-join')
    .description('Re-enter an existing deep dive')
    .action(async () => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(chalk.red('  ❌ Not logged in. Deep dives require Tier 3.'));
        console.log('');
        return;
      }

      if (!config.conversationId) {
        console.log('');
        console.log(chalk.red('  ❌ No active conversation.'));
        console.log('');
        return;
      }

      const spinner = ora({ text: chalk.cyan('  Loading deep dives...'), spinner: 'dots' }).start();

      try {
        const result = await callCloudFunction('listCLIDeepDives', {
          conversationId: config.conversationId,
        });

        spinner.stop();
        const dives = result.deepDives || [];

        if (dives.length === 0) {
          console.log('');
          console.log(chalk.yellow('  ⚠️  No deep dives in this conversation.'));
          console.log(chalk.gray('  Use `bob deepdive` to create one.'));
          console.log('');
          return;
        }

        console.log('');
        console.log(DIVE_BORDER('  ╔══════════════════════════════════════════╗'));
        console.log(DIVE_BORDER('  ║') + chalk.bold.blue('  🤿 Select a deep dive to re-enter       ') + DIVE_BORDER('║'));
        console.log(DIVE_BORDER('  ╠══════════════════════════════════════════╣'));

        for (let i = 0; i < dives.length; i++) {
          const dive = dives[i];
          const preview = (dive.initiatingPrompt || 'No prompt').slice(0, 35);
          const msgs = dive.messageCount || 0;
          console.log(DIVE_BORDER('  ║') + `  ${chalk.cyan(String(i + 1).padStart(2))}. ${chalk.white(preview)}${preview.length >= 35 ? '...' : ''}`);
          console.log(DIVE_BORDER('  ║') + chalk.gray(`      ${msgs} messages | ${dive.status || 'active'}`));
        }

        console.log(DIVE_BORDER('  ╚══════════════════════════════════════════╝'));
        console.log('');

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve => {
          rl.question(chalk.blue('  Select (1-' + dives.length + ') or 0 to cancel: '), resolve);
        });

        const selection = parseInt(answer.trim());

        if (isNaN(selection) || selection === 0 || selection < 1 || selection > dives.length) {
          rl.close();
          console.log(chalk.gray('  Cancelled.'));
          return;
        }

        const selectedDive = dives[selection - 1];
        const parentMessageId = selectedDive.parentMessageId;
        const initiatingPrompt = selectedDive.initiatingPrompt || 'Deep dive session';

        // Play animation on re-entry
        const animation = startDeepDiveAnimation();
        await new Promise(resolve => setTimeout(resolve, 2000));
        animation.stop();
        await new Promise(resolve => setTimeout(resolve, 300));

        await runDeepDiveSession(config, config.conversationId!, parentMessageId, initiatingPrompt, rl);
        rl.close();

      } catch (error: any) {
        spinner.stop();
        console.log(chalk.red(`  ❌ ${error.message}`));
        console.log('');
      }
    });

  // bob deepdive — create new
  program
    .command('deepdive')
    .description('Create a new deep dive on a Bob message')
    .action(async () => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(chalk.red('  ❌ Not logged in. Deep dives require Tier 3.'));
        console.log(chalk.gray('  Run `bob login` to authenticate.'));
        console.log('');
        return;
      }

      if (!config.conversationId) {
        console.log('');
        console.log(chalk.red('  ❌ No active conversation.'));
        console.log(chalk.gray('  Join one with `bob conversations join` first.'));
        console.log('');
        return;
      }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await enterDeepDive(config, config.conversationId!, rl);
      rl.close();
    });
}

/**
 * Handles deep dive entry from interactive mode or standalone command.
 */
export async function enterDeepDive(
  config: any,
  conversationId: string,
  rl: readline.Interface,
): Promise<void> {
  if (!config.loggedIn || !config.authToken) {
    console.log(chalk.red('  ❌ Deep dives require Tier 3 (platform login).'));
    return;
  }

  const spinner = ora({ text: chalk.cyan('  Loading messages...'), spinner: 'dots' }).start();

  let messages: any[];
  try {
    const result = await callCloudFunction('listCLIDeepDives', {
      conversationId: conversationId,
      action: 'listMessages',
    });
    messages = result.messages || [];
    spinner.stop();
  } catch (error: any) {
    spinner.stop();
    console.log(chalk.red(`  ❌ ${error.message}`));
    return;
  }

  if (messages.length === 0) {
    console.log(chalk.yellow('  ⚠️  No Bob messages found to deep dive on.'));
    return;
  }

  console.log('');
  console.log(DIVE_BORDER('  ╔══════════════════════════════════════════╗'));
  console.log(DIVE_BORDER('  ║') + chalk.bold.blue('  🤿 Select a message to deep dive on     ') + DIVE_BORDER('║'));
  console.log(DIVE_BORDER('  ╠══════════════════════════════════════════╣'));

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const preview = (msg.message || '').slice(0, 40);
    console.log(DIVE_BORDER('  ║') + `  ${chalk.cyan(String(i + 1).padStart(2))}. ${chalk.white(preview)}${preview.length >= 40 ? '...' : ''}`);
  }

  console.log(DIVE_BORDER('  ╚══════════════════════════════════════════╝'));
  console.log('');

  const answer = await new Promise<string>(resolve => {
    rl.question(chalk.blue('  Select (1-' + messages.length + ') or 0 to cancel: '), resolve);
  });

  const selection = parseInt(answer.trim());
  if (isNaN(selection) || selection === 0 || selection < 1 || selection > messages.length) {
    console.log(chalk.gray('  Cancelled.'));
    return;
  }

  const selectedMessage = messages[selection - 1];
  const parentMessageId = selectedMessage.id;
  const initiatingPrompt = selectedMessage.message.slice(0, 100);

  // Initiate with animation
  const animation = startDeepDiveAnimation();

  const divePromise = callCloudFunction('initiateCLIDeepDive', {
    conversationId: conversationId,
    parentMessageId: parentMessageId,
    initiatingPrompt: initiatingPrompt,
  });

  try {
    await divePromise;
    animation.stop();
    await new Promise(resolve => setTimeout(resolve, 300));

    await runDeepDiveSession(config, conversationId, parentMessageId, initiatingPrompt, rl);

  } catch (error: any) {
    animation.stop();
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(chalk.red(`  ❌ Could not initiate deep dive: ${error.message}`));
  }
}

/**
 * Deep dive interactive session with local model support.
 * Saves user messages to Firestore BEFORE calling generateDeepDiveResponse.
 */
async function runDeepDiveSession(
  config: any,
  conversationId: string,
  parentMessageId: string,
  initiatingPrompt: string,
  rl: readline.Interface,
): Promise<void> {
  const previewText = initiatingPrompt.slice(0, 50) + (initiatingPrompt.length > 50 ? '...' : '');
  const isLocalProvider = config.provider === 'local' && config.localEndpoint;

  console.log('');
  console.log(DIVE_BORDER('  ╔══════════════════════════════════════════════════════╗'));
  console.log(DIVE_BORDER('  ║') + chalk.bold.blue('  🤿 DEEP DIVE                                       ') + DIVE_BORDER('║'));
  console.log(DIVE_BORDER('  ║') + chalk.gray(`  On: "${previewText}"`));
  if (isLocalProvider) {
    console.log(DIVE_BORDER('  ║') + chalk.gray('  Provider: Local model (sovereign handoff)'));
  }
  console.log(DIVE_BORDER('  ╠══════════════════════════════════════════════════════╣'));
  console.log(DIVE_BORDER('  ║') + chalk.gray('  Commands: /surface  /promote  /clear                ') + DIVE_BORDER('║'));
  console.log(DIVE_BORDER('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  return new Promise<void>((resolve) => {
    const deepDivePrompt = (): void => {
      rl.question(chalk.blue('  🤿 You: '), async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
          deepDivePrompt();
          return;
        }

        // ─── /surface or /exit ───
        if (trimmed === '/surface' || trimmed === '/exit') {
          console.log('');
          console.log(DIVE_BORDER('  ╔══════════════════════════════════════════╗'));
          console.log(DIVE_BORDER('  ║') + chalk.bold.blue('  🏊 Surfaced from Deep Dive              ') + DIVE_BORDER('║'));
          console.log(DIVE_BORDER('  ║') + chalk.gray(`  Back in: ${conversationId.slice(0, 24)}...`));
          console.log(DIVE_BORDER('  ╚══════════════════════════════════════════╝'));
          console.log('');
          resolve();
          return;
        }

        // ─── /promote ───
        if (trimmed === '/promote') {
          const promoSpinner = ora({ text: chalk.blue('  Promoting deep dive...'), spinner: 'dots' }).start();

          try {
            await callCloudFunction('promoteDeepDive', {
              conversationId: conversationId,
              parentMessageId: parentMessageId,
            });

            promoSpinner.stop();
            console.log('');
            console.log(chalk.green('  ✅ Deep dive promoted! Summary merged into main conversation.'));
            console.log('');
          } catch (error: any) {
            promoSpinner.stop();
            console.log(chalk.red(`  ❌ Promote failed: ${error.message}`));
            console.log('');
          }

          resolve();
          return;
        }

        // ─── /clear ───
        if (trimmed === '/clear') {
          console.clear();
          console.log(DIVE_BORDER('  ╔══════════════════════════════════════════╗'));
          console.log(DIVE_BORDER('  ║') + chalk.bold.blue('  🤿 DEEP DIVE (continued)                ') + DIVE_BORDER('║'));
          console.log(DIVE_BORDER('  ╚══════════════════════════════════════════╝'));
          console.log('');
          deepDivePrompt();
          return;
        }

        // ─── SEND MESSAGE ───
        const msgSpinner = ora({ text: chalk.blue('  🤿 Bob is diving deep...'), spinner: 'dots' }).start();

        try {
          // STEP 1: Save USER message to Firestore sandbox thread FIRST
          // (Mirrors what DeepDiveChatWidget does on the web app)
          await callCloudFunction('saveCLIDeepDiveMessage', {
            conversationId: conversationId,
            parentMessageId: parentMessageId,
            message: trimmed,
            sender: 'user',
          });

          let responseText: string;

          if (isLocalProvider) {
            // ─── LOCAL MODEL: Sovereign Handoff ───
            // Step 2: Get the assembled master prompt from the backend
            const handoffResult = await callCloudFunction('generateDeepDiveResponse', {
              conversationId: conversationId,
              parentMessageId: parentMessageId,
              userMessage: trimmed,
              isLocalModel: true,
              activePersonaId: null,
            });

            if (!handoffResult?.isHandoff || !handoffResult?.masterPrompt) {
              throw new Error('Handoff failed — no master prompt returned.');
            }

            // Step 3: Send master prompt to local model
            const localMessages: LocalChatMessage[] = [
              { role: 'user', content: handoffResult.masterPrompt },
            ];

            responseText = await callLocalModel(config.localEndpoint!, localMessages);

            // Step 4: Save Bob's LOCAL response to Firestore sandbox thread
            await callCloudFunction('saveCLIDeepDiveMessage', {
              conversationId: conversationId,
              parentMessageId: parentMessageId,
              message: responseText,
              sender: 'bob',
              origin: 'local-sovereign',
            });

          } else {
            // ─── PLATFORM MODEL: Full cloud execution ───
            // generateDeepDiveResponse handles its own response persistence
            await callCloudFunction('generateDeepDiveResponse', {
              conversationId: conversationId,
              parentMessageId: parentMessageId,
              userMessage: trimmed,
              isLocalModel: false,
              activePersonaId: null,
            });

            // Fetch the latest response
            const latestResult = await callCloudFunction('listCLIDeepDives', {
              conversationId: conversationId,
              action: 'getLatestSandboxMessage',
              parentMessageId: parentMessageId,
            });

            responseText = latestResult?.message || 'Deep dive response saved.';
          }

          msgSpinner.stop();

          const rendered = renderMarkdown(responseText);

          console.log('');
          console.log(DIVE_BORDER('  ╔══════════════════════════════════════════════════════╗'));
          console.log(DIVE_BORDER('  ║') + chalk.bold.blue('  🤿 Bob (Deep Dive):                                 ') + DIVE_BORDER('║'));
          console.log(DIVE_BORDER('  ╠══════════════════════════════════════════════════════╣'));

          for (const line of rendered.split('\n')) {
            console.log(DIVE_BORDER('  ║') + `  ${line}`);
          }

          console.log(DIVE_BORDER('  ╚══════════════════════════════════════════════════════╝'));
          console.log('');

        } catch (error: any) {
          msgSpinner.stop();
          console.log(chalk.red(`  ❌ ${error.message}`));
          console.log('');
        }

        deepDivePrompt();
      });
    };

    deepDivePrompt();
  });
}