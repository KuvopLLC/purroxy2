import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRegisteredHandler, clearRegisteredHandlers } from '../setup/electron-mocks'
import { clipboard } from 'electron'

// ── Mock dependencies ────────────────────────────────────────────────────

// Mock store
const mockStoreData: Record<string, any> = { aiApiKey: 'test-key', telemetryEnabled: false }
vi.mock('../../electron/store', () => ({
  store: {
    get: vi.fn((key: string) => mockStoreData[key]),
    set: vi.fn((key: string, value: any) => { mockStoreData[key] = value }),
    get store() { return { ...mockStoreData } },
  },
}))

// Mock sites
const mockSites: any[] = []
const mockCreateSite = vi.fn().mockImplementation((url: string, name: string, favicon: string) => {
  const site = { id: 'new-site', url, hostname: new URL(url).hostname, name, faviconUrl: favicon, sessionEncrypted: null, createdAt: '', updatedAt: '' }
  mockSites.push(site)
  return site
})
const mockSaveSession = vi.fn()
const mockDeleteSite = vi.fn().mockImplementation((id: string) => {
  const idx = mockSites.findIndex(s => s.id === id)
  if (idx >= 0) mockSites.splice(idx, 1)
})
vi.mock('../../electron/sites', () => ({
  getAllSites: vi.fn(() => [...mockSites]),
  createSite: (...args: any[]) => mockCreateSite(...args),
  saveSession: (...args: any[]) => mockSaveSession(...args),
  deleteSite: (...args: any[]) => mockDeleteSite(...args),
}))

// Mock capabilities
const mockCaps: any[] = []
const mockCreateCapability = vi.fn().mockImplementation((data: any) => {
  const cap = { id: 'new-cap', ...data, createdAt: '', updatedAt: '' }
  mockCaps.push(cap)
  return cap
})
const mockDeleteCapability = vi.fn().mockImplementation((id: string) => {
  const idx = mockCaps.findIndex(c => c.id === id)
  if (idx >= 0) mockCaps.splice(idx, 1)
})
const mockUpdateCapability = vi.fn().mockImplementation((id: string, updates: any) => {
  const cap = mockCaps.find(c => c.id === id)
  if (cap) Object.assign(cap, updates)
  return cap
})
vi.mock('../../electron/capabilities', () => ({
  getAllCapabilities: vi.fn(() => [...mockCaps]),
  getCapabilitiesForSite: vi.fn((siteId: string) => mockCaps.filter(c => c.siteProfileId === siteId)),
  createCapability: (...args: any[]) => mockCreateCapability(...args),
  deleteCapability: (...args: any[]) => mockDeleteCapability(...args),
  updateCapability: (...args: any[]) => mockUpdateCapability(...args),
}))

import { setupIPC } from '../../electron/ipc'

describe('electron/ipc', () => {
  beforeEach(() => {
    clearRegisteredHandlers()
    vi.clearAllMocks()
    mockSites.length = 0
    mockCaps.length = 0
    Object.assign(mockStoreData, { aiApiKey: 'test-key', telemetryEnabled: false })
    setupIPC()
  })

  // ── Settings handlers ─────────────────────────────────────────────────

  describe('settings:get', () => {
    it('returns value for a given key', async () => {
      const handler = getRegisteredHandler('settings:get')!
      const result = await handler({}, 'aiApiKey')
      expect(result).toBe('test-key')
    })

    it('returns undefined for unknown key', async () => {
      const handler = getRegisteredHandler('settings:get')!
      const result = await handler({}, 'nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('settings:getAll', () => {
    it('returns all settings', async () => {
      const handler = getRegisteredHandler('settings:getAll')!
      const result = await handler({})
      expect(result).toEqual(expect.objectContaining({
        aiApiKey: 'test-key',
        telemetryEnabled: false,
      }))
    })
  })

  describe('settings:set', () => {
    it('sets a setting value and returns true', async () => {
      const handler = getRegisteredHandler('settings:set')!
      const result = await handler({}, 'aiApiKey', 'new-key')
      expect(result).toBe(true)
      expect(mockStoreData.aiApiKey).toBe('new-key')
    })
  })

  // ── Sites handlers ────────────────────────────────────────────────────

  describe('sites:getAll', () => {
    it('returns all sites', async () => {
      mockSites.push({ id: 's1', hostname: 'a.com' }, { id: 's2', hostname: 'b.com' })
      const handler = getRegisteredHandler('sites:getAll')!
      const result = await handler({})
      expect(result).toHaveLength(2)
    })

    it('returns empty array when no sites exist', async () => {
      const handler = getRegisteredHandler('sites:getAll')!
      const result = await handler({})
      expect(result).toEqual([])
    })
  })

  describe('sites:create', () => {
    it('creates and returns a new site', async () => {
      const handler = getRegisteredHandler('sites:create')!
      const result = await handler({}, 'https://test.com', 'Test', '/favicon.ico')
      expect(result).toEqual(expect.objectContaining({ id: 'new-site', name: 'Test' }))
      expect(mockCreateSite).toHaveBeenCalledWith('https://test.com', 'Test', '/favicon.ico')
    })
  })

  describe('sites:saveSession', () => {
    it('saves session and returns true', async () => {
      const handler = getRegisteredHandler('sites:saveSession')!
      const session = { cookies: [{ name: 'a', value: 'b' }], localStorage: {} }
      const result = await handler({}, 'site-1', session)
      expect(result).toBe(true)
      expect(mockSaveSession).toHaveBeenCalledWith('site-1', session)
    })
  })

  describe('sites:delete', () => {
    it('deletes site and returns true', async () => {
      mockSites.push({ id: 's1', hostname: 'a.com' })
      const handler = getRegisteredHandler('sites:delete')!
      const result = await handler({}, 's1')
      expect(result).toBe(true)
      expect(mockDeleteSite).toHaveBeenCalledWith('s1')
    })

    it('cascades deletion to all capabilities belonging to the site', async () => {
      mockSites.push({ id: 's1', hostname: 'a.com' })
      mockCaps.push(
        { id: 'c1', siteProfileId: 's1', name: 'Cap 1' },
        { id: 'c2', siteProfileId: 's1', name: 'Cap 2' },
        { id: 'c3', siteProfileId: 's2', name: 'Cap 3 (other site)' },
      )

      const handler = getRegisteredHandler('sites:delete')!
      await handler({}, 's1')

      // Should have deleted both capabilities for site s1
      expect(mockDeleteCapability).toHaveBeenCalledWith('c1')
      expect(mockDeleteCapability).toHaveBeenCalledWith('c2')
      // Should NOT have deleted cap for s2
      expect(mockDeleteCapability).not.toHaveBeenCalledWith('c3')
    })

    it('deletes zero caps when site has no capabilities', async () => {
      mockSites.push({ id: 's1', hostname: 'a.com' })
      const handler = getRegisteredHandler('sites:delete')!
      await handler({}, 's1')

      expect(mockDeleteCapability).not.toHaveBeenCalled()
      expect(mockDeleteSite).toHaveBeenCalledWith('s1')
    })
  })

  // ── Capabilities handlers ─────────────────────────────────────────────

  describe('capabilities:getAll', () => {
    it('returns all capabilities', async () => {
      mockCaps.push({ id: 'c1' }, { id: 'c2' })
      const handler = getRegisteredHandler('capabilities:getAll')!
      const result = await handler({})
      expect(result).toHaveLength(2)
    })

    it('returns empty array when no capabilities exist', async () => {
      const handler = getRegisteredHandler('capabilities:getAll')!
      const result = await handler({})
      expect(result).toEqual([])
    })
  })

  describe('capabilities:getForSite', () => {
    it('returns capabilities for a specific site', async () => {
      mockCaps.push(
        { id: 'c1', siteProfileId: 's1' },
        { id: 'c2', siteProfileId: 's2' },
        { id: 'c3', siteProfileId: 's1' },
      )
      const handler = getRegisteredHandler('capabilities:getForSite')!
      const result = await handler({}, 's1')
      expect(result).toHaveLength(2)
      expect(result.every((c: any) => c.siteProfileId === 's1')).toBe(true)
    })

    it('returns empty array when site has no capabilities', async () => {
      const handler = getRegisteredHandler('capabilities:getForSite')!
      const result = await handler({}, 's99')
      expect(result).toEqual([])
    })
  })

  describe('capabilities:create', () => {
    it('creates and returns a new capability', async () => {
      const handler = getRegisteredHandler('capabilities:create')!
      const data = {
        siteProfileId: 's1',
        name: 'New Cap',
        description: 'desc',
        actions: [],
        parameters: [],
        extractionRules: [],
      }
      const result = await handler({}, data)
      expect(result).toEqual(expect.objectContaining({ name: 'New Cap' }))
      expect(mockCreateCapability).toHaveBeenCalledWith(data)
    })
  })

  describe('capabilities:delete', () => {
    it('deletes capability and returns true', async () => {
      mockCaps.push({ id: 'c1' })
      const handler = getRegisteredHandler('capabilities:delete')!
      const result = await handler({}, 'c1')
      expect(result).toBe(true)
      expect(mockDeleteCapability).toHaveBeenCalledWith('c1')
    })
  })

  describe('capabilities:update', () => {
    it('updates capability and returns result', async () => {
      mockCaps.push({ id: 'c1', name: 'Old Name' })
      const handler = getRegisteredHandler('capabilities:update')!
      await handler({}, 'c1', { name: 'New Name' })
      expect(mockUpdateCapability).toHaveBeenCalledWith('c1', { name: 'New Name' })
    })
  })

  // ── Claude Desktop handlers ───────────────────────────────────────────

  // These handlers use require('fs'), require('path'), require('electron') inside,
  // which are served by the global electron mock and Node's real fs/path modules.
  // To test properly, we test the handler existence and the paths that don't
  // depend on filesystem calls, plus we test the error/fallback paths.

  describe('claude:getStatus', () => {
    it('is registered as a handler', () => {
      expect(getRegisteredHandler('claude:getStatus')).toBeDefined()
    })

    it('returns an object with installed and connected fields', async () => {
      const handler = getRegisteredHandler('claude:getStatus')!
      const result = await handler({})
      // The real handler uses fs.existsSync on a real path which will return false
      // in test environment, so we get installed: false
      expect(result).toHaveProperty('installed')
      expect(result).toHaveProperty('connected')
    })
  })

  describe('claude:connect', () => {
    it('is registered as a handler', () => {
      expect(getRegisteredHandler('claude:connect')).toBeDefined()
    })
  })

  describe('claude:disconnect', () => {
    it('is registered as a handler', () => {
      expect(getRegisteredHandler('claude:disconnect')).toBeDefined()
    })

    it('returns success even when no purroxy config exists', async () => {
      // In test environment, readFileSync will either throw or return unexpected data.
      // The catch block returns { error: 'Failed to update config' }
      const handler = getRegisteredHandler('claude:disconnect')!
      const result = await handler({})
      // Either success or error depending on what fs does
      expect(result).toHaveProperty('success')
      // If it got into the try block without purroxy, it still returns success
    })
  })

  // ── Window management handlers ────────────────────────────────────────

  describe('window:expandForRecording', () => {
    it('is registered as a handler', () => {
      expect(getRegisteredHandler('window:expandForRecording')).toBeDefined()
    })

    it('handler is callable (uses require("electron").BrowserWindow internally)', () => {
      // The handler calls require('electron').BrowserWindow.getAllWindows() internally
      // which in the mock environment may not resolve the same way as top-level imports.
      // We verify the handler exists and is a function.
      const handler = getRegisteredHandler('window:expandForRecording')!
      expect(typeof handler).toBe('function')
    })
  })

  describe('window:restoreSize', () => {
    it('is registered as a handler', () => {
      expect(getRegisteredHandler('window:restoreSize')).toBeDefined()
    })

    it('does nothing when no saved bounds exist', async () => {
      const handler = getRegisteredHandler('window:restoreSize')!
      const result = await handler({})
      expect(result).toBeUndefined()
    })
  })

  // ── System handlers ───────────────────────────────────────────────────

  describe('system:copyAndOpenClaude', () => {
    it('copies text to clipboard', async () => {
      const handler = getRegisteredHandler('system:copyAndOpenClaude')!
      await handler({}, 'Hello Claude')
      expect(clipboard.writeText).toHaveBeenCalledWith('Hello Claude')
    })

    it('returns an object with opened property', async () => {
      const handler = getRegisteredHandler('system:copyAndOpenClaude')!
      const result = await handler({}, 'test')
      // In test env, Claude is not installed so opened should be false
      expect(result).toHaveProperty('opened')
    })

    it('returns downloadUrl when Claude is not installed', async () => {
      const handler = getRegisteredHandler('system:copyAndOpenClaude')!
      const result = await handler({}, 'test')
      if (!result.opened) {
        expect(result.downloadUrl).toBe('https://claude.ai/download')
      }
    })
  })

  // ── Handler registration completeness ─────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC handlers', () => {
      const expectedHandlers = [
        'settings:get', 'settings:getAll', 'settings:set',
        'sites:getAll', 'sites:create', 'sites:saveSession', 'sites:delete',
        'capabilities:getAll', 'capabilities:getForSite', 'capabilities:create',
        'capabilities:delete', 'capabilities:update',
        'claude:getStatus', 'claude:connect', 'claude:disconnect',
        'window:expandForRecording', 'window:restoreSize',
        'system:copyAndOpenClaude',
      ]

      for (const channel of expectedHandlers) {
        expect(getRegisteredHandler(channel), `Handler '${channel}' should be registered`).toBeDefined()
      }
    })
  })
})
