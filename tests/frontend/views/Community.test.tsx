// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '../../setup/dom-setup'
import { getPurroxyMock, resetPurroxyMock } from '../../setup/dom-setup'
import { buildAccountStatus, subscribedStatus } from '../../factories/account-factory'
import { buildCapability } from '../../factories/capability-factory'
import { buildSite } from '../../factories/site-factory'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: any) => <span data-testid={`icon-${name}`} />
  return {
    Search: icon('Search'),
    Download: icon('Download'),
    Upload: icon('Upload'),
    Globe: icon('Globe'),
    Users: icon('Users'),
    Loader2: icon('Loader2'),
    CheckCircle: icon('CheckCircle'),
    ExternalLink: icon('ExternalLink'),
    Clock: icon('Clock'),
    XCircle: icon('XCircle'),
  }
})

// Stub global fetch
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import Community from '../../../src/views/Community'

describe('Community view', () => {
  beforeEach(() => {
    resetPurroxyMock()
    fetchMock.mockReset()
  })

  it('shows login required message when not logged in', async () => {
    const api = getPurroxyMock()
    api.account.getStatus.mockResolvedValue(buildAccountStatus({ loggedIn: false }))

    render(<Community />)

    await waitFor(() => {
      expect(screen.getByText(/Log in to browse community capabilities/)).toBeInTheDocument()
    })
  })

  it('renders community capabilities', async () => {
    const api = getPurroxyMock()
    api.account.getStatus.mockResolvedValue(subscribedStatus({ apiUrl: 'https://api.test.com' }))

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        capabilities: [
          {
            id: 'cc-1',
            name: 'Check Weather',
            description: 'Gets the current weather',
            hostname: 'weather.com',
            authorEmail: 'user@test.com',
            installCount: 42,
            createdAt: new Date().toISOString(),
          }
        ]
      })
    })
    // Submissions fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submissions: [] })
    })

    render(<Community />)

    await waitFor(() => {
      expect(screen.getByText('Check Weather')).toBeInTheDocument()
      expect(screen.getByText(/weather\.com/)).toBeInTheDocument()
      expect(screen.getByText(/42 installs/)).toBeInTheDocument()
    })
  })

  it('install flow creates site and capability', async () => {
    const api = getPurroxyMock()
    api.account.getStatus.mockResolvedValue(subscribedStatus({ apiUrl: 'https://api.test.com' }))

    // Community list fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        capabilities: [
          {
            id: 'cc-1',
            name: 'Check Weather',
            description: 'Gets the current weather',
            hostname: 'weather.com',
            authorEmail: 'user@test.com',
            installCount: 5,
            createdAt: new Date().toISOString(),
          }
        ]
      })
    })
    // Submissions fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submissions: [] })
    })

    render(<Community />)

    await waitFor(() => {
      expect(screen.getByText('Check Weather')).toBeInTheDocument()
    })

    // Mock the install API response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'Check Weather',
        description: 'Gets the current weather',
        hostname: 'weather.com',
        actions: [],
        parameters: [],
        extractionRules: [],
      })
    })

    const site = buildSite({ id: 'new-site-1', hostname: 'weather.com' })
    api.sites.create.mockResolvedValue(site)
    api.capabilities.create.mockResolvedValue(buildCapability({ siteProfileId: 'new-site-1' }))

    // Click the Install button
    fireEvent.click(screen.getByText('Install'))

    await waitFor(() => {
      expect(api.sites.create).toHaveBeenCalledWith('https://weather.com', '', '')
      expect(api.capabilities.create).toHaveBeenCalled()
    })
  })

  it('publish panel opens when Publish is clicked', async () => {
    const api = getPurroxyMock()
    api.account.getStatus.mockResolvedValue(subscribedStatus({ apiUrl: 'https://api.test.com' }))
    api.capabilities.getAll.mockResolvedValue([
      buildCapability({ name: 'My Cap', description: 'Does stuff' })
    ])

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: [] })
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submissions: [] })
    })

    render(<Community />)

    await waitFor(() => {
      expect(screen.getByText('Publish')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Publish'))

    await waitFor(() => {
      expect(screen.getByText('Choose a capability to share')).toBeInTheDocument()
    })
  })

  it('publish submits to API', async () => {
    const api = getPurroxyMock()
    const status = subscribedStatus({ apiUrl: 'https://api.test.com' })
    // getStatus is called many times throughout the flow — always return the same status
    api.account.getStatus.mockResolvedValue(status)
    api.account.validate.mockResolvedValue({ valid: true })
    api.account.refresh.mockResolvedValue({ success: true })

    const site = buildSite({ id: 'site-1', hostname: 'example.com' })
    const cap = buildCapability({ id: 'cap-1', siteProfileId: 'site-1', name: 'My Cap', description: 'Does stuff' })
    api.capabilities.getAll.mockResolvedValue([cap])
    api.sites.getAll.mockResolvedValue([site])

    // Community list fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: [] })
    })
    // Submissions fetch (initial load)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submissions: [] })
    })

    render(<Community />)

    await waitFor(() => {
      expect(screen.getByText('Publish')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Publish'))

    await waitFor(() => {
      expect(screen.getByText('Choose a capability to share')).toBeInTheDocument()
    })

    // The publish POST will be the next fetch call
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: 'Your capability has been submitted!',
        githubPr: { url: 'https://github.com/org/repo/pull/42' }
      })
    })
    // loadSubmissions after publish success
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submissions: [] })
    })

    // Find the inner Publish button (inside the panel)
    const publishButtons = screen.getAllByText('Publish')
    fireEvent.click(publishButtons[publishButtons.length - 1])

    await waitFor(() => {
      expect(screen.getByText('Submitted for review!')).toBeInTheDocument()
    })
  })

  it('shows submission history', async () => {
    const api = getPurroxyMock()
    api.account.getStatus.mockResolvedValue(subscribedStatus({ apiUrl: 'https://api.test.com' }))

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: [] })
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        submissions: [
          {
            id: 'sub-1',
            capabilityName: 'Check Prices',
            hostname: 'shop.com',
            status: 'pending',
            githubPrUrl: null,
            rejectionReason: null,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'sub-2',
            capabilityName: 'Get Stock',
            hostname: 'finance.com',
            status: 'approved',
            githubPrUrl: 'https://github.com/org/repo/pull/1',
            rejectionReason: null,
            createdAt: new Date().toISOString(),
          }
        ]
      })
    })

    render(<Community />)

    await waitFor(() => {
      expect(screen.getByText('Your submissions')).toBeInTheDocument()
      expect(screen.getByText('Check Prices')).toBeInTheDocument()
      expect(screen.getByText('Get Stock')).toBeInTheDocument()
    })
  })

  it('shows empty state when no community capabilities exist', async () => {
    const api = getPurroxyMock()
    api.account.getStatus.mockResolvedValue(subscribedStatus({ apiUrl: 'https://api.test.com' }))

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: [] })
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submissions: [] })
    })

    render(<Community />)

    await waitFor(() => {
      expect(screen.getByText('No community capabilities yet')).toBeInTheDocument()
      expect(screen.getByText('Be the first to publish one!')).toBeInTheDocument()
    })
  })

  it('renders search input', async () => {
    const api = getPurroxyMock()
    api.account.getStatus.mockResolvedValue(subscribedStatus({ apiUrl: 'https://api.test.com' }))

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: [] })
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submissions: [] })
    })

    render(<Community />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search capabilities...')).toBeInTheDocument()
    })
  })

  it('shows error when publish has no capabilities', async () => {
    const api = getPurroxyMock()
    api.account.getStatus.mockResolvedValue(subscribedStatus({ apiUrl: 'https://api.test.com' }))
    api.capabilities.getAll.mockResolvedValue([])

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ capabilities: [] })
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submissions: [] })
    })

    render(<Community />)

    await waitFor(() => {
      expect(screen.getByText('Publish')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Publish'))

    await waitFor(() => {
      expect(screen.getByText(/No capabilities to publish/)).toBeInTheDocument()
    })
  })
})
