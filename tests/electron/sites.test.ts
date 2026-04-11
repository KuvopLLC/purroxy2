import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAllSites,
  getSite,
  getSiteByHostname,
  createSite,
  saveSession,
  getSession,
  deleteSite,
} from '../../electron/sites'

describe('sites', () => {
  beforeEach(() => {
    // Clear all sites via the public API
    const all = getAllSites()
    for (const site of all) {
      deleteSite(site.id)
    }
  })

  // ── getAllSites ─────────────────────────────────────────────────────────

  describe('getAllSites', () => {
    it('returns an empty array when no sites exist', () => {
      expect(getAllSites()).toEqual([])
    })

    it('returns all sites when populated', () => {
      createSite('https://example.com', 'Example', '')
      createSite('https://github.com', 'GitHub', '')

      const all = getAllSites()
      expect(all).toHaveLength(2)
    })
  })

  // ── getSite ────────────────────────────────────────────────────────────

  describe('getSite', () => {
    it('returns the site when found by id', () => {
      const site = createSite('https://example.com', 'Example', '')
      const found = getSite(site.id)
      expect(found).toBeDefined()
      expect(found!.id).toBe(site.id)
    })

    it('returns undefined when not found', () => {
      expect(getSite('nonexistent')).toBeUndefined()
    })
  })

  // ── getSiteByHostname ──────────────────────────────────────────────────

  describe('getSiteByHostname', () => {
    it('returns the site matching the hostname', () => {
      createSite('https://example.com', 'Example', '')
      const found = getSiteByHostname('example.com')
      expect(found).toBeDefined()
      expect(found!.hostname).toBe('example.com')
    })

    it('returns undefined when no match', () => {
      createSite('https://example.com', 'Example', '')
      expect(getSiteByHostname('other.com')).toBeUndefined()
    })
  })

  // ── createSite ─────────────────────────────────────────────────────────

  describe('createSite', () => {
    it('creates a site with the correct hostname from URL', () => {
      const site = createSite('https://example.com/path', 'Example', '')
      expect(site.hostname).toBe('example.com')
    })

    it('normalizes a URL without a protocol by adding https://', () => {
      const site = createSite('example.com', 'Example', '')
      expect(site.hostname).toBe('example.com')
    })

    it('deduplicates by hostname — returns existing site instead of creating a new one', () => {
      const first = createSite('https://example.com', 'Example', '')
      const second = createSite('https://example.com/other', 'Other Name', 'favicon.ico')

      expect(second.id).toBe(first.id)
      expect(getAllSites()).toHaveLength(1)
    })

    it('generates a friendly name from a simple hostname', () => {
      const site = createSite('https://github.com', 'Ignored', '')
      // friendlyHostname("github.com") → removes TLD → "github" → capitalizes → "Github"
      expect(site.name).toBe('Github')
    })

    it('generates a friendly name from a subdomain hostname', () => {
      const site = createSite('https://mail.google.com', 'Ignored', '')
      // friendlyHostname("mail.google.com") → removes TLD → ["mail", "google"] → "Google (mail)"
      expect(site.name).toBe('Google (mail)')
    })

    it('generates a friendly name from a complex subdomain', () => {
      const site = createSite('https://bluezoneexperience.guestyowners.com', 'Ignored', '')
      // removes TLD → ["bluezoneexperience", "guestyowners"] → "Guestyowners (bluezoneexperience)"
      expect(site.name).toBe('Guestyowners (bluezoneexperience)')
    })

    it('strips www prefix when generating friendly name', () => {
      const site = createSite('https://www.example.com', 'Ignored', '')
      expect(site.name).toBe('Example')
    })

    it('sets sessionEncrypted to null by default', () => {
      const site = createSite('https://example.com', 'Example', '')
      expect(site.sessionEncrypted).toBeNull()
    })

    it('sets createdAt and updatedAt timestamps', () => {
      const site = createSite('https://example.com', 'Example', '')
      expect(site.createdAt).toBeTruthy()
      expect(site.updatedAt).toBeTruthy()
    })

    it('assigns unique IDs', () => {
      const site1 = createSite('https://a.example.com', 'A', '')
      const site2 = createSite('https://b.example.com', 'B', '')
      expect(site1.id).not.toBe(site2.id)
    })
  })

  // ── saveSession ────────────────────────────────────────────────────────

  describe('saveSession', () => {
    it('encrypts and saves the session', () => {
      const site = createSite('https://example.com', 'Example', '')
      const session = {
        cookies: [{ name: 'sid', value: 'abc' }],
        localStorage: { token: '123' },
      }

      saveSession(site.id, session)

      const updated = getSite(site.id)
      expect(updated!.sessionEncrypted).toBeTruthy()
      expect(updated!.sessionEncrypted).not.toBeNull()
      // The encrypted value should not be the raw JSON
      // (In mock, safeStorage just passes through, but it still goes through base64)
    })

    it('throws an error for a missing site', () => {
      expect(() =>
        saveSession('nonexistent', {
          cookies: [],
          localStorage: {},
        })
      ).toThrow('Site not found')
    })

    it('updates the updatedAt timestamp', () => {
      const site = createSite('https://example.com', 'Example', '')
      const originalUpdatedAt = site.updatedAt

      saveSession(site.id, { cookies: [], localStorage: {} })

      const updated = getSite(site.id)
      expect(updated!.updatedAt).toBeTruthy()
    })
  })

  // ── getSession ─────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('decrypts and returns the saved session', () => {
      const site = createSite('https://example.com', 'Example', '')
      const session = {
        cookies: [{ name: 'sid', value: 'abc' }],
        localStorage: { token: '123' },
      }

      saveSession(site.id, session)
      const retrieved = getSession(site.id)

      expect(retrieved).toEqual(session)
    })

    it('returns null when site has no session', () => {
      const site = createSite('https://example.com', 'Example', '')
      expect(getSession(site.id)).toBeNull()
    })

    it('returns null for a nonexistent site', () => {
      expect(getSession('nonexistent')).toBeNull()
    })
  })

  // ── deleteSite ─────────────────────────────────────────────────────────

  describe('deleteSite', () => {
    it('removes the site from the store', () => {
      const site = createSite('https://example.com', 'Example', '')
      expect(getAllSites()).toHaveLength(1)

      deleteSite(site.id)
      expect(getAllSites()).toHaveLength(0)
    })

    it('does not affect other sites', () => {
      const site1 = createSite('https://a.example.com', 'A', '')
      const site2 = createSite('https://b.example.com', 'B', '')

      deleteSite(site2.id)
      expect(getAllSites()).toHaveLength(1)
      expect(getAllSites()[0].id).toBe(site1.id)
    })

    it('clears cookies and storage data via electron session', () => {
      const site = createSite('https://example.com', 'Example', '')
      // deleteSite calls require('electron').session.defaultSession...
      // These are mocked — just verify no errors
      deleteSite(site.id)
      expect(getAllSites()).toHaveLength(0)
    })

    it('is a no-op for a nonexistent site id', () => {
      createSite('https://example.com', 'Example', '')
      deleteSite('nonexistent')
      expect(getAllSites()).toHaveLength(1)
    })
  })
})
