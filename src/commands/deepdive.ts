// File: src/commands/deepdive.ts

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { startDeepDiveAnimation } from '../ui/animations/deep-dive.js';
import { buildLocalContext } from '../core/context-builder.js';
import { getRelevantFileContents } from '../core/file-retrieval.js';
import { stripCodeBlockFromResponse, processAllProposedFiles, extractAllProposedFiles } from '../core/file-writer.js';
import { getActiveConversationId } from '../core/project-map.js';
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
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const MODE_DEEPDIVE = chalk.hex('#0097A7');
const AMBER = chalk.hex('#FFAB00');
const BORDER = chalk.hex('#455A64');

export function registerDeepDiveCommand(program: Command): void {
  program
    .command('deepdives')
    .description('List all deep dives in the current conversation')
    .action(async () => {
      const config = getConfig();
      if (!config.loggedIn || !config.authToken) { console.log(''); console.log(ERROR('  ❌ Not logged in. Deep dives require Tier 3.')); console.log(''); return; }

      // ─── Read conversation ID from project scope ───
      const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;
      if (!conversationId) { console.log(''); console.log(ERROR('  ❌ No active conversation.')); console.log(''); return; }

      const spinner = ora({ text: MODE_DEEPDIVE('  Loading deep dives...'), spinner: 'dots' }).start();
      try {
        const result = await callCloudFunction('listCLIDeepDives', { conversationId });
        spinner.stop();
        const dives = result.deepDives || [];

        console.log('');
        console.log(MODE_DEEPDIVE('  ╔══════════════════════════════════════════╗'));
        console.log(MODE_DEEPDIVE('  ║') + chalk.bold(MODE_DEEPDIVE('  🤿 Deep Dives                          ')) + MODE_DEEPDIVE('║'));
        console.log(MODE_DEEPDIVE('  ╠══════════════════════════════════════════╣'));

        if (dives.length === 0) {
          console.log(MODE_DEEPDIVE('  ║') + MUTED('  No deep dives yet.                      ') + MODE_DEEPDIVE('║'));
          console.log(MODE_DEEPDIVE('  ║') + MUTED('  Use `bob deepdive` to create one.       ') + MODE_DEEPDIVE('║'));
        } else {
          for (const dive of dives) {
            const preview = (dive.initiatingPrompt || 'No prompt').slice(0, 35);
            const msgs = dive.messageCount || 0;
            console.log(MODE_DEEPDIVE('  ║') + `  ${MODE_DEEPDIVE(dive.parentMessageId.slice(0, 8))}  ${chalk.white(preview)}${preview.length >= 35 ? '...' : ''}`);
            console.log(MODE_DEEPDIVE('  ║') + MUTED(`    ${msgs} messages | ${dive.status || 'active'}`));
          }
        }

        console.log(MODE_DEEPDIVE('  ╚══════════════════════════════════════════╝'));
        console.log('');
        console.log(MUTED('  Commands:'));
        console.log(MUTED('    bob deepdive        — Create a new deep dive'));
        console.log(MUTED('    bob deepdives-join  — Re-enter an existing deep dive'));
        console.log('');
      } catch (error: any) { spinner.stop(); console.log(ERROR(`  ❌ ${error.message}`)); console.log(''); }
    });

  program
    .command('deepdives-join')
    .description('Re-enter an existing deep dive')
    .action(async () => {
      const config = getConfig();
      if (!config.loggedIn || !config.authToken) { console.log(''); console.log(ERROR('  ❌ Not logged in. Deep dives require Tier 3.')); console.log(''); return; }

      // ─── Read conversation ID from project scope ───
      const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;
      if (!conversationId) { console.log(''); console.log(ERROR('  ❌ No active conversation.')); console.log(''); return; }

      const spinner = ora({ text: MODE_DEEPDIVE('  Loading deep dives...'), spinner: 'dots' }).start();
      try {
        const result = await callCloudFunction('listCLIDeepDives', { conversationId });
        spinner.stop();
        const dives = result.deepDives || [];

        if (dives.length === 0) { console.log(''); console.log(WARNING('  ⚠️  No deep dives in this conversation.')); console.log(MUTED('  Use `bob deepdive` to create one.')); console.log(''); return; }

        console.log('');
        console.log(MODE_DEEPDIVE('  ╔══════════════════════════════════════════╗'));
        console.log(MODE_DEEPDIVE('  ║') + chalk.bold(MODE_DEEPDIVE('  🤿 Select a deep dive to re-enter       ')) + MODE_DEEPDIVE('║'));
        console.log(MODE_DEEPDIVE('  ╠══════════════════════════════════════════╣'));

        for (let i = 0; i < dives.length; i++) {
          const dive = dives[i];
          const preview = (dive.initiatingPrompt || 'No prompt').slice(0, 35);
          const msgs = dive.messageCount || 0;
          console.log(MODE_DEEPDIVE('  ║') + `  ${INFO(String(i + 1).padStart(2))}. ${chalk.white(preview)}${preview.length >= 35 ? '...' : ''}`);
          console.log(MODE_DEEPDIVE('  ║') + MUTED(`      ${msgs} messages | ${dive.status || 'active'}`));
        }

        console.log(MODE_DEEPDIVE('  ╚══════════════════════════════════════════╝'));
        console.log('');

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve => { rl.question(MODE_DEEPDIVE('  Select (1-' + dives.length + ') or 0 to cancel: '), resolve); });
        const selection = parseInt(answer.trim());

        if (isNaN(selection) || selection === 0 || selection < 1 || selection > dives.length) { rl.close(); console.log(MUTED('  Cancelled.')); return; }

        const selectedDive = dives[selection - 1];
        const parentMessageId = selectedDive.parentMessageId;
        const initiatingPrompt = selectedDive.initiatingPrompt || 'Deep dive session';

        const animation = startDeepDiveAnimation();
        await new Promise(resolve => setTimeout(resolve, 3000));
        animation.stop();
        await new Promise(resolve => setTimeout(resolve, 300));

        await runDeepDiveSession(config, conversationId, parentMessageId, initiatingPrompt, rl);
        rl.close();
      } catch (error: any) { spinner.stop(); console.log(ERROR(`  ❌ ${error.message}`)); console.log(''); }
    });

  program
    .command('deepdive')
    .description('Create a new deep dive on a Bob message')
    .action(async () => {
      const config = getConfig();
      if (!config.loggedIn || !config.authToken) { console.log(''); console.log(ERROR('  ❌ Not logged in. Deep dives require Tier 3.')); console.log(MUTED('  Run `bob login` to authenticate.')); console.log(''); return; }

      // ─── Read conversation ID from project scope ───
      const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;
      if (!conversationId) { console.log(''); console.log(ERROR('  ❌ No active conversation.')); console.log(MUTED('  Join one with `bob conversations join` first.')); console.log(''); return; }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await enterDeepDive(config, conversationId, rl);
      rl.close();
    });
}

export async function enterDeepDive(config: any, conversationId: string, rl: readline.Interface): Promise<void> {
  if (!config.loggedIn || !config.authToken) { console.log(ERROR('  ❌ Deep dives require Tier 3 (platform login).')); return; }

  const spinner = ora({ text: MODE_DEEPDIVE('  Loading messages...'), spinner: 'dots' }).start();
  let messages: any[];
  try {
    const result = await callCloudFunction('listCLIDeepDives', { conversationId, action: 'listMessages' });
    messages = result.messages || [];
    spinner.stop();
  } catch (error: any) { spinner.stop(); console.log(ERROR(`  ❌ ${error.message}`)); return; }

  if (messages.length === 0) { console.log(WARNING('  ⚠️  No Bob messages found to deep dive on.')); return; }

  console.log('');
  console.log(MODE_DEEPDIVE('  ╔══════════════════════════════════════════╗'));
  console.log(MODE_DEEPDIVE('  ║') + chalk.bold(MODE_DEEPDIVE('  🤿 Select a message to deep dive on     ')) + MODE_DEEPDIVE('║'));
  console.log(MODE_DEEPDIVE('  ╠══════════════════════════════════════════╣'));

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const preview = (msg.message || '').slice(0, 40);
    console.log(MODE_DEEPDIVE('  ║') + `  ${INFO(String(i + 1).padStart(2))}. ${chalk.white(preview)}${preview.length >= 40 ? '...' : ''}`);
  }

  console.log(MODE_DEEPDIVE('  ╚══════════════════════════════════════════╝'));
  console.log('');

  const answer = await new Promise<string>(resolve => { rl.question(MODE_DEEPDIVE('  Select (1-' + messages.length + ') or 0 to cancel: '), resolve); });
  const selection = parseInt(answer.trim());
  if (isNaN(selection) || selection === 0 || selection < 1 || selection > messages.length) { console.log(MUTED('  Cancelled.')); return; }

  const selectedMessage = messages[selection - 1];
  const parentMessageId = selectedMessage.id;
  const initiatingPrompt = selectedMessage.message.slice(0, 100);

  const animation = startDeepDiveAnimation();
  const divePromise = callCloudFunction('initiateCLIDeepDive', { conversationId, parentMessageId, initiatingPrompt });

  try {
    await Promise.all([divePromise, new Promise(resolve => setTimeout(resolve, 3000))]);
    animation.stop();
    await new Promise(resolve => setTimeout(resolve, 300));
    await runDeepDiveSession(config, conversationId, parentMessageId, initiatingPrompt, rl);
  } catch (error: any) {
    animation.stop();
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(ERROR(`  ❌ Could not initiate deep dive: ${error.message}`));
  }
}

async function runDeepDiveSession(config: any, conversationId: string, parentMessageId: string, initiatingPrompt: string, rl: readline.Interface): Promise<void> {
  const previewText = initiatingPrompt.slice(0, 50) + (initiatingPrompt.length > 50 ? '...' : '');
  const isLocalProvider = config.provider === 'local' && config.localEndpoint;

  console.log('');
  console.log(MODE_DEEPDIVE('  ╔══════════════════════════════════════════════════════╗'));
  console.log(MODE_DEEPDIVE('  ║') + chalk.bold(MODE_DEEPDIVE('  🤿 DEEP DIVE                                       ')) + MODE_DEEPDIVE('║'));
  console.log(MODE_DEEPDIVE('  ║') + MUTED(`  On: "${previewText}"`));
  if (isLocalProvider) { console.log(MODE_DEEPDIVE('  ║') + MUTED('  Provider: Local model (sovereign handoff)')); }
  console.log(MODE_DEEPDIVE('  ╠══════════════════════════════════════════════════════╣'));
  console.log(MODE_DEEPDIVE('  ║') + MUTED('  Commands: /surface  /promote  /clear  /constraints  ') + MODE_DEEPDIVE('║'));
  console.log(MODE_DEEPDIVE('  ╚══════════════════════════════════════════════════════╝'));
  console.log('');

  let lastBobResponse = '';
  let lastConstraints: string[] = [];

  return new Promise<void>((resolve) => {
    const deepDivePrompt = (): void => {
      rl.question(MODE_DEEPDIVE('  🤿 You: '), async (input) => {
        const trimmed = input.trim();
        if (!trimmed) { deepDivePrompt(); return; }

        if (trimmed === '/surface' || trimmed === '/exit') {
          console.log('');
          console.log(MODE_DEEPDIVE('  ╔══════════════════════════════════════════╗'));
          console.log(MODE_DEEPDIVE('  ║') + chalk.bold(MODE_DEEPDIVE('  🏊 Surfaced from Deep Dive              ')) + MODE_DEEPDIVE('║'));
          console.log(MODE_DEEPDIVE('  ║') + MUTED(`  Back in: ${conversationId.slice(0, 24)}...`));
          console.log(MODE_DEEPDIVE('  ╚══════════════════════════════════════════╝'));
          console.log('');
          resolve(); return;
        }

        if (trimmed === '/promote') {
          const promoSpinner = ora({ text: MODE_DEEPDIVE('  Promoting deep dive...'), spinner: 'dots' }).start();
          try {
            await callCloudFunction('promoteDeepDive', { conversationId, parentMessageId });
            promoSpinner.stop();
            console.log(''); console.log(SUCCESS('  ✅ Deep dive promoted! Summary merged into main conversation.')); console.log('');
          } catch (error: any) { promoSpinner.stop(); console.log(ERROR(`  ❌ Promote failed: ${error.message}`)); console.log(''); }
          resolve(); return;
        }

        if (trimmed === '/clear') {
          console.clear();
          console.log(MODE_DEEPDIVE('  ╔══════════════════════════════════════════╗'));
          console.log(MODE_DEEPDIVE('  ║') + chalk.bold(MODE_DEEPDIVE('  🤿 DEEP DIVE (continued)                ')) + MODE_DEEPDIVE('║'));
          console.log(MODE_DEEPDIVE('  ╚══════════════════════════════════════════╝'));
          console.log('');
          deepDivePrompt(); return;
        }

        if (trimmed === '/constraints') {
          renderConstraintsTile(lastConstraints);
          deepDivePrompt(); return;
        }

        if (trimmed === '/personalized' || trimmed === '/personalize') {
          console.log('');
          console.log(BORDER('  ┌─────────────────────────────────────────────────────────┐'));
          console.log(BORDER('  │') + AMBER('  ⚠️  Personalization Mode'));
          console.log(BORDER('  │'));
          console.log(BORDER('  │') + MUTED('  This mode is not available inside deep dives.'));
          console.log(BORDER('  │') + MUTED('  Deep dives are powered by the Frank Reasoning Engine'));
          console.log(BORDER('  │') + MUTED('  which already adapts using your DNA profile.'));
          console.log(BORDER('  │'));
          console.log(BORDER('  │') + MUTED('  To use full Personalization Mode, return to the'));
          console.log(BORDER('  │') + MUTED('  main conversation.'));
          console.log(BORDER('  │'));
          console.log(BORDER('  └─────────────────────────────────────────────────────────┘'));
          console.log('');

          const answer = await new Promise<string>(resolve => {
            rl.question(MODE_DEEPDIVE('  Leave deep dive for main conversation? (y/N): '), resolve);
          });

          if (answer.trim().toLowerCase() === 'y') {
            console.log('');
            console.log(SUCCESS('  ✅ Surfacing from deep dive. Personalization Mode will activate in main conversation.'));
            console.log('');
            resolve();
            return;
          }

          console.log(MUTED('  Staying in deep dive.'));
          console.log('');
          deepDivePrompt();
          return;
        }

        renderUserMessage(trimmed);
        startElapsedTimer();

        try {
          let localContext = buildLocalContext(process.cwd());
          if (config.localEndpoint) {
            try {
              const retrievalQuery = lastBobResponse
                ? `Previous context: ${lastBobResponse.slice(0, 500)}\n\nCurrent request: ${trimmed}`
                : trimmed;
              const retrieval = await getRelevantFileContents(retrievalQuery, config.localEndpoint);
              if (retrieval.fileContents) { localContext += '\n\n' + retrieval.fileContents; }
            } catch { }
          }

          await callCloudFunction('saveCLIDeepDiveMessage', { conversationId, parentMessageId, message: trimmed, sender: 'user' });

          let responseText: string;

          if (isLocalProvider) {
            const handoffResult = await callCloudFunction('generateDeepDiveResponse', {
              conversationId,
              parentMessageId,
              userMessage: trimmed,
              isLocalModel: true,
              activePersonaId: null,
              localContext,
              cliMode: true,
            });
            if (!handoffResult?.isHandoff || !handoffResult?.masterPrompt) { throw new Error('Handoff failed — no master prompt returned.'); }
            const localMessages: LocalChatMessage[] = [{ role: 'user', content: handoffResult.masterPrompt }];
            responseText = await callLocalModel(config.localEndpoint!, localMessages);
            await callCloudFunction('saveCLIDeepDiveMessage', { conversationId, parentMessageId, message: responseText, sender: 'bob', origin: 'local-sovereign' });
          } else {
            await callCloudFunction('generateDeepDiveResponse', { conversationId, parentMessageId, userMessage: trimmed, isLocalModel: false, activePersonaId: null, localContext, cliMode: true });
            const latestResult = await callCloudFunction('listCLIDeepDives', { conversationId, action: 'getLatestSandboxMessage', parentMessageId });
            responseText = latestResult?.message || 'Deep dive response saved.';
          }

          const elapsedMs = stopElapsedTimer();
          lastBobResponse = responseText;

          const displayResponse = stripCodeBlockFromResponse(responseText);
          const metadata: ResponseMetadata = {
            elapsedMs,
            tokenCount: undefined,
            selectedFiles: [],
            constraints: [],
            mode: 'deepdive',
            tier: config.provider === 'local' ? 'local' : 'platform',
            conversationId,
          };

          await renderBobResponse(displayResponse, metadata);

          const proposals = extractAllProposedFiles(responseText);
          for (const proposed of proposals) {
            if (proposed.isLocal) {
              renderFileDiff(proposed.filePath, proposed.content, proposed.isNew);
            }
          }

          await processAllProposedFiles(responseText, false, rl);

        } catch (error: any) {
          stopElapsedTimer();
          console.log(ERROR(`  ❌ ${error.message}`));
          console.log('');
        }

        deepDivePrompt();
      });
    };

    deepDivePrompt();
  });
}