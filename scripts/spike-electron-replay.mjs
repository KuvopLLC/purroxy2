import { app, BrowserWindow } from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import readline from 'node:readline'

const userDataDir = join(tmpdir(), `purroxy-spike-${Date.now()}`)
app.setPath('userData', userDataDir)

const START_URL = 'https://www.united.com/'
const REPLAY_URL = 'https://www.united.com/en/us/mytrips'

function log(...args) { console.log('[spike]', ...args) }

function prompt(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, (a) => { rl.close(); resolve(a) })
  })
}

function waitForCdpEvent(dbg, method, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { dbg.off('message', listener); resolve({ timedOut: true }) }, timeoutMs)
    const listener = (_e, m, params) => {
      if (m === method) { clearTimeout(timer); dbg.off('message', listener); resolve({ params }) }
    }
    dbg.on('message', listener)
  })
}

app.whenReady().then(async () => {
  log('userData:', userDataDir)

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:spike'
    }
  })

  const wc = win.webContents

  // Strip the "Electron/x.y.z" token from the UA. Keep Chrome version + TLS
  // stack real — that's the whole point of this spike. Don't freeze a fake
  // Chrome version string (that was the old replay mistake).
  const ua = wc.getUserAgent().replace(/\s*Electron\/\S+/i, '').replace(/\s*purroxy\/\S+/i, '')
  wc.setUserAgent(ua)
  log('UA:', ua)

  log('Loading', START_URL)
  await wc.loadURL(START_URL)

  log('')
  log('=========================================================')
  log('  Log in to United in the browser window.')
  log('  Navigate around normally. Do NOT close the window.')
  log('=========================================================')
  await prompt('Press ENTER here once you are logged in and on any United page: ')

  log('Attaching debugger...')
  try { wc.debugger.attach('1.3') }
  catch (err) { log('attach failed:', err); app.quit(); return }

  const dbg = wc.debugger
  const responses = []
  const frameErrors = []
  dbg.on('message', (_e, method, params) => {
    if (method === 'Network.responseReceived' && params.type === 'Document') {
      responses.push({ status: params.response.status, url: params.response.url })
    }
    if (method === 'Page.frameNavigated' && params.frame.parentId === undefined) {
      // top frame only
    }
    if (method === 'Network.loadingFailed') {
      frameErrors.push({ url: params.request?.url, error: params.errorText })
    }
  })

  await dbg.sendCommand('Page.enable')
  await dbg.sendCommand('Runtime.enable')
  await dbg.sendCommand('Network.enable')

  log('Navigating via CDP to:', REPLAY_URL)
  const loadWait = waitForCdpEvent(dbg, 'Page.loadEventFired', 25000)
  await dbg.sendCommand('Page.navigate', { url: REPLAY_URL })
  const loadResult = await loadWait
  log(loadResult.timedOut ? 'load timed out after 25s (continuing anyway)' : 'Page.loadEventFired')

  // Give client-rendered content time to hydrate / challenge scripts to run
  await new Promise((r) => setTimeout(r, 4000))

  const probe = await dbg.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const html = document.documentElement?.outerHTML || ''
      const bodyText = document.body?.innerText || ''
      return {
        url: location.href,
        title: document.title,
        bodyTextSample: bodyText.slice(0, 1500),
        bodyTextLength: bodyText.length,
        looksLikeAkamaiBlock:
          /access denied|pardon our interruption|reference #[0-9a-f.]+/i.test(bodyText) ||
          /akamai/i.test(html.slice(0, 5000)),
        looksLikeLoginWall: /sign in|log in|mileageplus number/i.test(bodyText) && !/my trips|upcoming/i.test(bodyText),
        cookieNames: document.cookie.split(';').map(s => s.trim().split('=')[0]).filter(Boolean)
      }
    })()`,
    returnByValue: true
  })

  console.log('\n========== SPIKE RESULT ==========')
  console.log(JSON.stringify(probe.result?.value ?? probe, null, 2))
  console.log('\n========== TOP-FRAME RESPONSES ==========')
  console.log(JSON.stringify(responses.slice(0, 15), null, 2))
  if (frameErrors.length) {
    console.log('\n========== LOADING FAILURES ==========')
    console.log(JSON.stringify(frameErrors.slice(0, 10), null, 2))
  }
  console.log('\nWindow stays open for manual inspection. Ctrl+C in terminal to exit.\n')
})

app.on('window-all-closed', () => app.quit())
