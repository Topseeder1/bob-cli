// File: src/commands/login.ts

import { Command } from 'commander';
import chalk from 'chalk';
import http from 'http';
import open from 'open';
import axios from 'axios';
import { URL } from 'url';
import * as readline from 'readline';
import { setConfigValue } from '../core/config-store.js';
import { setActiveConversationId } from '../core/project-map.js';

const CLI_AUTH_URL = 'https://bobs-workshop.web.app/cli-auth';
const CALLBACK_PORT = 9876;
const FIREBASE_API_KEY = 'AIzaSyB-hUZEonRIzbExVDwuneJaDjJZBvHdIps';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with Bob\'s Workshop via browser')
    .action(async () => {
      console.log('');
      console.log(chalk.bold.cyan('  🔐 Bob CLI — Login'));
      console.log(chalk.gray('  ─────────────────────────────────────'));
      console.log('');

      // ─── ACKNOWLEDGMENT PROMPT ───
      console.log(chalk.yellow('  ⚠️  Important:'));
      console.log(chalk.gray('  • Local conversations (Tier 1) will NOT sync to the platform.'));
      console.log(chalk.gray('  • Only NEW conversations created after login will save to Firebase.'));
      console.log(chalk.gray('  • Your local history stays in ~/.bob/projects/ (backup via `bob backup`).'));
      console.log(chalk.gray('  • Logging in upgrades you to Tier 3 (Platform) with full features.'));
      console.log('');

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const answer = await new Promise<string>(resolve => {
        rl.question(chalk.cyan('  Continue with login? (y/n): '), resolve);
      });

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        rl.close();
        console.log('');
        console.log(chalk.gray('  Login cancelled.'));
        console.log('');
        return;
      }

      // ─── SOVEREIGNTY CONSENT GATE ───
      console.log('');
      console.log(chalk.hex('#455A64')('  ╔' + '═'.repeat(54) + '╗'));
      console.log(chalk.hex('#455A64')('  ║') + chalk.hex('#FFAB00')('  📋 Before connecting to Bob\'s Workshop:        ') + chalk.hex('#455A64')('  ║'));
      console.log(chalk.hex('#455A64')('  ╠' + '═'.repeat(54) + '╣'));
      console.log(chalk.hex('#455A64')('  ║') + '                                                        ' + chalk.hex('#455A64')('║'));
      console.log(chalk.hex('#455A64')('  ║') + chalk.hex('#66BB6A')('  ✅ What syncs:  ') + chalk.white('Conversation context + behavioral profile') + ' ' + chalk.hex('#455A64')('║'));
      console.log(chalk.hex('#455A64')('  ║') + chalk.hex('#EF5350')('  ❌ Never syncs: ') + chalk.white('Your source code (stays on your machine) ') + ' ' + chalk.hex('#455A64')('║'));
      console.log(chalk.hex('#455A64')('  ║') + chalk.hex('#EF5350')('  ❌ No telemetry, no silent uploads, no gray areas.  ') + chalk.hex('#455A64')('  ║'));
      console.log(chalk.hex('#455A64')('  ║') + '                                                        ' + chalk.hex('#455A64')('║'));
      console.log(chalk.hex('#455A64')('  ║') + chalk.gray('  Return to local-only anytime with `bob logout`.     ') + chalk.hex('#455A64')('  ║'));
      console.log(chalk.hex('#455A64')('  ║') + '                                                        ' + chalk.hex('#455A64')('║'));
      console.log(chalk.hex('#455A64')('  ╚' + '═'.repeat(54) + '╝'));
      console.log('');

      const consentAnswer = await new Promise<string>(resolve => {
        rl.question(chalk.cyan('  Confirm sync consent? (y/n): '), resolve);
      });
      rl.close();

      if (consentAnswer.toLowerCase() !== 'y' && consentAnswer.toLowerCase() !== 'yes') {
        console.log('');
        console.log(chalk.gray('  Login cancelled. You remain on Tier 1 (local-first).'));
        console.log('');
        return;
      }

      console.log('');
      console.log(chalk.gray('  Opening browser for authentication...'));
      console.log('');

      try {
        const result = await startAuthFlow();

        if (result) {
          const exchangeResult = await exchangeCustomToken(result.token);

          setConfigValue('authToken', exchangeResult.idToken);
          setConfigValue('refreshToken', exchangeResult.refreshToken);
          setConfigValue('email', result.email);
          setConfigValue('uid', result.uid);
          setConfigValue('loggedIn', true);
          setConfigValue('tier', 'platform');

          console.log('');
          console.log(chalk.green(`  ✅ Logged in as ${result.email}`));
          console.log(chalk.gray('  Tier: Platform (Tier 3)'));
          console.log(chalk.gray('  All platform features are now available.'));
          console.log('');
        }
      } catch (error: any) {
        console.log(chalk.red(`  ❌ Login failed: ${error.message}`));
        console.log('');
      }
    });

  program
    .command('logout')
    .description('Sign out and clear stored credentials')
    .action(() => {
      setConfigValue('authToken', null);
      setConfigValue('refreshToken', null);
      setConfigValue('email', null);
      setConfigValue('uid', null);
      setConfigValue('loggedIn', false);
      setConfigValue('tier', 'local');
      setConfigValue('conversationId', null);

      // ─── Clear project-scoped conversation ID on logout ───
      setActiveConversationId('', process.cwd());

      console.log('');
      console.log(chalk.gray('  👋 Logged out. Switched to Tier 1 (local-first).'));
      console.log('');
    });
}

/**
 * Exchanges a Firebase custom token for an ID token + refresh token
 * using the Firebase Auth REST API.
 */
async function exchangeCustomToken(customToken: string): Promise<{ idToken: string; refreshToken: string }> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`;

  const response = await axios.post(url, {
    token: customToken,
    returnSecureToken: true,
  });

  if (!response.data?.idToken || !response.data?.refreshToken) {
    throw new Error('Token exchange failed — no ID token returned.');
  }

  return {
    idToken: response.data.idToken,
    refreshToken: response.data.refreshToken,
  };
}

/**
 * Refreshes an expired ID token using the stored refresh token.
 * Call this when a 401 is received.
 */
export async function refreshAuthToken(refreshToken: string): Promise<string> {
  const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;

  const response = await axios.post(url, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  if (!response.data?.id_token) {
    throw new Error('Token refresh failed.');
  }

  setConfigValue('authToken', response.data.id_token);

  return response.data.id_token;
}

function startAuthFlow(): Promise<{ token: string; email: string; uid: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out after 120 seconds. Please try again.'));
    }, 120000);

    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith('/callback')) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      try {
        const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        const token = url.searchParams.get('token');
        const email = url.searchParams.get('email');
        const uid = url.searchParams.get('uid');

        if (!token || !email || !uid) {
          res.writeHead(400);
          res.end('Missing parameters');
          reject(new Error('Invalid callback — missing token, email, or uid.'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="background: #0a0a0a; color: white; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
              <div style="text-align: center;">
                <h1>✅ Authenticated!</h1>
                <p style="color: #888;">You can close this tab and return to your terminal.</p>
              </div>
            </body>
          </html>
        `);

        clearTimeout(timeout);
        server.close();
        resolve({ token, email, uid });

      } catch (e: any) {
        res.writeHead(500);
        res.end('Error');
        reject(e);
      }
    });

    server.listen(CALLBACK_PORT, () => {
      console.log(chalk.gray(`  🌐 Waiting for authentication (port ${CALLBACK_PORT})...`));
      console.log(chalk.gray('  If your browser doesn\'t open, visit:'));
      console.log(chalk.cyan(`  ${CLI_AUTH_URL}`));
      console.log('');

      open(CLI_AUTH_URL).catch(() => {});
    });

    server.on('error', (err: any) => {
      clearTimeout(timeout);
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port 9876 is already in use. Close other instances and try again.'));
      } else {
        reject(err);
      }
    });
  });
}