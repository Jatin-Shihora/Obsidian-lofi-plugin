// Import necessary types and classes from obsidian and local modules
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, normalizePath, TFolder, TFile } from 'obsidian';

// Import interfaces and defaults
import { LofiPluginSettings } from './types';
import { DEFAULT_LOFI_SETTINGS } from './defaults';

// Import component classes
import { SampleModal } from './modal'; // Assuming SampleModal is exported
import { LofiSettingTab } from './settings-tab'; // Assuming LofiSettingTab is exported


// Main Plugin class
export default class LofiPlugin extends Plugin {
	settings: LofiPluginSettings; // Holds the plugin's settings (type imported from types.ts)
	private audioPlayer: HTMLAudioElement | null = null; // HTML Audio element for playback
    private statusBarItemEl: HTMLElement | null = null; // Status bar element reference
    public playlist: string[] = []; // Array to store vault paths of audio files (Public for Settings Tab access)
    private currentTrackIndex: number = -1; // State variable to track the index of the currently loaded/playing track

	// Called when the plugin is enabled
	async onload() {
		await this.loadSettings(); // Load plugin settings from data.json

		console.log('Loading Obsidian Lofi Plugin'); // Log plugin loading

		// Create the HTML Audio element that will handle playback
		this.audioPlayer = new Audio();

		// Set initial volume from settings AFTER loading settings
		this.setVolume(this.settings.volume);

        // Trigger initial folder scan on load if a folder path is set in settings
        if (this.settings.audioFolderPath) {
            // Normalize the path from settings before scanning to handle different OS path formats
            const normalizedPath = normalizePath(this.settings.audioFolderPath);
            // Use await because scanAudioFolder is an async method
            await this.scanAudioFolder(normalizedPath);
        } else {
             // Update status bar immediately if no audio folder path is configured
             this.updateStatusBar('Lofi: No folder set');
        }

        // After potential scan, set the initial audio source if the playlist is not empty
        // This will load the first track found when the plugin loads or the setting is initially valid.
        if (this.playlist.length > 0 && this.audioPlayer) {
             // If playlist has items, ensure currentTrackIndex is set (defaulting to 0 if it's -1)
             if (this.currentTrackIndex === -1 || this.currentTrackIndex >= this.playlist.length) {
                 this.currentTrackIndex = 0;
             }
             const initialTrackVaultPath = this.playlist[this.currentTrackIndex];
             // Use Obsidian's adapter to get the webview-accessible app:// path from the vault path
             const initialTrackAppPath = this.app.vault.adapter.getResourcePath(initialTrackVaultPath);
             this.audioPlayer.src = initialTrackAppPath; // Set the audio source

             console.log('Set initial audio source from playlist:', initialTrackAppPath);

             // Update status bar to show the initial track is ready to play
             // Extract just the filename from the vault path for display
             const initialTrackName = initialTrackVaultPath.split('/').pop() || 'Unknown Track';
             this.updateStatusBar(`Lofi Ready || ${initialTrackName}`);
        } else if (!this.settings.audioFolderPath){
             // If no folder path was set initially, status is already 'No folder set'.
        }
        else { // Path was set, but scanAudioFolder found no MP3 files
             console.warn('No audio files found in the specified folder.');
             this.updateStatusBar('Lofi: No files found');
        }


		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('music', 'Toggle Lofi Playback', (evt: MouseEvent) => {
			// --- Ribbon Icon Click Handler Logic ---
			// Check if the audio player instance exists
			if (!this.audioPlayer) {
				new Notice('Audio player not initialized.');
				return;
			}

            // Before attempting to play/pause, check if a track is loaded and playable
            // Check if src is set, is not the default window URL, if the playlist is not empty, and if currentTrackIndex is valid
            const isTrackLoaded = this.audioPlayer.src && this.audioPlayer.src !== window.location.href;
            const isPlaylistReady = this.playlist.length > 0 && this.currentTrackIndex !== -1 && this.currentTrackIndex < this.playlist.length;


            if (!isTrackLoaded || !isPlaylistReady) {
                 new Notice('No Lofi track loaded. Check settings and folder.');
                 if (!this.settings.audioFolderPath || this.playlist.length === 0) {
                     console.warn('Audio folder not set or playlist is empty.');
                     this.updateStatusBar('Lofi: No files/folder');
                 } else if (this.currentTrackIndex === -1 || this.currentTrackIndex >= this.playlist.length) {
                      console.warn('Playlist is ready, but no valid track index is set.');
                     this.updateStatusBar('Lofi: Index Error');
                 } else {
                      console.warn('Audio source is not set correctly.');
                      this.updateStatusBar('Lofi: Source Error');
                 }
                 return; // Exit the handler if no track is properly loaded
            }

            // Get the name of the current track for status updates using currentTrackIndex
            const currentTrackPath = this.playlist[this.currentTrackIndex];
            const currentTrackName = currentTrackPath.split('/').pop() || 'Unknown Track'; // Extract filename from path


			// Check if the audio is currently paused
			if (this.audioPlayer.paused) {
				// If paused, attempt to play
				this.audioPlayer.play()
					.then(() => {
						// This block runs if play() is successful
						new Notice('Lofi playing...');
                        this.updateStatusBar(`Playing: ${currentTrackName}`); // Update status bar on play success
					})
					.catch(error => {
						// This block runs if play() fails (e.g., user gesture required, format error)
						console.error('Error playing audio (after play()):', error);
						new Notice('Failed to play Lofi audio after calling play(). Check console for details.');
                        this.updateStatusBar('Lofi Play Error 😢'); // Update status bar on play error
					});
			} else {
				// If not paused (i.e., playing), pause it
				this.audioPlayer.pause();
				new Notice('Lofi paused.');
                this.updateStatusBar(`Lofi Paused || ${currentTrackName}`); // Update status bar on pause
			}
             // --- End Ribbon Icon Click Handler Logic ---
		});
		ribbonIconEl.addClass('lofi-plugin-ribbon-icon'); // Add a custom CSS class for styling the ribbon icon


		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// Store the reference to the status bar element so we can update its text later
		this.statusBarItemEl = this.addStatusBarItem();
		// Set an initial status bar text. This will be updated after the folder scan completes.
		this.updateStatusBar('Lofi Ready');


		// This adds a command that can be triggered anywhere via the Command Palette (Cmd/Ctrl+P)
		this.addCommand({
			id: 'lofi-plugin-toggle-playback', // Unique identifier for the command
			name: 'Toggle Lofi Playback', // User-friendly name in Command Palette
			callback: () => {
				// Trigger the same logic as the ribbon icon click
				const ribbonCallback = ribbonIconEl.onclick; // Get the click handler function
				if (ribbonCallback) {
                    ribbonCallback(new MouseEvent('click')); // Execute the click handler, pass a dummy MouseEvent
                }
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		// Register our custom settings tab class, imported from settings-tab.ts
		this.addSettingTab(new LofiSettingTab(this.app, this));

        // console.log('loading plugin'); // Removed redundant log as onload log is above
	}

	// Called when the plugin is disabled (e.g., user disables it, Obsidian closes)
	onunload() {
		console.log('Unloading Obsidian Lofi Plugin'); // Log plugin unloading
        this.updateStatusBar('Lofi Unloaded'); // Update status bar to indicate unloading state

		// Clean up the audio player to stop playback and release resources
		if (this.audioPlayer) {
			this.audioPlayer.pause(); // Stop playback immediately
			this.audioPlayer.src = ''; // Clear the audio source
			// If the audio element was explicitly added to the DOM (e.g., in a view or modal), remove it here if necessary.
			this.audioPlayer = null; // Clear the reference to the audio player instance
		}

        // Clear references to UI elements and data that belong to this plugin instance
        this.statusBarItemEl = null; // Clear status bar reference
        this.playlist = []; // Clear the playlist
        this.currentTrackIndex = -1; // Reset track index
	}

	// --- Plugin Core Methods ---

    // Async method to load plugin settings from Obsidian's data.json file
	async loadSettings() {
		// Read data from storage. If the file doesn't exist or is empty, loadData() returns null or undefined.
		const data = (await this.loadData()) || {}; // Use || {} to ensure `data` is always an object

		// Merge loaded data with default settings.
		// Object.assign creates a new object. Properties from 'data' overwrite properties from 'DEFAULT_LOFI_SETTINGS'.
		// This is important for handling new settings added in future plugin versions.
		// We import DEFAULT_LOFI_SETTINGS from defaults.ts
		this.settings = Object.assign({}, DEFAULT_LOFI_SETTINGS, data);
	}

    // Async method to save the current plugin settings to Obsidian's data.json file
	async saveSettings() {
		// Save the current settings object (`this.settings`) to disk
		await this.saveData(this.settings);
	}

    // Private helper method to update the text displayed in the status bar item
    private updateStatusBar(text: string) {
        // Check if the status bar element reference exists before trying to set text
        if (this.statusBarItemEl) {
            this.statusBarItemEl.setText(text);
        }
    }

    // Public method to set the audio player volume
    // This is called from the settings tab and potentially other places
    // Accepts a volume level from 0 to 100 (inclusive)
    public setVolume(volume: number) {
        if (this.audioPlayer) {
            // Clamp the input volume value to be within the acceptable range [0, 100]
            const clampedVolume = Math.max(0, Math.min(100, volume));
            // HTML audio volume is a float between 0.0 and 1.0. Convert the 0-100 input.
            this.audioPlayer.volume = clampedVolume / 100;
            console.log(`Lofi volume set to ${clampedVolume}%`);
            // Optional: Add logic here to visually indicate the volume level (e.g., in the status bar or a separate UI element)
        }
    }

    // Public async method to scan the specified folder path for MP3 files
    // This method is called from onload and from the settings tab when the folder setting changes.
    // It populates the 'playlist' property.
    public async scanAudioFolder(folderPath: string) {
        this.playlist = []; // Start with an empty playlist

        // Normalize the folder path provided as input. This helps handle paths consistently across different OS.
        const normalizedFolderPath = normalizePath(folderPath);

        // Check if the normalized path is empty or just the vault root symbol.
        // We consider an empty or root path as "no valid folder set" for audio files.
        if (!normalizedFolderPath || normalizedFolderPath === '/') {
            console.log('No valid audio folder path specified.');
            this.updateStatusBar('Lofi: No folder set');
             // Clear the audio player source if the path is cleared
             if (this.audioPlayer) {
                this.audioPlayer.src = '';
             }
             this.currentTrackIndex = -1; // Reset index if folder is cleared
            return; // Exit the function if the path is invalid or empty
        }

        try {
            // Get the abstract file object from the vault based on the normalized path.
            // This can return a TFile, TFolder, or null if the path doesn't exist.
            const folder = this.app.vault.getAbstractFileByPath(normalizedFolderPath);

            // Check if the retrieved object is actually a folder (an instance of TFolder)
            if (folder instanceof TFolder) {
                // Iterate through all children (files and subfolders) within the specified folder
                for (const file of folder.children) {
                    // Check if the item is a file (TFile) AND its extension is 'mp3' (case-insensitive)
                    if (file instanceof TFile && file.extension.toLowerCase() === 'mp3') {
                        this.playlist.push(file.path); // Add the file's vault path to our playlist array
                        console.log(`Found MP3 file: ${file.path}`);
                    }
                }
                console.log(`Finished scanning. Found ${this.playlist.length} MP3 files.`);
                // Update the status bar to show the number of files found
                this.updateStatusBar(`Lofi: ${this.playlist.length} files found`);

                // After scan, update currentTrackIndex. If playlist has items, default to index 0.
                if (this.playlist.length > 0) {
                     this.currentTrackIndex = 0;
                     // Update audio source if player exists and is paused
                     if (this.audioPlayer && this.audioPlayer.paused) {
                         const firstTrackVaultPath = this.playlist[this.currentTrackIndex];
                         // Convert the vault path to a webview-accessible app:// path using getResourcePath
                         const firstTrackAppPath = this.app.vault.adapter.getResourcePath(firstTrackVaultPath);
                         this.audioPlayer.src = firstTrackAppPath; // Set the audio player's source
                         console.log('Set audio source to first track after scan:', firstTrackAppPath);
                         const firstTrackName = firstTrackVaultPath.split('/').pop() || 'Unknown Track'; // Extract filename
                          this.updateStatusBar(`Lofi Ready || ${firstTrackName}`);
                     } else if (this.audioPlayer && !this.audioPlayer.paused) {
                          // If audio is already playing, don't interrupt its playback source,
                          // but update the currentTrackIndex to point to the first item in the new playlist.
                          // The user would need to pause/play or use navigation controls to switch.
                          console.log(`Audio already playing. Found ${this.playlist.length} tracks. Set index to 0 for new playlist.`);
                     }

                } else { // Playlist is empty
                     if (this.audioPlayer) {
                        this.audioPlayer.src = ''; // Clear source
                     }
                     this.currentTrackIndex = -1; // Reset index
                     this.updateStatusBar('Lofi: No files found');
                }

            } else {
                // If the path exists but is not a folder (e.g., a file), or the path is null
                console.error('The specified path is not a valid folder:', normalizedFolderPath);
                // Provide a user-friendly notice using the original input path
                new Notice(`Error: "${folderPath}" is not a valid folder.`);
                this.updateStatusBar('Lofi: Invalid folder'); // Update status bar
                 // Clear player source if the path is invalid
                 if (this.audioPlayer) {
                    this.audioPlayer.src = '';
                 }
                 this.currentTrackIndex = -1;
            }

        } catch (error) {
            // Catch any errors that occur during file system operations (e.g., permissions, path doesn't exist)
            console.error('Error scanning audio folder:', error);
            new Notice(`Error scanning folder "${folderPath}". Check console for details.`); // User notice
            this.updateStatusBar('Lofi: Scan Error'); // Update status bar
             // Clear player source on scan error
             if (this.audioPlayer) {
                this.audioPlayer.src = '';
             }
             this.currentTrackIndex = -1;
        }
    }

    // Public method to play a specific track by its vault path.
    // This is called from the settings tab when a track in the list is clicked.
    public playTrackByPath(trackVaultPath: string): void {
        // Basic checks
        if (!this.audioPlayer || this.playlist.length === 0) {
             new Notice('Cannot play track: Audio player not ready or playlist is empty.');
             return;
        }

        // Find the index of the clicked track's vault path in the current playlist
        const index = this.playlist.indexOf(trackVaultPath);

        if (index === -1) {
             console.error('Attempted to play track not found in playlist:', trackVaultPath);
             new Notice('Error: Selected track not found in playlist.');
             this.updateStatusBar('Lofi: Track Error');
             return; // Exit if the track path isn't in the current playlist
        }

        // Update the current track index state variable to the index of the selected track
        this.currentTrackIndex = index;

        // Get the webview-accessible app:// path for the selected track
        const trackAppPath = this.app.vault.adapter.getResourcePath(trackVaultPath);

        // Set the audio player's source to the selected track's app:// path
        this.audioPlayer.src = trackAppPath;

        // Attempt to play the audio. play() returns a Promise.
        this.audioPlayer.play()
             .then(() => {
                  // This block executes if the play attempt is successful
                  const trackName = trackVaultPath.split('/').pop() || 'Unknown Track'; // Extract filename
                  new Notice(`Playing: ${trackName}`); // Show a notice
                  this.updateStatusBar(`Playing: ${trackName}`); // Update status bar
                  // Note: The settings tab needs to visually update the playing track highlight if it's open
                  // This happens via the updateTrackListPlayingState method called from the settings tab click handler.
             })
             .catch(error => {
                  // This block executes if the play attempt fails (e.g., user gesture required, media element error)
                  console.error('Error playing selected track:', error);
                  new Notice(`Failed to play "${trackVaultPath.split('/').pop()}". Check console for details.`);
                  this.updateStatusBar('Lofi: Playback Error'); // Update status bar to show error
             });
    }


    // Public method to get the current track index in the playlist
    // Returns the index of the currently loaded track. Returns -1 if no track is loaded.
    public getCurrentTrackIndex(): number { // Public for Settings Tab access
        return this.currentTrackIndex;
    }

	// Helper method for random numbers (unused currently, but could be useful for shuffle)
	getRandomNumber(min: number = 10000, max: number = 99999) {
		return Math.floor(Math.random() * (max - min) + min);
	}
}