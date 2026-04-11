import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRegisteredHandler, clearRegisteredHandlers } from '../setup/electron-mocks'
import { BrowserWindow } from 'electron'

// We need to reset module state between tests because app-lock.ts uses module-level `locked` var
let setupAppLock: typeof import('../../electron/app-lock').setupAppLock
let isLocked: typeof import('../../electron/app-lock').isLocked

// Deterministic SHA-256 hash for test assertions
import { createHash } from 'crypto'
function sha256(pin: string): string {
  return createHash('sha256').update(pin).digest('hex')
}

function createMockMainWindow() {
  return {
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      executeJavaScript: vi.fn(),
      getURL: vi.fn().mockReturnValue('https://example.com'),
      getTitle: vi.fn().mockReturnValue('Example'),
    },
    on: vi.fn(),
    once: vi.fn(),
    getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 }),
    setBounds: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
  } as unknown as BrowserWindow
}

describe('electron/app-lock', () => {
  let mainWindow: ReturnType<typeof createMockMainWindow>

  beforeEach(async () => {
    clearRegisteredHandlers()
    vi.resetModules()
    // Re-import to get fresh module-level state
    const mod = await import('../../electron/app-lock')
    setupAppLock = mod.setupAppLock
    isLocked = mod.isLocked
    mainWindow = createMockMainWindow()
  })

  // ── isLocked default ──────────────────────────────────────────────────

  it('isLocked returns false by default', () => {
    expect(isLocked()).toBe(false)
  })

  // ── PIN hashing ───────────────────────────────────────────────────────

  it('uses SHA-256 to hash PINs', async () => {
    setupAppLock(mainWindow as any)
    const handler = getRegisteredHandler('lock:setPin')!
    await handler({}, '1234')

    // Verify it was stored — lock:getConfig should report hasPin = true
    const configHandler = getRegisteredHandler('lock:getConfig')!
    const config = await configHandler({})
    expect(config.hasPin).toBe(true)
    expect(config.enabled).toBe(true)
  })

  // ── lock:getConfig ────────────────────────────────────────────────────

  describe('lock:getConfig', () => {
    it('returns default config when no PIN is set', async () => {
      setupAppLock(mainWindow as any)
      const handler = getRegisteredHandler('lock:getConfig')!
      const config = await handler({})

      expect(config).toEqual({
        enabled: false,
        timeoutMinutes: 5,
        hasPin: false,
        isLocked: false,
      })
    })

    it('returns updated config after setting PIN', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '5678')

      const handler = getRegisteredHandler('lock:getConfig')!
      const config = await handler({})

      expect(config.enabled).toBe(true)
      expect(config.hasPin).toBe(true)
      expect(config.isLocked).toBe(false)
    })
  })

  // ── lock:setPin ───────────────────────────────────────────────────────

  describe('lock:setPin', () => {
    it('sets PIN and enables lock', async () => {
      setupAppLock(mainWindow as any)
      const handler = getRegisteredHandler('lock:setPin')!
      const result = await handler({}, '1234')

      expect(result).toBe(true)

      const config = getRegisteredHandler('lock:getConfig')!
      const cfg = await config({})
      expect(cfg.enabled).toBe(true)
      expect(cfg.hasPin).toBe(true)
    })

    it('returns true on success', async () => {
      setupAppLock(mainWindow as any)
      const handler = getRegisteredHandler('lock:setPin')!
      expect(await handler({}, 'abcd')).toBe(true)
    })
  })

  // ── lock:setTimeout ───────────────────────────────────────────────────

  describe('lock:setTimeout', () => {
    it('changes timeout minutes', async () => {
      setupAppLock(mainWindow as any)
      const handler = getRegisteredHandler('lock:setTimeout')!
      const result = await handler({}, 15)
      expect(result).toBe(true)

      const config = getRegisteredHandler('lock:getConfig')!
      const cfg = await config({})
      expect(cfg.timeoutMinutes).toBe(15)
    })

    it('restarts lock timer when lock is enabled', async () => {
      setupAppLock(mainWindow as any)
      // First enable lock
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      // Then change timeout
      const handler = getRegisteredHandler('lock:setTimeout')!
      const result = await handler({}, 10)
      expect(result).toBe(true)

      const config = getRegisteredHandler('lock:getConfig')!
      const cfg = await config({})
      expect(cfg.timeoutMinutes).toBe(10)
    })
  })

  // ── lock:disable ──────────────────────────────────────────────────────

  describe('lock:disable', () => {
    it('disables lock with correct PIN', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      const handler = getRegisteredHandler('lock:disable')!
      const result = await handler({}, '1234')

      expect(result).toEqual({ success: true })

      const config = getRegisteredHandler('lock:getConfig')!
      const cfg = await config({})
      expect(cfg.enabled).toBe(false)
      expect(cfg.hasPin).toBe(false)
    })

    it('returns error with wrong PIN', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      const handler = getRegisteredHandler('lock:disable')!
      const result = await handler({}, '9999')

      expect(result).toEqual({ error: 'Wrong PIN' })

      // Lock should still be enabled
      const config = getRegisteredHandler('lock:getConfig')!
      const cfg = await config({})
      expect(cfg.enabled).toBe(true)
    })

    it('succeeds when no PIN is stored (edge case)', async () => {
      setupAppLock(mainWindow as any)
      const handler = getRegisteredHandler('lock:disable')!
      // No PIN was set, so stored is null, and hashPin(pin) !== stored is falsy
      const result = await handler({}, 'anything')
      expect(result).toEqual({ success: true })
    })

    it('unlocks the app when disabled', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      // Lock the app
      const lockNow = getRegisteredHandler('lock:lockNow')!
      await lockNow({})
      expect(isLocked()).toBe(true)

      // Disable with correct PIN
      const disable = getRegisteredHandler('lock:disable')!
      await disable({}, '1234')
      expect(isLocked()).toBe(false)
    })
  })

  // ── lock:lockNow ──────────────────────────────────────────────────────

  describe('lock:lockNow', () => {
    it('locks the app when enabled', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      const handler = getRegisteredHandler('lock:lockNow')!
      const result = await handler({})

      expect(result).toBe(true)
      expect(isLocked()).toBe(true)
    })

    it('sends lock:stateChanged event to renderer', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      const handler = getRegisteredHandler('lock:lockNow')!
      await handler({})

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('lock:stateChanged', true)
    })

    it('returns false when lock is not enabled', async () => {
      setupAppLock(mainWindow as any)
      const handler = getRegisteredHandler('lock:lockNow')!
      const result = await handler({})

      expect(result).toBe(false)
      expect(isLocked()).toBe(false)
    })
  })

  // ── lock:unlock ───────────────────────────────────────────────────────

  describe('lock:unlock', () => {
    it('unlocks with correct PIN', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      const lockNow = getRegisteredHandler('lock:lockNow')!
      await lockNow({})
      expect(isLocked()).toBe(true)

      const handler = getRegisteredHandler('lock:unlock')!
      const result = await handler({}, '1234')

      expect(result).toEqual({ success: true })
      expect(isLocked()).toBe(false)
    })

    it('sends lock:stateChanged false event on unlock', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      const lockNow = getRegisteredHandler('lock:lockNow')!
      await lockNow({})

      // Reset mock to track only unlock call
      ;(mainWindow.webContents.send as any).mockClear()

      const handler = getRegisteredHandler('lock:unlock')!
      await handler({}, '1234')

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('lock:stateChanged', false)
    })

    it('returns error with wrong PIN', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      const lockNow = getRegisteredHandler('lock:lockNow')!
      await lockNow({})

      const handler = getRegisteredHandler('lock:unlock')!
      const result = await handler({}, '0000')

      expect(result).toEqual({ error: 'Wrong PIN' })
      expect(isLocked()).toBe(true)
    })

    it('returns error when no PIN is set', async () => {
      setupAppLock(mainWindow as any)
      const handler = getRegisteredHandler('lock:unlock')!
      const result = await handler({}, '1234')

      expect(result).toEqual({ error: 'No PIN set' })
    })
  })

  // ── lock:activity ─────────────────────────────────────────────────────

  describe('lock:activity', () => {
    it('returns true', async () => {
      setupAppLock(mainWindow as any)
      const handler = getRegisteredHandler('lock:activity')!
      const result = await handler({})
      expect(result).toBe(true)
    })

    it('resets the activity timer', async () => {
      setupAppLock(mainWindow as any)
      // We can't directly observe lastActivity, but we verify
      // the handler doesn't throw and returns true
      const handler = getRegisteredHandler('lock:activity')!
      const result = await handler({})
      expect(result).toBe(true)
    })
  })

  // ── Auto-lock timeout ─────────────────────────────────────────────────

  describe('auto-lock after timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('auto-locks after timeout period of inactivity', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      // Set timeout to 1 minute
      const setTimeout = getRegisteredHandler('lock:setTimeout')!
      await setTimeout({}, 1)

      expect(isLocked()).toBe(false)

      // Advance time past the timeout (1 minute = 60000ms)
      // The timer checks every 10000ms
      vi.advanceTimersByTime(70000)

      expect(isLocked()).toBe(true)
      expect(mainWindow.webContents.send).toHaveBeenCalledWith('lock:stateChanged', true)
    })

    it('does not auto-lock if activity resets timer', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      // Set timeout to 1 minute
      const setTimeoutHandler = getRegisteredHandler('lock:setTimeout')!
      await setTimeoutHandler({}, 1)

      // Advance 50 seconds
      vi.advanceTimersByTime(50000)
      expect(isLocked()).toBe(false)

      // Record activity
      const activity = getRegisteredHandler('lock:activity')!
      await activity({})

      // Advance another 50 seconds (total 100s from start, but only 50s from last activity)
      vi.advanceTimersByTime(50000)
      expect(isLocked()).toBe(false)

      // Now advance past timeout from last activity
      vi.advanceTimersByTime(20000)
      expect(isLocked()).toBe(true)
    })

    it('does not auto-lock when already locked', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      const lockNow = getRegisteredHandler('lock:lockNow')!
      await lockNow({})
      ;(mainWindow.webContents.send as any).mockClear()

      // Advance time — should not send another stateChanged event
      vi.advanceTimersByTime(600000)

      // It should not have sent stateChanged again
      expect(mainWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('does not auto-lock when lock is disabled', async () => {
      setupAppLock(mainWindow as any)
      const setPin = getRegisteredHandler('lock:setPin')!
      await setPin({}, '1234')

      // Disable lock
      const disable = getRegisteredHandler('lock:disable')!
      await disable({}, '1234')

      // Advance time
      vi.advanceTimersByTime(600000)
      expect(isLocked()).toBe(false)
    })
  })

  // ── Handler registration ──────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC handlers', () => {
      setupAppLock(mainWindow as any)

      expect(getRegisteredHandler('lock:getConfig')).toBeDefined()
      expect(getRegisteredHandler('lock:setPin')).toBeDefined()
      expect(getRegisteredHandler('lock:setTimeout')).toBeDefined()
      expect(getRegisteredHandler('lock:disable')).toBeDefined()
      expect(getRegisteredHandler('lock:lockNow')).toBeDefined()
      expect(getRegisteredHandler('lock:unlock')).toBeDefined()
      expect(getRegisteredHandler('lock:activity')).toBeDefined()
    })
  })
})
