/// <reference types="vite/client" />

interface FinanzasBridge {
  call: (method: string, args: unknown[]) => Promise<{ ok: boolean; data?: unknown; error?: string; user?: boolean }>
  setTheme: (theme: 'system' | 'light' | 'dark') => Promise<boolean>
}

interface Window {
  finanzas: FinanzasBridge
}
