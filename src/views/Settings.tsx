import { useEffect, useState } from 'react'
import { Eye, EyeOff, Check, CheckCircle, XCircle, Loader2, Link2, Unlink } from 'lucide-react'
import { useSettings } from '../stores/settings'

export default function Settings() {
  const { aiApiKey, loaded, load, setAiApiKey } = useSettings()

  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  // Claude Desktop status
  const [claudeStatus, setClaudeStatus] = useState<{ installed: boolean; connected: boolean; configPath?: string } | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (!loaded) load()
    checkClaudeStatus()
  }, [loaded, load])

  useEffect(() => {
    if (loaded) setKeyInput(aiApiKey)
  }, [loaded, aiApiKey])

  const checkClaudeStatus = async () => {
    const status = await window.purroxy.claude.getStatus()
    setClaudeStatus(status)
  }

  const handleSaveKey = async () => {
    await setAiApiKey(keyInput.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleConnect = async () => {
    setConnecting(true)
    const result = await window.purroxy.claude.connect()
    if (result.success) {
      await checkClaudeStatus()
    }
    setConnecting(false)
  }

  const handleDisconnect = async () => {
    await window.purroxy.claude.disconnect()
    await checkClaudeStatus()
  }

  if (!loaded) return null

  return (
    <div className="p-8 max-w-xl">
      <h2 className="text-xl font-semibold mb-6">Settings</h2>

      {/* Claude Desktop Integration */}
      <section className="mb-8">
        <label className="block text-sm font-medium mb-2">Claude Desktop</label>

        {claudeStatus === null ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Checking...
          </div>
        ) : !claudeStatus.installed ? (
          <div className="rounded-lg bg-black/5 dark:bg-white/5 p-3">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Claude Desktop is not installed.</p>
            <a href="https://claude.ai/download" target="_blank" className="text-sm text-accent hover:text-accent-light font-medium">
              Download Claude Desktop
            </a>
          </div>
        ) : claudeStatus.connected ? (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-800 dark:text-green-300">Connected</span>
              </div>
              <button onClick={handleDisconnect} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                <Unlink size={12} /> Disconnect
              </button>
            </div>
            <p className="text-xs text-green-700 dark:text-green-400/80 mt-1">
              Your capabilities are available in Claude Desktop. Restart Claude Desktop if you just connected.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-black/5 dark:bg-white/5 p-3">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              Connect Purroxy so Claude Desktop can run your capabilities.
            </p>
            <button onClick={handleConnect} disabled={connecting}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-medium transition-colors disabled:opacity-60">
              {connecting ? (
                <><Loader2 size={14} className="animate-spin" /> Connecting...</>
              ) : (
                <><Link2 size={14} /> Connect to Claude Desktop</>
              )}
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Purroxy must be running for Claude to use your capabilities.
            </p>
          </div>
        )}
      </section>

      {/* API Key */}
      <section className="mb-8">
        <label className="block text-sm font-medium mb-2">Anthropic API Key</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 pr-10 rounded-lg bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            onClick={handleSaveKey}
            disabled={keyInput.trim() === aiApiKey}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            {saved ? <><Check size={14} /> Saved</> : 'Save'}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Used for the AI guide when building capabilities. Stored locally.
        </p>
      </section>

      {/* Version info */}
      <section className="pt-4 border-t border-black/5 dark:border-white/5">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Purroxy v0.1.0
          {window.purroxy && (
            <> &middot; Electron {window.purroxy.versions.electron} &middot; {window.purroxy.platform}</>
          )}
        </p>
      </section>
    </div>
  )
}
