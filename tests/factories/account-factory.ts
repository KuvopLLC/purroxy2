/**
 * Factory for building account status test objects.
 *
 * Matches the shape returned by account:getStatus IPC handler
 * and consumed by the PurroxyAPI.account.getStatus() preload bridge.
 */

export interface AccountStatus {
  loggedIn: boolean
  email: string | null
  plan: string | null
  status: string | null
  trialEndsAt: string | null
  trialDaysLeft: number | null
  accountType: string
  emailVerified: boolean
  apiUrl: string
}

export function buildAccountStatus(overrides: Partial<AccountStatus> = {}): AccountStatus {
  return {
    loggedIn: false,
    email: null,
    plan: null,
    status: null,
    trialEndsAt: null,
    trialDaysLeft: null,
    accountType: 'none',
    emailVerified: false,
    apiUrl: 'http://localhost',
    ...overrides,
  }
}

// ── Preset helpers ─────────────────────────────────────────────────────────

/**
 * Account on an active free trial with 10 days remaining.
 */
export function trialStatus(overrides: Partial<AccountStatus> = {}): AccountStatus {
  const trialEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
  return buildAccountStatus({
    loggedIn: true,
    email: 'trial@example.com',
    plan: 'trial',
    status: 'trial',
    trialEndsAt,
    trialDaysLeft: 10,
    accountType: 'trial',
    emailVerified: true,
    ...overrides,
  })
}

/**
 * Account with an active paid monthly subscription.
 */
export function subscribedStatus(overrides: Partial<AccountStatus> = {}): AccountStatus {
  return buildAccountStatus({
    loggedIn: true,
    email: 'subscriber@example.com',
    plan: 'monthly',
    status: 'active',
    trialEndsAt: null,
    trialDaysLeft: null,
    accountType: 'subscribed',
    emailVerified: true,
    ...overrides,
  })
}

/**
 * Account with permanent contributor access (shared a capability).
 */
export function contributorStatus(overrides: Partial<AccountStatus> = {}): AccountStatus {
  return buildAccountStatus({
    loggedIn: true,
    email: 'contributor@example.com',
    plan: 'contributor',
    status: 'contributor',
    trialEndsAt: null,
    trialDaysLeft: null,
    accountType: 'contributor',
    emailVerified: true,
    ...overrides,
  })
}

/**
 * Account whose trial has expired.
 */
export function expiredStatus(overrides: Partial<AccountStatus> = {}): AccountStatus {
  const trialEndsAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  return buildAccountStatus({
    loggedIn: true,
    email: 'expired@example.com',
    plan: 'trial',
    status: 'trial',
    trialEndsAt,
    trialDaysLeft: 0,
    accountType: 'expired',
    emailVerified: true,
    ...overrides,
  })
}

/**
 * Account whose paid subscription was cancelled.
 */
export function cancelledStatus(overrides: Partial<AccountStatus> = {}): AccountStatus {
  return buildAccountStatus({
    loggedIn: true,
    email: 'cancelled@example.com',
    plan: 'monthly',
    status: 'canceled',
    trialEndsAt: null,
    trialDaysLeft: null,
    accountType: 'cancelled',
    emailVerified: true,
    ...overrides,
  })
}
