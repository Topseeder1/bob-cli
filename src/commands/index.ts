import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../core/config-store.js';
import { callLocalModel } from '../ai/providers/local.js';
import {
  getProjectName,
  ensureProjectStructure,
  createAnalysisRun,
  completeTask,
  updateManifestProgress,
  saveSummaries,
  saveDependencies,
} from '../core/project-map.js';

// ─── DESIGN TOKENS ───
const BRAND_PRIMARY = chalk.hex('#E66F24');
const BRAND_SECONDARY = chalk.hex('#FFAB00');
const SUCCESS = chalk.hex('#66BB6A');
const INFO = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR = chalk.hex('#EF5350');
const MUTED = chalk.hex('#78909C');

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.dart_tool', '.idea', '.gradle', '.pub-cache', '.bob'];
const CODE_EXTENSIONS = new Set(['.dart', '.js', '.ts', '.html', '.css', '.json', '.yaml', '.yml', '.xml', '.sh', '.md']);

export function registerIndexCommand(program: any): void {
  program
    .command('index')
    .description('Index the current project — generates summaries and dependency map')
    .option('--verbose', 'Show detailed progress with summaries')
    .action(async (options: { verbose?: boolean }) => {
      const config = getConfig();
      const cwd = process.cwd();
      const projectName = getProjectName(cwd);

      if (config.provider !== 'local' || !config.localEndpoint) {
        console.log('');
        console.log(ERROR('  ❌ Indexing requires a local model.'));
        console.log(MUTED('  Run `bob config set provider local`'));
        console.log(MUTED('  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`'));
        console.log('');
        return;
      }

      console.log('');
      console.log(chalk.bold(INFO(`  ⚡ Indexing project: ${projectName}`)));
      console.log(MUTED(`  📁 ${cwd}`));
      console.log(MUTED('  ─────────────────────────────────────'));
      console.log('');

      const files = scanProjectFiles(cwd);

      if (files.length === 0) {
        console.log(WARNING('  ⚠️  No code files found to index.'));
        return;
      }

      console.log(MUTED(`  Found ${files.length} files to analyze.`));
      console.log('');
      console.log('');
      console.log('');
      console.log('');
      console.log('');

      const { runId, runDir, tasksDir } = createAnalysisRun(cwd, files);
      const summaries: Record<string, string> = {};
      let completed = 0;

      for (const filePath of files) {
        const absolutePath = path.join(cwd, filePath);
        let content: string;

        try {
          content = fs.readFileSync(absolutePath, 'utf-8');
        } catch {
          console.log(ERROR(`  ❌ Could not read: ${filePath}`));
          continue;
        }

        if (content.length > 50000) {
          const shortSummary = `Large file (${Math.round(content.length / 1000)}KB). Skipped detailed analysis.`;
          summaries[filePath] = shortSummary;
          completeTask(tasksDir, filePath, shortSummary);
          completed++;
          updateManifestProgress(runDir, completed);
          printProgress(completed, files.length, filePath, shortSummary, [], options.verbose);
          continue;
        }

        try {
          const messages = [
            {
              role: 'system' as const,
              content: 'You are a code analyst. Respond with ONLY a 2-3 sentence summary. No formatting, no headers, no bullets. Just plain sentences.',
            },
            {
              role: 'user' as const,
              content: `Summarize this file. What does it do, what does it export, and what does it depend on?\n\nFile: ${filePath}\n\n${content}`,
            },
          ];

          const summary = await callLocalModel(config.localEndpoint!, messages);
          summaries[filePath] = (summary as any).text ? (summary as any).text.trim() : String(summary).trim();
          completeTask(tasksDir, filePath, summaries[filePath]);
          completed++;
          updateManifestProgress(runDir, completed);
          printProgress(completed, files.length, filePath, summaries[filePath], [], options.verbose);
        } catch (error: any) {
          console.log(ERROR(`  ❌ Failed: ${filePath} — ${error.message}`));
          completed++;
          updateManifestProgress(runDir, completed);
        }
      }

      console.log('');
      console.log('');
      console.log(INFO('  🔗 Generating dependency map...'));

      try {
        const summaryContext = Object.entries(summaries)
          .map(([fp, summary]) => `[${fp}]: ${summary}`)
          .join('\n\n');

        const messages = [
          {
            role: 'system' as const,
            content: 'You are a senior software architect. Respond with ONLY a valid JSON object. No explanation, no markdown, no code fences. Just raw JSON.',
          },
          {
            role: 'user' as const,
            content: `Based on these file summaries, generate a JSON dependency map. Each key is a file path, each value is an array of file paths that file depends on or interacts with. Only include direct, meaningful dependencies.\n\nFILE SUMMARIES:\n${summaryContext}\n\nRespond with ONLY the JSON object:`,
          },
        ];

        const depResponse = await callLocalModel(config.localEndpoint!, messages);
        const depText = (depResponse as any).text ? (depResponse as any).text : String(depResponse);

        let dependencies: Record<string, string[]> = {};
        try {
          const jsonMatch = depText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            dependencies = JSON.parse(jsonMatch[0]);
          }
        } catch {
          console.log(WARNING('  ⚠️  Could not parse dependency map. Saving empty map.'));
          dependencies = {};
        }

        saveSummaries(cwd, summaries);
        saveDependencies(cwd, dependencies);

        for (const [filePath, deps] of Object.entries(dependencies)) {
          const taskId = filePath.replace(/[\/\\]/g, '_');
          const taskPath = path.join(tasksDir, `${taskId}.json`);
          if (fs.existsSync(taskPath)) {
            const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
            task.dependencies = deps;
            fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
          }
        }

        updateManifestProgress(runDir, completed, 'completed');
        console.log(SUCCESS(`  ✅ Dependency map generated for ${Object.keys(dependencies).length} files.`));
      } catch (error: any) {
        console.log(ERROR(`  ❌ Dependency mapping failed: ${error.message}`));
        saveSummaries(cwd, summaries);
        saveDependencies(cwd, {});
        updateManifestProgress(runDir, completed, 'completed_partial');
      }

      console.log('');
      console.log(chalk.bold(SUCCESS(`  ✅ Indexing complete: ${projectName}`)));
      console.log(MUTED(`  📄 ${Object.keys(summaries).length} files summarized`));
      console.log(MUTED(`  💾 Saved to: ~/.bob/projects/${projectName}/analysis/`));
      console.log('');
    });
}

function scanProjectFiles(rootDir: string, currentDir?: string, depth: number = 0): string[] {
  if (depth > 6) return [];
  const dir = currentDir || rootDir;
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        files.push(...scanProjectFiles(rootDir, fullPath, depth + 1));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) {
          files.push(relativePath);
        }
      }
    }
  } catch { /* skip inaccessible dirs */ }

  return files;
}

function printProgress(completed: number, total: number, filePath: string, summary: string, dependencies: string[], verbose?: boolean): void {
  const percent = completed / total;
  const barLength = 30;
  const filled = Math.round(percent * barLength);

  let barColor: (s: string) => string;
  if (percent < 0.25) {
    barColor = chalk.hex('#EF5350');
  } else if (percent < 0.5) {
    barColor = chalk.hex('#FF8C00');
  } else if (percent < 0.75) {
    barColor = chalk.hex('#FFC107');
  } else {
    barColor = chalk.hex('#66BB6A');
  }

  const filledBar = barColor('█'.repeat(filled));
  const emptyBar = MUTED('░'.repeat(barLength - filled));
  const percentText = barColor(`${Math.round(percent * 100)}%`);

  process.stdout.write('\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\r');

  console.log(`  ${INFO('⚡')} Indexing [${filledBar}${emptyBar}] ${completed}/${total} ${percentText}`);
  console.log(SUCCESS(`  ✅ ${filePath}`));

  if (verbose) {
    console.log(MUTED(`     "${summary.slice(0, 120)}${summary.length > 120 ? '...' : ''}"`));
    if (dependencies.length > 0) {
      console.log(MUTED(`     → depends on: ${dependencies.join(', ')}`));
    } else {
      console.log(MUTED(`     → depends on: (mapping after all summaries)`));
    }
  } else {
    console.log(MUTED(`     "${summary.slice(0, 80)}${summary.length > 80 ? '...' : ''}"`));
    console.log('');
  }
}