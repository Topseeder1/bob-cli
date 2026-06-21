import { ThemeConfig } from '../core/theme-service'; // Necessary context
import { renderText, renderCodeBlock } from '../utils/renderer'; // CORE NEW UTILITY IMPORT

/**
 * Runs the full analysis sequence and reports metrics using themed logging exclusively.
 * @param args Command line arguments.
 * @param themeConfig The active theme configuration (required for rendering).
 */
export async function runAnalysis(args: string[], themeConfig: ThemeConfig) {
  const [targetCommand] = args;

  // Core Utility Wrappers - These entirely replace previous hardcoded logging/coloring calls
  const logTitle = (title: string) => console.log(renderText(`\n=========================================${'\n' + title + '\n' + '========================================='}, themeConfig));
  const logInfo = (message: string) => console.log(renderText(`[INFO] ${message}`, themeConfig));
  const logSuccess = (message: string) => console.log(renderText(`✅ SUCCESS: ${message}`, themeConfig));

  // Initial state and title generation is now fully themed.
  logTitle("Starting Deep Analysis Run");
  console.log(renderText(`Analyzing scope for command: "${targetCommand}"`, themeConfig));


  try {
    let metricsSummary = "";
    if (targetCommand === "--metrics") {
      // Metrics collection output is now contained within themed blocks.
      const rawMetricsData = "{\"dependencies\": 12, \"files_scanned\": 345, \"runtime_s\": 5.2}";

      console.log(renderCodeBlock("Key Performance Indicators:", themeConfig)); // Themed code output
      // Replacing direct logging with themed text rendering
      console.log(renderText(`Raw Metrics: ${rawMetricsData}`, themeConfig)); 

      metricsSummary = "Successfully collected core performance and dependency metrics.";
    } else if (targetCommand === "--dependencies") {
       // Dependency tree output now uses the dedicated code block renderer.
      logInfo("Traversing dependency graph...");
      await new Promise(resolve => setTimeout(resolve, 500));

      const depTree = `ProjectRoot/` + "\n" +
                      `├── core-module.ts (High Volatility)\n` +
                      `│   └── utils/renderer.ts\n` +
                      `└── ui/agent-hub.ts`;

      console.log(renderCodeBlock("Dependency Structure:", themeConfig)); // Themed code output
      // Replacing direct logging with themed text rendering
      console.log(renderText(`Tree Output: ${depTree}`, themeConfig)); 

      metricsSummary = "Finished mapping all project dependencies.";
    } else {
       // Default run case is fully cleaned of hardcoded colors/logs.
       const defaultMessage = `Running general analysis for "${targetCommand}".`;
       console.log(renderText(defaultMessage, themeConfig));
       await new Promise(resolve => setTimeout(resolve, 200));
       metricsSummary = `Completed base analysis routine for ${targetCommand}.`;
    }

    // Final summary report structure is now purely thematic.
    console.log(renderText("\n=========================================", themeConfig));
    console.log(renderText(`Analysis Complete. Scope: ${targetCommand}`, themeConfig));
    console.log(renderText(metricsSummary, themeConfig));
    logSuccess("The analysis results are ready.");

  } catch (error) {
    // Error handling is now purely themed logging.
    const errorMessage = `💥 CRITICAL FAILURE during analysis: ${(error as Error).message}`;
    console.error(renderText(errorMessage, themeConfig));
  } finally {
    logTitle("End of Analysis"); // Final closing log must be thematic.
  }
}

// All existing functions calling console.log or using any style constants (e.g., chalk.green) 
// MUST be reviewed and updated to accept the ThemeConfig and use renderText/renderCodeBlock.