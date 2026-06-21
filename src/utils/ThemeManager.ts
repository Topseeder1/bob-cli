import { Theme } from '../themes/default';
import EventEmitter from 'events';

/**
 * Defines the interface for a theme manager that handles state changes and event broadcasting.
 */
export class ThemeManager extends EventEmitter {
  private currentTheme: Readonly<typeof Theme> = Theme;
  private readonly defaultThemesPath: string = process.cwd() + '/src/themes'; // Assumption of structure

  /**
   * Initializes the ThemeManager by validating available theme contracts.
   */
  constructor() {
    super();
    // In a real system, this would dynamically discover theme modules from disk.
    // For now, we rely on explicit imports or configuration mapping.
    console.log("ThemeManager initialized. Current default contract loaded.");
  }

  /**
   * Retrieves the currently active theme object contract.
   * @returns The structured theme object.
   */
  public getCurrentTheme(): Readonly<typeof Theme> {
    return this.currentTheme;
  }

  /**
   * Switches the active theme by loading a new configuration contract.
   * This function must implement validation and persistence of state.
   * @param themeName The identifier for the desired theme (e.g., 'dark', 'high-contrast').
   * @throws Error if the requested theme cannot be found or is invalid.
   */
  public setTheme(themeName: string):
  {
    // 1. Locate the Theme contract module based on name (e.g., src/themes/${themeName}.ts).
    const dynamicThemePath = `${this.defaultThemesPath}/${themeName}`;

    try {
      // Simulate loading a module that adheres to the Theme interface.
      // In production, this is where dynamic import magic would happen.
      if (themeName === 'dark') { 
        // Assume we load and validate the dark theme contract here.
        const DarkThemeMock = { primary: "#2c3e50", secondary: "#17202b" } as unknown as typeof Theme;
        this.currentTheme = DarkThemeMock;
      } else if (themeName === 'high-contrast') {
        // Simulate loading and validation.
        const HCThemeMock = { primary: "#ffffff", secondary: "#000000" } as unknown as typeof Theme;
        this.currentTheme = HCThemeMock;
      } else if (themeName === 'default') {
          // Use the already defined default contract.
          const DefaultThemeContract = { primary: "#3498db", secondary: "#2c3e50" } as unknown as typeof Theme;
          this.currentTheme = DefaultThemeContract;
      } else {
        throw new Error(`Theme '${themeName}' contract not found.`);
      }

      const previousTheme = this.getCurrentTheme(); // Capture before change for eventing
      
      // 2. Enforce state transition via event emission.
      this.emit('themeChanged', { 
        previous: previousTheme, 
        current: this.currentTheme,
        name: themeName
      });
      console.log(`Successfully switched active theme to: ${themeName}`);
    }
    catch (e) {
      this.emit('themeError', e);
      throw new Error(`Failed to set theme '${themeName}': ${(e as Error).message}`);
    }
  }

  /**
   * Gets the list of currently supported themes.
   */
  public getSupportedThemes(): string[] {
    // This should read the directory contents, but for now, we hardcode known contracts.
    return ['default', 'dark', 'high-contrast'];
  }
}

// Export a singleton instance to guarantee singular state management globally.
export const themeManager = new ThemeManager();