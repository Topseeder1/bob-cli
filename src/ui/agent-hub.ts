import * as readline from 'readline';
import * as path from 'path';
import chalk from 'chalk';
import { getConfig } from '../core/config-store.js';
import {
  loadRegistry,
  loadAgentMessages,
  AgentMessage,
} from '../core/agent-store.js';
import { parseHubInput } from '../core/agent-parser.js';
import { callAgent } from '../core/agent-caller.js';
import {
  renderAgentResponse,
  renderUserMessage,
  renderHubHeader,
  renderHubStatus,
  renderHubSummary,
  renderUnifiedMessages,
  renderAgentChip,
  getAgentColor,
  UnifiedMessage,
  PURPLE,
  AMBER,
  GREEN,
  RED,
  GRAY,
  CYAN,
  WHITE,
} from './agent-renderer.js';

function buildUnifiedMessages(
  agentNames: string[],
  cwd: string
): UnifiedMessage[] {
  const allMessages: UnifiedMessage[] = [];

  for (const agentName of agentNames) {
    const messages = loadAgentMessages(agentName, cwd);

    for (const msg of messages) {
      if (msg.sender === 'user') {
        const alreadyAdded = allMessages.some(
          m =>
            m.agentName === null &&
            m.timestamp === msg.timestamp &&
            m.content === msg.content
        );
        if (!alreadyAdded) {
          allMessages.push({
            agentName: null,
            content: msg.content,
            timestamp: msg.timestamp,
          });
        }
      } else if (msg.sender === 'agent') {
        allMessages.push({
          agentName,
          content: msg.content,
          timestamp: msg.timestamp,
        });
      }
    }
  }

  allMessages.sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return allMessages;
}

async function runMessagesView(
  agentNames: string[],
  cwd: string,
  rl: readline.Interface,
  initialFilter?: string,
  initialSearch?: string
): Promise<void> {
  let currentPage = 1;
  let currentFilter = initialFilter || undefined;
  let currentSearch = initialSearch || undefined;

  const render = () => {
    const messages = buildUnifiedMessages(agentNames, cwd);
    renderUnifiedMessages(messages, agentNames, {
      filterAgent: currentFilter,
      search: currentSearch,
      page: currentPage,
      pageSize: 50,
    });
  };

  render();

  return new Promise<void>((resolve) => {
    const messagesPrompt = (): void => {
      rl.question(AMBER('  Messages > '), async (input) => {
        const trimmed = input.trim();
        if (!trimmed) { messagesPrompt(); return; }

        if (trimmed === '/back' || trimmed === '/exit') {
          console.log('');
          resolve();
          return;
        }

        const pageMatch = trimmed.match(/^\/page\s+(\d+)$/i);
        if (pageMatch) {
          currentPage = parseInt(pageMatch[1]);
          render();
          messagesPrompt(); return;
        }

        const filterMatch = trimmed.match(/^\/filter\s+(\w+)$/i);
        if (filterMatch) {
          const name = filterMatch[1].toLowerCase();
          const found = agentNames.find(
            n => n.toLowerCase() === name ||
                 n.toLowerCase() === `${name}bob`
          );
          if (found) {
            currentFilter = found;
            currentPage = 1;
            console.log(GRAY(`  Filtering by @${found}`));
          } else {
            console.log(RED(`  ❌ Agent "@${name}" not found.`));
            console.log(GRAY(`  Available: ${agentNames.join(', ')}`));
          }
          render();
          messagesPrompt(); return;
        }

        if (trimmed === '/filter') {
          currentFilter = undefined;
          currentPage = 1;
          console.log(GRAY('  Filter cleared.'));
          render();
          messagesPrompt(); return;
        }

        const searchMatch = trimmed.match(/^\/search\s+(.+)$/i);
        if (searchMatch) {
          currentSearch = searchMatch[1].trim();
          currentPage = 1;
          render();
          messagesPrompt(); return;
        }

        if (trimmed === '/search') {
          currentSearch = undefined;
          currentPage = 1;
          console.log(GRAY('  Search cleared.'));
          render();
          messagesPrompt(); return;
        }

        console.log('');
        console.log(GRAY('  Commands: /page <n>  /filter <name>  /filter  /search <keyword>  /search  /back'));
        console.log('');
        messagesPrompt();
      });
    };

    messagesPrompt();
  });
}

export async function runAgentHub(cwd: string): Promise<void> {
  const config = getConfig();

  if (!config.localEndpoint) {
    console.log('');
    console.log(chalk.red('  ❌ Agent Hub (Tier 1) requires a local model.'));
    console.log(chalk.gray('  Run: bob config set localEndpoint http://127.0.0.1:11434/api/chat'));
    console.log('');
    return;
  }

  const registry = loadRegistry(cwd);

  if (registry.agents.length === 0) {
    console.log('');
    console.log(AMBER('  ⚠️  No agents found.'));
    console.log(GRAY('  Spawn one first: bob agent spawn <name> "<task>"'));
    console.log('');
    return;
  }

  const projectName = path.basename(cwd);
  const agentNames = registry.agents.map(a => a.name);

  renderHubHeader(projectName, registry.agents);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question(PURPLE('  Hub > '), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }

      const parsed = parseHubInput(trimmed, registry.agents);

      if (parsed.type === 'slash' && parsed.slash === 'exit') {
        console.log('');
        console.log(GRAY('  👋 Left hub. Agents are still running.'));
        console.log(GRAY('  Return anytime: bob agent hub'));
        console.log('');
        rl.close();
        return;
      }

      if (parsed.type === 'slash' && parsed.slash === 'messages') {
        const args = parsed.slashArgs || [];
        const filterIdx = args.indexOf('--filter');
        const filterAgent = filterIdx >= 0 ? args[filterIdx + 1] : undefined;
        const searchIdx = args.indexOf('--search');
        const searchQuery = searchIdx >= 0 ? args[searchIdx + 1] : undefined;
        await runMessagesView(agentNames, cwd, rl, filterAgent, searchQuery);
        prompt(); return;
      }

      if (parsed.type === 'slash' && parsed.slash === 'status') {
        renderHubStatus(registry.agents, agentNames, cwd);
        prompt(); return;
      }

      if (parsed.type === 'slash' && parsed.slash === 'summary') {
        renderHubSummary(registry.agents, agentNames, cwd);
        prompt(); return;
      }

      if (parsed.type === 'slash') {
        console.log('');
        console.log(GRAY('  Commands: /messages  /status  /summary  /exit'));
        console.log('');
        prompt(); return;
      }

      if (parsed.type === 'unknown') {
        console.log('');
        console.log(AMBER('  ⚠️  Use @name to talk to an agent.'));
        console.log(GRAY(`  Available: ${agentNames.map(n => `@${n}`).join(', ')}`));
        console.log(GRAY('  Or use @all to broadcast to everyone.'));
        console.log('');
        prompt(); return;
      }

      if (!parsed.message) {
        console.log(AMBER('  ⚠️  Message cannot be empty.'));
        prompt(); return;
      }

      renderUserMessage(
        parsed.type === 'broadcast'
          ? `@all ${parsed.message}`
          : `@${parsed.targets[0]} ${parsed.message}`
      );

      for (const targetName of parsed.targets) {
        const agentColor = getAgentColor(targetName, agentNames);
        const typingText = `  @${targetName} is thinking...`;
        process.stdout.write(GRAY(typingText));

        try {
          const result = await callAgent(
            targetName,
            parsed.message,
            registry.agents,
            cwd,
            config.localEndpoint!
          );

          process.stdout.write('\r' + ' '.repeat(typingText.length) + '\r');

          renderAgentResponse(targetName, result.response, agentColor);

          // ─── Phase 3: Show summary notification ──────────────
          if (result.summaryGenerated && result.summary) {
            console.log('');
            console.log(AMBER(`  🧬 @${targetName} session summarized (${result.messageCount} messages)`));
            console.log(GRAY('  Summary saved. Other agents will see this context.'));
            console.log(GRAY('  View with: /summary'));
          }

        } catch (error: any) {
          process.stdout.write('\r' + ' '.repeat(typingText.length) + '\r');
          console.log('');
          console.log(RED(`  ❌ @${targetName} error: ${error.message}`));
          console.log('');
        }

        if (parsed.targets.length > 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      console.log('');
      prompt();
    });
  };

  prompt();
}