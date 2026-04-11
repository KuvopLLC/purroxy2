/**
 * Factories for building RecordedAction test objects by type.
 *
 * Each builder returns a complete action with sensible defaults.
 * Pass overrides to customize individual fields.
 */

interface Locator {
  strategy: 'css' | 'testid' | 'role' | 'text' | 'aria' | 'placeholder' | 'nearby'
  value: string
  name?: string
  attr?: string
  tag?: string
}

interface RecordedAction {
  type: 'click' | 'type' | 'navigate' | 'select' | 'scroll' | 'wait'
  timestamp: number
  selector?: string
  locators?: Locator[]
  tagName?: string
  label?: string
  value?: string
  url?: string
  sensitive?: boolean
  intent?: string
}

// ── Click ──────────────────────────────────────────────────────────────────

export function buildClickAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return {
    type: 'click',
    selector: '#btn',
    locators: [{ strategy: 'css', value: '#btn' }],
    tagName: 'BUTTON',
    label: 'Submit',
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── Type ───────────────────────────────────────────────────────────────────

export function buildTypeAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return {
    type: 'type',
    selector: '#input',
    locators: [{ strategy: 'css', value: '#input' }],
    value: 'test',
    label: 'Search',
    tagName: 'INPUT',
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── Navigate ───────────────────────────────────────────────────────────────

export function buildNavigateAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return {
    type: 'navigate',
    url: 'https://example.com',
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── Select ─────────────────────────────────────────────────────────────────

export function buildSelectAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return {
    type: 'select',
    selector: '#dropdown',
    locators: [{ strategy: 'css', value: '#dropdown' }],
    value: 'option1',
    label: 'Filter',
    tagName: 'SELECT',
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── Scroll ─────────────────────────────────────────────────────────────────

export function buildScrollAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return {
    type: 'scroll',
    selector: 'window',
    value: '500',
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── Wait ───────────────────────────────────────────────────────────────────

export function buildWaitAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return {
    type: 'wait',
    selector: '#loading',
    locators: [{ strategy: 'css', value: '#loading' }],
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── Sequence builder ───────────────────────────────────────────────────────

/**
 * Build a typical action sequence: navigate, type into a field, click submit.
 */
export function buildTypicalSequence(): RecordedAction[] {
  const now = Date.now()
  return [
    buildNavigateAction({ timestamp: now }),
    buildTypeAction({ timestamp: now + 1000 }),
    buildClickAction({ timestamp: now + 2000 }),
  ]
}

/**
 * Build a sensitive action (e.g. typing a password).
 */
export function buildSensitiveTypeAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return buildTypeAction({
    selector: '#password',
    locators: [{ strategy: 'css', value: '#password' }],
    label: 'Password',
    sensitive: true,
    value: '••••••',
    tagName: 'INPUT',
    ...overrides,
  })
}
