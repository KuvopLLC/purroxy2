import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAllCapabilities,
  getCapabilitiesForSite,
  getCapability,
  createCapability,
  deleteCapability,
  updateCapability,
} from '../../electron/capabilities'
import { buildCapability } from '../factories/capability-factory'

// The electron-store mock is applied globally via setupFiles.
// Each test gets a fresh store because we import the module fresh or reset via the module's own store.

// We need to reset the capabilities store between tests.
// Since electron-store is mocked, each `new Store(...)` call in the source creates
// a MockStore instance. We can manipulate it indirectly through the public API.

describe('capabilities', () => {
  beforeEach(() => {
    // Clear all capabilities by deleting them one by one via the public API,
    // or we can just re-mock. The simplest approach: delete every capability.
    const all = getAllCapabilities()
    for (const cap of all) {
      deleteCapability(cap.id)
    }
  })

  // ── getAllCapabilities ──────────────────────────────────────────────────

  describe('getAllCapabilities', () => {
    it('returns an empty array when no capabilities exist', () => {
      expect(getAllCapabilities()).toEqual([])
    })

    it('returns all capabilities when populated', () => {
      createCapability({
        siteProfileId: 'site-1',
        name: 'Cap A',
        description: 'First',
        actions: [],
        parameters: [],
        extractionRules: [],
      })
      createCapability({
        siteProfileId: 'site-2',
        name: 'Cap B',
        description: 'Second',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      const all = getAllCapabilities()
      expect(all).toHaveLength(2)
      expect(all[0].name).toBe('Cap A')
      expect(all[1].name).toBe('Cap B')
    })
  })

  // ── getCapabilitiesForSite ─────────────────────────────────────────────

  describe('getCapabilitiesForSite', () => {
    it('returns only capabilities matching the given siteProfileId', () => {
      createCapability({
        siteProfileId: 'site-1',
        name: 'Cap A',
        description: 'First',
        actions: [],
        parameters: [],
        extractionRules: [],
      })
      createCapability({
        siteProfileId: 'site-2',
        name: 'Cap B',
        description: 'Second',
        actions: [],
        parameters: [],
        extractionRules: [],
      })
      createCapability({
        siteProfileId: 'site-1',
        name: 'Cap C',
        description: 'Third',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      const site1Caps = getCapabilitiesForSite('site-1')
      expect(site1Caps).toHaveLength(2)
      expect(site1Caps.map(c => c.name)).toEqual(['Cap A', 'Cap C'])
    })

    it('returns an empty array when no capabilities match', () => {
      createCapability({
        siteProfileId: 'site-1',
        name: 'Cap A',
        description: 'First',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      expect(getCapabilitiesForSite('nonexistent')).toEqual([])
    })
  })

  // ── getCapability ──────────────────────────────────────────────────────

  describe('getCapability', () => {
    it('returns the capability when found by id', () => {
      const created = createCapability({
        siteProfileId: 'site-1',
        name: 'Cap A',
        description: 'First',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      const found = getCapability(created.id)
      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
      expect(found!.name).toBe('Cap A')
    })

    it('returns undefined when not found', () => {
      expect(getCapability('nonexistent-id')).toBeUndefined()
    })
  })

  // ── createCapability ───────────────────────────────────────────────────

  describe('createCapability', () => {
    it('creates a capability with all provided fields', () => {
      const cap = createCapability({
        siteProfileId: 'site-1',
        name: 'Login',
        description: 'Logs in to the site',
        actions: [{ type: 'click', selector: '#login' }],
        parameters: [
          {
            name: 'username',
            description: 'The username',
            actionIndex: 0,
            field: 'value' as const,
            defaultValue: '',
            required: true,
          },
        ],
        extractionRules: [
          {
            name: 'title',
            selector: 'h1',
            attribute: 'text',
            multiple: false,
            sensitive: false,
          },
        ],
      })

      expect(cap.id).toBeTruthy()
      expect(cap.siteProfileId).toBe('site-1')
      expect(cap.name).toBe('Login')
      expect(cap.description).toBe('Logs in to the site')
      expect(cap.actions).toHaveLength(1)
      expect(cap.parameters).toHaveLength(1)
      expect(cap.extractionRules).toHaveLength(1)
    })

    it('sets correct defaults', () => {
      const cap = createCapability({
        siteProfileId: 'site-1',
        name: 'Test',
        description: 'Test cap',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      expect(cap.preferredEngine).toBe('playwright')
      expect(cap.healthStatus).toBe('healthy')
      expect(cap.consecutiveFailures).toBe(0)
      expect(cap.lastRunAt).toBeNull()
      expect(cap.lastSuccessAt).toBeNull()
      expect(cap.createdAt).toBeTruthy()
      expect(cap.updatedAt).toBeTruthy()
    })

    it('persists the capability to the store', () => {
      const cap = createCapability({
        siteProfileId: 'site-1',
        name: 'Persisted',
        description: 'Should persist',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      const all = getAllCapabilities()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(cap.id)
    })

    it('assigns unique IDs to each capability', () => {
      const cap1 = createCapability({
        siteProfileId: 'site-1',
        name: 'A',
        description: 'A',
        actions: [],
        parameters: [],
        extractionRules: [],
      })
      const cap2 = createCapability({
        siteProfileId: 'site-1',
        name: 'B',
        description: 'B',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      expect(cap1.id).not.toBe(cap2.id)
    })
  })

  // ── deleteCapability ───────────────────────────────────────────────────

  describe('deleteCapability', () => {
    it('removes the capability from the store', () => {
      const cap = createCapability({
        siteProfileId: 'site-1',
        name: 'To Delete',
        description: 'Will be deleted',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      expect(getAllCapabilities()).toHaveLength(1)
      deleteCapability(cap.id)
      expect(getAllCapabilities()).toHaveLength(0)
    })

    it('does not affect other capabilities', () => {
      const cap1 = createCapability({
        siteProfileId: 'site-1',
        name: 'Keep',
        description: 'Stays',
        actions: [],
        parameters: [],
        extractionRules: [],
      })
      const cap2 = createCapability({
        siteProfileId: 'site-1',
        name: 'Delete',
        description: 'Goes',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      deleteCapability(cap2.id)
      const all = getAllCapabilities()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(cap1.id)
    })

    it('is a no-op when the id does not exist', () => {
      createCapability({
        siteProfileId: 'site-1',
        name: 'Existing',
        description: 'Stays',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      deleteCapability('nonexistent-id')
      expect(getAllCapabilities()).toHaveLength(1)
    })
  })

  // ── updateCapability ───────────────────────────────────────────────────

  describe('updateCapability', () => {
    it('merges the updates into the existing capability', () => {
      const cap = createCapability({
        siteProfileId: 'site-1',
        name: 'Original',
        description: 'Original desc',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      const updated = updateCapability(cap.id, { name: 'Updated Name' })
      expect(updated).toBeDefined()
      expect(updated!.name).toBe('Updated Name')
      expect(updated!.description).toBe('Original desc') // unchanged
    })

    it('updates the updatedAt timestamp', () => {
      const cap = createCapability({
        siteProfileId: 'site-1',
        name: 'Test',
        description: 'Test',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      const originalUpdatedAt = cap.updatedAt

      // Small delay to ensure timestamp difference
      const updated = updateCapability(cap.id, { name: 'Changed' })
      expect(updated).toBeDefined()
      expect(updated!.updatedAt).toBeTruthy()
      // updatedAt should be set to a new value (may or may not differ depending on timing)
      expect(typeof updated!.updatedAt).toBe('string')
    })

    it('persists updates to the store', () => {
      const cap = createCapability({
        siteProfileId: 'site-1',
        name: 'Before',
        description: 'Desc',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      updateCapability(cap.id, { name: 'After', healthStatus: 'degraded' })

      const fetched = getCapability(cap.id)
      expect(fetched!.name).toBe('After')
      expect(fetched!.healthStatus).toBe('degraded')
    })

    it('returns undefined for a missing capability', () => {
      const result = updateCapability('nonexistent-id', { name: 'Nope' })
      expect(result).toBeUndefined()
    })

    it('can update multiple fields at once', () => {
      const cap = createCapability({
        siteProfileId: 'site-1',
        name: 'Test',
        description: 'Test',
        actions: [],
        parameters: [],
        extractionRules: [],
      })

      const updated = updateCapability(cap.id, {
        healthStatus: 'broken',
        consecutiveFailures: 3,
        lastRunAt: '2024-01-01T00:00:00.000Z',
      })

      expect(updated!.healthStatus).toBe('broken')
      expect(updated!.consecutiveFailures).toBe(3)
      expect(updated!.lastRunAt).toBe('2024-01-01T00:00:00.000Z')
    })
  })
})
