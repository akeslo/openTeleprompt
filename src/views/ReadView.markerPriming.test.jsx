// Regression test: jumping to a cue must not fire every marker above it.
//
// seekToCue used to clear firedMarkers/firedHeadings outright. Everything above
// the reading zone then satisfied `offsetTop - scrollPos < readingZone` on the
// next animation frame, so a [PAUSE] earlier in the script paused the prompter
// the moment the reader jumped forward to a later section. The markers above the
// jump target were skipped past, so they must be seeded as already fired.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import ReadView from './ReadView'
import { useAppStore } from '../store'

function docWithMarkerThenHeading() {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '[PAUSE] opening line' }] },
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Later section' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'body text' }] },
    ],
  }
}

describe('ReadView marker priming on seek', () => {
  let rafCallbacks

  beforeEach(() => {
    rafCallbacks = []
    vi.stubGlobal('requestAnimationFrame', (cb) => { rafCallbacks.push(cb); return rafCallbacks.length })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    // Content taller than the viewport so maxScroll is positive and the seek
    // actually moves; every element reports the same offsetTop, which puts the
    // marker above the reading zone once we have scrolled to the cue.
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 100 })
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 5000 })
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, value: 400 })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    delete HTMLElement.prototype.clientHeight
    delete HTMLElement.prototype.scrollHeight
    delete HTMLElement.prototype.offsetTop
    useAppStore.setState({ scriptDoc: null, startCueId: -1, isPaused: false })
  })

  it('does not pause on a [PAUSE] the reader jumped past', () => {
    useAppStore.setState({ scriptDoc: docWithMarkerThenHeading(), startCueId: 0, isPaused: false })

    render(<ReadView />)

    // The seekToCue-bound rAF is queued first in the mount effect.
    expect(rafCallbacks.length).toBeGreaterThan(0)
    act(() => { rafCallbacks[0]() })
    // Then run one scroll-loop frame, which is where checkMarkers() would fire
    // the skipped-past marker if the fired set had simply been cleared.
    act(() => { rafCallbacks[1]?.(1) })
    act(() => { rafCallbacks[2]?.(20) })

    expect(useAppStore.getState().isPaused).toBe(false)
  })
})
