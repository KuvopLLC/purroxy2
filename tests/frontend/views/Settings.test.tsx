// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '../../setup/dom-setup'
import { getPurroxyMock, resetPurroxyMock } from '../../setup/dom-setup'
import { buildAccountStatus, trialStatus, subscribedStatus, contributorStatus, expiredStatus, cancelledStatus } from '../../factories/account-factory'
import { useSettings } from '../../../src/stores/settings'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}))

// Mock lucide-react to avoid SVG rendering issues
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: any) => <span data-testid={`icon-${name}`} />
  return {
    Eye: icon('Eye'),
    EyeOff: icon('EyeOff'),
    Check: icon('Check'),
    CheckCircle: icon('CheckCircle'),
    Loader2: icon('Loader2'),
    Link2: icon('Link2'),
    Unlink: icon('Unlink'),
    Lock: icon('Lock'),
  }
})

import Settings from '../../../src/views/Settings'

describe('Settings view', () => {
  beforeEach(() => {
    resetPurroxyMock()
    // Reset store to loaded state so Settings renders
    useSettings.setState({
      aiApiKey: '',
      telemetryEnabled: false,
      loaded: true,
      load: vi.fn(),
      setAiApiKey: vi.fn(),
      setTelemetryEnabled: vi.fn(),
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // AccountSection
  // ════════════════════════════════════════════════════════════════════════════

  describe('AccountSection', () => {
    it('renders login/signup buttons when logged out', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(buildAccountStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Sign Up')).toBeInTheDocument()
        expect(screen.getByText('Log In')).toBeInTheDocument()
      })
    })

    it('shows trial badge with progress bar', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(trialStatus({ trialDaysLeft: 10 }))
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('10d trial')).toBeInTheDocument()
        expect(screen.getByText('10 days remaining')).toBeInTheDocument()
        expect(screen.getByText('Subscribe now')).toBeInTheDocument()
      })
    })

    it('shows subscribed badge with manage link', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(subscribedStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Subscribed')).toBeInTheDocument()
        expect(screen.getByText('Manage subscription')).toBeInTheDocument()
      })
    })

    it('shows contributor badge', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(contributorStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Contributor')).toBeInTheDocument()
        expect(screen.getByText('Free forever. Thank you for sharing.')).toBeInTheDocument()
      })
    })

    it('shows expired with subscribe CTA', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(expiredStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Expired')).toBeInTheDocument()
        expect(screen.getByText('Subscribe ($3.89/mo)')).toBeInTheDocument()
      })
    })

    it('shows cancelled with resubscribe', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(cancelledStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Cancelled')).toBeInTheDocument()
        expect(screen.getByText('Resubscribe ($3.89/mo)')).toBeInTheDocument()
      })
    })

    it('shows email verification notice when not verified', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(
        trialStatus({ emailVerified: false })
      )
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Check your email to verify your account.')).toBeInTheDocument()
      })
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // LockSettings
  // ════════════════════════════════════════════════════════════════════════════

  describe('LockSettings', () => {
    it('shows "Set up PIN" when not enabled', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(buildAccountStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })
      api.lock.getConfig.mockResolvedValue({
        enabled: false,
        timeoutMinutes: 5,
        hasPin: false,
        isLocked: false,
      })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Set up PIN')).toBeInTheDocument()
      })
    })

    it('shows enabled state with timeout buttons', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(buildAccountStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })
      api.lock.getConfig.mockResolvedValue({
        enabled: true,
        timeoutMinutes: 5,
        hasPin: true,
        isLocked: false,
      })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument()
        expect(screen.getByText('Lock now')).toBeInTheDocument()
        expect(screen.getByText('1m')).toBeInTheDocument()
        expect(screen.getByText('5m')).toBeInTheDocument()
        expect(screen.getByText('15m')).toBeInTheDocument()
        expect(screen.getByText('30m')).toBeInTheDocument()
      })
    })

    it('shows setup form when "Set up PIN" is clicked', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(buildAccountStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })
      api.lock.getConfig.mockResolvedValue({
        enabled: false,
        timeoutMinutes: 5,
        hasPin: false,
        isLocked: false,
      })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Set up PIN')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Set up PIN'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Set a PIN (4+ digits)')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Confirm PIN')).toBeInTheDocument()
        expect(screen.getByText('Enable')).toBeInTheDocument()
      })
    })

    it('shows Disable button when lock is enabled and reveals PIN input on click', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(buildAccountStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })
      api.lock.getConfig.mockResolvedValue({
        enabled: true,
        timeoutMinutes: 5,
        hasPin: true,
        isLocked: false,
      })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Disable')).toBeInTheDocument()
      })

      // PIN input is hidden until Disable is clicked
      expect(screen.queryByPlaceholderText('Enter PIN to disable')).not.toBeInTheDocument()

      fireEvent.click(screen.getByText('Disable'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter PIN to disable')).toBeInTheDocument()
      })
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // API Key section
  // ════════════════════════════════════════════════════════════════════════════

  describe('API Key section', () => {
    it('renders API key input', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(buildAccountStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument()
      })
    })

    it('renders version info', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(buildAccountStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText(/Purroxy v0\.1\.0/)).toBeInTheDocument()
      })
    })

    it('shows Save button for API key', async () => {
      const api = getPurroxyMock()
      api.account.getStatus.mockResolvedValue(buildAccountStatus())
      api.claude.getStatus.mockResolvedValue({ installed: false, connected: false })

      render(<Settings />)

      await waitFor(() => {
        expect(screen.getByText('Save')).toBeInTheDocument()
      })
    })
  })
})
