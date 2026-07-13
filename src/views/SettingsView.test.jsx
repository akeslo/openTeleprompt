import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsView from './SettingsView'

// SettingsView defines its own local API object (it runs in a separate Tauri
// window and cannot import src/lib/api.js — see CLAUDE.md). Without
// window.__TAURI__ every call falls back to a Promise.resolve(null)/no-op, so
// the component is safe to mount in jsdom; we only assert on the resulting
// DOM/control wiring, not on IPC payloads.

beforeEach(() => {
  // jsdom has no ResizeObserver; SettingsView observes its panel on mount.
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  // Avoid unhandled rejections from the mic-device probe on mount.
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no mic in jsdom')) },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SettingsView control wiring', () => {
  it('defaults to auto-scroll mode and switches to voice mode, revealing mic sensitivity', async () => {
    const user = userEvent.setup()
    render(<SettingsView />)

    const autoScrollBtn = screen.getByRole('button', { name: 'Auto-scroll' })
    const voiceBtn = screen.getByRole('button', { name: 'Voice' })
    expect(autoScrollBtn.className).toContain('active')
    expect(voiceBtn.className).not.toContain('active')
    expect(screen.queryByText('Mic sensitivity')).not.toBeInTheDocument()

    await user.click(voiceBtn)

    expect(voiceBtn.className).toContain('active')
    expect(autoScrollBtn.className).not.toContain('active')
    expect(screen.getByText('Mic sensitivity')).toBeInTheDocument()
  })

  it('switches the active text-align option on click', async () => {
    const user = userEvent.setup()
    render(<SettingsView />)

    const centerBtn = screen.getByRole('button', { name: 'Center' })
    const rightBtn = screen.getByRole('button', { name: 'Right' })
    expect(centerBtn.className).toContain('active')

    await user.click(rightBtn)

    expect(rightBtn.className).toContain('active')
    expect(centerBtn.className).not.toContain('active')
  })

  it('updates the displayed font size when the slider changes', async () => {
    render(<SettingsView />)

    const slider = screen.getByDisplayValue('22')
    expect(screen.getByText('22px')).toBeInTheDocument()

    fireOnChange(slider, '30')

    expect(screen.getByText('30px')).toBeInTheDocument()
  })
})

// jsdom's range inputs don't support realistic pointer-drag interaction, so
// this dispatches the change event userEvent would ultimately trigger.
function fireOnChange(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
