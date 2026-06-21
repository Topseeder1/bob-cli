// Define the core Theme Contract
export type ColorPalette = {
  primaryBackground: string; // Main background color (e.g., #282c34)
  surfaceBackground: string; // Container background, often slightly different from primaryBackground
  textPrimary: string; // Default text color
  textSecondary: string; // Subdued text (metadata, hints)
  accentColor: string; // Key interaction elements (buttons, selection highlights)
  successColor: string; 
  warningColor: string; 
  errorColor: string;
};

export type ThemeDefinition = {
  name: string; // Must be a unique, descriptive identifier (e.g., "dark", "light")
  isSystemDefault?: boolean; // Flag for which theme should load by default
  colors: ColorPalette;
  typography: {
    fontSizeBasePx: number;
    fontFamilyPrimary: string;
    lineHeightMultiplier: number; // Relative vertical spacing factor
  };
};

// Define the expected structure of a single theme object instance.
type Theme = ThemeDefinition;