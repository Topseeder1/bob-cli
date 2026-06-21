/**
 * @fileoverview Centralized definitions, default configurations, and parsing logic for system themes.
 * This module establishes the canonical contract for all theme representations used across the application.
 */

import { deepmerge } from 'deepmerge';

/**
 * Defines the comprehensive configuration interface for any themed component or part of the UI.
 * Adherence to this contract is mandatory for type safety and maintainability.
 */
export interface ThemeConfig {
    /** Primary action color (e.g., buttons, active states). */
    primary: string;
    /** Secondary/accent color (used for subtle highlights or secondary actions). */
    secondary: string;
    /** Background color of the main surface area. */
    background: string;
    /** Text color used for primary content. */
    text: string;
    /** Color used for borders and separators. */
    border: string;
    /** Font stack for general UI text elements. */
    fontFamily?: string;
    /** Base spacing unit (e.g., 8px). */
    spacingUnit?: number;

    // Optional extensions can be added here as the system grows, maintaining clarity.
}


/**
 * Factory method to create a standardized dark theme configuration.
 * This sets the contract for our primary dark mode implementation.
 */
export const defaultDark: ThemeConfig = {
    primary: '#4A90E2',      // A clear blue accent
    secondary: '#6B7D88',    // Muted gray/blue for subtle depth
    background: '#1e1e1e',   // Dark surface color
    text: '#eeeeee',         // Off-white text for readability
    border: '#3c3c3c',       // Subtle border separation
};

/**
 * Factory method to create a standardized light theme configuration.
 * This sets the contract for our primary light mode implementation.
 */
export const defaultLight: ThemeConfig = {
    primary: '#007AFF',      // Standard iOS/web blue accent
    secondary: '#cccccc',    // Light gray for subtle depth
    background: '#ffffff',   // Pure white background surface
    text: '#333333',         // Deep dark text
    border: '#dddddd',       // Subtle border separation
};


/**
 * A map containing all defined, named themes.
 * This acts as the source of truth for available configurations.
 */
export const THEME_MAP = {
    dark: defaultDark,
    light: defaultLight,
};


/**
 * Parses and retrieves a theme configuration based on name or merged dictionary.
 * @param identifier - The canonical name of the desired theme (e.g., 'dark', 'light').
 * @param customConfig - Optional, partial configuration object to override defaults.
 * @returns A fully formed ThemeConfig object. If the identifier is unknown, falls back gracefully.
 */
export function getTheme(identifier: string, customConfig?: Partial<ThemeConfig>): ThemeConfig {
    const baseTheme = THEME_MAP[identifier] || defaultLight; // Fallback to light if name is invalid

    if (customConfig) {
        // Use deepmerge to merge the specified defaults with any runtime customizations.
        return deepmerge(baseTheme, customConfig);
    }
    
    return baseTheme;
}

/**
 * Retrieves all defined themes by their canonical names.
 * @returns An object mapping theme names (strings) to their ThemeConfig objects.
 */
export function getAllThemes(): Readonly<Record<string, ThemeConfig>> {
    // Return a deep copy or frozen map to ensure external modifications don't affect the source of truth.
    return Object.freeze({ ...THEME_MAP });
}


/* 
Example Usage Notes:
1. To get the dark theme: `const darkTheme = getTheme('dark');`
2. To override spacing for the light theme: 
   `const customTheme = getTheme('light', { spacingUnit: 10 });`
3. To check all available themes: `const allThemes = getAllThemes();`
*/

// Note on implementation contract enforcement:
// Using 'deepmerge' from 'deepmerge' library (assuming it is installed) ensures that partial overrides are applied correctly without losing core properties defined in the baseTheme object.