import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IdleView from './IdleView.jsx'

// Mock Zustand store
const mockSetView = vi.fn()
vi.mock('../store', () => ({
  useAppStore: vi.fn((selector) => {
    const store = {
      setView: mockSetView,
      isSpeaking: false,
      isPaused: false,
      config: { mode: 'notch' },
    }
    return typeof selector === 'function' ? selector(store) : store
  }),
}))

describe('IdleView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders idle pill content', () => {
      render(<IdleView isHovered={false} />)
      expect(screen.getByText('Teleprompter')).toBeInTheDocument()
    })

    it('renders status dot', () => {
      render(<IdleView isHovered={false} />)
      const dot = document.querySelector('.idle-status-dot')
      expect(dot).toBeInTheDocument()
    })

    it('renders chevron icon', () => {
      render(<IdleView isHovered={false} />)
      const chevron = document.querySelector('.idle-chevron')
      expect(chevron).toBeInTheDocument()
    })

    it('applies hovered class when isHovered is true', () => {
      const { container } = render(<IdleView isHovered={true} />)
      const pillContent = container.querySelector('.idle-pill-content')
      expect(pillContent).toHaveClass('hovered')
    })

    it('does not apply hovered class when isHovered is false', () => {
      const { container } = render(<IdleView isHovered={false} />)
      const pillContent = container.querySelector('.idle-pill-content')
      expect(pillContent).not.toHaveClass('hovered')
    })
  })

  describe('status states', () => {
    it('displays "Teleprompter" label when idle', () => {
      render(<IdleView isHovered={false} />)
      expect(screen.getByText('Teleprompter')).toBeInTheDocument()
    })

    it('displays "Recording" label when speaking', async () => {
      const { useAppStore } = await import('../store')
      useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: true,
        isPaused: false,
        config: { mode: 'notch' },
      })
      render(<IdleView isHovered={false} />)
      expect(screen.getByText('Recording')).toBeInTheDocument()
    })

    it('displays "Paused" label when paused but not speaking', async () => {
      const { useAppStore } = await import('../store')
      useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: false,
        isPaused: true,
        config: { mode: 'notch' },
      })
      render(<IdleView isHovered={false} />)
      expect(screen.getByText('Paused')).toBeInTheDocument()
    })

    it('applies pulse class to dot when speaking', async () => {
      const store = await import('../store')
      store.useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: true,
        isPaused: false,
        config: { mode: 'notch' },
      })
      const { container } = render(<IdleView isHovered={false} />)
      const dot = container.querySelector('.idle-status-dot')
      expect(dot).toHaveClass('pulse')
    })

    it('does not apply pulse class when not speaking', () => {
      const { container } = render(<IdleView isHovered={false} />)
      const dot = container.querySelector('.idle-status-dot')
      expect(dot).not.toHaveClass('pulse')
    })
  })

  describe('interaction', () => {
    it('opens edit view on click in notch mode', () => {
      render(<IdleView isHovered={false} />)
      const wrapper = document.querySelector('.idle-notch-wrap')
      fireEvent.click(wrapper)
      expect(mockSetView).toHaveBeenCalledWith('edit')
    })

    it('opens edit view on chevron click in classic mode', async () => {
      const { useAppStore } = await import('../store')
      useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: false,
        isPaused: false,
        config: { mode: 'classic' },
      })
      render(<IdleView isHovered={false} />)
      const chevron = document.querySelector('.idle-chevron')
      fireEvent.click(chevron)
      expect(mockSetView).toHaveBeenCalledWith('edit')
    })

    it('opens edit view on Enter key in notch mode', () => {
      render(<IdleView isHovered={false} />)
      const wrapper = document.querySelector('.idle-notch-wrap')
      fireEvent.keyDown(wrapper, { key: 'Enter' })
      expect(mockSetView).toHaveBeenCalledWith('edit')
    })

    it('opens edit view on Space key in notch mode', () => {
      render(<IdleView isHovered={false} />)
      const wrapper = document.querySelector('.idle-notch-wrap')
      fireEvent.keyDown(wrapper, { key: ' ' })
      expect(mockSetView).toHaveBeenCalledWith('edit')
    })

    it('does not react to other keys', () => {
      render(<IdleView isHovered={false} />)
      const wrapper = document.querySelector('.idle-notch-wrap')
      fireEvent.keyDown(wrapper, { key: 'ArrowUp' })
      expect(mockSetView).not.toHaveBeenCalled()
    })
  })

  describe('mode-specific behavior', () => {
    it('notch mode sets click handler on wrapper', async () => {
      const store = await import('../store')
      store.useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: false,
        isPaused: false,
        config: { mode: 'notch' },
      })
      const { container } = render(<IdleView isHovered={false} />)
      const wrapper = container.querySelector('.idle-notch-wrap')
      expect(wrapper).toHaveAttribute('role', 'button')
      expect(wrapper).toHaveAttribute('aria-label')
    })

    it('classic mode does not set role on wrapper', async () => {
      const store = await import('../store')
      store.useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: false,
        isPaused: false,
        config: { mode: 'classic' },
      })
      const { container } = render(<IdleView isHovered={false} />)
      const wrapper = container.querySelector('.idle-notch-wrap')
      expect(wrapper).not.toHaveAttribute('role')
    })

    it('classic mode chevron has pointer cursor and click handler', async () => {
      const store = await import('../store')
      store.useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: false,
        isPaused: false,
        config: { mode: 'classic' },
      })
      const { container } = render(<IdleView isHovered={false} />)
      const chevron = container.querySelector('.idle-chevron')
      expect(chevron).toHaveStyle({ cursor: 'pointer' })
    })

    it('notch mode chevron has no pointer cursor', () => {
      const { container } = render(<IdleView isHovered={false} />)
      const chevron = container.querySelector('.idle-chevron')
      expect(chevron).not.toHaveStyle({ cursor: 'pointer' })
    })
  })

  describe('accessibility', () => {
    it('notch mode has descriptive aria-label', () => {
      const { container } = render(<IdleView isHovered={false} />)
      const wrapper = container.querySelector('.idle-notch-wrap')
      expect(wrapper).toHaveAttribute('aria-label', 'Teleprompter — click to open')
    })

    it('status dot does not have aria-hidden (is semantically important)', () => {
      const { container } = render(<IdleView isHovered={false} />)
      const dot = container.querySelector('.idle-status-dot')
      expect(dot).not.toHaveAttribute('aria-hidden')
    })

    it('label has aria-hidden', () => {
      const { container } = render(<IdleView isHovered={false} />)
      const label = container.querySelector('.idle-pill-label')
      expect(label).toHaveAttribute('aria-hidden', 'true')
    })

    it('chevron has aria-hidden', () => {
      const { container } = render(<IdleView isHovered={false} />)
      const chevron = container.querySelector('.idle-chevron')
      expect(chevron).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('visual styling', () => {
    it('status dot color is green when speaking', async () => {
      const store = await import('../store')
      store.useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: true,
        isPaused: false,
        config: { mode: 'notch' },
      })
      const { container } = render(<IdleView isHovered={false} />)
      const dot = container.querySelector('.idle-status-dot')
      expect(dot).toHaveStyle({ background: '#22c55e' })
    })

    it('status dot color is amber when paused', async () => {
      const store = await import('../store')
      store.useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: false,
        isPaused: true,
        config: { mode: 'notch' },
      })
      const { container } = render(<IdleView isHovered={false} />)
      const dot = container.querySelector('.idle-status-dot')
      expect(dot).toHaveStyle({ background: '#f59e0b' })
    })

    it('status dot color uses CSS var when idle', () => {
      const { container } = render(<IdleView isHovered={false} />)
      const dot = container.querySelector('.idle-status-dot')
      expect(dot).toHaveStyle({ background: 'var(--text-muted)' })
    })

    it('status dot glow is green when speaking', async () => {
      const store = await import('../store')
      store.useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: true,
        isPaused: false,
        config: { mode: 'notch' },
      })
      const { container } = render(<IdleView isHovered={false} />)
      const dot = container.querySelector('.idle-status-dot')
      expect(dot).toHaveStyle({ boxShadow: '0 0 8px #22c55ecc' })
    })

    it('status dot glow is amber when paused', async () => {
      const store = await import('../store')
      store.useAppStore.mockReturnValueOnce({
        setView: mockSetView,
        isSpeaking: false,
        isPaused: true,
        config: { mode: 'notch' },
      })
      const { container } = render(<IdleView isHovered={false} />)
      const dot = container.querySelector('.idle-status-dot')
      expect(dot).toHaveStyle({ boxShadow: '0 0 8px #f59e0baa' })
    })
  })
})
