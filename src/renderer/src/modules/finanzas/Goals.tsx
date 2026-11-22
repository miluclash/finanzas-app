import { Plus, Target } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatMonth, todayISO } from '@shared/dates'
import { GOAL_HEALTH_LABEL } from '@shared/modules/finanzas/goals'
import { GOAL_STATUS_LABEL, GOAL_TYPE_LABEL, PRIORITY_LABEL } from '@shared/modules/finanzas/labels'
import { formatEur, formatPct } from '@shared/money'
import { GOAL_STATUSES, GOAL_TYPES, PRIORITIES, type Goal, type GoalStatus, type GoalType, type Priority } from '@shared/modules/finanzas/types'
import { useTxEditor } from './components/TxEditor'
import { Button, Card, CifraEur, ConfirmDialog, DatePicker, EmptyState, ErrorState, FilaDato, LoadingState, Modal, MoneyField, PageHeader, ProgressBar, SegmentedControl, Select, StatusBadge, TextArea, TextField, type Tono } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'
import type { ApiResult } from '../../../../main/app'

type Row = ApiResult<'finanzas:goals.list'>[number]

export function GoalsPage() {
  const q = useApi('finanzas:goals.list', [])
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [allocating, setAllocating] = useState<Row | null>(null)
  const cabecera = (
    <PageHeader
      titulo="Objetivos y huchas"
      texto="El dinero de un objetivo sigue siendo patrimonio. Si está en una hucha real, su saldo es el progreso; si no, registra reservas y dejará de contar como disponible."
      acciones={
        <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => setEditing('new')}>
          Nuevo objetivo
        </Button>
      }
    />
  )
  if (q.isLoading)
    return (
      <div data-module="finanzas">
        {cabecera}
        <div className="card">
          <LoadingState filas={3} etiqueta="Cargando los objetivos" />
        </div>
      </div>
    )
  if (q.error || !q.data)
    return (
      <div data-module="finanzas">
        {cabecera}
        <ErrorState titulo="No se han podido cargar los objetivos" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
      </div>
    )
  const active = q.data!.filter((r) => r.goal.status === 'ACTIVE' || r.goal.status === 'PAUSED')
  const closed = q.data!.filter((r) => r.goal.status === 'COMPLETED' || r.goal.status === 'CANCELLED')
  return (
    <div data-module="finanzas">
      {cabecera}
      {active.length === 0 ? (
        <div className="card">
          <EmptyState icono={<Target size={24} aria-hidden />} titulo="No tienes objetivos activos" texto="Crea uno para el colchón, un curso, un viaje…" accion={<Button variant="primary" onClick={() => setEditing('new')}>Crear objetivo</Button>} />
        </div>
      ) : (
        <div className="grid gap-6 @4xl:grid-cols-2">
          {active.map((r) => (
            <GoalBlock key={r.goal.id} row={r} onEdit={() => setEditing(r.goal)} onAllocate={() => setAllocating(r)} />
          ))}
        </div>
      )}
      {closed.length > 0 && (
        <details className="mt-8">
          <summary className="t-body cursor-pointer text-ink-2 hover:text-ink">Objetivos cerrados ({closed.length})</summary>
          <ul className="divide-line card card-flush mt-3">
            {closed.map((r) => (
              <li key={r.goal.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <button type="button" className="t-body font-medium hover:underline" onClick={() => setEditing(r.goal)}>
                  {r.goal.name}
                </button>
                <span className="t-label">{GOAL_STATUS_LABEL[r.goal.status]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {editing && <GoalForm goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {allocating && <AllocationModal row={allocating} onClose={() => setAllocating(null)} />}
    </div>
  )
}

function GoalBlock({ row, onEdit, onAllocate }: { row: Row; onEdit: () => void; onAllocate: () => void }) {
  const { goal: g, progress: p } = row
  const { accountName } = useCatalog()
  const { openTransfer } = useTxEditor()
  const navigate = useNavigate()
  const tono: Tono = g.status === 'PAUSED' ? 'neutral' : p.health === 'FUNDED' ? 'success' : p.health === 'AT_RISK' || p.health === 'OVERDUE' ? 'warning' : 'info'
  const barra = p.health === 'FUNDED' ? 'success' : p.health === 'AT_RISK' || p.health === 'OVERDUE' ? 'warning' : 'accent'
  return (
    <Card as="article" etiqueta={g.name} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="t-card-title truncate">{g.name}</h2>
          <div className="t-meta mt-1">
            {GOAL_TYPE_LABEL[g.type]} · prioridad {PRIORITY_LABEL[g.priority].toLowerCase()}
            {g.linkedAccountId ? ` · hucha: ${accountName(g.linkedAccountId)}` : ' · reservas en la app'}
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap"><StatusBadge tono={tono}>{g.status === 'PAUSED' ? 'En pausa' : GOAL_HEALTH_LABEL[p.health]}</StatusBadge></span>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="t-kpi">
            <CifraEur cents={p.currentCents} />
          </span>
          {g.targetCents !== null && <span className="tnum t-label">de {formatEur(g.targetCents)}</span>}
        </div>
        {p.progress !== null && <ProgressBar className="mt-3" value={p.progress} tone={barra} label={`Progreso de ${g.name}`} valueText={formatPct(p.progress)} />}
      </div>
      <dl className="grid gap-x-6 gap-y-2 @lg:grid-cols-2">
        <FilaDato etiqueta="Falta" valor={p.remainingCents === null ? '—' : formatEur(p.remainingCents)} />
        <FilaDato etiqueta="Progreso" valor={formatPct(p.progress)} />
        <FilaDato etiqueta="Fecha límite" valor={g.deadline ? formatDate(g.deadline) : '—'} />
        <FilaDato etiqueta="Necesitas al mes" valor={p.monthlyNeededCents === null ? '—' : formatEur(p.monthlyNeededCents)} />
        <FilaDato etiqueta="Ritmo (últimos 3 meses)" valor={formatEur(p.paceMonthlyCents)} />
        <FilaDato etiqueta="Al ritmo previsto, listo en" valor={p.projectedDate ? formatMonth(p.projectedDate.slice(0, 7)) : '—'} />
        {p.surplusCents > 0 && <FilaDato etiqueta="Sobra" valor={<span className="text-success">{formatEur(p.surplusCents)}</span>} className="@lg:col-span-2" />}
        {p.reservedFromAvailableCents > 0 && <FilaDato etiqueta="Restado del disponible" valor={formatEur(p.reservedFromAvailableCents)} className="@lg:col-span-2" />}
      </dl>
      {g.notes && <p className="t-meta">{g.notes}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        {g.linkedAccountId ? (
          <Button size="sm" variant="accent" onClick={() => openTransfer({ toAccountId: g.linkedAccountId!, description: `Aportación ${g.name}` })}>
            Aportar a la hucha
          </Button>
        ) : (
          <Button size="sm" variant="accent" onClick={onAllocate}>
            Reservar / liberar dinero
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Editar
        </Button>
        {row.linkedTxCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => navigate(`/finanzas/movimientos?objetivo=${g.id}`)}>
            Movimientos ({row.linkedTxCount})
          </Button>
        )}
      </div>
    </Card>
  )
}

function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { cat } = useCatalog()
  const [name, setName] = useState(goal?.name ?? '')
  const [type, setType] = useState<GoalType>(goal?.type ?? 'PLANNED')
  const [priority, setPriority] = useState<Priority>(goal?.priority ?? 'MEDIUM')
  const [target, setTarget] = useState<number | null>(goal?.targetCents ?? null)
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'ACTIVE')
  const [linked, setLinked] = useState(goal?.linkedAccountId ?? '')
  const [planned, setPlanned] = useState<number | null>(goal?.plannedMonthlyCents ?? null)
  const [notes, setNotes] = useState(goal?.notes ?? '')
  const [borrar, setBorrar] = useState(false)
  const nombreRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:goals.save', { success: (g) => `Objetivo guardado: ${g.name}`, onSuccess: onClose })
  const del = useApiMutation('finanzas:goals.delete', { success: 'Objetivo borrado', onSuccess: onClose })
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={goal ? `Editar ${goal.name}` : 'Nuevo objetivo'}
        ancho="lg"
        inicial={nombreRef}
        onCerrar={onClose}
        pie={
          <>
            {goal && (
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
                    id: goal?.id ?? null,
                    name,
                    type,
                    priority,
                    targetCents: target,
                    deadline: deadline || null,
                    status,
                    linkedAccountId: linked || null,
                    plannedMonthlyCents: planned,
                    notes,
                    sortOrder: goal?.sortOrder ?? 0
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
          <TextField ref={nombreRef} className="sm:col-span-2" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Colchón de emergencia" />
          <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as GoalType)}>
            {GOAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {GOAL_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <div>
            <span className="field-label">Prioridad</span>
            <SegmentedControl label="Prioridad" value={priority} onChange={setPriority} opciones={PRIORITIES.map((p) => ({ id: p, texto: PRIORITY_LABEL[p] }))} />
          </div>
          <MoneyField label="Cantidad objetivo" ayuda="Vacía si no tiene tope (p. ej. inversión)." value={target} onChange={setTarget} placeholder="—" />
          <TextField type="date" label="Fecha límite" ayuda="Opcional." value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <Select className="sm:col-span-2" label="Hucha vinculada" ayuda="Si el dinero está en una cuenta propia del objetivo, su saldo es el progreso." value={linked} onChange={(e) => setLinked(e.target.value)}>
            <option value="">Ninguna: llevo las reservas en la app</option>
            {(cat?.accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <MoneyField label="Aportación mensual prevista" ayuda="Se usa en la previsión y para calcular si vas con retraso." value={planned} onChange={setPlanned} placeholder="—" />
          <Select label="Estado" value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
            {GOAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <TextArea className="sm:col-span-2" label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
      {borrar && goal && (
        <ConfirmDialog
          titulo="¿Borrar el objetivo?"
          texto="Se borran también sus reservas. Los movimientos no se tocan."
          confirmar="Borrar objetivo"
          onCancelar={() => setBorrar(false)}
          onConfirmar={() => (setBorrar(false), del.mutate([goal.id]))}
        />
      )}
    </div>
  )
}

function AllocationModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { cat, accountName } = useCatalog()
  const [mode, setMode] = useState<'reserve' | 'release'>('reserve')
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(todayISO())
  const [accountId, setAccountId] = useState(cat?.accounts.find((a) => a.includeLiquidity)?.id ?? '')
  const [notes, setNotes] = useState('')
  const importeRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:goals.allocate', { success: 'Reserva guardada', onSuccess: onClose })
  const del = useApiMutation('finanzas:goals.deleteAllocation', { success: 'Reserva borrada' })
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={`Reservas · ${row.goal.name}`}
        ancho="lg"
        inicial={importeRef}
        onCerrar={onClose}
        pie={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button
              variant="accent"
              disabled={!amount}
              cargando={save.isPending}
              onClick={() => save.mutate([{ goalId: row.goal.id, date, amountCents: (mode === 'reserve' ? 1 : -1) * (amount ?? 0), accountId, notes }])}
            >
              {mode === 'reserve' ? 'Reservar' : 'Liberar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <StatusBadge tono="info" className="items-start">
            Reservar no mueve dinero: marca una parte del saldo de una cuenta como apartada para este objetivo. Si la cuenta es líquida, deja de contar como disponible para gastar.
          </StatusBadge>
          <SegmentedControl
            label="Qué quieres hacer"
            value={mode}
            onChange={setMode}
            opciones={[
              { id: 'reserve', texto: 'Reservar' },
              { id: 'release', texto: 'Liberar' }
            ]}
          />
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <DatePicker label="Fecha" value={date} onChange={setDate} />
            <MoneyField ref={importeRef} label="Importe" value={amount} onChange={setAmount} />
          </div>
          <Select label="Cuenta donde está el dinero" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {(cat?.accounts ?? [])
              .filter((a) => a.active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
          <TextField label="Nota" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          {row.allocations.length > 0 && (
            <div>
              <h3 className="t-card-title mb-2">Reservas hechas</h3>
              <ul className="divide-line r-card border border-line">
                {row.allocations.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                    <span className="tnum t-label">{formatDate(a.date)}</span>
                    <span className="t-body min-w-0 flex-1 truncate">{accountName(a.accountId)}</span>
                    <span className="tnum t-body">{formatEur(a.amountCents, { sign: true })}</span>
                    <Button size="sm" variant="ghost" onClick={() => del.mutate([a.id])}>
                      Borrar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
