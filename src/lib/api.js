const tauriInvoke = window.__TAURI__?.core?.invoke ?? (() => Promise.resolve(null))
// Always go through this — a bare `window.__TAURI__?.event?.listen(...).then(...)` throws
// a TypeError outside Tauri (`npm run dev:vite`), because the optional chain yields
// `undefined` and `.then` is then called on it, killing the whole effect.
export const tauriListen = window.__TAURI__?.event?.listen ?? (() => Promise.resolve(() => {}))

export const API = {
  elevateNotchWindow: () => tauriInvoke('elevate_notch_window'),
  platform: navigator.platform.toLowerCase().includes('win') ? 'win32' : 'darwin',
  getConfig: () => tauriInvoke('get_config'),
  setConfig: (patch) => tauriInvoke('set_config', { patch }),
  onConfigUpdate: (cb) => tauriListen('config-update', (e) => cb(e.payload)),
  getScripts: () => tauriInvoke('get_scripts'),
  saveScripts: (scripts) => tauriInvoke('save_scripts', { scripts }),
  setIgnoreMouse: (ignore) => tauriInvoke('set_ignore_mouse', { ignore }),
  resizePrompter: (dims) => tauriInvoke('resize_prompter', { dims }),
  resizeSettings: (dims) => tauriInvoke('resize_settings', { dims }),
  quit: () => tauriInvoke('quit_app'),
  openDevTools: () => tauriInvoke('open_devtools'),
  moveWindow: (pos) => tauriInvoke('move_window', { pos }),
  getWindowPos: () => tauriInvoke('get_window_pos'),
  startDrag: () => tauriInvoke('start_drag'),
  onShortcut: (cb) => tauriListen('shortcut', (e) => cb(e.payload)),
  onCueJump: (cb) => tauriListen('cue-jump', (e) => cb(e.payload)),
  onPassthroughChanged: (cb) => tauriListen('passthrough-changed', (e) => cb(e.payload)),
  focusPrompter: () => tauriInvoke('focus_prompter'),
  openFile: () => tauriInvoke('open_file'),
  saveFile: (path, content) => tauriInvoke('save_file', { path, content }),
  togglePassThrough: () => tauriInvoke('toggle_passthrough'),
}
