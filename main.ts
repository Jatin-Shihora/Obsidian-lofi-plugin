// Import necessary types and classes from obsidian and local modules
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, normalizePath, TFolder, TFile } from 'obsidian';

// Import interfaces and defaults
import { LofiPluginSettings } from './types';
import { DEFAULT_LOFI_SETTINGS } from './defaults';

// Import component classes
import { SampleModal } from './modal';
import { LofiSettingTab } from './settings-tab';

// Define Timer States
type TimerState = 'stopped' | 'working' | 'resting' | 'paused';
type SessionType = 'work' | 'rest';

// --- NEW: Simple interface for an animated element (e.g., a falling circle/leaf representation) ---
interface AnimatedElement {
    x: number; // current x position
    y: number; // current y position
    radius: number; // size (for circle)
    speed: number; // how fast it falls (pixels per second)
    color: string; // color (e.g., 'rgba(255, 165, 0, 0.5)' for transparent orange)
    // Add other properties later for more complex animations (e.g., rotation, sway, opacity, shape)
}
// --- END NEW ---


// Main Plugin class
export default class LofiPlugin extends Plugin {
	settings: LofiPluginSettings;
	private audioPlayer: HTMLAudioElement | null = null;
    private statusBarItemEl: HTMLElement | null = null; // Audio status text
    // Audio playback controls status bar items
    private prevButtonEl: HTMLElement | null = null;
    private playPauseButtonEl: HTMLElement | null = null;
    private nextButtonEl: HTMLElement | null = null;

    public playlist: string[] = [];
    private currentTrackIndex: number = -1;

    // Timer State Properties
    private timerState: TimerState = 'stopped';
    private remainingTime: number = 0; // Time in seconds
    private timerIntervalId: number | null = null;
    private currentSessionType: SessionType = 'work';

    // Timer Status Bar Items
    private timerDisplayEl: HTMLElement | null = null;
    private timerPlayPauseButtonEl: HTMLElement | null = null;
    private timerResetButtonEl: HTMLElement | null = null;

    // --- NEW: Animation Properties ---
    private animationCanvas: HTMLCanvasElement | null = null; // The canvas element for drawing
    private animationContext: CanvasRenderingContext2D | null = null; // The 2D rendering context
    private animationFrameId: number | null = null; // The ID returned by requestAnimationFrame
    private animatedElements: AnimatedElement[] = []; // Array to hold the currently animated elements
    private lastFrameTime: number = 0; // Timestamp of the last animation frame for delta time calculation
    // --- END NEW ---


	// Called when the plugin is enabled
	async onload() {
		await this.loadSettings();

		console.log('Loading Obsidian Lofi Plugin');

		this.audioPlayer = new Audio();

        this.audioPlayer.addEventListener('ended', () => {
            console.log('Audio playback ended. Playing next track...');
            this.playNextTrack();
        });
        this.audioPlayer.addEventListener('play', () => {
            console.log('Audio playing');
             this.updatePlayPauseButton(true);
        });
        this.audioPlayer.addEventListener('pause', () => {
            console.log('Audio paused');
            this.updatePlayPauseButton(false);
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
                 this.currentTrackIndex = 0;
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


		// --- Status Bar Items ---
        // Audio Status Text
		this.statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar('Lofi Ready');

        // Audio Playback Controls
        this.prevButtonEl = this.addStatusBarItem();
        this.prevButtonEl.addClass('lofi-control-button');
        this.prevButtonEl.addClass('lofi-prev-button');
        this.prevButtonEl.setText('⇐');
        this.prevButtonEl.ariaLabel = 'Previous Track';
        this.prevButtonEl.addEventListener('click', () => this.playPreviousTrack());

        this.playPauseButtonEl = this.addStatusBarItem();
        this.playPauseButtonEl.addClass('lofi-control-button');
        this.playPauseButtonEl.addClass('lofi-play-pause-button');
        this.updatePlayPauseButton(this.audioPlayer.paused);
        this.playPauseButtonEl.ariaLabel = 'Toggle Playback';
        this.playPauseButtonEl.addEventListener('click', () => this.togglePlayback());

        this.nextButtonEl = this.addStatusBarItem();
        this.nextButtonEl.addClass('lofi-control-button');
        this.nextButtonEl.addClass('lofi-next-button');
        this.nextButtonEl.setText('⇒');
        this.nextButtonEl.ariaLabel = 'Next Track';
        this.nextButtonEl.addEventListener('click', () => this.playNextTrack());

        // Timer Status Bar Items
        this.timerDisplayEl = this.addStatusBarItem();
        this.timerDisplayEl.addClass('lofi-timer-display');
        this.updateTimerDisplay(); // Set initial text

        this.timerPlayPauseButtonEl = this.addStatusBarItem();
        this.timerPlayPauseButtonEl.addClass('lofi-control-button');
        this.timerPlayPauseButtonEl.addClass('lofi-timer-play-pause-button');
        this.updateTimerControls(); // Set initial button state (Play icon)
        this.timerPlayPauseButtonEl.ariaLabel = 'Start Timer'; // Initial label
        this.timerPlayPauseButtonEl.addEventListener('click', () => {
             if (this.timerState === 'stopped' || this.timerState === 'paused') {
                 this.startTimer();
             } else { // 'working' or 'resting'
                 this.pauseTimer();
             }
        });

        this.timerResetButtonEl = this.addStatusBarItem();
        this.timerResetButtonEl.addClass('lofi-control-button');
        this.timerResetButtonEl.addClass('lofi-timer-reset-button');
        this.timerResetButtonEl.setText('↻');
        this.timerResetButtonEl.ariaLabel = 'Reset Timer';
        this.timerResetButtonEl.addEventListener('click', () => this.resetTimer());
        // --- End Status Bar Items ---


		// Add Commands
        this.addCommand({ id: 'lofi-plugin-toggle-playback', name: 'Toggle Lofi Playback', callback: () => this.togglePlayback() });
        this.addCommand({ id: 'lofi-plugin-play-next-track', name: 'Play Next Lofi Track', callback: () => this.playNextTrack() });
        this.addCommand({ id: 'lofi-plugin-play-previous-track', name: 'Play Previous Lofi Track', callback: () => this.playPreviousTrack() });
        // Timer Commands
        this.addCommand({ id: 'lofi-plugin-start-timer', name: 'Start Focus Timer', callback: () => this.startTimer() });
        this.addCommand({ id: 'lofi-plugin-pause-timer', name: 'Pause Focus Timer', callback: () => this.pauseTimer() });
        this.addCommand({ id: 'lofi-plugin-reset-timer', name: 'Reset Focus Timer', callback: () => this.resetTimer() });


		// Add the settings tab
		this.addSettingTab(new LofiSettingTab(this.app, this));


        // --- NEW: Setup and Start Animation if Enabled ---
        this.setupAnimationCanvas(); // Create and add canvas to DOM
        if (this.settings.animationEnabled) {
            this.startAnimation(); // Start the animation loop if setting is enabled
        }

        // Handle window/workspace resize to resize canvas
        this.registerDomEvent(window, 'resize', () => this.handleCanvasResize());
        // --- END NEW ---
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

        // Clear timer interval
        if (this.timerIntervalId !== null) {
             clearInterval(this.timerIntervalId);
        }

        // --- NEW: Stop animation and remove canvas ---
        this.stopAnimation(); // Stop the animation loop
        this.teardownAnimationCanvas(); // Remove the canvas element from the DOM
        // --- END NEW ---


        // Clear references and state
        this.statusBarItemEl = null;
        this.prevButtonEl = null;
        this.playPauseButtonEl = null;
        this.nextButtonEl = null;
        this.timerDisplayEl = null;
        this.timerPlayPauseButtonEl = null;
        this.timerResetButtonEl = null;
        // Animation references
        this.animationCanvas = null;
        this.animationContext = null;
        this.animationFrameId = null;
        this.animatedElements = [];
        this.lastFrameTime = 0;

        this.playlist = [];
        this.currentTrackIndex = -1;
        // Reset timer state
        this.timerState = 'stopped';
        this.remainingTime = 0;
        this.timerIntervalId = null;
        this.currentSessionType = 'work';
	}

	// --- Plugin Core Methods (Audio) ---
    async loadSettings() { /* ... existing code ... */
        const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_LOFI_SETTINGS, data);
    }
	async saveSettings() { /* ... existing code ... */
         await this.saveData(this.settings);
    }
    private updateStatusBar(text: string) { /* ... existing code ... */
         if (this.statusBarItemEl) {
            this.statusBarItemEl.setText(text);
        }
    }
    public setVolume(volume: number) { /* ... existing code ... */
         if (this.audioPlayer) {
            const clampedVolume = Math.max(0, Math.min(100, volume));
            this.audioPlayer.volume = clampedVolume / 100;
            console.log(`Lofi volume set to ${clampedVolume}%`);
        }
    }
    public togglePlayback(): void { /* ... existing code ... */
        if (!this.audioPlayer) {
            new Notice('Audio player not initialized.');
            return;
        }
        const isTrackLoaded = this.audioPlayer.src && this.audioPlayer.src !== window.location.href;
        const isPlaylistReady = this.playlist.length > 0 && this.currentTrackIndex !== -1 && this.currentTrackIndex < this.playlist.length;
        if (!isTrackLoaded || !isPlaylistReady) {
             new Notice('No Lofi track loaded. Check settings and folder.');
             if (!this.settings.audioFolderPath || this.playlist.length === 0) { this.updateStatusBar('Lofi: No files/folder'); }
             else if (this.currentTrackIndex === -1 || this.currentTrackIndex >= this.playlist.length) { this.updateStatusBar('Lofi: Index Error'); }
             else { this.updateStatusBar('Lofi: Source Error'); }
             return;
        }
        const currentTrackPath = this.playlist[this.currentTrackIndex];
        const currentTrackName = currentTrackPath.split('/').pop() || 'Unknown Track';
        if (this.audioPlayer.paused) {
            this.audioPlayer.play().then(() => { new Notice('Lofi playing...'); this.updateStatusBar(`Playing: ${currentTrackName}`); }).catch(error => { console.error('Error playing audio (togglePlayback):', error); new Notice('Failed to play Lofi audio. Check console.'); this.updateStatusBar('Lofi Play Error 😢'); });
        } else {
            this.audioPlayer.pause();
            new Notice('Lofi paused.');
            this.updateStatusBar(`Lofi Paused || ${currentTrackName}`);
        }
    }
    private updatePlayPauseButton(isPlaying: boolean): void { /* ... existing code ... */
        if (this.playPauseButtonEl) {
            this.playPauseButtonEl.setText(isPlaying ? '❚❚' : '▶');
            this.playPauseButtonEl.ariaLabel = isPlaying ? 'Pause' : 'Play';
        }
    }
    public async scanAudioFolder(folderPath: string) { /* ... existing code ... */
         this.playlist = [];
        const normalizedFolderPath = normalizePath(folderPath);
        if (!normalizedFolderPath || normalizedFolderPath === '/') {
            console.log('No valid audio folder path specified.'); this.updateStatusBar('Lofi: No folder set'); if (this.audioPlayer) { this.audioPlayer.src = ''; } this.currentTrackIndex = -1; this.setPlaybackControlsVisibility(false); return;
        }
        try {
            const folder = this.app.vault.getAbstractFileByPath(normalizedFolderPath);
            if (folder instanceof TFolder) {
                for (const file of folder.children) { if (file instanceof TFile && file.extension.toLowerCase() === 'mp3') { this.playlist.push(file.path); } }
                console.log(`Finished scanning. Found ${this.playlist.length} MP3 files.`); this.updateStatusBar(`Lofi: ${this.playlist.length} files found`);
                if (this.playlist.length > 0) { this.currentTrackIndex = 0; if (this.audioPlayer && this.audioPlayer.paused) { const firstTrackVaultPath = this.playlist[this.currentTrackIndex]; const firstTrackAppPath = this.app.vault.adapter.getResourcePath(firstTrackVaultPath); this.audioPlayer.src = firstTrackAppPath; console.log('Set audio source to first track after scan:', firstTrackAppPath); const firstTrackName = firstTrackVaultPath.split('/').pop() || 'Unknown Track'; this.updateStatusBar(`Lofi Ready || ${firstTrackName}`); } else if (this.audioPlayer && !this.audioPlayer.paused) { console.log(`Audio already playing. Found ${this.playlist.length} tracks. Set index to 0 for new playlist.`); } this.setPlaybackControlsVisibility(true); }
                else { if (this.audioPlayer) { this.audioPlayer.src = ''; } this.currentTrackIndex = -1; this.updateStatusBar('Lofi: No files found'); this.setPlaybackControlsVisibility(false); }
            } else { console.error('The specified path is not a valid folder:', normalizedFolderPath); new Notice(`Error: "${folderPath}" is not a valid folder.`); this.updateStatusBar('Lofi: Invalid folder'); if (this.audioPlayer) { this.audioPlayer.src = ''; } this.currentTrackIndex = -1; this.setPlaybackControlsVisibility(false); }
        } catch (error) { console.error('Error scanning audio folder:', error); new Notice(`Error scanning folder "${folderPath}". Check console for details.`); this.updateStatusBar('Lofi: Scan Error'); if (this.audioPlayer) { this.audioPlayer.src = ''; } this.currentTrackIndex = -1; this.setPlaybackControlsVisibility(false); }
    }
    public playTrackByPath(trackVaultPath: string): void { /* ... existing code ... */
         if (!this.audioPlayer || this.playlist.length === 0) { new Notice('Cannot play track: Audio player not ready or playlist is empty.'); this.updateStatusBar('Lofi: Play Error'); return; }
        const index = this.playlist.indexOf(trackVaultPath);
        if (index === -1) { console.error('Attempted to play track not found in playlist:', trackVaultPath); new Notice('Error: Selected track not found in playlist.'); this.updateStatusBar('Lofi: Track Error'); return; }
        this.currentTrackIndex = index; const trackAppPath = this.app.vault.adapter.getResourcePath(trackVaultPath); this.audioPlayer.src = trackAppPath;
         this.audioPlayer.play().then(() => { const trackName = trackVaultPath.split('/').pop() || 'Unknown Track'; new Notice(`Playing: ${trackName}`); this.updateStatusBar(`Playing: ${trackName}`); }).catch(error => { console.error('Error playing selected track:', error); new Notice(`Failed to play "${trackVaultPath.split('/').pop()}". Check console.`); this.updateStatusBar('Lofi: Playback Error'); });
    }
    public playNextTrack(): void { /* ... existing code ... */
        if (!this.audioPlayer || this.playlist.length <= 1) { console.warn('Cannot play next track: Playlist has less than 2 tracks.'); if (this.playlist.length === 0) { new Notice('Cannot play next track: Playlist is empty.'); this.updateStatusBar('Lofi: Playlist Empty'); } else { new Notice('Cannot play next track: Only one track in playlist.'); this.updateStatusBar('Lofi: Single Track'); } return; }
        this.currentTrackIndex++; if (this.currentTrackIndex >= this.playlist.length) { this.currentTrackIndex = 0; }
        const nextTrackVaultPath = this.playlist[this.currentTrackIndex]; console.log('Playing next track (index):', this.currentTrackIndex, nextTrackVaultPath); this.playTrackByPath(nextTrackVaultPath);
    }
    public playPreviousTrack(): void { /* ... existing code ... */
        if (!this.audioPlayer || this.playlist.length <= 1) { console.warn('Cannot play previous track: Playlist has less than 2 tracks.'); if (this.playlist.length === 0) { new Notice('Cannot play previous track: Playlist is empty.'); this.updateStatusBar('Lofi: Playlist Empty'); } else { new Notice('Cannot play previous track: Only one track in playlist.'); this.updateStatusBar('Lofi: Single Track'); } return; }
        this.currentTrackIndex--; if (this.currentTrackIndex < 0) { this.currentTrackIndex = this.playlist.length - 1; }
        const previousTrackVaultPath = this.playlist[this.currentTrackIndex]; console.log('Playing previous track (index):', this.currentTrackIndex, previousTrackVaultPath); this.playTrackByPath(previousTrackVaultPath);
    }
    public setPlaybackControlsVisibility(visible: boolean): void { /* ... existing code ... */
        if (this.prevButtonEl) { this.prevButtonEl.style.display = visible ? '' : 'none'; }
        if (this.playPauseButtonEl) { this.playPauseButtonEl.style.display = visible ? '' : 'none'; }
        if (this.nextButtonEl) { this.nextButtonEl.style.display = visible ? '' : 'none'; }
    }
    public getCurrentTrackIndex(): number { /* ... existing code ... */
        return this.currentTrackIndex;
    }
	getRandomNumber(min: number = 10000, max: number = 99999) { /* ... existing code ... */
		return Math.floor(Math.random() * (max - min) + min);
	}


    // --- Focus Timer Core Methods ---
    public startTimer(): void { /* ... existing code ... */
        if (this.timerState === 'working' || this.timerState === 'resting') { console.log('Timer already running.'); return; }
        if (this.timerState === 'stopped') { const workDur = this.settings.workDuration > 0 ? this.settings.workDuration : DEFAULT_LOFI_SETTINGS.workDuration; this.currentSessionType = 'work'; this.remainingTime = workDur * 60; console.log(`Starting new work session (${workDur} minutes).`); new Notice(`Starting work session (${workDur} minutes)!`); }
        else if (this.timerState === 'paused') { console.log(`Resuming ${this.currentSessionType} session.`); new Notice(`Resuming ${this.currentSessionType} session!`); }
        this.timerState = this.currentSessionType === 'work' ? 'working' : 'resting';
        if (this.timerIntervalId !== null) { clearInterval(this.timerIntervalId); }
        this.timerIntervalId = window.setInterval(() => { this.tick(); }, 1000);
        this.updateTimerDisplay(); this.updateTimerControls(); this.setTimerControlsVisibility(true);
    }
    public pauseTimer(): void { /* ... existing code ... */
        if (this.timerState !== 'working' && this.timerState !== 'resting') { console.log('Timer is not running to pause.'); return; }
        if (this.timerIntervalId !== null) { clearInterval(this.timerIntervalId); this.timerIntervalId = null; }
        this.timerState = 'paused'; console.log('Timer paused.'); new Notice('Timer paused.');
        this.updateTimerDisplay(); this.updateTimerControls();
    }
     public resetTimer(): void { /* ... existing code ... */
         if (this.timerState === 'stopped' && this.remainingTime === 0) { console.log('Timer already reset.'); return; }
        if (this.timerIntervalId !== null) { clearInterval(this.timerIntervalId); this.timerIntervalId = null; }
        this.timerState = 'stopped'; this.remainingTime = 0; this.currentSessionType = 'work'; console.log('Timer reset.'); new Notice('Timer reset.');
        this.updateTimerDisplay(); this.updateTimerControls();
    }
    private tick(): void { /* ... existing code ... */
        if (this.timerState === 'working' || this.timerState === 'resting') {
            this.remainingTime--;
            if (this.remainingTime <= 0) { this.remainingTime = 0; this.endSession(); }
            this.updateTimerDisplay();
        }
    }
    private endSession(): void { /* ... existing code ... */
        if (this.timerIntervalId !== null) { clearInterval(this.timerIntervalId); this.timerIntervalId = null; }
        const sessionEndedMessage = `${this.currentSessionType.charAt(0).toUpperCase() + this.currentSessionType.slice(1)} session ended!`; new Notice(sessionEndedMessage); console.log(sessionEndedMessage);
        if (this.currentSessionType === 'work') { this.currentSessionType = 'rest'; this.timerState = 'stopped'; this.startTimer(); }
        else { this.currentSessionType = 'work'; this.timerState = 'stopped'; this.startTimer(); }
        this.updateTimerDisplay(); this.updateTimerControls();
    }
    private updateTimerDisplay(): void { /* ... existing code ... */
        if (this.timerDisplayEl) {
            const minutes = Math.floor(this.remainingTime / 60); const seconds = this.remainingTime % 60;
            const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            let displayStatus = '';
            switch (this.timerState) {
                case 'stopped': displayStatus = 'Timer: Stopped'; break;
                case 'working': displayStatus = `Work: ${formattedTime}`; break;
                case 'resting': displayStatus = `Rest: ${formattedTime}`; break;
                case 'paused': displayStatus = `${this.currentSessionType.charAt(0).toUpperCase() + this.currentSessionType.slice(1)}: Paused (${formattedTime})`; break;
            }
            this.timerDisplayEl.setText(displayStatus);
        }
    }
    private updateTimerControls(): void { /* ... existing code ... */
        if (this.timerPlayPauseButtonEl) {
            if (this.timerState === 'stopped' || this.timerState === 'paused') { this.timerPlayPauseButtonEl.setText('▶'); this.timerPlayPauseButtonEl.ariaLabel = 'Start Timer'; }
            else { this.timerPlayPauseButtonEl.setText('❚❚'); this.timerPlayPauseButtonEl.ariaLabel = 'Pause Timer'; }
             this.timerPlayPauseButtonEl.style.display = ''; // Always show play/pause
        }
         if (this.timerResetButtonEl) {
            const isFullyReset = this.timerState === 'stopped' && this.remainingTime === 0;
             this.timerResetButtonEl.style.display = isFullyReset ? 'none' : ''; // Hide reset if fully reset
         }
    }
     public setTimerControlsVisibility(visible: boolean): void { /* ... existing code ... */
         // NOTE: updateTimerControls now handles show/hide for reset button when fully reset.
         // This method can still be used for a global hide/show if needed later.
         if (this.timerDisplayEl) { this.timerDisplayEl.style.display = visible ? '' : 'none'; }
         if (this.timerPlayPauseButtonEl) { this.timerPlayPauseButtonEl.style.display = visible ? '' : 'none'; }
         if (this.timerResetButtonEl) { // Only hide/show if updateTimerControls isn't hiding it already
             const isFullyReset = this.timerState === 'stopped' && this.remainingTime === 0;
              if (!isFullyReset || visible) { // Only show if 'visible' is true OR if it's not fully reset
                 this.timerResetButtonEl.style.display = visible ? '' : 'none';
              }
         }
     }


    // --- NEW: Animation Core Methods ---

    // Private helper to set up the animation canvas element
    private setupAnimationCanvas(): void {
        // Create a new canvas element
        this.animationCanvas = document.createElement('canvas');

        // Set basic styles to make it a fixed overlay covering the viewport
        this.animationCanvas.style.position = 'fixed';
        this.animationCanvas.style.top = '0';
        this.animationCanvas.style.left = '0';
        this.animationCanvas.style.width = '100%';
        this.animationCanvas.style.height = '100%';
        // Set a z-index low enough to be behind Obsidian's UI (panels, modals) but above the background
        // Obsidian panels often use z-index > 10. Let's try 0 or 1.
        this.animationCanvas.style.zIndex = '0'; // Or '1' if '0' is too low
        this.animationCanvas.style.pointerEvents = 'none'; // Make it ignore mouse events so clicks pass through

        // Append the canvas to the document body
        document.body.appendChild(this.animationCanvas);

        // Get the 2D rendering context for drawing
        this.animationContext = this.animationCanvas.getContext('2d');

        // Set the canvas dimensions to match the window dimensions initially
        this.handleCanvasResize();
    }

    // Private helper to clean up and remove the animation canvas
    private teardownAnimationCanvas(): void {
        if (this.animationCanvas && this.animationCanvas.parentElement) {
            // Remove the canvas element from the DOM
            this.animationCanvas.parentElement.removeChild(this.animationCanvas);
            // Clear the references
            this.animationCanvas = null;
            this.animationContext = null;
        }
    }

     // Handle canvas resizing when the window or workspace is resized
    private handleCanvasResize(): void {
        if (this.animationCanvas && this.animationContext) {
            // Update the canvas's internal drawing buffer size to match its display size
            // Use clientWidth/clientHeight which reflect the element's size in the DOM
            this.animationCanvas.width = this.animationCanvas.clientWidth;
            this.animationCanvas.height = this.animationCanvas.clientHeight;

            // Optional: If you had elements tied to specific coordinates,
            // you might need to reposition or re-create them here upon resize.
            // For a simple falling animation, this might not be strictly necessary
            // but it's good practice. Let's just log for now.
            console.log(`Canvas resized to ${this.animationCanvas.width}x${this.animationCanvas.height}`);

            // Note: If the animation was running, the next frame will draw to the resized canvas.
            // If it was paused/stopped, it will be ready for the next start.
        }
    }


    // Public method to start the animation loop
    public startAnimation(): void {
         // Only start if animation is enabled in settings and not already running
        if (!this.settings.animationEnabled || this.animationFrameId !== null) {
             console.log('Animation not enabled or already running.');
             return;
        }
        if (!this.animationContext) {
             console.error('Animation canvas context not available.');
             return;
        }

        console.log('Starting animation.');
        this.animatedElements = []; // Clear elements when starting (optional, depends on desired behavior)
        this.lastFrameTime = performance.now(); // Initialize last frame time

        // Start the animation loop using requestAnimationFrame
        // Pass a reference to the animationLoop method, bound to 'this' plugin instance
        this.animationFrameId = requestAnimationFrame(this.animationLoop.bind(this));

        // Optional: Show a notice? Probably too intrusive for just starting background animation.
        // new Notice('Animation started.');
    }

    // Public method to stop the animation loop
    public stopAnimation(): void {
        // Only stop if animation is currently running
        if (this.animationFrameId === null) {
             console.log('Animation not running to stop.');
             return;
        }

        console.log('Stopping animation.');
        // Cancel the animation frame request
        cancelAnimationFrame(this.animationFrameId);

        // Reset the animation frame ID
        this.animationFrameId = null;

        // Optional: Clear the canvas when stopping
        if (this.animationContext && this.animationCanvas) {
             this.animationContext.clearRect(0, 0, this.animationCanvas.width, this.animationCanvas.height);
        }
         // Optional: Show a notice?
        // new Notice('Animation stopped.');
    }

    // The main animation loop function, called by requestAnimationFrame
    private animationLoop(timestamp: number): void {
        // Calculate delta time in seconds
        const deltaTime = (timestamp - this.lastFrameTime) / 1000;
        this.lastFrameTime = timestamp;

        if (!this.animationContext || !this.animationCanvas) {
             console.error('Animation context or canvas missing during loop.');
             this.stopAnimation(); // Stop the loop if context is lost
             return;
        }

        const ctx = this.animationContext;
        const canvasWidth = this.animationCanvas.width;
        const canvasHeight = this.animationCanvas.height;

        // --- Update ---
        // Add new elements periodically (e.g., every few seconds or based on a chance per frame)
        // Simple logic: Add a new circle with a small chance each frame
        if (Math.random() < 0.5 * deltaTime) { // Adjust 0.5 for density (lower = less frequent)
             this.animatedElements.push(this.createAnimatedElement(canvasWidth, canvasHeight));
        }

        // Update positions and states of existing elements
        this.animatedElements.forEach(element => {
             this.updateAnimatedElement(element, deltaTime);
        });

        // Remove elements that have fallen off the screen
        this.animatedElements = this.animatedElements.filter(element => element.y - element.radius < canvasHeight);


        // --- Draw ---
        // Clear the entire canvas before drawing the new frame
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Draw each animated element
        this.animatedElements.forEach(element => {
             this.drawAnimatedElement(element, ctx);
        });


        // --- Loop ---
        // Request the next animation frame, only if the animation is still active
        if (this.animationFrameId !== null) { // Check if stopAnimation hasn't cleared the ID
             this.animationFrameId = requestAnimationFrame(this.animationLoop.bind(this));
        }
    }

    // Helper to create a single animated element (e.g., a falling circle)
    private createAnimatedElement(canvasWidth: number, canvasHeight: number): AnimatedElement {
         const radius = Math.random() * 3 + 1; // Random size between 1 and 4
         const speed = Math.random() * 50 + 30; // Random speed between 30 and 80 pixels/second
        // Start at a random x position slightly above the top of the canvas
        const startX = Math.random() * canvasWidth;
        const startY = -radius; // Start just above the top edge

        // Simple random color with transparency (e.g., shades of orange/yellow/red for leaves, blue/grey for rain)
        const hue = Math.random() * 60; // Hue between 0 (red) and 60 (yellow) for leaf-like colors
        const color = `hsla(${hue}, 70%, 50%, ${Math.random() * 0.3 + 0.2})`; // HSL color with random opacity (0.2 to 0.5)

        // For rain, you might use blue/grey hues: `hsla(200, ${Math.random() * 30 + 50}%, ${Math.random() * 20 + 70}%, ${Math.random() * 0.3 + 0.5})`;


        return {
             x: startX,
             y: startY,
             radius: radius,
             speed: speed,
             color: color,
        };
    }

    // Helper to update the state of an animated element for the next frame
    private updateAnimatedElement(element: AnimatedElement, deltaTime: number): void {
        // Update y position based on speed and delta time
        element.y += element.speed * deltaTime;

        // Optional: Add horizontal sway or other effects here
        // element.x += Math.sin(element.y / 100) * 0.5; // Simple sine wave sway
    }

    // Helper to draw a single animated element on the canvas
    private drawAnimatedElement(element: AnimatedElement, context: CanvasRenderingContext2D): void {
        context.fillStyle = element.color; // Set the drawing color (including transparency)
        context.beginPath(); // Start drawing a new shape
        // Draw a circle (arc from 0 to 2*PI)
        context.arc(element.x, element.y, element.radius, 0, Math.PI * 2);
        context.fill(); // Fill the circle with the current fillStyle
    }

    // Controls the visibility of the timer status bar items.
     public setTimerControlsVisibility(visible: boolean): void { /* ... existing code ... */
         if (this.timerDisplayEl) { this.timerDisplayEl.style.display = visible ? '' : 'none'; }
         if (this.timerPlayPauseButtonEl) { this.timerPlayPauseButtonEl.style.display = visible ? '' : 'none'; }
         if (this.timerResetButtonEl) {
             const isFullyReset = this.timerState === 'stopped' && this.remainingTime === 0;
              if (!isFullyReset || visible) { // Only show if 'visible' is true OR if it's not fully reset
                 this.timerResetButtonEl.style.display = visible ? '' : 'none';
              }
         }
     }
    // --- END NEW: Animation Core Methods ---

} 