import * as readline from 'readline';
import chalk from 'chalk';
import { getConfig } from '../core/config-store.js';
import {
  loadRegistry,
  loadAgentMessages,
  loadSession,
} from '../core/agent-store.js';
import { callAgent } from '../core/agent-caller.js';
import {
  renderAgentResponse,
  renderUserMessage,
  renderAgentChip,
  getAgentColor,
  getAgentColorPair,
  stripMarkdown,
  wrapText,
  UnifiedMessage,
  PURPLE,
  AMBER,
  GREEN,
  RED,
  GRAY,
  CYAN,
  WHITE,
  BORDER,
} from './agent-renderer.js';

const PAGE_SIZE = 50;

function renderChatHeader(
  agentName: string,
  allAgentNames: string[],
  messageCount: number,
  searchQuery?: string
): void {
  const chip = renderAgentChip(agentName, allAgentNames, true);

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + `  ${chip}  ` + GRAY(`${messageCount} messages`));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + WHITE('  Commands:'));
  console.log(BORDER('  ║') + CYAN('    /history') + GRAY('          — show message history'));
  console.log(BORDER('  ║') + CYAN('    /search <keyword>') + GRAY(' — search history'));
  console.log(BORDER('  ║') + CYAN('    /page <n>') + GRAY('         — navigate history pages'));
  console.log(BORDER('  ║') + CYAN('    /summary') + GRAY('          — show this agent\'s summary'));
  console.log(BORDER('  ║') + CYAN('    /clear') + GRAY('            — clear screen'));
  console.log(BORDER('  ║') + CYAN('    /exit') + GRAY('             — leave chat'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  if (searchQuery) {
    console.log(GRAY(`  Search active: "${searchQuery}"`));
  }
  console.log('');
}

function renderAgentHistory(
  agentName: string,
  allAgentNames: string[],
  cwd: string,
  page: number = 1,
  searchQuery?: string
): { totalPages: number; currentPage: number } {
  const messages = loadAgentMessages(agentName, cwd);

  const unified: UnifiedMessage[] = messages.map(msg => ({
    agentName: msg.sender === 'agent' ? agentName : null,
    content: msg.content,
    timestamp: msg.timestamp,
  }));

  const filtered = searchQuery
    ? unified.filter(m =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : unified;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageMessages = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  if (pageMessages.length === 0) {
    console.log('');
    if (searchQuery) {
      console.log(GRAY(`  No messages matching "${searchQuery}".`));
    } else {
      console.log(GRAY('  No messages yet. Start chatting below.'));
    }
    console.log('');
    return { totalPages, currentPage };
  }

  const { fg } = getAgentColorPair(agentName, allAgentNames);

  console.log('');
  console.log(GRAY(`  ── History — Page ${currentPage}/${totalPages} ──────────────────────────────`));
  console.log('');

  for (const msg of pageMessages) {
    const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (msg.agentName === null) {
      console.log(
        chalk.bgHex('#1A2E1A').hex('#A5D6A7')('  You  ') +
        GRAY(`  ${time}`)
      );
      const lines = wrapText(msg.content, 60);
      for (const line of lines) {
        console.log(GREEN(`  ${line}`));
      }
    } else {
      const chip = renderAgentChip(agentName, allAgentNames, true);
      console.log(`  ${chip}  ` + GRAY(time));
      const clean = stripMarkdown(msg.content);
      const lines = wrapText(clean, 60);
      for (const line of lines) {
        console.log(fg(`  ${line}`));
      }
    }
    console.log('');
  }

  console.log(GRAY(`  ── End of page ${currentPage}/${totalPages} ─────────────────────────────────`));
  if (currentPage < totalPages) {
    console.log(GRAY(`  Type /page ${currentPage + 1} to see more`));
  }
  console.log('');

  return { totalPages, currentPage };
}

export async function runAgentChat(
  agentName: string,
  cwd: string,
  initialSearch?: string
): Promise<void> {
  const config = getConfig();

  if (!config.localEndpoint) {
    console.log('');
    console.log(chalk.red('  ❌ Agent Chat requires a local model.'));
    console.log(chalk.gray('  Run: bob config set localEndpoint http://127.0.0.1:11434/api/chat'));
    console.log('');
    return;
  }

  const registry = loadRegistry(cwd);
  const allAgentNames = registry.agents.map(a => a.name);
  const agent = registry.agents.find(a => a.name === agentName);

  if (!agent) {
    console.log('');
    console.log(RED(`  ❌ Agent "@${agentName}" not found.`));
    console.log('');
    return;
  }

  const session = loadSession(agentName, cwd);
  const messageCount = session?.messageCount || 0;
  const agentColor = getAgentColor(agentName, allAgentNames);

  renderChatHeader(agentName, allAgentNames, messageCount, initialSearch);

  // ─── Show most recent history page on entry ───────────────────
  const messages = loadAgentMessages(agentName, cwd);
  if (messages.length > 0) {
    const totalPages = Math.ceil(messages.length / PAGE_SIZE);
    renderAgentHistory(
      agentName,
      allAgentNames,
      cwd,
      totalPages,
      initialSearch
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let currentSearchQuery = initialSearch;
  let currentHistoryPage = Math.ceil(messages.length / PAGE_SIZE) || 1;

  const agentChip = renderAgentChip(agentName, allAgentNames, true);

  const prompt = (): void => {
    rl.question(
      `  ${agentChip} ${GRAY('>')} `,
      async (input) => {
        const trimmed = input.trim();
        if (!trimmed) { prompt(); return; }

        if (trimmed === '/exit' || trimmed === '/quit') {
          console.log('');
          console.log(GRAY(`  Left chat with @${agentName}.`));
          console.log(GRAY('  Return anytime: bob agent chat ' + agentName));
          console.log('');
          rl.close();
          return;
        }

        if (trimmed === '/clear') {
          console.clear();
          const updatedSession = loadSession(agentName, cwd);
          renderChatHeader(
            agentName,
            allAgentNames,
            updatedSession?.messageCount || 0,
            currentSearchQuery
          );
          prompt(); return;
        }

        if (trimmed === '/history') {
          const result = renderAgentHistory(
            agentName,
            allAgentNames,
            cwd,
            1,
            currentSearchQuery
          );
          currentHistoryPage = result.currentPage;
          prompt(); return;
        }

        // ─── /summary — show this agent's current summary ────────
        if (trimmed === '/summary') {
          const { loadAgentSummary } = await import('../core/agent-store.js');
          const summary = loadAgentSummary(agentName, cwd);
          console.log('');
          if (summary) {
            console.log(AMBER(`  🧬 @${agentName} Summary`));
            console.log(GRAY('  ─────────────────────────────────────────────────'));
            const lines = summary.split('\n').filter(l => l.trim());
            for (const line of lines) {
              console.log(GRAY(`  ${line}`));
            }
          } else {
            console.log(GRAY('  No summary yet. Summaries generate automatically every 10 messages.'));
          }
          console.log('');
          prompt(); return;
        }

        const pageMatch = trimmed.match(/^\/page\s+(\d+)$/i);
        if (pageMatch) {
          currentHistoryPage = parseInt(pageMatch[1]);
          renderAgentHistory(
            agentName,
            allAgentNames,
            cwd,
            currentHistoryPage,
            currentSearchQuery
          );
          prompt(); return;
        }

        const searchMatch = trimmed.match(/^\/search\s+(.+)$/i);
        if (searchMatch) {
          currentSearchQuery = searchMatch[1].trim();
          currentHistoryPage = 1;
          renderAgentHistory(
            agentName,
            allAgentNames,
            cwd,
            1,
            currentSearchQuery
          );
          prompt(); return;
        }

        if (trimmed === '/search') {
          currentSearchQuery = undefined;
          console.log(GRAY('  Search cleared.'));
          prompt(); return;
        }

        if (trimmed.startsWith('/')) {
          console.log('');
          console.log(GRAY('  Commands: /history  /summary  /page <n>  /search <keyword>  /search  /clear  /exit'));
          console.log('');
          prompt(); return;
        }

        // ─── Regular message ──────────────────────────────────────
        renderUserMessage(trimmed);

        const typingText = `  @${agentName} is thinking...`;
        process.stdout.write(GRAY(typingText));

        try {
          const result = await callAgent(
            agentName,
            trimmed,
            registry.agents,
            cwd,
            config.localEndpoint!
          );

          process.stdout.write('\r' + ' '.repeat(typingText.length) + '\r');

          renderAgentResponse(agentName, result.response, agentColor);

          // ─── Phase 3: Show summary notification ──────────────
          if (result.summaryGenerated && result.summary) {
            console.log('');
            console.log(AMBER(`  🧬 Session summarized (${result.messageCount} messages)`));
            const lines = result.summary
              .split('\n')
              .filter(l => l.trim())
              .slice(0, 5);
            for (const line of lines) {
              console.log(GRAY(`  ${line.slice(0, 62)}`));
            }
            console.log(GRAY('  Other agents will now see this context.'));
          }

        } catch (error: any) {
          process.stdout.write('\r' + ' '.repeat(typingText.length) + '\r');
          console.log('');
          console.log(RED(`  ❌ @${agentName} error: ${error.message}`));
          console.log('');
        }

        console.log('');
        prompt();
      }
    );
  };

  prompt();
}