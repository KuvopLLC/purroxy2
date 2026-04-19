import { chromium } from 'patchright'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import readline from 'node:readline'

const userDataDir = join(tmpdir(), `purroxy-spike2-${Date.now()}`)

const START_URL = 'https://www.united.com/'
const REPLAY_URL = 'https://www.united.com/en/us/mytrips'

function log(...args) { console.log('[spike2]', ...args) }

function prompt(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, (a) => { rl.close(); resolve(a) })
  })
}

async function probe(page, label) {
  const info = await page.evaluate(() => {
    const bodyText = document.body?.innerText || ''
    return {
      url: location.href,
      title: document.title,
      bodyTextSample: bodyText.slice(0, 1500),
      bodyTextLength: bodyText.length,
      sawSomethingWentWrong: /something went wrong/i.test(bodyText),
      sawAccessDenied: /access denied|pardon our interruption|reference #[0-9a-f.]+/i.test(bodyText),
      cookieNames: document.cookie.split(';').map(s => s.trim().split('=')[0]).filter(Boolean)
    }
  })
  console.log(`\n========== ${label} ==========`)
  console.log(JSON.stringify(info, null, 2))
  return info
}

async function main() {
  log('userData:', userDataDir)
  log('Launching real Chrome via Patchright...')

  // Patchright recommends launchPersistentContext + channel:'chrome' and
  // NO custom args/UA/viewport — let Chrome present as Chrome.
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: null
  })

  const page = context.pages()[0] || await context.newPage()

  log('Loading', START_URL)
  await page.goto(START_URL, { waitUntil: 'domcontentloaded' })

  log('')
  log('=========================================================')
  log('  Log in to United in the Chrome window.')
  log('  Watch for "Something went wrong" during login.')
  log('=========================================================')
  await prompt('Press ENTER here once login is complete (or the error appears): ')

  const postLogin = await probe(page, 'AFTER LOGIN')

  if (postLogin.sawSomethingWentWrong || postLogin.sawAccessDenied) {
    console.log('\n[spike2] Login phase appears blocked — Patchright + real Chrome did not beat it.')
    console.log('[spike2] Window stays open. Ctrl+C to quit.\n')
    return
  }

  log('Login probe looks clean. Attempting CDP-ish replay nav to:', REPLAY_URL)
  await page.goto(REPLAY_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  await probe(page, 'AFTER REPLAY NAV')

  console.log('\n[spike2] Window stays open for inspection. Ctrl+C to quit.\n')
}

main().catch((err) => { console.error('[spike2] error:', err); process.exit(1) })
