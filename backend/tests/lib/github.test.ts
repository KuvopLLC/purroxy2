import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createSubmissionPR,
  verifyGitHubWebhook,
  deleteBranch,
} from '../../src/lib/github'

const GITHUB_API = 'https://api.github.com'
const TEST_TOKEN = 'ghp_test_token'
const TEST_REPO = 'owner/community-caps'

// Mock global fetch
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── createSubmissionPR ───────────────────────────────────────────────────────

describe('createSubmissionPR', () => {
  function setupSuccessfulPRFlow() {
    // 1. Get repo
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ default_branch: 'main' }),
    })
    // 2. Get ref
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ object: { sha: 'base-sha-123' } }),
    })
    // 3. Create branch ref
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ref: 'refs/heads/submission/test-branch' }),
    })
    // 4a. Create blob for capability file
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sha: 'blob-sha-cap' }),
    })
    // 4b. Create blob for README file
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sha: 'blob-sha-readme' }),
    })
    // 5. Create tree
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sha: 'tree-sha-123' }),
    })
    // 6. Create commit
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sha: 'commit-sha-123' }),
    })
    // 7. Update branch ref
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })
    // 8. Create PR
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        number: 42,
        html_url: 'https://github.com/owner/community-caps/pull/42',
      }),
    })
  }

  it('calls GitHub API endpoints in order and returns prNumber and prUrl', async () => {
    setupSuccessfulPRFlow()

    const result = await createSubmissionPR(
      TEST_TOKEN,
      TEST_REPO,
      'sub-id-12345678',
      'Login Automation',
      'example.com',
      'user@test.com',
      {
        name: 'Login Automation',
        description: 'Automates login flow',
        hostname: 'example.com',
        actions: [{ type: 'click', selector: '#login' }],
        parameters: [],
        extractionRules: [],
        viewport: null,
      }
    )

    expect(result.prNumber).toBe(42)
    expect(result.prUrl).toBe('https://github.com/owner/community-caps/pull/42')

    // Verify the order of API calls
    const calls = mockFetch.mock.calls

    // 1. Get repo
    expect(calls[0][0]).toBe(`${GITHUB_API}/repos/${TEST_REPO}`)

    // 2. Get ref
    expect(calls[1][0]).toBe(`${GITHUB_API}/repos/${TEST_REPO}/git/ref/heads/main`)

    // 3. Create branch
    expect(calls[2][0]).toBe(`${GITHUB_API}/repos/${TEST_REPO}/git/refs`)
    expect(calls[2][1].method).toBe('POST')

    // 4a & 4b. Create blobs (two blob calls)
    expect(calls[3][0]).toBe(`${GITHUB_API}/repos/${TEST_REPO}/git/blobs`)
    expect(calls[4][0]).toBe(`${GITHUB_API}/repos/${TEST_REPO}/git/blobs`)

    // 5. Create tree
    expect(calls[5][0]).toBe(`${GITHUB_API}/repos/${TEST_REPO}/git/trees`)
    expect(calls[5][1].method).toBe('POST')

    // 6. Create commit
    expect(calls[6][0]).toBe(`${GITHUB_API}/repos/${TEST_REPO}/git/commits`)
    expect(calls[6][1].method).toBe('POST')

    // 7. Update branch ref (PATCH)
    expect(calls[7][0]).toContain(`${GITHUB_API}/repos/${TEST_REPO}/git/refs/heads/submission/`)
    expect(calls[7][1].method).toBe('PATCH')

    // 8. Create PR
    expect(calls[8][0]).toBe(`${GITHUB_API}/repos/${TEST_REPO}/pulls`)
    expect(calls[8][1].method).toBe('POST')
  })

  it('sends Authorization Bearer header on all calls', async () => {
    setupSuccessfulPRFlow()

    await createSubmissionPR(
      TEST_TOKEN, TEST_REPO, 'sub-123', 'Test', 'test.com', 'a@b.com',
      { name: 'Test', description: '', hostname: 'test.com', actions: [], parameters: [], extractionRules: [], viewport: null }
    )

    for (const call of mockFetch.mock.calls) {
      expect(call[1].headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`)
    }
  })

  it('creates branch with slugified hostname', async () => {
    setupSuccessfulPRFlow()

    await createSubmissionPR(
      TEST_TOKEN, TEST_REPO, 'abcdef1234567890', 'Test', 'my.example.com', 'a@b.com',
      { name: 'Test', description: '', hostname: 'my.example.com', actions: [], parameters: [], extractionRules: [], viewport: null }
    )

    const branchBody = JSON.parse(mockFetch.mock.calls[2][1].body)
    expect(branchBody.ref).toMatch(/^refs\/heads\/submission\/my-example-com-abcdef12$/)
  })

  it('throws when repo fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(
      createSubmissionPR(
        TEST_TOKEN, TEST_REPO, 'sub-123', 'Test', 'test.com', 'a@b.com',
        { name: 'Test', description: '', hostname: 'test.com', actions: [], parameters: [], extractionRules: [], viewport: null }
      )
    ).rejects.toThrow('Failed to get repo')
  })

  it('throws when branch creation fails', async () => {
    // repo ok
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ default_branch: 'main' })
    })
    // ref ok
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ object: { sha: 'sha' } })
    })
    // branch fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 })

    await expect(
      createSubmissionPR(
        TEST_TOKEN, TEST_REPO, 'sub-123', 'Test', 'test.com', 'a@b.com',
        { name: 'Test', description: '', hostname: 'test.com', actions: [], parameters: [], extractionRules: [], viewport: null }
      )
    ).rejects.toThrow('Failed to create branch')
  })

  it('throws when PR creation fails', async () => {
    // Set up everything to succeed except the final PR creation
    // 1-7 succeed
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ default_branch: 'main' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ object: { sha: 'sha' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: 'bsha1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: 'bsha2' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: 'tsha' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: 'csha' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      // PR fails
      .mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(
      createSubmissionPR(
        TEST_TOKEN, TEST_REPO, 'sub-123', 'Test', 'test.com', 'a@b.com',
        { name: 'Test', description: '', hostname: 'test.com', actions: [], parameters: [], extractionRules: [], viewport: null }
      )
    ).rejects.toThrow('Failed to create PR')
  })
})

// ─── verifyGitHubWebhook ─────────────────────────────────────────────────────

describe('verifyGitHubWebhook', () => {
  const secret = 'webhook-secret-123'

  async function computeSignature(payload: string, key: string): Promise<string> {
    const encoder = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
      'raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payload))
    const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
    return `sha256=${hex}`
  }

  it('returns true for valid signature', async () => {
    const payload = '{"action":"opened"}'
    const signature = await computeSignature(payload, secret)
    const result = await verifyGitHubWebhook(payload, signature, secret)
    expect(result).toBe(true)
  })

  it('returns false for invalid signature', async () => {
    const payload = '{"action":"opened"}'
    const result = await verifyGitHubWebhook(payload, 'sha256=invalid', secret)
    expect(result).toBe(false)
  })

  it('returns false for wrong secret', async () => {
    const payload = '{"action":"opened"}'
    const signature = await computeSignature(payload, secret)
    const result = await verifyGitHubWebhook(payload, signature, 'wrong-secret')
    expect(result).toBe(false)
  })

  it('returns false for tampered payload', async () => {
    const payload = '{"action":"opened"}'
    const signature = await computeSignature(payload, secret)
    const result = await verifyGitHubWebhook('{"action":"closed"}', signature, secret)
    expect(result).toBe(false)
  })

  it('returns false for empty signature', async () => {
    const result = await verifyGitHubWebhook('{}', '', secret)
    expect(result).toBe(false)
  })
})

// ─── deleteBranch ─────────────────────────────────────────────────────────────

describe('deleteBranch', () => {
  it('sends DELETE request to correct URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    await deleteBranch(TEST_TOKEN, TEST_REPO, 'submission/test-branch')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe(
      `${GITHUB_API}/repos/${TEST_REPO}/git/refs/heads/submission/test-branch`
    )
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('sends Authorization Bearer header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    await deleteBranch(TEST_TOKEN, TEST_REPO, 'some-branch')

    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`)
  })
})
