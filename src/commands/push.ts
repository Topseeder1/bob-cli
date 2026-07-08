import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';

// ─── DESIGN TOKENS ───
const SUCCESS = chalk.hex('#66BB6A');
const INFO    = chalk.hex('#26C6DA');
const WARNING = chalk.hex('#FFC107');
const ERROR   = chalk.hex('#EF5350');
const MUTED   = chalk.hex('#78909C');
const BORDER  = chalk.hex('#455A64');

// ─── LAYOUT HELPERS ───
const BOX_WIDTH = 62;

function pad(text: string): string {
  const visible = text.replace(/\x1B\[[0-9;]*m/g, '');
  const padding = BOX_WIDTH - visible.length - 2;
  return text + ' '.repeat(Math.max(0, padding));
}

function topRule(): string { return BORDER('  ╔' + '═'.repeat(BOX_WIDTH) + '╗'); }
function botRule(): string { return BORDER('  ╚' + '═'.repeat(BOX_WIDTH) + '╝'); }
function hRule():   string { return BORDER('  ╠' + '═'.repeat(BOX_WIDTH) + '╣'); }
function row(content: string): string {
  return BORDER('  ║ ') + pad(content) + BORDER(' ║');
}
function emptyRow(): string {
  return BORDER('  ║') + ' '.repeat(BOX_WIDTH) + BORDER('║');
}

export function registerPushCommand(program: Command): void {
  program
    .command('push <message>')
    .description('Stage all changes, commit, and push to remote')
    .option('--no-stage', 'Skip staging (commit only tracked changes)')
    .option('-b, --branch <name>', 'Push to a specific branch')
    .action(async (message: string, options: { stage?: boolean; branch?: string }) => {
      const git = simpleGit(process.cwd());

      // ─── CHECK IF GIT REPO ───
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        console.log('');
        console.log(ERROR('  ❌ Not a git repository.'));
        console.log(MUTED('  Run this command from inside a git project.'));
        console.log('');
        return;
      }

      const spinner = ora({
        text: INFO('  Preparing commit...'),
        spinner: 'dots',
      }).start();

      try {
        // ─── CHECK STATUS ───
        const status = await git.status();

        if (status.files.length === 0) {
          spinner.stop();
          console.log('');
          console.log(WARNING('  ⚠️  Nothing to commit. Working tree is clean.'));
          console.log('');
          return;
        }

        // ─── STAGE ───
        if (options.stage !== false) {
          spinner.text = INFO(`  Staging ${status.files.length} file(s)...`);
          await git.add('.');
        }

        // ─── COMMIT ───
        spinner.text = INFO('  Committing...');
        const commitResult = await git.commit(message);
        const commitHash = commitResult.commit ? commitResult.commit.slice(0, 7) : 'unknown';

        // ─── PUSH ───
        spinner.text = INFO('  Pushing to remote...');
        const currentBranch = options.branch || (await git.branchLocal()).current;

        try {
          await git.push('origin', currentBranch);
        } catch (pushError: any) {
          if (pushError.message?.includes('no upstream') || pushError.message?.includes('has no upstream')) {
            await git.push(['--set-upstream', 'origin', currentBranch]);
          } else {
            throw pushError;
          }
        }

        spinner.stop();

        // ─── SUCCESS CARD ───
        console.log('');
        console.log(topRule());
        console.log(row(SUCCESS('✅  Pushed successfully')));
        console.log(hRule());
        console.log(row(MUTED('▸ Commit:  ') + chalk.white(commitHash)));
        console.log(row(MUTED('▸ Branch:  ') + chalk.white(currentBranch)));
        console.log(row(MUTED('▸ Message: ') + chalk.white(message)));
        console.log(row(MUTED('▸ Files:   ') + chalk.white(`${status.files.length} changed`)));

        if (status.files.length <= 10) {
          console.log(hRule());
          for (const file of status.files) {
            const icon = file.index === '?' ? '➕' : file.index === 'D' ? '🗑️' : '✏️';
            console.log(row(MUTED(`  ${icon} ${file.path}`)));
          }
        } else {
          console.log(hRule());
          console.log(row(MUTED(`  ${status.created.length} added, ${status.modified.length} modified, ${status.deleted.length} deleted`)));
        }

        console.log(emptyRow());
        console.log(botRule());
        console.log('');

      } catch (error: any) {
        spinner.stop();
        console.log('');
        console.log(ERROR(`  ❌ Push failed: ${error.message}`));

        if (error.message?.includes('Authentication failed') || error.message?.includes('could not read Username')) {
          console.log(MUTED('  Make sure your git credentials are configured.'));
          console.log(MUTED('  Run: git config --global credential.helper store'));
        }

        if (error.message?.includes('conflict') || error.message?.includes('rejected')) {
          console.log(MUTED('  There may be remote changes. Try: git pull --rebase'));
        }

        console.log('');
      }
    });
}