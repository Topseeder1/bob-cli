import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import inquirer from 'inquirer';
import { getConfig } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { runAgentHub } from '../ui/agent-hub.js';
import { runAgentChat } from '../ui/agent-chat.js';
import {
  createAgent,
  loadRegistry,
  loadSession,
  resetAgent,
  stopAgent,
  agentExists,
  getActiveAgentCount,
  loadAgentSummary,
  resolveAgentName,
} from '../core/agent-store.js';

// ─── DESIGN TOKENS ────────────────────────────────────────────────
const PURPLE = chalk.hex('#AB47BC');
const AMBER  = chalk.hex('#FFAB00');
const GREEN  = chalk.hex('#66BB6A');
const RED    = chalk.hex('#EF5350');
const CYAN   = chalk.cyan;
const GRAY   = chalk.gray;
const BORDER = chalk.hex('#455A64');
const WHITE  = chalk.white;

// ─── AGENT LIMITS ─────────────────────────────────────────────────
const TIER_AGENT_LIMITS: Record<string, number> = {
  'Explore':  10,
  'Free':     10,
  'Starter':  5,
  'Pro':      15,
  'Power':    50,
  'Grid':     -1,
};

async function fetchAgentLimit(config: any): Promise<number> {
  if (!config.loggedIn || !config.authToken) return 10;
  if (config.tier !== 'platform') return 25;

  try {
    const result = await callCloudFunction('getCLIUserTier', {});
    const tier = result?.tier || 'Starter';
    const limit = TIER_AGENT_LIMITS[tier];
    return limit !== undefined ? limit : 5;
  } catch {
    return 5;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────

function statusIcon(status: string): string {
  switch (status) {
    case 'active':  return GREEN('●');
    case 'idle':    return AMBER('●');
    case 'stopped': return GRAY('○');
    default:        return GRAY('○');
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active':  return GREEN('ACTIVE');
    case 'idle':    return AMBER('IDLE');
    case 'stopped': return GRAY('STOPPED');
    default:        return GRAY(status.toUpperCase());
  }
}

function formatTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// ─── REGISTER COMMAND ─────────────────────────────────────────────

export function registerAgentCommand(program: Command): void {
  const agentCmd = program
    .command('agent')
    .description('Manage your local multi-agent team');

  // ── bob agent spawn <name> "<task>" ───────────────────────────
  agentCmd
    .command('spawn <name> [task...]')
    .description('Spawn a named agent with a task')
    .option('--persona <id>', 'Assign a persona (e.g. local:architectBob)')
    .action(async (
      name: string,
      taskArgs: string[],
      options: { persona?: string }
    ) => {
      const config = getConfig();
      const cwd = process.cwd();
      const projectName = path.basename(cwd);

      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        console.log('');
        console.log(RED('  ❌ Agent name must contain only letters, numbers, hyphens, and underscores.'));
        console.log('');
        return;
      }

      // ─── Resolve final name (append Bob + auto-increment) ────
      const resolvedName = resolveAgentName(name, cwd);

      const limit = await fetchAgentLimit(config);
      const currentCount = getActiveAgentCount(cwd);

      if (limit !== -1 && currentCount >= limit) {
        console.log('');
        console.log(RED(`  ❌ Agent limit reached (${limit} agents).`));
        if (!config.loggedIn) {
          console.log(GRAY('  Run `bob login` to increase your limit to 25.'));
        } else if (config.tier !== 'platform') {
          console.log(GRAY('  Your local limit is 25. Stop an existing agent:'));
          console.log(GRAY('  bob agent stop <name>'));
        } else {
          console.log(GRAY('  Upgrade your Workshop plan for more agents.'));
          console.log(GRAY('  Or stop an existing agent: bob agent stop <name>'));
        }
        console.log('');
        return;
      }

      let task = taskArgs.join(' ').trim();

      if (!task) {
        const { inputTask } = await inquirer.prompt([{
          type: 'input',
          name: 'inputTask',
          message: PURPLE(`  What is @${resolvedName}'s task?`),
          validate: (v: string) => v.trim() ? true : 'Task cannot be empty.',
        }]);
        task = inputTask.trim();
      }

      const personaId = options.persona || null;

      // ─── Validate persona if provided ────────────────────────
      if (personaId) {
        const { BUILT_IN_PERSONAS } = await import('../ai/personas/persona-loader.js');
        if (
          personaId.startsWith('local:') &&
          !BUILT_IN_PERSONAS[personaId]
        ) {
          console.log('');
          console.log(RED(`  ❌ Unknown persona: "${personaId}"`));
          console.log(GRAY('  Run `bob agent personas` to see available personas.'));
          console.log('');
          return;
        }
      }

      const spinner = ora({
        text: GRAY(`  Spawning @${resolvedName}...`),
        spinner: 'dots',
      }).start();

      try {
        createAgent(resolvedName, task, personaId, cwd);
        spinner.stop();

        const newCount = getActiveAgentCount(cwd);
        const limitLabel = limit === -1 ? 'unlimited' : String(limit);
        const nameNote = resolvedName.toLowerCase() === `${name.toLowerCase()}bob`
          ? GRAY('  (All agents end in "Bob" by convention)')
          : GRAY(`  (Name adjusted: "${name}" → "${resolvedName}")`);

        console.log('');
        console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
        console.log(BORDER('  ║') + PURPLE(`  🤖 Agent Spawned: @${resolvedName}`));
        console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
        console.log(BORDER('  ║') + GRAY(`  Project: ${projectName}`));
        console.log(BORDER('  ║') + GRAY(`  Task:    ${task.slice(0, 52)}${task.length > 52 ? '...' : ''}`));
        console.log(BORDER('  ║') + GRAY(`  Persona: ${personaId || 'Default Bob'}`));
        console.log(BORDER('  ║') + GRAY(`  Agents:  ${newCount}/${limitLabel} active`));
        console.log(BORDER('  ║') + nameNote);
        console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
        console.log(BORDER('  ║') + GRAY('  Commands:'));
        console.log(BORDER('  ║') + CYAN(`    bob agent hub`) + GRAY('                — command center'));
        console.log(BORDER('  ║') + CYAN(`    bob agent chat ${resolvedName}`) + GRAY('  — focused chat'));
        console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
        console.log('');

      } catch (error: any) {
        spinner.stop();
        console.log(RED(`  ❌ Failed to spawn agent: ${error.message}`));
        console.log('');
      }
    });

  // ── bob agent personas ────────────────────────────────────────
  agentCmd
    .command('personas')
    .description('List all available built-in personas')
    .action(async () => {
      const { listBuiltInPersonas } = await import('../ai/personas/persona-loader.js');
      listBuiltInPersonas();
    });

  // ── bob agent list ────────────────────────────────────────────
  agentCmd
    .command('list')
    .description('List all agents for the current project')
    .action(async () => {
      const config = getConfig();
      const cwd = process.cwd();
      const projectName = path.basename(cwd);
      const registry = loadRegistry(cwd);
      const limit = await fetchAgentLimit(config);
      const limitLabel = limit === -1 ? 'unlimited' : String(limit);
      const activeCount = getActiveAgentCount(cwd);

      console.log('');
      console.log(PURPLE(`  🤖 Agents — ${projectName}`));
      console.log(GRAY(`  ${activeCount}/${limitLabel} active`));
      console.log(GRAY('  ─────────────────────────────────────────────────────────'));

      if (registry.agents.length === 0) {
        console.log('');
        console.log(GRAY('  No agents yet.'));
        console.log(GRAY('  Run `bob agent spawn <name> "<task>"` to create one.'));
        console.log('');
        return;
      }

      console.log('');
      for (const agent of registry.agents) {
        const icon = statusIcon(agent.status);
        const label = statusLabel(agent.status);
        const ago = formatTimeAgo(agent.lastActive);
        const task = agent.task.slice(0, 46) + (agent.task.length > 46 ? '...' : '');

        console.log(
          `  ${icon} ${PURPLE(`@${agent.name.padEnd(20)}`)} ` +
          `${label.padEnd(10)} ` +
          `${GRAY(ago.padEnd(12))} ` +
          `${WHITE(task)}`
        );
        if (agent.personaId) {
          console.log(`    ${GRAY('Persona:')} ${CYAN(agent.personaId)}`);
        }
      }

      console.log('');
      console.log(GRAY('  Commands:'));
      console.log(GRAY('    bob agent hub               — Command center'));
      console.log(GRAY('    bob agent chat <name>       — Focused chat with history'));
      console.log(GRAY('    bob agent personas          — List available personas'));
      console.log(GRAY('    bob agent status            — Detailed status view'));
      console.log(GRAY('    bob agent spawn <n> "<t>"   — Spawn a new agent'));
      console.log(GRAY('    bob agent stop <name>       — Stop without resetting'));
      console.log(GRAY('    bob agent reset <name>      — Reset + clear history'));
      console.log('');
    });

  // ── bob agent status ──────────────────────────────────────────
  agentCmd
    .command('status')
    .description('Show detailed status for all agents')
    .action(async () => {
      const config = getConfig();
      const cwd = process.cwd();
      const projectName = path.basename(cwd);
      const registry = loadRegistry(cwd);
      const limit = await fetchAgentLimit(config);
      const limitLabel = limit === -1 ? 'unlimited' : String(limit);
      const activeCount = getActiveAgentCount(cwd);

      console.log('');
      console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
      console.log(BORDER('  ║') + PURPLE('  🤖 Agent Status'));
      console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
      console.log(BORDER('  ║') + GRAY(`  Project: ${projectName}`));
      console.log(BORDER('  ║') + GRAY(`  Active:  ${activeCount}/${limitLabel}`));
      console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));

      if (registry.agents.length === 0) {
        console.log('');
        console.log(GRAY('  No agents yet. Run `bob agent spawn <name> "<task>"` to create one.'));
        console.log('');
        return;
      }

      for (const agent of registry.agents) {
        const session = loadSession(agent.name, cwd);
        const summary = loadAgentSummary(agent.name, cwd);
        const icon = statusIcon(agent.status);
        const ago = formatTimeAgo(agent.lastActive);

        console.log('');
        console.log(BORDER('  ┌─────────────────────────────────────────────────────────┐'));
        console.log(
          BORDER('  │') +
          `  ${icon} ${PURPLE(`@${agent.name}`)}  ` +
          `${statusLabel(agent.status)}  ` +
          GRAY(ago)
        );
        console.log(BORDER('  │'));
        console.log(BORDER('  │') + GRAY('  Task:'));
        console.log(
          BORDER('  │') +
          WHITE(`  ${agent.task.slice(0, 55)}${agent.task.length > 55 ? '...' : ''}`)
        );

        if (agent.personaId) {
          console.log(BORDER('  │'));
          console.log(BORDER('  │') + GRAY('  Persona: ') + CYAN(agent.personaId));
        }

        if (session) {
          console.log(BORDER('  │'));
          console.log(
            BORDER('  │') +
            GRAY(`  Messages: ${session.messageCount}  │  Created: ${formatTimeAgo(session.createdAt)}`)
          );
        }

        if (summary) {
          console.log(BORDER('  │'));
          console.log(BORDER('  │') + AMBER('  Last Summary:'));
          const summaryLines = summary
            .split('\n')
            .filter(l => l.trim())
            .slice(0, 4);
          for (const line of summaryLines) {
            console.log(
              BORDER('  │') +
              GRAY(`  ${line.slice(0, 55)}${line.length > 55 ? '...' : ''}`)
            );
          }
        }

        console.log(BORDER('  └─────────────────────────────────────────────────────────┘'));
      }

      console.log('');
    });

  // ── bob agent stop <name> ─────────────────────────────────────
  agentCmd
    .command('stop <name>')
    .description('Stop an agent without resetting its history')
    .action((name: string) => {
      const cwd = process.cwd();

      if (!agentExists(name, cwd)) {
        console.log('');
        console.log(RED(`  ❌ Agent "@${name}" not found.`));
        console.log('');
        return;
      }

      stopAgent(name, cwd);

      console.log('');
      console.log(GRAY(`  ⏸️  @${name} stopped. History preserved.`));
      console.log(GRAY(`  Resume: bob agent spawn ${name} "<task>"`));
      console.log('');
    });

  // ── bob agent reset <name> ────────────────────────────────────
  agentCmd
    .command('reset <name>')
    .description('Reset an agent — permanently clears all history')
    .action(async (name: string) => {
      const cwd = process.cwd();

      if (!agentExists(name, cwd)) {
        console.log('');
        console.log(RED(`  ❌ Agent "@${name}" not found.`));
        console.log('');
        return;
      }

      const session = loadSession(name, cwd);

      console.log('');
      console.log(BORDER('  ┌─────────────────────────────────────────────────────────┐'));
      console.log(BORDER('  │') + AMBER(`  ⚠️  WARNING: Reset @${name}`));
      console.log(BORDER('  │'));
      console.log(BORDER('  │') + RED('  This will permanently delete:'));
      console.log(BORDER('  │') + GRAY(`  • ${session?.messageCount || 0} messages of conversation history`));
      console.log(BORDER('  │') + GRAY('  • All session summaries'));
      console.log(BORDER('  │') + GRAY('  • All cross-agent context from this agent'));
      console.log(BORDER('  │'));
      console.log(BORDER('  │') + RED(`  Other agents that referenced @${name} will lose`));
      console.log(BORDER('  │') + RED('  that context. This cannot be undone.'));
      console.log(BORDER('  │'));
      console.log(BORDER('  └─────────────────────────────────────────────────────────┘'));
      console.log('');

      const { confirmed } = await inquirer.prompt([{
        type: 'input',
        name: 'confirmed',
        message: AMBER(`  Type "@${name}" to confirm reset:`),
        validate: (v: string) =>
          v.trim() === `@${name}` || v.trim() === name
            ? true
            : `Type @${name} to confirm.`,
      }]);

      if (
        confirmed.trim() !== `@${name}` &&
        confirmed.trim() !== name
      ) {
        console.log(GRAY('  Cancelled.'));
        console.log('');
        return;
      }

      resetAgent(name, cwd);

      console.log('');
      console.log(GREEN(`  ✅ @${name} has been reset.`));
      console.log('');
    });

  // ── bob agent reset-all ───────────────────────────────────────
  agentCmd
    .command('reset-all')
    .description('Reset ALL agents for the current project')
    .action(async () => {
      const cwd = process.cwd();
      const registry = loadRegistry(cwd);

      if (registry.agents.length === 0) {
        console.log('');
        console.log(GRAY('  No agents to reset.'));
        console.log('');
        return;
      }

      const totalMessages = registry.agents.reduce((sum, a) => {
        const session = loadSession(a.name, cwd);
        return sum + (session?.messageCount || 0);
      }, 0);

      console.log('');
      console.log(BORDER('  ┌─────────────────────────────────────────────────────────┐'));
      console.log(BORDER('  │') + AMBER('  ⚠️  WARNING: Reset ALL Agents'));
      console.log(BORDER('  │'));
      console.log(BORDER('  │') + RED('  This will permanently delete:'));
      console.log(BORDER('  │') + GRAY(`  • ${registry.agents.length} agents`));
      console.log(BORDER('  │') + GRAY(`  • ${totalMessages} total messages`));
      console.log(BORDER('  │') + GRAY('  • All summaries and cross-agent context'));
      console.log(BORDER('  │'));
      console.log(BORDER('  │') + RED('  This cannot be undone.'));
      console.log(BORDER('  │'));
      console.log(BORDER('  └─────────────────────────────────────────────────────────┘'));
      console.log('');

      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: AMBER('  Reset ALL agents?'),
        default: false,
      }]);

      if (!confirmed) {
        console.log(GRAY('  Cancelled.'));
        console.log('');
        return;
      }

      for (const agent of registry.agents) {
        resetAgent(agent.name, cwd);
      }

      console.log('');
      console.log(GREEN(`  ✅ All ${registry.agents.length} agents reset.`));
      console.log('');
    });

  // ── bob agent hub ─────────────────────────────────────────────
  agentCmd
    .command('hub')
    .description('Open the central hub — command center for all agents')
    .action(async () => {
      await runAgentHub(process.cwd());
    });

  // ── bob agent chat <name> ─────────────────────────────────────
  agentCmd
    .command('chat <name>')
    .description('Focused chat session with a single agent — paginated history + search')
    .option('--search <keyword>', 'Pre-filter history by keyword')
    .action(async (name: string, options: { search?: string }) => {
      const cwd = process.cwd();

      if (!agentExists(name, cwd)) {
        console.log('');
        console.log(RED(`  ❌ Agent "@${name}" not found.`));
        const registry = loadRegistry(cwd);
        if (registry.agents.length > 0) {
          console.log(GRAY(`  Available: ${registry.agents.map(a => `@${a.name}`).join(', ')}`));
        }
        console.log('');
        return;
      }

      await runAgentChat(name, cwd, options.search);
    });

  // ── bob agent summary ─────────────────────────────────────────
  agentCmd
    .command('summary')
    .description('Get a summary of all agent progress')
    .action(() => {
      const cwd = process.cwd();
      const registry = loadRegistry(cwd);

      if (registry.agents.length === 0) {
        console.log('');
        console.log(GRAY('  No agents to summarize.'));
        console.log('');
        return;
      }

      console.log('');
      console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
      console.log(BORDER('  ║') + AMBER('  📋 Agent Summary'));
      console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));

      for (const agent of registry.agents) {
        const summary = loadAgentSummary(agent.name, cwd);
        const session = loadSession(agent.name, cwd);
        const icon = statusIcon(agent.status);
        const ago = formatTimeAgo(agent.lastActive);

        console.log(BORDER('  ║'));
        console.log(
          BORDER('  ║') +
          `  ${icon} ${PURPLE(`@${agent.name}`)}  ` +
          GRAY(`(${session?.messageCount || 0} messages, ${ago})`)
        );
        console.log(
          BORDER('  ║') +
          GRAY(`  Task: ${agent.task.slice(0, 50)}${agent.task.length > 50 ? '...' : ''}`)
        );

        if (agent.personaId) {
          console.log(BORDER('  ║') + GRAY(`  Persona: `) + CYAN(agent.personaId));
        }

        if (summary) {
          const lines = summary.split('\n').filter(l => l.trim()).slice(0, 3);
          for (const line of lines) {
            console.log(
              BORDER('  ║') +
              GRAY(`  ${line.slice(0, 55)}${line.length > 55 ? '...' : ''}`)
            );
          }
        } else {
          console.log(BORDER('  ║') + GRAY('  No summary yet.'));
        }
      }

      console.log(BORDER('  ║'));
      console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
      console.log('');
    });
}