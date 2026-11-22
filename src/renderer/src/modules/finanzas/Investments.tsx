import { Briefcase, Plus, Warning, WarningCircle } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatMonth, todayISO } from '@shared/dates'
import { ASSET_CLASS_LABEL, OP_TYPE_LABEL } from '@shared/modules/finanzas/labels'
import { formatEur, formatPct } from '@shared/money'
import {
  ASSET_CLASSES,
  INVESTMENT_OP_TYPES,
  type AllocationBlock,
  type AssetClass,
  type Instrument,
  type InvestmentOp,
  type InvestmentOpType
} from '@shared/modules/finanzas/types'
import { BarList, LinesChart, leyendaSeries, type SerieSpec } from './components/charts'
import { DataTable, type Column } from './components/DataTable'
import { useTxEditor } from './components/TxEditor'
import { TradeRepublicImportModal } from './components/TradeRepublicImport'
import type { TrPreview } from '../../../../main/modules/finanzas/importTradeRepublic'
import {
  Aviso,
  Button,
  Card,
  ChartFrame,
  Checkbox,
  CifraEur,
  ConfirmDialog,
  cx,
  DatePicker,
  EmptyState,
  ErrorState,
  Importe,
  KpiCard,
  LoadingState,
  Modal,
  MoneyField,
  PageHeader,
  Seccion,
  Select,
  Tabs,
  Tag,
  TextArea,
  TextField
} from '../../core/ui'
import { api, useApi, useApiMutation } from '../../lib/api'
import { toast } from '../../lib/toast'
import { useCatalog } from '../../lib/catalog'
import { PlanView } from './InvestmentPlan'
import type { HoldingRow } from '@shared/modules/finanzas/investments'

type Tab = 'resumen' | 'plan' | 'ops' | 'precios' | 'activos'

const nf = (v: string | null, max = 6) =>
  v === null ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: max, useGrouping: 'always' } as Intl.NumberFormatOptions).format(Number(v))
/** Precio por unidad: mínimo 2 decimales, máximo 4. */
const pf = (v: string | null) =>
  v === null
    ? '—'
    : `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: 'always' } as Intl.NumberFormatOptions).format(Number(v))} €`

/** Estado vacío dentro de una tarjeta, para las tablas sin filas */
const vacio = (titulo: string, texto: string, accion?: React.ReactNode) => (
  <div className="card">
    <EmptyState icono={<Briefcase size={24} aria-hidden />} titulo={titulo} texto={texto} accion={accion} />
  </div>
)

export function InvestmentsPage() {
  const [tab, setTab] = useState<Tab>('resumen')
  const { cat } = useCatalog()
  const [opForm, setOpForm] = useState<Partial<InvestmentOp> | null>(null)
  const [pricesOpen, setPricesOpen] = useState(false)
  const [trPreview, setTrPreview] = useState<TrPreview | null>(null)
  const navigate = useNavigate()
  const brokers = (cat?.accounts ?? []).filter((a) => a.type === 'INVESTMENT' || a.type === 'CRYPTO')
  return (
    <div data-module="finanzas">
      <PageHeader
        titulo="Inversiones"
        texto="Posiciones calculadas a partir de tus operaciones. Comprar no es gastar: cambias efectivo por un activo. Las comisiones sí son gasto."
        acciones={
          <>
            <Button
              onClick={async () => {
                try {
                  const p = await api('finanzas:tr.pick')
                  if (p) setTrPreview(p)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e))
                }
              }}
            >
              Importar de Trade Republic
            </Button>
            <Button onClick={() => setPricesOpen(true)} disabled={!cat?.instruments.length}>
              Actualizar precios
            </Button>
            <Button variant="primary" icon={<Plus size={16} weight="bold" />} disabled={!brokers.length || !cat?.instruments.length} onClick={() => setOpForm({})}>
              Nueva operación
            </Button>
          </>
        }
      />
      {trPreview && <TradeRepublicImportModal preview={trPreview} onClose={() => setTrPreview(null)} />}
      {brokers.length === 0 ? (
        <div className="card">
          <EmptyState
            icono={<Briefcase size={24} aria-hidden />}
            titulo="Primero crea tu cuenta de bróker"
            texto="En Cuentas, crea una cuenta de tipo «Inversión / bróker» (por ejemplo, Trade Republic) con su efectivo inicial y lo que aportaste antes de empezar a registrarla. Después da de alta tus activos y operaciones aquí."
            accion={<Button onClick={() => navigate('/finanzas/cuentas')}>Ir a Cuentas</Button>}
          />
        </div>
      ) : (
        <>
          <Tabs
            label="Vista de inversiones"
            value={tab}
            onChange={setTab}
            pestanas={[
              { id: 'resumen', texto: 'Cartera' },
              { id: 'plan', texto: 'Plan' },
              { id: 'ops', texto: 'Operaciones' },
              { id: 'precios', texto: 'Precios' },
              { id: 'activos', texto: 'Activos y reparto objetivo' }
            ]}
          />
          <div className="mt-6">
            {tab === 'resumen' && <Overview onNewOp={(d) => setOpForm(d)} />}
            {tab === 'plan' && <PlanView />}
            {tab === 'ops' && <OpsView onEdit={(op) => setOpForm(op)} />}
            {tab === 'precios' && <PricesView />}
            {tab === 'activos' && <AssetsView />}
          </div>
        </>
      )}
      {opForm && <OpForm initial={opForm} onClose={() => setOpForm(null)} />}
      {pricesOpen && <BulkPrices onClose={() => setPricesOpen(false)} />}
    </div>
  )
}

const SERIE_CARTERA: SerieSpec[] = [
  { key: 'v', name: 'Valor (posiciones + efectivo)' },
  { key: 'c', name: 'Aportado' }
]

function Overview({ onNewOp }: { onNewOp: (d: Partial<InvestmentOp>) => void }) {
  const q = useApi('finanzas:inv.overview', [])
  const { maps } = useCatalog()
  const { openTransfer } = useTxEditor()
  if (q.isLoading) return <LoadingState filas={4} etiqueta="Cargando la cartera" />
  if (q.error || !q.data) return <ErrorState titulo="No se ha podido cargar la cartera" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
  const { summary: s, series } = q.data!
  const holdings = s.holdings.filter((h) => Number(h.units) > 0 || h.realizedCents !== 0)
  const cols: Column<HoldingRow>[] = [
    {
      key: 'name',
      header: 'Activo',
      sort: (h) => h.name,
      cell: (h) => (
        <div className="min-w-48 py-1">
          <div className="font-medium">{h.name}</div>
          <div className="t-meta">
            {ASSET_CLASS_LABEL[h.assetClass]}
            {maps.instrument.get(h.instrumentId)?.isin ? ` · ${maps.instrument.get(h.instrumentId)!.isin}` : ''}
            {h.blockId ? ` · ${maps.block.get(h.blockId)?.name}` : ''}
          </div>
        </div>
      )
    },
    {
      key: 'units',
      header: 'Unidades',
      align: 'right',
      sort: (h) => Number(h.units),
      cell: (h) => (
        <div>
          <span className="tnum">{nf(h.units)}</span>
          {/* En ancho estrecho, precio medio y coste bajan aquí */}
          <div className="t-meta tnum @4xl:hidden">Medio {pf(h.avgCost)}</div>
          <div className="t-meta tnum @4xl:hidden">Coste {formatEur(h.costBasisCents)}</div>
        </div>
      )
    },
    { key: 'avg', header: 'Precio medio', align: 'right', soloAncho: true, cell: (h) => <span className="tnum">{pf(h.avgCost)}</span> },
    { key: 'cost', header: 'Coste', align: 'right', soloAncho: true, sort: (h) => h.costBasisCents, cell: (h) => <span className="tnum">{formatEur(h.costBasisCents)}</span> },
    {
      key: 'price',
      header: 'Precio actual',
      align: 'right',
      cell: (h) => (
        <div>
          <span className="tnum">{pf(h.lastPrice)}</span>
          <div className="t-meta">{h.priceSource === 'MANUAL' ? formatDate(h.lastPriceDate) : h.priceSource === 'OPERATION' ? `de operación ${formatDate(h.lastPriceDate)}` : 'sin precio'}</div>
        </div>
      )
    },
    { key: 'value', header: 'Valor', align: 'right', sort: (h) => h.marketValueCents, cell: (h) => <span className="tnum font-semibold">{formatEur(h.marketValueCents)}</span> },
    {
      key: 'pl',
      header: 'Plusvalía',
      align: 'right',
      sort: (h) => h.unrealizedCents,
      cell: (h) => (
        <div>
          <Importe cents={h.unrealizedCents} />
          <div className="tnum t-meta">{formatPct(h.unrealizedPct)}</div>
        </div>
      )
    },
    { key: 'weight', header: 'Peso', align: 'right', sort: (h) => h.weight ?? 0, cell: (h) => <span className="tnum">{formatPct(h.weight)}</span> },
    {
      key: 'act',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      cell: (h) => (
        <Button size="sm" variant="ghost" aria-label={`Operar con ${h.name}`} onClick={() => onNewOp({ instrumentId: h.instrumentId, accountId: h.accountId, type: 'BUY' })}>
          Operar
        </Button>
      )
    }
  ]
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 @lg:grid-cols-2 @4xl:grid-cols-4">
        <KpiCard titulo="Valor de la cartera" valor={<CifraEur cents={s.totalValueCents} />} contexto={`Coste ${formatEur(s.totalCostCents)}`} />
        <KpiCard titulo="Efectivo en el bróker" valor={<CifraEur cents={s.cashCents} />} contexto="Sin invertir todavía" />
        <KpiCard titulo="Aportado de tu bolsillo" valor={<CifraEur cents={s.contributedCents} />} contexto="Previo + transferencias netas" />
        <KpiCard
          titulo="Ganancia total"
          valor={<span className={cx(s.gainCents > 0 && 'text-success')}><CifraEur cents={s.gainCents} signo /></span>}
          contexto={`${formatPct(s.gainPct)} sobre lo aportado`}
        />
      </div>
      <Card titulo="Resultado" subtitulo="Desglose de la ganancia" accion={<Button size="sm" variant="ghost" onClick={() => openTransfer({ description: 'Aportación a inversión' })}>Registrar aportación (transferencia)</Button>}>
        <dl className="auto-grid-wide">
          <div>
            <dt className="t-label">No realizada</dt>
            <dd className="t-body mt-1">
              <Importe cents={s.unrealizedCents} className="font-semibold" /> <span className="tnum t-label">({formatPct(s.unrealizedPct)})</span>
            </dd>
          </div>
          <div>
            <dt className="t-label">Realizada</dt>
            <dd className="t-body mt-1">
              <Importe cents={s.realizedCents} className="font-semibold" />
            </dd>
          </div>
          <div>
            <dt className="t-label">Dividendos e intereses netos</dt>
            <dd className="t-body mt-1">
              <Importe cents={s.dividendsNetCents} className="font-semibold" />
            </dd>
          </div>
          <div>
            <dt className="t-label">Impuestos retenidos</dt>
            <dd className="tnum t-body mt-1 font-semibold">{formatEur(s.taxesCents)}</dd>
          </div>
          <div>
            <dt className="t-label">Comisiones</dt>
            <dd className="tnum t-body mt-1 font-semibold">{formatEur(s.feesCents)}</dd>
          </div>
        </dl>
      </Card>
      {s.alerts.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Avisos de la cartera">
          {s.alerts.map((a, i) => (
            <li key={i}>
              <Aviso tono={a.level === 'error' ? 'error' : 'warning'}>{a.text}</Aviso>
            </li>
          ))}
        </ul>
      )}
      <Seccion titulo="Posiciones">
        <DataTable rows={holdings} columns={cols} rowKey={(h) => h.key} initialSort={{ key: 'value', dir: 'desc' }} empty={vacio('Aún no hay posiciones', 'Da de alta tus activos en «Activos y reparto objetivo» y registra las compras como operaciones.')} />
      </Seccion>
      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card titulo="Reparto objetivo frente al actual" subtitulo="Desviación en puntos porcentuales">
          {s.byBlock.length === 0 ? (
            <p className="t-label">Define tus bloques (por ejemplo 80 % núcleo, 10 % emergentes, 10 % satélites) en «Activos y reparto objetivo».</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table" data-density="compact" aria-label="Reparto objetivo frente al actual">
                  <thead>
                    <tr>
                      <th scope="col">Bloque</th>
                      <th scope="col" className="text-right">
                        Valor
                      </th>
                      <th scope="col" className="text-right">
                        Actual
                      </th>
                      <th scope="col" className="text-right">
                        Objetivo
                      </th>
                      <th scope="col" className="text-right">
                        Desviación
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byBlock.map((b) => (
                      <tr key={b.key}>
                        <td className="min-w-40 py-2">
                          {b.label}
                          <div className="relative mt-2 h-2 w-full r-full bg-track" role="img" aria-label={`${b.label}: ${formatPct(b.weight)} actual${b.targetPct !== null && b.targetPct !== undefined ? `, objetivo ${formatPct(b.targetPct)}` : ''}`}>
                            <div className="absolute h-2 r-full" style={{ width: `${Math.min((b.weight ?? 0) * 100, 100)}%`, background: 'var(--series-1)' }} />
                            {b.targetPct !== null && b.targetPct !== undefined && <div className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${Math.min(b.targetPct * 100, 100)}%` }} title="Objetivo" />}
                          </div>
                        </td>
                        <td className="tnum text-right">{formatEur(b.valueCents)}</td>
                        <td className="tnum text-right">{formatPct(b.weight)}</td>
                        <td className="tnum text-right text-ink-3">{b.targetPct !== null && b.targetPct !== undefined ? formatPct(b.targetPct) : '—'}</td>
                        <td className={cx('tnum text-right', b.deviation && Math.abs(b.deviation) > 0.05 ? 'font-semibold text-warning' : 'text-ink-3')}>
                          {b.deviation && Math.abs(b.deviation) > 0.05 ? <Warning size={14} weight="fill" className="mr-1 inline align-text-bottom" aria-label="Desviación alta" /> : null}
                          {b.deviation === null || b.deviation === undefined ? '—' : `${b.deviation > 0 ? '+' : ''}${(b.deviation * 100).toFixed(1).replace('.', ',')} pp`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="t-meta mt-3">La marca vertical de cada barra es el objetivo. Corrige con dinero nuevo, sin vender.</p>
            </>
          )}
        </Card>
        <Card titulo="Valor frente a lo aportado">
          {series.length > 1 ? (
            <ChartFrame
              titulo="Valor de la cartera y aportado"
              periodo={`${formatMonth(series[0].month, true)} a ${formatMonth(series[series.length - 1].month, true)}`}
              unidad="euros"
              referencia="Si el valor va por encima de lo aportado, hay ganancia."
              leyenda={leyendaSeries(SERIE_CARTERA)}
              tabla={{ columnas: ['Mes', 'Valor', 'Aportado'], filas: series.map((p) => [formatMonth(p.month, true), formatEur(p.valueCents), formatEur(p.contributedCents)]) }}
            >
              <LinesChart leyenda={false} data={series.map((p) => ({ month: p.month, v: p.valueCents, c: p.contributedCents }))} series={SERIE_CARTERA} />
            </ChartFrame>
          ) : (
            <p className="t-label">Con más de un mes de datos verás la evolución.</p>
          )}
        </Card>
      </div>
      <div className="grid gap-6 @4xl:grid-cols-2">
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
    <Card titulo={title}>
      {rows.length ? <BarList rows={rows.map((r) => ({ key: r.key, label: r.label, value: r.valueCents }))} max={6} /> : <p className="t-label">Sin datos. Rellénalo en la ficha de cada activo.</p>}
    </Card>
  )
}

function OpsView({ onEdit }: { onEdit: (op: InvestmentOp) => void }) {
  const q = useApi('finanzas:inv.ops', [])
  const { maps, accountName } = useCatalog()
  if (q.isLoading) return <LoadingState filas={4} etiqueta="Cargando las operaciones" />
  if (q.error) return <ErrorState titulo="No se han podido cargar las operaciones" texto={q.error.message} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
  const cols: Column<InvestmentOp>[] = [
    { key: 'date', header: 'Fecha', sort: (o) => o.date + o.createdAt, cell: (o) => <span className="tnum">{formatDate(o.date)}</span> },
    { key: 'type', header: 'Tipo', sort: (o) => o.type, cell: (o) => <Tag tono={o.type === 'SELL' ? 'info' : o.type === 'BUY' ? 'accent' : undefined}>{OP_TYPE_LABEL[o.type]}</Tag> },
    { key: 'inst', header: 'Activo', sort: (o) => maps.instrument.get(o.instrumentId ?? '')?.name ?? '', cell: (o) => (o.instrumentId ? maps.instrument.get(o.instrumentId)?.name : <span className="text-ink-3">Cuenta</span>) },
    { key: 'qty', header: 'Unidades', align: 'right', cell: (o) => <span className="tnum">{o.type === 'SPLIT' ? `× ${nf(o.splitRatio)}` : nf(o.quantity)}</span> },
    { key: 'price', header: 'Precio', align: 'right', cell: (o) => <span className="tnum">{pf(o.price)}</span> },
    {
      key: 'amount',
      header: 'Importe',
      align: 'right',
      cell: (o) => (
        <span className="tnum">
          {o.quantity && o.price ? formatEur(Math.round(Number(o.quantity) * Number(o.price) * 100)) : o.amountCents !== null ? formatEur(o.amountCents) : '—'}
        </span>
      )
    },
    { key: 'fee', header: 'Comisión', align: 'right', cell: (o) => <span className="tnum text-ink-2">{o.feeCents ? formatEur(o.feeCents) : '—'}</span> },
    { key: 'tax', header: 'Retención', align: 'right', cell: (o) => <span className="tnum text-ink-2">{o.taxCents ? formatEur(o.taxCents) : '—'}</span> },
    { key: 'acc', header: 'Cuenta', cell: (o) => <span className="text-ink-2">{accountName(o.accountId)}</span> },
    { key: 'cash', header: 'Mueve efectivo', cell: (o) => (o.affectsCash ? 'Sí' : <span className="text-ink-3">No</span>) }
  ]
  return (
    <DataTable
      rows={q.data ?? []}
      columns={cols}
      rowKey={(o) => o.id}
      onRowClick={onEdit}
      initialSort={{ key: 'date', dir: 'desc' }}
      empty={vacio('Sin operaciones', 'Registra compras, ventas, dividendos, comisiones y splits. Las unidades y el coste se calculan solos.')}
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
  const [borrar, setBorrar] = useState(false)
  const tipoRef = useRef<HTMLSelectElement>(null)
  const save = useApiMutation('finanzas:inv.saveOp', { success: 'Operación guardada', onSuccess: onClose })
  const del = useApiMutation('finanzas:inv.deleteOp', { success: 'Operación borrada', onSuccess: onClose })
  const needsQty = type === 'BUY' || type === 'SELL'
  const gross = needsQty && quantity && price ? Number(quantity.replace(',', '.')) * Number(price.replace(',', '.')) : null
  const acc = cat?.accounts.find((a) => a.id === accountId)
  const beforeOpening = acc && date < acc.openingDate
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={initial.id ? 'Editar operación' : 'Nueva operación'}
        ancho="lg"
        inicial={tipoRef}
        onCerrar={onClose}
        pie={
          <>
            {initial.id && (
              <Button variant="danger" className="mr-auto" onClick={() => setBorrar(true)}>
                Borrar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              cargando={save.isPending}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Select ref={tipoRef} label="Tipo" value={type} onChange={(e) => setType(e.target.value as InvestmentOpType)}>
            {INVESTMENT_OP_TYPES.map((t) => (
              <option key={t} value={t}>
                {OP_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <DatePicker label="Fecha" value={date} onChange={setDate} />
          <Select
            label="Activo"
            ayuda={type === 'FEE' || type === 'INTEREST' ? 'Opcional (comisión o interés de la cuenta).' : undefined}
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
          <Select label="Cuenta del bróker" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {brokers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          {needsQty && (
            <>
              <TextField label="Unidades" unidad="uds." inputMode="decimal" ayuda="Admite decimales (fracciones)." value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0,000000" className="[&_input]:tabular-nums [&_input]:text-right" />
              <TextField label="Precio por unidad" unidad="€" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" className="[&_input]:tabular-nums [&_input]:text-right" />
              <p className="t-label sm:col-span-2">
                Importe: <span className="tnum font-semibold text-ink">{gross !== null && Number.isFinite(gross) ? formatEur(Math.round(gross * 100)) : '—'}</span>
              </p>
            </>
          )}
          {(type === 'DIVIDEND' || type === 'INTEREST' || type === 'FEE') && <MoneyField label={type === 'FEE' ? 'Importe de la comisión' : 'Importe bruto'} value={amount} onChange={setAmount} />}
          {type === 'SPLIT' && (
            <TextField label="Proporción" unidad="×" inputMode="decimal" ayuda="Unidades nuevas por cada una antigua (2 = split 2×1; 0,1 = contrasplit 1×10)." value={ratio} onChange={(e) => setRatio(e.target.value)} className="[&_input]:tabular-nums [&_input]:text-right" />
          )}
          {type !== 'SPLIT' && type !== 'FEE' && <MoneyField label="Comisión" ayuda="Se registra como gasto." value={fee} onChange={setFee} />}
          {(type === 'DIVIDEND' || type === 'INTEREST' || type === 'SELL') && <MoneyField label="Impuestos retenidos" value={tax} onChange={setTax} />}
          <div className="sm:col-span-2">
            <Checkbox checked={affectsCash} onChange={setAffectsCash} label="Mueve el efectivo de la cuenta del bróker" ayuda="Desmárcalo solo si el efectivo ya está registrado de otra forma." />
          </div>
          {beforeOpening && affectsCash && (
            <div className="sm:col-span-2">
              <Aviso tono="info">La fecha es anterior a la apertura de la cuenta: cuenta para las unidades y el coste, pero no mueve el efectivo (ya está dentro del saldo inicial).</Aviso>
            </div>
          )}
          <TextArea className="sm:col-span-2" label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
      {borrar && initial.id && (
        <ConfirmDialog titulo="¿Borrar la operación?" texto="Se borran también sus apuntes de efectivo." confirmar="Borrar operación" onCancelar={() => setBorrar(false)} onConfirmar={() => (setBorrar(false), del.mutate([initial.id!]))} />
      )}
    </div>
  )
}

function PricesView() {
  const q = useApi('finanzas:inv.prices', [])
  const { cat, maps } = useCatalog()
  const [inst, setInst] = useState<string>('')
  const del = useApiMutation('finanzas:inv.deletePrice', { success: 'Precio borrado' })
  const rows = (q.data ?? []).filter((p) => !inst || p.instrumentId === inst).sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <Select label="Activo" className="w-72" value={inst} onChange={(e) => setInst(e.target.value)}>
          <option value="">Todos los activos</option>
          {cat?.instruments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <p className="t-label pb-2">Precios que introduces a mano con su fecha. La app usa el último disponible en cada fecha.</p>
      </div>
      <DataTable
        rows={rows}
        rowKey={(p) => p.id}
        columns={[
          { key: 'date', header: 'Fecha', cell: (p) => <span className="tnum">{formatDate(p.date)}</span> },
          { key: 'inst', header: 'Activo', cell: (p) => maps.instrument.get(p.instrumentId)?.name ?? p.instrumentId },
          { key: 'price', header: 'Precio', align: 'right', cell: (p) => <span className="tnum">{pf(p.price)}</span> },
          { key: 'notes', header: 'Nota', cell: (p) => <span className="text-ink-2">{p.notes}</span> },
          {
            key: 'del',
            header: <span className="sr-only">Acciones</span>,
            align: 'right',
            cell: (p) => (
              <Button size="sm" variant="ghost" aria-label={`Borrar el precio del ${formatDate(p.date)}`} onClick={() => del.mutate([p.id])}>
                Borrar
              </Button>
            )
          }
        ]}
        empty={vacio('Sin precios', 'Usa «Actualizar precios» para anotar el precio actual de cada activo.')}
      />
    </div>
  )
}

function BulkPrices({ onClose }: { onClose: () => void }) {
  const { cat } = useCatalog()
  const [date, setDate] = useState(todayISO())
  const [values, setValues] = useState<Record<string, string>>({})
  const primero = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:inv.savePrice', { silentError: false })
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
    <div data-module="finanzas" className="contents">
      <Modal
        titulo="Actualizar precios"
        ancho="lg"
        onCerrar={onClose}
        pie={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="accent" cargando={saving} onClick={submit}>
              Guardar precios
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <DatePicker label="Fecha de los precios" value={date} onChange={setDate} />
          <ul className="divide-line">
            {instruments.map((i, n) => (
              <li key={i.id} className="grid items-center gap-4 py-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <span className="t-body min-w-0">
                  {i.name}
                  <span className="t-meta block">{i.isin ?? i.ticker ?? ''}</span>
                </span>
                <TextField
                  ref={n === 0 ? primero : undefined}
                  label={`Precio de ${i.name}`}
                  ocultarEtiqueta
                  unidad="€"
                  inputMode="decimal"
                  placeholder="por unidad"
                  value={values[i.id] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [i.id]: e.target.value }))}
                  className="[&_input]:tabular-nums [&_input]:text-right"
                />
              </li>
            ))}
          </ul>
          <p className="t-meta">Deja en blanco los que no quieras actualizar. Si ya hay precio en esa fecha, se sustituye.</p>
        </div>
      </Modal>
    </div>
  )
}

function AssetsView() {
  const { cat, maps, accountName } = useCatalog()
  const [inst, setInst] = useState<Instrument | 'new' | null>(null)
  const [block, setBlock] = useState<AllocationBlock | 'new' | null>(null)
  const blocks = cat?.blocks ?? []
  const targetSum = blocks.reduce((s, b) => s + Number(b.targetPct), 0)
  return (
    <div className="flex flex-col gap-10">
      <Seccion
        titulo="Activos"
        texto="Ficha editable de cada activo: identificación, clase, región, sector, bloque y peso máximo."
        acciones={
          <Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={() => setInst('new')}>
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
                <div className="min-w-48 py-1">
                  <div className={i.active ? 'font-medium' : 'text-ink-3'}>{i.name}</div>
                  <div className="t-meta">{[i.isin, i.ticker].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              )
            },
            { key: 'class', header: 'Clase', cell: (i) => ASSET_CLASS_LABEL[i.assetClass] },
            { key: 'block', header: 'Bloque', cell: (i) => (i.blockId ? maps.block.get(i.blockId)?.name : <span className="text-ink-3">—</span>) },
            { key: 'region', header: 'Región', cell: (i) => i.region ?? <span className="text-ink-3">—</span> },
            { key: 'sector', header: 'Sector', cell: (i) => i.sector ?? <span className="text-ink-3">—</span> },
            { key: 'cur', header: 'Divisa', cell: (i) => i.currency },
            { key: 'max', header: 'Peso máx.', align: 'right', cell: (i) => <span className="tnum">{i.maxWeightPct ? `${i.maxWeightPct.replace('.', ',')} %` : '—'}</span> },
            { key: 'acc', header: 'Cuenta', cell: (i) => (i.accountId ? accountName(i.accountId) : '—') }
          ]}
          empty={vacio('Sin activos', 'Da de alta cada ETF, acción, fondo o cripto que tengas.', <Button variant="primary" onClick={() => setInst('new')}>Nuevo activo</Button>)}
        />
      </Seccion>
      <Seccion
        titulo="Reparto objetivo por bloques"
        texto="Qué parte de cada 100 € invertidos va a cada bloque. Puedes cambiarlo cuando quieras."
        acciones={
          <Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={() => setBlock('new')}>
            Nuevo bloque
          </Button>
        }
      >
        {blocks.length > 0 && Math.abs(targetSum - 100) > 0.001 && (
          <div className="mb-3">
            <Aviso tono="warning">Los objetivos suman {String(targetSum).replace('.', ',')} %; deberían sumar 100 %.</Aviso>
          </div>
        )}
        <DataTable
          rows={blocks}
          rowKey={(b) => b.id}
          onRowClick={(b) => setBlock(b)}
          columns={[
            { key: 'name', header: 'Bloque', cell: (b) => <span className="font-medium">{b.name}</span> },
            { key: 'target', header: 'Objetivo', align: 'right', cell: (b) => <span className="tnum">{b.targetPct.replace('.', ',')} %</span> },
            { key: 'max', header: 'Máximo', align: 'right', cell: (b) => (b.maxPct ? <span className="tnum">{b.maxPct.replace('.', ',')} %</span> : '—') },
            { key: 'n', header: 'Activos', align: 'right', cell: (b) => <span className="tnum">{(cat?.instruments ?? []).filter((i) => i.blockId === b.id).length}</span> },
            { key: 'notes', header: 'Notas', cell: (b) => <span className="text-ink-2">{b.notes}</span> }
          ]}
          empty={vacio('Sin bloques', 'Ejemplo: Núcleo MSCI World 80 %, Emergentes 10 %, Satélites 10 % (máx. 20 %).', <Button variant="primary" onClick={() => setBlock('new')}>Nuevo bloque</Button>)}
        />
      </Seccion>
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
  const nombreRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:inv.saveInstrument', { success: (x) => `Activo guardado: ${x.name}`, onSuccess: onClose })
  const del = useApiMutation('finanzas:inv.deleteInstrument', { success: 'Activo borrado', onSuccess: onClose })
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={i ? `Editar ${i.name}` : 'Nuevo activo'}
        ancho="lg"
        inicial={nombreRef}
        onCerrar={onClose}
        pie={
          <>
            {i && (
              <Button variant="danger" className="mr-auto" onClick={() => del.mutate([i.id])}>
                Borrar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              cargando={save.isPending}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField ref={nombreRef} className="sm:col-span-2" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Xtrackers MSCI World 1C" />
          <TextField label="ISIN" value={isin} onChange={(e) => setIsin(e.target.value.toUpperCase())} />
          <TextField label="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />
          <Select label="Clase de activo" value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
            {ASSET_CLASSES.map((c) => (
              <option key={c} value={c}>
                {ASSET_CLASS_LABEL[c]}
              </option>
            ))}
          </Select>
          <TextField label="Divisa del activo" ayuda="Los precios se anotan en euros." value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          <TextField label="Región" ayuda="Ej.: Global desarrollados, EE. UU., Emergentes." value={region} onChange={(e) => setRegion(e.target.value)} />
          <TextField label="Sector" ayuda="Ej.: Diversificado, Tecnología, Energía." value={sector} onChange={(e) => setSector(e.target.value)} />
          <Select label="Bloque del reparto" value={blockId} onChange={(e) => setBlockId(e.target.value)}>
            <option value="">—</option>
            {cat?.blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <TextField
            label="Peso máximo en la cartera"
            unidad="%"
            inputMode="decimal"
            ayuda="Avisa si lo supera. Vacío = usa el aviso general de concentración en acciones."
            value={maxW}
            onChange={(e) => setMaxW(e.target.value)}
            className="[&_input]:tabular-nums [&_input]:text-right"
          />
          <Select label="Cuenta habitual" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">—</option>
            {cat?.accounts
              .filter((a) => a.type === 'INVESTMENT' || a.type === 'CRYPTO')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
          <div className="flex items-end pb-2">
            <Checkbox checked={active} onChange={setActive} label="Activo" />
          </div>
          <TextArea className="sm:col-span-2" label="Notas / tesis" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </Modal>
    </div>
  )
}

function BlockForm({ block: b, onClose }: { block: AllocationBlock | null; onClose: () => void }) {
  const [name, setName] = useState(b?.name ?? '')
  const [target, setTarget] = useState(b?.targetPct?.replace('.', ',') ?? '')
  const [max, setMax] = useState(b?.maxPct?.replace('.', ',') ?? '')
  const [notes, setNotes] = useState(b?.notes ?? '')
  const nombreRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:inv.saveBlock', { success: 'Bloque guardado', onSuccess: onClose })
  const del = useApiMutation('finanzas:inv.deleteBlock', { success: 'Bloque borrado', onSuccess: onClose })
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={b ? `Editar ${b.name}` : 'Nuevo bloque'}
        inicial={nombreRef}
        onCerrar={onClose}
        pie={
          <>
            {b && (
              <Button variant="danger" className="mr-auto" onClick={() => del.mutate([b.id])}>
                Borrar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="accent" cargando={save.isPending} onClick={() => save.mutate([{ id: b?.id ?? null, name, targetPct: target || '0', maxPct: max || null, notes, sortOrder: b?.sortOrder ?? 0 }])}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField ref={nombreRef} className="sm:col-span-2" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Núcleo" />
          <TextField label="Objetivo" unidad="%" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="[&_input]:tabular-nums [&_input]:text-right" />
          <TextField label="Máximo" unidad="%" inputMode="decimal" ayuda="Opcional, para avisar." value={max} onChange={(e) => setMax(e.target.value)} className="[&_input]:tabular-nums [&_input]:text-right" />
          <TextArea className="sm:col-span-2" label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}
