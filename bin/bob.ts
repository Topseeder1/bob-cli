import { initializeCommand } from '../src/commands'; 
import { themeManager } from '../src/theme/manager'; // Import the manager singleton
import * as ConfigStore from '../src/core/config-store';

async function main() {
    // --- ARCHITECTURAL INTERVENTION POINT: GLOBAL INITIALIZATION ---
    // Before processing any arguments or initializing commands, the system context must be established.
    try {
        const config = await ConfigStore.getGlobalConfig(); // Assume we can fetch a configuration object
        if (config && config.theme) {
            console.log("Initializing ThemeManager...");
            // Initialize the theme manager with configuration loaded early in the lifecycle
            themeManager.initialize({ themeName: config.theme });
        } else {
            // Fallback contract enforcement
            console.warn("Warning: Could not retrieve active theme from ConfigStore. Using default fallback.");
            themeManager.initialize({ themeName: 'default' }); 
        }
    } catch (e) {
        console.error("FATAL ERROR: Failed to initialize ThemeManager:", e);
        process.exit(1);
    }
    // --- END INTERVENTION POINT ---

    const args = process.argv.slice(2);

    if (!args || args.length === 0) {
        console.log("No command provided.");
        return;
    }

    try {
        // Pass the initialized theme manager instance to the command dispatcher
        await initializeCommand(args[0], themeManager); 
    } catch (error) {
        console.error("\nOperation failed:", error);
    }
}

main();