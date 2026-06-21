// File: src/commands/conversations.ts

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { getConfig, setConfigValue } from '../core/config-store.js';
import { callCloudFunction } from '../core/api-client.js';
import { setActiveConversationId } from '../core/project-map.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');
const BORDER = chalk.hex('#455A64');
const MODE_CONSULTANT = chalk.hex('#AB47BC');
const MODE_DEEPDIVE = chalk.hex('#0097A7');
const MODE_PERSONALIZATION = chalk.hex('#CE93D8');

// ─── ACTIVE CONVERSATION HIGHLIGHT ───
const ACTIVE_BG = chalk.bgHex('#1A2E1A');
const ACTIVE_INDICATOR = SUCCESS('▶');

// ─── MODE ICONS ───
function getModeIcon(convo: any): string {
  if (convo.mode === 'consultant') return MODE_CONSULTANT('◆');
  if (convo.mode === 'personalized') return MODE_PERSONALIZATION('◆');
  if (convo.mode === 'deepdive') return MODE_DEEPDIVE('◆');
  return INFO('◆');
}

// ─── SOURCE ICONS ───
function getSourceIcon(source: string): string {
  return source === 'cli' ? MUTED('⌨') : MUTED('🌐');
}

export function registerConversationsCommand(program: Command): void {
  const convosCmd = program
    .command('conversations')
    .description('List, search, and join existing conversations')
    .option('-p, --page <number>', 'Page number', '1')
    .option('-s, --search <query>', 'Search conversations by title or content')
    .action(async (options: { page?: string; search?: string }) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(ERROR('  ❌ Not logged in.'));
        console.log(MUTED('  Run `bob login` first.'));
        console.log('');
        return;
      }

      const spinner = ora({
        text: INFO('  Loading conversations...'),
        spinner: 'dots',
      }).start();

      try {
        const result = await callCloudFunction('listCLIConversations', {
          page: parseInt(options.page || '1'),
          limit: 20,
          search: options.search || null,
        });

        spinner.stop();

        const conversations = result.conversations || [];

        if (conversations.length === 0) {
          console.log('');
          console.log(WARNING('  ⚠️  No conversations found.'));
          if (options.search) {
            console.log(MUTED(`  Search: "${options.search}"`));
          }
          console.log('');
          return;
        }

        renderConversationList(conversations, config.conversationId, options.search, result);

      } catch (error: any) {
        spinner.stop();
        console.log('');
        console.log(ERROR(`  ❌ ${error.message}`));
        console.log('');
      }
    });

  // bob conversations join
  convosCmd
    .command('join')
    .description('Pick a conversation to continue')
    .option('-s, --search <query>', 'Search first')
    .action(async (options: { search?: string }) => {
      const config = getConfig();

      if (!config.loggedIn || !config.authToken) {
        console.log('');
        console.log(ERROR('  ❌ Not logged in.'));
        console.log(MUTED('  Run `bob login` first.'));
        console.log('');
        return;
      }

      const spinner = ora({
        text: INFO('  Loading conversations...'),
        spinner: 'dots',
      }).start();

      try {
        const result = await callCloudFunction('listCLIConversations', {
          page: 1,
          limit: 15,
          search: options.search || null,
        });

        spinner.stop();

        const conversations = result.conversations || [];

        if (conversations.length === 0) {
          console.log('');
          console.log(WARNING('  ⚠️  No conversations found.'));
          console.log('');
          return;
        }

        renderConversationList(conversations, config.conversationId, options.search, result, true);

        // ─── SELECTION PROMPT ───
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve => {
          rl.question(INFO('  Select (1-' + conversations.length + ') or 0 to cancel: '), resolve);
        });
        rl.close();

        const selection = parseInt(answer.trim());

        if (isNaN(selection) || selection === 0) {
          console.log(MUTED('  Cancelled.'));
          console.log('');
          return;
        }

        if (selection < 1 || selection > conversations.length) {
          console.log(ERROR('  ❌ Invalid selection.'));
          console.log('');
          return;
        }

        const selected = conversations[selection - 1];

        // ─── Write to both project scope AND global config ───────
        setActiveConversationId(selected.id, process.cwd());
        setConfigValue('conversationId', selected.id);

        console.log('');
        console.log(SUCCESS(`  ✅ Joined: "${selected.title}"`));
        console.log(MUTED(`  Session ID: ${selected.id}`));
        console.log(MUTED('  Your next `bob chat` message will continue this conversation.'));
        console.log('');

      } catch (error: any) {
        spinner.stop();
        console.log('');
        console.log(ERROR(`  ❌ ${error.message}`));
        console.log('');
      }
    });
}

// ═══════════════════════════════════════════════════════════
// CONVERSATION LIST RENDERER
// ═══════════════════════════════════════════════════════════

function renderConversationList(conversations: any[], activeConvoId: string | undefined, search: string | undefined, result: any, isJoinMode: boolean = false): void {
  const groups = groupByTime(conversations);

  console.log('');
  console.log(BRAND_SECONDARY(`  💬 ${isJoinMode ? 'Select a Conversation' : 'Your Conversations'}`) + MUTED(` (${result.total || conversations.length} total)`));

  if (search) {
    console.log(MUTED(`  Search: "${search}"`));
  }

  console.log(MUTED('  ─────────────────────────────────────────────────────────────────'));
  console.log('');
  console.log(MUTED('       #   Title                                  Source  Time     Meta'));
  console.log(MUTED('  ─────────────────────────────────────────────────────────────────'));

  let globalIndex = 0;

  for (const group of groups) {
    if (group.conversations.length === 0) continue;

    console.log('');
    console.log(BRAND_SECONDARY(`  ┌─ ${group.label}`));
    console.log('');

    for (const convo of group.conversations) {
      globalIndex++;
      const isActive = convo.id === activeConvoId;
      renderConversationTile(convo, globalIndex, isActive);
    }
  }

  console.log('');
  console.log(MUTED('  ─────────────────────────────────────────────────────────────────'));

  if (result.totalPages && result.totalPages > 1) {
    console.log(MUTED(`  Page ${result.page}/${result.totalPages}`));
    if (result.page < result.totalPages) {
      console.log(MUTED(`  ▸ bob conversations --page ${result.page + 1}`));
    }
  }

  if (!isJoinMode) {
    console.log('');
    console.log(MUTED('  ▸ bob conversations join    — Pick a conversation to continue'));
    console.log(MUTED('  ▸ bob conversations -s "q"  — Search by keyword'));
  }

  console.log('');
}

function renderConversationTile(convo: any, index: number, isActive: boolean): void {
  const modeIcon = getModeIcon(convo);
  const sourceIcon = getSourceIcon(convo.source || 'cli');
  const timeAgo = convo.lastUpdated ? getTimeAgo(convo.lastUpdated) : '?';
  const title = (convo.title || 'Untitled').slice(0, 38);
  const paddedTitle = title + (title.length < 38 ? ' '.repeat(38 - title.length) : '');

  const msgCount = convo.messageCount ? MUTED(`${convo.messageCount}💬`) : '';
  const forkCount = convo.forkCount ? BRAND_SECONDARY(`${convo.forkCount}🍴`) : '';
  const projectIcon = convo.hasProject ? SUCCESS('📁') : '';
  const meta = [msgCount, forkCount, projectIcon].filter(Boolean).join(' ');

  const indicator = isActive ? ACTIVE_INDICATOR : '  ';
  const numStr = INFO(String(index).padStart(2));
  const timeStr = MUTED(timeAgo.padEnd(8));

  const line = `  ${indicator} ${numStr}. ${modeIcon} ${chalk.white(paddedTitle)} ${sourceIcon}  ${timeStr} ${meta}`;

  if (isActive) {
    console.log(ACTIVE_BG(line));
  } else {
    console.log(line);
  }
}

// ═══════════════════════════════════════════════════════════
// TIME GROUPING
// ═══════════════════════════════════════════════════════════

interface TimeGroup {
  label: string;
  conversations: any[];
}

function groupByTime(conversations: any[]): TimeGroup[] {
  const now = Date.now();
  const today: any[] = [];
  const thisWeek: any[] = [];
  const older: any[] = [];

  for (const convo of conversations) {
    const updated = convo.lastUpdated ? new Date(convo.lastUpdated).getTime() : 0;
    const diffMs = now - updated;
    const diffHours = diffMs / 3600000;

    if (diffHours < 24) {
      today.push(convo);
    } else if (diffHours < 168) {
      thisWeek.push(convo);
    } else {
      older.push(convo);
    }
  }

  return [
    { label: 'Today', conversations: today },
    { label: 'This Week', conversations: thisWeek },
    { label: 'Older', conversations: older },
  ];
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function getTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  return `${Math.floor(diffDays / 30)}mo`;
}