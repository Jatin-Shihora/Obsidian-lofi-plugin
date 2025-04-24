import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, normalizePath, TFolder, TFile, TAbstractFile } from 'obsidian'; // Ensure all necessary imports are here

// Settings interface
interface LofiPluginSettings {
	mySetting: string; // Sample setting (can be removed later if not used)
    volume: number; // Volume setting (0-100)
    audioFolderPath: string; // Setting for the folder containing audio files (vault path) - managed by browser UI

    // --- Focus Timer Settings ---
    workDuration: number; // Duration of the work session in minutes
    restDuration: number; // Duration of the rest session in minutes
    // --- End Focus Timer Settings ---
}

// Default settings
const DEFAULT_LOFI_SETTINGS: LofiPluginSettings = {
	mySetting: 'default', // Default value for sample setting
    volume: 50, // Default volume is 50%
    audioFolderPath: '', // Default to an empty string

    // --- Default Focus Timer Settings (e.g., Pomodoro defaults) ---
    workDuration: 25, // Default work session: 25 minutes
    restDuration: 5, // Default rest session: 5 minutes
    // --- End Default Focus Timer Settings ---
}

// Main Plugin class
export default class LofiPlugin extends Plugin {
	settings: LofiPluginSettings; // Holds the plugin's settings
	private audioPlayer: HTMLAudioElement | null = null; // HTML Audio element for playback
    private statusBarItemEl: HTMLElement | null = null; // Status bar element reference
    public playlist: string[] = []; // <<-- CHANGED from private to public
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
		// Register our custom settings tab class
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
    public getCurrentTrackIndex(): number { // <<-- CHANGED from private to public
        return this.currentTrackIndex;
    }

	// Helper method for random numbers (unused currently, but could be useful for shuffle)
	getRandomNumber(min: number = 10000, max: number = 99999) {
		return Math.floor(Math.random() * (max - min) + min);
	}
}

// Modal class (kept from sample template, can be renamed/modified later if needed)
// Currently not used by the plugin's logic.
class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this; // Get the content element of the modal
		contentEl.setText('Lofi Modal - (Content Coming Soon)'); // Set the text content
	}

	onClose() {
		const {contentEl} = this; // Get the content element
		contentEl.empty(); // Clear the content when modal is closed
	}
}

// Plugin Settings Tab class
// This class defines the UI that appears when the user clicks the plugin in the Obsidian Settings menu.
class LofiSettingTab extends PluginSettingTab {
	plugin: LofiPlugin; // Reference to the main plugin instance

    // State variables for the custom folder browser UI displayed within this settings tab instance
    private currentBrowsePath: string; // The vault path of the folder currently being displayed in the browser view
    private folderListEl: HTMLElement; // The HTML element that contains the list of files/folders in the browser view
    private currentPathEl: HTMLElement; // The HTML element that displays the current Browse path string
    private trackListEl: HTMLElement; // The HTML element that contains the list of found audio tracks


	constructor(app: App, plugin: LofiPlugin) {
		super(app, plugin);
		this.plugin = plugin; // Store the reference to the main LofiPlugin instance provided by Obsidian

        // Initialize the browser's starting path when the settings tab is created.
        // Use the saved audio folder path from the plugin's settings, or default to
        // an empty string ('') which represents the vault root, ensuring path is normalized.
        this.currentBrowsePath = normalizePath(this.plugin.settings.audioFolderPath || '');
	}

	// This method is called by Obsidian whenever the settings tab needs to be displayed or re-rendered.
	// It's responsible for creating and displaying all the UI elements for the settings page.
	display(): void {
		const {containerEl} = this; // Get the main container element provided by PluginSettingTab

		containerEl.empty(); // Clear any previously rendered content. This is important to prevent duplicated UI elements.

		// --- Add Main Heading ---
		containerEl.createEl('h2', {text: 'Lofi Plugin Settings'}); // Add the main heading for the settings page


		// --- Audio Settings Section ---
        containerEl.createEl('h3', {text: 'Audio Settings'}); // Heading for the Audio settings section

		// Sample Setting (can be removed if no longer used in the plugin's logic)
		new Setting(containerEl)
			.setName('Sample Setting') // Setting name displayed to the user
			.setDesc('This is a placeholder setting.') // Description text below the name
			.addText(text => text // Add a text input field
				.setPlaceholder('Enter something...') // Placeholder text in the input
				.setValue(this.plugin.settings.mySetting) // Set the input's initial value from current plugin settings
				.onChange(async (value) => { // Function called asynchronously when the input value changes
					this.plugin.settings.mySetting = value; // Update the setting in the plugin instance's memory
					await this.plugin.saveSettings(); // Save the entire settings object to disk
				}));

        // Volume Slider Setting
        new Setting(containerEl)
            .setName('Volume') // Setting name
            .setDesc('Adjust the Lofi playback volume.') // Description
            .addSlider(slider => slider // Add a slider input field
                .setLimits(0, 100, 1) // Set the slider's minimum value (0), maximum value (100), and step increment (1)
                .setValue(this.plugin.settings.volume) // Set the slider's initial position based on current settings
                .setDynamicTooltip() // Show the current slider value as a tooltip while dragging
                .onChange(async (value) => { // Function called asynchronously when the slider value changes
                    this.plugin.settings.volume = value; // Update the volume setting in memory
                    await this.plugin.saveSettings(); // Save settings to disk
                    // Immediately update the actual audio player's volume using the method on the main plugin instance
                    this.plugin.setVolume(value);
                }));

        // Custom Folder Browser UI Section for Audio Folder Location
        containerEl.createEl('h4', {text: 'Audio Folder Location'}); // Subheading for the folder browser

        // Container to hold the current path display and navigation buttons ('Up' button)
        const navContainer = containerEl.createDiv('lofi-folder-browser-nav'); // Create a div with a custom CSS class for styling

        // Element to display the current vault path the user is Browse
        // We store a reference to this element so we can update its text dynamically
        this.currentPathEl = navContainer.createEl('span', { text: 'Loading...', cls: 'lofi-browser-current-path' });

        // Button to navigate up to the parent folder
        // We store a reference to add an event listener later
        const upButton = navContainer.createEl('button', { text: 'Up', cls: 'lofi-browser-up-button' });

        // Button to select the currently displayed folder as the audio folder for the plugin
        // We store a reference to add an event listener later
        const selectButton = containerEl.createEl('button', { text: 'Select This Folder', cls: 'lofi-browser-select-button' });

        // Label indicating the list below shows folder contents
        containerEl.createEl('p', { text: 'Contents:' });

        // Container for the list of folders and files in the current Browse path.
        // We will dynamically add list item elements to this container in renderFolderContents.
        this.folderListEl = containerEl.createDiv('lofi-folder-browser-list'); // Create a div, store reference, add class

        // Initial rendering of the folder browser contents when the settings tab is opened.
        // This displays the contents of the path saved in settings or the vault root.
        this.renderFolderContents(this.currentBrowsePath);


        // Add Event Listeners for the custom UI elements in the folder browser.
        // These listeners control the navigation and selection logic.

        // Add click listener for the 'Up' button
        upButton.addEventListener('click', () => {
            // Call the navigateUp method defined within THIS (LofiSettingTab) instance
            this.navigateUp();
        });

        // Add click listener for the 'Select This Folder' button
        selectButton.addEventListener('click', async () => {
             // Call the selectCurrentFolder method defined within THIS (LofiSettingTab) instance
             await this.selectCurrentFolder();
        });

        // Note: Click listeners for individual folder items in the list (to navigate deeper)
        // are added dynamically when those folder items are created within the renderFolderContents() method.

        // --- Track List Section ---
        containerEl.createEl('h4', { text: 'Found Tracks' }); // Subheading for the list of tracks
        containerEl.createEl('p', { text: 'Click a track to play:' }); // Instruction text
        // Container for the list of found audio tracks. We will dynamically add track items here.
        this.trackListEl = containerEl.createDiv('lofi-track-list'); // Create a div, store reference, add class

        // Initial rendering of the track list when the settings tab is opened.
        // This list will be populated based on the current plugin playlist.
        this.renderTrackList();
        // --- End Audio Settings Section ---


        containerEl.createEl('hr'); // Add a horizontal rule to visually separate sections


        // --- Focus Timer Settings Section ---
        containerEl.createEl('h3', { text: 'Focus Timer Settings' }); // Heading for the Timer settings section

        // Work Duration Setting Input
        new Setting(containerEl)
            .setName('Work Duration (minutes)') // Setting name
            .setDesc('Set the duration for each focus work session.') // Description
            .addText(text => text // Add a text input field for the number
                .setPlaceholder('e.g., 25') // Placeholder text
                .setValue(this.plugin.settings.workDuration.toString()) // Set initial value from settings (convert number to string)
                .onChange(async (value) => { // Function called when input changes
                    // Attempt to parse the input string into an integer
                    const duration = parseInt(value, 10);
                    // Validate if the parsed value is a number and is positive
                    if (!isNaN(duration) && duration > 0) {
                        this.plugin.settings.workDuration = duration; // Update the setting in memory
                        await this.plugin.saveSettings(); // Save settings to disk
                        // Optional: Provide positive feedback (e.g., console log)
                        console.log('Work duration updated:', duration);
                    } else {
                        // If input is invalid, show a notice to the user
                        new Notice('Please enter a valid positive number for work duration.');
                        // Reset the input field to the last valid saved value
                        text.setValue(this.plugin.settings.workDuration.toString());
                    }
                }));

        // Rest Duration Setting Input
        new Setting(containerEl)
            .setName('Rest Duration (minutes)') // Setting name
            .setDesc('Set the duration for each short rest session.') // Description
            .addText(text => text // Add a text input field
                .setPlaceholder('e.g., 5') // Placeholder text
                .setValue(this.plugin.settings.restDuration.toString()) // Set initial value
                .onChange(async (value) => { // Function called when input changes
                    // Attempt to parse the input string into an integer
                    const duration = parseInt(value, 10);
                    // Validate if the parsed value is a number and is positive
                    if (!isNaN(duration) && duration > 0) {
                        this.plugin.settings.restDuration = duration; // Update the setting
                        await this.plugin.saveSettings(); // Save settings
                        console.log('Rest duration updated:', duration);
                    } else {
                        // If input is invalid, show a notice
                        new Notice('Please enter a valid positive number for rest duration.');
                         // Reset the input field to the last valid saved value
                        text.setValue(this.plugin.settings.restDuration.toString());
                    }
                }));

        // We will add settings for long breaks, cue sound choice, etc. later
        // --- End Focus Timer Settings Section ---


        // We will add other settings sections here as features are added (e.g., Animation Settings)
	}

    // --- Methods for Custom Folder Browser UI (defined within LofiSettingTab) ---

    // Method to render the contents of the specified folder path in the UI browser list.
    private async renderFolderContents(folderPath: string): Promise<void> {
        // Clear the previous list items from the folder list container
        this.folderListEl.empty();
        // Update the displayed current path string in the UI. Use '/' for the root path for clarity.
        this.currentPathEl.setText(`Current Path: ${folderPath || '/'}`);

        try {
            let folder: TFolder | null;

            // Handle the special case of the vault root path (empty string '' or '/')
            if (folderPath === '' || folderPath === '/') {
                folder = this.app.vault.getRoot(); // Get the root folder object provided by Obsidian's API
            } else {
                // For non-root paths, get the abstract file object based on the path.
                // This can return a file (TFile), a folder (TFolder), or null if the path doesn't exist.
                const fileOrFolder = this.app.vault.getAbstractFileByPath(folderPath);
                // Check if the retrieved object is a valid folder (an instance of TFolder)
                if (fileOrFolder instanceof TFolder) {
                    folder = fileOrFolder; // We found a valid folder at the path
                } else {
                    // If the path doesn't resolve to a valid folder (e.g., points to a file, or is invalid)
                    console.error('Invalid path or not a folder:', folderPath);
                    // Display an error message within the folder list area
                    this.folderListEl.createEl('div', { text: 'Invalid folder path.', cls: 'lofi-browser-error' });
                    // If the initial saved path was invalid when the settings tab opened,
                    // reset the Browse state to root and re-render the root contents as a fallback.
                    if (folderPath === this.currentBrowsePath && folderPath !== '') {
                         new Notice(`The saved folder path "${folderPath}" is invalid. Displaying vault root instead.`);
                         this.currentBrowsePath = ''; // Reset the Browse state to root path
                         this.renderFolderContents(''); // Re-render the UI starting from the vault root
                    }
                    return; // Stop the rendering process if the path is invalid
                }
            }

            // Display an option to go up one folder level IF the current folder is not the vault root.
            // The root folder's parent property is null.
            if (folder.parent) {
                 // Create a list item element for the ".." navigation option
                 const upButtonEl = this.folderListEl.createDiv('lofi-browser-list-item');
                 // Add a class to visually style it like a folder item
                 upButtonEl.addClass('lofi-browser-item-folder');
                  // Add an icon (up arrow) and the ".." text to represent the parent folder
                 upButtonEl.createEl('span', { text: '⬆️ ..', cls: 'lofi-browser-item-name' });
                 // Add a pointer cursor to indicate that this item is clickable for navigation
                 upButtonEl.style.cursor = 'pointer';

                 // Add the click listener for the ".." (parent folder) item
                 upButtonEl.addEventListener('click', () => {
                     console.log('Clicked .. to navigate up from', folder.path);
                     // Call the navigateUp method defined within THIS (LofiSettingTab) instance
                     this.navigateUp();
                 });
            }


            // Iterate through the children (files and subfolders) of the current folder.
            // Sort the children alphabetically, showing folders first, then files.
            const sortedChildren = folder.children.sort((a, b) => {
                 const isAFolder = a instanceof TFolder; // Check if item 'a' is a folder
                 const isBFolder = b instanceof TFolder; // Check if item 'b' is a folder

                 // Sorting logic:
                 if (isAFolder && !isBFolder) return -1; // If 'a' is folder and 'b' is file, 'a' comes first
                 if (!isAFolder && isBFolder) return 1; // If 'a' is file and 'b' is folder, 'b' comes first
                 // If both are the same type (both folders or both files), sort them by their name alphabetically
                 return a.name.localeCompare(b.name);
            });

            // Log the number of items found in the current folder for debugging
            console.log(`Rendering contents for "${folderPath || '/'}". Items found: ${sortedChildren.length}`);

            // Create a list item element for each child file or folder
            for (const child of sortedChildren) {
                const itemEl = this.folderListEl.createDiv('lofi-browser-list-item'); // Container for the item
                const iconEl = itemEl.createEl('span', { cls: 'lofi-browser-item-icon' }); // Span for the icon
                const itemNameEl = itemEl.createEl('span', { text: child.name, cls: 'lofi-browser-item-name' }); // Span for the name

                // Check if the child item is a folder (TFolder)
                if (child instanceof TFolder) {
                    iconEl.setText('📁'); // Display folder icon
                    itemEl.addClass('lofi-browser-item-folder'); // Add class for folder items
                    itemEl.style.cursor = 'pointer'; // Set cursor to pointer for clickable folders

                    // Add the click listener specifically for folder items.
                    // Clicking a folder item should navigate into that folder.
                    itemEl.addEventListener('click', () => {
                        console.log('Clicked folder:', child.path);
                        // Call the navigateToFolder method defined within THIS (LofiSettingTab) instance
                        this.navigateToFolder(child.path);
                    });
                    // Log that a folder item was rendered (for debugging)
                    console.log(`Rendering folder item: ${child.path}. Adding click listener.`);

                } else if (child instanceof TFile) { // Check if the child item is a file (TFile)
                     iconEl.setText('📄'); // Display file icon
                     itemEl.addClass('lofi-browser-item-file'); // Add class for file items
                     // For a folder picker, we typically just list files to inform the user
                     // what's in the folder, but don't make the file itself navigable or selectable.
                     itemEl.style.cursor = 'default'; // Set cursor to default
                     // Log that a file item was rendered (for debugging)
                     console.log(`Rendering file item: ${child.path}.`);
                }
            }

        } catch (error) {
            // Catch any errors that occur during the process of rendering contents (e.g., API issues, unexpected errors)
            console.error('Error rendering folder contents:', error);
             // Display an error message within the folder list area
             this.folderListEl.createEl('div', { text: 'Error loading contents.', cls: 'lofi-browser-error' });
             // Update the path display to indicate an error state
             this.currentPathEl.setText(`Current Path: Error`);
        }
    }

    // Method to navigate the folder browser view into a specified subfolder path.
    // This updates the internal state (current Browse path) and re-renders the UI.
    private navigateToFolder(folderPath: string): void {
        // Update the state variable holding the current Browse path to the target folder's path
        this.currentBrowsePath = normalizePath(folderPath); // Normalize the path just in case

        // Re-render the contents of the newly navigated folder in the UI
        this.renderFolderContents(this.currentBrowsePath);

        // Optional: If you wanted the track list to update as you browse through folders,
        // you could call this.renderTrackList() here. Currently, the track list
        // only updates when a folder is selected using the "Select This Folder" button.
        // this.renderTrackList();
    }

    // Method to navigate the folder browser view up to the parent folder of the current Browse path.
    // This updates the internal state (current Browse path) and re-renders the UI.
    private navigateUp(): void {
        // Handle the special case: If already at the vault root (''), cannot go up further.
        if (this.currentBrowsePath === '' || this.currentBrowsePath === '/') {
            console.log('Already at root.'); // Log for debugging
            return; // Do nothing if at root
        }

        // Get the abstract file object for the current Browse path
        const currentFolder = this.app.vault.getAbstractFileByPath(this.currentBrowsePath);

        // Check if the current path resolved to a folder (TFolder) and if that folder has a parent
        if (currentFolder instanceof TFolder && currentFolder.parent) {
            // Get the vault path of the parent folder
            const parentPath = currentFolder.parent.path;
             // Update the state variable holding the current Browse path to the parent's path
            this.currentBrowsePath = normalizePath(parentPath); // Normalize the parent path

            // Re-render the contents of the parent folder in the UI
            this.renderFolderContents(this.currentBrowsePath);
             // Optional: Re-render track list if you wanted it to update while Browse
             // this.renderTrackList();
        } else {
             // This case is a fallback. It might happen if the current path was somehow invalid
             // or a non-folder item was somehow set as the Browse path.
             console.warn('Could not determine parent for path:', this.currentBrowsePath, '. Navigating to root as fallback.');
             this.currentBrowsePath = ''; // Reset state to the root path ('')
             this.renderFolderContents(''); // Render the vault root contents
             // Optional: Re-render track list
             // this.renderTrackList();
        }
    }

    // Method called when the user clicks the "Select This Folder" button.
    // It saves the current Browse path as the audio folder setting and triggers a plugin scan.
    private async selectCurrentFolder(): Promise<void> {
         // Ensure the current path is a valid folder (or the vault root) before saving it as the audio folder.
         // GetAbstractFileByPath returns null for the root path (''), so handle '' explicitly first.
         const folder = this.currentBrowsePath === '' ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(this.currentBrowsePath);


         // Check if the current path is the vault root ('' or '/') OR if it resolves to a valid folder (instanceof TFolder)
         if (this.currentBrowsePath === '' || this.currentBrowsePath === '/' || folder instanceof TFolder) {
             // Get the path to save. Normalize it before storing.
             const path = normalizePath(this.currentBrowsePath);

             // Update the audioFolderPath setting in the plugin's memory
             this.plugin.settings.audioFolderPath = path;

             // Save the updated settings to disk. Await this to ensure it's persisted.
             await this.plugin.saveSettings();

             // Trigger the main plugin instance's scanAudioFolder method with the newly selected path.
             // This updates the plugin's internal playlist based on the new folder.
             await this.plugin.scanAudioFolder(path); // Use await here to wait for the scan to complete

             // After the scan is complete, re-render the track list in the settings tab
             // to display the files found in the newly selected folder.
             this.renderTrackList(); // Call the method within THIS (LofiSettingTab) instance

             // Provide a user-friendly notice confirming the selected folder.
             new Notice(`Audio folder set to: "${path || '/'}"`);
             console.log('Audio folder setting saved:', path); // Log the saved path

         } else {
             // This case is a fallback if the current Browse path somehow became invalid
             // (e.g., folder was deleted or renamed externally while settings was open).
             console.error('Cannot select invalid path as folder:', this.currentBrowsePath);
             new Notice('Cannot select current path: Not a valid folder.');
             // As a fallback, reset the Browse state to root and re-render, and clear the track list.
             this.currentBrowsePath = ''; // Reset state to root
             this.renderFolderContents(''); // Render root contents
             this.renderTrackList(); // Clear/re-render track list
         }
    }

    // --- Methods for Track List Display and Interaction (defined within LofiSettingTab) ---

    // Method to render the list of tracks found in the selected audio folder.
    // This is called after a scan completes or when the settings tab is opened.
    private renderTrackList(): void {
        this.trackListEl.empty(); // Clear the previous list items from the track list container

        // Access the current playlist from the main plugin instance.
        const playlist = this.plugin.playlist; // Accessing public playlist property

        // If the playlist is empty, display a message indicating no files were found.
        if (playlist.length === 0) {
             this.trackListEl.createEl('div', { text: 'No MP3 files found in the selected folder.', cls: 'lofi-track-list-empty' });
             return; // Exit the method
        }

        // Iterate through the playlist (array of vault paths) and create a list item element for each track.
        playlist.forEach((trackVaultPath, index) => {
             const trackItemEl = this.trackListEl.createDiv('lofi-track-list-item'); // Create a div element for the track item
             // Extract the filename from the full vault path for display
             const trackName = trackVaultPath.split('/').pop() || 'Unknown Track';

             // Display the track number and name in the list item
             trackItemEl.createEl('span', { text: `${index + 1}. ${trackName}`, cls: 'lofi-track-name' }); // Create a span for the track name

             // Add classes and styling to indicate that the track item is clickable
             trackItemEl.addClass('lofi-track-item-clickable');
             trackItemEl.style.cursor = 'pointer'; // Set cursor to pointer on hover

             // Add the click listener to the track item.
             // Clicking a track item should play that specific track.
             trackItemEl.addEventListener('click', () => {
                 console.log('Clicked track:', trackVaultPath);
                 // Call the playTrackByPath method on the main plugin instance to handle playback logic
                 this.plugin.playTrackByPath(trackVaultPath);

                 // Update the visual highlight in the track list to show which track is now playing.
                 // Call the helper method within THIS (LofiSettingTab) instance.
                 // Access the current index from the plugin instance using the public method
                 this.updateTrackListPlayingState(this.plugin.getCurrentTrackIndex());
             });

             // Add a visual indicator (a CSS class) if this track is the one currently loaded/playing.
             // Use the public getCurrentTrackIndex method from the main plugin instance to check.
             if (index === this.plugin.getCurrentTrackIndex()) {
                 trackItemEl.addClass('lofi-track-item-playing'); // Add a class for styling the playing track
             }
        });

        // Note: The updateTrackListPlayingState helper method is defined below.
    }

    // Helper method to update the visual styling of the track list items
    // to indicate which track is currently playing.
    private updateTrackListPlayingState(playingIndex: number): void {
        // Find all the track item elements within the track list container
        const items = this.trackListEl.querySelectorAll('.lofi-track-list-item');

        items.forEach((item, index) => {
            // Remove the 'lofi-track-item-playing' class from all items first,
            // in case a different track was previously highlighted.
            item.removeClass('lofi-track-item-playing');

            // If the current item's index matches the index of the track that just started playing,
            // add the 'lofi-track-item-playing' class to highlight it.
            if (index === playingIndex) {
                item.addClass('lofi-track-item-playing');
            }
        });
    }

    // --- End Methods for Track List Display and Interaction ---


    // --- Helper methods for the main Plugin functionality ---
    // These methods belong to LofiPlugin, not LofiSettingTab.

    // Helper method for random numbers (unused currently)
    // getRandomNumber(min: number = 10000, max: number = 99999): number { ... } // Defined in LofiPlugin

    // loadSettings, saveSettings, onload, onunload methods also belong to LofiPlugin


    // Note: The methods listed in this comment block are defined within the LofiPlugin class definition,
    // NOT within the LofiSettingTab class definition. The LofiSettingTab interacts
    // with these methods via its 'plugin' property (e.g., this.plugin.setVolume(...)).
}