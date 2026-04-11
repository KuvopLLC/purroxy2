import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRegisteredHandler, clearRegisteredHandlers } from '../setup/electron-mocks'
import { BrowserWindow, WebContentsView } from 'electron'

// ── Mock store ───────────────────────────────────────────────────────────

const mockStoreGet = vi.fn()
vi.mock('../../electron/store', () => ({
  store: {
    get: (...args: any[]) => mockStoreGet(...args),
    set: vi.fn(),
    store: {},
  },
}))

// Import after mocks
import { setupAI } from '../../electron/ai'

function createMockMainWindow() {
  return {
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    },
    on: vi.fn(),
    once: vi.fn(),
  } as unknown as BrowserWindow
}

function createMockSiteView() {
  return {
    webContents: {
      executeJavaScript: vi.fn().mockResolvedValue(JSON.stringify({
        title: 'Test Page',
        url: 'https://example.com',
        bodyText: 'Hello World',
        formElements: [],
        navLinks: [],
      })),
      getURL: vi.fn().mockReturnValue('https://example.com'),
    },
  } as unknown as WebContentsView
}

describe('electron/ai', () => {
  let mainWindow: BrowserWindow
  let siteView: WebContentsView | null

  beforeEach(() => {
    clearRegisteredHandlers()
    vi.clearAllMocks()
    mainWindow = createMockMainWindow()
    siteView = createMockSiteView()
    mockStoreGet.mockReturnValue('sk-ant-test-key')

    // Reset global fetch mock
    ;(globalThis.fetch as any).mockReset()
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    setupAI(mainWindow, () => siteView)
  })

  // ── ai:getPageContent ─────────────────────────────────────────────────

  describe('ai:getPageContent', () => {
    it('returns page content from siteView', async () => {
      const handler = getRegisteredHandler('ai:getPageContent')!
      const result = await handler({})

      expect(result).toContain('Test Page')
      expect(siteView!.webContents.executeJavaScript).toHaveBeenCalled()
    })

    it('returns empty string when no siteView', async () => {
      siteView = null
      setupAI(mainWindow, () => null)

      // Re-get handler after re-setup (but since IPC handlers are global,
      // the latest registered one is used)
      clearRegisteredHandlers()
      setupAI(mainWindow, () => null)

      const handler = getRegisteredHandler('ai:getPageContent')!
      const result = await handler({})

      expect(result).toBe('')
    })

    it('returns empty object string on executeJavaScript error', async () => {
      const brokenView = {
        webContents: {
          executeJavaScript: vi.fn().mockRejectedValue(new Error('Navigation')),
        },
      } as unknown as WebContentsView

      clearRegisteredHandlers()
      setupAI(mainWindow, () => brokenView)

      const handler = getRegisteredHandler('ai:getPageContent')!
      const result = await handler({})
      expect(result).toBe('{}')
    })
  })

  // ── ai:chat ───────────────────────────────────────────────────────────

  describe('ai:chat', () => {
    it('returns error when no API key is configured', async () => {
      mockStoreGet.mockReturnValue('')
      clearRegisteredHandlers()
      setupAI(mainWindow, () => siteView)

      const handler = getRegisteredHandler('ai:chat')!
      const result = await handler({}, [{ role: 'user', content: 'hello' }])

      expect(result.error).toContain('No API key')
    })

    it('returns error when API key is null', async () => {
      mockStoreGet.mockReturnValue(null)
      clearRegisteredHandlers()
      setupAI(mainWindow, () => siteView)

      const handler = getRegisteredHandler('ai:chat')!
      const result = await handler({}, [{ role: 'user', content: 'hello' }])

      expect(result.error).toContain('No API key')
    })

    it('calls Anthropic API with correct parameters', async () => {
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: 'Hello! I am the AI guide.' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }), { status: 200 })
      )

      const handler = getRegisteredHandler('ai:chat')!
      const messages = [{ role: 'user', content: 'Hi' }]
      await handler({}, messages, 'page context here')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      )

      // Verify body contains system prompt with page context
      const callArgs = (globalThis.fetch as any).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.system).toContain('Purroxy')
      expect(body.system).toContain('page context here')
      expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }])
    })

    it('returns content and usage on successful API call', async () => {
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: 'AI response text' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }), { status: 200 })
      )

      const handler = getRegisteredHandler('ai:chat')!
      const result = await handler({}, [{ role: 'user', content: 'hello' }])

      expect(result.content).toBe('AI response text')
      expect(result.usage).toEqual({ input: 100, output: 50 })
    })

    it('returns content without usage when API omits it', async () => {
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: 'No usage data' }],
        }), { status: 200 })
      )

      const handler = getRegisteredHandler('ai:chat')!
      const result = await handler({}, [{ role: 'user', content: 'hello' }])

      expect(result.content).toBe('No usage data')
      expect(result.usage).toBeUndefined()
    })

    it('returns invalid API key error on 401', async () => {
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response('Unauthorized', { status: 401 })
      )

      const handler = getRegisteredHandler('ai:chat')!
      const result = await handler({}, [{ role: 'user', content: 'hello' }])

      expect(result.error).toContain('Invalid API key')
    })

    it('returns generic API error on non-200, non-401 status', async () => {
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response('Rate limited', { status: 429 })
      )

      const handler = getRegisteredHandler('ai:chat')!
      const result = await handler({}, [{ role: 'user', content: 'hello' }])

      expect(result.error).toContain('API error (429)')
      expect(result.error).toContain('Rate limited')
    })

    it('returns connection failure error on fetch throw', async () => {
      ;(globalThis.fetch as any).mockRejectedValue(new Error('Network offline'))

      const handler = getRegisteredHandler('ai:chat')!
      const result = await handler({}, [{ role: 'user', content: 'hello' }])

      expect(result.error).toContain('Failed to connect')
      expect(result.error).toContain('Network offline')
    })

    it('does not include page context in system prompt when not provided', async () => {
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: 'response' }],
        }), { status: 200 })
      )

      const handler = getRegisteredHandler('ai:chat')!
      await handler({}, [{ role: 'user', content: 'hello' }])

      const callArgs = (globalThis.fetch as any).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.system).not.toContain('Current page context')
    })
  })

  // ── ai:generateCapability ─────────────────────────────────────────────

  describe('ai:generateCapability', () => {
    it('returns error when no API key is configured', async () => {
      mockStoreGet.mockReturnValue('')
      clearRegisteredHandlers()
      setupAI(mainWindow, () => siteView)

      const handler = getRegisteredHandler('ai:generateCapability')!
      const result = await handler({}, [], [])

      expect(result.error).toContain('No API key')
    })

    it('returns parsed capability on successful JSON response', async () => {
      const capabilityJson = {
        name: 'Search Products',
        description: 'Search for products on the site',
        parameters: [{ name: 'query', description: 'Search term', actionIndex: 1, field: 'value', defaultValue: 'test', required: true }],
        extractionRules: [],
        intents: ['Navigate to homepage', 'Type search query'],
      }

      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: JSON.stringify(capabilityJson) }],
          usage: { input_tokens: 200, output_tokens: 300 },
        }), { status: 200 })
      )

      const handler = getRegisteredHandler('ai:generateCapability')!
      const result = await handler(
        {},
        [{ type: 'navigate', url: 'https://example.com' }],
        [{ role: 'user', content: 'Build a search' }]
      )

      expect(result.capability).toEqual(capabilityJson)
      expect(result.usage).toEqual({ input: 200, output: 300 })
    })

    it('extracts JSON from markdown code block', async () => {
      const capabilityJson = {
        name: 'Login',
        description: 'Log into the site',
        parameters: [],
        extractionRules: [],
        intents: ['Navigate to login page'],
      }

      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: '```json\n' + JSON.stringify(capabilityJson) + '\n```' }],
          usage: { input_tokens: 100, output_tokens: 200 },
        }), { status: 200 })
      )

      const handler = getRegisteredHandler('ai:generateCapability')!
      const result = await handler({}, [], [])

      expect(result.capability).toEqual(capabilityJson)
    })

    it('extracts JSON from generic code block (no language tag)', async () => {
      const capabilityJson = {
        name: 'Test',
        description: 'test',
        parameters: [],
        extractionRules: [],
        intents: [],
      }

      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: '```\n' + JSON.stringify(capabilityJson) + '\n```' }],
        }), { status: 200 })
      )

      const handler = getRegisteredHandler('ai:generateCapability')!
      const result = await handler({}, [], [])

      expect(result.capability).toEqual(capabilityJson)
    })

    it('returns error on JSON parse failure', async () => {
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: 'This is not JSON at all, just text.' }],
        }), { status: 200 })
      )

      const handler = getRegisteredHandler('ai:generateCapability')!
      const result = await handler({}, [], [])

      expect(result.error).toContain('Failed to generate capability')
    })

    it('returns error on API failure', async () => {
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response('Internal Server Error', { status: 500 })
      )

      const handler = getRegisteredHandler('ai:generateCapability')!
      const result = await handler({}, [], [])

      expect(result.error).toContain('API error (500)')
    })

    it('returns error on network failure', async () => {
      ;(globalThis.fetch as any).mockRejectedValue(new Error('ECONNREFUSED'))

      const handler = getRegisteredHandler('ai:generateCapability')!
      const result = await handler({}, [], [])

      expect(result.error).toContain('Failed to generate capability')
      expect(result.error).toContain('ECONNREFUSED')
    })

    it('passes recent chat history in context', async () => {
      const capJson = { name: 'Test', description: '', parameters: [], extractionRules: [], intents: [] }
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: JSON.stringify(capJson) }],
        }), { status: 200 })
      )

      const chatHistory = [
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'msg2' },
        { role: 'user', content: 'msg3' },
        { role: 'assistant', content: 'msg4' },
        { role: 'user', content: 'msg5' },
        { role: 'assistant', content: 'msg6' },
        { role: 'user', content: 'msg7' },
        { role: 'assistant', content: 'msg8' },
      ]

      const handler = getRegisteredHandler('ai:generateCapability')!
      await handler({}, [{ type: 'click' }], chatHistory)

      const callArgs = (globalThis.fetch as any).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      const userContent = body.messages[0].content

      // Should only include last 6 messages
      expect(userContent).toContain('msg3')
      expect(userContent).toContain('msg8')
      // Should NOT include the first 2
      expect(userContent).not.toContain('msg1')
      expect(userContent).not.toContain('msg2')
    })

    it('sends actions as JSON in the request', async () => {
      const capJson = { name: 'Test', description: '', parameters: [], extractionRules: [], intents: [] }
      ;(globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          content: [{ text: JSON.stringify(capJson) }],
        }), { status: 200 })
      )

      const actions = [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'click', selector: '#btn' },
      ]

      const handler = getRegisteredHandler('ai:generateCapability')!
      await handler({}, actions, [])

      const callArgs = (globalThis.fetch as any).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.messages[0].content).toContain('navigate')
      expect(body.messages[0].content).toContain('#btn')
    })
  })

  // ── Handler registration ──────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC handlers', () => {
      expect(getRegisteredHandler('ai:getPageContent')).toBeDefined()
      expect(getRegisteredHandler('ai:chat')).toBeDefined()
      expect(getRegisteredHandler('ai:generateCapability')).toBeDefined()
    })
  })
})
