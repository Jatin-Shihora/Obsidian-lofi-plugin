import {
	App,
	PluginSettingTab,
	Setting,
	Notice,
	normalizePath,
	TFolder,
	TFile,
} from "obsidian";

import LofiPlugin from "./main";
import { PREDEFINED_LOFI_STREAMS } from "./streams";

export class LofiSettingTab extends PluginSettingTab {
	plugin: LofiPlugin;

	private currentBrowsePath: string;
	private folderListEl: HTMLElement;
	private currentPathEl: HTMLElement;
	private trackListEl: HTMLElement;

	constructor(app: App, plugin: LofiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.currentBrowsePath = normalizePath(
			this.plugin.settings.audioFolderPath || ""
		);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Lofi plugin").setHeading();

		new Setting(containerEl).setName("Audio").setHeading();
		new Setting(containerEl).setName("Audio source").setHeading();

		const streamOptions: Record<string, string> = {};
		PREDEFINED_LOFI_STREAMS.forEach((stream) => {
			streamOptions[stream.id] = stream.name;
		});

		new Setting(containerEl)
			.setName("Select audio source")
			.setDesc(
				"Choose between playing local files or a predefined online stream"
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(streamOptions)
					.setValue(this.plugin.settings.activeStreamId || "local")
					.onChange(async (value) => {
						this.plugin.settings.activeStreamId =
							value === "local" ? null : value;
						await this.plugin.saveSettings();

						if (value === "local") {
							await this.plugin.activateStream(null);
							this.renderFolderContents(
								this.plugin.settings.audioFolderPath
							);
							this.renderTrackList();
							this.localFolderSettingContainer.setCssProps({
								display: "block"
							});
							this.localFolderBrowserContainer.setCssProps({
								display: "block"
							});
						} else {
							await this.plugin.activateStream(value);
							this.localFolderSettingContainer.setCssProps({
								display: "none"
							});
							this.localFolderBrowserContainer.setCssProps({
								display: "none"
							});
							this.trackListEl.empty();
						}
					})
			);

		const localSourceContainer = containerEl.createDiv();
		this.localFolderSettingContainer = localSourceContainer.createDiv();
		this.localFolderBrowserContainer = localSourceContainer.createDiv();

		new Setting(containerEl)
			.setName("Volume")
			.setDesc("Adjust the lofi playback volume")
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 1)
					.setValue(this.plugin.settings.volume)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.volume = value;
						await this.plugin.saveSettings();
						this.plugin.setVolume(value);
					})
			);

		new Setting(this.localFolderBrowserContainer).setName("Local audio folder location").setHeading();

		const navContainer = this.localFolderBrowserContainer.createDiv(
			"lofi-folder-browser-nav"
		);
		this.currentPathEl = navContainer.createEl("span", {
			text: "Loading...",
			cls: "lofi-browser-current-path",
		});
		const upButton = navContainer.createEl("button", {
			text: "Up",
			cls: "lofi-browser-up-button",
		});
		const selectButton = navContainer.createEl("button", {
			text: "Select this folder",
			cls: "lofi-browser-select-button",
		});

		this.localFolderBrowserContainer.createEl("p", { text: "Contents:" });

		this.folderListEl = this.localFolderBrowserContainer.createDiv(
			"lofi-folder-browser-list"
		);

		if (this.plugin.settings.activeStreamId === null) {
			this.renderFolderContents(this.currentBrowsePath);
		} else {
			this.currentPathEl.setText("Local folder browser (hidden)");
			this.folderListEl.empty();
		}

		upButton.addEventListener("click", () => {
			this.navigateUp();
		});
		selectButton.addEventListener("click", () => {
			void this.selectCurrentFolder();
		});

		new Setting(this.localFolderBrowserContainer).setName("Found local tracks").setHeading();
		this.localFolderBrowserContainer.createEl("p", {
			text: "Click a track to play:",
		});
		this.trackListEl =
			this.localFolderBrowserContainer.createDiv("lofi-track-list");

		if (this.plugin.settings.activeStreamId === null) {
			this.renderTrackList();
		} else {
			this.trackListEl.empty();
		}

		containerEl.createEl("hr");

		new Setting(containerEl).setName("Focus timer").setHeading();
		new Setting(containerEl)
			.setName("Work duration (minutes)")
			.setDesc("Set the duration for each focus work session")
			.addText((text) =>
				text
					.setPlaceholder("Say 25")
					.setValue(this.plugin.settings.workDuration.toString())
					.onChange(async (value) => {
						const duration = parseInt(value, 10);
						if (!isNaN(duration) && duration > 0) {
							this.plugin.settings.workDuration = duration;
							await this.plugin.saveSettings();
						} else {
							new Notice(
								"Please enter a valid positive number for work duration."
							);
							text.setValue(
								this.plugin.settings.workDuration.toString()
							);
						}
					})
			);
		new Setting(containerEl)
			.setName("Rest duration in minutes")
			.setDesc("Enter a valid positive number for rest duration.")
			.addText((text) =>
				text
					.setPlaceholder("Say 5")
					.setValue(this.plugin.settings.restDuration.toString())
					.onChange(async (value) => {
						const duration = parseInt(value, 10);
						if (!isNaN(duration) && duration > 0) {
							this.plugin.settings.restDuration = duration;
							await this.plugin.saveSettings();
						} else {
							new Notice(
								"Enter a valid positive number for rest duration."
							);
							text.setValue(
								this.plugin.settings.restDuration.toString()
							);
						}
					})
			);

		containerEl.createEl("hr");

		new Setting(containerEl).setName("Animation").setHeading();
		new Setting(containerEl)
			.setName("Enable background animation")
			.setDesc(
				"Toggle the subtle background animation (falling circles)"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.animationEnabled)
					.onChange(async (value) => {
						this.plugin.settings.animationEnabled = value;
						await this.plugin.saveSettings();
						if (value) {
							this.plugin.startAnimation();
						} else {
							this.plugin.stopAnimation();
						}
					})
			);

		if (this.plugin.settings.activeStreamId !== null) {
			this.localFolderSettingContainer.setCssProps({ display: "none" });
			this.localFolderBrowserContainer.setCssProps({ display: "none" });
		}
	}

	private localFolderSettingContainer: HTMLElement;
	private localFolderBrowserContainer: HTMLElement;

	private renderFolderContents(folderPath: string): void {
		this.folderListEl.empty();
		this.currentPathEl.setText(`Current path: ${folderPath || "/"}`);
		try {
			let folder: TFolder | null;
			if (folderPath === "" || folderPath === "/") {
				folder = this.app.vault.getRoot();
			} else {
				const fileOrFolder =
					this.app.vault.getAbstractFileByPath(folderPath);
				if (fileOrFolder instanceof TFolder) {
					folder = fileOrFolder;
				} else {
					console.error("Invalid path or not a folder:", folderPath);
					this.folderListEl.createEl("div", {
						text: "Invalid folder path.",
						cls: "lofi-browser-error",
					});
					if (
						folderPath === this.currentBrowsePath &&
						folderPath !== ""
					) {
						new Notice(
							`The saved folder path "${folderPath}" is invalid. Displaying vault root instead.`
						);
						this.currentBrowsePath = "";
						this.renderFolderContents("");
					}
					return;
				}
			}
			if (folder.parent) {
				const upButtonEl = this.folderListEl.createDiv(
					"lofi-browser-list-item"
				);
				upButtonEl.addClass("lofi-browser-item-folder");
				upButtonEl.createEl("span", {
					text: "⬆️ ..",
					cls: "lofi-browser-item-name",
				});
				upButtonEl.setCssProps({ cursor: "pointer" });
				upButtonEl.addEventListener("click", () => {
					this.navigateUp();
				});
			}
			const sortedChildren = folder.children.sort((a, b) => {
				const isAFolder = a instanceof TFolder;
				const isBFolder = b instanceof TFolder;
				if (isAFolder && !isBFolder) return -1;
				if (!isAFolder && isBFolder) return 1;
				return a.name.localeCompare(b.name);
			});
			for (const child of sortedChildren) {
				const itemEl = this.folderListEl.createDiv(
					"lofi-browser-list-item"
				);
				const iconEl = itemEl.createEl("span", {
					cls: "lofi-browser-item-icon",
				});
				itemEl.createEl("span", {
					text: child.name,
					cls: "lofi-browser-item-name",
				});
				if (child instanceof TFolder) {
					iconEl.setText("📁");
					itemEl.addClass("lofi-browser-item-folder");
					itemEl.setCssProps({ cursor: "pointer" });
					itemEl.addEventListener("click", () => {
						this.navigateToFolder(child.path);
					});
				} else if (child instanceof TFile) {
					iconEl.setText("📄");
					itemEl.addClass("lofi-browser-item-file");
					itemEl.setCssProps({ cursor: "default" });
				}
			}
		} catch (error) {
			console.error("Error rendering folder contents:", error);
			this.folderListEl.createEl("div", {
				text: "Error loading contents.",
				cls: "lofi-browser-error",
			});
			this.currentPathEl.setText(`Current path: error`);
		}
	}

	private navigateToFolder(folderPath: string): void {
		this.currentBrowsePath = normalizePath(folderPath);
		this.renderFolderContents(this.currentBrowsePath);
	}

	private navigateUp(): void {
		if (this.currentBrowsePath === "" || this.currentBrowsePath === "/") {
			return;
		}
		const currentFolder = this.app.vault.getAbstractFileByPath(
			this.currentBrowsePath
		);
		if (currentFolder instanceof TFolder && currentFolder.parent) {
			const parentPath = currentFolder.parent.path;
			this.currentBrowsePath = normalizePath(parentPath);
			this.renderFolderContents(this.currentBrowsePath);
		} else {
			this.currentBrowsePath = "";
			this.renderFolderContents("");
		}
	}

	private async selectCurrentFolder(): Promise<void> {
		const folder =
			this.currentBrowsePath === ""
				? this.app.vault.getRoot()
				: this.app.vault.getAbstractFileByPath(this.currentBrowsePath);
		if (
			this.currentBrowsePath === "" ||
			this.currentBrowsePath === "/" ||
			folder instanceof TFolder
		) {
			const path = normalizePath(this.currentBrowsePath);
			this.plugin.settings.audioFolderPath = path;
			await this.plugin.saveSettings();

			this.renderTrackList();

			new Notice(`Audio folder set to "${path || "/"}"`);
		} else {
			console.error(
				"Cannot select invalid path as folder:",
				this.currentBrowsePath
			);
			new Notice("Cannot select current path: not a valid folder.");
			this.currentBrowsePath = "";
			this.renderFolderContents("");
			this.renderTrackList();
		}
	}

	private renderTrackList(): void {
		this.trackListEl.empty();
		const playlist = this.plugin.playlist;
		if (playlist.length === 0) {
			this.trackListEl.createEl("div", {
				text: "No mp3 files found in the selected folder.",
				cls: "lofi-track-list-empty",
			});
			return;
		}
		playlist.forEach((trackVaultPath, index) => {
			const trackItemEl = this.trackListEl.createDiv(
				"lofi-track-list-item"
			);
			const trackName =
				trackVaultPath.split("/").pop() || "Unknown track";
			trackItemEl.createEl("span", {
				text: `${index + 1}. ${trackName}`,
				cls: "lofi-track-name",
			});
			trackItemEl.addClass("lofi-track-item-clickable");
			trackItemEl.setCssProps({ cursor: "pointer" });
			trackItemEl.addEventListener("click", () => {
				this.plugin.playTrackByPath(trackVaultPath);
				this.updateTrackListPlayingState(
					this.plugin.getCurrentTrackIndex()
				);
			});
			if (index === this.plugin.getCurrentTrackIndex()) {
				trackItemEl.addClass("lofi-track-item-playing");
			}
		});
	}

	private updateTrackListPlayingState(playingIndex: number): void {
		const items = this.trackListEl.querySelectorAll(
			".lofi-track-list-item"
		);
		items.forEach((item, index) => {
			item.removeClass("lofi-track-item-playing");
			if (index === playingIndex) {
				item.addClass("lofi-track-item-playing");
			}
		});
	}
}
