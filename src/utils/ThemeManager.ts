/**
 * @fileoverview Defines interfaces and utilities for theming system-level components, 
 * specifically focusing on standardizing console log output colors based on defined themes.
 * 
 * This module ensures that all colorized logging adheres to explicit contracts, 
 * preventing ad-hoc styling throughout the codebase.
 */

/**
 * Represents standard ANSI color codes. 
 * For a production system, these should ideally be managed by a dedicated terminal library, 
 * but for simplicity and direct control, we use constants here.
 */
const Color = {
    RESET: '\x1b[0m',
    RED_LIGHT: '\x1b[31m', // Bright Red
    GREEN_LIGHT: '\x1b[32m', // Green
    BLUE_LIGHT: '\x1b[34m',  // Blue
    YELLOW_LIGHT: '\x1b[33m' // Yellow/Info
};

/**
 * Defines the color palette structure for a given theme. 
 * Only keys used by logging functions should be implemented.
 */
export interface ThemeColors {
    success?: string;
    error?: string;
    info?: string;
    warning?: string;
}

/**
 * Global definition of available themes and their respective color contracts.
 * This serves as the single source of truth for theme-aware logging styles.
 */
export const ThemePalette: Record<'light' | 'dark', ThemeColors> = {
    /**
     * Defines colors optimized for light mode interfaces/terminals.
     */
    light: {
        success: Color.GREEN_LIGHT,
        error: Color.RED_LIGHT,
        info: Color.BLUE_LIGHT,
        warning: Color.YELLOW_LIGHT,
    },
    /**
     * Defines colors optimized for dark mode interfaces/terminals. 
     * Note: Real-world implementation might require changing the color codes themselves (e.g., using lighter blues).
     */
    dark: {
        success: '\x1b[32m', // Keeping standard ANSI, but mentally mapping to 'bright' on dark bg
        error: '\x1b[91m',  // Using brighter red for contrast
        info: '\x1b[94m',   // Brighter blue
        warning: '\x1b[93m', // Brighter yellow
    }
};


/**
 * Applies console styling based on a theme contract.
 * @param text The message content to log.
 * @param colors The specific color palette derived from the current theme.
 * @returns A string containing the colored, formatted output block (including reset).
 */
export function styleLog(text: string, colors: ThemeColors): string {
    const lines = [
        `${colors.info ? colors.info + '[INFO]': ''} ${text}`, 
        `${colors.success ? colors.success + '[SUCCESS]': ''} ${text}`, 
        `${colors.error ? colors.error + '[ERROR]': ''} ${text}`
    ].filter(Boolean);

    // Since we can't easily format arbitrary lines with varied styles in one go,
    // this function returns the styled segment for flexibility.
    return lines.join('\n');
}


/**
 * Logs a message indicating success using the specified theme.
 * @param text The success message content.
 * @param colors The color palette to use (e.g., from ThemePalette['light']).
 */
export function logSuccess(text: string, colors: ThemeColors): void {
    console.log(`${colors.success || ''}${text}${Color.RESET}`);
}

/**
 * Logs a message indicating failure or error using the specified theme.
 * @param text The error message content.
 * @param colors The color palette to use (e.g., from ThemePalette['dark']).
 */
export function logError(text: string, colors: ThemeColors): void {
    console.error(`${colors.error || ''}${text}${Color.RESET}`);
}

/**
 * Logs a general informational message using the specified theme.
 * @param text The info content.
 * @param colors The color palette to use (e.g., from ThemePalette['light']).
 */
export function logInfo(text: string, colors: ThemeColors): void {
    console.log(`${colors.info || ''}${text}${Color.RESET}`);
}

/**
 * Retrieves the defined theme contract for a specific environment or user preference.
 * @param themeName The name of the theme ('light' or 'dark').
 * @returns The structured color palette, or null if the theme is undefined.
 */
export function getThemeContract(themeName: 'light' | 'dark'): ?ThemeColors {
    return ThemePalette[themeName];
}