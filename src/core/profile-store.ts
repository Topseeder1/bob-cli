import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { getConfig } from './config-store';
import { callCloudFunction, isAuthenticated } from './api-client';

const BOB_DIR = path.join(os.homedir(), '.bob');

export interface DailyProfile {
  date: string;
  projectName: string;
  messageCount: number;
  communicationStyle: {
    tone: string;
    verbosity: string;
    questionRatio: number;
    confidence: number;
    examples: string[];
  };
  mentality: {
    patience: string;
    approach: string;
    optimism: string;
    confidence: number;
    examples: string[];
  };
  goalPatterns: {
    clarity: string;
    followThrough: string;
    currentGoals: string[];
    confidence: number;
    examples: string[];
  };
  workFrequency: {
    sessionCount: number;
    averageDuration: string;
    peakHours: string;
    pattern: string;
    confidence: number;
  };
  emotionalState: {
    dominant: string;
    secondary: string;
    triggers: string[];
    confidence: number;
    quotes: string[];
  };
  decisionStyle: {
    speed: string;
    riskTolerance: string;
    independence: string;
    confidence: number;
    examples: string[];
  };
  technicalDepth: {
    level: string;
    focusAreas: string[];
    confidence: number;
  };
  userQuotes: string[];
  generatedAt: string;
}

export interface WeeklyProfile {
  weekOf: string;
  dateRange: string;
  trajectory: string;
  energyPattern: string;
  moodShift: string;
  focusEvolution: string;
  communicationShift: string;
  dailySummaries: { date: string; summary: string }[];
  keyMoments: { date: string; event: string; quote: string }[];
  confidence: number;
  generatedAt: string;
}

export interface MonthlyProfile {
  month: string;
  overallTrajectory: string;
  weeklyProgression: string[];
  personalitySnapshot: {
    archetype: string;
    communicationStyle: string;
    workRhythm: string;
    emotionalPattern: string;
    decisionMaking: string;
    growth: string;
  };
  keyQuotes: string[];
  confidence: number;
  generatedAt: string;
}

function getProfileDir(projectName?: string): string {
  const name = projectName || path.basename(process.cwd());
  const profileDir = path.join(BOB_DIR, 'projects', name, 'profile');

  const dirs = [
    path.join(profileDir, 'daily'),
    path.join(profileDir, 'weekly'),
    path.join(profileDir, 'monthly'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  return profileDir;
}

export function saveDailyProfile(profile: DailyProfile): void {
  const profileDir = getProfileDir();
  const filePath = path.join(profileDir, 'daily', `${profile.date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));

  // Also update current-dna.json
  updateCurrentDNA(profile);
}

export function saveWeeklyProfile(profile: WeeklyProfile): void {
  const profileDir = getProfileDir();
  const filePath = path.join(profileDir, 'weekly', `${profile.weekOf}.json`);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
}

export function saveMonthlyProfile(profile: MonthlyProfile): void {
  const profileDir = getProfileDir();
  const filePath = path.join(profileDir, 'monthly', `${profile.month}.json`);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));

  // Update current-dna with monthly snapshot
  const dnaPath = path.join(profileDir, 'current-dna.json');
  fs.writeFileSync(dnaPath, JSON.stringify({
    ...profile.personalitySnapshot,
    lastUpdated: new Date().toISOString(),
    source: 'monthly',
    month: profile.month,
  }, null, 2));
}

export function loadDailyProfile(date: string): DailyProfile | null {
  const profileDir = getProfileDir();
  const filePath = path.join(profileDir, 'daily', `${date}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

export function loadDailyProfiles(days: number): DailyProfile[] {
  const profileDir = getProfileDir();
  const dailyDir = path.join(profileDir, 'daily');
  if (!fs.existsSync(dailyDir)) return [];

  const files = fs.readdirSync(dailyDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, days);

  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dailyDir, f), 'utf-8'));
    } catch { return null; }
  }).filter(Boolean) as DailyProfile[];
}

export function loadWeeklyProfiles(weeks: number): WeeklyProfile[] {
  const profileDir = getProfileDir();
  const weeklyDir = path.join(profileDir, 'weekly');
  if (!fs.existsSync(weeklyDir)) return [];

  const files = fs.readdirSync(weeklyDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, weeks);

  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(weeklyDir, f), 'utf-8'));
    } catch { return null; }
  }).filter(Boolean) as WeeklyProfile[];
}

export function loadCurrentDNA(): any | null {
  const profileDir = getProfileDir();
  const dnaPath = path.join(profileDir, 'current-dna.json');
  if (!fs.existsSync(dnaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(dnaPath, 'utf-8'));
  } catch { return null; }
}

function updateCurrentDNA(dailyProfile: DailyProfile): void {
  const profileDir = getProfileDir();
  const dnaPath = path.join(profileDir, 'current-dna.json');

  fs.writeFileSync(dnaPath, JSON.stringify({
    archetype: inferArchetype(dailyProfile),
    communicationStyle: dailyProfile.communicationStyle.tone,
    workRhythm: dailyProfile.workFrequency.pattern,
    emotionalState: dailyProfile.emotionalState.dominant,
    decisionMaking: dailyProfile.decisionStyle.speed + ', ' + dailyProfile.decisionStyle.riskTolerance,
    lastUpdated: new Date().toISOString(),
    source: 'daily',
    date: dailyProfile.date,
  }, null, 2));
}

function inferArchetype(profile: DailyProfile): string {
  const style = profile.communicationStyle.tone.toLowerCase();
  const decision = profile.decisionStyle.speed.toLowerCase();
  const work = profile.workFrequency.pattern.toLowerCase();

  if (style.includes('direct') && decision.includes('fast')) return 'The Builder Who Ships';
  if (style.includes('cautious') && decision.includes('deliberate')) return 'The Methodical Architect';
  if (work.includes('burst')) return 'The Sprint Specialist';
  if (style.includes('curious') || style.includes('exploratory')) return 'The Explorer';
  return 'The Adaptive Engineer';
}

// ═══════════════════════════════════════════════════════════════════
// LOCAL MESSAGE RETRIEVAL (Tier 1 — unchanged logic)
// ═══════════════════════════════════════════════════════════════════

function getLocalConversationMessages(projectName?: string): { role: string; content: string; timestamp: string }[] {
  const name = projectName || path.basename(process.cwd());
  const convosDir = path.join(BOB_DIR, 'projects', name, 'conversations');

  if (!fs.existsSync(convosDir)) return [];

  const allMessages: { role: string; content: string; timestamp: string }[] = [];

  const conversationDirs = fs.readdirSync(convosDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const convoDir of conversationDirs) {
    const messagesDir = path.join(convosDir, convoDir.name, 'messages');
    if (!fs.existsSync(messagesDir)) continue;

    const messageFiles = fs.readdirSync(messagesDir)
      .filter(f => f.endsWith('.json'))
      .sort();

    for (const msgFile of messageFiles) {
      try {
        const msg = JSON.parse(fs.readFileSync(path.join(messagesDir, msgFile), 'utf-8'));
        allMessages.push({
          role: msg.sender || 'unknown',
          content: msg.message || '',
          timestamp: msg.timestamp || '',
        });
      } catch { /* skip */ }
    }
  }

  return allMessages;
}

// ═══════════════════════════════════════════════════════════════════
// FIRESTORE MESSAGE RETRIEVAL (Tier 3 — platform conversations)
// ═══════════════════════════════════════════════════════════════════

async function getFirestoreTodayMessages(): Promise<{ role: string; content: string; timestamp: string }[]> {
  try {
    // Only attempt if user is authenticated
    if (!isAuthenticated()) return [];

    const response = await callCloudFunction('getCLITodayMessages', {});

    if (!response || !response.success || !Array.isArray(response.messages)) {
      return [];
    }

    // Transform Firestore messages to match local format
    return response.messages.map((msg: any) => ({
      role: msg.sender || 'unknown',
      content: msg.message || '',
      timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : '',
    }));

  } catch (error) {
    // Fail silently — Firestore unavailability should never block local profiling
    console.error('[PROFILE_STORE] Firestore message fetch failed (non-fatal):', (error as Error).message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// DEDUPLICATION LOGIC
// ═══════════════════════════════════════════════════════════════════

function generateMessageKey(msg: { role: string; content: string; timestamp: string }): string {
  const normalizedContent = (msg.content || '').trim().substring(0, 100);
  const raw = `${msg.timestamp}|${normalizedContent}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

function deduplicateMessages(
  localMessages: { role: string; content: string; timestamp: string }[],
  firestoreMessages: { role: string; content: string; timestamp: string }[]
): { role: string; content: string; timestamp: string }[] {
  const seen = new Map<string, { role: string; content: string; timestamp: string }>();

  // Local messages take priority
  for (const msg of localMessages) {
    const key = generateMessageKey(msg);
    seen.set(key, msg);
  }

  // Add Firestore messages only if not already present
  for (const msg of firestoreMessages) {
    const key = generateMessageKey(msg);
    if (!seen.has(key)) {
      seen.set(key, msg);
    }
  }

  // Sort by timestamp ascending
  return Array.from(seen.values()).sort((a, b) => {
    if (!a.timestamp || !b.timestamp) return 0;
    return a.timestamp.localeCompare(b.timestamp);
  });
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API (Updated — now async, 24-hour rolling window)
// ═══════════════════════════════════════════════════════════════════

export async function getConversationMessages(projectName?: string): Promise<{ role: string; content: string; timestamp: string }[]> {
  const localMessages = getLocalConversationMessages(projectName);

  // If not authenticated, return local only
  if (!isAuthenticated()) return localMessages;

  // Fetch Firestore messages and merge
  const firestoreMessages = await getFirestoreTodayMessages();
  return deduplicateMessages(localMessages, firestoreMessages);
}

export async function getTodayMessages(projectName?: string): Promise<{ role: string; content: string; timestamp: string }[]> {
  const all = await getConversationMessages(projectName);

  // 24-hour rolling window instead of calendar day
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return all.filter(msg => {
    if (!msg.timestamp) return false;
    return msg.timestamp >= twentyFourHoursAgo;
  });
}