import { AgentTask, AgentMission, saveMission } from './agent-queue.js';
import { LocalChatMessage } from '../ai/providers/local.js';
import { callLocalModel } from '../ai/providers/local.js';

// ─── SATISFACTION RESULT ──────────────────────────────────────────

export interface SatisfactionResult {
  score: number;
  reasoning: string;
  isDone: boolean;
  isStagnating: boolean;
  needsDirector: boolean;
  needsUser: boolean;
}

// ─── SATISFACTION SCORER ──────────────────────────────────────────

export async function evaluateSatisfaction(
  task: AgentTask,
  agentOutput: string,
  localEndpoint: string
): Promise<SatisfactionResult> {

  const prompt = `You are @${task.assignedTo} evaluating your own work output against the assigned task.

ASSIGNED TASK:
${task.instruction}

YOUR OUTPUT:
${agentOutput}

Evaluate how satisfied you are with this output relative to completing the task.
Satisfaction means the task is DONE — not that the work is high quality in general.

Score from 0 to 100 where:
- 90-100: Task is fully complete. Nothing left to do.
- 75-89: Task is mostly complete. Minor gaps remain.
- 50-74: Task is partially complete. Significant work remains.
- 25-49: Task has barely started. Most work still needed.
- 0-24: Task has not been meaningfully addressed.

Respond with ONLY this JSON format on a single line:
{"score": <0-100>, "reasoning": "<one sentence explaining the score>"}`;

  try {
    const messages: LocalChatMessage[] = [
      {
        role: 'system',
        content: 'You are evaluating task completion. Respond with ONLY valid JSON on a single line. No markdown.',
      },
      { role: 'user', content: prompt },
    ];

    const rawResponse = await callLocalModel(localEndpoint, messages);
    const responseText =
      typeof rawResponse === 'object' && rawResponse.text
        ? rawResponse.text
        : (rawResponse as unknown as string);

    const jsonMatch = responseText.match(/\{[^}]*"score"[^}]*\}/);
    if (!jsonMatch) {
      return buildResult(task, 30, 'Could not evaluate output — defaulting to low satisfaction.');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.min(100, Math.max(0, parseInt(parsed.score) || 0));
    const reasoning = parsed.reasoning || 'No reasoning provided.';

    return buildResult(task, score, reasoning);

  } catch {
    return buildResult(task, 30, 'Evaluation failed — defaulting to low satisfaction.');
  }
}

function buildResult(
  task: AgentTask,
  score: number,
  reasoning: string
): SatisfactionResult {
  const isDone = score >= task.satisfactionTarget;
  const newConsecutiveLow = isDone ? 0 : task.consecutiveLowCount + 1;
  const isStagnating = !isDone && newConsecutiveLow >= task.stagnationLimit;

  // ─── KEY FIX: Faster escalation after director already intervened ─
  // If director has already intervened AND agent is stagnating again
  // immediately flag needsUser — don't make user wait another full cycle.
  const newDirectorCount = isStagnating
    ? task.directorSurfaceCount + 1
    : task.directorSurfaceCount;

  const alreadyHadDirectorHelp = task.directorSurfaceCount > 0;
  const needsDirector = isStagnating &&
    !alreadyHadDirectorHelp &&
    newDirectorCount <= task.directorLimit;

  // If director already helped and agent still stagnating → straight to user
  const needsUser = isStagnating &&
    (alreadyHadDirectorHelp || newDirectorCount > task.directorLimit);

  return {
    score,
    reasoning,
    isDone,
    isStagnating,
    needsDirector,
    needsUser,
  };
}

// ─── APPLY SATISFACTION RESULT ────────────────────────────────────

export function applySatisfactionResult(
  mission: AgentMission,
  taskId: string,
  result: SatisfactionResult,
  workingDir?: string
): AgentMission {
  const task = mission.tasks.find(t => t.id === taskId);
  if (!task) return mission;

  task.lastSatisfactionScore = result.score;
  task.attemptCount += 1;

  if (result.isDone) {
    task.consecutiveLowCount = 0;
  } else {
    task.consecutiveLowCount += 1;
  }

  if (result.isStagnating) {
    task.stagnationCount += 1;
    task.directorSurfaceCount += 1;
    task.consecutiveLowCount = 0;
  }

  task.notes.push(
    `[Attempt ${task.attemptCount}] SAT: ${result.score}% — ${result.reasoning}`
  );

  saveMission(mission, workingDir);
  return mission;
}

// ─── SATISFACTION TARGET INFERENCE ───────────────────────────────

export function inferSatisfactionTarget(instruction: string): number {
  const lower = instruction.toLowerCase();

  if (
    lower.includes('review') ||
    lower.includes('approve') ||
    lower.includes('verify') ||
    lower.includes('validate')
  ) return 75;

  if (
    lower.includes('design') ||
    lower.includes('architect') ||
    lower.includes('interface') ||
    lower.includes('contract') ||
    lower.includes('plan')
  ) return 82;

  if (
    lower.includes('implement') ||
    lower.includes('build') ||
    lower.includes('create') ||
    lower.includes('write') ||
    lower.includes('develop')
  ) return 75;

  if (
    lower.includes('test') ||
    lower.includes('analyse') ||
    lower.includes('analyze') ||
    lower.includes('check')
  ) return 78;

  return 75;
}

export function inferStagnationLimit(instruction: string): number {
  const lower = instruction.toLowerCase();

  if (
    lower.includes('design') ||
    lower.includes('architect') ||
    lower.includes('complex') ||
    lower.includes('system')
  ) return 4;

  return 3;
}

// ─── DISPLAY HELPERS ──────────────────────────────────────────────

export function getSatisfactionColor(score: number, target: number): string {
  if (score >= target) return '#66BB6A';
  const pct = score / target;
  if (pct >= 0.8) return '#FFAB00';
  if (pct >= 0.5) return '#FF7043';
  return '#EF5350';
}

export function getSatisfactionBar(
  score: number,
  target: number,
  width: number = 20
): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}