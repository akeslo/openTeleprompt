import { create } from 'zustand'

export const useAppStore = create((set) => ({
  view: 'idle', // 'idle' | 'edit' | 'read'
  setView: (view) => set({ view }),

  config: {
    mode: 'notch',
    scrollSpeed: 1,
    // These must mirror `impl Default for Config` in src-tauri/src/lib.rs — they are
    // what renders for the frame before API.getConfig() resolves, so a divergent value
    // shows as a visible jump (fontSize was 16 here vs 24 in Rust, autoScroll false vs true).
    fontSize: 24,
    textAlign: 'center',
    opacity: 1,
    threshold: 0.018,
    autoScroll: true,
    micDeviceId: 'default',
    theme: 'dark',
  },
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

  scripts: [],
  currentScriptIndex: -1,
  setScripts: (scripts) => set({ scripts }),
  setCurrentScriptIndex: (i) => set({ currentScriptIndex: i }),

  scriptText: '',
  setScriptText: (text) => set({ scriptText: text }),
  scriptDoc: null,  // Tiptap JSON doc
  setScriptDoc: (doc) => set({ scriptDoc: doc }),

  // Read by IdleView for dot state
  isPaused: false,
  isSpeaking: false,
  setIsPaused: (v) => set({ isPaused: v }),
  setIsSpeaking: (v) => set({ isSpeaking: v }),

  // Cue navigation
  startCueId: -1,
  setStartCueId: (id) => set({ startCueId: id }),
}))
