/// <reference types="vite/client" />

interface FinanzasBridge {
  call: (method: string, args: unknown[]) => Promise<{ ok: boolean; data?: unknown; error?: string; user?: boolean; saved?: boolean }>
  updateStatus: () => Promise<UpdateStatus>
  checkUpdate: () => Promise<unknown>
  /** `null` si no hay nada que instalar; si no se ha podido guardar antes, el motivo. */
  installUpdate: () => Promise<true | null | { ok: false; error: string; user: true }>
  setTheme: (theme: 'system' | 'light' | 'dark') => Promise<boolean>
}

type UpdateStatus = { current: string } & (
  | { state: 'idle' | 'checking' | 'none' | 'disabled' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }
)

interface Window {
  finanzas: FinanzasBridge
}
