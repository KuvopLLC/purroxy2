import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10
const TOKEN_EXPIRY = '30d'

// Rate limiting config
const RATE_LIMIT_WINDOW = 60 // seconds
const RATE_LIMIT_MAX = 10 // attempts per window

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createToken(userId: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(key)
}

export async function verifyToken(token: string, secret: string): Promise<string | null> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key)
    return (payload.sub as string) || null
  } catch {
    return null
  }
}

export async function authenticateRequest(
  request: Request,
  env: { JWT_SECRET?: string }
): Promise<string | null> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return verifyToken(auth.slice(7), env.JWT_SECRET || 'dev-secret')
}

// Simple KV-based rate limiting
export async function checkRateLimit(
  kv: KVNamespace | undefined,
  key: string
): Promise<{ allowed: boolean; remaining: number }> {
  if (!kv) return { allowed: true, remaining: RATE_LIMIT_MAX }

  const rlKey = `ratelimit:${key}`
  const current = await kv.get(rlKey)
  const count = current ? parseInt(current, 10) : 0

  if (count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }

  await kv.put(rlKey, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW })
  return { allowed: true, remaining: RATE_LIMIT_MAX - count - 1 }
}

export function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
