import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isLicenseValid,
  getTrialDaysLeft,
  setupAccount,
} from '../../electron/account'
import { getRegisteredHandler, clearRegisteredHandlers } from '../setup/electron-mocks'
import { shell } from 'electron'

// We need access to the account store. Since electron-store is mocked,
// importing Store from electron-store gives us MockStore. The account module
// creates its own store instance at module scope. We can manipulate account
// state through the IPC handlers (login sets store values, logout clears them).

describe('account', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearRegisteredHandlers()

    // Re-register IPC handlers
    setupAccount()

    // Start with a clean logout state
    const logoutHandler = getRegisteredHandler('account:logout')
    if (logoutHandler) await logoutHandler({})
  })

  function callHandler(channel: string, ...args: any[]) {
    const handler = getRegisteredHandler(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler({}, ...args)
  }

  // Helper: simulate a successful login that sets store values
  async function simulateLogin(overrides: {
    plan?: string
    status?: string
    trialEndsAt?: string | null
    emailVerified?: boolean
  } = {}) {
    const plan = overrides.plan ?? 'monthly'
    const status = overrides.status ?? 'active'

    // Mock fetch for login
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: 'test-token',
          user: { id: 'user-1', email: 'test@example.com', emailVerified: overrides.emailVerified ?? true },
          subscription: {
            plan,
            status,
            trial_ends_at: overrides.trialEndsAt ?? null,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await callHandler('account:login', 'test@example.com', 'password')
  }

  // ── isLicenseValid ─────────────────────────────────────────────────────

  describe('isLicenseValid', () => {
    it('returns true when plan and status are both null (no account)', () => {
      // After logout, plan and status are null
      expect(isLicenseValid()).toBe(true)
    })

    it('returns true for an active trial', async () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: future })
      expect(isLicenseValid()).toBe(true)
    })

    // During alpha, all license checks return true regardless of plan state
    it('returns true for an expired trial (alpha bypass)', async () => {
      const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: past })
      expect(isLicenseValid()).toBe(true)
    })

    it('returns true for an active monthly subscription', async () => {
      await simulateLogin({ plan: 'monthly', status: 'active' })
      expect(isLicenseValid()).toBe(true)
    })

    it('returns true for a canceled monthly subscription (alpha bypass)', async () => {
      await simulateLogin({ plan: 'monthly', status: 'canceled' })
      expect(isLicenseValid()).toBe(true)
    })

    it('returns true for a contributor plan', async () => {
      await simulateLogin({ plan: 'contributor', status: 'contributor' })
      expect(isLicenseValid()).toBe(true)
    })

    it('returns true for an unknown plan (alpha bypass)', async () => {
      await simulateLogin({ plan: 'unknown', status: 'unknown' })
      expect(isLicenseValid()).toBe(true)
    })

    it('returns true for a trial with no trialEndsAt (alpha bypass)', async () => {
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: null })
      expect(isLicenseValid()).toBe(true)
    })
  })

  // ── getTrialDaysLeft ───────────────────────────────────────────────────

  describe('getTrialDaysLeft', () => {
    it('returns null when plan is not trial', async () => {
      await simulateLogin({ plan: 'monthly', status: 'active' })
      expect(getTrialDaysLeft()).toBeNull()
    })

    it('returns null when not logged in (plan is null)', () => {
      expect(getTrialDaysLeft()).toBeNull()
    })

    it('returns the correct number of days for a future trial end', async () => {
      const daysFromNow = 5
      const future = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString()
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: future })
      expect(getTrialDaysLeft()).toBe(daysFromNow)
    })

    it('returns 0 for a past trial end', async () => {
      const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: past })
      expect(getTrialDaysLeft()).toBe(0)
    })

    it('returns 0 when trialEndsAt is null and plan is trial', async () => {
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: null })
      expect(getTrialDaysLeft()).toBe(0)
    })
  })

  // ── getAccountType (via getStatus IPC) ─────────────────────────────────

  describe('getAccountType (via account:getStatus)', () => {
    it('returns "none" when not logged in', async () => {
      const status = await callHandler('account:getStatus')
      expect(status.accountType).toBe('none')
    })

    it('returns "subscribed" for active monthly', async () => {
      await simulateLogin({ plan: 'monthly', status: 'active' })
      const status = await callHandler('account:getStatus')
      expect(status.accountType).toBe('subscribed')
    })

    it('returns "cancelled" for canceled monthly', async () => {
      await simulateLogin({ plan: 'monthly', status: 'canceled' })
      const status = await callHandler('account:getStatus')
      expect(status.accountType).toBe('cancelled')
    })

    it('returns "trial" for active trial', async () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: future })
      const status = await callHandler('account:getStatus')
      expect(status.accountType).toBe('trial')
    })

    it('returns "expired" for expired trial', async () => {
      const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: past })
      const status = await callHandler('account:getStatus')
      expect(status.accountType).toBe('expired')
    })

    it('returns "contributor" for contributor plan', async () => {
      await simulateLogin({ plan: 'contributor', status: 'contributor' })
      const status = await callHandler('account:getStatus')
      expect(status.accountType).toBe('contributor')
    })

    it('returns "expired" for unknown plan types', async () => {
      await simulateLogin({ plan: 'unknown', status: 'unknown' })
      const status = await callHandler('account:getStatus')
      expect(status.accountType).toBe('expired')
    })
  })

  // ── IPC: account:getStatus ─────────────────────────────────────────────

  describe('account:getStatus', () => {
    it('returns full status shape when not logged in', async () => {
      const status = await callHandler('account:getStatus')
      expect(status).toEqual(
        expect.objectContaining({
          loggedIn: false,
          email: null,
          plan: null,
          status: null,
          trialEndsAt: null,
          trialDaysLeft: null,
          accountType: 'none',
          emailVerified: false,
        })
      )
      expect(status.apiUrl).toBeTruthy()
    })

    it('returns correct status when logged in', async () => {
      await simulateLogin({ plan: 'monthly', status: 'active' })
      const status = await callHandler('account:getStatus')
      expect(status.loggedIn).toBe(true)
      expect(status.email).toBe('test@example.com')
      expect(status.plan).toBe('monthly')
      expect(status.status).toBe('active')
    })
  })

  // ── IPC: account:signup ────────────────────────────────────────────────

  describe('account:signup', () => {
    it('returns success on successful signup', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: 'new-token',
            user: { id: 'user-1', email: 'new@example.com' },
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            needsVerification: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:signup', 'new@example.com', 'pass123')
      expect(result.success).toBe(true)
      expect(result.needsVerification).toBe(true)

      // Verify store was updated
      const status = await callHandler('account:getStatus')
      expect(status.loggedIn).toBe(true)
      expect(status.email).toBe('new@example.com')
      expect(status.plan).toBe('trial')
    })

    it('returns error from server', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Email already in use' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:signup', 'existing@example.com', 'pass')
      expect(result.error).toBe('Email already in use')
    })

    it('returns connection error on fetch failure', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'))

      const result = await callHandler('account:signup', 'test@example.com', 'pass')
      expect(result.error).toContain('Connection failed')
      expect(result.error).toContain('Network error')
    })
  })

  // ── IPC: account:login ─────────────────────────────────────────────────

  describe('account:login', () => {
    it('returns success and updates store on successful login', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: 'login-token',
            user: { id: 'user-1', email: 'login@example.com', emailVerified: true },
            subscription: { plan: 'monthly', status: 'active', trial_ends_at: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:login', 'login@example.com', 'pass')
      expect(result.success).toBe(true)

      const status = await callHandler('account:getStatus')
      expect(status.loggedIn).toBe(true)
      expect(status.email).toBe('login@example.com')
      expect(status.plan).toBe('monthly')
    })

    it('returns error from server', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Invalid credentials' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:login', 'test@example.com', 'wrong')
      expect(result.error).toBe('Invalid credentials')
    })

    it('returns connection error on fetch failure', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Timeout'))

      const result = await callHandler('account:login', 'test@example.com', 'pass')
      expect(result.error).toContain('Connection failed')
    })
  })

  // ── IPC: account:logout ────────────────────────────────────────────────

  describe('account:logout', () => {
    it('clears all account data', async () => {
      await simulateLogin()
      const beforeLogout = await callHandler('account:getStatus')
      expect(beforeLogout.loggedIn).toBe(true)

      const result = await callHandler('account:logout')
      expect(result).toBe(true)

      const afterLogout = await callHandler('account:getStatus')
      expect(afterLogout.loggedIn).toBe(false)
      expect(afterLogout.email).toBeNull()
      expect(afterLogout.plan).toBeNull()
      expect(afterLogout.status).toBeNull()
    })
  })

  // ── IPC: account:validate ──────────────────────────────────────────────

  describe('account:validate', () => {
    it('returns { valid: false } when not logged in', async () => {
      const result = await callHandler('account:validate')
      expect(result).toEqual({ valid: false })
    })

    it('returns server response and updates store on success', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            valid: true,
            subscription: { plan: 'monthly', status: 'active', trialEndsAt: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:validate')
      expect(result.valid).toBe(true)
    })

    it('returns offline: true with cached validity on network failure', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Offline'))

      const result = await callHandler('account:validate')
      expect(result.offline).toBe(true)
      expect(result.valid).toBe(true) // active monthly is valid
    })

    it('returns offline: true with valid: false when cached license is invalid', async () => {
      const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: past })

      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Offline'))

      const result = await callHandler('account:validate')
      expect(result.offline).toBe(true)
      expect(result.valid).toBe(true) // alpha: always valid
    })
  })

  // ── IPC: account:subscribe ─────────────────────────────────────────────

  describe('account:subscribe', () => {
    it('returns error when not logged in', async () => {
      const result = await callHandler('account:subscribe')
      expect(result.error).toBe('Not logged in')
    })

    it('opens external URL and returns success', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ url: 'https://checkout.stripe.com/session123' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:subscribe')
      expect(result.success).toBe(true)
      expect(vi.mocked(shell.openExternal)).toHaveBeenCalledWith(
        'https://checkout.stripe.com/session123'
      )
    })

    it('returns error from server', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Payment setup failed' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:subscribe')
      expect(result.error).toBe('Payment setup failed')
    })

    it('returns error when no checkout URL is returned', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({}),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:subscribe')
      expect(result.error).toBe('No checkout URL returned')
    })

    it('returns connection error on fetch failure', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Timeout'))

      const result = await callHandler('account:subscribe')
      expect(result.error).toContain('Connection failed')
    })
  })

  // ── IPC: account:manageSubscription ────────────────────────────────────

  describe('account:manageSubscription', () => {
    it('returns error when not logged in', async () => {
      const result = await callHandler('account:manageSubscription')
      expect(result.error).toBe('Not logged in')
    })

    it('opens portal URL and returns success', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ url: 'https://billing.stripe.com/portal123' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:manageSubscription')
      expect(result.success).toBe(true)
      expect(vi.mocked(shell.openExternal)).toHaveBeenCalledWith(
        'https://billing.stripe.com/portal123'
      )
    })

    it('returns error when no portal URL returned', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({}),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:manageSubscription')
      expect(result.error).toBe('No portal URL returned')
    })

    it('returns error from server', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'No customer found' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:manageSubscription')
      expect(result.error).toBe('No customer found')
    })

    it('returns connection error on fetch failure', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('DNS failure'))

      const result = await callHandler('account:manageSubscription')
      expect(result.error).toContain('Connection failed')
    })
  })

  // ── IPC: account:canUse ────────────────────────────────────────────────

  describe('account:canUse', () => {
    it('allows usage when not logged in (dev bypass)', async () => {
      const result = await callHandler('account:canUse')
      expect(result.allowed).toBe(true)
    })

    it('allows usage for valid active subscription', async () => {
      await simulateLogin({ plan: 'monthly', status: 'active' })
      const result = await callHandler('account:canUse')
      expect(result.allowed).toBe(true)
    })

    it('allows usage for active trial', async () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: future })
      const result = await callHandler('account:canUse')
      expect(result.allowed).toBe(true)
    })

    it('allows usage for contributor', async () => {
      await simulateLogin({ plan: 'contributor', status: 'contributor' })
      const result = await callHandler('account:canUse')
      expect(result.allowed).toBe(true)
    })

    // During alpha, canUse always allows regardless of plan state
    it('allows usage for expired trial (alpha bypass)', async () => {
      const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      await simulateLogin({ plan: 'trial', status: 'trial', trialEndsAt: past })
      const result = await callHandler('account:canUse')
      expect(result.allowed).toBe(true)
    })

    it('allows usage for cancelled subscription (alpha bypass)', async () => {
      await simulateLogin({ plan: 'monthly', status: 'canceled' })
      const result = await callHandler('account:canUse')
      expect(result.allowed).toBe(true)
    })

    it('allows usage for unknown plan (alpha bypass)', async () => {
      await simulateLogin({ plan: 'unknown', status: 'unknown' })
      const result = await callHandler('account:canUse')
      expect(result.allowed).toBe(true)
    })
  })

  // ── IPC: account:refresh ───────────────────────────────────────────────

  describe('account:refresh', () => {
    it('returns success and updated data on successful refresh', async () => {
      await simulateLogin({ plan: 'trial', status: 'trial' })

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subscription: { plan: 'monthly', status: 'active', trialEndsAt: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('account:refresh')
      expect(result.success).toBe(true)
      expect(result.plan).toBe('monthly')
      expect(result.status).toBe('active')
      expect(result.accountType).toBe('subscribed')
    })

    it('returns error when not logged in (no token)', async () => {
      const result = await callHandler('account:refresh')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Could not reach server')
    })

    it('returns error on network failure', async () => {
      await simulateLogin()

      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Offline'))

      const result = await callHandler('account:refresh')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Could not reach server')
    })
  })
})
