// Import necessary types and classes from obsidian and local modules
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, normalizePath, TFolder, TFile } from 'obsidian';

// Import interfaces and defaults
import { LofiPluginSettings } from './types';
import { DEFAULT_LOFI_SETTINGS } from './defaults';

// Import component classes
import { SampleModal } from './modal';
import { LofiSettingTab } from './settings-tab';

// --- Define Timer States ---
type TimerState = 'stopped' | 'working' | 'resting' | 'paused';
type SessionType = 'work' | 'rest';
// --- End Define Timer States ---

// Main Plugin class
export default class LofiPlugin extends Plugin {
	settings: LofiPluginSettings; // Holds the plugin's settings (type imported from types.ts)
	private audioPlayer: HTMLAudioElement | null = null; // HTML Audio element for playback
    private statusBarItemEl: HTMLElement | null = null; // Existing status bar item for *audio* text status
    // Status bar items for playback controls (Audio)
    private prevButtonEl: HTMLElement | null = null;
    private playPauseButtonEl: HTMLElement | null = null;
    private nextButtonEl: HTMLElement | null = null;

    public playlist: string[] = []; // Array to store vault paths of audio files (Public for Settings Tab access)
    private currentTrackIndex: number = -1; // State variable for current track index

    // --- NEW: Timer State Properties ---
    private timerState: TimerState = 'stopped';
    private remainingTime: number = 0; // Time in seconds
    private timerIntervalId: number | null = null; // ID returned by setInterval
    private currentSessionType: SessionType = 'work'; // Start with a work session by default
    // --- END NEW ---

    // --- NEW: Status bar items for Timer Controls and Display ---
    private timerDisplayEl: HTMLElement | null = null;
    private timerPlayPauseButtonEl: HTMLElement | null = null;
    private timerResetButtonEl: HTMLElement | null = null;
    // --- END NEW ---


	// Called when the plugin is enabled
	async onload() {
		await this.loadSettings();

		console.log('Loading Obsidian Lofi Plugin');

		this.audioPlayer = new Audio();

        // Add event listeners for audio player state changes
        this.audioPlayer.addEventListener('ended', () => {
            console.log('Audio playback ended. Playing next track...');
            this.playNextTrack(); // Auto-play next track
        });

        this.audioPlayer.addEventListener('play', () => {
            console.log('Audio playing');
             this.updatePlayPauseButton(true); // Update audio button state to Paused (since it's now playing)
             // Status bar text is updated in playTrackByPath or togglePlayback
        });

        this.audioPlayer.addEventListener('pause', () => {
            console.log('Audio paused');
            this.updatePlayPauseButton(false); // Update audio button state to Play
             // Status bar text is updated in togglePlayback
        });


		this.setVolume(this.settings.volume);

        if (this.settings.audioFolderPath) {
            const normalizedPath = normalizePath(this.settings.audioFolderPath);
            await this.scanAudioFolder(normalizedPath);
        } else {
             this.updateStatusBar('Lofi: No folder set');
        }

        // Set initial audio source after scan
        if (this.playlist.length > 0 && this.audioPlayer) {
             if (this.currentTrackIndex === -1 || this.currentTrackIndex >= this.playlist.length) {
                 this.currentTrackIndex = 0; // Default to first track if index is invalid
             }
             const initialTrackVaultPath = this.playlist[this.currentTrackIndex];
             const initialTrackAppPath = this.app.vault.adapter.getResourcePath(initialTrackVaultPath);
             this.audioPlayer.src = initialTrackAppPath;

             console.log('Set initial audio source from playlist:', initialTrackAppPath);

             const initialTrackName = initialTrackVaultPath.split('/').pop() || 'Unknown Track';
             this.updateStatusBar(`Lofi Ready || ${initialTrackName}`);
        } else if (!this.settings.audioFolderPath){
             // Status already set
        }
        else { // Path was set, but no files found
             console.warn('No audio files found in the specified folder.');
             this.updateStatusBar('Lofi: No files found');
        }


		// Ribbon Icon
		const ribbonIconEl = this.addRibbonIcon('music', 'Toggle Lofi Playback', () => this.togglePlayback());
		ribbonIconEl.addClass('lofi-plugin-ribbon-icon');


		// --- Add Status Bar Items ---
        // Audio Status Text
		this.statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar('Lofi Ready');

        // Audio Playback Controls
        this.prevButtonEl = this.addStatusBarItem();
        this.prevButtonEl.addClass('lofi-control-button'); // Use general class for styling
        this.prevButtonEl.addClass('lofi-prev-button'); // Specific class
        this.prevButtonEl.setText('⏮'); // Simple text icon (can replace with SVG later)
        this.prevButtonEl.ariaLabel = 'Previous Track'; // Accessibility label
        this.prevButtonEl.addEventListener('click', () => this.playPreviousTrack()); // Add click listener

        this.playPauseButtonEl = this.addStatusBarItem();
        this.playPauseButtonEl.addClass('lofi-control-button');
        this.playPauseButtonEl.addClass('lofi-play-pause-button');
        this.updatePlayPauseButton(this.audioPlayer.paused); // Set initial state based on player state (true if paused, false if playing)
        this.playPauseButtonEl.ariaLabel = 'Toggle Playback';
        this.playPauseButtonEl.addEventListener('click', () => this.togglePlayback());

        this.nextButtonEl = this.addStatusBarItem();
        this.nextButtonEl.addClass('lofi-control-button');
        this.nextButtonEl.addClass('lofi-next-button');
        this.nextButtonEl.setText('⏭'); // Simple text icon (can replace with SVG later)
        this.nextButtonEl.ariaLabel = 'Next Track';
        this.nextButtonEl.addEventListener('click', () => this.playNextTrack());

        // --- NEW: Timer Status Bar Items ---
        // Timer Display
        this.timerDisplayEl = this.addStatusBarItem();
        this.timerDisplayEl.addClass('lofi-timer-display');
        this.updateTimerDisplay(); // Set initial timer text (e.g., "Timer: Stopped")

        // Timer Play/Pause Button
        this.timerPlayPauseButtonEl = this.addStatusBarItem();
        this.timerPlayPauseButtonEl.addClass('lofi-control-button'); // Re-use control button class
        this.timerPlayPauseButtonEl.addClass('lofi-timer-play-pause-button'); // Specific class
        this.timerPlayPauseButtonEl.ariaLabel = 'Start Timer'; // Initial label
        this.timerPlayPauseButtonEl.addEventListener('click', () => {
             if (this.timerState === 'stopped' || this.timerState === 'paused') {
                 this.startTimer();
             } else { // 'working' or 'resting'
                 this.pauseTimer();
             }
        });
        this.updateTimerControls(); // Set initial state of timer buttons (Play icon, visible)

         // Timer Reset Button
        this.timerResetButtonEl = this.addStatusBarItem();
        this.timerResetButtonEl.addClass('lofi-control-button'); // Re-use control button class
        this.timerResetButtonEl.addClass('lofi-timer-reset-button'); // Specific class
        this.timerResetButtonEl.setText('🔄'); // Reset icon
        this.timerResetButtonEl.ariaLabel = 'Reset Timer'; // Accessibility label
        this.timerResetButtonEl.addEventListener('click', () => this.resetTimer()); // Add click listener
        // --- END NEW ---
        // --- End Status Bar Items ---


		// Add Commands
        this.addCommand({
			id: 'lofi-plugin-toggle-playback',
			name: 'Toggle Lofi Playback',
			callback: () => this.togglePlayback()
		});
        this.addCommand({
            id: 'lofi-plugin-play-next-track',
            name: 'Play Next Lofi Track',
            callback: () => this.playNextTrack()
        });
         this.addCommand({
            id: 'lofi-plugin-play-previous-track',
            name: 'Play Previous Lofi Track',
            callback: () => this.playPreviousTrack()
        });
         // --- NEW: Add Commands for Timer Controls ---
        this.addCommand({
             id: 'lofi-plugin-start-timer',
             name: 'Start Focus Timer',
             callback: () => this.startTimer()
        });
        this.addCommand({
             id: 'lofi-plugin-pause-timer',
             name: 'Pause Focus Timer',
             callback: () => this.pauseTimer()
        });
        this.addCommand({
             id: 'lofi-plugin-reset-timer',
             name: 'Reset Focus Timer',
             callback: () => this.resetTimer()
        });
         // --- END NEW ---


		// Add the settings tab
		this.addSettingTab(new LofiSettingTab(this.app, this));

        // --- REMOVED: This line hid timer controls initially. They are visible by default now. ---
        // this.setTimerControlsVisibility(false);
	}

	// Called when the plugin is disabled
	onunload() {
		console.log('Unloading Obsidian Lofi Plugin');
        this.updateStatusBar('Lofi Unloaded');

		// Clean up the audio player
		if (this.audioPlayer) {
			this.audioPlayer.pause();
			this.audioPlayer.src = '';
			this.audioPlayer = null;
		}

        // Clear timer interval on unload
        if (this.timerIntervalId !== null) {
             clearInterval(this.timerIntervalId);
        }

        // Clear references and state
        this.statusBarItemEl = null;
        this.prevButtonEl = null;
        this.playPauseButtonEl = null;
        this.nextButtonEl = null;
        // Clear timer status bar references
        this.timerDisplayEl = null;
        this.timerPlayPauseButtonEl = null;
        this.timerResetButtonEl = null;
        // Reset timer state
        this.timerState = 'stopped';
        this.remainingTime = 0;
        this.timerIntervalId = null;
        this.currentSessionType = 'work';
	}

	// --- Plugin Core Methods (Audio) ---

	async loadSettings() {
		const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_LOFI_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

    // Updates the *audio* status bar text
    private updateStatusBar(text: string) {
        if (this.statusBarItemEl) {
            this.statusBarItemEl.setText(text);
        }
    }

    public setVolume(volume: number) {
        if (this.audioPlayer) {
            const clampedVolume = Math.max(0, Math.min(100, volume));
            this.audioPlayer.volume = clampedVolume / 100;
            console.log(`Lofi volume set to ${clampedVolume}%`);
        }
    }

    // Refactored logic to toggle playback state (Audio)
    public togglePlayback(): void {
        if (!this.audioPlayer) {
            new Notice('Audio player not initialized.');
            return;
        }

        const isTrackLoaded = this.audioPlayer.src && this.audioPlayer.src !== window.location.href;
        const isPlaylistReady = this.playlist.length > 0 && this.currentTrackIndex !== -1 && this.currentTrackIndex < this.playlist.length;

        if (!isTrackLoaded || !isPlaylistReady) {
             new Notice('No Lofi track loaded. Check settings and folder.');
             if (!this.settings.audioFolderPath || this.playlist.length === 0) {
                 this.updateStatusBar('Lofi: No files/folder');
             } else if (this.currentTrackIndex === -1 || this.currentTrackIndex >= this.playlist.length) {
                  this.updateStatusBar('Lofi: Index Error');
             } else {
                  this.updateStatusBar('Lofi: Source Error');
             }
             return;
        }

        const currentTrackPath = this.playlist[this.currentTrackIndex];
        const currentTrackName = currentTrackPath.split('/').pop() || 'Unknown Track';


        if (this.audioPlayer.paused) {
            this.audioPlayer.play()
                .then(() => {
                    new Notice('Lofi playing...');
                    this.updateStatusBar(`Playing: ${currentTrackName}`);
                })
                .catch(error => {
                    console.error('Error playing audio (togglePlayback):', error);
                    new Notice('Failed to play Lofi audio. Check console.');
                    this.updateStatusBar('Lofi Play Error 😢');
                });
        } else {
            this.audioPlayer.pause();
            new Notice('Lofi paused.');
            this.updateStatusBar(`Lofi Paused || ${currentTrackName}`);
        }
    }

    // Helper to update the text/icon of the status bar Play/Pause button (Audio)
    private updatePlayPauseButton(isPlaying: boolean): void {
        if (this.playPauseButtonEl) {
            // Use text icons for simplicity. Can replace with SVG icons later.
            this.playPauseButtonEl.setText(isPlaying ? '⏸' : '▶'); // Pause icon if playing, Play icon if paused
            this.playPauseButtonEl.ariaLabel = isPlaying ? 'Pause' : 'Play'; // Update accessibility label
        }
    }


    public async scanAudioFolder(folderPath: string) {
        this.playlist = [];

        const normalizedFolderPath = normalizePath(folderPath);

        if (!normalizedFolderPath || normalizedFolderPath === '/') {
            console.log('No valid audio folder path specified.');
            this.updateStatusBar('Lofi: No folder set');
             if (this.audioPlayer) {
                this.audioPlayer.src = '';
             }
             this.currentTrackIndex = -1;
             this.setPlaybackControlsVisibility(false); // Hide audio controls
            return;
        }

        try {
            const folder = this.app.vault.getAbstractFileByPath(normalizedFolderPath);

            if (folder instanceof TFolder) {
                for (const file of folder.children) {
                    if (file instanceof TFile && file.extension.toLowerCase() === 'mp3') {
                        this.playlist.push(file.path);
                    }
                }
                console.log(`Finished scanning. Found ${this.playlist.length} MP3 files.`);
                this.updateStatusBar(`Lofi: ${this.playlist.length} files found`);

                if (this.playlist.length > 0) {
                     this.currentTrackIndex = 0;
                     if (this.audioPlayer && this.audioPlayer.paused) {
                         const firstTrackVaultPath = this.playlist[this.currentTrackIndex];
                         const firstTrackAppPath = this.app.vault.adapter.getResourcePath(firstTrackVaultPath);
                         this.audioPlayer.src = firstTrackAppPath;
                         console.log('Set audio source to first track after scan:', firstTrackAppPath);
                         const firstTrackName = firstTrackVaultPath.split('/').pop() || 'Unknown Track';
                          this.updateStatusBar(`Lofi Ready || ${firstTrackName}`);
                     } else if (this.audioPlayer && !this.audioPlayer.paused) {
                          console.log(`Audio already playing. Found ${this.playlist.length} tracks. Set index to 0 for new playlist.`);
                     }
                     this.setPlaybackControlsVisibility(true); // Show audio controls

                } else { // Playlist is empty
                     if (this.audioPlayer) {
                        this.audioPlayer.src = '';
                     }
                     this.currentTrackIndex = -1;
                     this.updateStatusBar('Lofi: No files found');
                     this.setPlaybackControlsVisibility(false); // Hide audio controls
                }

            } else { // Path invalid or not a folder
                console.error('The specified path is not a valid folder:', normalizedFolderPath);
                new Notice(`Error: "${folderPath}" is not a valid folder.`);
                this.updateStatusBar('Lofi: Invalid folder');
                 if (this.audioPlayer) {
                    this.audioPlayer.src = '';
                 }
                 this.currentTrackIndex = -1;
                 this.setPlaybackControlsVisibility(false); // Hide audio controls
            }

        } catch (error) { // Scan error
            console.error('Error scanning audio folder:', error);
            new Notice(`Error scanning folder "${folderPath}". Check console for details.`);
            this.updateStatusBar('Lofi: Scan Error');
             if (this.audioPlayer) {
                this.audioPlayer.src = '';
             }
             this.currentTrackIndex = -1;
             this.setPlaybackControlsVisibility(false); // Hide audio controls
        }
    }

    // Plays a specific track by its vault path.
    public playTrackByPath(trackVaultPath: string): void {
        if (!this.audioPlayer || this.playlist.length === 0) {
             new Notice('Cannot play track: Audio player not ready or playlist is empty.');
             this.updateStatusBar('Lofi: Play Error');
             return;
        }

        const index = this.playlist.indexOf(trackVaultPath);

        if (index === -1) {
             console.error('Attempted to play track not found in playlist:', trackVaultPath);
             new Notice('Error: Selected track not found in playlist.');
             this.updateStatusBar('Lofi: Track Error');
             return;
        }

        this.currentTrackIndex = index;
        const trackAppPath = this.app.vault.adapter.getResourcePath(trackVaultPath);
        this.audioPlayer.src = trackAppPath;

         this.audioPlayer.play()
             .then(() => {
                  const trackName = trackVaultPath.split('/').pop() || 'Unknown Track';
                  new Notice(`Playing: ${trackName}`);
                  this.updateStatusBar(`Playing: ${trackName}`);
                  // Play event listener updates the button state
             })
             .catch(error => {
                  console.error('Error playing selected track:', error);
                  new Notice(`Failed to play "${trackVaultPath.split('/').pop()}". Check console.`);
                  this.updateStatusBar('Lofi: Playback Error');
                  // Pause event listener updates the button state if play() fails after setting src
             });

        // Note: Settings tab needs to update playing state highlight if open.
        // The click handler in settings-tab.ts already calls updateTrackListPlayingState after calling playTrackByPath
    }

    // Plays the next track in the playlist. Handles wrapping around.
    public playNextTrack(): void {
        if (!this.audioPlayer || this.playlist.length <= 1) {
            console.warn('Cannot play next track: Playlist has less than 2 tracks.');
             if (this.playlist.length === 0) {
                  new Notice('Cannot play next track: Playlist is empty.');
                  this.updateStatusBar('Lofi: Playlist Empty');
             } else { // Only 1 track
                  new Notice('Cannot play next track: Only one track in playlist.');
                  this.updateStatusBar('Lofi: Single Track');
             }
            return;
        }

        this.currentTrackIndex++;
        if (this.currentTrackIndex >= this.playlist.length) {
            this.currentTrackIndex = 0; // Wrap around
        }

        const nextTrackVaultPath = this.playlist[this.currentTrackIndex];
        console.log('Playing next track (index):', this.currentTrackIndex, nextTrackVaultPath);
        this.playTrackByPath(nextTrackVaultPath);
    }

    // Plays the previous track in the playlist. Handles wrapping around.
    public playPreviousTrack(): void {
        if (!this.audioPlayer || this.playlist.length <= 1) {
             console.warn('Cannot play previous track: Playlist has less than 2 tracks.');
             if (this.playlist.length === 0) {
                  new Notice('Cannot play previous track: Playlist is empty.');
                  this.updateStatusBar('Lofi: Playlist Empty');
             } else { // Only 1 track
                  new Notice('Cannot play previous track: Only one track in playlist.');
                  this.updateStatusBar('Lofi: Single Track');
             }
            return;
        }

        this.currentTrackIndex--;
        if (this.currentTrackIndex < 0) {
            this.currentTrackIndex = this.playlist.length - 1; // Wrap around to last track
        }

        const previousTrackVaultPath = this.playlist[this.currentTrackIndex];
        console.log('Playing previous track (index):', this.currentTrackIndex, previousTrackVaultPath);
        this.playTrackByPath(previousTrackVaultPath);
    }

    // Controls the visibility of the audio playback control status bar items.
    public setPlaybackControlsVisibility(visible: boolean): void {
        if (this.prevButtonEl) {
            this.prevButtonEl.style.display = visible ? '' : 'none';
        }
         if (this.playPauseButtonEl) {
            this.playPauseButtonEl.style.display = visible ? '' : 'none';
        }
         if (this.nextButtonEl) {
            this.nextButtonEl.style.display = visible ? '' : 'none';
        }
    }

    public getCurrentTrackIndex(): number {
        return this.currentTrackIndex;
    }

	getRandomNumber(min: number = 10000, max: number = 99999) {
		return Math.floor(Math.random() * (max - min) + min);
	}


    // --- NEW: Focus Timer Core Methods ---

    // Public method to start or resume the timer
    public startTimer(): void {
        // Prevent starting if already running
        if (this.timerState === 'working' || this.timerState === 'resting') {
            console.log('Timer already running.');
            // Optional: new Notice('Timer is already running.');
            return;
        }

        // If starting from stopped, initialize remaining time and session type
        if (this.timerState === 'stopped') {
             this.currentSessionType = 'work'; // Always start with a work session
             // Get duration from settings (convert minutes to seconds)
             // Ensure duration is a positive number, fallback to default if not.
             const workDur = this.settings.workDuration > 0 ? this.settings.workDuration : DEFAULT_LOFI_SETTINGS.workDuration;
             this.remainingTime = workDur * 60;
             console.log(`Starting new work session (${workDur} minutes).`);
             new Notice(`Starting work session (${workDur} minutes)!`);
        } else if (this.timerState === 'paused') {
            // If resuming from paused, remaining time and session type are already set
            console.log(`Resuming ${this.currentSessionType} session.`);
             new Notice(`Resuming ${this.currentSessionType} session!`);
        }

        // Set the state to running
        this.timerState = this.currentSessionType === 'work' ? 'working' : 'resting';

        // Clear any existing interval just in case
        if (this.timerIntervalId !== null) {
             clearInterval(this.timerIntervalId);
        }

        // Start the interval timer (runs tick() every 1000ms = 1 second)
        this.timerIntervalId = window.setInterval(() => {
            this.tick();
        }, 1000);

        this.updateTimerDisplay(); // Update display immediately on start/resume
        this.updateTimerControls(); // Update button states
        this.setTimerControlsVisibility(true); // Ensure timer controls are visible (should be default now)
    }

    // Public method to pause the timer
    public pauseTimer(): void {
        // Only pause if currently running
        if (this.timerState !== 'working' && this.timerState !== 'resting') {
            console.log('Timer is not running to pause.');
            return;
        }

        if (this.timerIntervalId !== null) {
            clearInterval(this.timerIntervalId); // Stop the countdown
            this.timerIntervalId = null;
        }

        this.timerState = 'paused'; // Set the state
        console.log('Timer paused.');
        new Notice('Timer paused.');

        this.updateTimerDisplay(); // Update display to show paused state
        this.updateTimerControls(); // Update button states (Play icon)
    }

     // Public method to reset the timer
    public resetTimer(): void {
        // Prevent resetting if already fully stopped and at 0
         if (this.timerState === 'stopped' && this.remainingTime === 0) {
             console.log('Timer already reset.');
             // Optional: new Notice('Timer is already reset.');
             return;
         }

        if (this.timerIntervalId !== null) {
            clearInterval(this.timerIntervalId); // Stop the countdown
            this.timerIntervalId = null;
        }

        this.timerState = 'stopped'; // Set state back to stopped
        this.remainingTime = 0; // Reset remaining time to zero
        this.currentSessionType = 'work'; // Reset session type to start with work next time
        console.log('Timer reset.');
        new Notice('Timer reset.');

        this.updateTimerDisplay(); // Update display to show reset state (e.g., "Stopped")
        this.updateTimerControls(); // Update button states (Start icon, potentially hide Reset if 0)
        // Optional: setTimerControlsVisibility(false); // Can hide controls on reset if desired
    }


    // Private method called every second by the interval timer
    private tick(): void {
        // Ensure we are in a running state before ticking down
        if (this.timerState === 'working' || this.timerState === 'resting') {
            this.remainingTime--; // Decrement time

            // Check if the session has ended
            if (this.remainingTime <= 0) {
                this.remainingTime = 0; // Ensure it doesn't go negative
                this.endSession(); // Handle the end of the session
            }

            this.updateTimerDisplay(); // Update the status bar display with the new time
        }
    }

    // Private method called when a work or rest session ends
    private endSession(): void {
        // Stop the current interval
        if (this.timerIntervalId !== null) {
            clearInterval(this.timerIntervalId);
            this.timerIntervalId = null;
        }

        // --- Provide a cue when the session ends ---
        const sessionEndedMessage = `${this.currentSessionType.charAt(0).toUpperCase() + this.currentSessionType.slice(1)} session ended!`;
        new Notice(sessionEndedMessage); // Show an Obsidian notice
        console.log(sessionEndedMessage);
        // Optional: Add sound cue here later if implemented (e.g., play a short audio file using this.audioPlayer or a separate sound)
        // For example, you could load a short "ding.mp3" and play it:
        // const cueSoundPath = this.app.vault.adapter.getResourcePath('path/to/ding.mp3'); // Requires a file in your vault
        // new Audio(cueSoundPath).play().catch(e => console.error('Error playing cue sound:', e));
        // --- End Cue ---

        // Transition to the next session type
        if (this.currentSessionType === 'work') {
            this.currentSessionType = 'rest';
            this.timerState = 'stopped'; // Set to stopped so startTimer sets up the *rest* session duration correctly
             // Optionally auto-start the next session after a short delay if needed, but auto-start is simpler for now
            this.startTimer(); // Auto-start the rest session
        } else { // currentSessionType === 'rest'
            this.currentSessionType = 'work'; // After rest, go back to work (or potentially a long break later)
            this.timerState = 'stopped'; // Set to stopped so startTimer sets up the *work* session duration correctly
            // Optionally auto-start the next session
            this.startTimer(); // Auto-start the next work session
        }

        // Update UI elements for the next session state
        this.updateTimerDisplay();
        this.updateTimerControls();
    }

    // Private helper to update the status bar timer display text (e.g., "Work: 24:59")
    private updateTimerDisplay(): void {
        if (this.timerDisplayEl) {
            const minutes = Math.floor(this.remainingTime / 60);
            const seconds = this.remainingTime % 60;
            // Format time as MM:SS, padding with leading zeros
            const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            let displayStatus = '';
            switch (this.timerState) {
                case 'stopped':
                    displayStatus = 'Timer: Stopped';
                    break;
                case 'working':
                    displayStatus = `Work: ${formattedTime}`;
                    break;
                case 'resting':
                    displayStatus = `Rest: ${formattedTime}`;
                    break;
                case 'paused':
                    // Show which session type was paused and the time
                    displayStatus = `${this.currentSessionType.charAt(0).toUpperCase() + this.currentSessionType.slice(1)}: Paused (${formattedTime})`;
                    break;
            }

            this.timerDisplayEl.setText(displayStatus);
        }
    }

    // Private helper to update the text/icon/ariaLabel of the timer control buttons
    private updateTimerControls(): void {
        if (this.timerPlayPauseButtonEl) {
            if (this.timerState === 'stopped' || this.timerState === 'paused') {
                this.timerPlayPauseButtonEl.setText('▶'); // Play icon when stopped or paused
                this.timerPlayPauseButtonEl.ariaLabel = 'Start Timer';
            } else { // 'working' or 'resting'
                this.timerPlayPauseButtonEl.setText('⏸'); // Pause icon when running
                this.timerPlayPauseButtonEl.ariaLabel = 'Pause Timer';
            }
             // Timer play/pause button is always visible
             this.timerPlayPauseButtonEl.style.display = '';
        }
        // Reset button text is always '🔄', label is 'Reset Timer'.
        // We can hide the reset button if the timer is already stopped and at 0.
         if (this.timerResetButtonEl) {
            // Check if timer is stopped AND time is 0
            const isFullyReset = this.timerState === 'stopped' && this.remainingTime === 0;
            // Hide if fully reset, otherwise show
             this.timerResetButtonEl.style.display = isFullyReset ? 'none' : '';
         }
    }

    // Controls the visibility of the timer status bar items.
     public setTimerControlsVisibility(visible: boolean): void {
         if (this.timerDisplayEl) {
            this.timerDisplayEl.style.display = visible ? '' : 'none';
         }
         if (this.timerPlayPauseButtonEl) {
            this.timerPlayPauseButtonEl.style.display = visible ? '' : 'none';
         }
         if (this.timerResetButtonEl) {
            this.timerResetButtonEl.style.display = visible ? '' : 'none';
         }
         // Note: The updateTimerControls method now manages showing/hiding the reset button
         // when it reaches the fully reset state (stopped, 0 time).
         // This setTimerControlsVisibility can still be used if you want a global toggle later.
     }
    // --- END NEW: Focus Timer Core Methods ---


	getRandomNumber(min: number = 10000, max: number = 99999) {
		return Math.floor(Math.random() * (max - min) + min);
	}
}