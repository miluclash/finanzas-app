import { AlertTriangle, Plus, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate, todayISO } from '@shared/dates'
import { ASSET_CLASS_LABEL, OP_TYPE_LABEL } from '@shared/labels'
import { formatEur, formatPct } from '@shared/money'
import {
  ASSET_CLASSES,
  INVESTMENT_OP_TYPES,
  type AllocationBlock,
  type AssetClass,
  type Instrument,
  type InvestmentOp,
  type InvestmentOpType
} from '@shared/types'
import { BarList, LinesChart } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { useTxEditor } from '../components/TxEditor'
import {
  Amount,
  Badge,
  Button,
  Checkbox,
  confirmDialog,
  cx,
  DateInput,
  EmptyState,
  ErrorBox,
  Field,
  Loading,
  Modal,
  MoneyInput,
  Notice,
  PageHeader,
  Section,
  Select,
  Tabs,
  TextArea,
  TextInput
} from '../components/ui'
import { useApi, useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'
import type { HoldingRow } from '@shared/domain/investments'

type Tab = 'resumen' | 'ops' | 'precios' | 'activos'

const nf = (v: string | null, max = 6) =>
  v === null ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: max, useGrouping: 'always' } as Intl.NumberFormatOptions).format(Number(v))

export function InvestmentsPage() {
  const [tab, setTab] = useState<Tab>('resumen')
  const { cat } = useCatalog()
  const [opForm, setOpForm] = useState<Partial<InvestmentOp> | null>(null)
  const [pricesOpen, setPricesOpen] = useState(false)
  const navigate = useNavigate()
  const brokers = (cat?.accounts ?? []).filter((a) => a.type === 'INVESTMENT' || a.type === 'CRYPTO')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inversiones"
        description="Posiciones calculadas a partir de tus operaciones. Comprar no es gastar: cambias efectivo por un activo. Las comisiones sí son gasto."
        actions={
          <>
            <Button onClick={() => setPricesOpen(true)} disabled={!cat?.instruments.length}>
              Actualizar precios
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} disabled={!brokers.length || !cat?.instruments.length} onClick={() => setOpForm({})}>
              Nueva operación
            </Button>
          </>
        }
      />
      {brokers.length === 0 ? (
        <EmptyState
          title="Primero crea tu cuenta de bróker"
          text="En Cuentas, crea una cuenta de tipo «Inversión / bróker» (por ejemplo, Trade Republic) con su efectivo inicial y lo que aportaste antes de empezar a registrarla. Después da de alta tus activos y operaciones aquí."
          action={<Button onClick={() => navigate('/cuentas')}>Ir a Cuentas</Button>}
        />
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'resumen', label: 'Cartera' },
              { id: 'ops', label: 'Operaciones', count: undefined },
              { id: 'precios', label: 'Precios' },
              { id: 'activos', label: 'Activos y reparto objetivo' }
            ]}
          />
          {tab === 'resumen' && <Overview onNewOp={(d) => setOpForm(d)} />}
          {tab === 'ops' && <OpsView onEdit={(op) => setOpForm(op)} />}
          {tab === 'precios' && <PricesView />}
          {tab === 'activos' && <AssetsView />}
        </>
      )}
      {opForm && <OpForm initial={opForm} onClose={() => setOpForm(null)} />}
      {pricesOpen && <BulkPrices onClose={() => setPricesOpen(false)} />}
    </div>
  )
}

function Overview({ onNewOp }: { onNewOp: (d: Partial<InvestmentOp>) => void }) {
  const q = useApi('inv.overview', [])
  const { maps } = useCatalog()
  const { openTransfer } = useTxEditor()
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const { summary: s, series } = q.data!
  const holdings = s.holdings.filter((h) => Number(h.units) > 0 || h.realizedCents !== 0)
  const cols: Column<HoldingRow>[] = [
    {
      key: 'name',
      header: 'Activo',
      sort: (h) => h.name,
      cell: (h) => (
        <div>
          <div className="font-medium">{h.name}</div>
          <div className="text-[12px] text-muted">
            {ASSET_CLASS_LABEL[h.assetClass]}
            {maps.instrument.get(h.instrumentId)?.isin ? ` · ${maps.instrument.get(h.instrumentId)!.isin}` : ''}
            {h.blockId ? ` · ${maps.block.get(h.blockId)?.name}` : ''}
          </div>
        </div>
      )
    },
    { key: 'units', header: 'Unidades', align: 'right', sort: (h) => Number(h.units), cell: (h) => <span className="num">{nf(h.units)}</span> },
    { key: 'avg', header: 'Precio medio', align: 'right', cell: (h) => <span className="num">{h.avgCost ? `${nf(h.avgCost, 4)} €` : '—'}</span> },
    { key: 'cost', header: 'Coste', align: 'right', sort: (h) => h.costBasisCents, cell: (h) => <span className="num">{formatEur(h.costBasisCents)}</span> },
    {
      key: 'price',
      header: 'Precio actual',
      align: 'right',
      cell: (h) => (
        <div>
          <span className="num">{h.lastPrice ? `${nf(h.lastPrice, 4)} €` : '—'}</span>
          <div className="text-[12px] text-muted">
            {h.priceSource === 'MANUAL' ? formatDate(h.lastPriceDate) : h.priceSource === 'OPERATION' ? `de operación ${formatDate(h.lastPriceDate)}` : 'sin precio'}
          </div>
        </div>
      )
    },
    { key: 'value', header: 'Valor', align: 'right', sort: (h) => h.marketValueCents, cell: (h) => <span className="num font-medium">{formatEur(h.marketValueCents)}</span> },
    {
      key: 'pl',
      header: 'Plusvalía',
      align: 'right',
      sort: (h) => h.unrealizedCents,
      cell: (h) => (
        <div>
          <Amount cents={h.unrealizedCents} className={h.unrealizedCents < 0 ? 'text-neg' : ''} />
          <div className="num text-[12px] text-muted">{formatPct(h.unrealizedPct)}</div>
        </div>
      )
    },
    { key: 'weight', header: 'Peso', align: 'right', sort: (h) => h.weight ?? 0, cell: (h) => <span className="num">{formatPct(h.weight)}</span> },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (h) => (
        <Button size="sm" variant="ghost" onClick={() => onNewOp({ instrumentId: h.instrumentId, accountId: h.accountId, type: 'BUY' })}>
          Operar
        </Button>
      )
    }
  ]
  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-4 rounded-lg border border-line bg-surface">
        <Fig label="Valor de la cartera" value={formatEur(s.totalValueCents)} sub={`Coste ${formatEur(s.totalCostCents)}`} />
        <Fig label="Efectivo en el bróker" value={formatEur(s.cashCents)} sub="Sin invertir todavía" border />
        <Fig label="Aportado de tu bolsillo" value={formatEur(s.contributedCents)} sub="Previo + transferencias netas" border />
        <Fig
          label="Ganancia total"
          value={formatEur(s.gainCents, { sign: true })}
          sub={`${formatPct(s.gainPct)} sobre lo aportado`}
          border
          tone={s.gainCents < 0 ? 'neg' : s.gainCents > 0 ? 'pos' : undefined}
        />
      </section>
      <div className="flex flex-wrap gap-x-8 gap-y-1 text-[13px] text-muted">
        <span>
          No realizada <Amount cents={s.unrealizedCents} /> ({formatPct(s.unrealizedPct)})
        </span>
        <span>
          Realizada <Amount cents={s.realizedCents} />
        </span>
        <span>
          Dividendos e intereses netos <Amount cents={s.dividendsNetCents} />
        </span>
        <span>
          Impuestos retenidos <span className="num text-ink">{formatEur(s.taxesCents)}</span>
        </span>
        <span>
          Comisiones <span className="num text-ink">{formatEur(s.feesCents)}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => openTransfer({ description: 'Aportación a inversión' })}>
          Registrar aportación (transferencia)
        </Button>
      </div>
      {s.alerts.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {s.alerts.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]">
              {a.level === 'error' ? <XCircle className="mt-0.5 size-4 text-neg" /> : <AlertTriangle className="mt-0.5 size-4 text-warn" />}
              {a.text}
            </li>
          ))}
        </ul>
      )}
      <Section title="Posiciones">
        <DataTable
          rows={holdings}
          columns={cols}
          rowKey={(h) => h.key}
          initialSort={{ key: 'value', dir: 'desc' }}
          empty={<EmptyState title="Aún no hay posiciones" text="Da de alta tus activos en «Activos y reparto objetivo» y registra las compras como operaciones." />}
        />
      </Section>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6">
        <Section title="Reparto objetivo frente al actual" description="Desviación en puntos porcentuales. Corrige con dinero nuevo, sin vender." boxed>
          {s.byBlock.length === 0 ? (
            <p className="text-[13px] text-muted">Define tus bloques (por ejemplo 80 % núcleo, 10 % emergentes, 10 % satélites) en «Activos y reparto objetivo».</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-right text-ink-2">
                  <th className="pb-1 text-left font-medium">Bloque</th>
                  <th className="pb-1 font-medium">Valor</th>
                  <th className="pb-1 font-medium">Actual</th>
                  <th className="pb-1 font-medium">Objetivo</th>
                  <th className="pb-1 font-medium">Desviación</th>
                </tr>
              </thead>
              <tbody>
                {s.byBlock.map((b) => (
                  <tr key={b.key} className="border-t border-line text-right">
                    <td className="py-1.5 text-left">
                      {b.label}
                      <div className="relative mt-1 h-1.5 w-full rounded-full bg-line">
                        <div className="absolute h-1.5 rounded-full" style={{ width: `${Math.min((b.weight ?? 0) * 100, 100)}%`, background: 'var(--series-1)' }} />
                        {b.targetPct !== null && b.targetPct !== undefined && (
                          <div className="absolute -top-0.5 h-2.5 w-0.5 bg-ink" style={{ left: `${Math.min(b.targetPct * 100, 100)}%` }} title="Objetivo" />
                        )}
                      </div>
                    </td>
                    <td className="num py-1.5">{formatEur(b.valueCents)}</td>
                    <td className="num py-1.5">{formatPct(b.weight)}</td>
                    <td className="num py-1.5 text-muted">{b.targetPct !== null && b.targetPct !== undefined ? formatPct(b.targetPct) : '—'}</td>
                    <td className={cx('num py-1.5', b.deviation && Math.abs(b.deviation) > 0.05 ? 'text-warn' : 'text-muted')}>
                      {b.deviation === null || b.deviation === undefined ? '—' : `${b.deviation > 0 ? '+' : ''}${(b.deviation * 100).toFixed(1).replace('.', ',')} pp`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Valor frente a lo aportado" boxed>
          {series.length > 1 ? (
            <LinesChart
              data={series.map((p) => ({ month: p.month, v: p.valueCents, c: p.contributedCents }))}
              series={[
                { key: 'v', name: 'Valor (posiciones + efectivo)' },
                { key: 'c', name: 'Aportado' }
              ]}
            />
          ) : (
            <p className="text-[13px] text-muted">Con más de un mes de datos verás la evolución.</p>
          )}
        </Section>
      </div>
      <div className="grid grid-cols-4 gap-6">
        <Breakdown title="Por clase" rows={s.byClass.map((r) => ({ ...r, label: ASSET_CLASS_LABEL[r.key as AssetClass] ?? r.label }))} />
        <Breakdown title="Por región" rows={s.byRegion} />
        <Breakdown title="Por sector" rows={s.bySector} />
        <Breakdown title="Por divisa" rows={s.byCurrency} />
      </div>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ key: string; label: string; valueCents: number }> }) {
  return (
    <Section title={title}>
      {rows.length ? (
        <BarList rows={rows.map((r) => ({ key: r.key, label: r.label, value: r.valueCents }))} max={6} />
      ) : (
        <p className="text-[12px] text-muted">Sin datos. Rellénalo en la ficha de cada activo.</p>
      )}
    </Section>
  )
}

function Fig({ label, value, sub, border, tone }: { label: string; value: string; sub: string; border?: boolean; tone?: 'pos' | 'neg' }) {
  return (
    <div className={cx('px-5 py-4', border && 'border-l border-line')}>
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className={cx('num text-[22px] font-semibold', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{value}</div>
      <div className="text-[12px] text-muted">{sub}</div>
    </div>
  )
}

function OpsView({ onEdit }: { onEdit: (op: InvestmentOp) => void }) {
  const q = useApi('inv.ops', [])
  const { maps, accountName } = useCatalog()
  if (q.isLoading) return <Loading />
  const cols: Column<InvestmentOp>[] = [
    { key: 'date', header: 'Fecha', sort: (o) => o.date + o.createdAt, cell: (o) => <span className="num">{formatDate(o.date)}</span> },
    { key: 'type', header: 'Tipo', sort: (o) => o.type, cell: (o) => <Badge tone={o.type === 'SELL' ? 'warn' : o.type === 'BUY' ? 'accent' : 'neutral'}>{OP_TYPE_LABEL[o.type]}</Badge> },
    { key: 'inst', header: 'Activo', sort: (o) => maps.instrument.get(o.instrumentId ?? '')?.name ?? '', cell: (o) => (o.instrumentId ? maps.instrument.get(o.instrumentId)?.name : <span className="text-muted">Cuenta</span>) },
    { key: 'qty', header: 'Unidades', align: 'right', cell: (o) => <span className="num">{o.type === 'SPLIT' ? `× ${nf(o.splitRatio)}` : nf(o.quantity)}</span> },
    { key: 'price', header: 'Precio', align: 'right', cell: (o) => <span className="num">{o.price ? `${nf(o.price, 4)} €` : '—'}</span> },
    {
      key: 'amount',
      header: 'Importe',
      align: 'right',
      cell: (o) => (
        <span className="num">
          {o.quantity && o.price ? formatEur(Math.round(Number(o.quantity) * Number(o.price) * 100)) : o.amountCents !== null ? formatEur(o.amountCents) : '—'}
        </span>
      )
    },
    { key: 'fee', header: 'Comisión', align: 'right', cell: (o) => <span className="num text-muted">{o.feeCents ? formatEur(o.feeCents) : '—'}</span> },
    { key: 'tax', header: 'Retención', align: 'right', cell: (o) => <span className="num text-muted">{o.taxCents ? formatEur(o.taxCents) : '—'}</span> },
    { key: 'acc', header: 'Cuenta', cell: (o) => <span className="text-ink-2">{accountName(o.accountId)}</span> },
    { key: 'cash', header: 'Mueve efectivo', cell: (o) => (o.affectsCash ? 'Sí' : <span className="text-muted">No</span>) }
  ]
  return (
    <DataTable
      rows={q.data ?? []}
      columns={cols}
      rowKey={(o) => o.id}
      onRowClick={onEdit}
      initialSort={{ key: 'date', dir: 'desc' }}
      empty={<EmptyState title="Sin operaciones" text="Registra compras, ventas, dividendos, comisiones y splits. Las unidades y el coste se calculan solos." />}
    />
  )
}

function OpForm({ initial, onClose }: { initial: Partial<InvestmentOp>; onClose: () => void }) {
  const { cat } = useCatalog()
  const brokers = (cat?.accounts ?? []).filter((a) => a.type === 'INVESTMENT' || a.type === 'CRYPTO' || a.id === initial.accountId)
  const inst = (cat?.instruments ?? []).filter((i) => i.active || i.id === initial.instrumentId)
  const [type, setType] = useState<InvestmentOpType>(initial.type ?? 'BUY')
  const [date, setDate] = useState(initial.date ?? todayISO())
  const [instrumentId, setInstrumentId] = useState(initial.instrumentId ?? inst[0]?.id ?? '')
  const [accountId, setAccountId] = useState(initial.accountId ?? cat?.instruments.find((i) => i.id === (initial.instrumentId ?? inst[0]?.id))?.accountId ?? brokers[0]?.id ?? '')
  const [quantity, setQuantity] = useState(initial.quantity ?? '')
  const [price, setPrice] = useState(initial.price ?? '')
  const [amount, setAmount] = useState<number | null>(initial.amountCents ?? null)
  const [fee, setFee] = useState<number | null>(initial.feeCents ?? 0)
  const [tax, setTax] = useState<number | null>(initial.taxCents ?? 0)
  const [ratio, setRatio] = useState(initial.splitRatio ?? '')
  const [affectsCash, setAffectsCash] = useState(initial.affectsCash ?? true)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const save = useApiMutation('inv.saveOp', { success: 'Operación guardada', onSuccess: onClose })
  const del = useApiMutation('inv.deleteOp', { success: 'Operación borrada', onSuccess: onClose })
  const needsQty = type === 'BUY' || type === 'SELL'
  const gross = needsQty && quantity && price ? Number(quantity.replace(',', '.')) * Number(price.replace(',', '.')) : null
  const acc = cat?.accounts.find((a) => a.id === accountId)
  const beforeOpening = acc && date < acc.openingDate
  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title={initial.id ? 'Editar operación' : 'Nueva operación'}
      footer={
        <>
          {initial.id && (
            <Button
              variant="ghost"
              className="mr-auto text-neg"
              onClick={async () => {
                if (await confirmDialog({ title: 'Borrar operación', text: 'Se borran también sus apuntes de efectivo.', confirm: 'Borrar', danger: true }))
                  del.mutate([initial.id!])
              }}
            >
              Borrar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() =>
              save.mutate([
                {
                  id: initial.id ?? null,
                  date,
                  accountId,
                  instrumentId: instrumentId || null,
                  type,
                  quantity: needsQty ? quantity : null,
                  price: needsQty ? price : null,
                  amountCents: type === 'DIVIDEND' || type === 'INTEREST' || type === 'FEE' ? amount : null,
                  feeCents: fee ?? 0,
                  taxCents: tax ?? 0,
                  splitRatio: type === 'SPLIT' ? ratio : null,
                  affectsCash,
                  notes
                }
              ])
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as InvestmentOpType)}>
            {INVESTMENT_OP_TYPES.map((t) => (
              <option key={t} value={t}>
                {OP_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Activo" hint={type === 'FEE' || type === 'INTEREST' ? 'Opcional (comisión o interés de la cuenta)' : undefined}>
          <Select
            value={instrumentId}
            onChange={(e) => {
              setInstrumentId(e.target.value)
              const i = cat?.instruments.find((x) => x.id === e.target.value)
              if (i?.accountId) setAccountId(i.accountId)
            }}
          >
            {(type === 'FEE' || type === 'INTEREST') && <option value="">— (de la cuenta)</option>}
            {inst.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cuenta del bróker">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {brokers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {needsQty && (
          <>
            <Field label="Unidades" hint="Admite decimales (fracciones)">
              <TextInput inputMode="decimal" className="num text-right" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0,000000" />
            </Field>
            <Field label="Precio por unidad (€)">
              <TextInput inputMode="decimal" className="num text-right" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
            </Field>
            <p className="col-span-2 text-[13px] text-muted">
              Importe: <span className="num text-ink">{gross !== null && Number.isFinite(gross) ? formatEur(Math.round(gross * 100)) : '—'}</span>
            </p>
          </>
        )}
        {(type === 'DIVIDEND' || type === 'INTEREST' || type === 'FEE') && (
          <Field label={type === 'FEE' ? 'Importe de la comisión' : 'Importe bruto'}>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
        )}
        {type === 'SPLIT' && (
          <Field label="Proporción" hint="Unidades nuevas por cada una antigua (2 = split 2×1; 0,1 = contrasplit 1×10)">
            <TextInput inputMode="decimal" className="num text-right" value={ratio} onChange={(e) => setRatio(e.target.value)} />
          </Field>
        )}
        {type !== 'SPLIT' && type !== 'FEE' && (
          <Field label="Comisión" hint="Se registra como gasto">
            <MoneyInput value={fee} onChange={setFee} />
          </Field>
        )}
        {(type === 'DIVIDEND' || type === 'INTEREST' || type === 'SELL') && (
          <Field label="Impuestos retenidos">
            <MoneyInput value={tax} onChange={setTax} />
          </Field>
        )}
        <div className="col-span-2">
          <Checkbox
            checked={affectsCash}
            onChange={setAffectsCash}
            label="Mueve el efectivo de la cuenta del bróker"
            hint="Desmárcalo solo si el efectivo ya está registrado de otra forma."
          />
        </div>
        {beforeOpening && affectsCash && (
          <div className="col-span-2">
            <Notice tone="info">
              La fecha es anterior a la apertura de la cuenta: cuenta para las unidades y el coste, pero no mueve el efectivo (ya está dentro del saldo inicial).
            </Notice>
          </div>
        )}
        <Field label="Notas" className="col-span-2">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function PricesView() {
  const q = useApi('inv.prices', [])
  const { cat, maps } = useCatalog()
  const [inst, setInst] = useState<string>('')
  const del = useApiMutation('inv.deletePrice', { success: 'Precio borrado' })
  const rows = (q.data ?? []).filter((p) => !inst || p.instrumentId === inst).sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Select className="w-72" value={inst} onChange={(e) => setInst(e.target.value)}>
          <option value="">Todos los activos</option>
          {cat?.instruments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <span className="text-[12px] text-muted">Precios que introduces a mano con su fecha. La app usa el último disponible en cada fecha.</span>
      </div>
      <DataTable
        rows={rows}
        rowKey={(p) => p.id}
        columns={[
          { key: 'date', header: 'Fecha', cell: (p) => <span className="num">{formatDate(p.date)}</span> },
          { key: 'inst', header: 'Activo', cell: (p) => maps.instrument.get(p.instrumentId)?.name ?? p.instrumentId },
          { key: 'price', header: 'Precio', align: 'right', cell: (p) => <span className="num">{nf(p.price, 6)} €</span> },
          { key: 'notes', header: 'Nota', cell: (p) => <span className="text-muted">{p.notes}</span> },
          {
            key: 'del',
            header: '',
            align: 'right',
            cell: (p) => (
              <Button size="sm" variant="ghost" onClick={() => del.mutate([p.id])}>
                Borrar
              </Button>
            )
          }
        ]}
        empty={<EmptyState title="Sin precios" text="Usa «Actualizar precios» para anotar el precio actual de cada activo." />}
      />
    </div>
  )
}

function BulkPrices({ onClose }: { onClose: () => void }) {
  const { cat } = useCatalog()
  const [date, setDate] = useState(todayISO())
  const [values, setValues] = useState<Record<string, string>>({})
  const save = useApiMutation('inv.savePrice', { silentError: false })
  const [saving, setSaving] = useState(false)
  const instruments = (cat?.instruments ?? []).filter((i) => i.active)
  const submit = async () => {
    setSaving(true)
    try {
      for (const i of instruments) {
        const v = values[i.id]?.trim()
        if (!v) continue
        await save.mutateAsync([{ instrumentId: i.id, date, price: v }])
      }
      onClose()
    } catch {
      /* el aviso ya se muestra */
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title="Actualizar precios"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            Guardar precios
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Fecha de los precios">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <ul className="flex flex-col gap-2">
          {instruments.map((i) => (
            <li key={i.id} className="grid grid-cols-[1fr_160px] items-center gap-3">
              <span className="text-[13px]">
                {i.name}
                <span className="block text-[12px] text-muted">{i.isin ?? i.ticker ?? ''}</span>
              </span>
              <TextInput
                inputMode="decimal"
                className="num text-right"
                placeholder="€ por unidad"
                value={values[i.id] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [i.id]: e.target.value }))}
              />
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-muted">Deja en blanco los que no quieras actualizar. Si ya hay precio en esa fecha, se sustituye.</p>
      </div>
    </Modal>
  )
}

function AssetsView() {
  const { cat, maps, accountName } = useCatalog()
  const [inst, setInst] = useState<Instrument | 'new' | null>(null)
  const [block, setBlock] = useState<AllocationBlock | 'new' | null>(null)
  const blocks = cat?.blocks ?? []
  const targetSum = blocks.reduce((s, b) => s + Number(b.targetPct), 0)
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Activos"
        description="Ficha editable de cada activo: identificación, clase, región, sector, bloque y peso máximo."
        actions={
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setInst('new')}>
            Nuevo activo
          </Button>
        }
      >
        <DataTable
          rows={cat?.instruments ?? []}
          rowKey={(i) => i.id}
          onRowClick={(i) => setInst(i)}
          columns={[
            {
              key: 'name',
              header: 'Activo',
              sort: (i) => i.name,
              cell: (i) => (
                <div>
                  <div className={i.active ? 'font-medium' : 'text-muted'}>{i.name}</div>
                  <div className="text-[12px] text-muted">{[i.isin, i.ticker].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              )
            },
            { key: 'class', header: 'Clase', cell: (i) => ASSET_CLASS_LABEL[i.assetClass] },
            { key: 'block', header: 'Bloque', cell: (i) => (i.blockId ? maps.block.get(i.blockId)?.name : <span className="text-muted">—</span>) },
            { key: 'region', header: 'Región', cell: (i) => i.region ?? <span className="text-muted">—</span> },
            { key: 'sector', header: 'Sector', cell: (i) => i.sector ?? <span className="text-muted">—</span> },
            { key: 'cur', header: 'Divisa', cell: (i) => i.currency },
            { key: 'max', header: 'Peso máx.', align: 'right', cell: (i) => (i.maxWeightPct ? `${i.maxWeightPct.replace('.', ',')} %` : '—') },
            { key: 'acc', header: 'Cuenta', cell: (i) => (i.accountId ? accountName(i.accountId) : '—') }
          ]}
          empty={<EmptyState title="Sin activos" text="Da de alta cada ETF, acción, fondo o cripto que tengas." action={<Button onClick={() => setInst('new')}>Nuevo activo</Button>} />}
        />
      </Section>
      <Section
        title="Reparto objetivo por bloques"
        description="Qué parte de cada 100 € invertidos va a cada bloque. Puedes cambiarlo cuando quieras."
        actions={
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setBlock('new')}>
            Nuevo bloque
          </Button>
        }
      >
        {blocks.length > 0 && Math.abs(targetSum - 100) > 0.001 && (
          <div className="mb-2">
            <Notice tone="warn">Los objetivos suman {String(targetSum).replace('.', ',')} %; deberían sumar 100 %.</Notice>
          </div>
        )}
        <DataTable
          rows={blocks}
          rowKey={(b) => b.id}
          onRowClick={(b) => setBlock(b)}
          columns={[
            { key: 'name', header: 'Bloque', cell: (b) => <span className="font-medium">{b.name}</span> },
            { key: 'target', header: 'Objetivo', align: 'right', cell: (b) => <span className="num">{b.targetPct.replace('.', ',')} %</span> },
            { key: 'max', header: 'Máximo', align: 'right', cell: (b) => (b.maxPct ? <span className="num">{b.maxPct.replace('.', ',')} %</span> : '—') },
            { key: 'n', header: 'Activos', align: 'right', cell: (b) => (cat?.instruments ?? []).filter((i) => i.blockId === b.id).length },
            { key: 'notes', header: 'Notas', cell: (b) => <span className="text-muted">{b.notes}</span> }
          ]}
          empty={<EmptyState title="Sin bloques" text="Ejemplo: Núcleo MSCI World 80 %, Emergentes 10 %, Satélites 10 % (máx. 20 %)." />}
        />
      </Section>
      {inst && <InstrumentForm instrument={inst === 'new' ? null : inst} onClose={() => setInst(null)} />}
      {block && <BlockForm block={block === 'new' ? null : block} onClose={() => setBlock(null)} />}
    </div>
  )
}

function InstrumentForm({ instrument: i, onClose }: { instrument: Instrument | null; onClose: () => void }) {
  const { cat } = useCatalog()
  const [name, setName] = useState(i?.name ?? '')
  const [ticker, setTicker] = useState(i?.ticker ?? '')
  const [isin, setIsin] = useState(i?.isin ?? '')
  const [assetClass, setAssetClass] = useState<AssetClass>(i?.assetClass ?? 'ETF')
  const [currency, setCurrency] = useState(i?.currency ?? 'EUR')
  const [region, setRegion] = useState(i?.region ?? '')
  const [sector, setSector] = useState(i?.sector ?? '')
  const [blockId, setBlockId] = useState(i?.blockId ?? '')
  const [maxW, setMaxW] = useState(i?.maxWeightPct ?? '')
  const [accountId, setAccountId] = useState(i?.accountId ?? cat?.accounts.find((a) => a.type === 'INVESTMENT')?.id ?? '')
  const [active, setActive] = useState(i?.active ?? true)
  const [notes, setNotes] = useState(i?.notes ?? '')
  const save = useApiMutation('inv.saveInstrument', { success: (x) => `Activo guardado: ${x.name}`, onSuccess: onClose })
  const del = useApiMutation('inv.deleteInstrument', { success: 'Activo borrado', onSuccess: onClose })
  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title={i ? `Editar ${i.name}` : 'Nuevo activo'}
      footer={
        <>
          {i && (
            <Button variant="ghost" className="mr-auto text-neg" onClick={() => del.mutate([i.id])}>
              Borrar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() =>
              save.mutate([
                {
                  id: i?.id ?? null,
                  name,
                  ticker,
                  isin,
                  assetClass,
                  currency,
                  region,
                  sector,
                  blockId: blockId || null,
                  maxWeightPct: maxW || null,
                  accountId: accountId || null,
                  active,
                  notes
                }
              ])
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" required className="col-span-2">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej.: Xtrackers MSCI World 1C" />
        </Field>
        <Field label="ISIN">
          <TextInput value={isin} onChange={(e) => setIsin(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Ticker">
          <TextInput value={ticker} onChange={(e) => setTicker(e.target.value)} />
        </Field>
        <Field label="Clase de activo">
          <Select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
            {ASSET_CLASSES.map((c) => (
              <option key={c} value={c}>
                {ASSET_CLASS_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Divisa del activo" hint="Los precios se anotan en euros">
          <TextInput value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Región" hint="Ej.: Global desarrollados, EE. UU., Emergentes">
          <TextInput value={region} onChange={(e) => setRegion(e.target.value)} />
        </Field>
        <Field label="Sector" hint="Ej.: Diversificado, Tecnología, Energía">
          <TextInput value={sector} onChange={(e) => setSector(e.target.value)} />
        </Field>
        <Field label="Bloque del reparto">
          <Select value={blockId} onChange={(e) => setBlockId(e.target.value)}>
            <option value="">—</option>
            {cat?.blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Peso máximo en la cartera (%)" hint="Avisa si lo supera. Vacío = usa el aviso general de concentración en acciones">
          <TextInput inputMode="decimal" className="num text-right" value={maxW} onChange={(e) => setMaxW(e.target.value)} />
        </Field>
        <Field label="Cuenta habitual">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">—</option>
            {cat?.accounts
              .filter((a) => a.type === 'INVESTMENT' || a.type === 'CRYPTO')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox checked={active} onChange={setActive} label="Activo" />
        </div>
        <Field label="Notas / tesis" className="col-span-2">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  )
}

function BlockForm({ block: b, onClose }: { block: AllocationBlock | null; onClose: () => void }) {
  const [name, setName] = useState(b?.name ?? '')
  const [target, setTarget] = useState(b?.targetPct?.replace('.', ',') ?? '')
  const [max, setMax] = useState(b?.maxPct?.replace('.', ',') ?? '')
  const [notes, setNotes] = useState(b?.notes ?? '')
  const save = useApiMutation('inv.saveBlock', { success: 'Bloque guardado', onSuccess: onClose })
  const del = useApiMutation('inv.deleteBlock', { success: 'Bloque borrado', onSuccess: onClose })
  return (
    <Modal
      open
      onClose={onClose}
      width={480}
      title={b ? `Editar ${b.name}` : 'Nuevo bloque'}
      footer={
        <>
          {b && (
            <Button variant="ghost" className="mr-auto text-neg" onClick={() => del.mutate([b.id])}>
              Borrar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => save.mutate([{ id: b?.id ?? null, name, targetPct: target || '0', maxPct: max || null, notes, sortOrder: b?.sortOrder ?? 0 }])}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" required className="col-span-2">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej.: Núcleo" />
        </Field>
        <Field label="Objetivo (%)">
          <TextInput inputMode="decimal" className="num text-right" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label="Máximo (%)" hint="Opcional, para avisar">
          <TextInput inputMode="decimal" className="num text-right" value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
        <Field label="Notas" className="col-span-2">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
