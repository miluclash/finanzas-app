import { ArrowsLeftRight, ChatText, MagnifyingGlass, Plus, Receipt, Warning, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatDate, formatMonth } from '@shared/dates'
import { TX_STATUS_LABEL, TX_TYPE_LABEL } from '@shared/modules/finanzas/labels'
import { formatEur } from '@shared/money'
import type { TxFilter } from '@shared/modules/finanzas/schemas'
import { TX_TYPES, type TxStatus, type TxType } from '@shared/modules/finanzas/types'
import { useTxEditor } from './components/TxEditor'
import {
  Button,
  Card,
  Checkbox,
  type Columna,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  Importe,
  LoadingState,
  type OrdenTabla,
  PageHeader,
  SegmentedControl,
  Select,
  StatusBadge,
  Tabs,
  Tag,
  TextField,
  type Pastilla
} from '../../core/ui'
import { guardarLocal, leerLocal } from '../../core/shell/useViewport'
import { useApi, useApiMutation } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'
import type { TxRow } from '../../../../main/modules/finanzas/transactions'

const PAGE = 300
type Densidad = 'compact' | 'normal' | 'comfortable'
const CLAVE_DENSIDAD = 'finanzas-densidad-tabla'
const leerDensidad = (): Densidad => {
  const v = leerLocal(CLAVE_DENSIDAD)
  return v === 'compact' || v === 'comfortable' ? v : 'normal'
}
/** Lo que está pendiente de confirmar por el usuario antes de anular */
type Anulacion = { ids: string[]; titulo: string; texto: string }

export function TransactionsPage() {
  const [params, setParams] = useSearchParams()
  const view = params.get('vista') === 'revision' ? 'revision' : 'todos'
  const review = useApi('finanzas:tx.reviewQueue', [])
  const reviewCount = (review.data?.pending.length ?? 0) + (review.data?.issues.length ?? 0) + (review.data?.duplicates.length ?? 0)
  const { openNew, openTransfer } = useTxEditor()
  return (
    <div data-module="finanzas">
      <PageHeader
        titulo="Movimientos"
        texto="El libro de movimientos es la fuente de todas las cifras. Abre uno para ver el detalle."
        acciones={
          <>
            <Button kbd="T" icon={<ArrowsLeftRight size={16} />} onClick={() => openTransfer()}>
              Transferencia
            </Button>
            <Button variant="primary" kbd="N" icon={<Plus size={16} weight="bold" />} onClick={() => openNew()}>
              Nuevo movimiento
            </Button>
          </>
        }
      />
      <Tabs
        label="Vista"
        value={view}
        onChange={(v) => {
          const p = new URLSearchParams(params)
          if (v === 'revision') p.set('vista', 'revision')
          else p.delete('vista')
          setParams(p)
        }}
        pestanas={[
          { id: 'todos', texto: 'Todos' },
          { id: 'revision', texto: 'Por revisar', contador: reviewCount }
        ]}
      />
      <div className="mt-4">{view === 'revision' ? <ReviewView /> : <ListView />}</div>
    </div>
  )
}

function ListView() {
  const [params, setParams] = useSearchParams()
  const { cat, accountName, categoryName, groupName, maps } = useCatalog()
  const { openEdit } = useTxEditor()
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [abierta, setAbierta] = useState<string | null>(null)
  const [densidad, setDensidad] = useState<Densidad>(leerDensidad)
  const [avanzados, setAvanzados] = useState(false)
  const [orden, setOrden] = useState<OrdenTabla>({ id: 'date', dir: 'desc' })
  const [anulacion, setAnulacion] = useState<Anulacion | null>(null)
  const [busqueda, setBusqueda] = useState(params.get('q') ?? '')
  const filter: TxFilter = useMemo(() => {
    const f: TxFilter = { limit }
    const get = (k: string) => params.get(k) || undefined
    f.search = get('q')
    f.month = get('mes')
    f.from = get('desde')
    f.to = get('hasta')
    f.accountId = get('cuenta')
    f.categoryId = get('categoria')
    f.groupId = get('grupo')
    f.goalId = get('objetivo')
    f.recurringId = get('recurrente')
    const tipo = get('tipo')
    if (tipo && (TX_TYPES as readonly string[]).includes(tipo)) f.type = tipo as TxType
    if (params.get('gastos')) f.types = ['EXPENSE', 'REFUND']
    const estado = get('estado')
    if (estado === 'CANCELLED' || params.get('anulados')) f.includeCancelled = true
    if (estado) f.status = estado as TxStatus
    const nat = get('naturaleza')
    if (nat) f.nature = nat as TxFilter['nature']
    return f
  }, [params, limit])
  const q = useApi('finanzas:tx.list', [filter], { placeholderData: (p) => p })
  const setStatus = useApiMutation('finanzas:tx.setStatus', { success: (n) => (n === 1 ? 'Movimiento actualizado' : `${n} movimientos actualizados`), onSuccess: () => setSelected(new Set()) })
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
    setLimit(PAGE)
  }
  // La búsqueda escribe en la dirección con un pequeño retardo para no consultar en cada tecla
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((params.get('q') ?? '') !== busqueda.trim()) set('q', busqueda.trim() || null)
    }, 250)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])
  const cambiarDensidad = (d: Densidad) => {
    setDensidad(d)
    guardarLocal(CLAVE_DENSIDAD, d)
  }

  // Filtros activos como pastillas: los avanzados y los que llegan desde otras pantallas
  const pastillas: Pastilla[] = []
  if (params.get('cuenta')) pastillas.push({ id: 'cuenta', texto: `Cuenta: ${accountName(params.get('cuenta'))}` })
  if (params.get('categoria')) pastillas.push({ id: 'categoria', texto: `Categoría: ${categoryName(params.get('categoria') === '__none' ? null : params.get('categoria'))}` })
  if (params.get('tipo') && (TX_TYPES as readonly string[]).includes(params.get('tipo')!)) pastillas.push({ id: 'tipo', texto: `Tipo: ${TX_TYPE_LABEL[params.get('tipo') as TxType].toLowerCase()}` })
  if (params.get('estado')) pastillas.push({ id: 'estado', texto: `Estado: ${TX_STATUS_LABEL[params.get('estado') as TxStatus]?.toLowerCase() ?? params.get('estado')}` })
  if (params.get('anulados')) pastillas.push({ id: 'anulados', texto: 'Incluye anulados' })
  if (params.get('grupo')) pastillas.push({ id: 'grupo', texto: `Grupo: ${groupName(params.get('grupo')!)}` })
  if (params.get('gastos')) pastillas.push({ id: 'gastos', texto: 'Solo gastos y reembolsos' })
  if (params.get('objetivo')) pastillas.push({ id: 'objetivo', texto: `Objetivo: ${maps.goal.get(params.get('objetivo')!)?.name}` })
  if (params.get('recurrente')) pastillas.push({ id: 'recurrente', texto: `Recurrente: ${maps.rule.get(params.get('recurrente')!)?.concept}` })
  if (params.get('naturaleza')) pastillas.push({ id: 'naturaleza', texto: `Gasto ${params.get('naturaleza') === 'FIXED' ? 'fijo' : params.get('naturaleza') === 'EXTRAORDINARY' ? 'extraordinario' : 'variable'}` })
  if (params.get('desde')) pastillas.push({ id: 'desde', texto: `Desde ${formatDate(params.get('desde'))}` })
  if (params.get('hasta')) pastillas.push({ id: 'hasta', texto: `Hasta ${formatDate(params.get('hasta'))}` })
  const limpiar = () => {
    const p = new URLSearchParams()
    for (const k of ['q', 'mes', 'vista']) if (params.get(k)) p.set(k, params.get(k)!)
    setParams(p)
  }

  // Ordenar las filas ya cargadas por la columna elegida (la fecha, de más reciente a más antigua, es el orden inicial)
  const claves: Record<string, (t: TxRow) => string | number | null> = {
    date: (t) => t.date + t.id,
    description: (t) => t.description,
    category: (t) => (t.type === 'TRANSFER' ? 'zz' : categoryName(t.categoryId)),
    account: (t) => accountName(t.accountId),
    amount: (t) => t.amountCents
  }
  const filas = useMemo(() => {
    const rows = q.data?.rows ?? []
    const f = claves[orden.id]
    if (!f) return rows
    const dir = orden.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = f(a)
      const vb = f(b)
      if (va === vb) return 0
      if (va === null) return 1
      if (vb === null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, orden, cat])

  const columnas: Columna<TxRow>[] = [
    { id: 'date', cabecera: 'Fecha', ancho: '6.5rem', ordenable: true, celda: (t) => <span className="tnum text-ink-2">{formatDate(t.date)}</span> },
    {
      id: 'description',
      cabecera: 'Concepto',
      ordenable: true,
      celda: (t) => {
        const anulado = t.status === 'CANCELLED'
        return (
          <div className="min-w-0 py-1">
            <div className="flex items-center gap-2">
              <span className={anulado ? 'truncate text-ink-3 line-through' : 'truncate font-medium'}>{t.description}</span>
              {t.type === 'REFUND' && <Tag tono="accent">Reembolso</Tag>}
              {t.recurringId && <Tag>Recurrente</Tag>}
              {t.notes && <ChatText size={16} className="shrink-0 text-ink-3" aria-label="Tiene nota" />}
            </div>
            {(t.subcategoryId || t.merchant || t.goalId) && (
              <div className="t-meta flex flex-wrap items-center gap-x-2 truncate">
                {t.subcategoryId && <span>{maps.subcategory.get(t.subcategoryId)?.name}</span>}
                {t.merchant && <span>{t.merchant}</span>}
                {t.goalId && <span>Objetivo: {maps.goal.get(t.goalId)?.name}</span>}
              </div>
            )}
          </div>
        )
      }
    },
    {
      id: 'category',
      cabecera: 'Categoría',
      ancho: '12rem',
      ordenable: true,
      celda: (t) =>
        t.type === 'TRANSFER' ? (
          <span className="text-ink-3">Transferencia</span>
        ) : t.type === 'INCOME' || t.type === 'EXPENSE' || t.type === 'REFUND' ? (
          <span className="text-ink-2">{categoryName(t.categoryId)}</span>
        ) : (
          <span className="text-ink-3">{TX_TYPE_LABEL[t.type]}</span>
        )
    },
    { id: 'account', cabecera: 'Cuenta', ancho: '11rem', ordenable: true, celda: (t) => <span className="text-ink-2">{accountName(t.accountId)}</span> },
    { id: 'amount', cabecera: 'Importe', ancho: '8.5rem', alinear: 'right', ordenable: true, celda: (t) => <Importe cents={t.amountCents} className={t.status === 'CANCELLED' ? 'text-ink-3 line-through' : 'font-medium'} /> },
    {
      id: 'status',
      cabecera: <span className="sr-only">Estado</span>,
      ancho: '10rem',
      alinear: 'right',
      celda: (t) => {
        const avisos = t.warnings.filter((w) => w !== 'Pendiente de revisar.')
        return (
          <span className="flex flex-wrap items-center justify-end gap-1">
            {t.status === 'PENDING_REVIEW' && (
              <Tag tono="warning" icono={<Warning size={12} weight="fill" aria-hidden />}>
                Pendiente
              </Tag>
            )}
            {t.status === 'CANCELLED' && <Tag>Anulado</Tag>}
            {t.errors.length > 0 && (
              <Tag tono="warning" icono={<WarningCircle size={12} weight="fill" aria-hidden />}>
                Datos incorrectos
              </Tag>
            )}
            {t.errors.length === 0 && avisos.length > 0 && (
              <Tag tono="info" icono={<Warning size={12} weight="fill" aria-hidden />}>
                Aviso
              </Tag>
            )}
          </span>
        )
      }
    }
  ]

  const pedirAnular = (t: TxRow) =>
    setAnulacion({ ids: [t.id], titulo: '¿Anular este movimiento?', texto: `«${t.description}» (${formatEur(t.amountCents, { sign: true })}) dejará de contar en tus cifras, pero se conserva en el historial.` })

  return (
    <>
      <FilterBar
        principal={
          <>
            <TextField className="min-w-72 max-w-md flex-1" label="Buscar" ocultarEtiqueta placeholder="Buscar descripción, comercio, nota, importe…" icono={<MagnifyingGlass size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <Select className="w-44" label="Periodo" ocultarEtiqueta value={params.get('mes') ?? ''} onChange={(e) => set('mes', e.target.value || null)}>
              <option value="">Todos los meses</option>
              {monthOptions(cat?.settings.trackingStart).map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m, true)}
                </option>
              ))}
            </Select>
            <Select className="w-44" label="Estado" ocultarEtiqueta value={params.get('estado') ?? ''} onChange={(e) => set('estado', e.target.value || null)}>
              <option value="">Cualquier estado</option>
              {(['CONFIRMED', 'PENDING_REVIEW', 'CANCELLED'] as TxStatus[]).map((s) => (
                <option key={s} value={s}>
                  {TX_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </>
        }
        contador={pastillas.length}
        abierto={avanzados}
        onAlternar={() => setAvanzados((v) => !v)}
        avanzados={
          <div className="auto-grid-wide items-end">
            <Select label="Cuenta" value={params.get('cuenta') ?? ''} onChange={(e) => set('cuenta', e.target.value || null)}>
              <option value="">Todas las cuentas</option>
              {cat?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select label="Categoría" value={params.get('categoria') ?? ''} onChange={(e) => set('categoria', e.target.value || null)}>
              <option value="">Todas las categorías</option>
              <option value="__none">Sin categoría</option>
              {cat?.groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {cat.categories
                    .filter((c) => c.groupId === g.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
            <Select label="Tipo" value={params.get('tipo') ?? ''} onChange={(e) => set('tipo', e.target.value || null)}>
              <option value="">Todos los tipos</option>
              {TX_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TX_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
            <div className="pb-2">
              <Checkbox checked={!!params.get('anulados')} onChange={(v) => set('anulados', v ? '1' : null)} label="Incluir anulados" />
            </div>
          </div>
        }
        pastillas={pastillas}
        onQuitar={(id) => set(id, null)}
        onLimpiar={limpiar}
      />
      {q.error && <ErrorState titulo="No se han podido cargar los movimientos" texto={q.error.message} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />}
      {!q.data ? (
        !q.error && (
          <div className="card">
            <LoadingState filas={4} etiqueta="Cargando los movimientos" />
          </div>
        )
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
            <p className="t-label" aria-live="polite">
              Mostrando {q.data.rows.length} de {q.data.total} movimientos
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1" aria-label="Totales de lo filtrado">
                <div className="flex items-baseline gap-2">
                  <dt className="t-label">Ingresos</dt>
                  <dd className="tnum t-body font-semibold">{formatEur(q.data.incomeCents)}</dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="t-label">Gastos</dt>
                  <dd className="tnum t-body font-semibold">{formatEur(q.data.expenseCents, { sign: true })}</dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="t-label">Neto</dt>
                  <dd className="tnum t-body font-semibold">{formatEur(q.data.netCents, { sign: true })}</dd>
                </div>
              </dl>
              <SegmentedControl
                label="Densidad de la tabla"
                tamano="sm"
                value={densidad}
                onChange={cambiarDensidad}
                opciones={[
                  { id: 'compact', texto: 'Compacta' },
                  { id: 'normal', texto: 'Normal' },
                  { id: 'comfortable', texto: 'Cómoda' }
                ]}
              />
            </div>
          </div>
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 r-control bg-raised px-4 py-2" role="region" aria-label="Acciones sobre lo seleccionado">
              <span className="t-label mr-2 font-semibold text-ink">{selected.size === 1 ? '1 seleccionado' : `${selected.size} seleccionados`}</span>
              <Button size="sm" onClick={() => setStatus.mutate([[...selected], 'CONFIRMED'])}>
                Confirmar
              </Button>
              <Button size="sm" onClick={() => setStatus.mutate([[...selected], 'PENDING_REVIEW'])}>
                Marcar pendiente
              </Button>
              <Button size="sm" variant="danger" onClick={() => setAnulacion({ ids: [...selected], titulo: `¿Anular ${selected.size} movimientos?`, texto: 'Dejarán de contar, pero se conservan en el historial.' })}>
                Anular
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
                Quitar la selección
              </Button>
            </div>
          )}
          <div className="card card-flush">
            <div className="overflow-x-auto">
              <DataTable
                titulo="Movimientos"
                columnas={columnas}
                filas={filas}
                id={(t) => t.id}
                abierta={abierta}
                onAlternar={(id) => setAbierta(abierta === id ? null : id)}
                densidad={densidad}
                nombreFila={(t) => `${t.description}, ${formatEur(t.amountCents)}`}
                seleccion={selected}
                onSeleccion={setSelected}
                orden={orden}
                onOrden={(c) => setOrden((o) => (o.id === c ? { id: c, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { id: c, dir: 'desc' }))}
                vacio={
                  <EmptyState icono={<Receipt size={24} aria-hidden />} titulo="No hay movimientos con estos filtros" texto="Cambia los filtros o registra uno nuevo con la tecla N." />
                }
                detalle={(t) => (
                  <Detalle
                    t={t}
                    categoria={t.type === 'TRANSFER' ? 'Transferencia' : t.type === 'INCOME' || t.type === 'EXPENSE' || t.type === 'REFUND' ? `${categoryName(t.categoryId)}${t.subcategoryId ? ` › ${maps.subcategory.get(t.subcategoryId)?.name}` : ''}` : TX_TYPE_LABEL[t.type]}
                    cuenta={accountName(t.accountId)}
                    recurrente={t.recurringId ? maps.rule.get(t.recurringId)?.concept : undefined}
                    objetivo={t.goalId ? maps.goal.get(t.goalId)?.name : undefined}
                    onEditar={() => openEdit(t.id)}
                    onEstado={(st) => setStatus.mutate([[t.id], st])}
                    onAnular={() => pedirAnular(t)}
                  />
                )}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
              <span className="t-meta">Los gastos llevan «−»; los ingresos, «+».</span>
              {q.data.total > q.data.rows.length && (
                <Button size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  Cargar más movimientos ({q.data.total - q.data.rows.length} restantes)
                </Button>
              )}
            </div>
          </div>
        </>
      )}
      {anulacion && (
        <ConfirmDialog
          titulo={anulacion.titulo}
          texto={anulacion.texto}
          confirmar={anulacion.ids.length === 1 ? 'Anular movimiento' : 'Anular movimientos'}
          onCancelar={() => setAnulacion(null)}
          onConfirmar={() => {
            setStatus.mutate([anulacion.ids, 'CANCELLED'])
            setAnulacion(null)
          }}
        />
      )}
    </>
  )
}

/** Fila abierta: lo que no cabe en la tabla y las acciones. Va por tono dentro de la propia fila, sin tarjeta dentro de tarjeta */
function Detalle({ t, categoria, cuenta, recurrente, objetivo, onEditar, onEstado, onAnular }: { t: TxRow; categoria: string; cuenta: string; recurrente?: string; objetivo?: string; onEditar: () => void; onEstado: (s: TxStatus) => void; onAnular: () => void }) {
  const avisos = [...t.errors, ...t.warnings.filter((w) => w !== 'Pendiente de revisar.')]
  const datos: [string, string][] = [
    ['Categoría', categoria || '—'],
    ['Cuenta', cuenta],
    ['Estado', TX_STATUS_LABEL[t.status]],
    ['Comercio', t.merchant ?? '—'],
    ['Importe', formatEur(t.amountCents, { sign: true })],
    ['Nota', t.notes ?? 'Sin nota']
  ]
  if (recurrente) datos.push(['Recurrente', recurrente])
  if (objetivo) datos.push(['Objetivo', objetivo])
  return (
    <div>
      <dl className="auto-grid-wide t-label">
        {datos.map(([k, v]) => (
          <div key={k}>
            <dt className="t-meta">{k}</dt>
            <dd className="t-body mt-1 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {avisos.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1">
          {avisos.map((m) => (
            <li key={m}>
              <StatusBadge tono={t.errors.includes(m) ? 'error' : 'warning'} className="items-start">
                {m}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onEditar}>
          Editar
        </Button>
        {t.status === 'PENDING_REVIEW' ? (
          <Button size="sm" variant="ghost" onClick={() => onEstado('CONFIRMED')}>
            Confirmar
          </Button>
        ) : t.status === 'CANCELLED' ? (
          <Button size="sm" variant="ghost" onClick={() => onEstado('CONFIRMED')}>
            Reactivar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onEstado('PENDING_REVIEW')}>
            Marcar pendiente
          </Button>
        )}
        <Button size="sm" variant="danger" className="ml-auto" onClick={onAnular} disabled={t.status === 'CANCELLED'}>
          Anular
        </Button>
      </div>
    </div>
  )
}

function monthOptions(trackingStart?: string): string[] {
  const out: string[] = []
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  const start = (trackingStart ?? '').slice(0, 7) || `${y - 1}-${String(m).padStart(2, '0')}`
  for (let i = 0; i < 120; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push(key)
    if (key <= start) break
    m--
    if (m === 0) {
      m = 12
      y--
    }
  }
  return out
}

/** Cola de revisión: pendientes, posibles duplicados y movimientos con avisos */
function ReviewView() {
  const q = useApi('finanzas:tx.reviewQueue', [])
  const { openEdit } = useTxEditor()
  const { accountName } = useCatalog()
  const setStatus = useApiMutation('finanzas:tx.setStatus', { success: 'Movimiento actualizado' })
  const dismiss = useApiMutation('finanzas:tx.dismissDuplicate', { success: 'Marcado como no duplicado' })
  const [anulacion, setAnulacion] = useState<Anulacion | null>(null)
  if (q.isLoading)
    return (
      <div className="card">
        <LoadingState filas={3} etiqueta="Cargando la cola de revisión" />
      </div>
    )
  if (q.error) return <ErrorState titulo="No se ha podido cargar la revisión" texto={q.error.message} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
  const d = q.data!
  if (!d.pending.length && !d.issues.length && !d.duplicates.length)
    return (
      <div className="card">
        <EmptyState icono={<Receipt size={24} aria-hidden />} titulo="No hay nada que revisar" texto="Ningún movimiento pendiente, con datos dudosos o posiblemente duplicado." />
      </div>
    )
  const row = (t: TxRow, extra?: React.ReactNode) => (
    <li key={t.id} className="flex items-center justify-between gap-4 py-3">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(t.id)} aria-label={`Editar ${t.description}`}>
        <div className="t-body flex flex-wrap items-baseline gap-x-2">
          <span className="tnum text-ink-3">{formatDate(t.date)}</span>
          <span className="font-medium">{t.description}</span>
          <span className="t-meta">{accountName(t.accountId)}</span>
        </div>
        {[...t.errors, ...t.warnings.filter((w) => !w.startsWith('Posible duplicado') && w !== 'Pendiente de revisar.')].map((m) => (
          <div key={m} className="mt-1">
            <StatusBadge tono={t.errors.includes(m) ? 'error' : 'warning'}>{m}</StatusBadge>
          </div>
        ))}
      </button>
      <span className="flex shrink-0 items-center gap-3">
        <Importe cents={t.amountCents} />
        {extra}
      </span>
    </li>
  )
  return (
    <div className="flex flex-col gap-6">
      {d.pending.length > 0 && (
        <Card titulo={`Pendientes de revisar (${d.pending.length})`} subtitulo="Datos dudosos marcados para comprobar con el banco">
          <ul className="divide-line">
            {d.pending.map((t) =>
              row(
                t,
                <Button size="sm" onClick={() => setStatus.mutate([[t.id], 'CONFIRMED'])}>
                  Confirmar
                </Button>
              )
            )}
          </ul>
        </Card>
      )}
      {d.duplicates.length > 0 && (
        <Card titulo={`Posibles duplicados (${d.duplicates.length})`} subtitulo="Misma cuenta, importe, tipo y categoría en pocos días. Decide tú">
          <ul className="divide-line">
            {d.duplicates.map(([a, b]) => (
              <li key={a.id + b.id} className="py-4 first:pt-0 last:pb-0">
                <div className="grid gap-3 @3xl:grid-cols-2">
                  {[a, b].map((t) => (
                    <button key={t.id} type="button" className="r-control bg-raised p-3 text-left hover:bg-interactive" onClick={() => openEdit(t.id)}>
                      <div className="flex justify-between gap-2">
                        <span className="tnum t-meta">
                          {t.id} · {formatDate(t.date)}
                        </span>
                        <Importe cents={t.amountCents} />
                      </div>
                      <div className="t-body mt-1 font-medium">{t.description}</div>
                      {t.notes && <div className="t-meta mt-1">{t.notes}</div>}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button size="sm" onClick={() => dismiss.mutate([a.id, b.id])}>
                    No es duplicado
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setAnulacion({ ids: [b.id], titulo: `¿Anular ${b.id}?`, texto: `«${b.description}» (${formatEur(b.amountCents)}) dejará de contar. Se conserva en el historial.` })}>
                    Anular {b.id}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {d.issues.length > 0 && (
        <Card titulo={`Con avisos (${d.issues.length})`} subtitulo="Datos incompletos o raros: reembolsos sin gasto original, fechas futuras, importes fuera de rango…">
          <ul className="divide-line">{d.issues.map((t) => row(t))}</ul>
        </Card>
      )}
      {anulacion && (
        <ConfirmDialog
          titulo={anulacion.titulo}
          texto={anulacion.texto}
          confirmar="Anular movimiento"
          onCancelar={() => setAnulacion(null)}
          onConfirmar={() => {
            setStatus.mutate([anulacion.ids, 'CANCELLED'])
            setAnulacion(null)
          }}
        />
      )}
    </div>
  )
}
