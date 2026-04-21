# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Full Tauri app (frontend + Rust backend, hot reload)
npm run dev:vite         # Frontend only on port 1420 (faster, no Rust compile)
npm run build            # Full macOS production build → .dmg
npm run build:frontend   # Vite-only build → dist/
npm run build:win        # Windows cross-compile (x86_64-pc-windows-msvc)
npm run snap:save        # Save golden snapshots for notch UI regression tests
npm run snap:check       # Compare current notch UI against saved snapshots
```

No linter or type checker — vanilla JavaScript throughout.

Snapshot tests require dev server running on port 1420 (`npm run dev:vite`) before running snap commands.

## Architecture

**Desktop teleprompter app** — React 19 frontend + Tauri 2 (Rust) backend. macOS-first with notch support via direct Objective-C APIs. No cloud, no database — everything local.

### Frontend (`/src/`)
- **Views:** `IdleView` → `EditView` → `ReadView` (main flow), `SettingsView`
- **State:** Single Zustand store at `src/store/useAppStore.js` — all app state lives here
- **Key lib:** `src/lib/api.js` (Tauri command bridge), `src/lib/microphoneEngine.js` (Web Audio API voice detection, 85–3400 Hz), tokenizer for scroll-word-sync
- **Editor:** Tiptap 3 with custom marks (`[PAUSE]` `[SLOW]` `[BREATHE]` cues)
- **Styling:** Vanilla CSS (`style.css`, `settings.css`) — no CSS framework

### Backend (`/src-tauri/src/lib.rs`)
Single monolithic Rust file (~36KB) containing all Tauri commands. macOS-specific behavior:
- **Notch window elevation:** Direct `objc2` / `objc2-app-kit` calls to position `NSPanel` above the notch via private `_setWindowType:` API
- **Tauri plugins used:** `global-shortcut` (⌘⇧Space, ⌘⇧↑↓, ⌘⇧R), `fs`, `positioner`
- **Storage:** JSON files in user's local filesystem (no DB)

### Notch UI
6 visual states × 2 themes (dark/light) = 12 snapshots tracked via `/scripts/snap.mjs` (Puppeteer). Run `snap:check` before any notch-related changes.

### Release
Tag push triggers CI (`.github/workflows/release.yml`) → builds macOS aarch64 + x64 DMGs → uploads to GitHub Release. Windows builds are intentionally disabled for v3.
