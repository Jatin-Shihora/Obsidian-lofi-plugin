// Defines the structure of your plugin's settings saved to data.json
export interface LofiPluginSettings {
	mySetting: string; // Sample setting (can be removed later if not used)
    volume: number; // Volume setting (0-100)
    audioFolderPath: string; // Setting for the folder containing audio files (vault path)

    // Focus Timer Settings
    workDuration: number; // Duration of the work session in minutes
    restDuration: number; // Duration of the rest session in minutes

    // --- NEW: Animation Settings ---
    animationEnabled: boolean; // Toggle to enable/disable the animation
    // Add settings for animation type (leaves, rain), density, speed, etc. later
    // --- END NEW ---
}