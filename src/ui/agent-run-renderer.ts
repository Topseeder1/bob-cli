// File: src/ui/agent-run-renderer.ts

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { diffLines } from 'diff';
import {
  AgentMission,
  AgentTask,
  getMissionSummary,
} from '../core/agent-queue.js';
import {
  getSatisfactionColor,
  getSatisfactionBar,
} from '../core/agent-satisfaction.js';
import { DirectorState } from '../core/director-bob.js';
import { ExecutionEvent } from '../core/agent-executor.js';
import { renderAgentChip, getAgentColorPair } from './agent-renderer.js';

const PURPLE         = chalk.hex('#AB47BC');
const AMBER          = chalk.hex('#FFAB00');
const GREEN          = chalk.hex('#66BB6A');
const RED            = chalk.hex('#EF5350');
const CYAN           = chalk.cyan;
const GRAY           = chalk.gray;
const BLUE           = chalk.hex('#42A5F5');
const BORDER         = chalk.hex('#455A64');
const WHITE          = chalk.white;
const ORANGE         = chalk.hex('#FF7043');
const DIRECTOR_COLOR = chalk.hex('#FFD700');
const BRAND_SECONDARY = chalk.hex('#FFAB00');

function isLeakedContent(line: string): boolean {
  const t = line.trim();
  if (t.startsWith('[Tool:'))     return true;
  if (t.startsWith('TOOL_CALL:')) return true;
  if (t.startsWith('tool_call:')) return true;
  if (t.startsWith('import '))    return true;
  if (t.startsWith('export '))    return true;
  if (t.startsWith('const '))     return true;
  if (t.startsWith('let '))       return true;
  if (t.startsWith('var '))       return true;
  if (t.startsWith('function '))  return true;
  if (t.startsWith('class '))     return true;
  if (t.startsWith('#!/'))        return true;
  if (t.startsWith('// File:'))   return true;
  if (t.startsWith('```'))        return true;
  if (t === '{' || t === '}')     return true;
  return false;
}

function cleanAgentResponse(response: string): string[] {
  return response
    .split('\n')
    .filter(l => l.trim())
    .filter(l => !isLeakedContent(l))
    .slice(0, 4);
}

// ─── MISSION HEADER ───────────────────────────────────────────────

export function renderMissionHeader(
  mission: AgentMission,
  agentNames: string[]
): void {
  const chips = agentNames.map(n => renderAgentChip(n, agentNames, true)).join('  ');

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + DIRECTOR_COLOR('  🎬 DirectorBob  ') + GRAY('— Autonomous Mission Control'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + `  ${WHITE(mission.description.slice(0, 56))}${mission.description.length > 56 ? GRAY('...') : ''}`);
  console.log(BORDER('  ║') + GRAY(`  Mission: ${mission.id}  │  Tasks: ${mission.tasks.length}  │  Team: ${agentNames.length} agents`));
  console.log(BORDER('  ║'));
  console.log(BORDER('  ║') + `  ${chips}`);
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + AMBER('  Live Commands:'));
  console.log(BORDER('  ║') + CYAN('    /pause') + GRAY('                  — pause after active tasks'));
  console.log(BORDER('  ║') + CYAN('    /resume') + GRAY('                 — resume from pause'));
  console.log(BORDER('  ║') + CYAN('    /status') + GRAY('                 — full task map'));
  console.log(BORDER('  ║') + CYAN('    /view-targets') + GRAY('           — satisfaction targets'));
  console.log(BORDER('  ║') + CYAN('    /set-target <agent> <n>') + GRAY(' — adjust target'));
  console.log(BORDER('  ║') + CYAN('    /inject "note"') + GRAY('          — director note'));
  console.log(BORDER('  ║') + CYAN('    /approve-commit') + GRAY('         — approve pending commit'));
  console.log(BORDER('  ║') + CYAN('    /deny-commit') + GRAY('            — deny pending commit'));
  console.log(BORDER('  ║') + CYAN('    /skip <taskId>') + GRAY('          — skip a task'));
  console.log(BORDER('  ║') + CYAN('    /abort') + GRAY('                  — stop everything'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

// ─── TASK MAP ─────────────────────────────────────────────────────

export function renderTaskMap(
  mission: AgentMission,
  agentNames: string[]
): void {
  const summary = getMissionSummary(mission);

  console.log('');
  console.log(DIRECTOR_COLOR('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(DIRECTOR_COLOR('  ║') + AMBER('  📋 Task Map') + GRAY(`  — ${summary.total} tasks`));
  console.log(DIRECTOR_COLOR('  ╠══════════════════════════════════════════════════════════╣'));

  const running   = mission.tasks.filter(t => t.status === 'running');
  const pending   = mission.tasks.filter(t => t.status === 'pending');
  const completed = mission.tasks.filter(t => t.status === 'completed');
  const failed    = mission.tasks.filter(t => t.status === 'failed' || t.status === 'stagnated');
  const skipped   = mission.tasks.filter(t => t.status === 'skipped');

  if (running.length > 0) {
    console.log(DIRECTOR_COLOR('  ║') + CYAN('  ⏳ RUNNING'));
    for (const task of running) renderTaskRow(task, agentNames, true);
    console.log(DIRECTOR_COLOR('  ║'));
  }
  if (pending.length > 0) {
    console.log(DIRECTOR_COLOR('  ║') + GRAY('  ⏸  QUEUED'));
    for (const task of pending) renderTaskRow(task, agentNames, false);
    console.log(DIRECTOR_COLOR('  ║'));
  }
  if (completed.length > 0) {
    console.log(DIRECTOR_COLOR('  ║') + GREEN('  ✅ COMPLETED'));
    for (const task of completed) renderTaskRow(task, agentNames, false);
    console.log(DIRECTOR_COLOR('  ║'));
  }
  if (failed.length > 0) {
    console.log(DIRECTOR_COLOR('  ║') + RED('  ❌ FAILED / STAGNATED'));
    for (const task of failed) renderTaskRow(task, agentNames, false);
    console.log(DIRECTOR_COLOR('  ║'));
  }
  if (skipped.length > 0) {
    console.log(DIRECTOR_COLOR('  ║') + GRAY('  ⏭️  SKIPPED'));
    for (const task of skipped) renderTaskRow(task, agentNames, false);
    console.log(DIRECTOR_COLOR('  ║'));
  }

  console.log(DIRECTOR_COLOR('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(
    DIRECTOR_COLOR('  ║') + '  ' +
    GREEN(`✅ ${summary.completed}`) + GRAY(' done  ') +
    CYAN(`⏳ ${summary.running}`) + GRAY(' running  ') +
    GRAY(`⏸  ${summary.pending}`) + GRAY(' queued') +
    (summary.failed > 0 ? '  ' + RED(`❌ ${summary.failed}`) + GRAY(' failed') : '') +
    (summary.stagnated > 0 ? '  ' + ORANGE(`⚠️  ${summary.stagnated}`) + GRAY(' stagnated') : '')
  );

  const barWidth = 46;
  const filled = Math.round((summary.percentComplete / 100) * barWidth);
  const empty = barWidth - filled;
  let barColor;
  if (summary.percentComplete >= 75) barColor = chalk.green;
  else if (summary.percentComplete >= 50) barColor = chalk.hex('#FFAB00');
  else if (summary.percentComplete >= 25) barColor = chalk.hex('#FF7043');
  else barColor = chalk.red;

  console.log(
    DIRECTOR_COLOR('  ║') + '  ' +
    GRAY('[') + barColor('█'.repeat(filled)) + GRAY('░'.repeat(empty)) + GRAY('] ') +
    barColor(`${summary.percentComplete}%`) + GRAY(` — ${summary.completed}/${summary.total}`)
  );
  console.log(DIRECTOR_COLOR('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

function renderTaskRow(task: AgentTask, agentNames: string[], showSatBar: boolean): void {
  const statusIcon = getTaskStatusIcon(task.status);
  const chip = renderAgentChip(task.assignedTo, agentNames, task.status === 'running');
  const instruction = task.instruction.slice(0, 44) + (task.instruction.length > 44 ? '...' : '');
  const depInfo = task.dependsOn.length > 0
    ? GRAY(` ← ${task.dependsOn.length} dep${task.dependsOn.length > 1 ? 's' : ''}`)
    : '';

  console.log(DIRECTOR_COLOR('  ║') + `  ${statusIcon} ${chip}  ` + WHITE(instruction) + depInfo);

  if (showSatBar && task.lastSatisfactionScore !== null) {
    const score = task.lastSatisfactionScore;
    const target = task.satisfactionTarget;
    const bar = getSatisfactionBar(score, target, 14);
    const color = chalk.hex(getSatisfactionColor(score, target));
    console.log(
      DIRECTOR_COLOR('  ║') + `    ${color(bar)} ` + color(`${score}%`) +
      GRAY(` / ${target}% target`) +
      (task.attemptCount > 1 ? GRAY(` · attempt ${task.attemptCount}`) : '')
    );
  }

  if ((task.status === 'stagnated' || task.stagnationCount > 0) && task.notes.length > 0) {
    const lastNote = task.notes[task.notes.length - 1];
    console.log(DIRECTOR_COLOR('  ║') + ORANGE(`    ⚠️  ${lastNote.slice(0, 60)}${lastNote.length > 60 ? '...' : ''}`));
  }
}

// ─── LIVE EVENT RENDERER ──────────────────────────────────────────

export function renderExecutionEvent(event: ExecutionEvent, agentNames: string[]): void {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
  const timeStamp = GRAY(`[${time}]`);

  switch (event.type) {
    case 'thinking': {
      if (event.agentName === 'directorBob') {
        console.log(`${timeStamp} ${DIRECTOR_COLOR('🎬 DirectorBob:')} ${GRAY(event.message)}`);
      } else {
        const chip = renderAgentChip(event.agentName, agentNames, true);
        console.log(`${timeStamp} ${chip} ${GRAY('thinking...')}`);
      }
      break;
    }
    case 'response': {
      if (event.agentName === 'directorBob') {
        console.log('');
        console.log(DIRECTOR_COLOR('  ┌─ DirectorBob ──────────────────────────────────────────┐'));
        const lines = event.message.split('\n').filter(l => l.trim()).filter(l => !isLeakedContent(l)).slice(0, 3);
        for (const line of lines) {
          console.log(DIRECTOR_COLOR('  │') + DIRECTOR_COLOR(`  ${line.slice(0, 58)}`));
        }
        console.log(DIRECTOR_COLOR('  └────────────────────────────────────────────────────────┘'));
        console.log('');
      } else {
        const chip = renderAgentChip(event.agentName, agentNames, true);
        const { fg } = getAgentColorPair(event.agentName, agentNames);
        const lines = cleanAgentResponse(event.message);
        if (lines.length === 0) break;
        console.log('');
        console.log(`  ${chip}`);
        for (const line of lines) {
          console.log(fg(`    ${line.slice(0, 68)}${line.length > 68 ? '...' : ''}`));
        }
      }
      break;
    }
    case 'tool_call': {
      const chip = renderAgentChip(event.agentName, agentNames, true);
      const toolName = event.data?.tool || 'unknown';
      const toolColors: Record<string, chalk.Chalk> = {
        createFile: GREEN, modifyFile: AMBER, readFile: CYAN,
        writeOutput: BLUE, readAgentOutput: BLUE,
        gitCommit: PURPLE, gitPush: PURPLE,
      };
      const toolColor = toolColors[toolName] || GRAY;
      console.log(`  ${chip} ${toolColor(`🔧 ${toolName}`)}`);
      break;
    }
    case 'tool_result': {
      if (event.data?.success) {
        console.log(GREEN(`    ✅ ${event.message.slice(0, 72)}`));
      } else {
        console.log(RED(`    ❌ ${event.message.slice(0, 72)}`));
      }
      break;
    }
    case 'satisfaction': {
      const score = event.data?.score ?? 0;
      const targetMatch = event.message.match(/target (\d+)%/);
      const target = targetMatch ? parseInt(targetMatch[1]) : 75;
      const isDone = event.data?.isDone;
      const isStagnating = event.data?.isStagnating;
      const color = chalk.hex(getSatisfactionColor(score, target));
      const bar = getSatisfactionBar(score, target, 12);
      const statusTag = isDone ? GREEN(' ✅ DONE') : isStagnating ? ORANGE(' ⚠️  STAGNATING') : GRAY(' working...');
      console.log(`    ${color(bar)} ` + color(`${score}%`) + GRAY(` → target ${target}%`) + statusTag);
      break;
    }
    case 'done': {
      console.log('');
      console.log(GREEN(`  ✅ ${event.message}`));
      break;
    }
    case 'stagnating': {
      console.log('');
      console.log(ORANGE(`  ⚠️  ${event.message}`));
      break;
    }
    case 'error': {
      console.log('');
      console.log(RED(`  ❌ ${event.message}`));
      break;
    }
  }
}

// ─── PENDING COMMIT BANNER ────────────────────────────────────────

export function renderPendingCommitBanner(
  agentName: string,
  message: string,
  filesModified: string[]
): void {
  console.log('');
  console.log(AMBER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(AMBER('  ║') + DIRECTOR_COLOR('  🔐 DirectorBob — Commit Approval Required'));
  console.log(AMBER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(AMBER('  ║') + GRAY(`  Agent: @${agentName}`));
  console.log(AMBER('  ║') + WHITE(`  Message: "${message}"`));
  if (filesModified.length > 0) {
    console.log(AMBER('  ║'));
    console.log(AMBER('  ║') + GRAY('  Files to commit:'));
    for (const f of filesModified.slice(0, 5)) {
      console.log(AMBER('  ║') + CYAN(`    ${f}`));
    }
  }
  console.log(AMBER('  ║'));
  console.log(AMBER('  ║') + GREEN('    /approve-commit') + GRAY('  — approve and execute commit'));
  console.log(AMBER('  ║') + RED('    /deny-commit') + GRAY('     — deny and restore from backup'));
  console.log(AMBER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

// ─── POST-MISSION FEEDBACK ────────────────────────────────────────

export async function renderPostMissionFeedback(
  mission: AgentMission,
  cwd: string
): Promise<void> {
  const readline = await import('readline');
  const path = await import('path');
  const fs = await import('fs');
  const os = await import('os');

  console.log('');
  console.log(DIRECTOR_COLOR('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(DIRECTOR_COLOR('  ║') + AMBER('  📝 Mission Feedback — Help train the agents'));
  console.log(DIRECTOR_COLOR('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(DIRECTOR_COLOR('  ║') + GRAY('  Your feedback improves future missions.'));
  console.log(DIRECTOR_COLOR('  ║') + GRAY('  Press Enter to skip any task.'));
  console.log(DIRECTOR_COLOR('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  const completedTasks = mission.tasks.filter(t => t.status === 'completed');
  const feedback: any[] = [];

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  for (const task of completedTasks) {
    const chip = renderAgentChip(task.assignedTo, mission.tasks.map(t => t.assignedTo), true);
    console.log(`  ${chip} ${GRAY(task.instruction.slice(0, 60))}`);

    const rating = await new Promise<string>(resolve => {
      rl.question(AMBER('  Rate (👍 good / 👎 bad / skip): '), resolve);
    });

    const trimmed = rating.trim().toLowerCase();
    if (trimmed === '' || trimmed === 'skip') {
      console.log('');
      continue;
    }

    let comment = '';
    if (trimmed === '👎' || trimmed === 'bad' || trimmed === 'n') {
      comment = await new Promise<string>(resolve => {
        rl.question(GRAY('  What went wrong? (optional): '), resolve);
      });
    }

    feedback.push({
      taskId: task.id,
      agentName: task.assignedTo,
      instruction: task.instruction,
      rating: trimmed === '👍' || trimmed === 'good' || trimmed === 'y' ? 'good' : 'bad',
      comment: comment.trim() || null,
      filesCreated: task.filesCreated,
      filesModified: task.filesModified,
      attemptCount: task.attemptCount,
    });

    console.log('');
  }

  rl.close();

  if (feedback.length === 0) return;

  const projectName = path.basename(cwd);
  const feedbackDir = path.join(os.homedir(), '.bob', 'projects', projectName, 'agents', 'feedback');
  if (!fs.existsSync(feedbackDir)) fs.mkdirSync(feedbackDir, { recursive: true });

  const sessionFeedback = {
    missionId: mission.id,
    missionDescription: mission.description,
    timestamp: new Date().toISOString(),
    tasks: feedback,
  };

  const feedbackFile = path.join(feedbackDir, `${mission.id}.json`);
  fs.writeFileSync(feedbackFile, JSON.stringify(sessionFeedback, null, 2));

  const globalDir = path.join(os.homedir(), '.bob', 'global', 'agent-training');
  if (!fs.existsSync(globalDir)) fs.mkdirSync(globalDir, { recursive: true });

  const globalFile = path.join(globalDir, `${new Date().toISOString().split('T')[0]}_${mission.id}.json`);
  fs.writeFileSync(globalFile, JSON.stringify(sessionFeedback, null, 2));

  console.log(GREEN(`  ✅ Feedback saved. Thank you for helping train the agents.`));
  console.log(GRAY(`  Saved to: ~/.bob/projects/${projectName}/agents/feedback/`));
  console.log(GRAY(`  Global:   ~/.bob/global/agent-training/`));
  console.log('');
}

// ─── MISSION COMPLETE ─────────────────────────────────────────────

export function renderMissionComplete(mission: AgentMission): void {
  const summary = getMissionSummary(mission);
  const duration = mission.startedAt && mission.completedAt
    ? Math.round((new Date(mission.completedAt).getTime() - new Date(mission.startedAt).getTime()) / 1000)
    : 0;
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  const durationLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + DIRECTOR_COLOR('  🏁 DirectorBob — Mission Complete'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + WHITE(`  ${mission.description.slice(0, 56)}`));
  console.log(BORDER('  ║'));
  console.log(BORDER('  ║') + GREEN(`  ✅ Tasks completed:   ${summary.completed}/${summary.total}`));
  if (summary.failed > 0) console.log(BORDER('  ║') + RED(`  ❌ Tasks failed:      ${summary.failed}`));
  if (summary.stagnated > 0) console.log(BORDER('  ║') + ORANGE(`  ⚠️  Tasks stagnated:  ${summary.stagnated}`));
  if (summary.skipped > 0) console.log(BORDER('  ║') + GRAY(`  ⏭️  Tasks skipped:    ${summary.skipped}`));
  console.log(BORDER('  ║'));
  console.log(BORDER('  ║') + CYAN(`  📁 Files created:    ${mission.totalFilesCreated}`));
  console.log(BORDER('  ║') + CYAN(`  ✏️  Files modified:   ${mission.totalFilesModified}`));
  if (duration > 0) console.log(BORDER('  ║') + GRAY(`  ⏱  Duration:         ${durationLabel}`));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GRAY('  Next steps:'));
  console.log(BORDER('  ║') + CYAN('    bob analyse --results') + GRAY('        — review what changed'));
  console.log(BORDER('  ║') + CYAN('    bob backup restore') + GRAY('          — undo if needed'));
  console.log(BORDER('  ║') + CYAN('    bob push "mission complete"') + GRAY('  — commit changes'));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

// ─── PAUSED BANNER ────────────────────────────────────────────────

export function renderPausedBanner(reason?: string): void {
  console.log('');
  console.log(AMBER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(AMBER('  ║') + AMBER('  ⏸️  Mission Paused — User Intervention Required'));
  if (reason) console.log(AMBER('  ║') + RED(`  ${reason.slice(0, 56)}`));
  console.log(AMBER('  ║'));
  console.log(AMBER('  ║') + GRAY('  Type /resume to continue, or /abort to stop.'));
  console.log(AMBER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

// ─── DIRECTOR PLANNING ───────────────────────────────────────────

export function renderDirectorPlanning(): void {
  console.log('');
  console.log(DIRECTOR_COLOR('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(DIRECTOR_COLOR('  ║') + DIRECTOR_COLOR('  🎬 DirectorBob is analyzing your team...'));
  console.log(DIRECTOR_COLOR('  ║'));
  console.log(DIRECTOR_COLOR('  ║') + GRAY('  ◎ Scanning existing files and assessing what works'));
  console.log(DIRECTOR_COLOR('  ║') + GRAY('  ◎ Identifying empty, broken, and missing files'));
  console.log(DIRECTOR_COLOR('  ║') + GRAY('  ◎ Building dependency graph'));
  console.log(DIRECTOR_COLOR('  ║') + GRAY('  ◎ Setting per-task satisfaction targets'));
  console.log(DIRECTOR_COLOR('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

// ─── POST-MISSION COMMIT PROMPT ───────────────────────────────────
// NEW ADDITION — everything above this line is unchanged from original.
//
// Shows a condensed file summary (same visual language as chat's
// renderFileDiff) then offers to commit with a pre-filled message.

export async function renderPostMissionCommitPrompt(
  mission: AgentMission,
  cwd: string
): Promise<void> {
  const readline = await import('readline');

  // ─── Collect all files touched this mission ───────────────────
  const allCreated: string[] = [];
  const allModified: string[] = [];

  for (const task of mission.tasks) {
    if (task.status !== 'completed') continue;
    for (const f of task.filesCreated) {
      if (!allCreated.includes(f)) allCreated.push(f);
    }
    for (const f of task.filesModified) {
      if (!allModified.includes(f) && !allCreated.includes(f)) allModified.push(f);
    }
  }

  const totalFiles = allCreated.length + allModified.length;
  if (totalFiles === 0) return;

  // ─── Render condensed file summary ───────────────────────────
  console.log('');
  console.log(BORDER('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(BORDER('  ║') + AMBER('  📦 Mission Changes — Ready to Commit'));
  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log('');

  // Created files — same style as chat renderFileDiff isNew=true
  for (const filePath of allCreated) {
    const absolutePath = path.join(cwd, filePath);
    let lineCount = 0;
    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      lineCount = content.split('\n').length;
    } catch { }
    console.log(GREEN(`  ◆ Created  ${filePath}`));
    console.log(chalk.bgHex('#0D2B0D')(chalk.white(`    + New file (${lineCount} lines)`)));
    console.log('');
  }

  // Modified files — diff preview with +/- counts
  for (const filePath of allModified) {
    const absolutePath = path.join(cwd, filePath);
    let additions = 0;
    let removals = 0;
    const diffPreview: string[] = [];

    try {
      const backupDir = path.join(cwd, '.bob-backups');
      if (fs.existsSync(backupDir) && fs.existsSync(absolutePath)) {
        const safeName = filePath.replace(/[\/\\]/g, '_');
        const backups = fs.readdirSync(backupDir)
          .filter(f => f.startsWith(safeName) && f.endsWith('.bak'))
          .sort()
          .reverse();

        if (backups.length > 0) {
          const originalContent = fs.readFileSync(path.join(backupDir, backups[0]), 'utf-8');
          const currentContent = fs.readFileSync(absolutePath, 'utf-8');
          const changes = diffLines(originalContent, currentContent);

          for (const change of changes) {
            const lines = change.value.split('\n').filter(l => l !== '');
            for (const line of lines) {
              if (change.added) {
                additions++;
                if (diffPreview.length < 4) {
                  diffPreview.push(chalk.bgHex('#0D2B0D')(chalk.white(`    + ${line.slice(0, 60)}${line.length > 60 ? '...' : ''}`)));
                }
              } else if (change.removed) {
                removals++;
                if (diffPreview.length < 4) {
                  diffPreview.push(chalk.bgHex('#2D0D0D')(chalk.white(`    - ${line.slice(0, 60)}${line.length > 60 ? '...' : ''}`)));
                }
              }
            }
          }
        }
      }
    } catch { }

    console.log(BRAND_SECONDARY(`  ◆ Modified ${filePath}`));
    for (const line of diffPreview) console.log(line);
    if (additions > 0 || removals > 0) {
      console.log(GRAY(`    ${GREEN(`+${additions}`)} ${RED(`-${removals}`)}`));
    }
    console.log('');
  }

  console.log(BORDER('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(BORDER('  ║') + GRAY(`  ${allCreated.length} created  │  ${allModified.length} modified  │  ${totalFiles} total`));
  console.log(BORDER('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  // ─── Commit prompt ────────────────────────────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>(resolve => {
    rl.question(AMBER('  Commit these changes? (y/n): '), resolve);
  });

  if (answer.trim().toLowerCase() !== 'y' && answer.trim().toLowerCase() !== 'yes') {
    rl.close();
    console.log(GRAY('  Skipped. Run `git add . && git commit` manually when ready.'));
    console.log('');
    return;
  }

  const defaultMessage = `feat(agents): ${mission.description.slice(0, 60)}`;
  const messageAnswer = await new Promise<string>(resolve => {
    rl.question(AMBER(`  Commit message (Enter for default: "${defaultMessage.slice(0, 40)}..."): `), resolve);
  });
  rl.close();

  const commitMessage = messageAnswer.trim() || defaultMessage;

  // ─── Run git commit ───────────────────────────────────────────
  try {
    const simpleGit = (await import('simple-git')).default;
    const git = simpleGit(cwd);

    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      console.log(RED('  ❌ Not a git repository. Run `git init` first.'));
      console.log('');
      return;
    }

    await git.add('.');
    const result = await git.commit(commitMessage);

    console.log('');
    console.log(GREEN(`  ✅ Committed: ${result.commit?.slice(0, 7)} — ${commitMessage}`));
    console.log(GRAY('  Run `git push` to push to remote.'));
    console.log('');

  } catch (e: any) {
    console.log(RED(`  ❌ Commit failed: ${e.message}`));
    console.log('');
  }
}

// ─── USER CONTROLS ────────────────────────────────────────────────

export function handleRunCommand(
  input: string,
  state: DirectorState,
  mission: AgentMission,
  cwd: string
): { handled: boolean; message?: string; showStatus?: boolean } {
  const trimmed = input.trim();

  if (trimmed === '/pause') {
    state.paused = true;
    return { handled: true, message: AMBER('  ⏸️  Pausing after active tasks complete...') };
  }
  if (trimmed === '/resume') {
    state.paused = false;
    return { handled: true, message: GREEN('  ▶️  Resumed.') };
  }
  if (trimmed === '/abort') {
    state.aborted = true;
    return { handled: true, message: RED('  🛑 Aborting mission...') };
  }
  if (trimmed === '/status') {
    return { handled: true, showStatus: true };
  }
  if (trimmed === '/approve-commit') {
    state.pendingCommitApproval = { approved: true } as any;
    return { handled: true, message: GREEN('  ✅ Commit approved — DirectorBob will execute on next cycle.') };
  }
  if (trimmed === '/deny-commit') {
    const { clearPendingCommit } = require('../core/agent-tools.js');
    clearPendingCommit(cwd);
    return { handled: true, message: RED('  ❌ Commit denied. Files remain as-is.') };
  }
  if (trimmed === '/view-targets') {
    const lines: string[] = [''];
    lines.push(AMBER('  Satisfaction Targets:'));
    lines.push(GRAY('  ─────────────────────────────────────────────────────────'));
    for (const task of mission.tasks) {
      const statusIcon = getTaskStatusIcon(task.status);
      lines.push(
        `  ${statusIcon} ${GRAY(`@${task.assignedTo.padEnd(18)}`)} ` +
        chalk.cyan(`${task.satisfactionTarget}%`) +
        (state.satisfactionOverrides[task.assignedTo] !== undefined ? GREEN(' (user override)') : '') +
        (task.status === 'running' ? chalk.cyan(' ← active') : '')
      );
    }
    return { handled: true, message: lines.join('\n') };
  }

  const setTargetMatch = trimmed.match(/^\/set-target\s+(\w+)\s+(\d+)$/i);
  if (setTargetMatch) {
    const agentName = setTargetMatch[1];
    const target = Math.min(100, Math.max(0, parseInt(setTargetMatch[2])));
    state.satisfactionOverrides[agentName] = target;
    return { handled: true, message: GREEN(`  ✅ @${agentName} satisfaction target → ${target}%`) };
  }

  const injectMatch = trimmed.match(/^\/inject\s+"(.+)"$/);
  if (injectMatch) {
    state.userInjections.push(injectMatch[1]);
    return { handled: true, message: GREEN(`  ✅ Director note queued: "${injectMatch[1].slice(0, 50)}"`) };
  }

  const skipMatch = trimmed.match(/^\/skip\s+(\S+)$/i);
  if (skipMatch) {
    const taskRef = skipMatch[1];
    const task = mission.tasks.find(t =>
      t.id === taskRef || t.id.endsWith(`_${taskRef}`) || t.id.includes(taskRef)
    );
    if (task) {
      task.status = 'skipped';
      return { handled: true, message: GRAY(`  ⏭️  Task skipped: ${task.instruction.slice(0, 50)}`) };
    }
    return { handled: true, message: RED(`  ❌ Task not found: ${taskRef}`) };
  }

  return { handled: false };
}

function getTaskStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return GREEN('✅');
    case 'running':   return CYAN('⏳');
    case 'pending':   return GRAY('⏸ ');
    case 'failed':    return RED('❌');
    case 'stagnated': return ORANGE('⚠️ ');
    case 'skipped':   return GRAY('⏭️ ');
    default:          return GRAY('○  ');
  }
}