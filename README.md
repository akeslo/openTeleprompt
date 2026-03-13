# OpenTeleprompter

A minimal, voice-activated teleprompter that lives in your macOS notch.

## Features

- **Voice-activated scroll** — speaks = scrolls, silence = pauses
- **Dynamic Island style** — lives in the notch, expands when active
- **Classic floating mode** — draggable, resizable window
- **Menu bar settings** — opacity, scroll speed, voice sensitivity, screen share toggle
- **Keyboard shortcuts** — `⌘⇧Space` pause, `⌘⇧↑↓` speed, `⌘⇧R` reset
- **Script storage** — scripts saved locally, reload anytime
- **Screen share invisible** — toggle to hide from viewers and screenshots
- **Hover to pause** — hover over prompter to instantly pause
- **Font size control** — A+/A− buttons in the reading view

## Stack

- Electron (no framework, vanilla JS)
- Web Audio API for voice detection
- macOS native TCC mic permissions

## Run

```bash
npm install
npm start
```

Or launch via the signed Electron binary for mic permissions:

```bash
open node_modules/electron/dist/Electron.app --args "$(pwd)"
```

## Usage

1. Click **✦** in your menu bar
2. Toggle **Show Prompter** on
3. Click the pill → paste your script → hit **Go**
4. Speak — the prompter scrolls as you talk, pauses when you stop

## Settings

- **Opacity** — make it semi-transparent to see through to your camera
- **Voice Sensitivity** — adjust the mic threshold for your environment
- **Scroll Speed** — 0.25× to 2× multiplier on base reading pace
- **Style** — Notch (top center) or Classic (floating, draggable)
- **Hide on screen share** — invisible to viewers during calls
