import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './index'

// Snapshot the store's initial values so we can restore them between tests —
// zustand persists state across `create()` calls within a test file.
const initialState = useAppStore.getState()

beforeEach(() => {
  useAppStore.setState(initialState, true)
})

describe('useAppStore', () => {
  it('defaults to the idle view', () => {
    expect(useAppStore.getState().view).toBe('idle')
  })

  it('setView updates the view', () => {
    useAppStore.getState().setView('edit')
    expect(useAppStore.getState().view).toBe('edit')
  })

  it('setConfig merges a patch into the existing config without dropping other keys', () => {
    const before = useAppStore.getState().config
    useAppStore.getState().setConfig({ fontSize: 32 })
    const after = useAppStore.getState().config
    expect(after.fontSize).toBe(32)
    expect(after.mode).toBe(before.mode)
    expect(after.theme).toBe(before.theme)
  })

  it('setScripts and setCurrentScriptIndex update independently', () => {
    useAppStore.getState().setScripts([{ id: 1 }, { id: 2 }])
    useAppStore.getState().setCurrentScriptIndex(1)
    expect(useAppStore.getState().scripts).toHaveLength(2)
    expect(useAppStore.getState().currentScriptIndex).toBe(1)
  })

  it('setScriptText and setScriptDoc update independently', () => {
    useAppStore.getState().setScriptText('hello')
    useAppStore.getState().setScriptDoc({ type: 'doc' })
    expect(useAppStore.getState().scriptText).toBe('hello')
    expect(useAppStore.getState().scriptDoc).toEqual({ type: 'doc' })
  })

  it('setIsPaused and setIsSpeaking update independently', () => {
    useAppStore.getState().setIsPaused(true)
    useAppStore.getState().setIsSpeaking(true)
    expect(useAppStore.getState().isPaused).toBe(true)
    expect(useAppStore.getState().isSpeaking).toBe(true)
  })

  it('setStartCueId updates the cue id', () => {
    useAppStore.getState().setStartCueId(5)
    expect(useAppStore.getState().startCueId).toBe(5)
  })
})
