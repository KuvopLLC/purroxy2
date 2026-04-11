export interface BrowserEngineOptions {
  headless?: boolean
  cookies?: Array<Record<string, unknown>>
  localStorage?: Record<string, string>
  timeout?: number
  viewport?: { width: number; height: number }
}

export interface ExtractedData {
  [key: string]: string | string[] | null
}

export interface ExecutionResult {
  success: boolean
  data: ExtractedData
  error?: string
  errorType?: 'site_changed' | 'session_expired' | 'transient' | 'unknown'
  durationMs: number
  screenshot?: string // base64
  log: string[] // step-by-step execution log
}

export interface ExtractionRule {
  name: string
  selector: string
  attribute: string // 'text', 'href', 'value', 'innerHTML'
  multiple: boolean
  sensitive: boolean
}

export interface Locator {
  strategy: 'css' | 'testid' | 'role' | 'text' | 'aria' | 'placeholder' | 'nearby'
  value: string
  name?: string
  attr?: string
  tag?: string
}

export interface RecordedAction {
  type: 'click' | 'type' | 'navigate' | 'select' | 'scroll' | 'wait'
  timestamp: number
  selector?: string
  locators?: Locator[]
  tagName?: string
  label?: string
  value?: string
  url?: string
  sensitive?: boolean
  intent?: string // AI-generated: what this step is trying to accomplish
}

export interface Parameter {
  name: string
  description: string
  actionIndex: number
  field: 'value' | 'url'
  defaultValue: string
  required: boolean
}
