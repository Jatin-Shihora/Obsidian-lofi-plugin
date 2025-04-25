// Import necessary types and classes from obsidian and local modules
import {
    App,
    PluginSettingTab,
    Setting,
    Notice,
    normalizePath,
    TFolder,
    TFile,
    TAbstractFile,
} from 'obsidian';

import LofiPlugin from './main'; // Import the main Plugin class
import { LofiPluginSettings } from './types'; // Import the settings interface

// Plugin Settings Tab class
// This class defines the UI that appears when the user clicks the plugin in the Obsidian Settings menu.
export class LofiSettingTab extends PluginSettingTab { // Export the class so main.ts can import it
	plugin: LofiPlugin; // Reference to the main plugin instance (type LofiPlugin)

    // State variables for the custom folder browser UI displayed within this settings tab instance
    private currentBrowsePath: string; // The vault path of the folder currently being displayed in the browser view
    private folderListEl: HTMLElement; // The HTML element that contains the list of files/folders
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
                    this.plugin.setVolume(value); // Access setVolume via this.plugin
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
            // Sort the children alphabetically, ensuring folders are listed before files.
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
        // Accessing the public playlist property on the plugin instance.
        const playlist = this.plugin.playlist;

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
                 // This method is defined in the LofiPlugin class.
                 this.plugin.playTrackByPath(trackVaultPath);

                 // Update the visual highlight in the track list to show which track is now playing.
                 // Call the helper method within THIS (LofiSettingTab) instance.
                 // Access the current index from the plugin instance using the public method.
                 this.updateTrackListPlayingState(this.plugin.getCurrentTrackIndex());
             });

             // Add a visual indicator (a CSS class) if this track is the one currently loaded/playing.
             // Use the public getCurrentTrackIndex method from the main plugin instance to check.
             if (index === this.plugin.getCurrentTrackIndex()) {
                 trackItemEl.addClass('lofi-track-item-playing'); // Add a class for styling the playing track
             }
        });

        // Note: The updateTrackListPlayingState helper method is defined below within LofiSettingTab.
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

}