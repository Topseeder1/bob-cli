// src/core/reference-resolver.ts

import { callCloudFunction } from './api-client.js';

export interface DetectedReference {
  alias: string;
  filename?: string;
}

export interface AvailableReference {
  alias: string;
  projectId: string;
  repoDisplayName: string;
}

const RESERVED_COMMANDS = [
  'help', 'clear', 'reset', 'surface', 'promote',
  'constraints', 'personalized', 'exit', 'quit', 'new',
  'ref', 'pin', 'unpin', 'sticky'
];

/**
 * Detects if a user input string contains a reference command.
 * Only matches if the message STARTS with /alias.
 * Reserved CLI commands are ignored.
 */
export function detectReference(input: string): DetectedReference | null {
  if (!input.startsWith('/')) return null;

  const match = input.match(
    /^\/([a-zA-Z0-9_-]+)(?:\s*-\s*(.+?))?(?:\s|$)/
  );
  if (!match) return null;

  const alias = match[1].toLowerCase().trim();
  if (RESERVED_COMMANDS.includes(alias)) return null;

  return {
    alias,
    filename: match[2]?.trim(),
  };
}

/**
 * Fetches all shared projects the user has permission to reference.
 * Calls the existing cloud function rather than hitting Firestore directly.
 */
export async function fetchAvailableReferences(
  domain: string,
  uid: string
): Promise<AvailableReference[]> {
  try {
    const result = await callCloudFunction('getAvailableReferences', {
      domain,
      uid,
    });
    return result?.references ?? [];
  } catch (e) {
    console.error('[REF] fetchAvailableReferences failed:', e);
    return [];
  }
}

/**
 * Fetches files from a project's ProjectAnalysis subcollection.
 * Calls the existing cloud function rather than hitting Firestore directly.
 */
export async function fetchProjectFiles(
  domain: string,
  projectId: string,
  query: string = ''
): Promise<string[]> {
  try {
    const result = await callCloudFunction('getProjectReferenceFiles', {
      domain,
      projectId,
      query,
    });
    return result?.files ?? [];
  } catch (e) {
    console.error('[REF] fetchProjectFiles failed:', e);
    return [];
  }
}

/**
 * Reads sticky reference state from a conversation or thread doc.
 * Calls the existing cloud function rather than hitting Firestore directly.
 */
export async function loadStickyReference(
  docPath: string
): Promise<DetectedReference | null> {
  try {
    const result = await callCloudFunction('getStickyReference', { docPath });
    if (!result?.active || !result?.alias) return null;
    return { alias: result.alias };
  } catch (e) {
    return null;
  }
}

/**
 * Saves sticky reference state to a conversation or thread doc.
 * Calls the existing cloud function rather than hitting Firestore directly.
 */
export async function saveStickyReference(
  docPath: string,
  alias: string | null,
  active: boolean
): Promise<void> {
  try {
    await callCloudFunction('setStickyReference', {
      docPath,
      alias,
      active,
    });
  } catch (e) {
    console.error('[REF] saveStickyReference failed:', e);
  }
}