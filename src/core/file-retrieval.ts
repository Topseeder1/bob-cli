import * as fs from 'fs';
import * as path from 'path';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import { loadSummaries, loadDependencies } from './project-map.js';

export interface RetrievalResult {
  fileContents: string;
  selectedFiles: string[];
}

/**
 * Two-Step Retrieval: Uses project index to find relevant files.
 * Returns file contents string + list of selected file paths.
 */
export async function getRelevantFileContents(
  userMessage: string,
  localEndpoint: string,
): Promise<RetrievalResult> {
  const cwd = process.cwd();
  const summaries = loadSummaries(cwd);
  const dependencies = loadDependencies(cwd);

  if (!summaries || Object.keys(summaries).length === 0) {
    return { fileContents: '', selectedFiles: [] };
  }

  // Build map context
  let mapContext = 'PROJECT MAP:\n';
  for (const [filePath, summary] of Object.entries(summaries)) {
    mapContext += `- ${filePath}: "${summary}"\n`;
  }

  if (dependencies && Object.keys(dependencies).length > 0) {
    mapContext += '\nDEPENDENCIES:\n';
    for (const [filePath, deps] of Object.entries(dependencies)) {
      if (deps.length > 0) {
        mapContext += `- ${filePath} depends on: [${deps.join(', ')}]\n`;
      }
    }
  }

  // ─── SELECTION PASS ───
  const selectionMessages: LocalChatMessage[] = [
    {
      role: 'system',
      content: 'You are a file selector. Based on the user request and project map, return ONLY a JSON array of file paths that are relevant to answering this request. Maximum 5 files. No explanation, no markdown, no code fences. Just a raw JSON array like: ["path/to/file.ts", "path/to/other.ts"]',
    },
    {
      role: 'user',
      content: `USER REQUEST: "${userMessage}"\n\n${mapContext}\n\nReturn ONLY the JSON array of relevant file paths:`,
    },
  ];

  try {
    const selectionResponse = await callLocalModel(localEndpoint, selectionMessages);

    const jsonMatch = selectionResponse.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return { fileContents: '', selectedFiles: [] };

    const selectedFiles: string[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(selectedFiles) || selectedFiles.length === 0) {
      return { fileContents: '', selectedFiles: [] };
    }

    // ─── READ SELECTED FILES ───
    let fileContents = '## RELEVANT FILES (selected by Bob from project index) ##\n\n';
    const validFiles: string[] = [];

    for (const filePath of selectedFiles.slice(0, 5)) {
      const absolutePath = path.join(cwd, filePath);
      try {
        if (fs.existsSync(absolutePath)) {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          fileContents += `--- FILE: ${filePath} ---\n${content}\n--- END FILE ---\n\n`;
          validFiles.push(filePath);
        }
      } catch {
        // Skip
      }
    }

    return { fileContents, selectedFiles: validFiles };

  } catch {
    return { fileContents: '', selectedFiles: [] };
  }
}