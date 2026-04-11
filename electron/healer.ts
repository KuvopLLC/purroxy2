import { ipcMain } from 'electron'
import { store } from './store'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const HEAL_SYSTEM_PROMPT = `You are a browser automation repair tool. An automated workflow step failed because the target element's selectors broke (the website changed its HTML).

Given the step's intent, label, original locators, and a compact DOM snapshot of the current page, find the element the user originally meant to interact with.

Rules:
- Return ONLY a JSON object: {"selector": "css-selector-here", "confidence": "high"|"medium"|"low", "reasoning": "one sentence"}
- The CSS selector must be valid for document.querySelector()
- Prefer selectors using id, data-testid, role+aria-label, or name attributes
- Fall back to structural selectors only if semantic ones are impossible
- If you genuinely cannot find the element, return {"selector": null, "confidence": "none", "reasoning": "why"}
- Do NOT guess wildly — a wrong click is worse than skipping`

export interface HealContext {
  intent: string
  label: string
  tagName: string
  originalLocators: Array<{ strategy: string; value: string }>
  domSnapshot: string
  actionType: string
  pageUrl: string
}

export interface HealResult {
  selector: string | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  reasoning: string
}

export async function healSelector(
  apiKey: string,
  context: HealContext
): Promise<HealResult | null> {
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: HEAL_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Step intent: ${context.intent}
Label: ${context.label}
Element tag: ${context.tagName}
Action type: ${context.actionType}
Page URL: ${context.pageUrl}

Original locators that all failed:
${context.originalLocators.map(l => `  ${l.strategy}: ${l.value}`).join('\n')}

Current page DOM:
${context.domSnapshot}`
        }]
      })
    })

    if (!response.ok) return null

    const data = await response.json()
    const text = data.content[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    return JSON.parse(jsonMatch[0]) as HealResult
  } catch {
    return null
  }
}

export function setupHealer() {
  ipcMain.handle('ai:healSelector', async (_event, context: HealContext) => {
    const apiKey = store.get('aiApiKey') as string
    if (!apiKey) return { error: 'No API key' }

    const result = await healSelector(apiKey, context)
    return result ? { result } : { error: 'Could not heal selector' }
  })
}
