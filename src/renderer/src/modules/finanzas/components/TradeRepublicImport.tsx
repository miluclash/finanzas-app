import { useState } from 'react'
import { formatDate } from '@shared/dates'
import { formatEur } from '@shared/money'
import type { TrKind, TrPreview } from '../../../../../main/modules/finanzas/importTradeRepublic'
import { Aviso, Button, FilaDato, Modal, Select, Tag } from '../../../core/ui'
import { useApiMutation } from '../../../lib/api'
import { useCatalog } from '../../../lib/catalog'

const LABEL: Record<TrKind, string> = {
  DEPOSIT: 'Recarga',
  WITHDRAWAL: 'Retirada',
  BUY: 'Compra',
  SELL: 'Venta',
  DIVIDEND: 'Dividendo',
  INTEREST: 'Intereses',
  FEE: 'Comisión'
}
const nf = (v: string) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(Number(v))

export function TradeRepublicImportModal({ preview: p, onClose }: { preview: TrPreview; onClose: () => void }) {
  const { cat } = useCatalog()
  const accounts = cat?.accounts ?? []
  const brokers = accounts.filter((a) => a.type === 'INVESTMENT')
  const sources = accounts.filter((a) => a.includeLiquidity && a.type !== 'CASH')
  const [broker, setBroker] = useState<string>(brokers.find((b) => /trade/i.test(b.name))?.id ?? '')
  const [source, setSource] = useState<string>(sources.find((a) => /santander/i.test(a.name))?.id ?? sources[0]?.id ?? '')
  const apply = useApiMutation('finanzas:tr.apply', {
    success: (r) => `Importadas ${r.created} filas de Trade Republic${r.skippedDuplicates ? ` (${r.skippedDuplicates} ya estaban)` : ''}`,
    onSuccess: onClose
  })
  const fresh = p.rows.filter((r) => !r.duplicate)
  const sourceAcc = accounts.find((a) => a.id === source)
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={`Importar de Trade Republic · ${p.fileName}`}
        ancho="xl"
        onCerrar={onClose}
        pie={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="accent" disabled={!fresh.length || !source || apply.isPending} cargando={apply.isPending} onClick={() => apply.mutate([p.token, { brokerAccountId: broker || null, sourceAccountId: source }])}>
              {fresh.length ? `Importar ${fresh.length} filas` : 'Nada nuevo que importar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Cuenta del bróker" value={broker} onChange={(e) => setBroker(e.target.value)}>
              <option value="">Crear cuenta «Trade Republic»</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select label="Recargas desde" value={source} onChange={(e) => setSource(e.target.value)}>
              {sources.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          {!broker && sourceAcc && p.firstDate && sourceAcc.openingDate > p.firstDate && (
            <Aviso tono="info">
              {sourceAcc.name} empieza el {formatDate(sourceAcc.openingDate)}. Lo anterior a esa fecha no se resta de {sourceAcc.name}: va al saldo inicial del bróker y a lo aportado. Las compras sí se registran todas.
            </Aviso>
          )}
          <dl className="divide-line grid gap-x-8 sm:grid-cols-2">
            {(
              [
                ['Recargado', p.totals.depositsCents],
                ['Comisiones recarga', p.totals.depositFeesCents],
                ['Comprado', p.totals.buysCents],
                ['Efectivo final', p.totals.cashCents]
              ] as const
            ).map(([k, v]) => (
              <FilaDato key={k} className="border-b border-line py-2" etiqueta={k} valor={formatEur(v)} fuerte />
            ))}
          </dl>
          {p.holdings.length > 0 && (
            <div>
              <h3 className="t-card-title mb-2">Participaciones resultantes</h3>
              <ul className="divide-line r-card border border-line">
                {p.holdings.map((h) => (
                  <li key={h.isin} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                    <span className="t-body flex flex-wrap items-center gap-2">
                      {h.name} <span className="t-meta">{h.isin}</span>
                      {p.newInstruments.some((n) => n.isin === h.isin) && <Tag tono="accent">Nuevo activo</Tag>}
                    </span>
                    <span className="tnum t-body">{nf(h.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.skipped.length > 0 && (
            <Aviso tono="warning">
              <div className="font-semibold">Filas que no se importan ({p.skipped.length}):</div>
              {p.skipped.map((s) => (
                <div key={s.line}>
                  Línea {s.line}: {s.reason}
                </div>
              ))}
            </Aviso>
          )}
          <div className="max-h-64 overflow-auto r-card border border-line">
            <table className="table" data-density="compact" aria-label="Filas del archivo de Trade Republic">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Operación</th>
                  <th scope="col" className="text-right">
                    Unidades
                  </th>
                  <th scope="col" className="text-right">
                    Importe
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r.id} className={r.duplicate ? 'text-ink-3' : ''}>
                    <td className="tnum">{formatDate(r.date)}</td>
                    <td>
                      {LABEL[r.kind]} {r.name ?? ''}
                      {r.duplicate && <span className="t-meta ml-2">(ya importada)</span>}
                    </td>
                    <td className="tnum text-right">{r.quantity ? nf(r.quantity) : ''}</td>
                    <td className="tnum text-right">
                      {formatEur(r.amountCents)}
                      {r.feeCents ? <span className="t-meta"> +{formatEur(r.feeCents)} com.</span> : null}
                      {r.taxCents ? <span className="t-meta"> −{formatEur(r.taxCents)} ret.</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-meta">Puedes volver a importar un export más nuevo cuando quieras: las filas que ya estén se saltan. Antes de importar se guarda una copia de seguridad.</p>
        </div>
      </Modal>
    </div>
  )
}
