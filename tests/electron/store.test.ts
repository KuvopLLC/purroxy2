import { describe, it, expect, beforeEach } from 'vitest'
import { store } from '../../electron/store'

describe('store', () => {
  // ── defaults ───────────────────────────────────────────────────────────

  describe('defaults', () => {
    it('has an empty string for aiApiKey by default', () => {
      // The store is created with defaults; the MockStore preserves them.
      // Since the store is a module-level singleton, the default value
      // should be present on first access (or after a test clears it).
      expect(store.get('aiApiKey')).toBe('')
    })

    it('has telemetryEnabled set to false by default', () => {
      expect(store.get('telemetryEnabled')).toBe(false)
    })
  })

  // ── get / set ──────────────────────────────────────────────────────────

  describe('get / set', () => {
    beforeEach(() => {
      // Reset to defaults
      store.set('aiApiKey', '')
      store.set('telemetryEnabled', false)
    })

    it('can set and get aiApiKey', () => {
      store.set('aiApiKey', 'sk-test-12345')
      expect(store.get('aiApiKey')).toBe('sk-test-12345')
    })

    it('can set and get telemetryEnabled', () => {
      store.set('telemetryEnabled', true)
      expect(store.get('telemetryEnabled')).toBe(true)
    })

    it('overwrites a previously set value', () => {
      store.set('aiApiKey', 'first')
      store.set('aiApiKey', 'second')
      expect(store.get('aiApiKey')).toBe('second')
    })

    it('returns the default after resetting a value', () => {
      store.set('aiApiKey', 'modified')
      store.set('aiApiKey', '')
      expect(store.get('aiApiKey')).toBe('')
    })
  })
})
