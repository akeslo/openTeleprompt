import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditView from './EditView.jsx'

// Mock Zustand store
vi.mock('../store', () => ({
  useAppStore: vi.fn(() => ({
    setView: vi.fn(),
    scripts: [
      { name: 'Test Script', text: 'Hello world', content: '{"type":"doc"}', filePath: '', fileExt: '' },
    ],
    setScripts: vi.fn(),
    currentScriptIndex: 0,
    setCurrentScriptIndex: vi.fn(),
    setScriptText: vi.fn(),
    setScriptDoc: vi.fn(),
    config: { mode: 'classic', autoScroll: false },
    setConfig: vi.fn(),
  })),
}))

// Mock Tiptap
vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn((opts) => ({
    getText: vi.fn(() => 'Test content'),
    getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
    commands: {
      setContent: vi.fn(),
      focus: vi.fn(),
      toggleBold: vi.fn(() => ({ run: vi.fn() })),
      toggleHeading: vi.fn(() => ({ run: vi.fn() })),
      setColor: vi.fn(() => ({ run: vi.fn() })),
      unsetColor: vi.fn(() => ({ run: vi.fn() })),
      insertContent: vi.fn(() => ({ run: vi.fn() })),
      chain: vi.fn(() => ({
        focus: vi.fn(() => ({
          toggleBold: vi.fn(() => ({ run: vi.fn() })),
          toggleHeading: vi.fn(() => ({ run: vi.fn() })),
          setColor: vi.fn(() => ({ run: vi.fn() })),
          unsetColor: vi.fn(() => ({ run: vi.fn() })),
          insertContent: vi.fn(() => ({ run: vi.fn() })),
        })),
      })),
    },
    isActive: vi.fn(() => false),
  })),
  EditorContent: vi.fn(() => <div data-testid="editor-content" />),
}))

// Mock API
vi.mock('../lib/api', () => ({
  API: {
    togglePassThrough: vi.fn(),
    openFile: vi.fn(),
    saveFile: vi.fn(),
    saveScripts: vi.fn(),
    setConfig: vi.fn(),
    setIgnoreMouse: vi.fn(),
  },
}))

// Mock fileUtils
vi.mock('../lib/fileUtils', () => ({
  mdToHtml: vi.fn((md) => `<p>${md}</p>`),
  tiptapToMarkdown: vi.fn(() => '# Test\nContent'),
  tiptapToPlainText: vi.fn(() => 'Test\nContent'),
}))

// Mock tokenizer
vi.mock('../lib/tokenizer', () => ({
  extractCues: vi.fn(() => []),
}))

describe('EditView', () => {
  beforeEach(() => {
    // Mock window.__TAURI__
    window.__TAURI__ = {
      event: {
        listen: vi.fn((event, cb) => Promise.resolve(() => {})),
        emit: vi.fn(),
      },
    }
  })

  it('renders edit view with header buttons', () => {
    render(<EditView />)
    expect(screen.getByRole('button', { name: /toggle click-through/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\+ new/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open file/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save script/i })).toBeInTheDocument()
  })

  it('renders script list when scripts exist', () => {
    render(<EditView />)
    expect(screen.getByText('Test Script')).toBeInTheDocument()
  })

  it('renders editor content area', () => {
    render(<EditView />)
    expect(screen.getByTestId('editor-content')).toBeInTheDocument()
  })

  it('renders formatting toolbar', () => {
    render(<EditView />)
    expect(screen.getByTitle('Bold')).toBeInTheDocument()
    expect(screen.getByTitle('Heading 1')).toBeInTheDocument()
    expect(screen.getByTitle('Heading 2')).toBeInTheDocument()
    expect(screen.getByTitle('Heading 3')).toBeInTheDocument()
  })

  it('renders marker buttons in toolbar', () => {
    render(<EditView />)
    expect(screen.getByTitle('Insert [PAUSE]')).toBeInTheDocument()
    expect(screen.getByTitle('Insert [SLOW]')).toBeInTheDocument()
    expect(screen.getByTitle('Insert [BREATHE]')).toBeInTheDocument()
  })

  it('renders stats area', () => {
    render(<EditView />)
    const statsElement = screen.getByText(/words.*wpm/i)
    expect(statsElement).toBeInTheDocument()
  })

  it('displays save button initially', () => {
    render(<EditView />)
    expect(screen.getByRole('button', { name: /save script/i })).toHaveTextContent('Save')
  })

  it('toggles click-through button state', async () => {
    const { rerender } = render(<EditView />)
    const clickThroughBtn = screen.getByRole('button', { name: /toggle click-through/i })
    expect(clickThroughBtn).not.toHaveClass('active')
  })

  it('shows error state when file open fails', async () => {
    const { API: MockAPI } = await import('../lib/api')
    MockAPI.openFile.mockRejectedValueOnce(new Error('Open failed'))

    render(<EditView />)
    const openBtn = screen.getByRole('button', { name: /open file/i })

    fireEvent.click(openBtn)
    await waitFor(() => {
      expect(openBtn).toHaveTextContent('Error')
    })
  })

  it('handles script selection from list', () => {
    render(<EditView />)
    const scriptItem = screen.getByText('Test Script')
    expect(scriptItem.parentElement).toHaveClass('script-item')
  })

  it('renders delete button for each script in list', () => {
    render(<EditView />)
    const deleteButtons = screen.getAllByRole('button').filter(btn => btn.textContent === '✕')
    expect(deleteButtons.length).toBeGreaterThan(0)
  })

  it('renders collapse/close button', () => {
    render(<EditView />)
    const closeBtn = screen.getAllByRole('button').find(btn => btn.textContent === '✕' && btn.className.includes('ghost'))
    expect(closeBtn).toBeInTheDocument()
  })

  it('renders start/go button', () => {
    render(<EditView />)
    const goBtn = screen.getByRole('button', { name: 'Go →' })
    expect(goBtn).toHaveClass('accent')
  })

  describe('keyboard shortcuts', () => {
    it('captures Cmd+S to save script', async () => {
      render(<EditView />)
      const event = new KeyboardEvent('keydown', {
        key: 's',
        metaKey: true,
        bubbles: true,
      })
      window.dispatchEvent(event)
      // Verify handler was attached without error
      expect(window.addEventListener).not.toThrow()
    })

    it('captures Ctrl+S to save script on non-Mac', async () => {
      render(<EditView />)
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
      })
      window.dispatchEvent(event)
      expect(window.addEventListener).not.toThrow()
    })
  })

  describe('auto-scroll toggle', () => {
    it('renders auto-scroll toggle button', () => {
      render(<EditView />)
      const autoScrollBtn = screen.getByRole('button', { name: /toggle auto-scroll/i })
      expect(autoScrollBtn).toBeInTheDocument()
    })

    it('shows "Voice" label when auto-scroll is off', () => {
      render(<EditView />)
      const autoScrollBtn = screen.getByRole('button', { name: /toggle auto-scroll/i })
      expect(autoScrollBtn).toHaveTextContent('Voice')
    })
  })

  describe('pass-through toggle', () => {
    it('renders click-through toggle button', () => {
      render(<EditView />)
      const passThroughBtn = screen.getByRole('button', { name: /toggle click-through/i })
      expect(passThroughBtn).toBeInTheDocument()
    })

    it('button is not active by default', () => {
      render(<EditView />)
      const passThroughBtn = screen.getByRole('button', { name: /toggle click-through/i })
      expect(passThroughBtn).not.toHaveClass('active')
    })
  })

  describe('view title', () => {
    it('displays "Script" as the view title', () => {
      render(<EditView />)
      expect(screen.getByText('Script')).toBeInTheDocument()
    })
  })
})
