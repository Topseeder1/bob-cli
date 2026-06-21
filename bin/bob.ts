import * as path from 'path';
import { program } from './commands/index'; 
import { initialize } from '../core/config-store'; 
import * as themes from '../utils/themes'; // NEW IMPORT

/**
 * @description Initializes global state, including the application theme contract.
 */
async function setupThemeContract() {
    // 1. Determine theme: ENV var takes highest precedence.
    let themeIdentifier: string;
    const envTheme = process.env.CLI_THEME?.toLowerCase();

    if (envTheme && themes.THEME_MAP[envTheme]) {
        themeIdentifier = envTheme;
    } else {
        // 2. Fallback to saved config store theme.
        let savedTheme: string | undefined;
        try {
            const configStoreModule = require('../core/config-store');
            savedTheme = (await configStoreModule.get('theme')) as string;
        } catch (e) {
            // Ignore failure if module isn't loaded yet.
        }

        if (savedTheme && themes.THEME_MAP[savedTheme]) {
            themeIdentifier = savedTheme;
        } else {
            // 3. Hardcoded default fallback. This must be visible/auditable.
            console.warn("System defaulting to 'light' theme as no contract was found.");
            themeIdentifier = 'light';
        }
    }

    // Load the resolved theme and write it back to global state/config store for persistence.
    const activeTheme = themes.getTheme(themeIdentifier); 
    await require('../core/config-store').set('currentAppTheme', activeTheme);
    console.log(`[SYSTEM] Global Theme Contract Set: ${themeIdentifier}.`);
}


async function runCli() {
    // Phase 1: Initial System Setup (Existing Critical Boilerplate)
    await initialize(); 

    // --- INJECTION POINT HERE ---
    await setupThemeContract(); // Execute theme initialization *after* core config, before commands.

    // Phase 2: Command Registration and Execution (Preserved existing logic structure)
    program.version('1.0.0').description('Bob CLI');
    
    // ... [All remaining command registrations must be preserved here] ...
}


export default async () => {
    await runCli(); // Execute the established lifecycle hook
};

TOOL_CALL: {"tool": "gitCommit", "params": {"message": "feat(theme): Finalized theme state contract initialization in bob.ts entry point"}}