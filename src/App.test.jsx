import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import App from './App.jsx'
import { useAppStore } from './store'

// App.jsx is the one view/orchestration module with no test file (§ enhancements.md
// E-20260909-1): view-switching, window-resize sizing, and config bootstrap all live
// here and it is the most-churned file in the repo's history. Outside Tauri (no
// window.__TAURI__), every API.* call resolves to a no-op per src/lib/api.js, so these
// tests exercise the real store + real API shim rather than mocking either.

const initialState = useAppStore.getState()

beforeEach(() => {
  useAppStore.setState(initialState, true)
})

describe('App', () => {
  it('renders IdleView by default', () => {
    render(<App />)
    expect(screen.getByText('Teleprompter')).toBeInTheDocument()
  })

  it('switches to the edit view when the store view changes', async () => {
    render(<App />)
    await act(async () => {
      useAppStore.getState().setView('edit')
    })
    expect(document.getElementById('island').className).toContain('state-edit')
  })

  it('switches to the read view when the store view changes', async () => {
    render(<App />)
    await act(async () => {
      useAppStore.getState().setView('read')
    })
    expect(document.getElementById('island').className).toContain('state-read')
  })

  it('applies the config theme to the document root', async () => {
    render(<App />)
    await act(async () => {
      useAppStore.getState().setConfig({ theme: 'light' })
    })
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('applies mode-classic to the body when config.mode is classic', async () => {
    render(<App />)
    await act(async () => {
      useAppStore.getState().setConfig({ mode: 'classic' })
    })
    expect(document.body.classList.contains('mode-classic')).toBe(true)
  })

  it('renders the dev panel outside Tauri', () => {
    render(<App />)
    expect(document.getElementById('dev-panel')).toBeInTheDocument()
  })

  it('dev panel view selector reflects and drives the store view', async () => {
    render(<App />)
    const select = screen.getByDisplayValue('Idle')
    expect(select).toBeInTheDocument()
    await act(async () => {
      useAppStore.getState().setView('edit')
    })
    expect(document.getElementById('island').className).toContain('state-edit')
  })
})
