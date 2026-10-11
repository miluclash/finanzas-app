import { useState } from 'react'
import { formatDate } from '@shared/dates'
import { formatEur } from '@shared/money'
import type { TrKind, TrPreview } from '../../../main/services/importTradeRepublic'
import { Badge, Button, Field, Modal, Notice, Select } from './ui'
import { useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'

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
  const apply = useApiMutation('tr.apply', {
    success: (r) => `Importadas ${r.created} filas de Trade Republic${r.skippedDuplicates ? ` (${r.skippedDuplicates} ya estaban)` : ''}`,
    onSuccess: onClose
  })
  const fresh = p.rows.filter((r) => !r.duplicate)
  const sourceAcc = accounts.find((a) => a.id === source)
  return (
    <Modal
      open
      onClose={onClose}
      width={800}
      title={`Importar de Trade Republic · ${p.fileName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!fresh.length || !source || apply.isPending}
            loading={apply.isPending}
            onClick={() => apply.mutate([p.token, { brokerAccountId: broker || null, sourceAccountId: source }])}
          >
            {fresh.length ? `Importar ${fresh.length} filas` : 'Nada nuevo que importar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-[13px]">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cuenta del bróker">
            <Select value={broker} onChange={(e) => setBroker(e.target.value)}>
              <option value="">Crear cuenta «Trade Republic»</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Recargas desde">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              {sources.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!broker && sourceAcc && p.firstDate && sourceAcc.openingDate > p.firstDate && (
          <Notice tone="info">
            {sourceAcc.name} empieza el {formatDate(sourceAcc.openingDate)}. Lo anterior a esa fecha no se resta de {sourceAcc.name}: va al saldo inicial del bróker y a lo aportado. Las compras sí se registran todas.
          </Notice>
        )}
        <div className="grid grid-cols-4 gap-x-6">
          {(
            [
              ['Recargado', p.totals.depositsCents],
              ['Comisiones recarga', p.totals.depositFeesCents],
              ['Comprado', p.totals.buysCents],
              ['Efectivo final', p.totals.cashCents]
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-line py-1">
              <span className="text-muted">{k}</span>
              <span className="num font-medium">{formatEur(v)}</span>
            </div>
          ))}
        </div>
        {p.holdings.length > 0 && (
          <div>
            <h3 className="mb-1 font-medium">Participaciones resultantes</h3>
            <ul className="divide-y divide-line rounded-md border border-line">
              {p.holdings.map((h) => (
                <li key={h.isin} className="flex justify-between px-3 py-1.5">
                  <span>
                    {h.name} <span className="text-muted">{h.isin}</span>
                    {p.newInstruments.some((n) => n.isin === h.isin) && (
                      <span className="ml-2">
                        <Badge tone="accent">nuevo activo</Badge>
                      </span>
                    )}
                  </span>
                  <span className="num">{nf(h.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.skipped.length > 0 && (
          <Notice tone="warn">
            <div className="font-medium">Filas que no se importan ({p.skipped.length}):</div>
            {p.skipped.map((s) => (
              <div key={s.line}>
                Línea {s.line}: {s.reason}
              </div>
            ))}
          </Notice>
        )}
        <div className="max-h-64 overflow-auto rounded-md border border-line">
          <table className="w-full">
            <tbody className="divide-y divide-line">
              {p.rows.map((r) => (
                <tr key={r.id} className={r.duplicate ? 'text-muted' : ''}>
                  <td className="num px-3 py-1">{formatDate(r.date)}</td>
                  <td className="px-2 py-1">
                    {LABEL[r.kind]} {r.name ?? ''}
                    {r.duplicate && <span className="ml-2 text-[12px]">(ya importada)</span>}
                  </td>
                  <td className="num px-2 py-1 text-right">{r.quantity ? nf(r.quantity) : ''}</td>
                  <td className="num px-3 py-1 text-right">
                    {formatEur(r.amountCents)}
                    {r.feeCents ? <span className="text-muted"> +{formatEur(r.feeCents)} com.</span> : null}
                    {r.taxCents ? <span className="text-muted"> −{formatEur(r.taxCents)} ret.</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-muted">
          Puedes volver a importar un export más nuevo cuando quieras: las filas que ya estén se saltan. Antes de importar se guarda una copia de seguridad.
        </p>
      </div>
    </Modal>
  )
}
