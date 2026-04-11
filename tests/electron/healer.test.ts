import { describe, it, expect, vi, beforeEach } from 'vitest'
import { healSelector, setupHealer, HealContext, HealResult } from '../../electron/healer'
import { store } from '../../electron/store'
import { getRegisteredHandler, clearRegisteredHandlers } from '../setup/electron-mocks'

const MOCK_CONTEXT: HealContext = {
  intent: 'Click the submit button',
  label: 'Submit',
  tagName: 'BUTTON',
  originalLocators: [
    { strategy: 'css', value: '#old-submit-btn' },
    { strategy: 'testid', value: 'submit' },
  ],
  domSnapshot: '<div><button id="new-submit-btn" class="primary">Submit</button></div>',
  actionType: 'click',
  pageUrl: 'https://example.com/form',
}

describe('healer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearRegisteredHandlers()
  })

  // ── healSelector ───────────────────────────────────────────────────────

  describe('healSelector', () => {
    it('returns a HealResult on successful API response', async () => {
      const healResponse: HealResult = {
        selector: '#new-submit-btn',
        confidence: 'high',
        reasoning: 'Found button with matching text and role',
      }

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ text: JSON.stringify(healResponse) }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await healSelector('sk-test-key', MOCK_CONTEXT)
      expect(result).toEqual(healResponse)
      expect(result!.selector).toBe('#new-submit-btn')
      expect(result!.confidence).toBe('high')
      expect(result!.reasoning).toBe('Found button with matching text and role')
    })

    it('parses JSON embedded in text response', async () => {
      const responseText = 'Here is the result: {"selector": ".btn-primary", "confidence": "medium", "reasoning": "Matched by class"} end'

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ text: responseText }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await healSelector('sk-test-key', MOCK_CONTEXT)
      expect(result).toBeDefined()
      expect(result!.selector).toBe('.btn-primary')
      expect(result!.confidence).toBe('medium')
    })

    it('returns null on API error (non-200 status)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = await healSelector('sk-test-key', MOCK_CONTEXT)
      expect(result).toBeNull()
    })

    it('returns null when response contains no JSON', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ text: 'I could not find any matching element on the page.' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await healSelector('sk-test-key', MOCK_CONTEXT)
      expect(result).toBeNull()
    })

    it('returns null on fetch failure (network error)', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'))

      const result = await healSelector('sk-test-key', MOCK_CONTEXT)
      expect(result).toBeNull()
    })

    it('returns null when JSON is malformed', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ text: '{broken json' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await healSelector('sk-test-key', MOCK_CONTEXT)
      expect(result).toBeNull()
    })

    it('handles a "none" confidence response (element not found)', async () => {
      const healResponse: HealResult = {
        selector: null,
        confidence: 'none',
        reasoning: 'No matching element found in DOM',
      }

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ text: JSON.stringify(healResponse) }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await healSelector('sk-test-key', MOCK_CONTEXT)
      expect(result).toEqual(healResponse)
      expect(result!.selector).toBeNull()
      expect(result!.confidence).toBe('none')
    })

    it('handles "low" confidence response', async () => {
      const healResponse: HealResult = {
        selector: 'button:nth-child(3)',
        confidence: 'low',
        reasoning: 'Structural match only, no semantic attributes',
      }

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ text: JSON.stringify(healResponse) }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await healSelector('sk-test-key', MOCK_CONTEXT)
      expect(result!.confidence).toBe('low')
      expect(result!.selector).toBe('button:nth-child(3)')
    })

    it('sends the correct request body to the API', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ text: '{"selector": "#btn", "confidence": "high", "reasoning": "ok"}' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      await healSelector('sk-test-key', MOCK_CONTEXT)

      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'sk-test-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      )

      const callBody = JSON.parse(
        (vi.mocked(globalThis.fetch).mock.calls[0][1] as any).body
      )
      expect(callBody.model).toBe('claude-sonnet-4-20250514')
      expect(callBody.max_tokens).toBe(256)
      expect(callBody.messages[0].content).toContain('Click the submit button')
      expect(callBody.messages[0].content).toContain('#old-submit-btn')
    })
  })

  // ── IPC: ai:healSelector ──────────────────────────────────────────────

  describe('setupHealer IPC', () => {
    beforeEach(() => {
      setupHealer()
    })

    function callHandler(channel: string, ...args: any[]) {
      const handler = getRegisteredHandler(channel)
      if (!handler) throw new Error(`No handler registered for ${channel}`)
      return handler({}, ...args)
    }

    it('returns error when no API key is set', async () => {
      store.set('aiApiKey', '')
      const result = await callHandler('ai:healSelector', MOCK_CONTEXT)
      expect(result.error).toBe('No API key')
    })

    it('returns result on successful heal', async () => {
      store.set('aiApiKey', 'sk-test-key')

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ text: '{"selector": "#healed", "confidence": "high", "reasoning": "found it"}' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await callHandler('ai:healSelector', MOCK_CONTEXT)
      expect(result.result).toEqual({
        selector: '#healed',
        confidence: 'high',
        reasoning: 'found it',
      })
    })

    it('returns error when heal fails', async () => {
      store.set('aiApiKey', 'sk-test-key')

      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('API down'))

      const result = await callHandler('ai:healSelector', MOCK_CONTEXT)
      expect(result.error).toBe('Could not heal selector')
    })
  })
})
