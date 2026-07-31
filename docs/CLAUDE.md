# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Full Tauri app (Rust + React, hot reload) — primary dev command
npm run dev:vite         # Frontend only on port 1420 (no Rust compile — fast UI iteration)
npm run build            # Full macOS production build → .dmg
npm run build:frontend   # Vite-only build → dist/
npm run test             # Vitest unit tests
```

No linter or type checker. Test suite: `npm test` (vitest) — covers tokenizer, fileUtils, mic, the Tauri API bridge, SettingsView, EditView, IdleView, and ReadView's seek-to-cue logic.

## Architecture

**Desktop teleprompter app** — React 19 frontend + Tauri 2 (Rust) backend. macOS-first with notch support via direct Objective-C APIs. No cloud, no database — everything local.

### Frontend (`/src/`)
- **Views:** `IdleView` → `EditView` → `ReadView` (main flow), `SettingsView` in separate window
- **State:** Single Zustand store at `src/store/index.js` — all app state lives here (no test file yet)
- **Key lib:** `src/lib/api.js` (Tauri command bridge), `src/lib/mic.js` (Web Audio API voice detection, 85–3400 Hz), `src/lib/tokenizer.js` for scroll-word-sync
- **Editor:** Tiptap 3 (StarterKit + TextStyle + Color). Script content stored as Tiptap JSON string in `.teleprompter-scripts.json`
- **Styling:** Vanilla CSS only (`src/style.css`, `src/settings.css`) — no CSS framework. Design system: "Kinetic Resonance" — dark substrate, bioluminescent accents, strict central axis, pill geometry

### Backend (`/src-tauri/src/lib.rs`)
Single monolithic Rust file containing all Tauri commands, window creation, tray, and shortcuts. Windows are created programmatically — `tauri.conf.json` has `"windows": []`. The two managed windows are `"prompter"` and `"settings"`.
- **Notch mode:** `elevate_to_notch_level()` uses `objc2` / `objc2-app-kit` to set `NSWindow` level 27 (above menu bar) and reposition flush to screen top. Must be called on the main thread (macOS Sequoia enforces this)
- **Mode switch (`switch_mode`):** Spawns background thread → emits stop → polls for window close → dispatches `create_prompter_window` to main thread via `run_on_main_thread`. Avoids sleeping on main thread
- **Tauri plugins:** `global-shortcut` (⌘⇧Space/↑/↓/R, also Ctrl variants; ⌥⌘T / Ctrl+Alt+T toggles click-through passthrough), `fs`, `positioner` (TrayCenter positioning)
- **Config persistence:** `~/.teleprompter-config.json` (Config struct), scripts in `~/.teleprompter-scripts.json`

### Production build paths
Vite outputs to `dist/`. Tauri `frontendDist` is `"../dist"`.

| Window   | Release URL         | Vite entry       |
|----------|---------------------|------------------|
| prompter | `index.html`        | `index.html`     |
| settings | `settings.html`     | `settings.html`  |

### Release
Tag push triggers CI (`.github/workflows/release.yml`) → builds macOS aarch64 + x64 DMGs → uploads to GitHub Release. Windows support is planned for a follow-up release.
