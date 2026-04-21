import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './store'
import { API } from './lib/api'
import IdleView from './views/IdleView'
import EditView from './views/EditView'
import ReadView from './views/ReadView'

// Island sizes — 20px side + bottom bleed so box-shadow renders fully
const SB = 20
const BB = 20
const ISLAND_SIZES = {
  idle:      { w: 213,          h: 38       },
  idleHover: { w: 236,          h: 48       },
  edit:      { w: 560 + SB * 2, h: 340 + BB },
  read:      { w: 440 + SB * 2, h: 205 + BB },
}
// Classic: window = island size exactly, OS handles shadow
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

  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])

  useEffect(() => {
    document.documentElement.style.opacity = config.opacity ?? 1
  }, [config.opacity])

  // ── Bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    // Load config
    API.getConfig().then((cfg) => {
      if (!cfg) return
      setConfig({
        mode:         cfg.mode         ?? 'notch',
        theme:        cfg.theme        ?? 'dark',
        scrollSpeed:  cfg.scrollSpeed  ?? cfg.scroll_speed  ?? 1,
        fontSize:     cfg.fontSize     ?? cfg.font_size     ?? 24,
        textAlign:    cfg.textAlign    ?? cfg.text_align    ?? 'center',
        mirrorText:   cfg.mirrorText   ?? cfg.mirror_text   ?? false,
        opacity:      cfg.opacity      ?? 1,
        threshold:    cfg.threshold    ?? 0.018,
        autoScroll:   cfg.autoScroll   ?? cfg.auto_scroll   ?? false,
        micDeviceId:  cfg.micDeviceId  ?? cfg.mic_device_id ?? 'default',
      })
      API.setIgnoreMouse(false)
    })

    // Load scripts
    API.getScripts().then((s) => { if (s) setScripts(s) })

    // Live config updates from settings window
    let unlistenConfig, unlistenCueJump

    API.onConfigUpdate((cfg) => {
      if (!cfg) return
      const SNAKE = {
        scroll_speed: 'scrollSpeed', auto_scroll: 'autoScroll', mic_device_id: 'micDeviceId',
        font_size: 'fontSize', text_align: 'textAlign', mirror_text: 'mirrorText',
      }
      const patch = {}
      for (const [k, v] of Object.entries(cfg)) {
        if (v === undefined) continue
        patch[SNAKE[k] ?? k] = v
      }
      if (Object.keys(patch).length) setConfig(patch)
    }).then(fn => { unlistenConfig = fn })

    window.__TAURI__?.event?.listen('cue-jump', (e) => {
      if (viewRef.current === 'read') return
      const { cueId } = e.payload
      const state = useAppStore.getState()
      if (!state.scriptDoc) {
        const idx = state.currentScriptIndex
        const script = idx >= 0 ? state.scripts[idx] : state.scripts[0]
        if (!script) { setView('edit'); return }
        state.setScriptText(script.text || '')
        try { state.setScriptDoc(JSON.parse(script.content)) }
        catch { state.setScriptDoc(null) }
      }
      setStartCueId(cueId)
      setView('read')
    }).then(fn => { unlistenCueJump = fn })

    // Probe mic permission once so browser doesn't ask mid-session
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(s => s.getTracks().forEach(t => t.stop()))
      .catch(() => {})

    return () => { unlistenConfig?.(); unlistenCueJump?.() }
  }, [])

  // ── Side-effects from config ───────────────────────────────
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

  // ── Window resize ──────────────────────────────────────────
  useEffect(() => {
    const sizes = isClassic ? CLASSIC_SIZES : ISLAND_SIZES
    const size  = view === 'edit' ? sizes.edit
                : view === 'read' ? sizes.read
                : isHovered       ? sizes.idleHover
                : sizes.idle
    API.resizePrompter({ width: size.w, height: size.h })
  }, [view, isHovered, config.mode])

  // ── Event handlers ─────────────────────────────────────────
  function handleMouseEnter() {
    setIsHovered(true)
    if (!isClassic) API.focusPrompter()
  }
  function handleMouseLeave() { setIsHovered(false) }
  function handleMouseDown(e) {
    if (!isClassic) return
    if (e.target.closest('button, input, textarea, select, svg')) return
    e.preventDefault()
    API.startDrag()
  }

  // ── Derived render values ──────────────────────────────────
  const isExpanded   = !isClassic && (view === 'edit' || view === 'read')
  const islandW      = view === 'edit' ? 560 : view === 'read' ? 440 : 0
  const cornerLeft   = isExpanded ? `calc(50% - ${islandW / 2}px - 20px)` : '0'
  const cornerRight  = isExpanded ? `calc(50% + ${islandW / 2}px)` : '0'
  const islandClass  = [
    isClassic       ? 'mode-classic' : '',
    view === 'edit' ? 'state-edit'   : '',
    view === 'read' ? 'state-read'   : '',
  ].filter(Boolean).join(' ')

  const isBrowser = !window.__TAURI__

  return (
    <>
      {/* Concave anti-notch corners (notch mode only) */}
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

      {/* Dev panel — browser only, hidden in Tauri */}
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
