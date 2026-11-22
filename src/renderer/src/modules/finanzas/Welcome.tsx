import { FileXls, PlusCircle, Wallet } from '@phosphor-icons/react'
import { useState } from 'react'
import { useThemeSync } from '../../core/shell/theme'
import { Button, Notice } from '../../components/ui'
import { api } from '../../lib/api'
import { toast } from '../../lib/toast'
import type { ImportPreview } from '../../../../main/modules/finanzas/importExcel'
import { AccountForm } from './Accounts'
import { ImportPreviewModal } from '../../core/ajustes/Settings'

/** Pantalla de bienvenida (base de datos vacía): importar el Excel o empezar de cero. */
export function WelcomePage() {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [picking, setPicking] = useState(false)
  const [newAccount, setNewAccount] = useState(false)
  useThemeSync()
  return (
    <div data-module="finanzas" className="flex h-full items-center justify-center bg-canvas p-8 text-ink">
      <div className="w-full" style={{ maxWidth: '35rem' }}>
        <div className="grid size-12 place-items-center r-card border border-line-strong bg-raised text-accent-text">
          <Wallet size={24} weight="duotone" aria-hidden />
        </div>
        <h1 className="t-page mt-6">Finanzas</h1>
        <p className="t-body mt-2 text-ink-2">Tus movimientos, saldos, objetivos e inversiones, guardados solo en este PC.</p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            disabled={picking}
            onClick={async () => {
              setPicking(true)
              try {
                const p = await api('finanzas:import.pick')
                if (p) setPreview(p)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e))
              } finally {
                setPicking(false)
              }
            }}
            className="card card-link flex-row items-start gap-4 text-left disabled:cursor-progress disabled:opacity-60"
          >
            <FileXls size={24} weight="duotone" className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
            <span>
              <span className="t-card-title block">Importar mi FINANCIAL_MASTER.xlsx</span>
              <span className="t-label mt-1 block">Cuentas, categorías, movimientos, recurrentes y objetivos. Verás una vista previa antes de importar.</span>
            </span>
          </button>
          <button onClick={() => setNewAccount(true)} className="card card-link flex-row items-start gap-4 text-left">
            <PlusCircle size={24} weight="duotone" className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
            <span>
              <span className="t-card-title block">Empezar de cero</span>
              <span className="t-label mt-1 block">Crea tu primera cuenta y registra movimientos a mano.</span>
            </span>
          </button>
        </div>
        <div className="mt-6">
          <Notice tone="info">No se conecta a ningún banco ni pide credenciales. Tú introduces los movimientos a partir de tu historial.</Notice>
        </div>
        {picking && (
          <Button className="mt-3" loading variant="ghost">
            Leyendo el Excel…
          </Button>
        )}
      </div>
      {preview && <ImportPreviewModal preview={preview} onClose={() => setPreview(null)} />}
      {newAccount && <AccountForm account={null} onClose={() => setNewAccount(false)} />}
    </div>
  )
}
