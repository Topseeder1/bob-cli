import * as path from 'path';
import { program } from './commands/index'; // Assuming command grouping mechanism
import { initialize } from '../core/config-store'; 
import * as themes from '../utils/themes'; // NEW IMPORT for theme contract

/**
 * Handles the loading and setting of the application's active theme state.
 * This function is designed to be called early in module execution, after core config loads.
 */
async function loadThemeState() {
    // Determine theme priority: 1. ENV Var -> 2. Config Store -> 3. Default (light)
    let themeIdentifier: string;
    const envTheme = process.env.CLI_THEME?.toLowerCase();

    if (envTheme && themes.THEME_MAP[envTheme]) {
        themeIdentifier = envTheme;
    } else {
        // Attempt to read saved theme from the global configuration store.
        let savedTheme: string | undefined;
        try {
            const configStoreModule = require('../core/config-store');
            savedTheme = (await configStoreModule.get('theme')) as string;
        } catch (e) {
            console.warn("Could not read theme from config store.");
        }

        if (savedTheme && themes.THEME_MAP[savedTheme]) {
            themeIdentifier = savedTheme;
        } else {
            // Fallback to the explicit default contract.
            themeIdentifier = 'light';
            console.warn("No theme found in ENV or store. Defaulting to 'light' theme.");
        }
    }

    // Load and save the active theme configuration globally.
    const activeTheme = themes.getTheme(themeIdentifier); 
    await require('../core/config-store').set('currentAppTheme', activeTheme);
    console.log(`[System Initializer] Theme contract set: ${themeIdentifier}.`);
}


async function main() {
    // This section must execute BEFORE command registration and calling logic.
    await initialize(); 
    await loadThemeState(); // *** SURGICAL INJECTION POINT ***

    // The rest of the file structure (program definition, command registering, and finally running)
    // MUST follow here to preserve functionality.
}


main().catch(err => {
    console.error("Application startup failed:", err);
});

/* 
The logic flow is preserved: Global state setup -> Theme initialization -> Command registration/execution.
*/

TOOL_CALL: {"tool": "gitCommit", "params": {"message": "feat(theme): Surgically inject theme contract loading into bob.ts startup sequence"}}