import type { RecordedAction, Parameter } from './types'

// Cookie names from commercial bot-mitigation platforms. These embed the
// requesting client's IP/UA/TLS fingerprint at issue time; replaying them from
// a different Chromium session is exactly what they're built to detect, and
// triggers HTTP/2 RST_STREAM or challenge-page responses. Dropping them lets
// the site reissue fresh cookies on the first request of the replay session.
export const BOT_COOKIE_PATTERNS: RegExp[] = [
  /^_abck$/i, /^bm_sz$/i, /^bm_sv$/i, /^bm_mi$/i, /^bm_so$/i, /^ak_bmsc$/i, // Akamai
  /^__cf_bm$/i, /^cf_clearance$/i, /^cf_chl/i, // Cloudflare
  /^datadome$/i, // DataDome
  /^_px/i, /^pxcts$/i, // PerimeterX / HUMAN
  /^incap_ses/i, /^visid_incap/i, /^nlbi_/i, // Imperva / Incapsula
  /^KP_UIDz/i, // Kasada
  /^reese84$/i, // F5 Distributed Cloud (aka Shape Security)
]

export function isBotMitigationCookie(name: string): boolean {
  return BOT_COOKIE_PATTERNS.some(re => re.test(name))
}

export type SameSite = 'Strict' | 'Lax' | 'None'

export function normalizeSameSite(s: string | undefined): SameSite {
  if (!s) return 'Lax'
  const lower = s.toLowerCase()
  if (lower === 'strict') return 'Strict'
  if (lower === 'none' || lower === 'no_restriction') return 'None'
  return 'Lax' // "unspecified", "lax", or anything else → Lax
}

export interface NormalizedCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: SameSite
}

export interface CookieNormalizationResult {
  cookies: NormalizedCookie[]
  droppedExpired: number
  droppedCrossDomain: number
  droppedBotMitigation: number
}

export function normalizeCookiesForInjection(
  raw: Array<Record<string, unknown>>,
  targetDomain: string | undefined
): CookieNormalizationResult {
  const nowSec = Date.now() / 1000
  const targetHost = targetDomain?.toLowerCase() || ''
  let droppedExpired = 0
  let droppedCrossDomain = 0
  let droppedBotMitigation = 0

  const cookies = raw
    .filter((c: any) => c.name && c.value && c.domain) // skip malformed cookies
    .filter((c: any) => {
      if (typeof c.expires === 'number' && c.expires > 0 && c.expires < nowSec) {
        droppedExpired++
        return false
      }
      return true
    })
    .filter((c: any) => {
      if (!targetHost) return true // no target hint, keep everything (back-compat)
      const cookieHost = String(c.domain).toLowerCase().replace(/^\./, '')
      if (targetHost === cookieHost || targetHost.endsWith('.' + cookieHost)) return true
      droppedCrossDomain++
      return false
    })
    .filter((c: any) => {
      if (isBotMitigationCookie(c.name as string)) {
        droppedBotMitigation++
        return false
      }
      return true
    })
    .map((c: any): NormalizedCookie => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      secure: c.secure || false,
      httpOnly: c.httpOnly || false,
      sameSite: normalizeSameSite(c.sameSite),
    }))

  return { cookies, droppedExpired, droppedCrossDomain, droppedBotMitigation }
}

export function optimizeActions(actions: RecordedAction[]): RecordedAction[] {
  const result: RecordedAction[] = []
  let lastNavUrl = ''

  for (const action of actions) {
    // Skip wait actions — page loads naturally during replay
    if (action.type === 'wait') continue

    // Skip scroll actions with no selector — usually noise
    if (action.type === 'scroll' && (!action.selector || action.selector === 'window')) continue

    // Skip duplicate consecutive navigations
    if (action.type === 'navigate' && action.url === lastNavUrl) continue

    if (action.type === 'navigate') lastNavUrl = action.url || ''
    else lastNavUrl = ''

    result.push(action)
  }
  return result
}

export type ActionLogger = (msg: string) => void

export function substituteParams(
  actions: RecordedAction[],
  parameters: Parameter[],
  paramValues: Record<string, string>,
  log: ActionLogger
): RecordedAction[] {
  return actions.map((action, idx) => {
    const param = parameters.find(p => p.actionIndex === idx)
    if (!param) return action
    const newValue = paramValues[param.name] ?? param.defaultValue

    if (param.field === 'url' && action.url) {
      // For URL params: replace the default value within the URL, not the whole URL
      const originalUrl = action.url
      if (originalUrl.includes(param.defaultValue)) {
        const substituted = originalUrl.replace(param.defaultValue, newValue)
        log(`Param substitution at action ${idx}: ${param.name} = "${newValue}" (in URL)`)
        return { ...action, url: substituted }
      } else {
        // Default value not found in URL — append or skip
        log(`Param substitution at action ${idx}: ${param.name} — default "${param.defaultValue}" not found in URL, skipping`)
        return action
      }
    }

    if (param.field === 'value' && action.value) {
      // For value params: replace the default value within the value, or full replace
      const originalValue = action.value
      if (originalValue.includes(param.defaultValue)) {
        const substituted = originalValue.replace(param.defaultValue, newValue)
        log(`Param substitution at action ${idx}: ${param.name} = "${newValue}" (in value)`)
        return { ...action, value: substituted }
      }
    }

    log(`Param substitution at action ${idx}: ${param.name} = "${newValue}"`)
    return { ...action, [param.field]: newValue }
  })
}
