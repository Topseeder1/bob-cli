import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';

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
        console.log(chalk.red('  ❌ Not a git repository.'));
        console.log(chalk.gray('  Run this command from inside a git project.'));
        console.log('');
        return;
      }

      const spinner = ora({
        text: chalk.cyan('  Preparing commit...'),
        spinner: 'dots',
      }).start();

      try {
        // ─── CHECK STATUS ───
        const status = await git.status();

        if (status.files.length === 0) {
          spinner.stop();
          console.log('');
          console.log(chalk.yellow('  ⚠️  Nothing to commit. Working tree is clean.'));
          console.log('');
          return;
        }

        // ─── STAGE ───
        if (options.stage !== false) {
          spinner.text = chalk.cyan(`  Staging ${status.files.length} file(s)...`);
          await git.add('.');
        }

        // ─── COMMIT ───
        spinner.text = chalk.cyan('  Committing...');
        const commitResult = await git.commit(message);
        const commitHash = commitResult.commit ? commitResult.commit.slice(0, 7) : 'unknown';

        // ─── PUSH ───
        spinner.text = chalk.cyan('  Pushing to remote...');
        const currentBranch = options.branch || (await git.branchLocal()).current;

        try {
          await git.push('origin', currentBranch);
        } catch (pushError: any) {
          // If no upstream, set it
          if (pushError.message?.includes('no upstream') || pushError.message?.includes('has no upstream')) {
            await git.push(['--set-upstream', 'origin', currentBranch]);
          } else {
            throw pushError;
          }
        }

        spinner.stop();

        // ─── SUCCESS OUTPUT ───
        console.log('');
        console.log(chalk.green('  ✅ Pushed successfully'));
        console.log(chalk.gray('  ─────────────────────────────────────'));
        console.log(`  ${chalk.cyan('Commit:')}   ${commitHash}`);
        console.log(`  ${chalk.cyan('Branch:')}   ${currentBranch}`);
        console.log(`  ${chalk.cyan('Message:')}  ${message}`);
        console.log(`  ${chalk.cyan('Files:')}    ${status.files.length} changed`);
        console.log(chalk.gray('  ─────────────────────────────────────'));
        console.log('');

        // Show changed files
        if (status.files.length <= 10) {
          for (const file of status.files) {
            const icon = file.index === '?' ? '➕' : file.index === 'D' ? '🗑️' : '✏️';
            console.log(chalk.gray(`  ${icon} ${file.path}`));
          }
          console.log('');
        } else {
          console.log(chalk.gray(`  ${status.created.length} added, ${status.modified.length} modified, ${status.deleted.length} deleted`));
          console.log('');
        }

      } catch (error: any) {
        spinner.stop();
        console.log('');
        console.log(chalk.red(`  ❌ Push failed: ${error.message}`));

        if (error.message?.includes('Authentication failed') || error.message?.includes('could not read Username')) {
          console.log(chalk.gray('  Make sure your git credentials are configured.'));
          console.log(chalk.gray('  Run: git config --global credential.helper store'));
        }

        if (error.message?.includes('conflict') || error.message?.includes('rejected')) {
          console.log(chalk.gray('  There may be remote changes. Try: git pull --rebase'));
        }

        console.log('');
      }
    });
}