#!/usr/bin/env node

/**
 * Purroxy MCP Server
 *
 * Bridges Claude Desktop to the Purroxy Electron app's local HTTP API.
 * The Electron app must be running.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Find the MCP API port written by the Electron app
function getPort() {
  const paths = [
    join(homedir(), 'Library', 'Application Support', 'purroxy', 'mcp-port'),
    join(homedir(), 'AppData', 'Roaming', 'purroxy', 'mcp-port'),
    join(homedir(), '.config', 'purroxy', 'mcp-port')
  ]
  for (const p of paths) {
    try { return parseInt(readFileSync(p, 'utf-8').trim()) } catch {}
  }
  return null
}

async function apiCall(path, method = 'GET', body = null) {
  const port = getPort()
  if (!port) throw new Error('Purroxy is not running.')
  const url = `http://127.0.0.1:${port}${path}`
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  return res.json()
}

// Static tool definitions — always discoverable, even when the desktop app is not running.
const STATIC_TOOLS = [
  {
    name: 'purroxy_list_capabilities',
    description:
      'List all browser automation capabilities recorded in Purroxy. ' +
      'Returns each capability\'s name, description, target website, and required parameters. ' +
      'Call this first to discover what automations are available before executing one with purroxy_run_capability. ' +
      'Requires the Purroxy desktop app to be running.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'purroxy_run_capability',
    description:
      'Execute a recorded browser automation capability by name. ' +
      'Purroxy replays the recorded actions in a headless browser with saved session credentials, ' +
      'then extracts and returns structured data from the resulting page. ' +
      'Call purroxy_list_capabilities first to discover available capability names and their parameters. ' +
      'Requires the Purroxy desktop app to be running.',
    inputSchema: {
      type: 'object',
      properties: {
        capability_name: {
          type: 'string',
          description: 'The name of the capability to execute, exactly as returned by purroxy_list_capabilities.'
        },
        parameters: {
          type: 'object',
          description:
            'Input parameters for the capability as key-value string pairs. ' +
            'Check purroxy_list_capabilities to see which parameters each capability accepts and which are required.',
          additionalProperties: { type: 'string' }
        }
      },
      required: ['capability_name']
    }
  },
  {
    name: 'purroxy_status',
    description:
      'Check whether the Purroxy desktop app is running and reachable. ' +
      'Returns the connection status and the number of available capabilities. ' +
      'Use this to verify Purroxy is ready before attempting to run automations.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
]

// Create MCP server
const server = new Server(
  { name: 'purroxy', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

// Tool name → capability ID mapping (for dynamic per-capability tools)
let toolMap = {}

// List tools — static tools are always returned; dynamic per-capability tools are appended when the app is running.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const allTools = [...STATIC_TOOLS]

  try {
    const { tools } = await apiCall('/tools')
    toolMap = {}
    for (const t of tools) {
      toolMap[t.name] = t._capabilityId
      allTools.push({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      })
    }
    lastToolNames = tools.map(t => t.name).sort().join(',')
  } catch {
    // App not running — static tools are still returned.
  }

  return { tools: allTools }
})

// Format execution result into readable text
function formatResult(result) {
  let text = ''
  if (result.data) {
    const fields = Object.entries(result.data)
      .filter(([k]) => k !== '_pageContent')
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
    if (fields.length > 0) {
      text = fields
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\n')
    }
    if (result.data._pageContent) {
      if (text) text += '\n\n--- Page Content ---\n'
      text += result.data._pageContent
    }
  }
  if (result.error) {
    text += `\n\n(Note: ${result.error})`
  }
  return text || 'No data extracted.'
}

// Refresh the tool map from the running app (returns the raw tools array)
async function refreshToolMap() {
  const { tools } = await apiCall('/tools')
  toolMap = {}
  for (const t of tools) toolMap[t.name] = t._capabilityId
  return tools
}

// Call tool — handles both static and dynamic tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name
  const args = request.params.arguments || {}

  // ── Static tool: purroxy_status ──
  if (toolName === 'purroxy_status') {
    try {
      const { tools } = await apiCall('/tools')
      return {
        content: [{
          type: 'text',
          text: `Purroxy is running. ${tools.length} capability${tools.length === 1 ? '' : 'ies'} available.`
        }]
      }
    } catch {
      return {
        content: [{ type: 'text', text: 'Purroxy desktop app is not running. Please launch it first.' }],
        isError: true
      }
    }
  }

  // ── Static tool: purroxy_list_capabilities ──
  if (toolName === 'purroxy_list_capabilities') {
    try {
      const tools = await refreshToolMap()
      if (tools.length === 0) {
        return {
          content: [{ type: 'text', text: 'No capabilities found. Record your first capability in the Purroxy desktop app.' }]
        }
      }
      const lines = tools.map(t => {
        const params = t.inputSchema?.properties
          ? Object.entries(t.inputSchema.properties)
              .map(([k, v]) => `${k}${t.inputSchema.required?.includes(k) ? ' (required)' : ''}: ${v.description || 'no description'}`)
          : []
        return `- ${t.description}${params.length > 0 ? '\n  Parameters: ' + params.join(', ') : ''}`
      })
      return {
        content: [{ type: 'text', text: lines.join('\n') }]
      }
    } catch {
      return {
        content: [{ type: 'text', text: 'Purroxy desktop app is not running. Please launch it first.' }],
        isError: true
      }
    }
  }

  // ── Static tool: purroxy_run_capability ──
  if (toolName === 'purroxy_run_capability') {
    const capName = args.capability_name
    const params = args.parameters || {}

    if (!capName) {
      return {
        content: [{ type: 'text', text: 'capability_name is required. Use purroxy_list_capabilities to see available names.' }],
        isError: true
      }
    }

    try {
      const tools = await refreshToolMap()

      // Match by capability name (the description starts with "CapName (hostname): ...")
      const match = tools.find(t => {
        const descName = t.description.split(' (')[0]
        return descName.toLowerCase() === capName.toLowerCase()
      })

      if (!match) {
        return {
          content: [{
            type: 'text',
            text: `Capability "${capName}" not found. Use purroxy_list_capabilities to see available names.`
          }],
          isError: true
        }
      }

      const result = await apiCall('/execute', 'POST', {
        capabilityId: match._capabilityId,
        params
      })
      return { content: [{ type: 'text', text: formatResult(result) }] }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed: ${err.message}. Is Purroxy running?` }],
        isError: true
      }
    }
  }

  // ── Dynamic per-capability tool ──
  let capId = toolMap[toolName]

  if (!capId) {
    try {
      await refreshToolMap()
      capId = toolMap[toolName]
    } catch {}

    if (!capId) {
      return {
        content: [{ type: 'text', text: `Tool "${toolName}" not found.` }],
        isError: true
      }
    }
  }

  try {
    const result = await apiCall('/execute', 'POST', {
      capabilityId: capId,
      params: args
    })
    return { content: [{ type: 'text', text: formatResult(result) }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Failed: ${err.message}. Is Purroxy running?` }],
      isError: true
    }
  }
})

// Poll for capability changes and notify Claude to refresh tools
let lastToolNames = ''
setInterval(async () => {
  try {
    const { tools } = await apiCall('/tools')
    const names = tools.map(t => t.name).sort().join(',')
    if (lastToolNames && names !== lastToolNames) {
      process.stderr.write('[Purroxy MCP] Tool list changed, notifying client\n')
      await server.sendToolListChanged()
    }
    lastToolNames = names
  } catch {}
}, 5000)

// Start
const transport = new StdioServerTransport()
await server.connect(transport)
process.stderr.write('[Purroxy MCP] Server started\n')
