import { ArrowRight, Plus, Repeat } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate } from '@shared/dates'
import { FREQUENCY_LABEL, RECURRING_KIND_LABEL } from '@shared/modules/finanzas/labels'
import { formatEur } from '@shared/money'
import { FREQUENCIES, RECURRING_KINDS, type Frequency, type RecurringKind, type RecurringRule } from '@shared/modules/finanzas/types'
import { DataTable, type Column } from './components/DataTable'
import { Button, Card, Checkbox, CifraEur, ConfirmDialog, EmptyState, ErrorState, Importe, LoadingState, Modal, MoneyField, PageHeader, Select, StatusBadge, Tag, TextArea, TextField } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'
import type { ApiResult } from '../../../../main/app'

type Row = ApiResult<'finanzas:recurring.list'>[number]

export function RecurringPage() {
  const q = useApi('finanzas:recurring.list', [])
  const { accountName, categoryName } = useCatalog()
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null)
  const navigate = useNavigate()
  const cabecera = (
    <PageHeader
      titulo="Recurrentes"
      texto="Lo que esperas que se repita. Alimenta la previsión y el disponible, pero nunca crea movimientos reales: cuando llega el cargo, lo registras y queda enlazado."
      acciones={
        <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => setEditing('new')}>
          Nuevo recurrente
        </Button>
      }
    />
  )
  if (q.isLoading)
    return (
      <div data-module="finanzas">
        {cabecera}
        <div className="card">
          <LoadingState filas={3} etiqueta="Cargando los recurrentes" />
        </div>
      </div>
    )
  if (q.error || !q.data)
    return (
      <div data-module="finanzas">
        {cabecera}
        <ErrorState titulo="No se han podido cargar los recurrentes" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
      </div>
    )
  const rows = q.data!
  const activeRows = rows.filter((r) => !r.status.finished)
  const finishedRows = rows.filter((r) => r.status.finished)
  const income = activeRows.filter((r) => r.rule.kind === 'INCOME').reduce((s, r) => s + r.status.monthlyEquivalentCents, 0)
  const expense = activeRows.filter((r) => r.rule.kind === 'EXPENSE').reduce((s, r) => s + r.status.monthlyEquivalentCents, 0)
  const transfers = activeRows.filter((r) => r.rule.kind === 'TRANSFER').reduce((s, r) => s + r.status.monthlyEquivalentCents, 0)
  const columns: Column<Row>[] = [
    {
      key: 'concept',
      header: 'Concepto',
      sort: (r) => r.rule.concept,
      cell: (r) => (
        <div className="min-w-56 py-1">
          <div className="font-medium">{r.rule.concept}</div>
          <div className="t-meta">
            {RECURRING_KIND_LABEL[r.rule.kind]} · {r.rule.kind === 'TRANSFER' ? `${accountName(r.rule.accountId)} → ${accountName(r.rule.toAccountId)}` : `${categoryName(r.rule.categoryId)} · ${accountName(r.rule.accountId)}`}
            {r.rule.essential && ' · esencial'}
          </div>
                  </div>
      )
    },
    {
      key: 'amount',
      header: 'Importe',
      align: 'right',
      sort: (r) => r.rule.amountCents,
      cell: (r) => (
        <div>
          <Importe cents={r.rule.kind === 'INCOME' ? r.rule.amountCents : -r.rule.amountCents} />
          {(r.rule.minCents !== null || r.rule.maxCents !== null) && (
            <div className="t-meta tnum">
              {formatEur(r.rule.minCents)} – {formatEur(r.rule.maxCents)}
            </div>
          )}
        </div>
      )
    },
    { key: 'freq', header: 'Frecuencia', cell: (r) => FREQUENCY_LABEL[r.rule.frequency], sort: (r) => r.rule.frequency },
    {
      key: 'next',
      header: 'Próxima fecha',
      sort: (r) => r.status.nextDate ?? 'z',
      cell: (r) =>
        r.status.nextDate ? (
          <span className="tnum">{formatDate(r.status.nextDate)}</span>
        ) : r.rule.startDate ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className="t-meta">Sin fecha</span>
        )
    },
    {
      key: 'monthly',
      header: 'Equivalente mensual',
      align: 'right',
      sort: (r) => r.status.monthlyEquivalentCents,
      cell: (r) => (r.rule.frequency === 'ONE_OFF' ? <span className="text-ink-3">—</span> : <Importe cents={r.status.monthlyEquivalentCents} />)
    },
    {
      key: 'last',
      header: 'Último registrado',
      cell: (r) =>
        r.status.lastMatchedDate ? (
          <button
            type="button"
            className="tnum text-ink-2 hover:underline"
            aria-label={`Ver los movimientos de ${r.rule.concept}`}
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/finanzas/movimientos?recurrente=${r.rule.id}`)
            }}
          >
            {formatDate(r.status.lastMatchedDate)}
          </button>
        ) : (
          <span className="text-ink-3">—</span>
        )
    },
    {
      key: 'state',
      header: <span className="sr-only">Estado</span>,
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {!r.rule.active && <Tag>Pausado</Tag>}
          {r.status.finished && r.rule.active && <Tag>Terminado</Tag>}
          {r.status.overdue.length > 0 && (
            <Tag tono="warning" icono={<Repeat size={12} aria-hidden />} title={`Previsto: ${r.status.overdue.map(formatDate).join(', ')}`}>
              Sin registrar ({r.status.overdue.length})
            </Tag>
          )}
        </span>
      )
    }
  ]
  return (
    <div data-module="finanzas">
      {cabecera}
      <Card titulo="Cada mes" subtitulo="Equivalente mensual de lo activo">
        <dl className="auto-grid">
          <div>
            <dt className="t-label">Ingresos al mes</dt>
            <dd className="t-kpi mt-1">
              <CifraEur cents={income} />
            </dd>
          </div>
          <div>
            <dt className="t-label">Gastos fijos al mes</dt>
            <dd className="t-kpi mt-1">
              <CifraEur cents={expense} />
            </dd>
          </div>
          <div>
            <dt className="t-label">Transferencias al mes</dt>
            <dd className="t-kpi mt-1">
              <CifraEur cents={transfers} />
            </dd>
          </div>
          <div>
            <dt className="t-label">Saldo recurrente</dt>
            <dd className="t-kpi mt-1">
              <CifraEur cents={income + expense + transfers} />
            </dd>
          </div>
        </dl>
      </Card>
      <h2 className="t-section mb-3 mt-10">Activos</h2>
      <DataTable
        rows={activeRows}
        columns={columns}
        rowKey={(r) => r.rule.id}
        onRowClick={(r) => setEditing(r.rule)}
        initialSort={{ key: 'next', dir: 'asc' }}
        empty={<div className="card"><EmptyState icono={<Repeat size={24} aria-hidden />} titulo="Aún no hay recurrentes" texto="Añade nóminas, recibos o transferencias periódicas para que la previsión cuente con ellos." accion={<Button variant="primary" onClick={() => setEditing('new')}>Nuevo recurrente</Button>} /></div>}
      />
      <p className="t-meta mt-2 flex items-center gap-1">
        <ArrowRight size={14} aria-hidden /> Pulsa una fila (o Intro) para editarla.
      </p>
      {finishedRows.length > 0 && (
        <>
          <h2 className="t-section mb-3 mt-10">Terminados o pausados</h2>
          <DataTable rows={finishedRows} columns={columns} rowKey={(r) => r.rule.id} onRowClick={(r) => setEditing(r.rule)} dense />
        </>
      )}
      {editing && <RecurringForm rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function RecurringForm({ rule, onClose }: { rule: RecurringRule | null; onClose: () => void }) {
  const { cat, categoryKind } = useCatalog()
  const [concept, setConcept] = useState(rule?.concept ?? '')
  const [kind, setKind] = useState<RecurringKind>(rule?.kind ?? 'EXPENSE')
  const [amount, setAmount] = useState<number | null>(rule?.amountCents ?? null)
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'MONTHLY')
  const [startDate, setStartDate] = useState(rule?.startDate ?? '')
  const [endDate, setEndDate] = useState(rule?.endDate ?? '')
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '')
  const [accountId, setAccountId] = useState(rule?.accountId ?? cat?.accounts.find((a) => a.includeLiquidity)?.id ?? '')
  const [toAccountId, setToAccountId] = useState(rule?.toAccountId ?? '')
  const [essential, setEssential] = useState(rule?.essential ?? false)
  const [active, setActive] = useState(rule?.active ?? true)
  const [min, setMin] = useState<number | null>(rule?.minCents ?? null)
  const [max, setMax] = useState<number | null>(rule?.maxCents ?? null)
  const [notes, setNotes] = useState(rule?.notes ?? '')
  const [borrar, setBorrar] = useState(false)
  const conceptoRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:recurring.save', { success: (r) => `Recurrente guardado: ${r.concept}`, onSuccess: onClose })
  const del = useApiMutation('finanzas:recurring.delete', { success: 'Recurrente borrado', onSuccess: onClose })
  const wantKind = kind === 'INCOME' ? 'INCOME' : 'EXPENSE'
  const accounts = (cat?.accounts ?? []).filter((a) => a.active || a.id === accountId || a.id === toAccountId)
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={rule ? `Editar ${rule.concept}` : 'Nuevo recurrente'}
        ancho="lg"
        inicial={conceptoRef}
        onCerrar={onClose}
        pie={
          <>
            {rule && (
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
                    id: rule?.id ?? null,
                    concept,
                    kind,
                    amountCents: amount ?? 0,
                    frequency,
                    startDate: startDate || null,
                    endDate: endDate || null,
                    categoryId: kind === 'TRANSFER' ? null : categoryId || null,
                    accountId,
                    toAccountId: kind === 'TRANSFER' ? toAccountId || null : null,
                    essential,
                    active,
                    minCents: min,
                    maxCents: max,
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
          <TextField ref={conceptoRef} className="sm:col-span-2" label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej.: Gimnasio, Nómina, Plan de inversión" />
          <Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as RecurringKind)}>
            {RECURRING_KINDS.map((k) => (
              <option key={k} value={k}>
                {RECURRING_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <MoneyField label="Importe" value={amount} onChange={setAmount} />
          <Select label="Frecuencia" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </Select>
          <TextField
            type="date"
            label={frequency === 'ONE_OFF' ? 'Fecha' : 'Fecha de un cargo (ancla)'}
            ayuda={frequency === 'ONE_OFF' ? undefined : 'Una fecha en la que toca; las siguientes se calculan solas. Vacía = se reparte cada mes.'}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Select label={kind === 'TRANSFER' ? 'Desde' : 'Cuenta'} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          {kind === 'TRANSFER' ? (
            <Select label="Hacia" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Elige…</option>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          ) : (
            <Select label="Categoría" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Elige…</option>
              {(cat?.categories ?? [])
                .filter((c) => categoryKind(c.id) === wantKind)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          )}
          {frequency !== 'ONE_OFF' && <TextField type="date" label="Fecha final" ayuda="Opcional: último cargo previsto." value={endDate} onChange={(e) => setEndDate(e.target.value)} />}
          <div className="grid grid-cols-2 gap-4">
            <MoneyField label="Mínimo" ayuda="Rango esperado." value={min} onChange={setMin} placeholder="—" />
            <MoneyField label="Máximo" value={max} onChange={setMax} placeholder="—" />
          </div>
          <div className="flex gap-6 sm:col-span-2">
            <Checkbox checked={essential} onChange={setEssential} label="Esencial" />
            <Checkbox checked={active} onChange={setActive} label="Activo" />
          </div>
          <TextArea className="sm:col-span-2" label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
      {borrar && rule && (
        <ConfirmDialog
          titulo="¿Borrar el recurrente?"
          texto="Los movimientos ya registrados se conservan; solo pierden el enlace. Para dejar de usarlo sin borrar, pausa la regla."
          confirmar="Borrar recurrente"
          onCancelar={() => setBorrar(false)}
          onConfirmar={() => (setBorrar(false), del.mutate([rule.id]))}
        />
      )}
    </div>
  )
}
