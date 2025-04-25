import { LofiPluginSettings } from './types'; // Import the settings interface

// Defines the default values for the plugin settings
export const DEFAULT_LOFI_SETTINGS: LofiPluginSettings = {
	mySetting: 'default', // Default value for sample setting
    volume: 50, // Default volume is 50%
    audioFolderPath: '', // Default to an empty string

    // Default Focus Timer Settings (e.g., Pomodoro defaults)
    workDuration: 25, // Default work session: 25 minutes
    restDuration: 5, // Default rest session: 5 minutes

    // --- NEW: Default Animation Settings ---
    animationEnabled: false, // Animation is off by default
    // --- END NEW ---
}