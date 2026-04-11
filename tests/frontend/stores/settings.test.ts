// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../../setup/dom-setup'
import { getPurroxyMock, resetPurroxyMock } from '../../setup/dom-setup'

// Import useSettings AFTER dom-setup has stubbed window.purroxy
import { useSettings } from '../../../src/stores/settings'

describe('useSettings store', () => {
  beforeEach(() => {
    resetPurroxyMock()
    // Reset only the data fields — keep the real zustand actions
    const state = useSettings.getState()
    useSettings.setState({
      aiApiKey: '',
      telemetryEnabled: false,
      loaded: false,
      // Preserve the real function implementations from zustand
      load: state.load,
      setAiApiKey: state.setAiApiKey,
      setTelemetryEnabled: state.setTelemetryEnabled,
    })
  })

  it('has correct initial state', () => {
    const state = useSettings.getState()
    expect(state.aiApiKey).toBe('')
    expect(state.telemetryEnabled).toBe(false)
    expect(state.loaded).toBe(false)
  })

  it('load() populates state from window.purroxy.settings.getAll', async () => {
    const api = getPurroxyMock()
    api.settings.getAll.mockResolvedValueOnce({
      aiApiKey: 'sk-ant-test123',
      telemetryEnabled: true
    })

    await useSettings.getState().load()

    const state = useSettings.getState()
    expect(state.aiApiKey).toBe('sk-ant-test123')
    expect(state.telemetryEnabled).toBe(true)
    expect(state.loaded).toBe(true)
  })

  it('load() defaults to empty values when getAll returns nulls', async () => {
    const api = getPurroxyMock()
    api.settings.getAll.mockResolvedValueOnce({})

    await useSettings.getState().load()

    const state = useSettings.getState()
    expect(state.aiApiKey).toBe('')
    expect(state.telemetryEnabled).toBe(false)
    expect(state.loaded).toBe(true)
  })

  it('setAiApiKey updates store and calls IPC', async () => {
    const api = getPurroxyMock()
    api.settings.set.mockResolvedValueOnce(true)

    await useSettings.getState().setAiApiKey('sk-ant-new-key')

    expect(api.settings.set).toHaveBeenCalledWith('aiApiKey', 'sk-ant-new-key')
    expect(useSettings.getState().aiApiKey).toBe('sk-ant-new-key')
  })

  it('setTelemetryEnabled updates store and calls IPC', async () => {
    const api = getPurroxyMock()
    api.settings.set.mockResolvedValueOnce(true)

    await useSettings.getState().setTelemetryEnabled(true)

    expect(api.settings.set).toHaveBeenCalledWith('telemetryEnabled', true)
    expect(useSettings.getState().telemetryEnabled).toBe(true)
  })
})
