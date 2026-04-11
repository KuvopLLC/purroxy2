/**
 * Factory functions for Playwright mock objects.
 *
 * These are NOT vi.mock calls — test files should vi.mock('playwright') and
 * use these factories to build the return values. This keeps the mocks
 * composable and avoids import-order issues.
 */
import { vi } from 'vitest'

// ── Helpers ────────────────────────────────────────────────────────────────

function createLocatorLike() {
  const click = vi.fn().mockResolvedValue(undefined)
  const fill = vi.fn().mockResolvedValue(undefined)
  const textContent = vi.fn().mockResolvedValue('')
  const innerText = vi.fn().mockResolvedValue('')
  const inputValue = vi.fn().mockResolvedValue('')
  const isVisible = vi.fn().mockResolvedValue(true)
  const isEnabled = vi.fn().mockResolvedValue(true)
  const count = vi.fn().mockResolvedValue(1)
  const waitFor = vi.fn().mockResolvedValue(undefined)

  const locator = {
    click,
    fill,
    textContent,
    innerText,
    inputValue,
    isVisible,
    isEnabled,
    count,
    waitFor,
    first: () => ({ click, fill, textContent, innerText, inputValue, isVisible, isEnabled }),
  }
  return locator
}

// ── Page ───────────────────────────────────────────────────────────────────

export function createMockPage() {
  const locatorLike = createLocatorLike()

  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(''),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForNavigation: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    getByTestId: vi.fn().mockReturnValue(locatorLike),
    getByRole: vi.fn().mockReturnValue(locatorLike),
    getByText: vi.fn().mockReturnValue(locatorLike),
    getByLabel: vi.fn().mockReturnValue(locatorLike),
    getByPlaceholder: vi.fn().mockReturnValue(locatorLike),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockResolvedValue('Example Page'),
    selectOption: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue({
      ...locatorLike,
      first: () => ({ click: vi.fn().mockResolvedValue(undefined), fill: vi.fn().mockResolvedValue(undefined) }),
    }),
    content: vi.fn().mockResolvedValue('<html></html>'),
    setDefaultTimeout: vi.fn(),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
    off: vi.fn(),
    isClosed: vi.fn().mockReturnValue(false),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    mouse: {
      click: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
    },
  }

  return page
}

export type MockPage = ReturnType<typeof createMockPage>

// ── Context ────────────────────────────────────────────────────────────────

export function createMockContext(mockPage?: MockPage) {
  const page = mockPage ?? createMockPage()

  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    cookies: vi.fn().mockResolvedValue([]),
    addCookies: vi.fn().mockResolvedValue(undefined),
    clearCookies: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    storageState: vi.fn().mockResolvedValue({ cookies: [], origins: [] }),
  }

  return context
}

export type MockContext = ReturnType<typeof createMockContext>

// ── Browser ────────────────────────────────────────────────────────────────

export function createMockBrowser(mockContext?: MockContext) {
  const context = mockContext ?? createMockContext()

  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    on: vi.fn(),
    contexts: vi.fn().mockReturnValue([context]),
  }

  return browser
}

export type MockBrowser = ReturnType<typeof createMockBrowser>
