/**
 * In-memory mock of electron-store for use in tests.
 *
 * Mirrors the real electron-store API surface used by the app:
 * get, set (both overloads), store, clear, delete, has.
 */
export class MockStore<T extends Record<string, any> = Record<string, any>> {
  private data: T

  constructor(opts?: { name?: string; defaults?: T }) {
    this.data = { ...(opts?.defaults || ({} as T)) }
  }

  get<K extends keyof T>(key: K): T[K]
  get(key: string): any
  get(key: string): any {
    return this.data[key as keyof T]
  }

  set<K extends keyof T>(key: K, value: T[K]): void
  set(key: string, value: any): void
  set(key: string, value: any): void {
    ;(this.data as any)[key] = value
  }

  has(key: string): boolean {
    return key in this.data
  }

  get store(): T {
    return { ...this.data }
  }

  clear(): void {
    this.data = {} as T
  }

  delete<K extends keyof T>(key: K): void
  delete(key: string): void
  delete(key: string): void {
    delete (this.data as any)[key]
  }
}

export default MockStore
