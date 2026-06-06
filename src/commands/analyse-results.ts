import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { ensureProjectStructure } from '../core/project-map.js';
import { readFileContent } from '../core/context-builder.js';
import { proposeAndWriteFile } from '../core/file-writer.js';
import { markSuggestionById } from '../core/analysis-tracker.js';

const RED = chalk.hex('#EF5350');
const PURPLE = chalk.hex('#AB47BC');
const BLUE = chalk.hex('#42A5F5');
const TEAL = chalk.hex('#26A69A');
const AMBER = chalk.hex('#FFAB00');
const GRAY = chalk.gray;
const BORDER = chalk.hex('#455A64');

const PRIORITY_COLORS: Record<string, any> = {
  'critical': chalk.bgHex('#B71C1C').white,
  'high': chalk.hex('#FF6D00'),
  'medium': chalk.hex('#FFA726'),
  'low': chalk.hex('#66BB6A'),
};

const CATEGORY_COLORS: Record<string, any> = {
  'bugs': RED,
  'features': PURPLE,
  'improvements': BLUE,
  'upgrades': TEAL,
};

interface Suggestion {
  title: string;
  description: string;
  priority: string;
  implementation?: string;
  filePath: string;
  id?: string;
}

/**
 * Interactive results viewer with real-time search filtering.
 */
export async function showInteractiveResults(
  config: any,
  category: string,
  sort?: string,
  search?: string,
): Promise<void> {
  let allSuggestions: Suggestion[] = [];

  if (config.tier === 'platform' && config.provider !== 'local' && config.loggedIn && config.conversationId) {
    try {
      const result = await callCloudFunction('getCLIAnalysisResults', {
        conversationId: config.conversationId,
        category: category,
        sort: sort || 'priority',
        search: search || null,
      });
      allSuggestions = result?.suggestions || [];
    } catch (error: any) {
      console.log(chalk.red(`  ❌ ${error.message}`));
      return;
    }
  } else {
    allSuggestions = loadLocalSuggestions(category);
  }

  if (search) {
    const query = search.toLowerCase();
    allSuggestions = allSuggestions.filter(s =>
      (s.description || '').toLowerCase().includes(query) ||
      (s.title || '').toLowerCase().includes(query) ||
      (s.filePath || '').toLowerCase().includes(query)
    );
  }

  sortSuggestions(allSuggestions, sort || 'priority');

  if (allSuggestions.length === 0) {
    console.log('');
    console.log(chalk.green('  ✅ No items found. Clean!'));
    console.log('');
    return;
  }

  const color = CATEGORY_COLORS[category] || GRAY;

  let running = true;
  let displaySuggestions = [...allSuggestions];
  let currentSort = sort || 'priority';

  while (running) {
    console.log('');
    console.log(color(`  ◆ ${category.toUpperCase()} (${displaySuggestions.length} items) | Sort: ${currentSort}`));
    console.log(GRAY('  ────────────────────────────────────────────────────────'));
    console.log('');

    const choices: any[] = [];

    choices.push({
      name: chalk.cyan('  🔀 Toggle sort'),
      value: '__sort__',
      short: 'Sort',
    });
    choices.push(new inquirer.Separator(GRAY('  ──────────────────────────────────────')));

    for (let idx = 0; idx < displaySuggestions.length; idx++) {
      const item = displaySuggestions[idx];
      const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || GRAY;
      const priorityLabel = (item.priority || 'MEDIUM').toUpperCase().padEnd(9);
      const filePath = (item.filePath || 'unknown').split('/').pop() || 'unknown';
      const desc = (item.description || item.title || 'No description').slice(0, 42);
      const displayName = `${pColor(priorityLabel)} ${chalk.cyan(filePath.padEnd(18))} ${chalk.white(desc)}`;

      choices.push({
        name: displayName,
        value: idx,
        short: item.title || item.description?.slice(0, 30) || 'Item',
        description: `${item.priority} ${item.filePath} ${item.title} ${item.description}`,
      });
    }

    choices.push(new inquirer.Separator(GRAY('  ──────────────────────────────────────')));
    choices.push({
      name: chalk.gray('  ← Quit'),
      value: '__quit__',
      short: 'Quit',
    });

    const { selected } = await inquirer.prompt([
      {
        type: 'search',
        name: 'selected',
        message: color(`Search ${category} (type to filter):`),
        source: (input: string | undefined) => {
          if (!input) return choices;
          const query = input.toLowerCase();
          const filtered = choices.filter((c: any) => {
            if (c.type === 'separator') return true;
            if (c.value === '__sort__' || c.value === '__quit__') return true;
            const searchable = c.description?.toLowerCase() || '';
            return searchable.includes(query);
          });
          return filtered;
        },
        pageSize: 12,
      },
    ]);

    if (selected === '__quit__') {
      running = false;
      break;
    }

    if (selected === '__sort__') {
      currentSort = currentSort === 'priority' ? 'file' : 'priority';
      sortSuggestions(displaySuggestions, currentSort);
      console.log(chalk.cyan(`  Sort changed to: ${currentSort}`));
      continue;
    }

    if (typeof selected === 'number') {
      const item = displaySuggestions[selected];
      const action = await showExpandedView(item, category);

      if (action === 'implement') {
        await handleImplement(item, config, category);
        // Remove from display after implementation
        displaySuggestions.splice(selected, 1);
        const originalIdx = allSuggestions.findIndex(s => s.id === item.id);
        if (originalIdx !== -1) allSuggestions.splice(originalIdx, 1);
      } else if (action === 'dismiss') {
        if (item.id) {
          markSuggestionById(item.id, category, 'dismissed', {
            reason: 'User dismissed from CLI',
            implementedBy: 'user',
          });
        }
        displaySuggestions.splice(selected, 1);
        const originalIdx = allSuggestions.findIndex(s => s.id === item.id);
        if (originalIdx !== -1) allSuggestions.splice(originalIdx, 1);
        console.log(chalk.gray('  ⏭️  Dismissed and logged.'));
      }
    }
  }
}

async function showExpandedView(item: Suggestion, category: string): Promise<'implement' | 'dismiss' | 'back'> {
  const color = CATEGORY_COLORS[category] || GRAY;
  const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || GRAY;

  console.log('');
  console.log(color('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(color('  ║ ') + pColor(`${(item.priority || 'MEDIUM').toUpperCase()} ${category.toUpperCase().slice(0, -1)}`));
  console.log(color('  ╠══════════════════════════════════════════════════════════╣'));
  console.log(color('  ║') + chalk.gray('  File: ') + chalk.cyan(item.filePath || 'unknown'));
  console.log(color('  ║') + chalk.gray('  Priority: ') + pColor((item.priority || 'medium').toUpperCase()));
  console.log(color('  ║'));
  console.log(color('  ║') + chalk.gray('  Title:'));
  console.log(color('  ║') + chalk.white.bold(`  ${item.title || 'No title'}`));
  console.log(color('  ║'));
  console.log(color('  ║') + chalk.gray('  Description:'));

  const descLines = wrapText(item.description || 'No description', 54);
  for (const line of descLines) {
    console.log(color('  ║') + chalk.white(`  ${line}`));
  }

  if (item.implementation) {
    console.log(color('  ║'));
    console.log(color('  ║') + chalk.gray('  Implementation:'));
    const implLines = wrapText(item.implementation, 54);
    for (const line of implLines) {
      console.log(color('  ║') + chalk.white(`  ${line}`));
    }
  }

  console.log(color('  ╚══════════════════════════════════════════════════════════╝'));
  console.log('');

  const { action } = await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: 'What do you want to do?',
      choices: [
        { name: chalk.green('  🔧 Implement this fix'), value: 'implement' },
        { name: chalk.red('  🗑️  Dismiss'), value: 'dismiss' },
        { name: chalk.gray('  ← Back to list'), value: 'back' },
      ],
    },
  ]);

  return action;
}

async function handleImplement(item: Suggestion, config: any, category: string): Promise<void> {
  console.log('');
  console.log(chalk.cyan('  🔧 Implementing fix...'));
  console.log('');

  if (config.provider === 'local' && config.localEndpoint) {
    const fileContent = readFileContent(item.filePath);

    if (!fileContent) {
      console.log(chalk.red(`  ❌ Could not read file: ${item.filePath}`));
      return;
    }

    const prompt = `You are MiniBob — a junior engineer making SURGICAL code fixes under strict supervision.

CURRENT FILE: ${item.filePath}
${fileContent}

CHANGE TO IMPLEMENT:
Title: ${item.title}
Description: ${item.description}
Implementation Instructions: ${item.implementation || 'Apply the fix described above.'}

RULES (CRITICAL — VIOLATION = REJECTED):
- Return ONLY valid source code. No markdown, no code fences, no \`\`\`, no explanation text.
- Start the FIRST line with: // File: ${item.filePath}
- PRESERVE ALL existing imports exactly as they are. Do NOT add, remove, or reorder imports.
- PRESERVE ALL existing exports exactly as they are. Do NOT rename exported functions or classes.
- PRESERVE the existing code structure, indentation, patterns, and naming conventions.
- Make the MINIMUM change necessary to implement the fix. Touch NOTHING else.
- Do NOT refactor, reorganize, or "improve" unrelated code.
- Do NOT add comments explaining what you changed.
- Do NOT wrap the response in markdown code blocks.
- The output must be valid TypeScript/JavaScript that compiles without errors.
- If you are unsure about a change, return the file UNCHANGED rather than risk breaking it.

Return the complete file content now:`;

    try {
      const messages: LocalChatMessage[] = [
        { role: 'system', content: 'You are MiniBob, a junior engineer making SURGICAL fixes. Return ONLY valid source code. NO markdown. NO code fences. NO explanation. Start with // File: comment. Make the ABSOLUTE MINIMUM change needed. Do NOT restructure, refactor, or touch ANYTHING beyond the specific fix. If unsure, return the file unchanged.' },
        { role: 'user', content: prompt },
      ];

      const response = await callLocalModel(config.localEndpoint, messages);

      const lines = response.split('\n');
      const firstLine = lines[0].trim();
      let newContent: string;

      if (firstLine.match(/^\/\/\s*(File:)?\s*/)) {
        newContent = lines.slice(1).join('\n').trim();
      } else {
        newContent = response.trim();
      }

      // ─── VALIDATION ───
      if (newContent.includes('```') || newContent.includes('## ') || newContent.startsWith('Here') || newContent.startsWith('I have') || newContent.startsWith('Sure')) {
        console.log(chalk.yellow('  ⚠️  MiniBob returned explanation instead of code. Fix rejected.'));
        return;
      }

      if (newContent.length < fileContent.length * 0.5) {
        console.log(chalk.yellow(`  ⚠️  MiniBob's output is ${Math.round((newContent.length / fileContent.length) * 100)}% of original size. Rejecting.`));
        return;
      }

      const originalExports = fileContent.match(/export\s+(function|class|const|interface|type|async\s+function)\s+\w+/g) || [];
      for (const exp of originalExports) {
        const exportName = exp.split(/\s+/).pop()!;
        if (!newContent.includes(exportName)) {
          console.log(chalk.yellow(`  ⚠️  MiniBob removed export "${exportName}". Rejecting.`));
          return;
        }
      }

      await proposeAndWriteFile({
        filePath: item.filePath,
        content: newContent,
        isNew: false,
      });

      // Mark as implemented
      if (item.id) {
        markSuggestionById(item.id, category, 'implemented', {
          reason: 'User approved implementation from CLI',
          implementedBy: 'minibob',
        });
      }

    } catch (error: any) {
      console.log(chalk.red(`  ❌ Implementation failed: ${error.message}`));
    }

  } else if (config.loggedIn && config.conversationId) {
    try {
      const result = await callCloudFunction('implementSuggestion', {
        conversationId: config.conversationId,
        filePath: item.filePath,
        suggestionId: item.id || 'unknown',
        category: category,
        jobId: `cli_impl_${Date.now()}`,
      });

      if (result?.success) {
        console.log(chalk.green(`  ✅ ${result.message}`));
        if (item.id) {
          markSuggestionById(item.id, category, 'implemented', {
            reason: 'Platform implementation',
            implementedBy: 'platform',
          });
        }
      } else {
        console.log(chalk.red('  ❌ Implementation failed on platform.'));
      }
    } catch (error: any) {
      console.log(chalk.red(`  ❌ ${error.message}`));
    }
  } else {
    console.log(chalk.red('  ❌ No provider configured for implementation.'));
  }

  console.log('');
}

function sortSuggestions(suggestions: Suggestion[], method: string): void {
  if (method === 'file') {
    suggestions.sort((a, b) => (a.filePath || '').localeCompare(b.filePath || ''));
  } else {
    const priorityMap: Record<string, number> = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
    suggestions.sort((a, b) => {
      const pA = priorityMap[a.priority?.toLowerCase()] ?? 99;
      const pB = priorityMap[b.priority?.toLowerCase()] ?? 99;
      return pA - pB;
    });
  }
}

export function loadLocalSuggestions(category: string): Suggestion[] {
  const cwd = process.cwd();
  const projectName = path.basename(cwd);
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const analysisPath = path.join(homeDir, '.bob', 'projects', projectName, 'analysis', 'results', 'analysis.json');

  if (!fs.existsSync(analysisPath)) return [];

  const allResults = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  const suggestions: Suggestion[] = [];

  for (const [filePath, fileResults] of Object.entries(allResults)) {
    const items = (fileResults as any)[category] || [];
    items.forEach((item: any, idx: number) => {
      // Only include pending items
      if (!item.status || item.status === 'pending') {
        suggestions.push({
          ...item,
          filePath,
          id: `${filePath.replace(/[\/\\]/g, '_')}_${idx}`,
        });
      }
    });
  }

  return suggestions;
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}