/**
 * In-memory mock of Cloudflare D1Database for backend tests.
 *
 * Tracks every query + bindings so tests can assert on database calls.
 * Configurable per-query results via setResult / setResultForQuery.
 */

export interface TrackedQuery {
  sql: string
  bindings: unknown[]
}

export interface MockD1Options {
  /** Default result returned by statement.first(). Default: null */
  defaultFirst?: any
  /** Default results array returned by statement.all(). Default: [] */
  defaultAll?: any[]
}

export function createMockD1(opts: MockD1Options = {}) {
  const queries: TrackedQuery[] = []
  const resultMap = new Map<string, any>()
  let globalFirst: any = opts.defaultFirst ?? null
  let globalAll: any[] = opts.defaultAll ?? []

  function createStatement(sql: string) {
    let bindings: unknown[] = []

    const statement = {
      bind(...args: unknown[]) {
        bindings = args
        return statement
      },

      async first<T = any>(): Promise<T | null> {
        queries.push({ sql, bindings })
        // Check for a configured result for this exact sql
        if (resultMap.has(sql)) {
          const result = resultMap.get(sql)
          return typeof result === 'function' ? result(bindings) : result
        }
        return globalFirst as T | null
      },

      async run() {
        queries.push({ sql, bindings })
        return { success: true, meta: { changes: 1 } }
      },

      async all<T = any>(): Promise<{ results: T[] }> {
        queries.push({ sql, bindings })
        if (resultMap.has(sql)) {
          const result = resultMap.get(sql)
          const results = typeof result === 'function' ? result(bindings) : result
          return { results: Array.isArray(results) ? results : [results] }
        }
        return { results: globalAll as T[] }
      },
    }

    return statement
  }

  const db = {
    prepare(sql: string) {
      return createStatement(sql)
    },

    async batch(stmts: ReturnType<typeof createStatement>[]) {
      const results = []
      for (const stmt of stmts) {
        results.push(await stmt.run())
      }
      return results
    },

    // ── Test helpers ──────────────────────────────────────────────

    /** Return all tracked queries for assertions. */
    getQueries(): TrackedQuery[] {
      return [...queries]
    },

    /** Clear tracked queries. */
    clearQueries(): void {
      queries.length = 0
    },

    /** Set a specific result for first() when the SQL contains the given substring. */
    setResult(sqlSubstring: string, result: any): void {
      resultMap.set(sqlSubstring, result)
    },

    /** Override the default result for first() globally. */
    setDefaultFirst(result: any): void {
      globalFirst = result
    },

    /** Override the default results for all() globally. */
    setDefaultAll(results: any[]): void {
      globalAll = results
    },

    /** Set a result that is resolved when SQL exactly matches. */
    setResultForQuery(exactSql: string, result: any): void {
      resultMap.set(exactSql, result)
    },

    /** Reset all configured results and tracked queries. */
    reset(): void {
      queries.length = 0
      resultMap.clear()
      globalFirst = opts.defaultFirst ?? null
      globalAll = opts.defaultAll ?? []
    },
  }

  return db
}

export type MockD1Database = ReturnType<typeof createMockD1>
