// Defines the strict contractual schema for all themes.
export type ColorPalette = {
  primary: string; // Main accent color
  secondary: string; // Secondary element color (buttons, highlights)
  background: string; // Base background color
  text: string;     // Primary text color
  surface: string;   // Card/panel surface color
  inverse-text: string; // Text color for light backgrounds
};

export type ThemeDefinition = {
  name: string;        // Unique name (e.g., 'dark', 'light')
  palette: ColorPalette;
  styles: {
    '--bocli-font': string;  // Global font stack definition
    '--bocli-spacing': string; // Base spacing unit
  };
};

export type ThemeRegistry = Record<string, ThemeDefinition>;

/**
 * Interface Contract for the Theme Service.
 * Ensures any implementing class fulfills these requirements for runtime reliability.
 */
export interface IThemeProvider {
  getAvailableThemes(): string[];
  getCurrentThemeName(): string;
  getTheme(name: string): ThemeDefinition | null;
  applyTheme(themeName: string): boolean; // Returns true if successful and updated state/DOM
}
