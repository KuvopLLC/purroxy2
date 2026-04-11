/**
 * In-memory mock of Cloudflare KVNamespace for backend tests.
 *
 * Supports get, put, delete, and list operations.
 */

export function createMockKV() {
  const store = new Map<string, string>()

  const kv = {
    async get(key: string, _opts?: any): Promise<string | null> {
      return store.get(key) ?? null
    },

    async put(key: string, value: string, _opts?: { expirationTtl?: number; expiration?: number }): Promise<void> {
      store.set(key, value)
    },

    async delete(key: string): Promise<void> {
      store.delete(key)
    },

    async list(_opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor: string }> {
      const prefix = _opts?.prefix ?? ''
      const keys = [...store.keys()]
        .filter(k => k.startsWith(prefix))
        .map(name => ({ name }))
      return { keys, list_complete: true, cursor: '' }
    },

    // ── Test helpers ──────────────────────────────────────────────

    /** Get the raw internal store for assertions. */
    getStore(): Map<string, string> {
      return store
    },

    /** Clear all stored data. */
    reset(): void {
      store.clear()
    },
  }

  return kv
}

export type MockKVNamespace = ReturnType<typeof createMockKV>
