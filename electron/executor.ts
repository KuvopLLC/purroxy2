import { ipcMain, BrowserWindow } from 'electron'
import { getCapability, updateCapability } from './capabilities'
import { getSite, getSession } from './sites'
import { PlaywrightEngine } from '../core/browser/playwright-engine'
import type { ExecutionResult } from '../core/browser/types'
import { isLicenseValid } from './account'

export function setupExecutor(mainWindow: BrowserWindow) {

  ipcMain.handle('executor:test', async (_event, capabilityId: string, paramValues: Record<string, string> = {}, options: { visible?: boolean } = {}) => {
    if (!isLicenseValid()) {
      return {
        success: false,
        error: 'Your free trial has ended. Subscribe or share a capability for free access.',
        errorType: 'license',
        data: {},
        durationMs: 0,
        log: ['License check failed']
      }
    }

    const cap = getCapability(capabilityId)
    if (!cap) return { success: false, error: 'Capability not found', data: {}, durationMs: 0, log: [] }

    const site = getSite(cap.siteProfileId)
    if (!site) return { success: false, error: 'Site profile not found', data: {}, durationMs: 0, log: [] }

    // Get decrypted session
    const session = getSession(cap.siteProfileId)

    // Diagnostic: log session contents
    console.log(`[Executor] Site: ${site.hostname}, Session exists: ${!!session}, Has encrypted: ${!!site.sessionEncrypted}`)
    if (session) {
      console.log(`[Executor] Cookies: ${session.cookies?.length || 0}, LocalStorage keys: ${Object.keys(session.localStorage || {}).length}`)
    }

    const engine = new PlaywrightEngine()

    try {
      mainWindow.webContents.send('executor:status', { capabilityId, status: 'running' })

      const cookies = session?.cookies || []
      const localStorage = session?.localStorage || {}
      console.log(`[Executor] Launching with ${cookies.length} cookies, ${Object.keys(localStorage).length} localStorage items`)

      await engine.launch({
        headless: !options.visible,
        cookies,
        localStorage,
        viewport: (cap as any).viewport || undefined
      })

      // Ensure actions start with a navigate to the site URL
      let actions = [...(cap.actions as any[])]
      let params = [...(cap.parameters as any[])]
      const firstAction = actions[0]
      const hasInitialNav = firstAction && firstAction.type === 'navigate' && firstAction.url
      if (!hasInitialNav) {
        // Prepend a navigate to the site's base URL
        const siteUrl = site.url || ('https://' + site.hostname)
        actions.unshift({
          type: 'navigate',
          timestamp: 0,
          url: siteUrl,
          label: 'Navigate to site (auto-prepended)'
        })
        // Shift all parameter action indices by 1 to account for prepended navigate
        params = params.map((p: any) => ({ ...p, actionIndex: p.actionIndex + 1 }))
      }

      const result = await engine.execute(
        actions,
        params,
        paramValues,
        cap.extractionRules as any
      )

      // Prepend session diagnostic info to log
      result.log.unshift(
        `[session] Site: ${site.hostname}`,
        `[session] Encrypted session exists: ${!!site.sessionEncrypted}`,
        `[session] Decrypted cookies: ${session?.cookies?.length || 0}`,
        `[session] Decrypted localStorage: ${Object.keys(session?.localStorage || {}).length} keys`
      )

      // Redact sensitive fields
      if (result.success && result.data) {
        for (const rule of cap.extractionRules) {
          if (rule.sensitive && result.data[rule.name]) {
            result.data[rule.name] = '[REDACTED]'
          }
        }
      }

      // Update capability health status
      const hasData = Object.values(result.data).some(v => v !== null && v !== undefined)
      if (result.success) {
        updateCapability(capabilityId, {
          healthStatus: 'healthy',
          consecutiveFailures: 0,
          lastRunAt: new Date().toISOString(),
          lastSuccessAt: new Date().toISOString()
        } as any)
      } else if (hasData) {
        // Partial success — degraded
        const cap2 = getCapability(capabilityId)
        updateCapability(capabilityId, {
          healthStatus: 'degraded',
          consecutiveFailures: (cap2?.consecutiveFailures || 0) + 1,
          lastRunAt: new Date().toISOString()
        } as any)
      } else {
        const cap2 = getCapability(capabilityId)
        const failures = (cap2?.consecutiveFailures || 0) + 1
        updateCapability(capabilityId, {
          healthStatus: failures >= 3 ? 'broken' : 'degraded',
          consecutiveFailures: failures,
          lastRunAt: new Date().toISOString()
        } as any)
      }

      mainWindow.webContents.send('executor:status', {
        capabilityId,
        status: result.success ? 'completed' : 'failed',
        result
      })

      return result
    } catch (err: any) {
      // Fatal error — mark as broken
      updateCapability(capabilityId, {
        healthStatus: 'broken',
        consecutiveFailures: 99,
        lastRunAt: new Date().toISOString()
      } as any)

      const result: ExecutionResult = {
        success: false,
        data: {},
        error: err.message,
        errorType: 'unknown',
        durationMs: 0,
        log: [`Fatal error: ${err.message}`]
      }
      mainWindow.webContents.send('executor:status', { capabilityId, status: 'failed', result })
      return result
    } finally {
      await engine.close()
    }
  })
}
