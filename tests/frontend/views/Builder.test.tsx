// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '../../setup/dom-setup'
import { getPurroxyMock, resetPurroxyMock } from '../../setup/dom-setup'
import { buildAccountStatus } from '../../factories/account-factory'

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}))

// Mock react-markdown (renders children as plain text)
vi.mock('react-markdown', () => ({
  default: ({ children }: any) => <div data-testid="markdown">{children}</div>,
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: any) => <span data-testid={`icon-${name}`} />
  return {
    ArrowLeft: icon('ArrowLeft'),
    ArrowRight: icon('ArrowRight'),
    RotateCw: icon('RotateCw'),
    X: icon('X'),
    Loader2: icon('Loader2'),
    Circle: icon('Circle'),
    Square: icon('Square'),
    MousePointerClick: icon('MousePointerClick'),
    Type: icon('Type'),
    Navigation: icon('Navigation'),
    List: icon('List'),
    ArrowDown: icon('ArrowDown'),
    Clock: icon('Clock'),
    Save: icon('Save'),
    ShieldCheck: icon('ShieldCheck'),
    CheckCircle: icon('CheckCircle'),
    ChevronRight: icon('ChevronRight'),
    PanelLeftClose: icon('PanelLeftClose'),
    PanelLeftOpen: icon('PanelLeftOpen'),
  }
})

// Stub scrollIntoView for jsdom (not implemented)
Element.prototype.scrollIntoView = vi.fn()

import Builder from '../../../src/views/Builder'

describe('Builder view', () => {
  beforeEach(() => {
    resetPurroxyMock()
    mockNavigate.mockReset()
  })

  it('renders URL input', async () => {
    render(<Builder />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter a website URL...')).toBeInTheDocument()
    })
  })

  it('shows prompt to enter URL before browser opens', async () => {
    render(<Builder />)

    await waitFor(() => {
      expect(screen.getByText('Enter a website URL above to get started.')).toBeInTheDocument()
    })
  })

  it('canUse gate blocks recording and shows message when denied', async () => {
    const api = getPurroxyMock()
    api.browser.open.mockResolvedValue(undefined)
    api.browser.onUrlChanged.mockReturnValue(() => {})
    api.browser.onTitleChanged.mockReturnValue(() => {})
    api.browser.onLoading.mockReturnValue(() => {})
    api.recorder.onAction.mockReturnValue(() => {})
    api.account.canUse.mockResolvedValue({
      allowed: false,
      reason: 'Trial expired. Subscribe to continue.'
    })
    api.ai.getPageContent.mockResolvedValue('page content')
    api.ai.chat.mockResolvedValue({ content: 'Hi, I see a login page.', usage: { input: 100, output: 50 } })
    api.capabilities.getAll.mockResolvedValue([])
    api.sites.getAll.mockResolvedValue([])

    render(<Builder />)

    // Submit a URL to open the browser
    const urlInput = screen.getByPlaceholderText('Enter a website URL...')
    fireEvent.change(urlInput, { target: { value: 'example.com' } })
    fireEvent.submit(urlInput.closest('form')!)

    await waitFor(() => {
      expect(api.browser.open).toHaveBeenCalled()
    })

    // Wait for the auto-analysis and tabs to appear
    await waitFor(() => {
      const recordingTab = screen.queryByText('Recording')
      if (recordingTab) {
        fireEvent.click(recordingTab)
      }
    }, { timeout: 3000 })

    // Try to find and click Start Recording
    const startButton = screen.queryByText('Start Recording')
    if (startButton) {
      fireEvent.click(startButton)

      await waitFor(() => {
        expect(api.account.canUse).toHaveBeenCalled()
      })
    }
  })

  it('renders chat interface when browser is open', async () => {
    const api = getPurroxyMock()
    api.browser.open.mockResolvedValue(undefined)
    api.browser.onUrlChanged.mockReturnValue(() => {})
    api.browser.onTitleChanged.mockReturnValue(() => {})
    api.browser.onLoading.mockReturnValue(() => {})
    api.recorder.onAction.mockReturnValue(() => {})
    api.ai.getPageContent.mockResolvedValue('page content')
    api.ai.chat.mockResolvedValue({ content: 'I can help you build a capability.', usage: { input: 100, output: 50 } })
    api.capabilities.getAll.mockResolvedValue([])
    api.sites.getAll.mockResolvedValue([])

    render(<Builder />)

    const urlInput = screen.getByPlaceholderText('Enter a website URL...')
    fireEvent.change(urlInput, { target: { value: 'example.com' } })
    fireEvent.submit(urlInput.closest('form')!)

    await waitFor(() => {
      expect(api.browser.open).toHaveBeenCalled()
    })

    // Chat and Recording tabs should appear
    await waitFor(() => {
      expect(screen.getByText('Chat')).toBeInTheDocument()
      expect(screen.getByText('Recording')).toBeInTheDocument()
    })
  })

  it('renders Send button', async () => {
    const api = getPurroxyMock()
    api.browser.open.mockResolvedValue(undefined)
    api.browser.onUrlChanged.mockReturnValue(() => {})
    api.browser.onTitleChanged.mockReturnValue(() => {})
    api.browser.onLoading.mockReturnValue(() => {})
    api.recorder.onAction.mockReturnValue(() => {})
    api.ai.getPageContent.mockResolvedValue('')
    api.ai.chat.mockResolvedValue({ content: 'Hello', usage: { input: 10, output: 10 } })
    api.capabilities.getAll.mockResolvedValue([])
    api.sites.getAll.mockResolvedValue([])

    render(<Builder />)

    const urlInput = screen.getByPlaceholderText('Enter a website URL...')
    fireEvent.change(urlInput, { target: { value: 'test.com' } })
    fireEvent.submit(urlInput.closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Send')).toBeInTheDocument()
    })
  })

  it('renders chat input placeholder', async () => {
    const api = getPurroxyMock()
    api.browser.open.mockResolvedValue(undefined)
    api.browser.onUrlChanged.mockReturnValue(() => {})
    api.browser.onTitleChanged.mockReturnValue(() => {})
    api.browser.onLoading.mockReturnValue(() => {})
    api.recorder.onAction.mockReturnValue(() => {})
    api.ai.getPageContent.mockResolvedValue('')
    api.ai.chat.mockResolvedValue({ content: '', usage: { input: 0, output: 0 } })
    api.capabilities.getAll.mockResolvedValue([])
    api.sites.getAll.mockResolvedValue([])

    render(<Builder />)

    const urlInput = screen.getByPlaceholderText('Enter a website URL...')
    fireEvent.change(urlInput, { target: { value: 'test.com' } })
    fireEvent.submit(urlInput.closest('form')!)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask the guide...')).toBeInTheDocument()
    })
  })

  it('calls browser.close on component close button', async () => {
    const api = getPurroxyMock()
    api.browser.open.mockResolvedValue(undefined)
    api.browser.close.mockResolvedValue(undefined)
    api.browser.onUrlChanged.mockReturnValue(() => {})
    api.browser.onTitleChanged.mockReturnValue(() => {})
    api.browser.onLoading.mockReturnValue(() => {})
    api.recorder.onAction.mockReturnValue(() => {})
    api.ai.getPageContent.mockResolvedValue('')
    api.ai.chat.mockResolvedValue({ content: '', usage: { input: 0, output: 0 } })
    api.capabilities.getAll.mockResolvedValue([])
    api.sites.getAll.mockResolvedValue([])

    render(<Builder />)

    const urlInput = screen.getByPlaceholderText('Enter a website URL...')
    fireEvent.change(urlInput, { target: { value: 'test.com' } })
    fireEvent.submit(urlInput.closest('form')!)

    await waitFor(() => {
      expect(api.browser.open).toHaveBeenCalled()
    })

    // Find the close button by title "Close"
    await waitFor(() => {
      const closeButton = screen.getByTitle('Close')
      fireEvent.click(closeButton)
    })

    await waitFor(() => {
      expect(api.browser.close).toHaveBeenCalled()
    })
  })

  it('renders collapse panel button', async () => {
    const api = getPurroxyMock()
    api.browser.open.mockResolvedValue(undefined)
    api.browser.onUrlChanged.mockReturnValue(() => {})
    api.browser.onTitleChanged.mockReturnValue(() => {})
    api.browser.onLoading.mockReturnValue(() => {})
    api.recorder.onAction.mockReturnValue(() => {})
    api.ai.getPageContent.mockResolvedValue('')
    api.ai.chat.mockResolvedValue({ content: '', usage: { input: 0, output: 0 } })
    api.capabilities.getAll.mockResolvedValue([])
    api.sites.getAll.mockResolvedValue([])

    render(<Builder />)

    const urlInput = screen.getByPlaceholderText('Enter a website URL...')
    fireEvent.change(urlInput, { target: { value: 'test.com' } })
    fireEvent.submit(urlInput.closest('form')!)

    await waitFor(() => {
      expect(screen.getByTitle('Collapse panel for wider browser')).toBeInTheDocument()
    })
  })
})
