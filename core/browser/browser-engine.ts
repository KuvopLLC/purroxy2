import type {
  BrowserEngineOptions,
  ExecutionResult,
  RecordedAction,
  Parameter,
  Locator,
  ExtractionRule,
} from './types'
import { PlaywrightEngine } from './playwright-engine'

export type HealerFn = (context: {
  intent: string
  label: string
  tagName: string
  originalLocators: Array<{ strategy: string; value: string }>
  domSnapshot: string
  actionType: string
  pageUrl: string
}) => Promise<{ selector: string | null; confidence: string } | null>

export interface BrowserEngine {
  setHealer(fn: HealerFn): void
  launch(options: BrowserEngineOptions): Promise<void>
  execute(
    actions: RecordedAction[],
    parameters: Parameter[],
    paramValues: Record<string, string>,
    extractionRules: ExtractionRule[]
  ): Promise<ExecutionResult>
  getHealedLocators(): Array<{ actionIndex: number; locator: Locator }>
  close(): Promise<void>
}

export type BrowserEngineKind = 'playwright'

export function createBrowserEngine(kind: BrowserEngineKind = 'playwright'): BrowserEngine {
  switch (kind) {
    case 'playwright':
      return new PlaywrightEngine()
  }
}
