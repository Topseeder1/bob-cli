export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  accent: string;
  border: string;
}

/**
 * @description Default color palette definitions.
 * This structure defines the contract for all themes across the application.
 */
export const defaultTheme: ThemeColors = {
  primary: "#007bff",    // Blue for main actions
  secondary: "#6c757d",  // Gray for secondary elements
  background: "#f8f9fa", // Light background
  text: "#212529",      // Dark text
  accent: "#ffc107",    // Yellow/Gold for highlights
  border: "#dee2e6",    // Subtle separator line
};

/**
 * @description Represents the overall theme contract, linking colors to a unique identifier.
 */
export interface ThemeConfig {
    name: string;
    colors: ThemeColors;
}