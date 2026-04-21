# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Full Tauri app (Rust + React, hot reload) — primary dev command
npm run dev:vite         # Frontend only on port 1420 (no Rust compile — fast UI iteration)
npm run build            # Full macOS production build → .dmg
npm run build:frontend   # Vite-only build → dist/
npm run build:win        # Windows cross-compile (x86_64-pc-windows-msvc)
```

No linter, type checker, or test suite — vanilla JavaScript throughout.

## Architecture

**Desktop teleprompter app** — React 19 frontend + Tauri 2 (Rust) backend. macOS-first; notch mode requires direct Objective-C API calls. No cloud, no database — all state is local files.

### Frontend (`/src/`)

Three main views in a linear flow: `IdleView` → `EditView` → `ReadView`. `SettingsView` lives in a separate Tauri window (`settings`) with its own entry point (`settings-main.jsx` / `settings.html`).

- **State:** Single Zustand store at `src/store/index.js` — all shared app state (view, config, scripts, playback flags) lives here.
- **API bridge:** All Tauri IPC goes through `src/lib/api.js`. Never call `window.__TAURI__` directly from components (except `SettingsView`, which has a local API object because it runs in a separate window context and cannot import from `src/lib/api.js`).
- **Mic engine:** `src/lib/mic.js` — Web Audio API VAD (85–3400 Hz voice band vs 4000–8000 Hz noise ratio). Returned as a closure with `start(deviceId)`, `stop()`, `setThreshold(v)`.
- **Tokenizer:** `src/lib/tokenizer.js` — converts Tiptap JSON → flat token array for word-by-word rendering in `ReadView`. Recognizes `[PAUSE]`, `[SLOW]`, `[BREATHE]` markers.
- **Editor:** Tiptap 3 (StarterKit + TextStyle + Color). Script content stored as Tiptap JSON string in `.teleprompter-scripts.json`.
- **Styling:** Vanilla CSS only (`src/style.css`, `src/settings.css`) — no CSS framework. Design system: "Kinetic Resonance" — dark substrate, bioluminescent accents, strict central axis, pill geometry.

### Backend (`/src-tauri/src/lib.rs`)

Single monolithic Rust file containing all Tauri commands, window creation, tray, and shortcuts. Windows are created **programmatically** — `tauri.conf.json` has `"windows": []`. The two managed windows are `"prompter"` and `"settings"`.

- **Notch mode:** `elevate_to_notch_level()` uses `objc2` / `objc2-app-kit` to set `NSWindow` level 27 (above menu bar) and reposition flush to screen top. Must be called on the **main thread** — macOS Sequoia enforces this.
- **Mode switch (`switch_mode`):** Spawns a background thread → emits stop → polls for window close → dispatches `create_prompter_window` to main thread via `run_on_main_thread`. Avoids sleeping on main thread.
- **Tauri plugins:** `global-shortcut` (⌘⇧Space/↑/↓/R, also Ctrl variants), `fs`, `positioner` (TrayCenter positioning — only valid after first tray click, guarded by `TRAY_CLICKED` atomic).
- **Config persistence:** `~/.teleprompter-config.json` (loaded/saved as `Config` struct). Scripts: `~/.teleprompter-scripts.json`.
- **`set_config` command:** Accepts a partial JSON patch — only keys present in the payload are updated. The `config-update` Tauri event carries **snake_case** keys; the frontend normalizes these to camelCase before storing in Zustand.

### Production build paths

Vite outputs to `dist/`. Tauri `frontendDist` is `"../dist"`.

| Window   | Release URL         | Vite entry       |
|----------|---------------------|------------------|
| prompter | `index.html`        | `index.html`     |
| settings | `settings.html`     | `settings.html`  |

Both `create_prompter_window` (mode-switch path) and `setup` (startup path) must use `"index.html"`, not `"renderer/index.html"`.

### Key invariants

- **`tauriInvoke` alias** — `src/lib/api.js` defines `const tauriInvoke = window.__TAURI__?.core?.invoke ?? ...`. Always use `tauriInvoke`, never bare `invoke` (not a global).
- **Tauri event listeners must be cleaned up.** `tauriListen` (and `API.onConfigUpdate`, `API.onShortcut`) returns `Promise<UnlistenFn>`. Always capture and call in `useEffect` cleanup: `.then(fn => { unlisten = fn })` / `return () => unlisten?.()`.
- **Mic device tracking in `ReadView`:** The running engine's device is tracked in `prevMicDeviceIdRef` (a separate ref), not `configRef`. `configRef` is synced by an earlier effect in the same commit, so comparing `configRef.current.micDeviceId !== config.micDeviceId` is always false.
- **`TRAY_CLICKED` guard:** `resize_settings` and `position_settings_window` only call `move_window(Position::TrayCenter)` if `TRAY_CLICKED` is true — calling positioner before the first tray click panics.
- **Classic mode click-through:** `set_ignore_mouse` always passes `false` in classic mode — buttons must remain clickable.
- **Window resize on view change** is handled by the `useEffect([view, isHovered, config.mode])` in `App.jsx` — no component should call `API.resizePrompter` directly.
