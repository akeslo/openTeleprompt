# Settings ↔ Prompter Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the floating teleprompter window's visual style with the settings panel, wire up all non-functional settings controls, add live script preview, and build a Jump to Cue list from script headings.

**Architecture:** Global Tauri JS events (`window.__TAURI__.event.emit` / `tauriListen`) carry state between the prompter window and settings window — no new Rust commands. EditView emits `active-script` whenever the loaded script changes; ReadView emits `scroll-progress` each RAF tick; Settings emits `shortcut` and `cue-jump` when controls are clicked.

**Tech Stack:** React 19, Zustand 5, Tiptap 3 (StarterKit already includes Heading), Tauri 2 global events, vanilla CSS

---

## File Map

| File | Change |
|---|---|
| `src/lib/tokenizer.js` | Add `heading` token type + export `extractCues(doc)` |
| `src/store/index.js` | Add `startCueId`, `setStartCueId`, `cues`, `setCues` |
| `src/style.css` | Font → system, indigo → white, button style overhaul, add `.read-heading` |
| `src/settings.css` | Add `.s-row-left`, `.s-preview-editor` Tiptap styles |
| `src/views/EditView.jsx` | Emit `active-script` on script load + debounced editor update |
| `src/views/SettingsView.jsx` | Live preview (read-only Tiptap), wired controls, cue list, remove Mirror Text |
| `src/views/ReadView.jsx` | Heading refs, `startCueId` seek on mount, `cue-jump` listener, `scroll-progress` emit |
| `src/App.jsx` | Global `cue-jump` listener — handles idle/edit → read transition |

---

## Task 1: Add heading token and `extractCues` to tokenizer

**Files:**
- Modify: `src/lib/tokenizer.js`

- [ ] **Step 1: Replace `src/lib/tokenizer.js` with the version below**

```js
// Converts Tiptap JSON doc → flat token array for word-by-word rendering
// Token types: { type: 'word'|'marker'|'newline'|'heading', ... }

const MARKER_RE = /^\[(PAUSE|SLOW|BREATHE)\]$/i

// Returns array of { id, level, text } for every h1/h2 in the doc.
export function extractCues(doc) {
  if (!doc?.content) return []
  const cues = []
  let id = 0
  for (const node of doc.content) {
    if (node.type === 'heading' && (node.attrs?.level === 1 || node.attrs?.level === 2)) {
      const text = node.content?.map(c => c.text ?? '').join('') ?? ''
      cues.push({ id: id++, level: node.attrs.level, text })
    }
  }
  return cues
}

export function tokenizeDoc(doc) {
  const tokens = []
  let headingId = 0

  function walkNode(node) {
    if (!node) return

    if (node.type === 'text') {
      const text = node.text || ''
      const isBold = node.marks?.some(m => m.type === 'bold') ?? false
      const color = node.marks?.find(m => m.type === 'textStyle')?.attrs?.color ?? null
      const words = text.split(/(\s+)/)
      for (const word of words) {
        if (!word || /^\s+$/.test(word)) continue
        const markerMatch = word.match(MARKER_RE)
        if (markerMatch) {
          tokens.push({ type: 'marker', text: word, marker: markerMatch[1].toUpperCase() })
        } else {
          tokens.push({ type: 'word', text: word, bold: isBold, color })
        }
      }
      return
    }

    if (node.type === 'heading') {
      const level = node.attrs?.level ?? 1
      const text = node.content?.map(c => c.text ?? '').join('') ?? ''
      tokens.push({ type: 'heading', level, text, id: headingId++ })
      tokens.push({ type: 'newline' })
      return
    }

    if (node.type === 'paragraph') {
      if (node.content) node.content.forEach(walkNode)
      tokens.push({ type: 'newline' })
      return
    }

    if (node.content) node.content.forEach(walkNode)
  }

  if (doc?.content) doc.content.forEach(walkNode)
  return tokens
}
```

- [ ] **Step 2: Verify in browser — open `npm run dev:vite`, open DevTools console, paste:**

```js
// Should return array of cue objects from a sample doc
const { extractCues, tokenizeDoc } = await import('/src/lib/tokenizer.js')
const doc = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Intro' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section A' }] },
]}
console.log(extractCues(doc))  // [{id:0,level:1,text:'Intro'},{id:1,level:2,text:'Section A'}]
console.log(tokenizeDoc(doc).filter(t => t.type === 'heading')) // same two entries
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tokenizer.js
git commit -m "feat(tokenizer): add heading token type and extractCues util"
```

---

## Task 2: Extend Zustand store with cue state

**Files:**
- Modify: `src/store/index.js`

- [ ] **Step 1: Add `startCueId` and `cues` to the store**

Replace the store body in `src/store/index.js` with:

```js
import { create } from 'zustand'

export const useAppStore = create((set, get) => ({
  view: 'idle', // 'idle' | 'edit' | 'read'
  setView: (view) => set({ view }),

  config: {
    mode: 'notch',
    scrollSpeed: 1,
    fontSize: 16,
    textAlign: 'center',
    mirrorText: false,
    eyeLineGuide: false,
    opacity: 1,
    threshold: 0.018,
    autoScroll: false,
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
  scriptDoc: null,
  setScriptDoc: (doc) => set({ scriptDoc: doc }),

  isPaused: false,
  isHoverPaused: false,
  isSpeaking: false,
  isRunning: false,
  setIsPaused: (v) => set({ isPaused: v }),
  setIsHoverPaused: (v) => set({ isHoverPaused: v }),
  setIsSpeaking: (v) => set({ isSpeaking: v }),
  setIsRunning: (v) => set({ isRunning: v }),

  speedIndex: 3,
  setSpeedIndex: (i) => set({ speedIndex: i }),

  // Cue navigation
  startCueId: -1,
  setStartCueId: (id) => set({ startCueId: id }),
  cues: [],
  setCues: (cues) => set({ cues }),
}))
```

- [ ] **Step 2: Verify — `npm run dev:vite`, no console errors on load**

- [ ] **Step 3: Commit**

```bash
git add src/store/index.js
git commit -m "feat(store): add startCueId and cues state for cue navigation"
```

---

## Task 3: Style overhaul — prompter window matches settings

**Files:**
- Modify: `src/style.css`
- Modify: `src/settings.css`

- [ ] **Step 1: Apply font + color + button changes to `src/style.css`**

Make the following targeted replacements (find → replace):

**Fonts — replace all occurrences:**

| Find | Replace |
|---|---|
| `font-family: 'Syne', sans-serif;` | `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;` |
| `font-family: 'DM Mono', monospace;` | `font-family: ui-monospace, 'SF Mono', Menlo, monospace;` |

The `font-family` on `html, body, #root` block and `.pill-btn` use Syne — replace both.
The `font-family` on `.tiptap-editor`, `.script-name`, `#script-input`, `#script-stats`, `.tb-marker`, `#vol-label`, `#dev-panel` use DM Mono — replace all.

**Color — replace all occurrences in CSS values (not selectors):**

| Find | Replace |
|---|---|
| `#818cf8` | `#ffffff` |
| `rgba(129,140,248,0.20)` | `rgba(255,255,255,0.15)` |
| `rgba(129,140,248,0.2)` | `rgba(255,255,255,0.15)` |
| `#6366f1` | `#ffffff` (light theme accent) |
| `rgba(99,102,241,0.15)` | `rgba(255,255,255,0.15)` |
| `rgba(99,102,241,0.15)` | `rgba(255,255,255,0.15)` |

**Button styles — replace these rule bodies:**

`.pill-btn.ghost` block → change to:
```css
.pill-btn.ghost {
  background: #27272a;
  color: rgba(255,255,255,0.7);
}
.pill-btn.ghost:hover { background: #3f3f46; color: #fff; }
```

`.pill-btn.accent` block → change to:
```css
.pill-btn.accent { background: #fff; color: #000; }
.pill-btn.accent:hover { opacity: 0.85; }
```

`.ctrl-btn` block → change to:
```css
.ctrl-btn {
  background: #27272a; border: none;
  color: rgba(255,255,255,0.7); border-radius: 6px;
  width: 22px; height: 22px; font-size: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.12s, color 0.12s;
  font-family: inherit; flex-shrink: 0;
}
.ctrl-btn:hover { background: #3f3f46; color: #fff; }
```

`.tb-btn:hover, .tb-btn.active` rule → change to:
```css
.tb-btn:hover, .tb-btn.active {
  background: rgba(255,255,255,0.12);
  color: #fff;
}
```

**Classic mode background — add after existing `body.mode-classic #island` rule:**
```css
body.mode-classic #island {
  background: #0f0f11;
}
```
(Add this as an additional rule, not replacing the existing one which sets geometry.)

- [ ] **Step 2: Add `.read-heading` styles at the bottom of `src/style.css`**

```css
/* ── Read mode headings ───────────────────────────────────── */
.read-heading {
  display: block;
  font-weight: 700;
  margin: 10px 0 4px;
  line-height: 1.3;
}
.read-heading-1 {
  font-size: 1.25em;
  color: var(--text-primary);
}
.read-heading-2 {
  font-size: 1.05em;
  color: var(--text-secondary);
}
```

- [ ] **Step 3: Add missing styles to `src/settings.css`**

Append to the end of `src/settings.css`:

```css
/* Row left — label + sublabel stacked */
.s-row-left { display: flex; flex-direction: column; gap: 2px; }

/* Preview editor (read-only Tiptap in settings) */
.s-preview-editor .ProseMirror {
  font-size: 12px;
  line-height: 1.5;
  color: #a1a1aa;
  outline: none;
  padding: 0;
}
.s-preview-editor .ProseMirror h1 {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  margin: 6px 0 2px;
}
.s-preview-editor .ProseMirror h2 {
  font-size: 13px;
  font-weight: 600;
  color: #e4e4e7;
  margin: 4px 0 2px;
}
.s-preview-editor .ProseMirror p { margin: 0 0 4px; }
.s-preview-editor .ProseMirror strong { color: #fff; }
```

- [ ] **Step 4: Verify visuals — run `npm run dev:vite`, switch to Edit and Read views in the dev panel. Confirm:**
  - Font is now system sans-serif (no more Syne)
  - Editor uses monospace (SF Mono / Menlo)
  - Buttons are dark (#27272a) with white text
  - Accent color (Go → button, caret) is white
  - No indigo anywhere

- [ ] **Step 5: Commit**

```bash
git add src/style.css src/settings.css
git commit -m "feat(style): match prompter window visual style to settings panel"
```

---

## Task 4: EditView emits `active-script` on script load and change

**Files:**
- Modify: `src/views/EditView.jsx`

- [ ] **Step 1: Replace `src/views/EditView.jsx` with the version below**

Key changes: import `extractCues`, add `emitDebounceRef`, emit `active-script` on load and on debounced update.

```jsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { useAppStore } from '../store'
import { API } from '../lib/api'
import { extractCues } from '../lib/tokenizer'

const COLORS = [
  { label: 'White',  value: '#ffffff' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Green',  value: '#4ade80' },
  { label: 'Blue',   value: '#60a5fa' },
  { label: 'Red',    value: '#f87171' },
]
const MARKERS = ['[PAUSE]', '[SLOW]', '[BREATHE]']

function computeStats(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  if (!words) return ''
  const secs = Math.round((words / 130) * 60)
  const timeStr = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${words} words · ~${timeStr} at 130 WPM`
}

function emitActiveScript(doc) {
  const cues = extractCues(doc)
  window.__TAURI__?.event?.emit('active-script', { doc, cues })
}

export default function EditView() {
  const {
    setView, scripts, setScripts,
    currentScriptIndex, setCurrentScriptIndex,
    setScriptText, setScriptDoc, config,
    startCueId,
  } = useAppStore()

  const isClassic = config?.mode === 'classic'
  const [stats, setStats] = useState('')
  const emitDebounceRef = useRef(null)

  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color],
    content: '<p></p>',
    editorProps: {
      attributes: { class: 'tiptap-editor', spellcheck: 'true' },
    },
    onUpdate({ editor }) {
      setStats(computeStats(editor.getText()))
      clearTimeout(emitDebounceRef.current)
      emitDebounceRef.current = setTimeout(() => {
        emitActiveScript(editor.getJSON())
      }, 300)
    },
  })

  // Load script when editor is ready
  useEffect(() => {
    if (!editor) return
    const script = scripts[currentScriptIndex]
    if (!script) return
    try {
      editor.commands.setContent(JSON.parse(script.content))
    } catch {
      editor.commands.setContent(`<p>${script.text || ''}</p>`)
    }
    setStats(computeStats(script.text || ''))
    emitActiveScript(editor.getJSON())
  }, [editor])

  const saveCurrentScript = useCallback(() => {
    if (!editor) return
    const text = editor.getText().trim()
    if (!text) return
    const name = text.split('\n')[0].substring(0, 40) || 'Untitled'
    const content = JSON.stringify(editor.getJSON())
    const updated = [...scripts]
    if (currentScriptIndex >= 0) {
      updated[currentScriptIndex] = { ...updated[currentScriptIndex], name, text, content }
    } else {
      updated.unshift({ name, text, content })
      setCurrentScriptIndex(0)
    }
    setScripts(updated)
    API.saveScripts(updated)
  }, [editor, scripts, currentScriptIndex])

  function handleStart() {
    if (!editor) return
    const text = editor.getText().trim()
    if (!text) return
    saveCurrentScript()
    setScriptText(text)
    setScriptDoc(editor.getJSON())
    setView('read')
  }

  function handleCollapse() {
    API.setIgnoreMouse(false)
    setView('idle')
  }

  function handleNew() {
    setCurrentScriptIndex(-1)
    editor?.commands.setContent('<p></p>')
    editor?.commands.focus()
    setStats('')
  }

  function loadScript(i) {
    setCurrentScriptIndex(i)
    if (!editor) return
    const script = scripts[i]
    if (!script) return
    try {
      editor.commands.setContent(JSON.parse(script.content))
    } catch {
      editor.commands.setContent(`<p>${script.text || ''}</p>`)
    }
    setStats(computeStats(script.text || ''))
    editor.commands.focus()
    emitActiveScript(editor.getJSON())
  }

  function deleteScript(e, i) {
    e.stopPropagation()
    const updated = scripts.filter((_, idx) => idx !== i)
    setScripts(updated)
    API.saveScripts(updated)
    if (currentScriptIndex >= i) setCurrentScriptIndex(Math.max(-1, currentScriptIndex - 1))
  }

  function insertMarker(marker) {
    editor?.chain().focus().insertContent(` ${marker} `).run()
  }

  function setColor(color) {
    editor?.chain().focus().setColor(color).run()
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="edit-header">
        <button className="pill-btn ghost" onClick={handleCollapse}>✕</button>
        <span className="view-title">Script</span>
        <button className="pill-btn ghost" onClick={handleNew}>+ New</button>
        <button className="pill-btn ghost" onClick={saveCurrentScript}>Save</button>
        <button className="pill-btn accent" onClick={handleStart}>Go →</button>
      </div>

      {/* Script list */}
      {scripts.length > 0 && (
        <div id="script-list">
          {scripts.map((s, i) => (
            <div key={i} className={`script-item${i === currentScriptIndex ? ' active' : ''}`}>
              <span className="script-name" onClick={() => loadScript(i)}>{s.name}</span>
              <button className="script-del" onClick={(e) => deleteScript(e, i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="tiptap-toolbar">
        <button
          className={`tb-btn${editor?.isActive('bold') ? ' active' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run() }}
          title="Bold"
        ><strong>B</strong></button>

        <div className="tb-divider" />

        {COLORS.map((c) => (
          <button
            key={c.value}
            className="tb-color"
            style={{ background: c.value }}
            onMouseDown={(e) => { e.preventDefault(); setColor(c.value) }}
            title={c.label}
          />
        ))}
        <button
          className="tb-btn"
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().unsetColor().run() }}
          title="Clear color"
        >✕</button>

        <div className="tb-divider" />

        {MARKERS.map((m) => (
          <button
            key={m}
            className="tb-marker"
            onMouseDown={(e) => { e.preventDefault(); insertMarker(m) }}
            title={`Insert ${m}`}
          >{m}</button>
        ))}
      </div>

      {/* Editor */}
      <div className="tiptap-wrap">
        <EditorContent editor={editor} />
      </div>

      {/* Stats */}
      <div id="script-stats">{stats}</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify — run `npm run dev` (full Tauri). Open the prompter, go to Edit view, load a script. Open DevTools in the settings window and listen for the event:**

In settings window console:
```js
window.__TAURI__.event.listen('active-script', e => console.log(e.payload))
```
Load a script in the prompter edit view → confirm the event fires with `{ doc: {...}, cues: [...] }`.

- [ ] **Step 3: Commit**

```bash
git add src/views/EditView.jsx
git commit -m "feat(EditView): emit active-script event on script load and change"
```

---

## Task 5: Wire up all SettingsView features

**Files:**
- Modify: `src/views/SettingsView.jsx`

- [ ] **Step 1: Replace `src/views/SettingsView.jsx` with the version below**

Changes: add Tiptap imports, live preview, wired Pause/Reset, cue list from events, remove Mirror Text, subscribe to `active-script` and `scroll-progress`.

```jsx
import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'

const tauriInvoke = window.__TAURI__?.core?.invoke ?? (() => Promise.resolve(null))
const tauriListen = window.__TAURI__?.event?.listen ?? (() => Promise.resolve(() => {}))
const tauriEmit   = window.__TAURI__?.event?.emit   ?? (() => Promise.resolve())

const API = {
  getConfig:        () => tauriInvoke('get_config'),
  setConfig:        (patch) => tauriInvoke('set_config', { patch }),
  switchMode:       (mode) => tauriInvoke('switch_mode', { mode }),
  onConfigUpdate:   (cb) => tauriListen('config-update', (e) => cb(e.payload)),
  onActiveScript:   (cb) => tauriListen('active-script', (e) => cb(e.payload)),
  onScrollProgress: (cb) => tauriListen('scroll-progress', (e) => cb(e.payload)),
  togglePrompter:   () => tauriInvoke('toggle_prompter'),
  resizeSettings:   (dims) => tauriInvoke('resize_settings', { dims }),
  quit:             () => tauriInvoke('quit_app'),
  openDevTools:     () => tauriInvoke('open_devtools'),
  hideSettings:     () => tauriInvoke('hide_settings'),
  emitShortcut:     (action) => tauriEmit('shortcut', action),
  emitCueJump:      (cueId) => tauriEmit('cue-jump', { cueId }),
}

const SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]

const Icons = {
  Prompter: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  Reset: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>,
  Pause: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>,
  Play:  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 14V3z"/></svg>,
}

export default function SettingsView() {
  const [activeTab,    setActiveTab]    = useState('Prompter')
  const [mode,         setMode]         = useState('notch')
  const [speedIdx,     setSpeedIdx]     = useState(3)
  const [fontSize,     setFontSize]     = useState(22)
  const [eyeLineGuide, setEyeLineGuide] = useState(false)
  // Live session state (driven by scroll-progress events)
  const [isRunning,  setIsRunning]  = useState(false)
  const [isPaused,   setIsPaused]   = useState(false)
  const [scrollPct,  setScrollPct]  = useState(0)
  // Active script (driven by active-script events)
  const [activeCues, setActiveCues] = useState([])

  const panelRef = useRef(null)

  // Read-only Tiptap instance for preview
  const previewEditor = useEditor({
    extensions: [StarterKit, TextStyle, Color],
    editable: false,
    content: '<p style="color:#52525b">No active script — open a script in the prompter.</p>',
  })

  // Auto-resize settings window to content height
  useEffect(() => {
    if (!panelRef.current) return
    const ro = new ResizeObserver(() => {
      const h = panelRef.current.getBoundingClientRect().height
      API.resizeSettings({ height: Math.ceil(h) + 2 })
    })
    ro.observe(panelRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    API.getConfig().then(cfg => { if (cfg) applyConfig(cfg) })

    let unlistenConfig, unlistenActiveScript, unlistenScrollProgress

    API.onConfigUpdate(applyConfig).then(fn => { unlistenConfig = fn })

    API.onActiveScript(({ doc, cues }) => {
      setActiveCues(cues ?? [])
      if (previewEditor && doc) previewEditor.commands.setContent(doc)
    }).then(fn => { unlistenActiveScript = fn })

    API.onScrollProgress(({ pct, isRunning, isPaused }) => {
      setScrollPct(pct ?? 0)
      setIsRunning(isRunning ?? false)
      setIsPaused(isPaused ?? false)
    }).then(fn => { unlistenScrollProgress = fn })

    const handler = (e) => {
      if (e.metaKey && e.altKey && e.code === 'KeyI') API.openDevTools()
    }
    document.addEventListener('keydown', handler)

    return () => {
      unlistenConfig?.()
      unlistenActiveScript?.()
      unlistenScrollProgress?.()
      document.removeEventListener('keydown', handler)
    }
  }, [previewEditor])

  // Sync preview when previewEditor instance becomes available after active-script already fired
  // (handles the case where settings opens while a script is already loaded)
  useEffect(() => {
    // Nothing needed here — onActiveScript handler already updates previewEditor
    // previewEditor is included in the dep array of the subscription effect above
  }, [])

  function applyConfig(c) {
    if (c.mode)         setMode(c.mode)
    if (c.fontSize)     setFontSize(c.fontSize)
    if (c.eyeLineGuide != null) setEyeLineGuide(c.eyeLineGuide)
    if (c.scrollSpeed != null) {
      const i = SPEEDS.indexOf(c.scrollSpeed)
      setSpeedIdx(i !== -1 ? i : 3)
    }
  }

  const setConfig = (patch) => API.setConfig(patch)

  return (
    <div id="panel" ref={panelRef}>
      {/* Header */}
      <div className="s-header">
        <div className="s-header-left">
          <div className="s-app-icon">{Icons.Prompter}</div>
          <span className="s-app-name">Teleprompt</span>
        </div>
        {isRunning && <div className="s-live-badge">LIVE</div>}
      </div>

      {/* Tabs */}
      <div className="s-tabs">
        {['Prompter', 'Script', 'Hotkeys'].map(tab => (
          <button
            key={tab}
            className={`s-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="s-body">
        {activeTab === 'Prompter' && (
          <>
            <div className="s-section-label">PREVIEW</div>
            <div className="s-preview-box">
              <div className="s-preview-editor">
                <EditorContent editor={previewEditor} />
              </div>
            </div>

            <div className="s-progress-row">
              <div className="s-progress-track">
                <div className="s-progress-fill" style={{ width: `${scrollPct * 100}%`, transition: 'width 0.1s linear' }} />
              </div>
            </div>

            <div className="s-controls-main">
              <button
                className="s-btn-pause"
                onClick={() => API.emitShortcut('pause')}
                disabled={!isRunning}
                style={{ opacity: isRunning ? 1 : 0.4, cursor: isRunning ? 'pointer' : 'default' }}
              >
                {isPaused ? Icons.Play : Icons.Pause}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                className="s-btn-reset"
                onClick={() => API.emitShortcut('reset')}
                disabled={!isRunning}
                style={{ opacity: isRunning ? 1 : 0.4, cursor: isRunning ? 'pointer' : 'default' }}
                title="Reset to beginning"
              >
                {Icons.Reset}
              </button>
            </div>

            <div className="s-setting-row">
              <div className="s-row-info">
                <span className="s-label">Scroll speed</span>
                <span className="s-val">{SPEEDS[speedIdx].toFixed(1)}×</span>
              </div>
              <input type="range" className="s-slider" min="0" max="7" step="1"
                value={speedIdx} onChange={e => {
                  const idx = +e.target.value
                  setSpeedIdx(idx)
                  setConfig({ scrollSpeed: SPEEDS[idx] })
                }}
              />
            </div>

            <div className="s-setting-row">
              <div className="s-row-info">
                <span className="s-label">Font size</span>
                <span className="s-val">{fontSize}px</span>
              </div>
              <input type="range" className="s-slider" min="12" max="64" step="1"
                value={fontSize} onChange={e => {
                  const val = +e.target.value
                  setFontSize(val)
                  setConfig({ fontSize: val })
                }}
              />
            </div>

            <div className="s-setting-row">
              <span className="s-label">Style</span>
              <div className="s-segmented">
                {['notch', 'classic', 'float'].map(m => (
                  <button
                    key={m}
                    className={`s-seg-btn ${mode === m ? 'active' : ''}`}
                    onClick={() => {
                      setMode(m)
                      API.switchMode(m === 'float' ? 'classic' : m)
                    }}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="s-setting-row s-flex-row">
              <div className="s-row-left">
                <span className="s-label">Eye-line guide</span>
                <span className="s-sublabel">Camera alignment bar</span>
              </div>
              <Toggle checked={eyeLineGuide} onChange={v => {
                setEyeLineGuide(v)
                setConfig({ eyeLineGuide: v })
              }} />
            </div>

            {activeCues.length > 0 && (
              <>
                <div className="s-section-label">JUMP TO CUE</div>
                <div className="s-cue-list">
                  {activeCues.map((cue, i) => (
                    <CueItem
                      key={cue.id}
                      id={String(i + 1).padStart(2, '0')}
                      label={cue.text}
                      prefix={cue.level === 1 ? '#' : '##'}
                      onClick={() => API.emitCueJump(cue.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CueItem({ id, label, prefix, onClick }) {
  return (
    <div className="s-cue-item" onClick={onClick} style={{ cursor: 'pointer' }}>
      <span className="s-cue-id">{id}</span>
      <span className="s-cue-label">{label}</span>
      <span className="s-cue-val">{prefix}</span>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <label className="s-switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="s-sw" />
    </label>
  )
}
```

- [ ] **Step 2: Verify in full Tauri (`npm run dev`):**
  - Open settings (tray click)
  - Go to Edit in prompter, load a script with at least one `#` heading
  - Confirm settings preview updates with the script content including heading formatting
  - Confirm Jump to Cue section appears with the headings listed
  - Start reading (Go →), confirm LIVE badge appears and progress bar fills
  - Click Pause in settings, confirm prompter pauses; click again, confirm resume
  - Click Reset in settings, confirm prompter scrolls back to top
  - Confirm Mirror Text row is gone

- [ ] **Step 3: Commit**

```bash
git add src/views/SettingsView.jsx
git commit -m "feat(SettingsView): live preview, wired controls, cue list, remove mirror text"
```

---

## Task 6: ReadView — heading refs, scroll-progress, cue-jump, startCueId seek

**Files:**
- Modify: `src/views/ReadView.jsx`

- [ ] **Step 1: Replace `src/views/ReadView.jsx` with the version below**

Key additions: `headingRefs`, seek on mount from `startCueId`, `cue-jump` listener, `scroll-progress` emit every 6th frame + on unmount.

```jsx
import { useEffect, useRef, useState } from 'react'
import { tokenizeDoc } from '../lib/tokenizer'
import { useAppStore } from '../store'
import { API } from '../lib/api'
import { createMicEngine, SPEEDS, SCROLL_SPEED_BASE } from '../lib/mic'

export default function ReadView() {
  const { scriptText, scriptDoc, config, setView, startCueId, setStartCueId } = useAppStore()
  const tokens = scriptDoc ? tokenizeDoc(scriptDoc) : []

  const configRef = useRef(config)
  useEffect(() => { configRef.current = config }, [config])

  const [isPaused,   setIsPaused]   = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speedIdx,   setSpeedIdx]   = useState(
    SPEEDS.indexOf(config.scrollSpeed) !== -1 ? SPEEDS.indexOf(config.scrollSpeed) : 3
  )
  const [fontSize,   setFontSize]   = useState(config.fontSize || 16)
  const [micStatus,  setMicStatus]  = useState('Waiting…')

  const isPausedRef        = useRef(false)
  const isSpeakingRef      = useRef(false)
  const isHoverPausedRef   = useRef(false)
  const speedIdxRef        = useRef(speedIdx)
  const scrollPosRef       = useRef(0)
  const lastFrameRef       = useRef(0)
  const rafRef             = useRef(null)
  const scrollVPRef        = useRef(null)
  const scriptTextRef      = useRef(null)
  const markerRefs         = useRef({})
  const headingRefs        = useRef({})   // heading token id → DOM el
  const firedMarkers       = useRef(new Set())
  const micEngineRef       = useRef(null)
  const prevMicDeviceIdRef = useRef(config.micDeviceId)
  const frameCountRef      = useRef(0)    // for scroll-progress throttle

  useEffect(() => { isPausedRef.current  = isPaused  }, [isPaused])
  useEffect(() => { isSpeakingRef.current = isSpeaking }, [isSpeaking])
  useEffect(() => { speedIdxRef.current  = speedIdx  }, [speedIdx])

  // Emit scroll-progress to settings (~10fps = every 6th frame at 60fps)
  function emitScrollProgress(isRunning) {
    const maxScroll = scriptTextRef.current
      ? scriptTextRef.current.scrollHeight - (scrollVPRef.current?.clientHeight ?? 0)
      : 1
    const pct = maxScroll > 0 ? Math.min(scrollPosRef.current / maxScroll, 1) : 0
    window.__TAURI__?.event?.emit('scroll-progress', {
      pct,
      isRunning,
      isPaused: isPausedRef.current,
    })
  }

  // Scroll to a heading by its cue id
  function seekToCue(cueId) {
    const el = headingRefs.current[cueId]
    if (!el || !scrollVPRef.current || !scriptTextRef.current) return
    const maxScroll = scriptTextRef.current.scrollHeight - scrollVPRef.current.clientHeight
    scrollPosRef.current = Math.min(el.offsetTop, maxScroll)
    if (scriptTextRef.current) {
      scriptTextRef.current.style.transform = `translateY(${-scrollPosRef.current}px)`
    }
    firedMarkers.current.clear()
  }

  useEffect(() => {
    if (config.scrollSpeed !== undefined) {
      const i = SPEEDS.reduce((best, s, idx) =>
        Math.abs(s - config.scrollSpeed) < Math.abs(SPEEDS[best] - config.scrollSpeed) ? idx : best
      , 0)
      setSpeedIdx(i)
    }
    micEngineRef.current?.setThreshold(config.threshold)
    if (prevMicDeviceIdRef.current !== config.micDeviceId) {
      prevMicDeviceIdRef.current = config.micDeviceId
      micEngineRef.current?.stop()
      const engine = createMicEngine({
        threshold: config.threshold,
        onSpeaking: () => { isSpeakingRef.current = true;  setIsSpeaking(true);  setMicStatus('Speaking') },
        onSilence:  () => { isSpeakingRef.current = false; setIsSpeaking(false); setMicStatus('Waiting…') },
        onError:    () => setMicStatus('Mic error'),
      })
      micEngineRef.current = engine
      engine.start(config.micDeviceId)
    }
  }, [config.threshold, config.micDeviceId, config.autoScroll, config.scrollSpeed])

  useEffect(() => {
    // Seek to startCueId after first paint if set
    if (startCueId >= 0) {
      requestAnimationFrame(() => {
        seekToCue(startCueId)
        setStartCueId(-1)
      })
    }

    function checkMarkers() {
      if (!scrollVPRef.current) return
      const vpRect = scrollVPRef.current.getBoundingClientRect()
      const readingZoneBottom = vpRect.top + vpRect.height * 0.4
      Object.entries(markerRefs.current).forEach(([idxStr, el]) => {
        if (!el) return
        const idx = Number(idxStr)
        if (firedMarkers.current.has(idx)) return
        const rect = el.getBoundingClientRect()
        if (rect.top < readingZoneBottom) {
          firedMarkers.current.add(idx)
          const marker = el.dataset.marker
          if (marker === 'PAUSE') {
            isPausedRef.current = true; setIsPaused(true); setMicStatus('Paused')
            setTimeout(() => { isPausedRef.current = false; setIsPaused(false); setMicStatus('Waiting…') }, 1200)
          } else if (marker === 'BREATHE') {
            isPausedRef.current = true; setIsPaused(true); setMicStatus('Breathe…')
            setTimeout(() => { isPausedRef.current = false; setIsPaused(false); setMicStatus('Waiting…') }, 2500)
          } else if (marker === 'SLOW') {
            setSpeedIdx(prev => {
              const n = Math.max(0, prev - 1)
              API.setConfig({ scrollSpeed: SPEEDS[n] })
              return n
            })
          }
        }
      })
    }

    function loop(ts) {
      const paused = isPausedRef.current || isHoverPausedRef.current
      const shouldScroll = configRef.current.autoScroll ? !paused : (isSpeakingRef.current && !paused)

      if (shouldScroll && scrollVPRef.current && scriptTextRef.current) {
        const delta = lastFrameRef.current ? Math.min((ts - lastFrameRef.current) / 16.667, 3) : 1
        lastFrameRef.current = ts
        const maxScroll = scriptTextRef.current.scrollHeight - scrollVPRef.current.clientHeight
        if (scrollPosRef.current < maxScroll - 1) {
          scrollPosRef.current += SCROLL_SPEED_BASE * SPEEDS[speedIdxRef.current] * delta
          scrollPosRef.current = Math.min(scrollPosRef.current, maxScroll)
          scriptTextRef.current.style.transform = `translateY(${-scrollPosRef.current}px)`
        }
        checkMarkers()
      } else {
        lastFrameRef.current = 0
      }

      // Emit scroll-progress every 6 frames (~10fps)
      frameCountRef.current++
      if (frameCountRef.current % 6 === 0) emitScrollProgress(true)

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    const engine = createMicEngine({
      threshold: configRef.current.threshold,
      onSpeaking: () => { isSpeakingRef.current = true;  setIsSpeaking(true);  setMicStatus('Speaking') },
      onSilence:  () => { isSpeakingRef.current = false; setIsSpeaking(false); setMicStatus('Waiting…') },
      onError:    () => setMicStatus('Mic error'),
    })
    micEngineRef.current = engine
    engine.start(configRef.current.micDeviceId)

    let unlistenShortcut, unlistenCueJump

    API.onShortcut((action) => {
      if (action === 'pause') togglePause()
      if (action === 'faster') setSpeedIdx(i => Math.min(SPEEDS.length - 1, i + 1))
      if (action === 'slower') setSpeedIdx(i => Math.max(0, i - 1))
      if (action === 'reset') {
        scrollPosRef.current = 0
        if (scriptTextRef.current) scriptTextRef.current.style.transform = 'translateY(0px)'
        firedMarkers.current.clear()
      }
      if (action === 'stop') handleDone()
    }).then(fn => { unlistenShortcut = fn })

    // Listen for cue-jump events (from settings during active session)
    window.__TAURI__?.event?.listen('cue-jump', (e) => {
      seekToCue(e.payload.cueId)
    }).then(fn => { unlistenCueJump = fn })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      micEngineRef.current?.stop()
      unlistenShortcut?.()
      unlistenCueJump?.()
      emitScrollProgress(false) // tell settings session ended
    }
  }, [])

  function togglePause() {
    const next = !isPausedRef.current
    isPausedRef.current = next
    setIsPaused(next)
    setMicStatus(next ? 'Paused' : 'Waiting…')
    if (next) { isSpeakingRef.current = false; setIsSpeaking(false) }
  }

  function handleDone() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    micEngineRef.current?.stop()
    API.setIgnoreMouse(false)
    setView('idle')
  }

  function handleReset() {
    scrollPosRef.current = 0
    if (scriptTextRef.current) scriptTextRef.current.style.transform = 'translateY(0px)'
    firedMarkers.current.clear()
  }

  function handleMouseEnter() { isHoverPausedRef.current = true; setMicStatus('Hover pause') }
  function handleMouseLeave() {
    isHoverPausedRef.current = false
    if (!isPausedRef.current) setMicStatus(isSpeakingRef.current ? 'Speaking' : 'Waiting…')
  }

  function handleWheel(e) {
    e.preventDefault()
    if (!scrollVPRef.current || !scriptTextRef.current) return
    const maxScroll = scriptTextRef.current.scrollHeight - scrollVPRef.current.clientHeight
    scrollPosRef.current = Math.max(0, Math.min(scrollPosRef.current + e.deltaY, maxScroll))
    scriptTextRef.current.style.transform = `translateY(${-scrollPosRef.current}px)`
  }

  const micRingClass = `mic-ring${isSpeaking ? '' : ' paused'}`

  return (
    <div
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div id="progress-bar" />

      <div
        ref={scrollVPRef}
        id="scroll-viewport"
        onWheel={handleWheel}
        style={{ flex: 1, overflowY: 'hidden', position: 'relative' }}
      >
        <div
          ref={scriptTextRef}
          id="script-text"
          style={{ fontSize: `${fontSize}px` }}
        >
          {tokens.length > 0 ? tokens.map((token, i) => {
            if (token.type === 'newline') return <br key={i} />
            if (token.type === 'heading') return (
              <div
                key={i}
                ref={el => { headingRefs.current[token.id] = el }}
                className={`read-heading read-heading-${token.level}`}
              >
                {token.text}
              </div>
            )
            if (token.type === 'marker') return (
              <span
                key={i}
                ref={el => { markerRefs.current[i] = el }}
                data-marker={token.marker}
                className={`read-marker read-marker-${token.marker.toLowerCase()}`}
              >
                {token.text}
              </span>
            )
            return (
              <span key={i} style={{ fontWeight: token.bold ? 700 : undefined, color: token.color || undefined }}>
                {token.text}{' '}
              </span>
            )
          }) : scriptText}
        </div>
      </div>

      <div id="read-controls">
        <div className="ctrl-left">
          <span className={micRingClass}><span className="mic-core" /></span>
          <span id="status-text">{micStatus}</span>
        </div>
        <div className="ctrl-right">
          <button className="ctrl-btn" onClick={() => setFontSize(f => Math.max(11, f - 2))}>A−</button>
          <button className="ctrl-btn" onClick={() => setFontSize(f => Math.min(32, f + 2))}>A+</button>
          <button className="ctrl-btn" onClick={() => setSpeedIdx(i => { const n = Math.max(0, i - 1); API.setConfig({ scrollSpeed: SPEEDS[n] }); return n })}>−</button>
          <span id="speed-val">{SPEEDS[speedIdx]}×</span>
          <button className="ctrl-btn" onClick={() => setSpeedIdx(i => { const n = Math.min(SPEEDS.length - 1, i + 1); API.setConfig({ scrollSpeed: SPEEDS[n] }); return n })}>+</button>
          <button className="ctrl-btn" onClick={togglePause}>{isPaused ? '▶' : '⏸'}</button>
          <button className="ctrl-btn" onClick={handleReset}>↺</button>
          <button className="ctrl-btn" onClick={handleDone}>✕</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in full Tauri (`npm run dev`):**
  - Start a read session → settings LIVE badge appears, progress bar moves
  - Pause in settings → prompter pauses, Pause button shows Resume
  - Reset in settings → scroll resets to top
  - Close read session → LIVE badge disappears, progress resets to 0
  - In a script with `#` headings, click a cue in settings during read → prompter scrolls to that heading

- [ ] **Step 3: Commit**

```bash
git add src/views/ReadView.jsx
git commit -m "feat(ReadView): heading refs, scroll-progress emit, cue-jump listener, startCueId seek"
```

---

## Task 7: App.jsx — global cue-jump handler (idle/edit → read transition)

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Replace `src/App.jsx` with the version below**

Key addition: `cue-jump` global listener. When not in read mode, loads the current script into the store and transitions to read with `startCueId` set.

```jsx
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './store'
import { API } from './lib/api'
import IdleView from './views/IdleView'
import EditView from './views/EditView'
import ReadView from './views/ReadView'

const SB = 20
const BB = 20
const ISLAND_SIZES = {
  idle:      { w: 213,          h: 38       },
  idleHover: { w: 236,          h: 48       },
  edit:      { w: 560 + SB * 2, h: 340 + BB },
  read:      { w: 440 + SB * 2, h: 205 + BB },
}
const CLASSIC_SIZES = {
  idle:      { w: 240, h: 80  },
  idleHover: { w: 260, h: 88  },
  edit:      { w: 580, h: 360 },
  read:      { w: 460, h: 240 },
}

export default function App() {
  const { view, config, setConfig, setScripts, setView, setStartCueId, setScriptText, setScriptDoc } = useAppStore()
  const [isHovered, setIsHovered] = useState(false)
  const isClassic = config.mode === 'classic'

  // Stable ref so the cue-jump listener always reads the current view without re-registering
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])

  useEffect(() => {
    API.getConfig().then((cfg) => {
      if (!cfg) return
      setConfig({
        mode:         cfg.mode         ?? 'notch',
        theme:        cfg.theme        ?? 'dark',
        scrollSpeed:  cfg.scrollSpeed  ?? cfg.scroll_speed  ?? 1,
        fontSize:     cfg.fontSize     ?? cfg.font_size     ?? 24,
        textAlign:    cfg.textAlign    ?? cfg.text_align    ?? 'center',
        mirrorText:   cfg.mirrorText   ?? cfg.mirror_text   ?? false,
        eyeLineGuide: cfg.eyeLineGuide ?? cfg.eye_line_guide ?? false,
        opacity:      cfg.opacity      ?? 1,
        threshold:    cfg.threshold    ?? 0.018,
        autoScroll:   cfg.autoScroll   ?? cfg.auto_scroll   ?? false,
        micDeviceId:  cfg.micDeviceId  ?? cfg.mic_device_id ?? 'default',
      })
      API.setIgnoreMouse(false)
    })

    API.getScripts().then((s) => { if (s) setScripts(s) })

    let unlistenConfig, unlistenCueJump

    API.onConfigUpdate((cfg) => {
      if (!cfg) return
      const patch = {}
      const keys = ['mode','theme','scrollSpeed','scroll_speed','opacity','threshold',
                    'autoScroll','auto_scroll','micDeviceId','mic_device_id','fontSize','font_size','textAlign','text_align',
                    'mirrorText','mirror_text','eyeLineGuide','eye_line_guide']
      keys.forEach(k => { if (cfg[k] !== undefined) patch[k] = cfg[k] })
      if (patch.scroll_speed   !== undefined) { patch.scrollSpeed  = patch.scroll_speed;   delete patch.scroll_speed }
      if (patch.auto_scroll    !== undefined) { patch.autoScroll   = patch.auto_scroll;    delete patch.auto_scroll  }
      if (patch.mic_device_id  !== undefined) { patch.micDeviceId  = patch.mic_device_id;  delete patch.mic_device_id }
      if (patch.font_size      !== undefined) { patch.fontSize     = patch.font_size;      delete patch.font_size     }
      if (patch.text_align     !== undefined) { patch.textAlign    = patch.text_align;     delete patch.text_align    }
      if (patch.mirror_text    !== undefined) { patch.mirrorText   = patch.mirror_text;    delete patch.mirror_text   }
      if (patch.eye_line_guide !== undefined) { patch.eyeLineGuide = patch.eye_line_guide; delete patch.eye_line_guide }
      if (Object.keys(patch).length) setConfig(patch)
    }).then(fn => { unlistenConfig = fn })

    // Global cue-jump listener — only handles non-read transitions.
    // ReadView handles its own cue-jump listener when mounted.
    window.__TAURI__?.event?.listen('cue-jump', (e) => {
      if (viewRef.current === 'read') return // ReadView handles it

      const { cueId } = e.payload
      const state = useAppStore.getState()

      // Ensure scriptDoc is populated before entering read
      if (!state.scriptDoc) {
        const idx = state.currentScriptIndex
        const script = idx >= 0 ? state.scripts[idx] : state.scripts[0]
        if (!script) {
          // No script loaded at all — send to edit so user can pick one
          setView('edit')
          return
        }
        state.setScriptText(script.text || '')
        try { state.setScriptDoc(JSON.parse(script.content)) }
        catch { state.setScriptDoc(null) }
      }

      setStartCueId(cueId)
      setView('read')
    }).then(fn => { unlistenCueJump = fn })

    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(s => s.getTracks().forEach(t => t.stop()))
      .catch(() => {})

    return () => {
      unlistenConfig?.()
      unlistenCueJump?.()
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme || 'dark')
  }, [config.theme])

  useEffect(() => {
    document.body.classList.toggle('mode-classic', isClassic)
    API.setIgnoreMouse(false)
  }, [config.mode])

  useEffect(() => {
    document.documentElement.style.opacity = config.opacity ?? 1
  }, [config.opacity])

  useEffect(() => {
    const sizes = isClassic ? CLASSIC_SIZES : ISLAND_SIZES
    const size  = view === 'edit' ? sizes.edit
                : view === 'read' ? sizes.read
                : isHovered       ? sizes.idleHover
                : sizes.idle
    API.resizePrompter({ width: size.w, height: size.h })
  }, [view, isHovered, config.mode])

  function handleMouseEnter() { setIsHovered(true); if (!isClassic) API.focusPrompter() }
  function handleMouseLeave() { setIsHovered(false) }
  function handleMouseDown(e) {
    if (!isClassic) return
    if (e.target.closest('button, input, textarea, select, svg')) return
    e.preventDefault()
    API.startDrag()
  }

  const isExpanded  = !isClassic && (view === 'edit' || view === 'read')
  const islandW     = view === 'edit' ? 560 : view === 'read' ? 440 : 0
  const cornerLeft  = isExpanded ? `calc(50% - ${islandW / 2}px - 20px)` : '0'
  const cornerRight = isExpanded ? `calc(50% + ${islandW / 2}px)` : '0'
  const islandClass = [
    isClassic       ? 'mode-classic' : '',
    view === 'edit' ? 'state-edit'   : '',
    view === 'read' ? 'state-read'   : '',
  ].filter(Boolean).join(' ')

  const isBrowser = !window.__TAURI__

  return (
    <>
      <div className={`notch-corner notch-corner-left${isExpanded ? ' visible' : ''}`}  style={{ left: cornerLeft }} />
      <div className={`notch-corner notch-corner-right${isExpanded ? ' visible' : ''}`} style={{ left: cornerRight }} />

      <div
        id="island"
        className={islandClass}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
      >
        {view === 'idle' && <IdleView isHovered={isHovered} />}
        {view === 'edit' && <EditView />}
        {view === 'read' && <ReadView />}
      </div>

      {isBrowser && (
        <div id="dev-panel">
          <div className="dev-label">DEV</div>
          <div className="dev-row">
            <span>View</span>
            <select value={view} onChange={e => setView(e.target.value)}>
              <option value="idle">Idle</option>
              <option value="edit">Edit</option>
              <option value="read">Read</option>
            </select>
          </div>
          <div className="dev-row">
            <span>Mode</span>
            <select value={config.mode || 'notch'} onChange={e => setConfig({ mode: e.target.value })}>
              <option value="notch">Notch</option>
              <option value="classic">Classic</option>
            </select>
          </div>
          <div className="dev-row">
            <span>Theme</span>
            <select value={config.theme || 'dark'} onChange={e => setConfig({ theme: e.target.value })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify in full Tauri (`npm run dev`):**
  - Load a script with `#` headings in EditView
  - Go back to IdleView
  - Open settings, confirm cue list is visible (populated from the `active-script` event fired by EditView)
  - Click a cue in settings while in idle → prompter transitions to read and scrolls to that heading
  - Click a cue while in edit → same result

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(App): global cue-jump handler for idle/edit → read transition with seek"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| Match floating window style to settings | Task 3 (style.css overhaul) |
| System font | Task 3 |
| White accent replacing indigo | Task 3 |
| Classic mode #0f0f11 bg | Task 3 |
| Settings Preview renders Tiptap content | Task 5 (read-only editor) |
| Preview updates with active script | Tasks 4 + 5 (active-script event) |
| Pause/Resume wired | Tasks 5 + 6 (shortcut emit + ReadView handler) |
| Reset wired | Tasks 5 + 6 |
| Progress bar live | Tasks 5 + 6 (scroll-progress) |
| LIVE badge shows only when running | Task 5 |
| Remove Mirror Text | Task 5 |
| Jump to Cue from # / ## | Tasks 1 + 4 + 5 (extract + emit + display) |
| Cue click during read → scroll | Task 6 (cue-jump listener in ReadView) |
| Cue click from idle/edit → start read at heading | Task 7 (App.jsx handler) |
| `.s-row-left` CSS fix | Task 3 |
| `read-heading` styles | Task 3 |
