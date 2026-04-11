import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import worker from '../src/index'
import type { Env } from '../src/index'
import { createMockD1 } from './mocks/d1-mock'
import { createMockKV } from './mocks/kv-mock'
import { createToken } from '../src/lib/auth'

// ─── Shared mock setup ────────────────────────────────────────────────────────

let db: ReturnType<typeof createMockD1>
let kv: ReturnType<typeof createMockKV>
let env: Env

// Mock fetch globally (for email, GitHub calls from within the worker)
const originalFetch = globalThis.fetch
const mockFetch = vi.fn()

// Mock the stripe module
vi.mock('../src/lib/stripe', () => ({
  getStripe: vi.fn(() => ({
    webhooks: {
      constructEventAsync: vi.fn(),
    },
  })),
  createCheckoutSession: vi.fn(),
  createBillingPortalSession: vi.fn(),
  handleSubscriptionEvent: vi.fn(),
  grantContributorAccess: vi.fn(),
}))

// Mock the github module
vi.mock('../src/lib/github', () => ({
  createSubmissionPR: vi.fn(),
  verifyGitHubWebhook: vi.fn(),
  deleteBranch: vi.fn(),
}))

// Mock the email module
vi.mock('../src/lib/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendSubmissionApprovedEmail: vi.fn().mockResolvedValue(true),
  sendSubmissionRejectedEmail: vi.fn().mockResolvedValue(true),
}))

// Import mocked modules for assertion access
import {
  getStripe,
  createCheckoutSession,
  createBillingPortalSession,
  handleSubscriptionEvent,
  grantContributorAccess,
} from '../src/lib/stripe'
import {
  createSubmissionPR,
  verifyGitHubWebhook,
  deleteBranch,
} from '../src/lib/github'
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSubmissionApprovedEmail,
  sendSubmissionRejectedEmail,
} from '../src/lib/email'

const BASE_URL = 'http://localhost'

beforeEach(() => {
  db = createMockD1()
  kv = createMockKV()
  env = {
    DB: db as any,
    KV: kv as any,
    TRIAL_DAYS: '14',
    APP_URL: 'https://app.purroxy.com',
    JWT_SECRET: 'test-secret',
    RESEND_API_KEY: 'test-resend-key',
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_ID: 'price_test',
    GITHUB_TOKEN: 'ghp_test',
    GITHUB_REPO: 'owner/repo',
    GITHUB_WEBHOOK_SECRET: 'gh_webhook_secret',
  }

  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Helper to make authenticated requests
async function authHeader(userId = 'user-123'): Promise<Record<string, string>> {
  const token = await createToken(userId, 'test-secret')
  return { Authorization: `Bearer ${token}` }
}

function jsonRequest(path: string, body: any, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function parseJson(response: Response): Promise<any> {
  return response.json()
}

// ─── OPTIONS / CORS ───────────────────────────────────────────────────────────

describe('OPTIONS / CORS', () => {
  it('returns CORS headers for OPTIONS request', async () => {
    const req = new Request(`${BASE_URL}/api/anything`, { method: 'OPTIONS' })
    const res = await worker.fetch(req, env)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })
})

// ─── Unknown route ────────────────────────────────────────────────────────────

describe('Unknown route', () => {
  it('returns 404 for unknown route', async () => {
    const req = new Request(`${BASE_URL}/api/nonexistent`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(404)
    const data = await parseJson(res)
    expect(data.error).toBe('Not found')
  })
})

// ─── GET /api/status ──────────────────────────────────────────────────────────

describe('GET /api/status', () => {
  it('returns ok', async () => {
    const req = new Request(`${BASE_URL}/api/status`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.status).toBe('ok')
    expect(data.version).toBeDefined()
  })
})

// ─── POST /api/signup ─────────────────────────────────────────────────────────

describe('POST /api/signup', () => {
  it('returns 400 for missing fields', async () => {
    const req = jsonRequest('/api/signup', { email: '' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('required')
  })

  it('returns 400 for short password', async () => {
    const req = jsonRequest('/api/signup', { email: 'a@b.com', password: 'short' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('8 characters')
  })

  it('returns 409 for duplicate email', async () => {
    db.setResult(
      'SELECT id FROM users WHERE email = ?',
      { id: 'existing-user' }
    )

    const req = jsonRequest('/api/signup', { email: 'taken@test.com', password: 'longpassword' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(409)
    const data = await parseJson(res)
    expect(data.error).toContain('already registered')
  })

  it('returns 201 with token and trial on success', async () => {
    // No existing user
    db.setResult('SELECT id FROM users WHERE email = ?', null)

    const req = jsonRequest('/api/signup', { email: 'new@test.com', password: 'longpassword' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(201)
    const data = await parseJson(res)
    expect(data.token).toBeDefined()
    expect(data.user.email).toBe('new@test.com')
    expect(data.trialEndsAt).toBeDefined()
    expect(data.needsVerification).toBe(true)
  })

  it('sends verification email on success', async () => {
    db.setResult('SELECT id FROM users WHERE email = ?', null)

    const req = jsonRequest('/api/signup', { email: 'new@test.com', password: 'longpassword' })
    await worker.fetch(req, env)

    expect(sendVerificationEmail).toHaveBeenCalledWith(
      'test-resend-key',
      'new@test.com',
      expect.any(String),
      'https://app.purroxy.com'
    )
  })
})

// ─── POST /api/login ──────────────────────────────────────────────────────────

describe('POST /api/login', () => {
  it('returns 400 for missing fields', async () => {
    const req = jsonRequest('/api/login', { email: '' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
  })

  it('returns 401 for wrong email', async () => {
    db.setResult(
      'SELECT id, email, password_hash, email_verified FROM users WHERE email = ?',
      null
    )

    const req = jsonRequest('/api/login', { email: 'no@test.com', password: 'password123' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
    const data = await parseJson(res)
    expect(data.error).toContain('Invalid email or password')
  })

  it('returns 401 for wrong password', async () => {
    // Use bcrypt to create a valid hash for a different password
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash('correctpassword', 10)

    db.setResult(
      'SELECT id, email, password_hash, email_verified FROM users WHERE email = ?',
      { id: 'user-1', email: 'user@test.com', password_hash: hash, email_verified: 0 }
    )

    const req = jsonRequest('/api/login', { email: 'user@test.com', password: 'wrongpassword' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it('returns 200 with token and subscription on success', async () => {
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash('correctpassword', 10)

    db.setResult(
      'SELECT id, email, password_hash, email_verified FROM users WHERE email = ?',
      { id: 'user-1', email: 'user@test.com', password_hash: hash, email_verified: 1 }
    )

    db.setResult(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { id: 'sub-1', user_id: 'user-1', status: 'active', plan: 'monthly' }
    )

    const req = jsonRequest('/api/login', { email: 'user@test.com', password: 'correctpassword' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.token).toBeDefined()
    expect(data.user.id).toBe('user-1')
    expect(data.user.emailVerified).toBe(true)
    expect(data.subscription).toBeDefined()
  })
})

// ─── GET /api/validate ────────────────────────────────────────────────────────

describe('GET /api/validate', () => {
  it('returns 401 when no token provided', async () => {
    const req = new Request(`${BASE_URL}/api/validate`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
    const data = await parseJson(res)
    expect(data.valid).toBe(false)
  })

  it('returns 401 for invalid token', async () => {
    const req = new Request(`${BASE_URL}/api/validate`, {
      headers: { Authorization: 'Bearer garbage' },
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it('returns cached result from KV when available', async () => {
    const headers = await authHeader('user-cached')
    const cachedData = { valid: true, subscription: { status: 'active', plan: 'monthly', trialEndsAt: null } }
    await kv.put(`license:user-cached`, JSON.stringify(cachedData))

    const req = new Request(`${BASE_URL}/api/validate`, { headers })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.valid).toBe(true)
    expect(data.subscription.status).toBe('active')
  })

  it('queries DB when no KV cache', async () => {
    const headers = await authHeader('user-nocache')

    db.setResult(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { user_id: 'user-nocache', status: 'active', plan: 'monthly', trial_ends_at: null }
    )

    const req = new Request(`${BASE_URL}/api/validate`, { headers })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.valid).toBe(true)
  })

  it('returns valid=false when subscription status is canceled', async () => {
    const headers = await authHeader('user-canceled')

    db.setResult(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { user_id: 'user-canceled', status: 'canceled', plan: 'monthly', trial_ends_at: null }
    )

    const req = new Request(`${BASE_URL}/api/validate`, { headers })
    const res = await worker.fetch(req, env)
    const data = await parseJson(res)
    expect(data.valid).toBe(false)
  })

  it('caches result in KV', async () => {
    const headers = await authHeader('user-willcache')

    db.setResult(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { user_id: 'user-willcache', status: 'active', plan: 'monthly', trial_ends_at: null }
    )

    const req = new Request(`${BASE_URL}/api/validate`, { headers })
    await worker.fetch(req, env)

    const cached = await kv.get('license:user-willcache')
    expect(cached).toBeDefined()
    expect(JSON.parse(cached!).valid).toBe(true)
  })
})

// ─── GET /api/auth/verify-email ───────────────────────────────────────────────

describe('GET /api/auth/verify-email', () => {
  it('returns 400 when token is missing', async () => {
    const req = new Request(`${BASE_URL}/api/auth/verify-email`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid token', async () => {
    db.setResult(
      'SELECT id, verify_token_expires FROM users WHERE verify_token = ?',
      null
    )

    const req = new Request(`${BASE_URL}/api/auth/verify-email?token=badtoken`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
  })

  it('returns 400 for expired token', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString()
    db.setResult(
      'SELECT id, verify_token_expires FROM users WHERE verify_token = ?',
      { id: 'user-1', verify_token_expires: pastDate }
    )

    const req = new Request(`${BASE_URL}/api/auth/verify-email?token=expiredtoken`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
  })

  it('returns 200 with HTML on success', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    db.setResult(
      'SELECT id, verify_token_expires FROM users WHERE verify_token = ?',
      { id: 'user-1', verify_token_expires: futureDate }
    )

    const req = new Request(`${BASE_URL}/api/auth/verify-email?token=validtoken`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/html')
    const html = await res.text()
    expect(html).toContain('Email Verified')
  })
})

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  it('always returns the same message regardless of whether email exists', async () => {
    db.setResult('SELECT id FROM users WHERE email = ?', null)

    const req = jsonRequest('/api/auth/forgot-password', { email: 'nobody@test.com' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.message).toContain('If an account exists')
  })

  it('sends password reset email when user exists', async () => {
    db.setResult('SELECT id FROM users WHERE email = ?', { id: 'user-1' })

    const req = jsonRequest('/api/auth/forgot-password', { email: 'exists@test.com' })
    await worker.fetch(req, env)

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      'test-resend-key',
      'exists@test.com',
      expect.any(String),
      'https://app.purroxy.com'
    )
  })

  it('does not send email when user does not exist', async () => {
    db.setResult('SELECT id FROM users WHERE email = ?', null)

    const req = jsonRequest('/api/auth/forgot-password', { email: 'nobody@test.com' })
    await worker.fetch(req, env)

    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
  })
})

// ─── POST /api/auth/reset-password ────────────────────────────────────────────

describe('POST /api/auth/reset-password', () => {
  it('returns 400 for expired token', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString()
    db.setResult(
      'SELECT id, reset_token_expires FROM users WHERE reset_token = ?',
      { id: 'user-1', reset_token_expires: pastDate }
    )

    const req = jsonRequest('/api/auth/reset-password', { token: 'expired', password: 'newpassword123' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('expired')
  })

  it('returns 400 for missing token or password', async () => {
    const req = jsonRequest('/api/auth/reset-password', { token: '', password: '' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
  })

  it('returns 400 for short password', async () => {
    const req = jsonRequest('/api/auth/reset-password', { token: 'valid', password: 'short' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('8 characters')
  })

  it('returns success on valid reset', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    db.setResult(
      'SELECT id, reset_token_expires FROM users WHERE reset_token = ?',
      { id: 'user-1', reset_token_expires: futureDate }
    )

    const req = jsonRequest('/api/auth/reset-password', { token: 'validtoken', password: 'newpassword123' })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.message).toContain('Password has been reset')
  })
})

// ─── POST /api/stripe/create-checkout ─────────────────────────────────────────

describe('POST /api/stripe/create-checkout', () => {
  it('returns 503 when Stripe is not configured', async () => {
    env.STRIPE_SECRET_KEY = undefined
    const req = jsonRequest('/api/stripe/create-checkout', {})
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(503)
  })

  it('returns 401 when not authenticated', async () => {
    const req = jsonRequest('/api/stripe/create-checkout', {})
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it('returns checkout URL on success', async () => {
    const headers = await authHeader('user-checkout')

    db.setResult(
      'SELECT email FROM users WHERE id = ?',
      { email: 'user@test.com' }
    )

    vi.mocked(createCheckoutSession).mockResolvedValueOnce('https://checkout.stripe.com/session/123')

    const req = new Request(`${BASE_URL}/api/stripe/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: '{}',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.url).toBe('https://checkout.stripe.com/session/123')
  })
})

// ─── POST /api/stripe/portal ──────────────────────────────────────────────────

describe('POST /api/stripe/portal', () => {
  it('returns 401 when not authenticated', async () => {
    const req = jsonRequest('/api/stripe/portal', {})
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it('returns 400 when no billing account found', async () => {
    const headers = await authHeader('user-noportal')
    vi.mocked(createBillingPortalSession).mockResolvedValueOnce(null)

    const req = new Request(`${BASE_URL}/api/stripe/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: '{}',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('No billing account')
  })

  it('returns portal URL on success', async () => {
    const headers = await authHeader('user-portal')
    vi.mocked(createBillingPortalSession).mockResolvedValueOnce('https://billing.stripe.com/portal/123')

    const req = new Request(`${BASE_URL}/api/stripe/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: '{}',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.url).toBe('https://billing.stripe.com/portal/123')
  })
})

// ─── POST /api/stripe/webhook ─────────────────────────────────────────────────

describe('POST /api/stripe/webhook', () => {
  it('returns 400 when missing stripe-signature header', async () => {
    const req = new Request(`${BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      body: '{}',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('Missing Stripe signature')
  })

  it('returns 400 when signature verification fails', async () => {
    const mockStripeInstance = {
      webhooks: {
        constructEventAsync: vi.fn().mockRejectedValueOnce(new Error('Invalid signature')),
      },
    }
    vi.mocked(getStripe).mockReturnValueOnce(mockStripeInstance as any)

    const req = new Request(`${BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'stripe-signature': 'bad_sig' },
      body: '{"test": true}',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('Invalid signature')
  })

  it('handles valid webhook events', async () => {
    const event = {
      id: 'evt_123',
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_123', customer: 'cus_test', status: 'active' } },
    }
    const mockStripeInstance = {
      webhooks: {
        constructEventAsync: vi.fn().mockResolvedValueOnce(event),
      },
    }
    vi.mocked(getStripe).mockReturnValueOnce(mockStripeInstance as any)
    vi.mocked(handleSubscriptionEvent).mockResolvedValueOnce(undefined)

    const req = new Request(`${BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'stripe-signature': 'valid_sig' },
      body: '{"test": true}',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.received).toBe(true)

    expect(handleSubscriptionEvent).toHaveBeenCalledWith(
      env.DB, env.KV, event
    )
  })
})

// ─── GET /api/stripe/status ───────────────────────────────────────────────────

describe('GET /api/stripe/status', () => {
  it('returns 401 when not authenticated', async () => {
    const req = new Request(`${BASE_URL}/api/stripe/status`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it('returns subscription info', async () => {
    const headers = await authHeader('user-status')

    db.setResult(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      {
        user_id: 'user-status',
        status: 'active',
        plan: 'monthly',
        trial_ends_at: null,
        stripe_customer_id: 'cus_123',
      }
    )

    const req = new Request(`${BASE_URL}/api/stripe/status`, { headers })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.valid).toBe(true)
    expect(data.subscription.status).toBe('active')
    expect(data.subscription.plan).toBe('monthly')
    // stripe_customer_id should be boolean (not leaked)
    expect(data.subscription.stripeCustomerId).toBe(true)
  })

  it('returns valid=true for contributor status', async () => {
    const headers = await authHeader('user-contributor')

    db.setResult(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      {
        user_id: 'user-contributor',
        status: 'contributor',
        plan: 'contributor',
        trial_ends_at: null,
        stripe_customer_id: null,
      }
    )

    const req = new Request(`${BASE_URL}/api/stripe/status`, { headers })
    const res = await worker.fetch(req, env)
    const data = await parseJson(res)
    expect(data.valid).toBe(true)
    expect(data.subscription.stripeCustomerId).toBe(false)
  })
})

// ─── POST /api/submissions ────────────────────────────────────────────────────

describe('POST /api/submissions', () => {
  it('returns 401 when not authenticated', async () => {
    const req = jsonRequest('/api/submissions', {})
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing required fields', async () => {
    const headers = await authHeader('user-submit')
    db.setResult('SELECT email FROM users WHERE id = ?', { email: 'user@test.com' })

    const req = jsonRequest('/api/submissions', { name: '', hostname: '' }, headers)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('Missing required fields')
  })

  it('returns 201 and creates PR on success', async () => {
    const headers = await authHeader('user-submit')
    db.setResult('SELECT email FROM users WHERE id = ?', { email: 'user@test.com' })

    vi.mocked(createSubmissionPR).mockResolvedValueOnce({
      prNumber: 99,
      prUrl: 'https://github.com/owner/repo/pull/99',
    })

    const body = {
      name: 'Login Automation',
      description: 'Automates login',
      hostname: 'example.com',
      actions: [{ type: 'click', selector: '#login' }],
    }

    const req = jsonRequest('/api/submissions', body, headers)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(201)
    const data = await parseJson(res)
    expect(data.submissionId).toBeDefined()
    expect(data.status).toBe('pending')
    expect(data.githubPr.number).toBe(99)
    expect(data.githubPr.url).toBe('https://github.com/owner/repo/pull/99')

    expect(createSubmissionPR).toHaveBeenCalled()
  })

  it('returns 503 when GitHub is not configured', async () => {
    env.GITHUB_TOKEN = undefined
    const headers = await authHeader('user-submit')

    const req = jsonRequest('/api/submissions', {
      name: 'Test', hostname: 'test.com', actions: [],
    }, headers)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(503)
  })
})

// ─── GET /api/submissions ─────────────────────────────────────────────────────

describe('GET /api/submissions', () => {
  it('returns 401 when not authenticated', async () => {
    const req = new Request(`${BASE_URL}/api/submissions`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it('returns list of submissions', async () => {
    const headers = await authHeader('user-list')

    db.setResult(
      'SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [
        {
          id: 'sub-1',
          capability_name: 'Login Automation',
          hostname: 'example.com',
          status: 'pending',
          github_pr_url: 'https://github.com/owner/repo/pull/1',
          rejection_reason: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      ]
    )

    const req = new Request(`${BASE_URL}/api/submissions`, { headers })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.submissions).toHaveLength(1)
    expect(data.submissions[0].capabilityName).toBe('Login Automation')
  })
})

// ─── POST /api/github/webhook ─────────────────────────────────────────────────

describe('POST /api/github/webhook', () => {
  it('returns 400 when signature is missing', async () => {
    const req = new Request(`${BASE_URL}/api/github/webhook`, {
      method: 'POST',
      body: '{}',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('Missing signature')
  })

  it('returns 400 for invalid signature', async () => {
    vi.mocked(verifyGitHubWebhook).mockResolvedValueOnce(false)

    const req = new Request(`${BASE_URL}/api/github/webhook`, {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-event': 'pull_request',
      },
      body: '{"action":"closed"}',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
    const data = await parseJson(res)
    expect(data.error).toContain('Invalid signature')
  })

  it('grants contributor access when PR is merged', async () => {
    vi.mocked(verifyGitHubWebhook).mockResolvedValueOnce(true)

    db.setResult(
      'SELECT s.*, u.email FROM submissions s JOIN users u ON s.user_id = u.id WHERE s.github_pr_number = ?',
      {
        id: 'sub-1',
        user_id: 'user-pr',
        capability_name: 'Login Automation',
        email: 'user@test.com',
      }
    )

    const payload = JSON.stringify({
      action: 'closed',
      pull_request: {
        number: 42,
        merged: true,
        head: { ref: 'submission/test-branch' },
      },
    })

    const req = new Request(`${BASE_URL}/api/github/webhook`, {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'sha256=valid',
        'x-github-event': 'pull_request',
      },
      body: payload,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)

    expect(grantContributorAccess).toHaveBeenCalled()
    expect(sendSubmissionApprovedEmail).toHaveBeenCalledWith(
      'test-resend-key', 'user@test.com', 'Login Automation'
    )
    expect(deleteBranch).toHaveBeenCalledWith('ghp_test', 'owner/repo', 'submission/test-branch')
  })

  it('rejects submission when PR is closed without merge', async () => {
    vi.mocked(verifyGitHubWebhook).mockResolvedValueOnce(true)

    db.setResult(
      'SELECT s.*, u.email FROM submissions s JOIN users u ON s.user_id = u.id WHERE s.github_pr_number = ?',
      {
        id: 'sub-1',
        user_id: 'user-pr',
        capability_name: 'Login Automation',
        email: 'user@test.com',
      }
    )

    const payload = JSON.stringify({
      action: 'closed',
      pull_request: {
        number: 42,
        merged: false,
        body: 'Needs work on selectors',
        head: { ref: 'submission/test-branch' },
      },
    })

    const req = new Request(`${BASE_URL}/api/github/webhook`, {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'sha256=valid',
        'x-github-event': 'pull_request',
      },
      body: payload,
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)

    expect(grantContributorAccess).not.toHaveBeenCalled()
    expect(sendSubmissionRejectedEmail).toHaveBeenCalledWith(
      'test-resend-key', 'user@test.com', 'Login Automation', 'Needs work on selectors'
    )
    expect(deleteBranch).toHaveBeenCalled()
  })

  it('returns ok for non-pull_request events', async () => {
    vi.mocked(verifyGitHubWebhook).mockResolvedValueOnce(true)

    const req = new Request(`${BASE_URL}/api/github/webhook`, {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'sha256=valid',
        'x-github-event': 'push',
      },
      body: '{"ref":"refs/heads/main"}',
    })
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.ok).toBe(true)
  })
})

// ─── GET /api/community ───────────────────────────────────────────────────────

describe('GET /api/community', () => {
  it('returns approved capabilities', async () => {
    db.setResult(
      "SELECT c.*, u.email as author_email FROM community_capabilities c JOIN users u ON c.user_id = u.id WHERE c.status = ? ORDER BY c.install_count DESC, c.created_at DESC LIMIT 50",
      [
        {
          id: 'cap-1',
          name: 'Login Automation',
          description: 'Automates login',
          hostname: 'example.com',
          author_email: 'author@test.com',
          install_count: 10,
          created_at: '2024-01-01T00:00:00Z',
        },
      ]
    )

    const req = new Request(`${BASE_URL}/api/community`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.capabilities).toBeDefined()
  })
})

// ─── POST /api/community/publish ──────────────────────────────────────────────

describe('POST /api/community/publish', () => {
  it('returns 401 when not authenticated', async () => {
    const req = jsonRequest('/api/community/publish', {})
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing required fields', async () => {
    const headers = await authHeader('user-pub')

    const req = jsonRequest('/api/community/publish', { name: '' }, headers)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(400)
  })

  it('grants contributor access when user is on trial', async () => {
    const headers = await authHeader('user-pub')

    db.setResult(
      'SELECT id, plan FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { id: 'sub-1', plan: 'trial' }
    )

    const body = {
      name: 'My Cap',
      hostname: 'example.com',
      actions: [{ type: 'click' }],
    }

    const req = jsonRequest('/api/community/publish', body, headers)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(200)
    const data = await parseJson(res)
    expect(data.status).toBe('pending')
    expect(data.message).toContain('contributor access')

    // Verify the subscription was updated to contributor
    const queries = db.getQueries()
    const updateQuery = queries.find(q => q.sql.includes("plan = ?") && q.sql.includes("status = ?"))
    expect(updateQuery).toBeDefined()
    if (updateQuery) {
      expect(updateQuery.bindings).toContain('contributor')
    }
  })
})
