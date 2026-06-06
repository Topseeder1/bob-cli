import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
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
          console.log(DIVE_BORDER('  ║') + chalk.gray('  Use /deepdive in interactive mode.       ') + DIVE_BORDER('║'));
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

      } catch (error: any) {
        spinner.stop();
        console.log(chalk.red(`  ❌ ${error.message}`));
        console.log('');
      }
    });
}

/**
 * Handles deep dive entry from interactive mode.
 * Called when user types /deepdive in chat interactive session.
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

  // ─── 1. FETCH RECENT BOB MESSAGES ───
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

  // ─── 2. SHOW MESSAGE LIST ───
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

  // ─── 3. USER SELECTS ───
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

  // ─── 4. INITIATE DEEP DIVE WITH ANIMATION ───
  const animation = startDeepDiveAnimation();

  const divePromise = callCloudFunction('initiateCLIDeepDive', {
    conversationId: conversationId,
    parentMessageId: parentMessageId,
    initiatingPrompt: initiatingPrompt,
  });

  try {
    await divePromise;
    animation.stop();
    // Small delay to let final frame render
    await new Promise(resolve => setTimeout(resolve, 300));

    // ─── 5. ENTER DEEP DIVE LOOP ───
    await runDeepDiveSession(config, conversationId, parentMessageId, initiatingPrompt, rl);

  } catch (error: any) {
    animation.stop();
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(chalk.red(`  ❌ Could not initiate deep dive: ${error.message}`));
  }
}

/**
 * The deep dive interactive loop.
 * Returns a Promise that resolves when the user surfaces or promotes.
 */
async function runDeepDiveSession(
  config: any,
  conversationId: string,
  parentMessageId: string,
  initiatingPrompt: string,
  rl: readline.Interface,
): Promise<void> {
  const previewText = initiatingPrompt.slice(0, 50) + (initiatingPrompt.length > 50 ? '...' : '');

  console.log('');
  console.log(DIVE_BORDER('  ╔══════════════════════════════════════════════════════╗'));
  console.log(DIVE_BORDER('  ║') + chalk.bold.blue('  🤿 DEEP DIVE                                       ') + DIVE_BORDER('║'));
  console.log(DIVE_BORDER('  ║') + chalk.gray(`  On: "${previewText}"`));
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

        // ─── /surface or /exit — exit deep dive ───
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

        // ─── /promote — summarize and push back ───
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

        // ─── SEND MESSAGE TO DEEP DIVE ───
        const msgSpinner = ora({ text: chalk.blue('  🤿 Bob is diving deep...'), spinner: 'dots' }).start();

        try {
          await callCloudFunction('generateDeepDiveResponse', {
            conversationId: conversationId,
            parentMessageId: parentMessageId,
            userMessage: trimmed,
            isLocalModel: false,
            activePersonaId: null,
          });

          msgSpinner.stop();

          // Fetch the latest Bob response from sandbox
          const latestResult = await callCloudFunction('listCLIDeepDives', {
            conversationId: conversationId,
            action: 'getLatestSandboxMessage',
            parentMessageId: parentMessageId,
          });

          const responseText = latestResult?.message || 'Deep dive response saved.';
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