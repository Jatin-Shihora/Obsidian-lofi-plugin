# Obsidian Lofi Flow Plugin Development Tracker

This document tracks the implementation status of features for the Obsidian Lofi Flow plugin.

## 🎵 Lofi Audio in Background

- [x] **Load/Play Local MP3 Files:**
    - [x] Scan a user-specified folder in the vault for `.mp3` files.
    - [x] Store scanned files as a playlist.
    - [x] Load and play the first track from the playlist on plugin load/scan.
    - [x] Implement a custom folder browser UI in settings to select the audio folder.
    - [x] List found tracks in settings and allow clicking to play a specific track.
- [ ] **Load a default YouTube lofi stream.**
- [x] **Play/Pause Toggle (Ribbon/Command):**
    - [x] Add a ribbon icon to toggle playback.
    - [x] Add a command palette action to toggle playback.
- [ ] **Predefined Default Streams:** Show options like Chill mornings, jazzy afternoons, etc. (Requires defining/managing these sources).
- [x] **Status Bar Integration:**
    - [x] Show plugin status (e.g., Ready, Scanning, Error).
    - [x] Show playback status (Playing, Paused).
    - [x] Display the name of the currently playing local MP3 file.
- [ ] **Auto-reconnect if stream fails.** (Relevant for streaming sources like YouTube, could also apply to errors reloading local files).
- [x] **Volume Control:**
    - [x] Add a volume slider in settings for HTML audio playback.
    - [x] Apply volume setting on load.
    - [x] Update volume immediately when slider changes.
- [ ] **Source Selection in Settings:** Option to choose between local folder, YouTube stream, or predefined defaults.
- [ ] **Subtle Animation (Visualizer):**
    - [ ] Implement animation (e.g., falling leaves, rain) using Canvas or SVG.
    - [ ] Add toggle in settings to turn animation on/off.

## ⏳ Focus Timer

- [X] **Implement Timer Feature:**
    - [x] Customizable work/rest intervals setting.
    - [x] Add UI/logic for timer countdown.
    - [X] Provide an audio or visual cue when a session ends.

---

**Progress:** We have completed the core functionality for playing local MP3 files, including folder Browse, track selection, playback control, status display, and volume control. The Focus Timer and the YouTube/Predefined streams/Animation aspects of the audio feature are the next major areas to develop.

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```
s
## API Documentation

See https://github.com/obsidianmd/obsidian-api
