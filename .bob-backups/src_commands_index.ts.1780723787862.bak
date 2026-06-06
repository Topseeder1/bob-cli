import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../core/config-store.js';
import { callLocalModel, LocalChatMessage } from '../ai/providers/local.js';
import {
  getProjectName,
  ensureProjectStructure,
  createAnalysisRun,
  completeTask,
  updateManifestProgress,
  saveSummaries,
  saveDependencies,
} from '../core/project-map.js';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.dart_tool', '.idea', '.gradle', '.pub-cache', '.bob'];
const CODE_EXTENSIONS = new Set(['.dart', '.js', '.ts', '.html', '.css', '.json', '.yaml', '.yml', '.xml', '.sh', '.md']);

export function registerIndexCommand(program: Command): void {
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
        console.log(chalk.red('  ❌ Indexing requires a local model.'));
        console.log(chalk.gray('  Run `bob config set provider local`'));
        console.log(chalk.gray('  Run `bob config set localEndpoint http://127.0.0.1:11434/api/chat`'));
        console.log('');
        return;
      }

      console.log('');
      console.log(chalk.bold.cyan(`  ⚡ Indexing project: ${projectName}`));
      console.log(chalk.gray(`  📁 ${cwd}`));
      console.log(chalk.gray('  ─────────────────────────────────────'));
      console.log('');

      // ─── PHASE 1: SCAN FILES ───
      const files = scanProjectFiles(cwd);

      if (files.length === 0) {
        console.log(chalk.yellow('  ⚠️  No code files found to index.'));
        return;
      }

      console.log(chalk.gray(`  Found ${files.length} files to analyze.`));
      console.log('');

      // Seed blank lines for progress display to overwrite
      console.log('');
      console.log('');
      console.log('');
      console.log('');

      // ─── CREATE RUN ───
      const { runId, runDir, tasksDir } = createAnalysisRun(cwd, files);
      const summaries: Record<string, string> = {};
      let completed = 0;

      // ─── PHASE 2: SUMMARIZE EACH FILE ───
      for (const filePath of files) {
        const absolutePath = path.join(cwd, filePath);
        let content: string;

        try {
          content = fs.readFileSync(absolutePath, 'utf-8');
        } catch {
          console.log(chalk.red(`  ❌ Could not read: ${filePath}`));
          continue;
        }

        // Skip very large files
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
          const messages: LocalChatMessage[] = [
            {
              role: 'system',
              content: 'You are a code analyst. Respond with ONLY a 2-3 sentence summary. No formatting, no headers, no bullets. Just plain sentences.',
            },
            {
              role: 'user',
              content: `Summarize this file. What does it do, what does it export, and what does it depend on?\n\nFile: ${filePath}\n\n${content}`,
            },
          ];

          const summary = await callLocalModel(config.localEndpoint!, messages);
          summaries[filePath] = summary.trim();
          completeTask(tasksDir, filePath, summary.trim());
          completed++;
          updateManifestProgress(runDir, completed);
          printProgress(completed, files.length, filePath, summary.trim(), [], options.verbose);

        } catch (error: any) {
          console.log(chalk.red(`  ❌ Failed: ${filePath} — ${error.message}`));
          completed++;
          updateManifestProgress(runDir, completed);
        }
      }

      // ─── PHASE 3: DEPENDENCY MAPPING ───
      console.log('');
      console.log('');
      console.log(chalk.cyan('  🔗 Generating dependency map...'));

      try {
        const summaryContext = Object.entries(summaries)
          .map(([fp, summary]) => `[${fp}]: ${summary}`)
          .join('\n\n');

        const messages: LocalChatMessage[] = [
          {
            role: 'system',
            content: 'You are a senior software architect. Respond with ONLY a valid JSON object. No explanation, no markdown, no code fences. Just raw JSON.',
          },
          {
            role: 'user',
            content: `Based on these file summaries, generate a JSON dependency map. Each key is a file path, each value is an array of file paths that file depends on or interacts with. Only include direct, meaningful dependencies.\n\nFILE SUMMARIES:\n${summaryContext}\n\nRespond with ONLY the JSON object:`,
          },
        ];

        const depResponse = await callLocalModel(config.localEndpoint!, messages);

        let dependencies: Record<string, string[]> = {};
        try {
          const jsonMatch = depResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            dependencies = JSON.parse(jsonMatch[0]);
          }
        } catch {
          console.log(chalk.yellow('  ⚠️  Could not parse dependency map. Saving empty map.'));
          dependencies = {};
        }

        // Save final outputs
        saveSummaries(cwd, summaries);
        saveDependencies(cwd, dependencies);

        // Update task files with dependencies
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

        console.log(chalk.green(`  ✅ Dependency map generated for ${Object.keys(dependencies).length} files.`));

      } catch (error: any) {
        console.log(chalk.red(`  ❌ Dependency mapping failed: ${error.message}`));
        saveSummaries(cwd, summaries);
        saveDependencies(cwd, {});
        updateManifestProgress(runDir, completed, 'completed_partial');
      }

      // ─── DONE ───
      console.log('');
      console.log(chalk.bold.green(`  ✅ Indexing complete: ${projectName}`));
      console.log(chalk.gray(`  📄 ${Object.keys(summaries).length} files summarized`));
      console.log(chalk.gray(`  💾 Saved to: ~/.bob/projects/${projectName}/analysis/`));
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
  } catch {
    // Skip unreadable
  }

  return files;
}

function printProgress(
  completed: number,
  total: number,
  filePath: string,
  summary: string,
  dependencies: string[],
  verbose?: boolean
): void {
  const percent = completed / total;
  const barLength = 30;
  const filled = Math.round(percent * barLength);

  // Color shifts based on progress
  let barColor: (text: string) => string;
  if (percent < 0.25) {
    barColor = chalk.red;
  } else if (percent < 0.50) {
    barColor = chalk.hex('#FF8C00');
  } else if (percent < 0.75) {
    barColor = chalk.yellow;
  } else {
    barColor = chalk.green;
  }

  const filledBar = barColor('█'.repeat(filled));
  const emptyBar = chalk.gray('░'.repeat(barLength - filled));
  const percentText = barColor(`${Math.round(percent * 100)}%`);

  // Clear previous output (4 lines)
  process.stdout.write('\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\x1B[1A\x1B[2K\r');

  // Print bar
  console.log(`  ${chalk.cyan('⚡')} Indexing [${filledBar}${emptyBar}] ${completed}/${total} ${percentText}`);

  // Print latest completed file
  console.log(chalk.green(`  ✅ ${filePath}`));

  if (verbose) {
    console.log(chalk.gray(`     "${summary.slice(0, 120)}${summary.length > 120 ? '...' : ''}"`));
    if (dependencies.length > 0) {
      console.log(chalk.gray(`     → depends on: ${dependencies.join(', ')}`));
    } else {
      console.log(chalk.gray(`     → depends on: (mapping after all summaries)`));
    }
  } else {
    console.log(chalk.gray(`     "${summary.slice(0, 80)}${summary.length > 80 ? '...' : ''}"`));
    console.log('');
  }
}