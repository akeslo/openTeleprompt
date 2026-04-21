import { useEffect, useMemo, useRef, useState } from 'react'
import { tokenizeDoc } from '../lib/tokenizer'
import { useAppStore } from '../store'
import { API } from '../lib/api'
import { createMicEngine, SPEEDS, SCROLL_SPEED_BASE } from '../lib/mic'

export default function ReadView() {
  const { scriptText, scriptDoc, config, setConfig, setView, startCueId, setStartCueId } = useAppStore()
  // tokenizeDoc walks the entire doc tree — memoize so it only runs when scriptDoc changes,
  // not on every isSpeaking/speedIdx/micStatus state update.
  const tokens = useMemo(() => scriptDoc ? tokenizeDoc(scriptDoc) : [], [scriptDoc])

  const configRef = useRef(config)
  useEffect(() => { configRef.current = config }, [config])

  const [isPaused,   setIsPaused]   = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speedIdx,   setSpeedIdx]   = useState(
    SPEEDS.indexOf(config.scrollSpeed) !== -1 ? SPEEDS.indexOf(config.scrollSpeed) : 3
  )
  const fontSize = config.fontSize || 24
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
  const headingRefs        = useRef({})
  const firedMarkers       = useRef(new Set())
  const micEngineRef       = useRef(null)
  const prevMicDeviceIdRef = useRef(config.micDeviceId)
  const frameCountRef      = useRef(0)
  const progressBarRef     = useRef(null)

  useEffect(() => { isPausedRef.current  = isPaused  }, [isPaused])
  useEffect(() => { isSpeakingRef.current = isSpeaking }, [isSpeaking])
  useEffect(() => { speedIdxRef.current  = speedIdx  }, [speedIdx])

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

  function seekToCue(cueId) {
    const el = headingRefs.current[cueId]
    if (!el || !scrollVPRef.current || !scriptTextRef.current) return
    const maxScroll = Math.max(0, scriptTextRef.current.scrollHeight - scrollVPRef.current.clientHeight)
    scrollPosRef.current = Math.min(el.offsetTop, maxScroll)
    scriptTextRef.current.style.transform = `translateY(${-scrollPosRef.current}px)`
    if (progressBarRef.current && maxScroll > 0)
      progressBarRef.current.style.width = `${(scrollPosRef.current / maxScroll) * 100}%`
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
    if (startCueId >= 0) {
      requestAnimationFrame(() => {
        seekToCue(startCueId)
        setStartCueId(-1)
      })
    }

    function checkMarkers() {
      if (!scrollVPRef.current) return
      // offsetTop is relative to #scroll-viewport (first positioned ancestor) — no forced reflow per element.
      // Visual top of element in viewport = offsetTop - scrollPosRef.current.
      const readingZone = scrollVPRef.current.clientHeight * 0.4
      Object.entries(markerRefs.current).forEach(([idxStr, el]) => {
        if (!el) return
        const idx = Number(idxStr)
        if (firedMarkers.current.has(idx)) return
        if (el.offsetTop - scrollPosRef.current < readingZone) {
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
          if (progressBarRef.current && maxScroll > 0)
            progressBarRef.current.style.width = `${(scrollPosRef.current / maxScroll) * 100}%`
        }
        checkMarkers()
      } else {
        lastFrameRef.current = 0
      }

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

    window.__TAURI__?.event?.listen('cue-jump', (e) => {
      seekToCue(e.payload.cueId)
    }).then(fn => { unlistenCueJump = fn })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      micEngineRef.current?.stop()
      unlistenShortcut?.()
      unlistenCueJump?.()
      emitScrollProgress(false)
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
    if (progressBarRef.current) progressBarRef.current.style.width = '0%'
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
    if (progressBarRef.current && maxScroll > 0)
      progressBarRef.current.style.width = `${(scrollPosRef.current / maxScroll) * 100}%`
  }

  const micRingClass = `mic-ring${isSpeaking ? '' : micStatus === 'Mic error' ? ' error' : ' paused'}`

  return (
    <div
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div id="progress-bar" ref={progressBarRef} />

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
                ref={el => { if (token.id !== null) headingRefs.current[token.id] = el }}
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
          <button className="ctrl-btn" aria-label="Decrease font size" onClick={() => { const n = Math.max(11, fontSize - 2); setConfig({ fontSize: n }); API.setConfig({ fontSize: n }) }}>A−</button>
          <button className="ctrl-btn" aria-label="Increase font size" onClick={() => { const n = Math.min(64, fontSize + 2); setConfig({ fontSize: n }); API.setConfig({ fontSize: n }) }}>A+</button>
          <button className="ctrl-btn" aria-label="Decrease scroll speed" onClick={() => setSpeedIdx(i => { const n = Math.max(0, i - 1); API.setConfig({ scrollSpeed: SPEEDS[n] }); return n })}>−</button>
          <span id="speed-val" aria-label={`Speed ${SPEEDS[speedIdx]}x`}>{SPEEDS[speedIdx]}×</span>
          <button className="ctrl-btn" aria-label="Increase scroll speed" onClick={() => setSpeedIdx(i => { const n = Math.min(SPEEDS.length - 1, i + 1); API.setConfig({ scrollSpeed: SPEEDS[n] }); return n })}>+</button>
          <button className="ctrl-btn" aria-label={isPaused ? 'Resume' : 'Pause'} onClick={togglePause}>{isPaused ? '▶' : '⏸'}</button>
          <button className="ctrl-btn" aria-label="Reset to beginning" onClick={handleReset}>↺</button>
          <button className="ctrl-btn" aria-label="Stop and close" onClick={handleDone}>✕</button>
        </div>
      </div>
    </div>
  )
}
