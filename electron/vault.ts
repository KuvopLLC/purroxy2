import Store from 'electron-store'
import { encrypt, decrypt } from './crypto'
import { ipcMain } from 'electron'

export interface VaultEntry {
  id: string
  key: string
  valueEncrypted: string
  createdAt: string
  updatedAt: string
}

interface VaultSchema {
  entries: VaultEntry[]
}

const vaultStore = new Store<VaultSchema>({
  name: 'vault',
  defaults: { entries: [] }
})

function getAllEntries(): VaultEntry[] {
  return vaultStore.get('entries')
}

function getEntry(key: string): VaultEntry | undefined {
  return getAllEntries().find(e => e.key === key)
}

function setEntry(key: string, value: string): VaultEntry {
  const entries = getAllEntries()
  const existing = entries.findIndex(e => e.key === key)
  const now = new Date().toISOString()

  if (existing >= 0) {
    entries[existing].valueEncrypted = encrypt(value)
    entries[existing].updatedAt = now
    vaultStore.set('entries', entries)
    return entries[existing]
  }

  const entry: VaultEntry = {
    id: require('crypto').randomUUID(),
    key,
    valueEncrypted: encrypt(value),
    createdAt: now,
    updatedAt: now
  }
  entries.push(entry)
  vaultStore.set('entries', entries)
  return entry
}

function deleteEntry(key: string): void {
  const entries = getAllEntries().filter(e => e.key !== key)
  vaultStore.set('entries', entries)
}

// Decrypt a vault value (only used internally for runtime injection)
export function getDecryptedValue(key: string): string | null {
  const entry = getEntry(key)
  if (!entry) return null
  return decrypt(entry.valueEncrypted)
}

// Get all vault keys (for scrubbing — we need the decrypted values to know what to scrub)
export function getAllDecryptedValues(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of getAllEntries()) {
    try {
      result[entry.key] = decrypt(entry.valueEncrypted)
    } catch {}
  }
  return result
}

export function setupVault() {
  ipcMain.handle('vault:list', () => {
    // Return entries WITHOUT decrypted values — just keys and metadata
    return getAllEntries().map(e => ({
      id: e.id,
      key: e.key,
      hasValue: true,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt
    }))
  })

  ipcMain.handle('vault:set', (_event, key: string, value: string) => {
    setEntry(key, value)
    return true
  })

  ipcMain.handle('vault:delete', (_event, key: string) => {
    deleteEntry(key)
    return true
  })

  // Preview a masked version of the value (first 2 + last 2 chars)
  ipcMain.handle('vault:peek', (_event, key: string) => {
    const val = getDecryptedValue(key)
    if (!val) return null
    if (val.length <= 4) return '****'
    return val.slice(0, 2) + '•'.repeat(val.length - 4) + val.slice(-2)
  })
}
