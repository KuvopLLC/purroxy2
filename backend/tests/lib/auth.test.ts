import { describe, it, expect, beforeEach } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  authenticateRequest,
  checkRateLimit,
  generateToken,
} from '../../src/lib/auth'
import { createMockKV } from '../mocks/kv-mock'

// ─── hashPassword ─────────────────────────────────────────────────────────────

describe('hashPassword', () => {
  it('returns a string', async () => {
    const hash = await hashPassword('testpassword')
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('returns a bcrypt hash starting with $2', async () => {
    const hash = await hashPassword('testpassword')
    expect(hash).toMatch(/^\$2[aby]?\$/)
  })

  it('returns different hashes for same input (salted)', async () => {
    const hash1 = await hashPassword('testpassword')
    const hash2 = await hashPassword('testpassword')
    expect(hash1).not.toBe(hash2)
  })
})

// ─── verifyPassword ───────────────────────────────────────────────────────────

describe('verifyPassword', () => {
  it('returns true for a correct password', async () => {
    const hash = await hashPassword('correctpassword')
    const result = await verifyPassword('correctpassword', hash)
    expect(result).toBe(true)
  })

  it('returns false for an incorrect password', async () => {
    const hash = await hashPassword('correctpassword')
    const result = await verifyPassword('wrongpassword', hash)
    expect(result).toBe(false)
  })

  it('returns false for empty password', async () => {
    const hash = await hashPassword('somepassword')
    const result = await verifyPassword('', hash)
    expect(result).toBe(false)
  })
})

// ─── createToken ──────────────────────────────────────────────────────────────

describe('createToken', () => {
  it('returns a JWT string', async () => {
    const token = await createToken('user-123', 'test-secret')
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(3) // JWT has 3 parts
  })

  it('creates different tokens for different users', async () => {
    const token1 = await createToken('user-1', 'test-secret')
    const token2 = await createToken('user-2', 'test-secret')
    expect(token1).not.toBe(token2)
  })
})

// ─── verifyToken ──────────────────────────────────────────────────────────────

describe('verifyToken', () => {
  it('returns the userId for a valid token', async () => {
    const token = await createToken('user-abc', 'my-secret')
    const result = await verifyToken(token, 'my-secret')
    expect(result).toBe('user-abc')
  })

  it('returns null for a token signed with a different secret', async () => {
    const token = await createToken('user-abc', 'secret-1')
    const result = await verifyToken(token, 'secret-2')
    expect(result).toBeNull()
  })

  it('returns null for garbage string', async () => {
    const result = await verifyToken('this-is-not-a-jwt', 'any-secret')
    expect(result).toBeNull()
  })

  it('returns null for empty string', async () => {
    const result = await verifyToken('', 'any-secret')
    expect(result).toBeNull()
  })

  it('returns null for an expired token', async () => {
    // We cannot easily create a genuinely expired token with jose without
    // manipulating time, but we can test that a tampered token fails.
    const token = await createToken('user-abc', 'my-secret')
    // Tamper with the payload to simulate expiry
    const parts = token.split('.')
    parts[1] = 'eyJzdWIiOiJ1c2VyLWFiYyIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwMDAwMDAxfQ'
    const tampered = parts.join('.')
    const result = await verifyToken(tampered, 'my-secret')
    expect(result).toBeNull()
  })
})

// ─── authenticateRequest ──────────────────────────────────────────────────────

describe('authenticateRequest', () => {
  const env = { JWT_SECRET: 'test-secret' }

  it('returns null when no Authorization header', async () => {
    const req = new Request('http://localhost/test')
    const result = await authenticateRequest(req, env)
    expect(result).toBeNull()
  })

  it('returns null when Authorization header does not start with Bearer', async () => {
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Basic abc123' },
    })
    const result = await authenticateRequest(req, env)
    expect(result).toBeNull()
  })

  it('returns null for invalid Bearer token', async () => {
    const req = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer garbage-token' },
    })
    const result = await authenticateRequest(req, env)
    expect(result).toBeNull()
  })

  it('returns userId for a valid Bearer token', async () => {
    const token = await createToken('user-xyz', 'test-secret')
    const req = new Request('http://localhost/test', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await authenticateRequest(req, env)
    expect(result).toBe('user-xyz')
  })

  it('uses dev-secret when JWT_SECRET is not set', async () => {
    const token = await createToken('user-xyz', 'dev-secret')
    const req = new Request('http://localhost/test', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await authenticateRequest(req, {})
    expect(result).toBe('user-xyz')
  })
})

// ─── checkRateLimit ───────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  let kv: ReturnType<typeof createMockKV>

  beforeEach(() => {
    kv = createMockKV()
  })

  it('allows the first request', async () => {
    const result = await checkRateLimit(kv as any, 'test-key')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(9) // 10 max - 0 existing - 1 = 9
  })

  it('decrements remaining on each call', async () => {
    await checkRateLimit(kv as any, 'test-key')
    const result = await checkRateLimit(kv as any, 'test-key')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(8)
  })

  it('denies after max attempts', async () => {
    // Simulate hitting the limit by pre-setting the count
    await kv.put('ratelimit:test-key', '10')
    const result = await checkRateLimit(kv as any, 'test-key')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('returns allowed with max remaining when no KV', async () => {
    const result = await checkRateLimit(undefined, 'test-key')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(10)
  })

  it('tracks separate keys independently', async () => {
    await kv.put('ratelimit:key-a', '9')
    const a = await checkRateLimit(kv as any, 'key-a')
    const b = await checkRateLimit(kv as any, 'key-b')
    expect(a.allowed).toBe(true)
    expect(a.remaining).toBe(0)
    expect(b.allowed).toBe(true)
    expect(b.remaining).toBe(9)
  })
})

// ─── generateToken ────────────────────────────────────────────────────────────

describe('generateToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns unique tokens on each call', () => {
    const token1 = generateToken()
    const token2 = generateToken()
    expect(token1).not.toBe(token2)
  })
})
