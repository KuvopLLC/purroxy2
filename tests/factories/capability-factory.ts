/**
 * Factory for building CapabilityData test objects.
 *
 * Returns a complete, valid capability with sensible defaults.
 * Pass overrides to customize individual fields.
 */

interface CapabilityParameter {
  name: string
  description: string
  actionIndex: number
  field: 'value' | 'url'
  defaultValue: string
  required: boolean
}

interface CapabilityExtractionRule {
  name: string
  selector: string
  attribute: string
  multiple: boolean
  sensitive: boolean
}

interface RecordedAction {
  type: 'click' | 'type' | 'navigate' | 'select' | 'scroll' | 'wait'
  timestamp: number
  selector?: string
  locators?: Array<{ strategy: string; value: string }>
  tagName?: string
  label?: string
  value?: string
  url?: string
  sensitive?: boolean
  intent?: string
}

export interface CapabilityData {
  id: string
  siteProfileId: string
  name: string
  description: string
  actions: RecordedAction[]
  parameters: CapabilityParameter[]
  extractionRules: CapabilityExtractionRule[]
  preferredEngine: string
  healthStatus: string
  consecutiveFailures: number
  lastRunAt: string | null
  lastSuccessAt: string | null
  createdAt: string
  updatedAt: string
}

export function buildCapability(overrides: Partial<CapabilityData> = {}): CapabilityData {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    siteProfileId: 'site-1',
    name: 'Test Capability',
    description: 'A test capability',
    actions: [],
    parameters: [],
    extractionRules: [],
    preferredEngine: 'playwright',
    healthStatus: 'healthy',
    consecutiveFailures: 0,
    lastRunAt: null,
    lastSuccessAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/**
 * Build a capability with a basic navigate-and-click action sequence.
 */
export function buildCapabilityWithActions(overrides: Partial<CapabilityData> = {}): CapabilityData {
  return buildCapability({
    actions: [
      { type: 'navigate', url: 'https://example.com', timestamp: Date.now() },
      { type: 'click', selector: '#submit', tagName: 'BUTTON', label: 'Submit', timestamp: Date.now() },
    ],
    ...overrides,
  })
}

/**
 * Build a capability that includes extraction rules.
 */
export function buildCapabilityWithExtraction(overrides: Partial<CapabilityData> = {}): CapabilityData {
  return buildCapability({
    actions: [
      { type: 'navigate', url: 'https://example.com', timestamp: Date.now() },
    ],
    extractionRules: [
      { name: 'title', selector: 'h1', attribute: 'text', multiple: false, sensitive: false },
      { name: 'links', selector: 'a', attribute: 'href', multiple: true, sensitive: false },
    ],
    ...overrides,
  })
}
