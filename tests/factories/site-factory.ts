/**
 * Factory for building SiteProfile test objects.
 *
 * Returns a complete, valid site profile with sensible defaults.
 * Pass overrides to customize individual fields.
 */

export interface SiteProfile {
  id: string
  url: string
  hostname: string
  name: string
  faviconUrl: string
  sessionEncrypted: string | null
  createdAt: string
  updatedAt: string
}

export function buildSite(overrides: Partial<SiteProfile> = {}): SiteProfile {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    url: 'https://example.com',
    hostname: 'example.com',
    name: 'Example',
    faviconUrl: '',
    sessionEncrypted: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/**
 * Build a site with a pre-populated encrypted session.
 */
export function buildSiteWithSession(overrides: Partial<SiteProfile> = {}): SiteProfile {
  return buildSite({
    sessionEncrypted: 'encrypted-session-data',
    ...overrides,
  })
}

/**
 * Build a list of N sites with unique hostnames.
 */
export function buildSiteList(count: number, overrides: Partial<SiteProfile> = {}): SiteProfile[] {
  return Array.from({ length: count }, (_, i) =>
    buildSite({
      url: `https://site-${i + 1}.example.com`,
      hostname: `site-${i + 1}.example.com`,
      name: `Site ${i + 1}`,
      ...overrides,
    })
  )
}
