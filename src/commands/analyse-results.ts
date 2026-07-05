// File: src/commands/analyse-results.ts

import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { callCloudFunction } from '../core/api-client.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { ensureProjectStructure, getActiveConversationId } from '../core/project-map.js';
import { readFileContent } from '../core/context-builder.js';
import { proposeAndWriteFile } from '../core/file-writer.js';
import { markSuggestionById } from '../core/analysis-tracker.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY    = chalk.hex('#E66F24');
const BRAND_SECONDARY  = chalk.hex('#FFAB00');
const SUCCESS          = chalk.hex('#66BB6A');
const INFO             = chalk.hex('#26C6DA');
const WARNING          = chalk.hex('#FFC107');
const ERROR            = chalk.hex('#EF5350');
const MUTED            = chalk.hex('#78909C');
const BORDER           = chalk.hex('#455A64');
const MODE_CONSULTANT  = chalk.hex('#AB47BC');

// ─── LAYOUT HELPERS ───
const BOX_WIDTH = 62;

function pad(text: string): string {
  const visible = text.replace(/\x1B\[[0-9;]*m/g, '');
  const padding = BOX_WIDTH - visible.length - 2;
  return text + ' '.repeat(Math.max(0, padding));
}

function topRule(): string {
  return BORDER('  ╔' + '═'.repeat(BOX_WIDTH) + '╗');
}

function botRule(): string {
  return BORDER('  ╚' + '═'.repeat(BOX_WIDTH) + '╝');
}

function hRule(): string {
  return BORDER('  ╠' + '═'.repeat(BOX_WIDTH) + '╣');
}

function row(content: string): string {
  return BORDER('  ║ ') + pad(content) + BORDER(' ║');
}

function emptyRow(): string {
  return BORDER('  ║') + ' '.repeat(BOX_WIDTH) + BORDER('║');
}

// ─── CATEGORY / PRIORITY MAPS ───
const PRIORITY_COLORS: Record<string, any> = {
  'critical': chalk.bgHex('#B71C1C').white,
  'high':     chalk.hex('#FF6D00'),
  'medium':   chalk.hex('#FFA726'),
  'low':      chalk.hex('#66BB6A'),
};

const CATEGORY_COLORS: Record<string, any> = {
  'bugs':         ERROR,
  'features':     MODE_CONSULTANT,
  'improvements': INFO,
  'upgrades':     SUCCESS,
};

const CATEGORY_ICONS: Record<string, string> = {
  'bugs':         '🔴',
  'features':     '🟣',
  'improvements': '🔵',
  'upgrades':     '🟢',
};

interface Suggestion {
  title: string;
  description: string;
  priority: string;
  implementation?: string;
  filePath: string;
  id?: string;
}

// ─── MAIN ENTRY ───────────────────────────────────────────────────────────────

export async function showInteractiveResults(
  config: any,
  category: string,
  sort?: string,
  search?: string,
): Promise<void> {
  const conversationId = getActiveConversationId(process.cwd()) || config.conversationId;

  let allSuggestions: Suggestion[] = [];

  if (config.tier === 'platform' && config.provider !== 'local' && config.loggedIn && conversationId) {
    try {
      const result = await callCloudFunction('getCLIAnalysisResults', {
        conversationId,
        category,
        sort:   sort   || 'priority',
        search: search || null,
      });
      allSuggestions = result?.suggestions || [];
    } catch (error: any) {
      console.log('');
      console.log(ERROR(`  ❌ ${error.message}`));
      console.log('');
      return;
    }
  } else {
    allSuggestions = loadLocalSuggestions(category);
  }

  if (search) {
    const query = search.toLowerCase();
    allSuggestions = allSuggestions.filter(s =>
      (s.description || '').toLowerCase().includes(query) ||
      (s.title       || '').toLowerCase().includes(query) ||
      (s.filePath    || '').toLowerCase().includes(query)
    );
  }

  sortSuggestions(allSuggestions, sort || 'priority');

  // ─── Empty state ───
  if (allSuggestions.length === 0) {
    console.log('');
    console.log(topRule());
    console.log(row(SUCCESS('◉  ALL CLEAR')));
    console.log(hRule());
    console.log(emptyRow());
    console.log(row(SUCCESS('✅  No items found in this category.')));
    console.log(row(MUTED('Your codebase is clean here. Nice work.')));
    console.log(emptyRow());
    console.log(botRule());
    console.log('');
    return;
  }

  const color = CATEGORY_COLORS[category] || MUTED;
  const icon  = CATEGORY_ICONS[category]  || '◆';

  let running          = true;
  let displaySuggestions = [...allSuggestions];
  let currentSort      = sort || 'priority';

  while (running) {

    // ─── List header card ───
    console.log('');
    console.log(topRule());
    console.log(row(
      color(`${icon}  ${category.toUpperCase()}`) +
      MUTED(`  ·  ${displaySuggestions.length} items`) +
      MUTED(`  ·  Sort: ${currentSort}`)
    ));
    console.log(botRule());
    console.log('');

    // ─── Build choices ───
    const PRIORITY_WIDTH = 10;
    const FILE_WIDTH     = 22;
    const TITLE_WIDTH    = 38;

    const choices: any[] = [];

    choices.push({
      name:  INFO('  🔀  Toggle sort order'),
      value: '__sort__',
      short: 'Sort',
    });

    choices.push(new inquirer.Separator(MUTED('  ' + '─'.repeat(BOX_WIDTH - 2))));

    for (let idx = 0; idx < displaySuggestions.length; idx++) {
      const item     = displaySuggestions[idx];
      const pColor   = PRIORITY_COLORS[item.priority?.toLowerCase()] || MUTED;
      const fileName = (item.filePath || 'unknown').split('/').pop() || 'unknown';
      const title    = (item.title || item.description || 'No description').slice(0, TITLE_WIDTH);

      const priorityStr = pColor((item.priority || 'MEDIUM').toUpperCase().padEnd(PRIORITY_WIDTH));
      const fileStr     = INFO(fileName.padEnd(FILE_WIDTH));
      const titleStr    = chalk.white(title + (title.length >= TITLE_WIDTH ? '...' : ''));

      choices.push({
        name:        `  ${priorityStr}  ${fileStr}  ${titleStr}`,
        value:       idx,
        short:       item.title || item.description?.slice(0, 30) || 'Item',
        description: `${item.priority} ${item.filePath} ${item.title} ${item.description}`,
      });
    }

    choices.push(new inquirer.Separator(MUTED('  ' + '─'.repeat(BOX_WIDTH - 2))));
    choices.push({
      name:  MUTED('  ↩  Back'),
      value: '__quit__',
      short: 'Back',
    });

    // ─── Search prompt ───
    const { selected } = await inquirer.prompt([
      {
        type:    'search',
        name:    'selected',
        message: color(`  Search ${category} (type to filter):`),
        source:  (input: string | undefined) => {
          if (!input) return choices;
          const query    = input.toLowerCase();
          const filtered = choices.filter((c: any) => {
            if (c.type === 'separator')                          return true;
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
      console.log('');
      console.log(INFO(`  ▸ Sort changed to: ${currentSort}`));
      console.log('');
      continue;
    }

    if (typeof selected === 'number') {
      const item   = displaySuggestions[selected];
      const action = await showExpandedView(item, category);

      if (action === 'implement') {
        await handleImplement(item, config, category, conversationId);
        displaySuggestions.splice(selected, 1);
        const originalIdx = allSuggestions.findIndex(s => s.id === item.id);
        if (originalIdx !== -1) allSuggestions.splice(originalIdx, 1);

      } else if (action === 'dismiss') {
        if (item.id) {
          markSuggestionById(item.id, category, 'dismissed', {
            reason:          'User dismissed from CLI',
            implementedBy:   'user',
          });
        }
        displaySuggestions.splice(selected, 1);
        const originalIdx = allSuggestions.findIndex(s => s.id === item.id);
        if (originalIdx !== -1) allSuggestions.splice(originalIdx, 1);

        console.log('');
        console.log(MUTED('  ▸ Dismissed and logged.'));
        console.log('');
      }
    }
  }
}

// ─── EXPANDED VIEW ────────────────────────────────────────────────────────────

async function showExpandedView(
  item: Suggestion,
  category: string,
): Promise<'implement' | 'dismiss' | 'back'> {
  const color  = CATEGORY_COLORS[category] || MUTED;
  const pColor = PRIORITY_COLORS[item.priority?.toLowerCase()] || MUTED;
  const icon   = CATEGORY_ICONS[category] || '◆';

  console.log('');
  console.log(topRule());
  console.log(row(
    `${icon}  ` +
    pColor(`${(item.priority || 'MEDIUM').toUpperCase()}`) +
    MUTED('  ·  ') +
    color(category.toUpperCase().slice(0, -1))
  ));
  console.log(hRule());

  // ─── Metadata ───
  console.log(row(MUTED('▸ File:     ') + INFO(item.filePath || 'unknown')));
  console.log(row(MUTED('▸ Priority: ') + pColor((item.priority || 'medium').toUpperCase())));
  console.log(emptyRow());

  // ─── Title ───
  console.log(row(MUTED('▸ Title')));
  const titleLines = wrapText(item.title || 'No title', BOX_WIDTH - 6);
  for (const line of titleLines) {
    console.log(row(chalk.white.bold(`  ${line}`)));
  }

  console.log(emptyRow());

  // ─── Description ───
  console.log(row(MUTED('▸ Description')));
  const descLines = wrapText(item.description || 'No description', BOX_WIDTH - 6);
  for (const line of descLines) {
    console.log(row(chalk.white(`  ${line}`)));
  }

  // ─── Implementation ───
  if (item.implementation) {
    console.log(hRule());
    console.log(row(BRAND_SECONDARY('▸ Implementation')));
    const implLines = wrapText(item.implementation, BOX_WIDTH - 6);
    for (const line of implLines) {
      console.log(row(chalk.white(`  ${line}`)));
    }
  }

  console.log(emptyRow());
  console.log(botRule());
  console.log('');

  const { action } = await inquirer.prompt([
    {
      type:    'select',
      name:    'action',
      message: BRAND_SECONDARY('  What would you like to do?'),
      choices: [
        { name: SUCCESS('  🔧  Implement this fix'), value: 'implement', short: 'Implement' },
        { name: ERROR('  🗑️   Dismiss'),             value: 'dismiss',   short: 'Dismiss'   },
        { name: MUTED('  ↩   Back to list'),         value: 'back',      short: 'Back'      },
      ],
    },
  ]);

  return action;
}

// ─── IMPLEMENT HANDLER ────────────────────────────────────────────────────────

async function handleImplement(
  item: Suggestion,
  config: any,
  category: string,
  conversationId: string | null,
): Promise<void> {
  console.log('');
  console.log(topRule());
  console.log(row(INFO('◈  IMPLEMENTING FIX')));
  console.log(row(MUTED(`▸ ${item.filePath}`)));
  console.log(botRule());
  console.log('');

  if (config.provider === 'local' && config.localEndpoint) {
    const fileContent = readFileContent(item.filePath);

    if (!fileContent) {
      console.log('');
      console.log(topRule());
      console.log(row(ERROR('◈  IMPLEMENTATION FAILED')));
      console.log(row(MUTED(`▸ Could not read: ${item.filePath}`)));
      console.log(botRule());
      console.log('');
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
- PRESERVE ALL existing imports exactly as they are.
- PRESERVE ALL existing exports exactly as they are.
- PRESERVE the existing code structure, indentation, patterns, and naming conventions.
- Make the MINIMUM change necessary to implement the fix. Touch NOTHING else.
- Do NOT refactor, reorganize, or "improve" unrelated code.
- Do NOT add comments explaining what you changed.
- Do NOT wrap the response in markdown code blocks.
- If you are unsure about a change, return the file UNCHANGED rather than risk breaking it.

Return the complete file content now:`;

    try {
      const messages: LocalChatMessage[] = [
        {
          role:    'system',
          content: 'You are MiniBob, a junior engineer making SURGICAL fixes. Return ONLY valid source code. NO markdown. NO code fences. NO explanation. Start with // File: comment. Make the ABSOLUTE MINIMUM change needed. If unsure, return the file unchanged.',
        },
        { role: 'user', content: prompt },
      ];

      const localResult = await callLocalModel(config.localEndpoint, messages);
      const response    = typeof localResult === 'object' && localResult.text
        ? localResult.text
        : localResult as unknown as string;

      const lines     = response.split('\n');
      const firstLine = lines[0].trim();
      let newContent: string;

      if (firstLine.match(/^\/\/\s*(File:)?\s*/)) {
        newContent = lines.slice(1).join('\n').trim();
      } else {
        newContent = response.trim();
      }

      // ─── Validation guards ───
      if (
        newContent.includes('```') ||
        newContent.includes('## ')  ||
        newContent.startsWith('Here')  ||
        newContent.startsWith('I have') ||
        newContent.startsWith('Sure')
      ) {
        console.log('');
        console.log(topRule());
        console.log(row(WARNING('◈  FIX REJECTED')));
        console.log(row(MUTED('▸ MiniBob returned explanation instead of code.')));
        console.log(botRule());
        console.log('');
        return;
      }

      if (newContent.length < fileContent.length * 0.5) {
        console.log('');
        console.log(topRule());
        console.log(row(WARNING('◈  FIX REJECTED')));
        console.log(row(MUTED(`▸ Output is ${Math.round((newContent.length / fileContent.length) * 100)}% of original size.`)));
        console.log(row(MUTED('▸ Possible data loss detected. Rejecting.')));
        console.log(botRule());
        console.log('');
        return;
      }

      const originalExports = fileContent.match(
        /export\s+(function|class|const|interface|type|async\s+function)\s+\w+/g
      ) || [];

      for (const exp of originalExports) {
        const exportName = exp.split(/\s+/).pop()!;
        if (!newContent.includes(exportName)) {
          console.log('');
          console.log(topRule());
          console.log(row(WARNING('◈  FIX REJECTED')));
          console.log(row(MUTED(`▸ MiniBob removed export "${exportName}".`)));
          console.log(botRule());
          console.log('');
          return;
        }
      }

      await proposeAndWriteFile({
        filePath: item.filePath,
        content:  newContent,
        isNew:    false,
        isLocal:  true,
      });

      if (item.id) {
        markSuggestionById(item.id, category, 'implemented', {
          reason:        'User approved implementation from CLI',
          implementedBy: 'minibob',
        });
      }

      // ─── Success card ───
      console.log('');
      console.log(topRule());
      console.log(row(SUCCESS('◈  IMPLEMENTATION COMPLETE')));
      console.log(hRule());
      console.log(row(MUTED('▸ File:    ') + INFO(item.filePath)));
      console.log(row(MUTED('▸ By:      ') + MUTED('MiniBob (local)')));
      console.log(row(MUTED('▸ Backup:  ') + MUTED('Saved to .bob-backups/')));
      console.log(emptyRow());
      console.log(botRule());
      console.log('');

    } catch (error: any) {
      console.log('');
      console.log(topRule());
      console.log(row(ERROR('◈  IMPLEMENTATION FAILED')));
      console.log(row(MUTED(`▸ ${error.message}`)));
      console.log(botRule());
      console.log('');
    }

  } else if (config.loggedIn && conversationId) {
    try {
      const result = await callCloudFunction('implementSuggestion', {
        conversationId,
        filePath:     item.filePath,
        suggestionId: item.id || 'unknown',
        category,
        jobId:        `cli_impl_${Date.now()}`,
      });

      if (result?.success) {
        if (item.id) {
          markSuggestionById(item.id, category, 'implemented', {
            reason:        'Platform implementation',
            implementedBy: 'platform',
          });
        }

        console.log('');
        console.log(topRule());
        console.log(row(SUCCESS('◈  IMPLEMENTATION COMPLETE')));
        console.log(hRule());
        console.log(row(MUTED('▸ File:    ') + INFO(item.filePath)));
        console.log(row(MUTED('▸ By:      ') + MUTED('Platform (cloud)')));
        console.log(row(MUTED('▸ Message: ') + MUTED(result.message || 'Done.')));
        console.log(emptyRow());
        console.log(botRule());
        console.log('');

      } else {
        console.log('');
        console.log(topRule());
        console.log(row(ERROR('◈  IMPLEMENTATION FAILED')));
        console.log(row(MUTED('▸ Platform returned failure response.')));
        console.log(botRule());
        console.log('');
      }
    } catch (error: any) {
      console.log('');
      console.log(topRule());
      console.log(row(ERROR('◈  IMPLEMENTATION FAILED')));
      console.log(row(MUTED(`▸ ${error.message}`)));
      console.log(botRule());
      console.log('');
    }

  } else {
    console.log('');
    console.log(topRule());
    console.log(row(ERROR('◈  NO PROVIDER CONFIGURED')));
    console.log(row(MUTED('▸ Set a local endpoint or log in to use this feature.')));
    console.log(botRule());
    console.log('');
  }
}

// ─── SORT ─────────────────────────────────────────────────────────────────────

function sortSuggestions(suggestions: Suggestion[], method: string): void {
  if (method === 'file') {
    suggestions.sort((a, b) => (a.filePath || '').localeCompare(b.filePath || ''));
  } else {
    const priorityMap: Record<string, number> = {
      'critical': 0, 'high': 1, 'medium': 2, 'low': 3,
    };
    suggestions.sort((a, b) => {
      const pA = priorityMap[a.priority?.toLowerCase()] ?? 99;
      const pB = priorityMap[b.priority?.toLowerCase()] ?? 99;
      return pA - pB;
    });
  }
}

// ─── LOAD LOCAL ───────────────────────────────────────────────────────────────

export function loadLocalSuggestions(category: string): Suggestion[] {
  const cwd         = process.cwd();
  const projectName = path.basename(cwd);
  const homeDir     = process.env.HOME || process.env.USERPROFILE || '';
  const analysisPath = path.join(
    homeDir, '.bob', 'projects', projectName,
    'analysis', 'results', 'analysis.json'
  );

  if (!fs.existsSync(analysisPath)) return [];

  const allResults = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  const suggestions: Suggestion[] = [];

  for (const [filePath, fileResults] of Object.entries(allResults)) {
    const items = (fileResults as any)[category] || [];
    items.forEach((item: any, idx: number) => {
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

// ─── WRAP TEXT ────────────────────────────────────────────────────────────────

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