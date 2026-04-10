import { ipcMain, shell, clipboard } from 'electron'
import { store } from './store'
import { getAllSites, createSite, saveSession, deleteSite } from './sites'
import { getAllCapabilities, getCapabilitiesForSite, createCapability, deleteCapability, updateCapability } from './capabilities'

export function setupIPC() {
  // Settings
  ipcMain.handle('settings:get', (_event, key: string) => {
    return store.get(key)
  })

  ipcMain.handle('settings:getAll', () => {
    return store.store
  })

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    store.set(key, value)
    return true
  })

  // Sites
  ipcMain.handle('sites:getAll', () => {
    return getAllSites()
  })

  ipcMain.handle('sites:create', (_event, url: string, name: string, faviconUrl: string) => {
    return createSite(url, name, faviconUrl)
  })

  ipcMain.handle('sites:saveSession', (_event, siteId: string, session: { cookies: unknown[]; localStorage: Record<string, string> }) => {
    saveSession(siteId, session as any)
    return true
  })

  ipcMain.handle('sites:delete', (_event, id: string) => {
    deleteSite(id)
    return true
  })

  // Capabilities
  ipcMain.handle('capabilities:getAll', () => {
    return getAllCapabilities()
  })

  ipcMain.handle('capabilities:getForSite', (_event, siteProfileId: string) => {
    return getCapabilitiesForSite(siteProfileId)
  })

  ipcMain.handle('capabilities:create', (_event, data: any) => {
    return createCapability(data)
  })

  ipcMain.handle('capabilities:delete', (_event, id: string) => {
    deleteCapability(id)
    return true
  })

  ipcMain.handle('capabilities:update', (_event, id: string, updates: any) => {
    return updateCapability(id, updates)
  })

  // Window management
  let savedBounds: Electron.Rectangle | null = null
  ipcMain.handle('window:expandForRecording', () => {
    const wins = require('electron').BrowserWindow.getAllWindows()
    const win = wins[0]
    if (!win) return
    savedBounds = win.getBounds()
    const { screen } = require('electron')
    const display = screen.getDisplayMatching(savedBounds)
    // Expand to ~90% of screen width, keep height
    const newWidth = Math.round(display.workArea.width * 0.9)
    const newX = Math.round(display.workArea.x + (display.workArea.width - newWidth) / 2)
    win.setBounds({ x: newX, y: savedBounds.y, width: newWidth, height: savedBounds.height }, true)
  })

  ipcMain.handle('window:restoreSize', () => {
    if (!savedBounds) return
    const wins = require('electron').BrowserWindow.getAllWindows()
    const win = wins[0]
    if (!win) return
    win.setBounds(savedBounds, true)
    savedBounds = null
  })

  // System
  ipcMain.handle('system:copyAndOpenClaude', async (_event, text: string) => {
    clipboard.writeText(text)

    const { execSync, exec } = require('child_process')
    const fs = require('fs')

    // Check if Claude Desktop is installed
    let installed = false
    if (process.platform === 'darwin') {
      installed = fs.existsSync('/Applications/Claude.app')
    } else if (process.platform === 'win32') {
      try { execSync('where claude', { stdio: 'ignore' }); installed = true } catch { installed = false }
    } else {
      try { execSync('which claude', { stdio: 'ignore' }); installed = true } catch { installed = false }
    }

    if (installed) {
      if (process.platform === 'darwin') {
        exec('open -a "Claude"')
      } else if (process.platform === 'win32') {
        exec('start "" "Claude"')
      }
      return { opened: true }
    } else {
      return { opened: false, downloadUrl: 'https://claude.ai/download' }
    }
  })
}
