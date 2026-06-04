import * as fs from 'fs';
import * as path from 'path';
import { ensureProjectStructure } from './project-map.js';

export interface MessageDoc {
  sender: 'user' | 'bob' | 'system';
  message: string;
  timestamp: string;
  type: 'text' | 'code' | 'error';
  origin?: string;
}

interface ConversationMeta {
  conversationId: string;
  title: string | null;
  createdAt: string;
  lastUpdated: string;
  lastMessage: string;
  sender: string;
  source: 'cli';
  tier: 'local' | 'platform';
  provider: string | null;
  mode: 'standard' | 'consultant' | 'personalized';
}

/**
 * Saves a message to the project-scoped conversation.
 */
export function saveMessage(
  conversationId: string,
  message: MessageDoc,
  meta: { tier: 'local' | 'platform'; provider: string | null; mode: 'standard' | 'consultant' | 'personalized' }
): void {
  const { conversationsDir } = ensureProjectStructure(process.cwd());
  const convoDir = path.join(conversationsDir, conversationId);
  const messagesDir = path.join(convoDir, 'messages');

  if (!fs.existsSync(convoDir)) fs.mkdirSync(convoDir, { recursive: true });
  if (!fs.existsSync(messagesDir)) fs.mkdirSync(messagesDir, { recursive: true });

  // Save individual message
  const messageFilename = `${Date.now()}_${message.sender}.json`;
  fs.writeFileSync(
    path.join(messagesDir, messageFilename),
    JSON.stringify(message, null, 2)
  );

  // Update conversation metadata
  const metaPath = path.join(convoDir, 'conversation.json');
  let convoMeta: ConversationMeta;

  if (fs.existsSync(metaPath)) {
    try {
      convoMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {
      convoMeta = createMeta(conversationId, meta);
    }
  } else {
    convoMeta = createMeta(conversationId, meta);
  }

  convoMeta.lastUpdated = message.timestamp;
  convoMeta.lastMessage = message.message.slice(0, 200);
  convoMeta.sender = message.sender;

  if (!convoMeta.title && message.sender === 'user') {
    convoMeta.title = message.message.slice(0, 80);
  }

  fs.writeFileSync(metaPath, JSON.stringify(convoMeta, null, 2));
}

function createMeta(
  conversationId: string,
  meta: { tier: 'local' | 'platform'; provider: string | null; mode: 'standard' | 'consultant' | 'personalized' }
): ConversationMeta {
  return {
    conversationId,
    title: null,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    lastMessage: '',
    sender: '',
    source: 'cli',
    tier: meta.tier,
    provider: meta.provider,
    mode: meta.mode,
  };
}

export function loadConversationMessages(conversationId: string): MessageDoc[] {
  const { conversationsDir } = ensureProjectStructure(process.cwd());
  const messagesDir = path.join(conversationsDir, conversationId, 'messages');
  if (!fs.existsSync(messagesDir)) return [];

  return fs.readdirSync(messagesDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(file => {
      try {
        return JSON.parse(fs.readFileSync(path.join(messagesDir, file), 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean) as MessageDoc[];
}

export function listConversations(): ConversationMeta[] {
  const { conversationsDir } = ensureProjectStructure(process.cwd());

  const dirs = fs.readdirSync(conversationsDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  const conversations: ConversationMeta[] = [];

  for (const dir of dirs) {
    const metaPath = path.join(conversationsDir, dir.name, 'conversation.json');
    if (fs.existsSync(metaPath)) {
      try {
        conversations.push(JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
      } catch {
        // Skip
      }
    }
  }

  return conversations.sort((a, b) =>
    new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );
}