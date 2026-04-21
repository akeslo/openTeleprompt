# OpenTeleprompter: Gemini Context

OpenTeleprompter is a free, open-source, voice-activated teleprompter built with **Tauri** (Rust) and **React** (TypeScript/JavaScript). It features a unique "Notch Mode" for macOS that mimics the Dynamic Island, as well as a "Classic Mode" for standard windowed use.

## Project Overview

*   **Backend:** Rust (Tauri v2). Handles window management, system tray, global shortcuts, and file persistence.
*   **Frontend:** React 19, Vite, Zustand (state management), Tiptap (rich text editor).
*   **Key Feature:** Voice-activated scrolling using frequency analysis (85–3400 Hz) to distinguish voice from background noise.
*   **Persistence:** Configuration and scripts are stored as JSON files in the user's home directory:
    *   `~/.teleprompter-config.json`
    *   `~/.teleprompter-scripts.json`

## Directory Structure

*   `src-tauri/`: Rust backend logic.
    *   `src/lib.rs`: Main entry point for Tauri commands, window setup, and event handling.
    *   `tauri.conf.json`: Tauri application configuration.
*   `src/`: React frontend source code.
    *   `App.jsx`: Main application component, manages views and window resizing.
    *   `store/index.js`: Zustand store for application state.
    *   `views/`: Different application views (`IdleView`, `EditView`, `ReadView`, `SettingsView`).
    *   `lib/`: Helper libraries for API communication (`api.js`), microphone/VAD logic (`mic.js`), and text processing.
*   `dist/`: Final production artifacts (.app, .dmg).

## Building and Running
## Building and Running

### Prerequisites
*   [Rust and Cargo](https://rustup.rs/)
*   Node.js 18+

### Development
```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev
```

### Production Build
```bash
# Build for macOS
npm run build

# Build for Windows
npm run build:win
```

## Development Conventions

*   **Communication:** Use the `API` object in `src/lib/api.js` to invoke Tauri commands from the frontend.
*   **State:** Use the `useAppStore` hook from `src/store/index.js` for global application state.
*   **Windows:** The app manages multiple windows (`prompter`, `settings`).
    *   The `prompter` window in "Notch Mode" uses high-level `NSWindow` APIs on macOS to float above the menu bar.
*   **Styling:** Primarily uses Vanilla CSS (found in `src/style.css`, `src/settings.css`).

## Key Backend Commands (Rust)

*   `get_config` / `set_config`: Manage application preferences.
*   `get_scripts` / `save_scripts`: Manage the script library.
*   `switch_mode`: Toggles between "Notch" and "Classic" modes (recreates the window).
*   `resize_prompter`: Dynamically adjusts window size based on the current view and mode.
*   `elevate_notch_window`: (macOS only) Positions the window above the menu bar level.

## Voice Activation Logic

Located in `src/lib/mic.js`. It uses the Web Audio API to perform frequency analysis, ensuring that only frequencies within the human voice range (85Hz - 3400Hz) trigger scrolling, with a ratio check against high-frequency noise.
