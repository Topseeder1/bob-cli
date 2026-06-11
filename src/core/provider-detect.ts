import chalk from 'chalk';
import { getConfig, setConfigValue } from './config-store.js';

const SUCCESS = chalk.hex('#66BB6A');
const WARNING = chalk.hex('#FFC107');
const MUTED = chalk.hex('#78909C');
const INFO = chalk.hex('#26C6DA');
const BRAND_SECONDARY = chalk.hex('#FFAB00');

const OLLAMA_DEFAULT_ENDPOINT = 'http://127.0.0.1:11434/api/chat';
const OLLAMA_TAGS_URL = 'http://127.0.0.1:11434/api/tags';

/**
 * Attempts to detect a running Ollama instance on the default port.
 * Returns true if Ollama responds within 2 seconds.
 */
async function detectOllama(): Promise<boolean> {
  try {
    const response = await fetch(OLLAMA_TAGS_URL, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ensures a provider is configured before making an API call.
 * 
 * - If provider is already set → returns true (good to go)
 * - If user is logged in → returns true (platform provider)
 * - If Ollama is detected → auto-configures and returns true
 * - If nothing found → prints helpful error and returns false
 */
export async function ensureProvider(): Promise<boolean> {
  const config = getConfig();

  // Already have a provider configured
  if (config.provider && config.localEndpoint) {
    return true;
  }

  // Logged in — platform provider available
  if (config.loggedIn && config.authToken) {
    return true;
  }

  // No provider, not logged in — try to detect Ollama
  const ollamaRunning = await detectOllama();

  if (ollamaRunning) {
    // Auto-configure silently
    setConfigValue('provider', 'local');
    setConfigValue('localEndpoint', OLLAMA_DEFAULT_ENDPOINT);

    console.log('');
    console.log(SUCCESS('  ✅ Ollama detected. Using local model (free, private).'));
    console.log(MUTED('     Change anytime: bob config set provider <name>'));
    console.log('');

    return true;
  }

  // Nothing available — show helpful error
  console.log('');
  console.log(WARNING('  ⚠️  No AI provider configured.'));
  console.log('');
  console.log(MUTED('  For free local use:'));
  console.log(BRAND_SECONDARY('    ▸ Install Ollama: ') + INFO('https://ollama.com'));
  console.log(BRAND_SECONDARY('    ▸ Run: ') + chalk.white('ollama serve'));
  console.log(BRAND_SECONDARY('    ▸ Then: ') + chalk.white('bob chat "hello"'));
  console.log('');
  console.log(MUTED('  For platform features:'));
  console.log(BRAND_SECONDARY('    ▸ bob login'));
  console.log('');

  return false;
}