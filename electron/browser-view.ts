import { BrowserWindow, WebContentsView, ipcMain } from 'electron'
import { getSiteByHostname, getSession } from './sites'

let siteView: WebContentsView | null = null

export function getSiteView(): WebContentsView | null {
  return siteView
}

export function setupBrowserView(mainWindow: BrowserWindow) {
  ipcMain.handle('browser:open', (_event, url: string) => {
    if (siteView) {
      siteView.webContents.loadURL(normalizeUrl(url))
      return
    }

    siteView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    // Use a standard Chrome user agent — Electron's default includes "Electron/"
    // which some sites detect and serve mobile/degraded layouts
    siteView.webContents.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    mainWindow.contentView.addChildView(siteView)
    positionView(mainWindow)

    // Forward URL and title changes to the renderer
    siteView.webContents.on('did-navigate', (_e, url) => {
      mainWindow.webContents.send('browser:url-changed', url)
    })
    siteView.webContents.on('did-navigate-in-page', (_e, url) => {
      mainWindow.webContents.send('browser:url-changed', url)
    })
    siteView.webContents.on('page-title-updated', (_e, title) => {
      mainWindow.webContents.send('browser:title-changed', title)
    })
    siteView.webContents.on('did-start-loading', () => {
      mainWindow.webContents.send('browser:loading', true)
    })
    siteView.webContents.on('did-stop-loading', () => {
      mainWindow.webContents.send('browser:loading', false)
    })

    // Intercept new windows (target="_blank", window.open) — load in our view instead
    siteView.webContents.setWindowOpenHandler(({ url }) => {
      siteView!.webContents.loadURL(url)
      return { action: 'deny' }
    })

    // Inject saved session cookies before loading
    const normalized = normalizeUrl(url)
    injectSavedSession(siteView, normalized).then(() => {
      siteView!.webContents.loadURL(normalized)
    })
  })

  ipcMain.handle('browser:navigate', (_event, url: string) => {
    siteView?.webContents.loadURL(normalizeUrl(url))
  })

  ipcMain.handle('browser:back', () => {
    if (siteView?.webContents.canGoBack()) siteView.webContents.goBack()
  })

  ipcMain.handle('browser:forward', () => {
    if (siteView?.webContents.canGoForward()) siteView.webContents.goForward()
  })

  ipcMain.handle('browser:reload', () => {
    siteView?.webContents.reload()
  })

  ipcMain.handle('browser:close', () => {
    if (siteView) {
      mainWindow.contentView.removeChildView(siteView)
      siteView.webContents.close()
      siteView = null
    }
  })

  ipcMain.handle('browser:resize', (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    siteView?.setBounds(bounds)
  })

  // Detect login forms on the current page
  ipcMain.handle('browser:detectLogin', async () => {
    if (!siteView) return { hasLogin: false }
    const result = await siteView.webContents.executeJavaScript(`
      (() => {
        const pwFields = document.querySelectorAll('input[type="password"]');
        const emailFields = document.querySelectorAll('input[type="email"], input[name*="user"], input[name*="email"], input[name*="login"]');
        return {
          hasLogin: pwFields.length > 0,
          hasPasswordField: pwFields.length > 0,
          hasUsernameField: emailFields.length > 0,
          formCount: document.querySelectorAll('form').length
        };
      })()
    `)
    return result
  })

  // Capture session (cookies + localStorage) from the current site
  ipcMain.handle('browser:captureSession', async () => {
    if (!siteView) return null
    const url = siteView.webContents.getURL()
    // Get ALL cookies for this domain (not just the exact URL)
    const hostname = new URL(url).hostname
    const domain = hostname.split('.').slice(-2).join('.') // e.g. "yahoo.com" from "mail.yahoo.com"
    const allCookies = await siteView.webContents.session.cookies.get({})
    const cookies = allCookies.filter(c =>
      c.domain && (c.domain === hostname || c.domain === '.' + hostname || c.domain === '.' + domain || c.domain === domain || hostname.endsWith(c.domain.replace(/^\./, '')))
    )
    const localStorage = await siteView.webContents.executeJavaScript(`
      (() => {
        const items = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          items[key] = localStorage.getItem(key);
        }
        return items;
      })()
    `)
    return { cookies, localStorage }
  })

  // Get page info (title, favicon, URL)
  ipcMain.handle('browser:getPageInfo', async () => {
    if (!siteView) return null
    const url = siteView.webContents.getURL()
    const title = siteView.webContents.getTitle()
    const faviconUrl = await siteView.webContents.executeJavaScript(`
      (() => {
        const link = document.querySelector('link[rel*="icon"]');
        return link ? link.href : '';
      })()
    `)
    return { url, title, faviconUrl }
  })

  // Get the current BrowserView dimensions (for matching viewport in replay)
  ipcMain.handle('browser:getViewportSize', () => {
    if (!siteView) return { width: 1280, height: 800 }
    const bounds = siteView.getBounds()
    return { width: bounds.width, height: bounds.height }
  })

  // Reposition on window resize
  mainWindow.on('resize', () => {
    positionView(mainWindow)
  })
}

function positionView(mainWindow: BrowserWindow) {
  if (!siteView) return
  const [winWidth, winHeight] = mainWindow.getContentSize()
  // Sidebar is 80px, guide panel takes ~380px, rest goes to browser
  const sidebarWidth = 80
  const guidePanelWidth = 380
  const x = sidebarWidth + guidePanelWidth
  const titleBarHeight = 44
  const browserWidth = winWidth - x
  const browserHeight = winHeight - titleBarHeight

  if (browserWidth > 0 && browserHeight > 0) {
    siteView.setBounds({
      x,
      y: titleBarHeight,
      width: browserWidth,
      height: browserHeight
    })
  }
}

async function injectSavedSession(view: WebContentsView, url: string): Promise<void> {
  try {
    const hostname = new URL(url).hostname
    const site = getSiteByHostname(hostname)
    if (!site) return

    const session = getSession(site.id)
    if (!session) return

    // Inject cookies into the BrowserView's session
    if (session.cookies && session.cookies.length > 0) {
      for (const cookie of session.cookies) {
        try {
          await view.webContents.session.cookies.set({
            url: url,
            name: (cookie as any).name,
            value: (cookie as any).value,
            domain: (cookie as any).domain,
            path: (cookie as any).path || '/',
            secure: (cookie as any).secure || false,
            httpOnly: (cookie as any).httpOnly || false
          })
        } catch {} // Skip individual cookie errors
      }
      console.log(`[BrowserView] Injected ${session.cookies.length} saved cookies for ${hostname}`)
    }
  } catch (err) {
    console.log(`[BrowserView] Failed to inject session: ${err}`)
  }
}

function normalizeUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) {
    return 'https://' + url
  }
  return url
}
