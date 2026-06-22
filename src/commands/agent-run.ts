// File: src/commands/agent-run.ts

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import * as path from 'path';
import { getConfig } from '../core/config-store.js';
import { loadRegistry } from '../core/agent-store.js';
import {
  createMission,
  loadMission,
  getActiveMissionId,
  getMissionSummary,
  saveMission,
} from '../core/agent-queue.js';
import {
  generateTaskMap,
  runAutonomousLoop,
  DirectorState,
} from '../core/director-bob.js';
import {
  renderMissionHeader,
  renderTaskMap,
  renderMissionComplete,
  renderExecutionEvent,
  renderPostMissionFeedback,
  renderPostMissionCommitPrompt,
  handleRunCommand,
} from '../ui/agent-run-renderer.js';
import { ExecutionEvent } from '../core/agent-executor.js';
import { clearAllPendingCommits } from '../core/agent-tools.js';

const AMBER  = chalk.hex('#FFAB00');
const GREEN  = chalk.hex('#66BB6A');
const RED    = chalk.hex('#EF5350');
const CYAN   = chalk.cyan;
const GRAY   = chalk.gray;

export function registerAgentRunCommand(program: Command): void {

  program
    .command('agent-run [mission...]')
    .description('Launch DirectorBob — autonomous multi-agent mission execution')
    .option('--satisfaction <number>', 'Global satisfaction target override (0-100)')
    .option('--stagnation <number>', 'Global stagnation limit override', '3')
    .option('--director-limit <number>', 'Director surface limit before user escalation', '2')
    .option('--dry-run', 'Preview task map without executing')
    .option('--resume', 'Resume the last active mission')
    .option('--no-feedback', 'Skip post-mission feedback collection')
    .option('--no-commit', 'Skip post-mission commit prompt')
    .action(async (
      missionArgs: string[],
      options: {
        satisfaction?: string;
        stagnation?: string;
        directorLimit?: string;
        dryRun?: boolean;
        resume?: boolean;
        feedback?: boolean;
        commit?: boolean;
      }
    ) => {
      const config = getConfig();
      const cwd = process.cwd();

      if (!config.localEndpoint) {
        console.log('');
        console.log(RED('  ❌ bob agent run requires a local model.'));
        console.log(GRAY('  Run: bob config set localEndpoint http://127.0.0.1:11434/api/chat'));
        console.log('');
        return;
      }

      const registry = loadRegistry(cwd);
      if (registry.agents.length === 0) {
        console.log('');
        console.log(AMBER('  ⚠️  No agents found.'));
        console.log(GRAY('  Spawn agents first: bob agent spawn <name> "<task>"'));
        console.log('');
        return;
      }

      const agents = registry.agents.filter(
        a => a.status === 'active' || a.status === 'idle'
      );

      if (agents.length === 0) {
        console.log('');
        console.log(AMBER('  ⚠️  No active agents found.'));
        console.log('');
        return;
      }

      // ─── Resume existing mission ───────────────────────────────
      if (options.resume) {
        const activeMissionId = getActiveMissionId(cwd);
        if (!activeMissionId) {
          console.log('');
          console.log(AMBER('  ⚠️  No active mission to resume.'));
          console.log('');
          return;
        }
        const existingMission = loadMission(activeMissionId, cwd);
        if (!existingMission) {
          console.log('');
          console.log(RED('  ❌ Could not load mission: ' + activeMissionId));
          console.log('');
          return;
        }
        console.log('');
        console.log(AMBER(`  🔄 Resuming mission: ${existingMission.description.slice(0, 50)}...`));
        await executeMission(existingMission, agents, cwd, config.localEndpoint!, options);
        return;
      }

      // ─── Resolve mission description ───────────────────────────
      let missionDescription = missionArgs.join(' ').trim();
      if (!missionDescription) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        missionDescription = await new Promise<string>(resolve => {
          rl.question(AMBER('  🎬 What is the mission? > '), resolve);
        });
        rl.close();
        if (!missionDescription.trim()) {
          console.log(RED('  ❌ Mission cannot be empty.'));
          return;
        }
        missionDescription = missionDescription.trim();
      }

      // ─── Clear pending commits from previous sessions ──────────
      clearAllPendingCommits(cwd);

      // ─── Generate task map ─────────────────────────────────────
      console.log('');
      const planSpinner = ora({
        text: AMBER('  🎬 DirectorBob is analyzing your team and building the task map...'),
        spinner: 'dots',
      }).start();

      let taskDefs: any[];
      try {
        taskDefs = await generateTaskMap(
          missionDescription,
          agents,
          cwd,
          config.localEndpoint!
        );
        planSpinner.stop();
      } catch (error: any) {
        planSpinner.stop();
        console.log(RED(`  ❌ DirectorBob failed to generate task map: ${error.message}`));
        return;
      }

      if (options.satisfaction) {
        const target = parseInt(options.satisfaction);
        taskDefs = taskDefs.map(t => ({ ...t, satisfactionTarget: target }));
      }
      if (options.stagnation) {
        const limit = parseInt(options.stagnation);
        taskDefs = taskDefs.map(t => ({ ...t, stagnationLimit: limit }));
      }
      if (options.directorLimit) {
        const limit = parseInt(options.directorLimit);
        taskDefs = taskDefs.map(t => ({ ...t, directorLimit: limit }));
      }

      const resolvedTasks = taskDefs.map((t) => ({
        ...t,
        dependsOn: (t.dependsOn || []).map((dep: string) => {
          const match = dep.match(/__TASK_(\d+)__/);
          return match ? `__RESOLVED_${match[1]}__` : dep;
        }),
      }));

      const mission = createMission(missionDescription, resolvedTasks, cwd);

      mission.tasks.forEach((task) => {
        task.dependsOn = task.dependsOn.map((dep: string) => {
          const match = dep.match(/__RESOLVED_(\d+)__/);
          if (match) {
            const depIdx = parseInt(match[1]);
            return mission.tasks[depIdx]?.id || dep;
          }
          return dep;
        });
      });
      saveMission(mission, cwd);

      const agentNames = agents.map(a => a.name);
      renderMissionHeader(mission, agentNames);
      renderTaskMap(mission, agentNames);

      if (options.dryRun) {
        console.log(CYAN('  Dry run complete. No tasks executed.'));
        console.log(GRAY('  Run without --dry-run to execute.'));
        console.log('');
        return;
      }

      console.log(AMBER('  Starting in 3 seconds... (Ctrl+C to abort)'));
      await new Promise(r => setTimeout(r, 3000));

      await executeMission(mission, agents, cwd, config.localEndpoint!, options);
    });

  program
    .command('agent-status')
    .description('Show status of the current active mission')
    .action(() => {
      const cwd = process.cwd();
      const activeMissionId = getActiveMissionId(cwd);
      if (!activeMissionId) {
        console.log('');
        console.log(GRAY('  No active mission.'));
        console.log(GRAY('  Start one: bob agent-run "your mission"'));
        console.log('');
        return;
      }
      const mission = loadMission(activeMissionId, cwd);
      if (!mission) {
        console.log('');
        console.log(RED('  ❌ Could not load mission: ' + activeMissionId));
        console.log('');
        return;
      }
      const registry = loadRegistry(cwd);
      const agentNames = registry.agents.map(a => a.name);
      renderTaskMap(mission, agentNames);
    });
}

// ─── MISSION EXECUTION ────────────────────────────────────────────

async function executeMission(
  mission: any,
  agents: any[],
  cwd: string,
  localEndpoint: string,
  options: any
): Promise<void> {

  const agentNames = agents.map((a: any) => a.name);

  const state: DirectorState = {
    paused: false,
    aborted: false,
    userInjections: [],
    satisfactionOverrides: {},
    pendingCommitApproval: null,
    commitDenialCounts: new Map(),
  };

  mission.status = 'running';
  mission.startedAt = new Date().toISOString();
  saveMission(mission, cwd);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const result = handleRunCommand(trimmed, state, mission, cwd);
    if (result.message) console.log(result.message);
    if (trimmed === '/status') renderTaskMap(mission, agentNames);
  });

  const onEvent = (event: ExecutionEvent) => {
    renderExecutionEvent(event, agentNames);
  };

  try {
    const result = await runAutonomousLoop(
      mission,
      agents,
      cwd,
      localEndpoint,
      state,
      onEvent
    );

    rl.close();

    if (result.completed) {
      renderMissionComplete(result.mission);

      // ─── Post-mission commit prompt ─────────────────────────
      if (options.commit !== false) {
        await renderPostMissionCommitPrompt(result.mission, cwd);
      }

      // ─── Post-mission feedback ──────────────────────────────
      if (options.feedback !== false) {
        await renderPostMissionFeedback(result.mission, cwd);
      }

    } else if (result.aborted) {
      console.log('');
      console.log(RED('  🛑 Mission aborted.'));
      console.log(GRAY('  Resume anytime: bob agent-run --resume'));
      console.log('');
    } else if (result.surfacedToUser) {
      console.log('');
      console.log(AMBER('  ⚠️  Mission needs your attention.'));
      console.log(RED(`  Reason: ${result.surfaceReason}`));
      console.log('');
      console.log(GRAY('  Options:'));
      console.log(CYAN('    bob agent-run --resume') + GRAY('           — resume after resolving'));
      console.log(CYAN('    bob agent chat <name>') + GRAY('            — talk directly to stuck agent'));
      console.log(CYAN('    bob agent-status') + GRAY('                 — see full task map'));
      console.log('');
    }

  } catch (error: any) {
    rl.close();
    console.log('');
    console.log(RED(`  ❌ Mission failed: ${error.message}`));
    console.log('');
  }
}