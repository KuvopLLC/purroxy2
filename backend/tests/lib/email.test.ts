import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSubmissionApprovedEmail,
  sendSubmissionRejectedEmail,
} from '../../src/lib/email'

const RESEND_API = 'https://api.resend.com/emails'
const TEST_API_KEY = 'test-resend-key'

// Mock global fetch
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── sendVerificationEmail ────────────────────────────────────────────────────

describe('sendVerificationEmail', () => {
  it('calls fetch with correct Resend API URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendVerificationEmail(TEST_API_KEY, 'user@test.com', 'verify-token-123', 'https://app.purroxy.com')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe(RESEND_API)
  })

  it('sends Bearer auth header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendVerificationEmail(TEST_API_KEY, 'user@test.com', 'tok', 'https://app.purroxy.com')
    const opts = mockFetch.mock.calls[0][1]
    expect(opts.headers.Authorization).toBe(`Bearer ${TEST_API_KEY}`)
  })

  it('sends correct from/to/subject fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendVerificationEmail(TEST_API_KEY, 'user@test.com', 'tok', 'https://app.purroxy.com')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.from).toBe('Purroxy <noreply@purroxy.com>')
    expect(body.to).toBe('user@test.com')
    expect(body.subject).toBe('Verify your Purroxy account')
  })

  it('includes verification URL in html body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendVerificationEmail(TEST_API_KEY, 'user@test.com', 'verify-abc', 'https://app.purroxy.com')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.html).toContain('https://app.purroxy.com/api/auth/verify-email?token=verify-abc')
  })

  it('returns true on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    const result = await sendVerificationEmail(TEST_API_KEY, 'user@test.com', 'tok', 'https://app.purroxy.com')
    expect(result).toBe(true)
  })

  it('returns false when fetch response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    const result = await sendVerificationEmail(TEST_API_KEY, 'user@test.com', 'tok', 'https://app.purroxy.com')
    expect(result).toBe(false)
  })

  it('returns false when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const result = await sendVerificationEmail(TEST_API_KEY, 'user@test.com', 'tok', 'https://app.purroxy.com')
    expect(result).toBe(false)
  })
})

// ─── sendPasswordResetEmail ───────────────────────────────────────────────────

describe('sendPasswordResetEmail', () => {
  it('calls fetch with correct Resend API URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendPasswordResetEmail(TEST_API_KEY, 'user@test.com', 'reset-tok', 'https://app.purroxy.com')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe(RESEND_API)
  })

  it('sends Bearer auth header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendPasswordResetEmail(TEST_API_KEY, 'user@test.com', 'tok', 'https://app.purroxy.com')
    const opts = mockFetch.mock.calls[0][1]
    expect(opts.headers.Authorization).toBe(`Bearer ${TEST_API_KEY}`)
  })

  it('sends correct from/to/subject fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendPasswordResetEmail(TEST_API_KEY, 'user@test.com', 'tok', 'https://app.purroxy.com')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.from).toBe('Purroxy <noreply@purroxy.com>')
    expect(body.to).toBe('user@test.com')
    expect(body.subject).toBe('Reset your Purroxy password')
  })

  it('includes reset URL in html body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendPasswordResetEmail(TEST_API_KEY, 'user@test.com', 'reset-xyz', 'https://app.purroxy.com')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.html).toContain('https://app.purroxy.com/reset-password?token=reset-xyz')
  })

  it('returns true on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    const result = await sendPasswordResetEmail(TEST_API_KEY, 'user@test.com', 'tok', 'https://app.purroxy.com')
    expect(result).toBe(true)
  })

  it('returns false when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const result = await sendPasswordResetEmail(TEST_API_KEY, 'user@test.com', 'tok', 'https://app.purroxy.com')
    expect(result).toBe(false)
  })
})

// ─── sendSubmissionApprovedEmail ──────────────────────────────────────────────

describe('sendSubmissionApprovedEmail', () => {
  it('calls fetch with correct Resend API URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendSubmissionApprovedEmail(TEST_API_KEY, 'user@test.com', 'Login Automation')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe(RESEND_API)
  })

  it('sends Bearer auth header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendSubmissionApprovedEmail(TEST_API_KEY, 'user@test.com', 'Login Automation')
    const opts = mockFetch.mock.calls[0][1]
    expect(opts.headers.Authorization).toBe(`Bearer ${TEST_API_KEY}`)
  })

  it('sends correct from/to/subject fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendSubmissionApprovedEmail(TEST_API_KEY, 'user@test.com', 'Login Automation')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.from).toBe('Purroxy <noreply@purroxy.com>')
    expect(body.to).toBe('user@test.com')
    expect(body.subject).toBe('Your capability was approved!')
  })

  it('includes capability name in html body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendSubmissionApprovedEmail(TEST_API_KEY, 'user@test.com', 'Login Automation')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.html).toContain('Login Automation')
    expect(body.html).toContain('free Purroxy access forever')
  })

  it('returns true on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    const result = await sendSubmissionApprovedEmail(TEST_API_KEY, 'user@test.com', 'Test')
    expect(result).toBe(true)
  })

  it('returns false when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const result = await sendSubmissionApprovedEmail(TEST_API_KEY, 'user@test.com', 'Test')
    expect(result).toBe(false)
  })
})

// ─── sendSubmissionRejectedEmail ──────────────────────────────────────────────

describe('sendSubmissionRejectedEmail', () => {
  it('calls fetch with correct Resend API URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendSubmissionRejectedEmail(TEST_API_KEY, 'user@test.com', 'Login Automation', 'Needs better selectors')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe(RESEND_API)
  })

  it('sends Bearer auth header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendSubmissionRejectedEmail(TEST_API_KEY, 'user@test.com', 'Test', 'reason')
    const opts = mockFetch.mock.calls[0][1]
    expect(opts.headers.Authorization).toBe(`Bearer ${TEST_API_KEY}`)
  })

  it('sends correct from/to/subject fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendSubmissionRejectedEmail(TEST_API_KEY, 'user@test.com', 'Test Cap', 'reason')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.from).toBe('Purroxy <noreply@purroxy.com>')
    expect(body.to).toBe('user@test.com')
    expect(body.subject).toBe('Changes needed for your capability')
  })

  it('includes capability name and reason in html body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await sendSubmissionRejectedEmail(TEST_API_KEY, 'user@test.com', 'Login Automation', 'Needs better selectors')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.html).toContain('Login Automation')
    expect(body.html).toContain('Needs better selectors')
  })

  it('returns true on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    const result = await sendSubmissionRejectedEmail(TEST_API_KEY, 'user@test.com', 'Test', 'reason')
    expect(result).toBe(true)
  })

  it('returns false when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const result = await sendSubmissionRejectedEmail(TEST_API_KEY, 'user@test.com', 'Test', 'reason')
    expect(result).toBe(false)
  })
})
