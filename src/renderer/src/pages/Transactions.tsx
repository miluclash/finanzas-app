import { AlertTriangle, MessageSquare, Plus, X, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatDate, formatMonth } from '@shared/dates'
import { TX_STATUS_LABEL, TX_TYPE_LABEL } from '@shared/labels'
import { formatEur } from '@shared/money'
import type { TxFilter } from '@shared/schemas'
import { TX_TYPES, type TxStatus, type TxType } from '@shared/types'
import { DataTable, type Column } from '../components/DataTable'
import { useTxEditor } from '../components/TxEditor'
import { Amount, Badge, Button, confirmDialog, EmptyState, ErrorBox, Loading, PageHeader, Section, Select, Tabs, TextInput } from '../components/ui'
import { useApi, useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'
import type { TxRow } from '../../../main/services/transactions'

const PAGE = 300

export function TransactionsPage() {
  const [params, setParams] = useSearchParams()
  const view = params.get('vista') === 'revision' ? 'revision' : 'todos'
  const review = useApi('tx.reviewQueue', [])
  const reviewCount = (review.data?.pending.length ?? 0) + (review.data?.issues.length ?? 0) + (review.data?.duplicates.length ?? 0)
  const { openNew, openTransfer } = useTxEditor()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Movimientos"
        description="El libro de movimientos es la fuente de todas las cifras. Pulsa un movimiento para editarlo."
        actions={
          <>
            <Button onClick={() => openTransfer()}>Transferencia</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openNew()}>
              Nuevo movimiento
            </Button>
          </>
        }
      />
      <Tabs
        value={view}
        onChange={(v) => {
          const p = new URLSearchParams(params)
          if (v === 'revision') p.set('vista', 'revision')
          else p.delete('vista')
          setParams(p)
        }}
        tabs={[
          { id: 'todos', label: 'Todos' },
          { id: 'revision', label: 'Por revisar', count: reviewCount }
        ]}
      />
      {view === 'revision' ? <ReviewView /> : <ListView />}
    </div>
  )
}

function ListView() {
  const [params, setParams] = useSearchParams()
  const { cat, accountName, categoryName, maps } = useCatalog()
  const { openEdit } = useTxEditor()
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
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
    if (estado === 'CANCELLED') f.includeCancelled = true
    if (estado) f.status = estado as TxStatus
    const nat = get('naturaleza')
    if (nat) f.nature = nat as TxFilter['nature']
    return f
  }, [params, limit])
  const q = useApi('tx.list', [filter], { placeholderData: (p) => p })
  const setStatus = useApiMutation('tx.setStatus', { success: (n) => `${n} movimiento(s) actualizados`, onSuccess: () => setSelected(new Set()) })
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
    setLimit(PAGE)
  }
  const active = [...params.keys()].filter((k) => k !== 'vista' && k !== 'q')
  const columns: Column<TxRow>[] = [
    { key: 'date', header: 'Fecha', cell: (t) => <span className="num text-ink-2">{formatDate(t.date)}</span>, sort: (t) => t.date + t.id, width: '96px' },
    {
      key: 'description',
      header: 'Descripción',
      sort: (t) => t.description,
      cell: (t) => (
        <div className="min-w-0">
          <div className={t.status === 'CANCELLED' ? 'text-muted line-through' : ''}>{t.description}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            {t.subcategoryId && <span>{maps.subcategory.get(t.subcategoryId)?.name}</span>}
            {t.merchant && <span>{t.merchant}</span>}
            {t.recurringId && <span>Recurrente: {maps.rule.get(t.recurringId)?.concept}</span>}
            {t.goalId && <span>Objetivo: {maps.goal.get(t.goalId)?.name}</span>}
            {t.notes && (
              <span title={t.notes} className="inline-flex items-center gap-0.5">
                <MessageSquare className="size-3" /> nota
              </span>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'category',
      header: 'Categoría',
      sort: (t) => (t.type === 'TRANSFER' ? 'zz' : categoryName(t.categoryId)),
      cell: (t) =>
        t.type === 'TRANSFER' ? (
          <span className="text-muted">Transferencia</span>
        ) : t.type === 'INCOME' || t.type === 'EXPENSE' || t.type === 'REFUND' ? (
          <span>
            {categoryName(t.categoryId)}
            {t.type === 'REFUND' && (
              <Badge tone="accent" title="Resta del gasto de la categoría">
                reembolso
              </Badge>
            )}
          </span>
        ) : (
          <span className="text-muted">{TX_TYPE_LABEL[t.type]}</span>
        )
    },
    { key: 'account', header: 'Cuenta', sort: (t) => accountName(t.accountId), cell: (t) => <span className="text-ink-2">{accountName(t.accountId)}</span> },
    { key: 'amount', header: 'Importe', align: 'right', sort: (t) => t.amountCents, cell: (t) => <Amount cents={t.amountCents} className={t.status === 'CANCELLED' ? 'text-muted line-through' : ''} /> },
    {
      key: 'status',
      header: '',
      width: '120px',
      cell: (t) => (
        <span className="flex justify-end gap-1">
          {t.status === 'PENDING_REVIEW' && <Badge tone="warn">Pendiente</Badge>}
          {t.status === 'CANCELLED' && <Badge>Anulado</Badge>}
          {t.errors.length > 0 && (
            <span title={t.errors.join('\n')}>
              <XCircle className="size-4 text-neg" />
            </span>
          )}
          {t.errors.length === 0 && t.warnings.filter((w) => w !== 'Pendiente de revisar.').length > 0 && (
            <span title={t.warnings.join('\n')}>
              <AlertTriangle className="size-4 text-warn" />
            </span>
          )}
        </span>
      )
    }
  ]
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <TextInput
          className="w-64"
          placeholder="Buscar descripción, comercio, nota, importe…"
          defaultValue={params.get('q') ?? ''}
          onChange={(e) => {
            const v = e.target.value
            clearTimeout((window as unknown as { _qt?: number })._qt)
            ;(window as unknown as { _qt?: number })._qt = window.setTimeout(() => set('q', v.trim() || null), 250)
          }}
        />
        <Select className="w-40" value={params.get('mes') ?? ''} onChange={(e) => set('mes', e.target.value || null)} aria-label="Mes">
          <option value="">Todos los meses</option>
          {monthOptions(cat?.settings.trackingStart).map((m) => (
            <option key={m} value={m}>
              {formatMonth(m, true)}
            </option>
          ))}
        </Select>
        <Select className="w-44" value={params.get('cuenta') ?? ''} onChange={(e) => set('cuenta', e.target.value || null)} aria-label="Cuenta">
          <option value="">Todas las cuentas</option>
          {cat?.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select className="w-48" value={params.get('categoria') ?? ''} onChange={(e) => set('categoria', e.target.value || null)} aria-label="Categoría">
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
        <Select className="w-40" value={params.get('tipo') ?? ''} onChange={(e) => set('tipo', e.target.value || null)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {TX_TYPES.map((t) => (
            <option key={t} value={t}>
              {TX_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select className="w-40" value={params.get('estado') ?? ''} onChange={(e) => set('estado', e.target.value || null)} aria-label="Estado">
          <option value="">Sin anulados</option>
          {(['CONFIRMED', 'PENDING_REVIEW', 'CANCELLED'] as TxStatus[]).map((s) => (
            <option key={s} value={s}>
              {TX_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        {active.length > 0 && (
          <Button
            variant="ghost"
            icon={<X className="size-4" />}
            onClick={() => {
              const p = new URLSearchParams()
              if (params.get('q')) p.set('q', params.get('q')!)
              setParams(p)
            }}
          >
            Quitar filtros
          </Button>
        )}
      </div>
      <ActiveFilterChips />
      {q.error && <ErrorBox error={q.error} />}
      {!q.data ? (
        <Loading />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="text-muted">
              {q.data.total} movimiento(s) · ingresos <Amount cents={q.data.incomeCents} sign={false} colored={false} /> · gastos{' '}
              <Amount cents={q.data.expenseCents} colored={false} /> · neto <Amount cents={q.data.netCents} />
            </span>
            {selected.size > 0 && (
              <span className="flex items-center gap-2">
                <span className="text-muted">{selected.size} seleccionados</span>
                <Button size="sm" onClick={() => setStatus.mutate([[...selected], 'CONFIRMED'])}>
                  Confirmar
                </Button>
                <Button size="sm" onClick={() => setStatus.mutate([[...selected], 'PENDING_REVIEW'])}>
                  Marcar pendiente
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (await confirmDialog({ title: `Anular ${selected.size} movimiento(s)`, text: 'Dejarán de contar, pero se conservan en el historial.', confirm: 'Anular' }))
                      setStatus.mutate([[...selected], 'CANCELLED'])
                  }}
                >
                  Anular
                </Button>
              </span>
            )}
          </div>
          <DataTable
            rows={q.data.rows}
            columns={columns}
            rowKey={(t) => t.id}
            onRowClick={(t) => openEdit(t.id)}
            initialSort={{ key: 'date', dir: 'desc' }}
            selected={selected}
            onSelect={setSelected}
            empty={<EmptyState title="No hay movimientos con estos filtros" text="Cambia los filtros o registra uno nuevo con la tecla N." />}
          />
          {q.data.total > q.data.rows.length && (
            <Button className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
              Mostrar más ({q.data.total - q.data.rows.length} restantes)
            </Button>
          )}
        </>
      )}
    </>
  )
}

function ActiveFilterChips() {
  const [params, setParams] = useSearchParams()
  const { categoryName, maps, groupName } = useCatalog()
  const chips: Array<[string, string]> = []
  if (params.get('grupo')) chips.push(['grupo', `Grupo: ${groupName(params.get('grupo')!)}`])
  if (params.get('gastos')) chips.push(['gastos', 'Solo gastos y reembolsos'])
  if (params.get('objetivo')) chips.push(['objetivo', `Objetivo: ${maps.goal.get(params.get('objetivo')!)?.name}`])
  if (params.get('recurrente')) chips.push(['recurrente', `Recurrente: ${maps.rule.get(params.get('recurrente')!)?.concept}`])
  if (params.get('naturaleza')) chips.push(['naturaleza', `Gasto ${params.get('naturaleza') === 'FIXED' ? 'fijo' : params.get('naturaleza') === 'EXTRAORDINARY' ? 'extraordinario' : 'variable'}`])
  if (params.get('desde')) chips.push(['desde', `Desde ${formatDate(params.get('desde'))}`])
  if (params.get('hasta')) chips.push(['hasta', `Hasta ${formatDate(params.get('hasta'))}`])
  if (params.get('categoria') === '__none') chips.push(['categoria', categoryName(null)])
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(([k, label]) => (
        <button
          key={k}
          onClick={() => {
            const p = new URLSearchParams(params)
            p.delete(k)
            setParams(p)
          }}
          className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] text-ink hover:brightness-95"
        >
          {label} <X className="size-3" />
        </button>
      ))}
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

function ReviewView() {
  const q = useApi('tx.reviewQueue', [])
  const { openEdit } = useTxEditor()
  const { accountName } = useCatalog()
  const setStatus = useApiMutation('tx.setStatus', { success: 'Movimiento actualizado' })
  const dismiss = useApiMutation('tx.dismissDuplicate', { success: 'Marcado como no duplicado' })
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const d = q.data!
  if (!d.pending.length && !d.issues.length && !d.duplicates.length)
    return <EmptyState title="No hay nada que revisar" text="Ningún movimiento pendiente, con datos dudosos o posiblemente duplicado." />
  const row = (t: TxRow, extra?: React.ReactNode) => (
    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
      <button className="min-w-0 text-left" onClick={() => openEdit(t.id)}>
        <div className="text-[13px]">
          <span className="num text-muted">{formatDate(t.date)}</span> · {t.description} · <span className="text-muted">{accountName(t.accountId)}</span>
        </div>
        {[...t.errors, ...t.warnings.filter((w) => !w.startsWith('Posible duplicado') && w !== 'Pendiente de revisar.')].map((m) => (
          <div key={m} className="text-[12px] text-warn">
            {m}
          </div>
        ))}
      </button>
      <span className="flex shrink-0 items-center gap-2">
        <Amount cents={t.amountCents} />
        {extra}
      </span>
    </li>
  )
  return (
    <div className="flex flex-col gap-5">
      {d.pending.length > 0 && (
        <Section title={`Pendientes de revisar (${d.pending.length})`} description="Datos dudosos marcados para comprobar con el banco." boxed>
          <ul className="-m-4 divide-y divide-line">
            {d.pending.map((t) =>
              row(
                t,
                <Button size="sm" onClick={() => setStatus.mutate([[t.id], 'CONFIRMED'])}>
                  Confirmar
                </Button>
              )
            )}
          </ul>
        </Section>
      )}
      {d.duplicates.length > 0 && (
        <Section
          title={`Posibles duplicados (${d.duplicates.length})`}
          description="Misma cuenta, importe, tipo y categoría en pocos días. No se bloquea nada: decide tú."
          boxed
        >
          <ul className="-m-4 divide-y divide-line">
            {d.duplicates.map(([a, b]) => (
              <li key={a.id + b.id} className="px-4 py-3">
                <div className="grid grid-cols-2 gap-4 text-[13px]">
                  {[a, b].map((t) => (
                    <button key={t.id} className="rounded-md border border-line p-2 text-left hover:bg-surface-2" onClick={() => openEdit(t.id)}>
                      <div className="flex justify-between gap-2">
                        <span className="num text-muted">
                          {t.id} · {formatDate(t.date)}
                        </span>
                        <Amount cents={t.amountCents} />
                      </div>
                      <div>{t.description}</div>
                      {t.notes && <div className="text-[12px] text-muted">{t.notes}</div>}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" onClick={() => dismiss.mutate([a.id, b.id])}>
                    No es duplicado
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (await confirmDialog({ title: `Anular ${b.id}`, text: `${b.description} (${formatEur(b.amountCents)}) dejará de contar. Se conserva en el historial.`, confirm: 'Anular' }))
                        setStatus.mutate([[b.id], 'CANCELLED'])
                    }}
                  >
                    Anular {b.id}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {d.issues.length > 0 && (
        <Section title={`Con avisos (${d.issues.length})`} description="Datos incompletos o raros: reembolsos sin gasto original, fechas futuras, importes fuera de rango…" boxed>
          <ul className="-m-4 divide-y divide-line">{d.issues.map((t) => row(t))}</ul>
        </Section>
      )}
    </div>
  )
}
