import { useEffect, useRef, useState } from 'react'

const tauriInvoke = window.__TAURI__?.core?.invoke ?? (() => Promise.resolve(null))
const tauriListen = window.__TAURI__?.event?.listen ?? (() => Promise.resolve(() => {}))
const tauriEmit   = window.__TAURI__?.event?.emit   ?? (() => Promise.resolve())

const API = {
  getConfig:           () => tauriInvoke('get_config'),
  setConfig:           (patch) => tauriInvoke('set_config', { patch }),
  switchMode:          (mode) => tauriInvoke('switch_mode', { mode }),
  onConfigUpdate:      (cb) => tauriListen('config-update', (e) => cb(e.payload)),
  onActiveScript:      (cb) => tauriListen('active-script', (e) => cb(e.payload)),
  onScrollProgress:    (cb) => tauriListen('scroll-progress', (e) => cb(e.payload)),
  togglePrompter:      () => tauriInvoke('toggle_prompter'),
  isPrompterVisible:   () => tauriInvoke('is_prompter_visible'),
  resizeSettings:      (dims) => tauriInvoke('resize_settings', { dims }),
  quit:                () => tauriInvoke('quit_app'),
  openDevTools:        () => tauriInvoke('open_devtools'),
  hideSettings:        () => tauriInvoke('hide_settings'),
  emitShortcut:        (action) => tauriEmit('shortcut', action),
  emitCueJump:         (cueId) => tauriEmit('cue-jump', { cueId }),
}

const SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]

const Icons = {
  Prompter: <img src="/tray-icon.png" width="16" height="16" alt="" style={{ display: 'block', imageRendering: '-webkit-optimize-contrast' }} />,
  Reset: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>,
  Pause: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>,
  Play:  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 14V3z"/></svg>,
}

export default function SettingsView() {
  const [prompterVisible, setPrompterVisible] = useState(true)
  const [mode,         setMode]         = useState('notch')
  const [speedIdx,     setSpeedIdx]     = useState(3)
  const [fontSize,     setFontSize]     = useState(22)
  const [screenshareHidden, setScreenshareHidden] = useState(true)
  const [isRunning,  setIsRunning]  = useState(false)
  const [isPaused,   setIsPaused]   = useState(false)
  const [scrollPct,  setScrollPct]  = useState(0)
  const [activeCues, setActiveCues] = useState([])

  const panelRef = useRef(null)

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
    API.isPrompterVisible().then(v => { if (v != null) setPrompterVisible(v) })
    API.getConfig().then(cfg => { if (cfg) applyConfig(cfg) })

    let unlistenConfig, unlistenActiveScript, unlistenScrollProgress

    API.onConfigUpdate(applyConfig).then(fn => { unlistenConfig = fn })

    API.onActiveScript(({ cues }) => {
      setActiveCues(cues ?? [])
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
  }, [])

  function applyConfig(c) {
    if (c.mode)         setMode(c.mode)
    if (c.fontSize)     setFontSize(c.fontSize)
    if (c.screenshareHidden != null) setScreenshareHidden(c.screenshareHidden)
    if (c.scrollSpeed != null) {
      const i = SPEEDS.indexOf(c.scrollSpeed)
      setSpeedIdx(i !== -1 ? i : 3)
    }
  }

  const setConfig = (patch) => API.setConfig(patch)

  return (
    <div id="panel" ref={panelRef}>
      <div className="s-header">
        <div className="s-header-left">
          <div className="s-app-icon">{Icons.Prompter}</div>
          <span className="s-app-name">Teleprompt</span>
          {isRunning && <div className="s-live-badge">LIVE</div>}
        </div>
        <button
          className="s-visibility-btn"
          onClick={() => API.togglePrompter().then(v => { if (v != null) setPrompterVisible(v) })}
          title={prompterVisible ? 'Hide prompter window' : 'Show prompter window'}
        >
          {prompterVisible ? 'Hide' : 'Show'}
        </button>
      </div>

      <div className="s-body">
        <>
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
                {['notch', 'classic'].map(m => (
                  <button
                    key={m}
                    className={`s-seg-btn ${mode === m ? 'active' : ''}`}
                    onClick={() => {
                      setMode(m)
                      API.switchMode(m)
                    }}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="s-setting-row s-flex-row">
              <div className="s-row-left">
                <span className="s-label">Hide from screen capture</span>
                <span className="s-sublabel">Exclude window from screenshots &amp; screen share</span>
              </div>
              <Toggle checked={screenshareHidden} onChange={v => {
                setScreenshareHidden(v)
                setConfig({ screenshareHidden: v })
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
