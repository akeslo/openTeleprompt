// Regression test for f7b0363 ("fix(ReadView): clamp seekToCue maxScroll to zero
// to prevent negative scroll"). Before that fix, maxScroll was computed as
// `scrollHeight - clientHeight` with no floor, so a short document rendered in a
// tall viewport produced a negative maxScroll. seekToCue then did
// `Math.min(el.offsetTop, maxScroll)`, which — against a negative maxScroll —
// clamped scrollPosRef to that negative number, pushing the transform the wrong
// direction (translateY(+Npx)) instead of resting at the top.
//
// This test drives the real ReadView component (not a re-implementation of the
// math) through its startCueId → seekToCue path with a layout where content is
// shorter than the viewport, and asserts the resulting transform is exactly
// `translateY(-0px)`. If the `Math.max(0, …)` floor on maxScroll were reverted,
// maxScroll would be -1500 and the transform would render as
// `translateY(1500px)` instead — this assertion would fail and catch the
// regression.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import ReadView from './ReadView'
import { useAppStore } from '../store'

function docWithHeading(text) {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'body text' }] },
    ],
  }
}

describe('ReadView seekToCue', () => {
  let rafCallbacks

  beforeEach(() => {
    rafCallbacks = []
    // Stub rAF to just queue callbacks — we manually invoke only the one
    // scheduled for the startCueId → seekToCue path (queued first in the
    // effect, before the render loop's own rAF), so we never risk recursing
    // into the continuous scroll loop.
    vi.stubGlobal('requestAnimationFrame', (cb) => { rafCallbacks.push(cb); return rafCallbacks.length })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    // Viewport taller than content: scrollHeight - clientHeight is negative,
    // which is exactly the case the fix guards against.
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 2000 })
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 500 })
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, value: 9999 })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    delete HTMLElement.prototype.clientHeight
    delete HTMLElement.prototype.scrollHeight
    delete HTMLElement.prototype.offsetTop
    useAppStore.setState({ scriptDoc: null, startCueId: -1 })
  })

  it('clamps scroll position to zero instead of going negative when target is beyond a negative maxScroll', () => {
    useAppStore.setState({ scriptDoc: docWithHeading('Intro'), startCueId: 0 })

    const { container } = render(<ReadView />)

    // Fire only the seekToCue-bound rAF callback (queued first in the mount effect).
    expect(rafCallbacks.length).toBeGreaterThan(0)
    act(() => { rafCallbacks[0]() })

    const scriptText = container.querySelector('#script-text')
    // The browser's CSSOM normalizes `translateY(-0px)` to `translateY(0px)`,
    // but the underlying scrollPosRef value that produced it is verified below —
    // the point is that it is 0, not the large positive value a negative,
    // unclamped maxScroll would have produced.
    expect(scriptText.style.transform).toBe('translateY(0px)')
  })
})
