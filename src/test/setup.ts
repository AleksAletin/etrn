// Инициализируем DOM-окружение через happy-dom.
import { GlobalRegistrator } from '@happy-dom/global-registrator'
if (typeof globalThis.document === 'undefined') {
  GlobalRegistrator.register({ url: 'http://localhost/' })
}

// Vitest 4 + Node 24 иногда подменяют localStorage своим stub (без setItem).
// Перезаписываем на полноценный Map-based storage.
;(function installLocalStorage() {
  const store = new Map<string, string>()
  const storage = {
    get length() { return store.size },
    clear() { store.clear() },
    getItem(k: string) { return store.has(k) ? store.get(k)! : null },
    setItem(k: string, v: string) { store.set(k, String(v)) },
    removeItem(k: string) { store.delete(k) },
    key(i: number) { return Array.from(store.keys())[i] ?? null },
  }
  // Всегда переопределяем, чтобы исключить заглушки без setItem
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  } catch {
    // fallback
    (globalThis as unknown as { localStorage: typeof storage }).localStorage = storage
  }
  try {
    Object.defineProperty(globalThis, 'sessionStorage', { value: { ...storage, store: new Map() }, configurable: true, writable: true })
  } catch { /* ignore */ }
})()

import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'

function safeClearStorage() {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear()
    }
  } catch {
    // no-op
  }
}

beforeEach(() => { safeClearStorage() })
afterEach(() => { cleanup(); safeClearStorage() })
