/**
 * Helpers for controlling the global fetch mock.
 *
 * Works with the global fetch mock installed by electron-mocks.ts,
 * or can be used standalone by calling resetFetchMock() in beforeEach.
 */
import { vi } from 'vitest'

// ── Helpers ────────────────────────────────────────────────────────────────

function createResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Set a single response that fetch always returns.
 */
export function mockFetchResponse(status: number, body: any): void {
  const mock = globalThis.fetch as ReturnType<typeof vi.fn>
  mock.mockResolvedValue(createResponse(status, body))
}

/**
 * Queue a sequence of responses. Each call to fetch pops the next one.
 * After all queued responses are consumed, subsequent calls return 200 {}.
 */
export function mockFetchSequence(responses: Array<{ status: number; body: any }>): void {
  const mock = globalThis.fetch as ReturnType<typeof vi.fn>
  const queue = responses.map(r => createResponse(r.status, r.body))

  mock.mockImplementation(async () => {
    if (queue.length > 0) {
      return queue.shift()!
    }
    return createResponse(200, {})
  })
}

/**
 * Get the URL and options from the most recent fetch call.
 * Returns undefined if fetch has not been called.
 */
export function getLastFetchCall(): { url: string; options?: RequestInit } | undefined {
  const mock = globalThis.fetch as ReturnType<typeof vi.fn>
  const calls = mock.mock.calls
  if (calls.length === 0) return undefined

  const last = calls[calls.length - 1]
  return {
    url: last[0] as string,
    options: last[1] as RequestInit | undefined,
  }
}

/**
 * Get all fetch calls as an array of { url, options }.
 */
export function getAllFetchCalls(): Array<{ url: string; options?: RequestInit }> {
  const mock = globalThis.fetch as ReturnType<typeof vi.fn>
  return mock.mock.calls.map((call: any[]) => ({
    url: call[0] as string,
    options: call[1] as RequestInit | undefined,
  }))
}

/**
 * Reset the fetch mock to default behavior (returns 200 {}).
 */
export function resetFetchMock(): void {
  const mock = globalThis.fetch as ReturnType<typeof vi.fn>
  mock.mockReset()
  mock.mockResolvedValue(createResponse(200, {}))
}
