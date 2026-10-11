import { useState } from 'react'
import { Button, Notice } from '../components/ui'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import type { ImportPreview } from '../../../main/services/importExcel'
import { AccountForm } from './Accounts'
import { ImportPreviewModal } from './Settings'
import { useThemeSync } from '../components/Layout'

export function WelcomePage() {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [picking, setPicking] = useState(false)
  const [newAccount, setNewAccount] = useState(false)
  useThemeSync()
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-[560px]">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Finanzas</h1>
        <p className="mt-1 text-[15px] text-ink-2">Tus movimientos, saldos, objetivos e inversiones, guardados solo en este PC.</p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            disabled={picking}
            onClick={async () => {
              setPicking(true)
              try {
                const p = await api('import.pick')
                if (p) setPreview(p)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e))
              } finally {
                setPicking(false)
              }
            }}
            className="rounded-lg border border-line-strong bg-surface p-4 text-left hover:border-accent"
          >
            <div className="text-[15px] font-medium">Importar mi FINANCIAL_MASTER.xlsx</div>
            <div className="text-[13px] text-muted">Cuentas, categorías, movimientos, recurrentes y objetivos. Verás una vista previa antes de importar.</div>
          </button>
          <button onClick={() => setNewAccount(true)} className="rounded-lg border border-line-strong bg-surface p-4 text-left hover:border-accent">
            <div className="text-[15px] font-medium">Empezar de cero</div>
            <div className="text-[13px] text-muted">Crea tu primera cuenta y registra movimientos a mano.</div>
          </button>
        </div>
        <div className="mt-6">
          <Notice tone="info">No se conecta a ningún banco ni pide credenciales. Tú introduces los movimientos a partir de tu historial.</Notice>
        </div>
        {picking && <Button className="mt-3" loading variant="ghost">Leyendo el Excel…</Button>}
      </div>
      {preview && <ImportPreviewModal preview={preview} onClose={() => setPreview(null)} />}
      {newAccount && <AccountForm account={null} onClose={() => setNewAccount(false)} />}
    </div>
  )
}
