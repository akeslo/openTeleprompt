# Settings ↔ Prompter Unification Design

**Date:** 2026-04-20  
**Status:** Approved

## Goals

1. Match floating/classic teleprompter window style to the settings panel (all states/modes)
2. Settings Preview renders active script with Tiptap formatting (static)
3. Wire up all non-functional settings controls (Pause, Reset, progress bar, LIVE badge)
4. Remove Mirror Text setting
5. Build Jump to Cue from `#` / `##` headings in the active script; works from idle/edit (starts read at that heading) and during read (jumps scroll position)

---

## Event Architecture (Approach A — Global JS Events)

All cross-window communication uses `window.__TAURI__.event.emit` / `tauriListen`. No new Rust commands needed.

| Event | Emitter | Receiver | Payload |
|---|---|---|---|
| `active-script` | Prompter — EditView on script load/change | Settings | `{ doc: TiptapJSON, cues: Cue[] }` |
| `scroll-progress` | Prompter — ReadView RAF (~10fps) | Settings | `{ pct: number (0–1), isRunning: boolean, isPaused: boolean }` |
| `shortcut` | Settings — Pause/Reset buttons | Prompter — ReadView | `'pause'` \| `'reset'` |
| `cue-jump` | Settings — cue list click | Prompter — App.jsx | `{ cueId: number }` |
| `config-update` | Rust | Both windows | (existing) |

`scroll-progress` with `isRunning: false` is emitted once on ReadView unmount so settings resets its LIVE badge and progress bar.

---

## Cue Model

```ts
type Cue = { id: number; level: 1 | 2; text: string }
```

Extracted from Tiptap JSON nodes where `type === 'heading'`. `id` is the sequential index among all headings in the doc. StarterKit already includes the Heading extension — no new Tiptap extension required.

### Cue jump flow

**During ReadView:** `cue-jump` listener scrolls `scrollPosRef` to the heading's `offsetTop` within `#script-text`, clamped to `maxScroll`.

**From idle/edit:**
1. App.jsx `cue-jump` listener receives `{ cueId }`
2. Sets `startCueId` in Zustand store
3. If view is `'edit'`: calls `saveCurrentScript()` then transitions to `'read'`
4. If view is `'idle'`: transitions to `'edit'` then immediately to `'read'` (with `startCueId` set, ReadView handles the seek)
5. ReadView on mount: if `startCueId >= 0`, scrolls to that heading's `offsetTop` after first paint, then clears `startCueId` in store

---

## Style Changes

### `src/style.css`

**Typography**
- `'Syne', sans-serif` → `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`
- `'DM Mono', monospace` → `ui-monospace, 'SF Mono', Menlo, monospace`

**Colors / accent**
- `#818cf8` (indigo) → `#ffffff` everywhere
- `--accent: #818cf8` → `--accent: #ffffff`
- `--bg-active: rgba(129,140,248,0.20)` → `rgba(255,255,255,0.15)`
- `--caret: #818cf8` → `--caret: #ffffff`
- `--bg: #000000` → `#0f0f11` (classic mode only — notch background stays #000 for hardware pixel match)

**Buttons**
- `.pill-btn.ghost` → `background: #27272a; color: #fff` hover `#3f3f46`
- `.pill-btn.accent` → `background: #fff; color: #000` (white pill, black text)
- `.ctrl-btn` → `background: #27272a; color: #fff` hover `#3f3f46`
- `.tb-btn` active/hover → `background: rgba(255,255,255,0.12); color: #fff`

**Functional marker colors stay** — `[PAUSE]` yellow, `[SLOW]` green, `[BREATHE]` purple are UI affordances not accent decoration.

**Notch idle pill** — unchanged. Pure black against hardware notch; no color tokens exposed.

### `src/settings.css`

Add `.s-row-left { display: flex; flex-direction: column; gap: 2px; }` (referenced in JSX, missing from CSS).

---

## Component Changes

### `src/lib/tokenizer.js`

- Add `heading` token: `{ type: 'heading', level: 1|2, text: string, id: number }`
- Export `extractCues(doc): Cue[]` — walks Tiptap JSON, collects heading nodes

### `src/store/index.js`

Add to store:
```js
startCueId: -1,
setStartCueId: (id) => set({ startCueId: id }),
cues: [],
setCues: (cues) => set({ cues }),
```

### `src/App.jsx`

- Global `cue-jump` listener registered on mount, cleaned up on unmount
- Handler:
  - If `view === 'read'`: emit internal ref callback so ReadView can jump
  - If `view === 'edit'`: `setStartCueId(cueId)`, trigger save + transition to `'read'`
  - If `view === 'idle'`: `setStartCueId(cueId)`, transition to `'edit'` then `'read'`
- Expose a `onCueJump` ref that ReadView registers its scroll handler into

### `src/views/EditView.jsx`

- On script load (`useEffect([editor])`) and on `onUpdate` (debounced 300ms): call `emitActiveScript(editor.getJSON())`
- `emitActiveScript(doc)`: extracts cues via `extractCues(doc)`, emits `active-script` globally
- `handleStart()`: if `startCueId >= 0`, passes it through (ReadView handles seek on mount)

### `src/views/ReadView.jsx`

- **On mount**: if `startCueId >= 0`, after first RAF tick find heading ref with matching id, set `scrollPosRef.current` to its `offsetTop`, clear `startCueId`
- **Heading refs**: track heading DOM nodes in `headingRefs` object (index → el), parallel to `markerRefs`
- **Cue jump**: listen for `cue-jump` event (also handles mid-session jumps from settings); scroll to `headingRefs[cueId].offsetTop`
- **Scroll progress**: inside RAF loop, every 6th frame (~10fps at 60fps) emit `scroll-progress` with `pct = scrollPosRef.current / maxScroll`, `isRunning: true`
- **On unmount**: emit `scroll-progress { pct: 0, isRunning: false }`
- Render heading tokens: `<div ref={el => headingRefs.current[token.id] = el} className={`read-heading read-heading-${token.level}`}>`

### `src/views/SettingsView.jsx`

**Removed:** Mirror Text row (Toggle + label + sublabel)

**Added local state:** `activeDoc` (Tiptap JSON | null), `activeCues` (Cue[]), `scrollPct` (number), `isRunning` (bool), `isPaused` (bool)

**Subscriptions (in existing useEffect):**
```js
API.onActiveScript(({ doc, cues }) => { setActiveDoc(doc); setActiveCues(cues) })
API.onScrollProgress(({ pct, isRunning, isPaused }) => { setScrollPct(pct); setIsRunning(isRunning); setIsPaused(isPaused) })
```
Both cleaned up in useEffect return.

**LIVE badge:** visible only when `isRunning === true`

**Preview:** Read-only Tiptap editor (`editable: false`) initialized with `activeDoc`. Falls back to placeholder text if `activeDoc` is null. Re-calls `editor.setContent(activeDoc)` when `activeDoc` changes.

**Progress bar:** `style={{ width: \`${scrollPct * 100}%\` }}`

**Pause button:** `onClick={() => window.__TAURI__.event.emit('shortcut', 'pause')}`; label/icon reflects `isPaused` from `scroll-progress` payload. Button disabled when `isRunning` is false.

**Reset button:** `onClick={() => window.__TAURI__.event.emit('shortcut', 'reset')}`

**Cue list:** Maps `activeCues` → `CueItem` components. `val` shows `#` or `##` prefix to indicate level. Click: `window.__TAURI__.event.emit('cue-jump', { cueId: cue.id })`

**Settings local API:** Add:
```js
onActiveScript: (cb) => tauriListen('active-script', e => cb(e.payload)),
onScrollProgress: (cb) => tauriListen('scroll-progress', e => cb(e.payload)),
```

---

## Files Changed

| File | Change type |
|---|---|
| `src/style.css` | Style — font + color overhaul |
| `src/settings.css` | Fix — add `.s-row-left` |
| `src/lib/tokenizer.js` | Feature — heading token + `extractCues` |
| `src/store/index.js` | Feature — `startCueId`, `cues` |
| `src/App.jsx` | Feature — global `cue-jump` listener |
| `src/views/EditView.jsx` | Feature — emit `active-script` on script change |
| `src/views/ReadView.jsx` | Feature — heading refs, cue-jump listener, scroll-progress emit, startCueId seek |
| `src/views/SettingsView.jsx` | Feature — live preview, cue list, wired controls, remove mirror text |

---

## Out of Scope

- Rust changes (no new Tauri commands)
- `screenshareHidden` / Eye-line guide / Threshold settings — not touched
- Tiptap extension changes — StarterKit Heading is sufficient
- Text alignment setting — not touched
