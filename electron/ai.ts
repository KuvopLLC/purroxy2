import { BrowserWindow, WebContentsView, ipcMain } from 'electron'
import { store } from './store'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM_PROMPT = `You are Purroxy's AI guide, helping users build browser automations called "capabilities." You are embedded in a desktop app alongside a real browser showing a website.

## Your role
1. When a user first loads a site, briefly analyze what the site offers and suggest 3-5 useful capabilities they could build.
2. Guide the user toward recording their actions. Don't be prescriptive about exact clicks — let them explore and navigate naturally.
3. After recording, analyze what was captured, name the capability, and offer to save it.
4. You will automatically figure out parameters (variable inputs) from the recording — the user does NOT need to teach you about them.

## Tone
- Concise and friendly. This is a narrow side panel — keep messages short.
- Don't micromanage navigation. Say "navigate to the reservations area" not "click the Reports tab."
- Be encouraging. The user can't go wrong during recording.
- Use proper markdown: **bold**, bullet lists with "- " on separate lines, numbered lists. Never put multiple list items on one line.

## Login handling
If the page shows login forms, suggest the user log in first, then provide the save session button. Never ask for credentials.

## Interactive buttons
Embed buttons using markers on their own line:
- {{SAVE_SESSION}} — "Save Session" button. Use after the user logs in.
- {{START_RECORDING}} — "Start Recording" button. Use when ready to demonstrate a capability.
- {{SAVE_CAPABILITY}} — "Save Capability" button. Use after analyzing a completed recording.
- {{KEEP_GOING}} — "Keep Going" button. Use alongside SAVE_CAPABILITY as an alternative — the user can save or keep building more.

IMPORTANT: Never include {{STOP_RECORDING}} — the app handles that automatically. Only use one or two buttons per message. Always place each button on its own line.

## Recording flow
When you see "[RECORDING STARTED]", the user is actively recording. Don't interrupt — they'll stop when ready.

When you see "[RECORDING STOPPED — N actions captured]", you will also receive the recorded actions as context. Analyze them:
- Give the capability a short, descriptive name
- Summarize what it does in a brief bullet list (use proper markdown bullets, one per line)
- Offer to save it with {{SAVE_CAPABILITY}} and offer {{KEEP_GOING}} as an alternative

## Awareness
You receive page content and recorded actions as context with each message. Always check what's already been recorded before giving guidance. Never ask the user to do something they've already done.`

export function setupAI(mainWindow: BrowserWindow, getSiteView: () => WebContentsView | null) {

  ipcMain.handle('ai:getPageContent', async () => {
    const siteView = getSiteView()
    if (!siteView) return ''
    try {
      return await siteView.webContents.executeJavaScript(`
        (() => {
          const title = document.title;
          const url = location.href;
          const body = document.body.innerText.slice(0, 3000);
          const forms = Array.from(document.querySelectorAll('input, select, textarea, button, a[href]')).slice(0, 50).map(el => {
            const tag = el.tagName.toLowerCase();
            const type = el.getAttribute('type') || '';
            const name = el.getAttribute('name') || '';
            const placeholder = el.getAttribute('placeholder') || '';
            const label = el.getAttribute('aria-label') || '';
            const text = (el.innerText || '').trim().slice(0, 50);
            return [tag, type, name, placeholder, label, text].filter(Boolean).join(' | ');
          });
          const navLinks = Array.from(document.querySelectorAll('nav a, [role="navigation"] a, header a')).slice(0, 20).map(a => {
            return (a.innerText || '').trim().slice(0, 50);
          }).filter(Boolean);
          return JSON.stringify({ title, url, bodyText: body, formElements: forms, navLinks });
        })()
      `)
    } catch {
      return '{}'
    }
  })

  ipcMain.handle('ai:chat', async (_event, messages: Array<{ role: string; content: string }>, pageContext?: string) => {
    const apiKey = store.get('aiApiKey')
    if (!apiKey) {
      return { error: 'No API key configured. Add your Anthropic API key in Settings.' }
    }

    let system = SYSTEM_PROMPT
    if (pageContext) {
      system += `\n\nCurrent page context:\n${pageContext}`
    }

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey as string,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system,
          messages: messages.map(m => ({ role: m.role, content: m.content }))
        })
      })

      if (!response.ok) {
        const err = await response.text()
        if (response.status === 401) {
          return { error: 'Invalid API key. Check your key in Settings.' }
        }
        return { error: `API error (${response.status}): ${err.slice(0, 200)}` }
      }

      const data = await response.json()
      return { content: data.content[0].text }
    } catch (err: any) {
      return { error: `Failed to connect: ${err.message}` }
    }
  })
}
