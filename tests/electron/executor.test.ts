import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRegisteredHandler, clearRegisteredHandlers } from '../setup/electron-mocks'
import { buildCapability, buildCapabilityWithActions, buildCapabilityWithExtraction } from '../factories/capability-factory'
import { buildSite, buildSiteWithSession } from '../factories/site-factory'
import { buildNavigateAction, buildClickAction, buildTypeAction } from '../factories/action-factory'
import type { ExecutionResult } from '../../core/browser/types'

// ── Mock dependencies ────────────────────────────────────────────────────

const mockLaunch = vi.fn().mockResolvedValue(undefined)
const mockExecute = vi.fn<any>().mockResolvedValue({
  success: true,
  data: { title: 'Test' },
  error: undefined,
  durationMs: 500,
  log: ['step 1'],
} as ExecutionResult)
const mockClose = vi.fn().mockResolvedValue(undefined)
const mockSetHealer = vi.fn()
const mockGetHealedLocators = vi.fn().mockReturnValue([])

vi.mock('../../core/browser/playwright-engine', () => {
  const MockEngine = vi.fn().mockImplementation(function (this: any) {
    this.launch = mockLaunch
    this.execute = mockExecute
    this.close = mockClose
    this.setHealer = mockSetHealer
    this.getHealedLocators = mockGetHealedLocators
  })
  return { PlaywrightEngine: MockEngine }
})

// Mock account module
const mockIsLicenseValid = vi.fn().mockReturnValue(true)
vi.mock('../../electron/account', () => ({
  isLicenseValid: (...args: any[]) => mockIsLicenseValid(...args),
}))

// Mock capabilities module
const mockGetCapability = vi.fn()
const mockUpdateCapability = vi.fn()
vi.mock('../../electron/capabilities', () => ({
  getCapability: (...args: any[]) => mockGetCapability(...args),
  updateCapability: (...args: any[]) => mockUpdateCapability(...args),
}))

// Mock sites module
const mockGetSite = vi.fn()
const mockGetSession = vi.fn().mockReturnValue(null)
vi.mock('../../electron/sites', () => ({
  getSite: (...args: any[]) => mockGetSite(...args),
  getSession: (...args: any[]) => mockGetSession(...args),
}))

// Mock healer module
const mockHealSelector = vi.fn().mockResolvedValue(null)
vi.mock('../../electron/healer', () => ({
  healSelector: (...args: any[]) => mockHealSelector(...args),
}))

// Mock store module
const mockStoreGet = vi.fn().mockReturnValue('')
vi.mock('../../electron/store', () => ({
  store: {
    get: (...args: any[]) => mockStoreGet(...args),
    set: vi.fn(),
    store: {},
  },
}))

// Import AFTER mocks are set up
import { setupExecutor } from '../../electron/executor'

function createMockMainWindow() {
  return {
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    },
    on: vi.fn(),
    once: vi.fn(),
  } as any
}

describe('electron/executor', () => {
  let mainWindow: ReturnType<typeof createMockMainWindow>

  beforeEach(() => {
    clearRegisteredHandlers()
    vi.clearAllMocks()
    mainWindow = createMockMainWindow()
    mockIsLicenseValid.mockReturnValue(true)
    mockStoreGet.mockReturnValue('')
    mockGetHealedLocators.mockReturnValue([])
    mockExecute.mockResolvedValue({
      success: true,
      data: { title: 'Test' },
      error: undefined,
      durationMs: 500,
      log: ['step 1'],
    } as ExecutionResult)
    setupExecutor(mainWindow)
  })

  function getHandler() {
    return getRegisteredHandler('executor:test')!
  }

  // ── License check ───────────────────────────────────────────────────

  describe('license check', () => {
    it('returns license error when license is invalid', async () => {
      mockIsLicenseValid.mockReturnValue(false)

      const result = await getHandler()({}, 'cap-1', {}, {})

      expect(result.success).toBe(false)
      expect(result.errorType).toBe('license')
      expect(result.error).toContain('free trial')
      expect(result.durationMs).toBe(0)
      expect(result.log).toContain('License check failed')
    })

    it('proceeds when license is valid', async () => {
      mockIsLicenseValid.mockReturnValue(true)
      mockGetCapability.mockReturnValue(null)

      const result = await getHandler()({}, 'cap-1', {}, {})

      // Should get past license check and hit "capability not found"
      expect(result.error).toBe('Capability not found')
    })
  })

  // ── Capability not found ──────────────────────────────────────────────

  describe('capability not found', () => {
    it('returns error when capability does not exist', async () => {
      mockGetCapability.mockReturnValue(undefined)

      const result = await getHandler()({}, 'nonexistent', {}, {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('Capability not found')
      expect(result.data).toEqual({})
    })
  })

  // ── Site not found ────────────────────────────────────────────────────

  describe('site not found', () => {
    it('returns error when site profile does not exist', async () => {
      const cap = buildCapability({ id: 'cap-1', siteProfileId: 'site-missing' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(undefined)

      const result = await getHandler()({}, 'cap-1', {}, {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('Site profile not found')
    })
  })

  // ── Successful execution ──────────────────────────────────────────────

  describe('successful execution', () => {
    it('launches engine, runs actions, and returns result', async () => {
      const site = buildSite({ id: 'site-1', url: 'https://example.com', hostname: 'example.com' })
      const cap = buildCapabilityWithActions({
        id: 'cap-1',
        siteProfileId: 'site-1',
        extractionRules: [],
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockGetSession.mockReturnValue(null)

      const result = await getHandler()({}, 'cap-1', {}, {})

      expect(mockLaunch).toHaveBeenCalled()
      expect(mockExecute).toHaveBeenCalled()
      expect(mockClose).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ title: 'Test' })
    })

    it('passes headless option from visible flag', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)

      await getHandler()({}, 'cap-1', {}, { visible: true })

      expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({
        headless: false,
      }))
    })

    it('passes cookies and localStorage from session', async () => {
      const site = buildSiteWithSession({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockGetSession.mockReturnValue({
        cookies: [{ name: 'sid', value: 'abc' }],
        localStorage: { token: 'xyz' },
      })

      await getHandler()({}, 'cap-1', {}, {})

      expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({
        cookies: [{ name: 'sid', value: 'abc' }],
        localStorage: { token: 'xyz' },
      }))
    })

    it('sends executor:status running and completed events', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)

      await getHandler()({}, 'cap-1', {}, {})

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'executor:status',
        expect.objectContaining({ capabilityId: 'cap-1', status: 'running' })
      )
      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'executor:status',
        expect.objectContaining({ capabilityId: 'cap-1', status: 'completed' })
      )
    })

    it('always closes engine even on success', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)

      await getHandler()({}, 'cap-1', {}, {})

      expect(mockClose).toHaveBeenCalled()
    })
  })

  // ── Navigate prepend ──────────────────────────────────────────────────

  describe('navigate prepend', () => {
    it('prepends navigate action when first action is not navigate', async () => {
      const site = buildSite({ id: 'site-1', url: 'https://example.com', hostname: 'example.com' })
      const cap = buildCapability({
        id: 'cap-1',
        siteProfileId: 'site-1',
        actions: [
          buildClickAction() as any,
        ],
        parameters: [{
          name: 'query',
          description: 'Search query',
          actionIndex: 0,
          field: 'value',
          defaultValue: 'test',
          required: true,
        }],
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)

      await getHandler()({}, 'cap-1', {}, {})

      // Check that execute was called with actions starting with navigate
      const callArgs = mockExecute.mock.calls[0]
      const actions = callArgs[0]
      expect(actions[0].type).toBe('navigate')
      expect(actions[0].url).toBe('https://example.com')

      // Check that parameter indices were shifted by 1
      const params = callArgs[1]
      expect(params[0].actionIndex).toBe(1) // was 0, now 1
    })

    it('does not prepend navigate when first action is navigate', async () => {
      const site = buildSite({ id: 'site-1', url: 'https://example.com' })
      const cap = buildCapabilityWithActions({
        id: 'cap-1',
        siteProfileId: 'site-1',
        parameters: [{
          name: 'query',
          description: 'Search query',
          actionIndex: 0,
          field: 'value',
          defaultValue: 'test',
          required: true,
        }],
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)

      await getHandler()({}, 'cap-1', {}, {})

      const callArgs = mockExecute.mock.calls[0]
      const params = callArgs[1]
      // Indices should NOT be shifted
      expect(params[0].actionIndex).toBe(0)
    })

    it('uses site hostname when url is not set', async () => {
      const site = buildSite({ id: 'site-1', url: '', hostname: 'mysite.com' })
      const cap = buildCapability({
        id: 'cap-1',
        siteProfileId: 'site-1',
        actions: [buildClickAction() as any],
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)

      await getHandler()({}, 'cap-1', {}, {})

      const actions = mockExecute.mock.calls[0][0]
      expect(actions[0].type).toBe('navigate')
      expect(actions[0].url).toBe('https://mysite.com')
    })
  })

  // ── Health tracking ───────────────────────────────────────────────────

  describe('health tracking', () => {
    it('sets healthy status on full success', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockExecute.mockResolvedValue({
        success: true,
        data: { title: 'Page' },
        durationMs: 100,
        log: [],
      })

      await getHandler()({}, 'cap-1', {}, {})

      expect(mockUpdateCapability).toHaveBeenCalledWith('cap-1', expect.objectContaining({
        healthStatus: 'healthy',
        consecutiveFailures: 0,
      }))
    })

    it('sets degraded status on partial success (has data but not success)', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({
        id: 'cap-1',
        siteProfileId: 'site-1',
        consecutiveFailures: 0,
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockExecute.mockResolvedValue({
        success: false,
        data: { title: 'Partial Result' },
        error: '1 action(s) failed',
        durationMs: 100,
        log: [],
      })

      await getHandler()({}, 'cap-1', {}, {})

      expect(mockUpdateCapability).toHaveBeenCalledWith('cap-1', expect.objectContaining({
        healthStatus: 'degraded',
      }))
    })

    it('sets degraded for first two consecutive failures with no data', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({
        id: 'cap-1',
        siteProfileId: 'site-1',
        consecutiveFailures: 1,
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockExecute.mockResolvedValue({
        success: false,
        data: {},
        error: 'All actions failed',
        durationMs: 100,
        log: [],
      })

      await getHandler()({}, 'cap-1', {}, {})

      expect(mockUpdateCapability).toHaveBeenCalledWith('cap-1', expect.objectContaining({
        healthStatus: 'degraded',
      }))
    })

    it('sets broken after 3+ consecutive failures with no data', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({
        id: 'cap-1',
        siteProfileId: 'site-1',
        consecutiveFailures: 2,
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      // Need the second getCapability call (for cap2) to return the updated value
      mockGetCapability.mockReturnValue(cap)
      mockExecute.mockResolvedValue({
        success: false,
        data: {},
        error: 'All actions failed',
        durationMs: 100,
        log: [],
      })

      await getHandler()({}, 'cap-1', {}, {})

      expect(mockUpdateCapability).toHaveBeenCalledWith('cap-1', expect.objectContaining({
        healthStatus: 'broken',
        consecutiveFailures: 3,
      }))
    })

    it('sets broken with consecutiveFailures 99 on fatal throw', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockExecute.mockRejectedValue(new Error('Browser crashed'))

      const result = await getHandler()({}, 'cap-1', {}, {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('Browser crashed')
      expect(mockUpdateCapability).toHaveBeenCalledWith('cap-1', expect.objectContaining({
        healthStatus: 'broken',
        consecutiveFailures: 99,
      }))
    })
  })

  // ── Healer wiring ────────────────────────────────────────────────────

  describe('healer wiring', () => {
    it('wires healer when API key is present', async () => {
      mockStoreGet.mockReturnValue('sk-ant-key123')
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)

      await getHandler()({}, 'cap-1', {}, {})

      expect(mockSetHealer).toHaveBeenCalledWith(expect.any(Function))
    })

    it('does not wire healer when API key is absent', async () => {
      mockStoreGet.mockReturnValue('')
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)

      await getHandler()({}, 'cap-1', {}, {})

      expect(mockSetHealer).not.toHaveBeenCalled()
    })
  })

  // ── Healed locator persistence ────────────────────────────────────────

  describe('healed locator persistence', () => {
    it('persists healed locators back to capability', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapability({
        id: 'cap-1',
        siteProfileId: 'site-1',
        actions: [
          { type: 'navigate', url: 'https://example.com', timestamp: 0 },
          { type: 'click', selector: '#old-btn', timestamp: 1, locators: [{ strategy: 'css', value: '#old-btn' }] },
        ] as any[],
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockGetHealedLocators.mockReturnValue([
        { actionIndex: 1, locator: { strategy: 'css', value: '#new-btn' } },
      ])
      mockExecute.mockResolvedValue({
        success: true,
        data: {},
        durationMs: 100,
        log: [],
      })

      await getHandler()({}, 'cap-1', {}, {})

      // Should update the capability with healed locators prepended
      expect(mockUpdateCapability).toHaveBeenCalledWith('cap-1', expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            type: 'click',
            locators: [
              { strategy: 'css', value: '#new-btn' },
              { strategy: 'css', value: '#old-btn' },
            ],
          }),
        ]),
      }))
    })

    it('adds heal log message when locators are persisted', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockGetHealedLocators.mockReturnValue([
        { actionIndex: 0, locator: { strategy: 'css', value: '#healed' } },
      ])
      mockExecute.mockResolvedValue({
        success: true,
        data: {},
        durationMs: 100,
        log: ['step 1'],
      })

      const result = await getHandler()({}, 'cap-1', {}, {})

      expect(result.log).toContainEqual(expect.stringContaining('[heal]'))
    })

    it('does not update capability when no locators were healed', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockGetHealedLocators.mockReturnValue([])
      mockExecute.mockResolvedValue({
        success: true,
        data: {},
        durationMs: 100,
        log: [],
      })

      await getHandler()({}, 'cap-1', {}, {})

      // updateCapability should be called for health tracking but NOT for healed locators
      const calls = mockUpdateCapability.mock.calls
      // Only health update call, no actions update
      const actionsUpdateCalls = calls.filter((c: any) => c[1].actions)
      expect(actionsUpdateCalls).toHaveLength(0)
    })
  })

  // ── Sensitive field redaction ─────────────────────────────────────────

  describe('sensitive field redaction', () => {
    it('redacts sensitive extraction fields from result data', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapability({
        id: 'cap-1',
        siteProfileId: 'site-1',
        actions: [{ type: 'navigate', url: 'https://example.com', timestamp: 0 }] as any[],
        extractionRules: [
          { name: 'ssn', selector: '.ssn', attribute: 'text', multiple: false, sensitive: true },
          { name: 'name', selector: '.name', attribute: 'text', multiple: false, sensitive: false },
        ],
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockExecute.mockResolvedValue({
        success: true,
        data: { ssn: '123-45-6789', name: 'John Doe' },
        durationMs: 100,
        log: [],
      })

      const result = await getHandler()({}, 'cap-1', {}, {})

      expect(result.data.ssn).toBe('[REDACTED]')
      expect(result.data.name).toBe('John Doe')
    })

    it('does not redact when extraction rule is not sensitive', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapability({
        id: 'cap-1',
        siteProfileId: 'site-1',
        actions: [{ type: 'navigate', url: 'https://example.com', timestamp: 0 }] as any[],
        extractionRules: [
          { name: 'title', selector: 'h1', attribute: 'text', multiple: false, sensitive: false },
        ],
      })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockExecute.mockResolvedValue({
        success: true,
        data: { title: 'Hello World' },
        durationMs: 100,
        log: [],
      })

      const result = await getHandler()({}, 'cap-1', {}, {})

      expect(result.data.title).toBe('Hello World')
    })
  })

  // ── Session diagnostic log ────────────────────────────────────────────

  describe('session diagnostic log', () => {
    it('prepends session info to result log', async () => {
      const site = buildSite({ id: 'site-1', hostname: 'example.com', sessionEncrypted: 'enc' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockGetSession.mockReturnValue({
        cookies: [{ name: 'a', value: 'b' }],
        localStorage: { x: 'y' },
      })
      mockExecute.mockResolvedValue({
        success: true,
        data: {},
        durationMs: 100,
        log: ['original log'],
      })

      const result = await getHandler()({}, 'cap-1', {}, {})

      expect(result.log[0]).toContain('[session]')
      expect(result.log[0]).toContain('example.com')
    })
  })

  // ── Fatal error handling ──────────────────────────────────────────────

  describe('fatal error handling', () => {
    it('returns error result on engine throw', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockExecute.mockRejectedValue(new Error('Connection refused'))

      const result = await getHandler()({}, 'cap-1', {}, {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection refused')
      expect(result.log).toContain('Fatal error: Connection refused')
    })

    it('sends failed status event on fatal error', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockExecute.mockRejectedValue(new Error('boom'))

      await getHandler()({}, 'cap-1', {}, {})

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'executor:status',
        expect.objectContaining({ capabilityId: 'cap-1', status: 'failed' })
      )
    })

    it('closes engine in finally block even on error', async () => {
      const site = buildSite({ id: 'site-1' })
      const cap = buildCapabilityWithActions({ id: 'cap-1', siteProfileId: 'site-1' })
      mockGetCapability.mockReturnValue(cap)
      mockGetSite.mockReturnValue(site)
      mockExecute.mockRejectedValue(new Error('oops'))

      await getHandler()({}, 'cap-1', {}, {})

      expect(mockClose).toHaveBeenCalled()
    })
  })
})
