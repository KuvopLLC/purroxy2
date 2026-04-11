import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getDecryptedValue,
  getAllDecryptedValues,
  setupVault,
} from '../../electron/vault'
import { getRegisteredHandler, clearRegisteredHandlers } from '../setup/electron-mocks'
import { safeStorage } from 'electron'

describe('vault', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearRegisteredHandlers()
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

    // Re-register IPC handlers
    setupVault()

    // Clear any leftover entries from previous tests
    const listHandler = getRegisteredHandler('vault:list')
    const deleteHandler = getRegisteredHandler('vault:delete')
    if (listHandler && deleteHandler) {
      const entries = await listHandler({})
      for (const entry of entries) {
        await deleteHandler({}, entry.key)
      }
    }
  })

  // ── Helper to call IPC handlers ────────────────────────────────────────

  function callHandler(channel: string, ...args: any[]) {
    const handler = getRegisteredHandler(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler({}, ...args)
  }

  // ── setEntry (via vault:set IPC) ───────────────────────────────────────

  describe('vault:set', () => {
    it('creates a new entry', async () => {
      const result = await callHandler('vault:set', 'api-key', 'sk-12345')
      expect(result).toBe(true)

      // Verify it was stored
      const list = await callHandler('vault:list')
      expect(list).toHaveLength(1)
      expect(list[0].key).toBe('api-key')
      expect(list[0].hasValue).toBe(true)
    })

    it('updates an existing entry', async () => {
      await callHandler('vault:set', 'api-key', 'old-value')
      await callHandler('vault:set', 'api-key', 'new-value')

      const list = await callHandler('vault:list')
      expect(list).toHaveLength(1)

      // Verify the value was updated
      const val = getDecryptedValue('api-key')
      expect(val).toBe('new-value')
    })

    it('can store multiple entries', async () => {
      await callHandler('vault:set', 'key1', 'val1')
      await callHandler('vault:set', 'key2', 'val2')

      const list = await callHandler('vault:list')
      expect(list).toHaveLength(2)
    })
  })

  // ── deleteEntry (via vault:delete IPC) ─────────────────────────────────

  describe('vault:delete', () => {
    it('removes an existing entry', async () => {
      await callHandler('vault:set', 'api-key', 'sk-12345')
      const result = await callHandler('vault:delete', 'api-key')
      expect(result).toBe(true)

      const list = await callHandler('vault:list')
      expect(list).toHaveLength(0)
    })

    it('is safe to call for a nonexistent key', async () => {
      const result = await callHandler('vault:delete', 'nonexistent')
      expect(result).toBe(true)
    })
  })

  // ── vault:list ─────────────────────────────────────────────────────────

  describe('vault:list', () => {
    it('returns empty array when no entries', async () => {
      const list = await callHandler('vault:list')
      expect(list).toEqual([])
    })

    it('returns entries without decrypted values', async () => {
      await callHandler('vault:set', 'secret', 'my-secret-value')
      const list = await callHandler('vault:list')

      expect(list).toHaveLength(1)
      expect(list[0].key).toBe('secret')
      expect(list[0].hasValue).toBe(true)
      expect(list[0].id).toBeTruthy()
      expect(list[0].createdAt).toBeTruthy()
      expect(list[0].updatedAt).toBeTruthy()
      // Should NOT have the encrypted value exposed
      expect(list[0].valueEncrypted).toBeUndefined()
    })
  })

  // ── vault:peek ─────────────────────────────────────────────────────────

  describe('vault:peek', () => {
    it('returns masked value for long strings', async () => {
      await callHandler('vault:set', 'api-key', 'sk-abcdef12345')
      const peeked = await callHandler('vault:peek', 'api-key')

      // first 2 + dots + last 2
      expect(peeked).toMatch(/^sk/)
      expect(peeked).toMatch(/45$/)
      expect(peeked).toContain('•')
    })

    it('returns **** for short strings (4 chars or fewer)', async () => {
      await callHandler('vault:set', 'pin', 'abcd')
      const peeked = await callHandler('vault:peek', 'pin')
      expect(peeked).toBe('****')
    })

    it('returns **** for very short strings', async () => {
      await callHandler('vault:set', 'tiny', 'ab')
      const peeked = await callHandler('vault:peek', 'tiny')
      expect(peeked).toBe('****')
    })

    it('returns null for a nonexistent key', async () => {
      const peeked = await callHandler('vault:peek', 'nonexistent')
      expect(peeked).toBeNull()
    })
  })

  // ── getDecryptedValue ──────────────────────────────────────────────────

  describe('getDecryptedValue', () => {
    it('returns the decrypted value for an existing entry', async () => {
      await callHandler('vault:set', 'secret', 'my-value')
      const val = getDecryptedValue('secret')
      expect(val).toBe('my-value')
    })

    it('returns null for a nonexistent key', () => {
      const val = getDecryptedValue('nonexistent')
      expect(val).toBeNull()
    })
  })

  // ── getAllDecryptedValues ───────────────────────────────────────────────

  describe('getAllDecryptedValues', () => {
    it('returns all decrypted values', async () => {
      await callHandler('vault:set', 'key1', 'val1')
      await callHandler('vault:set', 'key2', 'val2')

      const all = getAllDecryptedValues()
      expect(all).toEqual({ key1: 'val1', key2: 'val2' })
    })

    it('returns an empty object when no entries exist', () => {
      const all = getAllDecryptedValues()
      expect(all).toEqual({})
    })

    it('skips entries that fail to decrypt', async () => {
      await callHandler('vault:set', 'good', 'value')

      // Make the next decrypt call throw for one entry
      const originalDecrypt = vi.mocked(safeStorage.decryptString)
      let callCount = 0
      originalDecrypt.mockImplementation((buf: Buffer) => {
        callCount++
        if (callCount === 1) {
          // First call succeeds (during the getAllEntries loop)
          return buf.toString()
        }
        // Let subsequent calls also succeed
        return buf.toString()
      })

      // Add another entry that we'll make fail
      await callHandler('vault:set', 'bad', 'will-fail')

      // Now mock decrypt to fail for the "bad" entry
      originalDecrypt.mockImplementation((buf: Buffer) => {
        const val = buf.toString()
        if (val.includes('will-fail')) {
          throw new Error('Decryption failed')
        }
        return val
      })

      const all = getAllDecryptedValues()
      // "good" should be present, "bad" should be skipped
      expect(all['good']).toBe('value')
      expect(all['bad']).toBeUndefined()
    })
  })
})
