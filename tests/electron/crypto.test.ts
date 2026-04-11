import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encrypt, decrypt } from '../../electron/crypto'
import { safeStorage } from 'electron'

describe('crypto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure the mock says encryption is available (default from electron-mocks.ts)
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
  })

  // ── encrypt / decrypt roundtrip ────────────────────────────────────────

  describe('encrypt and decrypt roundtrip', () => {
    it('decrypts to the original plaintext', () => {
      const plaintext = 'Hello, world!'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('handles an empty string', () => {
      const encrypted = encrypt('')
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe('')
    })

    it('handles unicode text', () => {
      const plaintext = 'Purroxy 🐱 meow'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('handles long strings', () => {
      const plaintext = 'a'.repeat(10000)
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })
  })

  // ── different strings produce different ciphertext ─────────────────────

  describe('ciphertext differences', () => {
    it('different inputs produce different encrypted outputs', () => {
      const enc1 = encrypt('first')
      const enc2 = encrypt('second')
      expect(enc1).not.toBe(enc2)
    })

    it('same input produces same encrypted output (deterministic mock)', () => {
      // The mock safeStorage just converts text → Buffer → base64,
      // so identical input should produce identical output
      const enc1 = encrypt('same')
      const enc2 = encrypt('same')
      expect(enc1).toBe(enc2)
    })
  })

  // ── encryption format ──────────────────────────────────────────────────

  describe('encryption format', () => {
    it('returns a base64 encoded string', () => {
      const encrypted = encrypt('test')
      // Base64 pattern: alphanumeric + /+ and possibly =
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/)
    })
  })

  // ── error handling ─────────────────────────────────────────────────────

  describe('error when encryption unavailable', () => {
    it('encrypt throws when safeStorage is not available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
      expect(() => encrypt('test')).toThrow('OS encryption not available')
    })

    it('decrypt throws when safeStorage is not available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
      expect(() => decrypt('dGVzdA==')).toThrow('OS encryption not available')
    })
  })
})
