import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	normalizePath,
	TFolder,
	TFile,
} from "obsidian";
import { LofiPluginSettings } from "./types";
import { DEFAULT_LOFI_SETTINGS } from "./defaults";
import { SampleModal } from "./modal";
import { LofiSettingTab } from "./settings-tab";
import { getStreamById } from "./streams";

type TimerState = "stopped" | "working" | "resting" | "paused";
type SessionType = "work" | "rest";

interface AnimatedElement {
	x: number;
	y: number;
	radius: number;
	speed: number;
	color: string;
}
export default class LofiPlugin extends Plugin {
	settings: LofiPluginSettings;
	private audioPlayer: HTMLAudioElement | null = null;
	private statusBarItemEl: HTMLElement | null = null;
	private prevButtonEl: HTMLElement | null = null;
	private playPauseButtonEl: HTMLElement | null = null;
	private nextButtonEl: HTMLElement | null = null;

	public playlist: string[] = [];
	private currentTrackIndex: number = -1;

	private timerState: TimerState = "stopped";
	private remainingTime: number = 0;
	private timerIntervalId: number | null = null;
	private currentSessionType: SessionType = "work";

	private timerDisplayEl: HTMLElement | null = null;
	private timerPlayPauseButtonEl: HTMLElement | null = null;
	private timerResetButtonEl: HTMLElement | null = null;

	private animationCanvas: HTMLCanvasElement | null = null;
	private animationContext: CanvasRenderingContext2D | null = null;
	private animationFrameId: number | null = null;
	private animatedElements: AnimatedElement[] = [];
	private lastFrameTime: number = 0;
	private animationSpawnRate: number = 20;
	async onload() {
		await this.loadSettings();

		this.audioPlayer = new Audio();

		this.audioPlayer.addEventListener("ended", () => {
			const activeStream = getStreamById(this.settings.activeStreamId);
			if (!activeStream || activeStream.id === "local") {
				this.playNextTrack();
			}
		});

		this.audioPlayer.addEventListener("play", () => {
			this.updatePlayPauseButton(true);
		});

		this.audioPlayer.addEventListener("pause", () => {
			this.updatePlayPauseButton(false);
		});

		this.setVolume(this.settings.volume);

		const initialStreamId = this.settings.activeStreamId;

		if (initialStreamId !== null) {
			this.activateStream(initialStreamId);
		} else {
			if (this.settings.audioFolderPath) {
				const normalizedPath = normalizePath(
					this.settings.audioFolderPath
				);
				await this.scanAudioFolder(normalizedPath);
			} else {
				this.updateStatusBar("Lofi: No folder set");
			}

			if (this.playlist.length > 0 && this.audioPlayer) {
				if (
					this.currentTrackIndex === -1 ||
					this.currentTrackIndex >= this.playlist.length
				) {
					this.currentTrackIndex = 0;
				}
				const initialTrackVaultPath =
					this.playlist[this.currentTrackIndex];
				const initialTrackAppPath =
					this.app.vault.adapter.getResourcePath(
						initialTrackVaultPath
					);
				this.audioPlayer.src = initialTrackAppPath;
				const initialTrackName =
					initialTrackVaultPath.split("/").pop() || "Unknown Track";
				this.updateStatusBar(`Lofi Ready || ${initialTrackName}`);
			} else if (this.settings.audioFolderPath) {
				this.updateStatusBar("Lofi: No files found");
			}
			this.setPlaybackControlsVisibility(this.playlist.length > 0);
		}

		const ribbonIconEl = this.addRibbonIcon(
			"music",
			"Toggle Lofi Playback",
			() => this.togglePlayback()
		);
		ribbonIconEl.addClass("lofi-plugin-ribbon-icon");

		this.statusBarItemEl = this.addStatusBarItem();

		this.prevButtonEl = this.addStatusBarItem();
		this.prevButtonEl.addClass("lofi-control-button");
		this.prevButtonEl.addClass("lofi-prev-button");
		this.prevButtonEl.setText("⏮");
		this.prevButtonEl.ariaLabel = "Previous Track";
		this.prevButtonEl.addEventListener("click", () =>
			this.playPreviousTrack()
		);

		this.playPauseButtonEl = this.addStatusBarItem();
		this.playPauseButtonEl.addClass("lofi-control-button");
		this.playPauseButtonEl.addClass("lofi-play-pause-button");
		this.updatePlayPauseButton(!this.audioPlayer.paused);
		this.playPauseButtonEl.ariaLabel = "Toggle Playback";
		this.playPauseButtonEl.addEventListener("click", () =>
			this.togglePlayback()
		);

		this.nextButtonEl = this.addStatusBarItem();
		this.nextButtonEl.addClass("lofi-control-button");
		this.nextButtonEl.addClass("lofi-next-button");
		this.nextButtonEl.setText("⏭");
		this.nextButtonEl.ariaLabel = "Next Track";
		this.nextButtonEl.addEventListener("click", () => this.playNextTrack());

		this.timerDisplayEl = this.addStatusBarItem();
		this.timerDisplayEl.addClass("lofi-timer-display");
		this.updateTimerDisplay();

		this.timerPlayPauseButtonEl = this.addStatusBarItem();
		this.timerPlayPauseButtonEl.addClass("lofi-control-button");
		this.timerPlayPauseButtonEl.addClass("lofi-timer-play-pause-button");
		this.updateTimerControls();
		this.timerPlayPauseButtonEl.ariaLabel = "Start Timer";
		this.timerPlayPauseButtonEl.addEventListener("click", () => {
			if (this.timerState === "stopped" || this.timerState === "paused") {
				this.startTimer();
			} else {
				this.pauseTimer();
			}
		});

		this.timerResetButtonEl = this.addStatusBarItem();
		this.timerResetButtonEl.addClass("lofi-control-button");
		this.timerResetButtonEl.addClass("lofi-timer-reset-button");
		this.timerResetButtonEl.setText("🔄");
		this.timerResetButtonEl.ariaLabel = "Reset Timer";
		this.timerResetButtonEl.addEventListener("click", () =>
			this.resetTimer()
		);

		this.addCommand({
			id: "lofi-plugin-toggle-playback",
			name: "Toggle Lofi Playback",
			callback: () => this.togglePlayback(),
		});
		this.addCommand({
			id: "lofi-plugin-play-next-track",
			name: "Play Next Lofi Track",
			callback: () => this.playNextTrack(),
		});
		this.addCommand({
			id: "lofi-plugin-play-previous-track",
			name: "Play Previous Lofi Track",
			callback: () => this.playPreviousTrack(),
		});
		this.addCommand({
			id: "lofi-plugin-start-timer",
			name: "Start Focus Timer",
			callback: () => this.startTimer(),
		});
		this.addCommand({
			id: "lofi-plugin-pause-timer",
			name: "Pause Focus Timer",
			callback: () => this.pauseTimer(),
		});
		this.addCommand({
			id: "lofi-plugin-reset-timer",
			name: "Reset Focus Timer",
			callback: () => this.resetTimer(),
		});

		this.addSettingTab(new LofiSettingTab(this.app, this));

		this.setupAnimationCanvas();
		if (this.settings.animationEnabled) {
			this.startAnimation();
		}
		this.registerDomEvent(window, "resize", () =>
			this.handleCanvasResize()
		);
	}

	onunload() {
		this.updateStatusBar("Lofi Unloaded");

		if (this.audioPlayer) {
			this.audioPlayer.pause();
			this.audioPlayer.src = "";
			this.audioPlayer = null;
		}

		if (this.timerIntervalId !== null) {
			clearInterval(this.timerIntervalId);
		}

		this.stopAnimation();
		this.teardownAnimationCanvas();

		this.statusBarItemEl = null;
		this.prevButtonEl = null;
		this.playPauseButtonEl = null;
		this.nextButtonEl = null;
		this.timerDisplayEl = null;
		this.timerPlayPauseButtonEl = null;
		this.timerResetButtonEl = null;
		this.animationCanvas = null;
		this.animationContext = null;
		this.animationFrameId = null;
		this.animatedElements = [];
		this.lastFrameTime = 0;

		this.playlist = [];
		this.currentTrackIndex = -1;
		this.timerState = "stopped";
		this.remainingTime = 0;
		this.timerIntervalId = null;
		this.currentSessionType = "work";
	}

	async loadSettings() {
		const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_LOFI_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private updateStatusBar(text: string) {
		if (this.statusBarItemEl) {
			this.statusBarItemEl.setText(text);
		}
	}

	public setVolume(volume: number) {
		if (this.audioPlayer) {
			const clampedVolume = Math.max(0, Math.min(100, volume));
			this.audioPlayer.volume = clampedVolume / 100;
		}
	}

	public togglePlayback(): void {
		if (!this.audioPlayer) {
			new Notice("Audio player not initialized.");
			return;
		}

		const activeStream = getStreamById(this.settings.activeStreamId);
		const isPlayingStream = activeStream && activeStream.id !== "local";

		if (this.audioPlayer.paused) {
			this.audioPlayer
				.play()
				.then(() => {
					new Notice("Lofi playing...");
					if (isPlayingStream) {
						this.updateStatusBar(`Playing: ${activeStream.name}`);
					} else {
						const isTrackLoaded =
							this.audioPlayer &&
							this.audioPlayer.src &&
							this.audioPlayer.src !== window.location.href &&
							this.playlist.length > 0 &&
							this.currentTrackIndex !== -1;
						if (isTrackLoaded) {
							const currentTrackPath =
								this.playlist[this.currentTrackIndex];
							const currentTrackName =
								currentTrackPath.split("/").pop() ||
								"Unknown Track";
							this.updateStatusBar(
								`Playing: ${currentTrackName}`
							);
						} else {
							this.updateStatusBar("Lofi Playing...");
						}
					}
				})
				.catch((error) => {
					console.error(
						"Error playing audio (togglePlayback):",
						error
					);
					new Notice("Failed to play Lofi audio. Check console.");
					this.updateStatusBar("Lofi Play Error 😢");
				});
		} else {
			this.audioPlayer.pause();
			new Notice("Lofi paused.");
			if (isPlayingStream) {
				this.updateStatusBar(`Paused: ${activeStream.name}`);
			} else {
				const currentTrackPath = this.playlist[this.currentTrackIndex];
				const currentTrackName = currentTrackPath
					? currentTrackPath.split("/").pop() || "Unknown Track"
					: "No Track";
				this.updateStatusBar(`Lofi Paused || ${currentTrackName}`);
			}
		}
	}

	private updatePlayPauseButton(isPlaying: boolean): void {
		if (this.playPauseButtonEl) {
			this.playPauseButtonEl.setText(isPlaying ? "⏸" : "▶");
			this.playPauseButtonEl.ariaLabel = isPlaying ? "Pause" : "Play";
		}
	}

	public async scanAudioFolder(folderPath: string) {
		this.playlist = [];

		const normalizedFolderPath = normalizePath(folderPath);

		if (this.settings.activeStreamId !== null) {
			this.updateStatusBar("Lofi: Stream Active");
			this.setPlaybackControlsVisibility(false);
			return;
		}

		if (!normalizedFolderPath || normalizedFolderPath === "/") {
			this.updateStatusBar("Lofi: No folder set");
			if (this.audioPlayer) {
				this.audioPlayer.src = "";
			}
			this.currentTrackIndex = -1;
			this.setPlaybackControlsVisibility(false);
			return;
		}

		try {
			const folder =
				this.app.vault.getAbstractFileByPath(normalizedFolderPath);

			if (folder instanceof TFolder) {
				for (const file of folder.children) {
					if (
						file instanceof TFile &&
						file.extension.toLowerCase() === "mp3"
					) {
						this.playlist.push(file.path);
					}
				}
				this.updateStatusBar(
					`Lofi: ${this.playlist.length} files found`
				);

				if (this.playlist.length > 0) {
					this.currentTrackIndex = 0;
					if (this.audioPlayer) {
						const firstTrackVaultPath =
							this.playlist[this.currentTrackIndex];
						const firstTrackAppPath =
							this.app.vault.adapter.getResourcePath(
								firstTrackVaultPath
							);
						this.audioPlayer.src = firstTrackAppPath;
						const firstTrackName =
							firstTrackVaultPath.split("/").pop() ||
							"Unknown Track";
						this.updateStatusBar(`Lofi Ready || ${firstTrackName}`);
					}
					this.setPlaybackControlsVisibility(true);
				} else {
					if (this.audioPlayer) {
						this.audioPlayer.src = "";
					}
					this.currentTrackIndex = -1;
					this.updateStatusBar("Lofi: No local files found");
					this.setPlaybackControlsVisibility(false);
				}
			} else {
				console.error(
					"The specified path is not a valid folder:",
					normalizedFolderPath
				);
				new Notice(`Error: "${folderPath}" is not a valid folder.`);
				this.updateStatusBar("Lofi: Invalid folder");
				if (this.audioPlayer) {
					this.audioPlayer.src = "";
				}
				this.currentTrackIndex = -1;
				this.setPlaybackControlsVisibility(false);
			}
		} catch (error) {
			console.error("Error scanning audio folder:", error);
			new Notice(
				`Error scanning folder "${folderPath}". Check console for details.`
			);
			this.updateStatusBar("Lofi: Scan Error");
			if (this.audioPlayer) {
				this.audioPlayer.src = "";
			}
			this.currentTrackIndex = -1;
			this.setPlaybackControlsVisibility(false);
		}
	}

	public playTrackByPath(trackVaultPath: string): void {
		if (this.settings.activeStreamId !== null) {
			new Notice(
				"Cannot play local track: A stream is currently active."
			);
			return;
		}

		if (!this.audioPlayer || this.playlist.length === 0) {
			new Notice(
				"Cannot play track: Audio player not ready or playlist is empty."
			);
			this.updateStatusBar("Lofi: Play Error");
			return;
		}

		const index = this.playlist.indexOf(trackVaultPath);

		if (index === -1) {
			console.error(
				"Attempted to play track not found in playlist:",
				trackVaultPath
			);
			new Notice("Error: Selected track not found in playlist.");
			this.updateStatusBar("Lofi: Track Error");
			return;
		}

		this.currentTrackIndex = index;
		const trackAppPath =
			this.app.vault.adapter.getResourcePath(trackVaultPath);
		this.audioPlayer.src = trackAppPath;

		this.audioPlayer
			.play()
			.then(() => {
				const trackName =
					trackVaultPath.split("/").pop() || "Unknown Track";
				new Notice(`Playing: ${trackName}`);
				this.updateStatusBar(`Playing: ${trackName}`);
			})
			.catch((error) => {
				console.error("Error playing selected track:", error);
				new Notice(
					`Failed to play "${trackVaultPath
						.split("/")
						.pop()}". Check console.`
				);
				this.updateStatusBar("Lofi: Playback Error");
			});
	}

	public playNextTrack(): void {
		if (this.settings.activeStreamId !== null) {
			return;
		}

		if (!this.audioPlayer || this.playlist.length <= 1) {
			if (this.playlist.length === 0) {
				new Notice("Cannot play next track: Playlist is empty.");
				this.updateStatusBar("Lofi: Playlist Empty");
			} else {
				new Notice(
					"Cannot play next track: Only one track in playlist."
				);
				this.updateStatusBar("Lofi: Single Track");
			}
			return;
		}

		this.currentTrackIndex++;
		if (this.currentTrackIndex >= this.playlist.length) {
			this.currentTrackIndex = 0;
		}

		const nextTrackVaultPath = this.playlist[this.currentTrackIndex];
		this.playTrackByPath(nextTrackVaultPath);
	}

	public playPreviousTrack(): void {
		if (this.settings.activeStreamId !== null) {
			return;
		}

		if (!this.audioPlayer || this.playlist.length <= 1) {
			if (this.playlist.length === 0) {
				new Notice("Cannot play previous track: Playlist is empty.");
				this.updateStatusBar("Lofi: Playlist Empty");
			} else {
				new Notice(
					"Cannot play previous track: Only one track in playlist."
				);
				this.updateStatusBar("Lofi: Single Track");
			}
			return;
		}

		this.currentTrackIndex--;
		if (this.currentTrackIndex < 0) {
			this.currentTrackIndex = this.playlist.length - 1;
		}

		const previousTrackVaultPath = this.playlist[this.currentTrackIndex];
		this.playTrackByPath(previousTrackVaultPath);
	}

	public setPlaybackControlsVisibility(visible: boolean): void {
		const isLocalSourceActive = this.settings.activeStreamId === null;
		const shouldBeVisible = visible && isLocalSourceActive;

		if (this.prevButtonEl) {
			this.prevButtonEl.style.display = shouldBeVisible ? "" : "none";
		}
		if (this.playPauseButtonEl) {
			this.playPauseButtonEl.style.display = visible ? "" : "none";
		}
		if (this.nextButtonEl) {
			this.nextButtonEl.style.display = shouldBeVisible ? "" : "none";
		}
	}

	public getCurrentTrackIndex(): number {
		return this.currentTrackIndex;
	}

	public startTimer(): void {
		if (this.timerState === "working" || this.timerState === "resting") {
			return;
		}
		if (this.timerState === "stopped") {
			const workDur =
				this.settings.workDuration > 0
					? this.settings.workDuration
					: DEFAULT_LOFI_SETTINGS.workDuration;
			this.currentSessionType = "work";
			this.remainingTime = workDur * 60;
			new Notice(`Starting work session (${workDur} minutes)!`);
		} else if (this.timerState === "paused") {
			new Notice(`Resuming ${this.currentSessionType} session!`);
		}
		this.timerState =
			this.currentSessionType === "work" ? "working" : "resting";
		if (this.timerIntervalId !== null) {
			clearInterval(this.timerIntervalId);
		}
		this.timerIntervalId = window.setInterval(() => {
			this.tick();
		}, 1000);
		this.updateTimerDisplay();
		this.updateTimerControls();
	}

	public pauseTimer(): void {
		if (this.timerState !== "working" && this.timerState !== "resting") {
			return;
		}
		if (this.timerIntervalId !== null) {
			clearInterval(this.timerIntervalId);
			this.timerIntervalId = null;
		}
		this.timerState = "paused";
		new Notice("Timer paused.");
		this.updateTimerDisplay();
		this.updateTimerControls();
	}

	public resetTimer(): void {
		if (this.timerState === "stopped" && this.remainingTime === 0) {
			return;
		}
		if (this.timerIntervalId !== null) {
			clearInterval(this.timerIntervalId);
			this.timerIntervalId = null;
		}
		this.timerState = "stopped";
		this.remainingTime = 0;
		this.currentSessionType = "work";
		new Notice("Timer reset.");
		this.updateTimerDisplay();
		this.updateTimerControls();
	}

	private tick(): void {
		if (this.timerState === "working" || this.timerState === "resting") {
			this.remainingTime--;
			if (this.remainingTime <= 0) {
				this.remainingTime = 0;
				this.endSession();
			}
			this.updateTimerDisplay();
		}
	}

	private endSession(): void {
		if (this.timerIntervalId !== null) {
			clearInterval(this.timerIntervalId);
			this.timerIntervalId = null;
		}
		const sessionEndedMessage = `${
			this.currentSessionType.charAt(0).toUpperCase() +
			this.currentSessionType.slice(1)
		} session ended!`;
		new Notice(sessionEndedMessage);
		if (this.currentSessionType === "work") {
			this.currentSessionType = "rest";
			this.timerState = "stopped";
			this.startTimer();
		} else {
			const workDur =
				this.settings.workDuration > 0
					? this.settings.workDuration
					: DEFAULT_LOFI_SETTINGS.workDuration;
			this.currentSessionType = "work";
			this.timerState = "stopped";
			this.startTimer();
		}
		this.updateTimerDisplay();
		this.updateTimerControls();
	}

	private updateTimerDisplay(): void {
		if (this.timerDisplayEl) {
			const minutes = Math.floor(this.remainingTime / 60);
			const seconds = this.remainingTime % 60;
			const formattedTime = `${String(minutes).padStart(2, "0")}:${String(
				seconds
			).padStart(2, "0")}`;
			let displayStatus = "";
			switch (this.timerState) {
				case "stopped":
					displayStatus = "Timer: Stopped";
					break;
				case "working":
					displayStatus = `Work: ${formattedTime}`;
					break;
				case "resting":
					displayStatus = `Rest: ${formattedTime}`;
					break;
				case "paused":
					displayStatus = `${
						this.currentSessionType.charAt(0).toUpperCase() +
						this.currentSessionType.slice(1)
					}: Paused (${formattedTime})`;
					break;
			}
			this.timerDisplayEl.setText(displayStatus);
		}
	}

	private updateTimerControls(): void {
		if (this.timerPlayPauseButtonEl) {
			if (this.timerState === "stopped" || this.timerState === "paused") {
				this.timerPlayPauseButtonEl.setText("▶");
				this.timerPlayPauseButtonEl.ariaLabel = "Start Timer";
			} else {
				this.timerPlayPauseButtonEl.setText("⏸");
				this.timerPlayPauseButtonEl.ariaLabel = "Pause Timer";
			}
			this.timerPlayPauseButtonEl.style.display = "";
		}
		if (this.timerResetButtonEl) {
			const isFullyReset =
				this.timerState === "stopped" && this.remainingTime === 0;
			this.timerResetButtonEl.style.display = isFullyReset ? "none" : "";
		}
	}

	public setTimerControlsVisibility(visible: boolean): void {
		if (this.timerDisplayEl) {
			this.timerDisplayEl.style.display = visible ? "" : "none";
		}
		if (this.timerPlayPauseButtonEl) {
			this.timerPlayPauseButtonEl.style.display = visible ? "" : "none";
		}
		if (this.timerResetButtonEl) {
			const isFullyReset =
				this.timerState === "stopped" && this.remainingTime === 0;
			if (visible && !isFullyReset) {
				this.timerResetButtonEl.style.display = "";
			} else {
				this.timerResetButtonEl.style.display = "none";
			}
		}
	}

	private setupAnimationCanvas(): void {
		this.animationCanvas = document.createElement("canvas");
		this.animationCanvas.style.position = "fixed";
		this.animationCanvas.style.top = "0";
		this.animationCanvas.style.left = "0";
		this.animationCanvas.style.width = "100%";
		this.animationCanvas.style.height = "100%";
		this.animationCanvas.style.zIndex = "0";
		this.animationCanvas.style.pointerEvents = "none";
		this.animationCanvas.classList.add("lofi-animation-canvas");
		document.body.appendChild(this.animationCanvas);
		this.animationContext = this.animationCanvas.getContext("2d");
		this.handleCanvasResize();
	}

	private teardownAnimationCanvas(): void {
		if (this.animationCanvas && this.animationCanvas.parentElement) {
			this.animationCanvas.parentElement.removeChild(
				this.animationCanvas
			);
			this.animationCanvas = null;
			this.animationContext = null;
		}
	}

	private handleCanvasResize(): void {
		if (this.animationCanvas && this.animationContext) {
			this.animationCanvas.width = this.animationCanvas.clientWidth;
			this.animationCanvas.height = this.animationCanvas.clientHeight;
		}
	}

	public startAnimation(): void {
		if (!this.settings.animationEnabled || this.animationFrameId !== null) {
			return;
		}
		if (!this.animationContext || !this.animationCanvas) {
			console.error("Animation canvas context not available.");
			this.setupAnimationCanvas();
			if (!this.animationContext) return;
		}
		this.lastFrameTime = performance.now();
		this.animationFrameId = requestAnimationFrame(
			this.animationLoop.bind(this)
		);
	}

	public stopAnimation(): void {
		if (this.animationFrameId === null) {
			return;
		}
		cancelAnimationFrame(this.animationFrameId);
		this.animationFrameId = null;
		if (this.animationContext && this.animationCanvas) {
			this.animationContext.clearRect(
				0,
				0,
				this.animationCanvas.width,
				this.animationCanvas.height
			);
		}
		this.animatedElements = [];
	}

	private animationLoop(timestamp: number): void {
		const deltaTime = (timestamp - this.lastFrameTime) / 1000;
		this.lastFrameTime = timestamp;
		if (!this.animationContext || !this.animationCanvas) {
			console.error("Animation context or canvas missing during loop.");
			this.stopAnimation();
			return;
		}
		const ctx = this.animationContext;
		const canvasWidth = this.animationCanvas.width;
		const canvasHeight = this.animationCanvas.height;

		const numElementsToSpawn = Math.floor(
			this.animationSpawnRate * deltaTime
		);
		for (let i = 0; i < numElementsToSpawn; i++) {
			this.animatedElements.push(
				this.createAnimatedElement(canvasWidth, canvasHeight)
			);
		}
		this.animatedElements.forEach((element) => {
			this.updateAnimatedElement(element, deltaTime);
		});
		this.animatedElements = this.animatedElements.filter(
			(element) => element.y - element.radius < canvasHeight
		);

		ctx.clearRect(0, 0, canvasWidth, canvasHeight);
		this.animatedElements.forEach((element) => {
			this.drawAnimatedElement(element, ctx);
		});

		if (this.animationFrameId !== null) {
			this.animationFrameId = requestAnimationFrame(
				this.animationLoop.bind(this)
			);
		}
	}

	private createAnimatedElement(
		canvasWidth: number,
		canvasHeight: number
	): AnimatedElement {
		const radius = Math.random() * 3 + 1;
		const speed = Math.random() * 50 + 30;
		const startX = Math.random() * canvasWidth;
		const startY = -radius;
		const hue = Math.random() * 60;
		const color = `hsla(${hue}, 70%, 50%, ${Math.random() * 0.3 + 0.2})`;
		return {
			x: startX,
			y: startY,
			radius: radius,
			speed: speed,
			color: color,
		};
	}

	private updateAnimatedElement(
		element: AnimatedElement,
		deltaTime: number
	): void {
		element.y += element.speed * deltaTime;
	}

	private drawAnimatedElement(
		element: AnimatedElement,
		context: CanvasRenderingContext2D
	): void {
		context.fillStyle = element.color;
		context.beginPath();
		context.arc(element.x, element.y, element.radius, 0, Math.PI * 2);
		context.fill();
	}

	public async activateStream(streamId: string | null): Promise<void> {
		if (this.audioPlayer && !this.audioPlayer.paused) {
			this.audioPlayer.pause();
		}
		if (this.audioPlayer) {
			this.audioPlayer.src = "";
		}

		this.playlist = [];
		this.currentTrackIndex = -1;

		const selectedStream = getStreamById(streamId);

		if (selectedStream && selectedStream.id !== "local") {
			this.settings.activeStreamId = selectedStream.id;

			if (this.audioPlayer) {
				this.audioPlayer.src = selectedStream.url;
				this.audioPlayer
					.play()
					.then(() => {
						new Notice(`Playing stream: ${selectedStream.name}`);
						this.updateStatusBar(`Stream: ${selectedStream.name}`);
						this.setPlaybackControlsVisibility(true);
					})
					.catch((error) => {
						console.error("Error playing stream:", error);
						new Notice(
							`Failed to play stream: ${selectedStream.name}. Check console.`
						);
						this.updateStatusBar(
							`Stream Error: ${selectedStream.name}`
						);
						this.setPlaybackControlsVisibility(true);
					});
			} else {
				console.error("Audio player not initialized to play stream.");
				new Notice("Audio player error. Cannot play stream.");
				this.updateStatusBar("Lofi Error");
				this.setPlaybackControlsVisibility(true);
			}
		} else {
			this.settings.activeStreamId = null;
			this.updateStatusBar("Lofi: Loading local files...");
			await this.scanAudioFolder(this.settings.audioFolderPath);
		}

		await this.saveSettings();
	}
}
