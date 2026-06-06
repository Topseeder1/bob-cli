import * as fs from 'fs';
import * as path from 'path';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.dart_tool', '.idea', '.gradle', '.pub-cache', '.bob'];
const MAX_DEPTH = 3;

export function buildLocalContext(rootDir: string): string {
  const tree = getDirectoryTree(rootDir, 0);
  return `Working Directory: ${rootDir}\n\nFile Tree:\n${tree}`;
}

function getDirectoryTree(dir: string, depth: number): string {
  if (depth >= MAX_DEPTH) return '';

  let result = '';
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith('.') && depth === 0) continue;

      const indent = '  '.repeat(depth);

      if (entry.isDirectory()) {
        result += `${indent}${entry.name}/\n`;
        result += getDirectoryTree(path.join(dir, entry.name), depth + 1);
      } else {
        result += `${indent}${entry.name}\n`;
      }
    }
  } catch (e) {
    // Skip unreadable directories
  }

  return result;
}

export function readFileContent(filePath: string): string | null {
  try {
    return fs.readFileSync(path.resolve(filePath), 'utf-8');
  } catch (e) {
    return null;
  }
}