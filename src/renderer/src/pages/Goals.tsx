import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatMonth, todayISO } from '@shared/dates'
import { GOAL_HEALTH_LABEL } from '@shared/domain/goals'
import { GOAL_STATUS_LABEL, GOAL_TYPE_LABEL, PRIORITY_LABEL } from '@shared/labels'
import { formatEur, formatPct } from '@shared/money'
import { GOAL_STATUSES, GOAL_TYPES, PRIORITIES, type Goal, type GoalStatus, type GoalType, type Priority } from '@shared/types'
import { useTxEditor } from '../components/TxEditor'
import {
  Badge,
  Button,
  confirmDialog,
  DateInput,
  EmptyState,
  ErrorBox,
  Field,
  KV,
  Loading,
  Modal,
  MoneyInput,
  Notice,
  PageHeader,
  Progress,
  Segmented,
  Select,
  TextArea,
  TextInput
} from '../components/ui'
import { useApi, useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'
import type { ApiResult } from '../../../main/services/api'

type Row = ApiResult<'goals.list'>[number]

export function GoalsPage() {
  const q = useApi('goals.list', [])
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [allocating, setAllocating] = useState<Row | null>(null)
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const active = q.data!.filter((r) => r.goal.status === 'ACTIVE' || r.goal.status === 'PAUSED')
  const closed = q.data!.filter((r) => r.goal.status === 'COMPLETED' || r.goal.status === 'CANCELLED')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Objetivos y huchas"
        description="El dinero de un objetivo sigue siendo patrimonio. Si está en una hucha real, su saldo es el progreso; si no, registra reservas y dejará de contar como disponible."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nuevo objetivo
          </Button>
        }
      />
      {active.length === 0 ? (
        <EmptyState title="No tienes objetivos activos" text="Crea uno para el colchón, un curso, un viaje…" action={<Button onClick={() => setEditing('new')}>Crear objetivo</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {active.map((r) => (
            <GoalBlock key={r.goal.id} row={r} onEdit={() => setEditing(r.goal)} onAllocate={() => setAllocating(r)} />
          ))}
        </div>
      )}
      {closed.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-ink-2">Objetivos cerrados ({closed.length})</summary>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
            {closed.map((r) => (
              <li key={r.goal.id} className="flex items-center justify-between px-3 py-2">
                <button className="hover:underline" onClick={() => setEditing(r.goal)}>
                  {r.goal.name}
                </button>
                <span className="text-muted">{GOAL_STATUS_LABEL[r.goal.status]}</span>
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
  const tone = p.health === 'FUNDED' ? 'pos' : p.health === 'AT_RISK' || p.health === 'OVERDUE' ? 'warn' : 'accent'
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{g.name}</h2>
          <div className="text-[12px] text-muted">
            {GOAL_TYPE_LABEL[g.type]} · prioridad {PRIORITY_LABEL[g.priority].toLowerCase()}
            {g.linkedAccountId ? ` · hucha: ${accountName(g.linkedAccountId)}` : ' · reservas en la app'}
          </div>
        </div>
        <Badge tone={tone === 'pos' ? 'pos' : tone === 'warn' ? 'warn' : 'neutral'}>{g.status === 'PAUSED' ? 'En pausa' : GOAL_HEALTH_LABEL[p.health]}</Badge>
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="num text-[22px] font-semibold">{formatEur(p.currentCents)}</span>
          {g.targetCents !== null && <span className="num text-[13px] text-muted">de {formatEur(g.targetCents)}</span>}
        </div>
        {p.progress !== null && <Progress value={p.progress} tone={tone} className="mt-1.5 h-2" />}
      </div>
      <div className="grid grid-cols-2 gap-x-6">
        <KV label="Falta">{p.remainingCents === null ? '—' : <span className="num">{formatEur(p.remainingCents)}</span>}</KV>
        <KV label="Progreso">{formatPct(p.progress)}</KV>
        <KV label="Fecha límite">{g.deadline ? formatDate(g.deadline) : '—'}</KV>
        <KV label="Necesitas al mes">{p.monthlyNeededCents === null ? '—' : <span className="num">{formatEur(p.monthlyNeededCents)}</span>}</KV>
        <KV label="Ritmo (últimos 3 meses)">
          <span className="num">{formatEur(p.paceMonthlyCents)}</span>
        </KV>
        <KV label="Al ritmo previsto, listo en">{p.projectedDate ? formatMonth(p.projectedDate.slice(0, 7)) : '—'}</KV>
        {p.surplusCents > 0 && (
          <KV label="Sobra" className="col-span-2">
            <span className="num text-pos">{formatEur(p.surplusCents)}</span>
          </KV>
        )}
        {p.reservedFromAvailableCents > 0 && (
          <KV label="Restado del disponible" className="col-span-2">
            <span className="num">{formatEur(p.reservedFromAvailableCents)}</span>
          </KV>
        )}
      </div>
      {g.notes && <p className="text-[12px] text-muted">{g.notes}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        {g.linkedAccountId ? (
          <Button size="sm" onClick={() => openTransfer({ toAccountId: g.linkedAccountId!, description: `Aportación ${g.name}` })}>
            Aportar a la hucha
          </Button>
        ) : (
          <Button size="sm" onClick={onAllocate}>
            Reservar / liberar dinero
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Editar
        </Button>
        {row.linkedTxCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => navigate(`/movimientos?objetivo=${g.id}`)}>
            Movimientos ({row.linkedTxCount})
          </Button>
        )}
      </div>
    </section>
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
  const save = useApiMutation('goals.save', { success: (g) => `Objetivo guardado: ${g.name}`, onSuccess: onClose })
  const del = useApiMutation('goals.delete', { success: 'Objetivo borrado', onSuccess: onClose })
  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title={goal ? `Editar ${goal.name}` : 'Nuevo objetivo'}
      footer={
        <>
          {goal && (
            <Button
              variant="ghost"
              className="mr-auto text-neg"
              onClick={async () => {
                if (await confirmDialog({ title: 'Borrar objetivo', text: 'Se borran también sus reservas. Los movimientos no se tocan.', confirm: 'Borrar', danger: true }))
                  del.mutate([goal.id])
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" required className="col-span-2">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as GoalType)}>
            {GOAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {GOAL_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prioridad">
          <Segmented value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
        </Field>
        <Field label="Cantidad objetivo" hint="Vacía si no tiene tope (p. ej. inversión)">
          <MoneyInput value={target} onChange={setTarget} placeholder="—" />
        </Field>
        <Field label="Fecha límite">
          <DateInput value={deadline} onChange={setDeadline} />
        </Field>
        <Field label="Hucha vinculada" hint="Si el dinero está en una cuenta propia del objetivo, su saldo es el progreso" className="col-span-2">
          <Select value={linked} onChange={(e) => setLinked(e.target.value)}>
            <option value="">Ninguna: llevo las reservas en la app</option>
            {(cat?.accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Aportación mensual prevista" hint="Se usa en la previsión y para calcular si vas con retraso">
          <MoneyInput value={planned} onChange={setPlanned} placeholder="—" />
        </Field>
        <Field label="Estado">
          <Select value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
            {GOAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notas" className="col-span-2">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function AllocationModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { cat, accountName } = useCatalog()
  const [mode, setMode] = useState<'reserve' | 'release'>('reserve')
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(todayISO())
  const [accountId, setAccountId] = useState(cat?.accounts.find((a) => a.includeLiquidity)?.id ?? '')
  const [notes, setNotes] = useState('')
  const save = useApiMutation('goals.allocate', { success: 'Reserva guardada', onSuccess: onClose })
  const del = useApiMutation('goals.deleteAllocation', { success: 'Reserva borrada' })
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={`Reservas · ${row.goal.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cerrar</Button>
          <Button
            variant="primary"
            disabled={!amount}
            loading={save.isPending}
            onClick={() => save.mutate([{ goalId: row.goal.id, date, amountCents: (mode === 'reserve' ? 1 : -1) * (amount ?? 0), accountId, notes }])}
          >
            {mode === 'reserve' ? 'Reservar' : 'Liberar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Notice tone="info">
          Reservar no mueve dinero: marca una parte del saldo de una cuenta como apartada para este objetivo. Si la cuenta es líquida, deja de contar como
          disponible para gastar.
        </Notice>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'reserve', label: 'Reservar' },
            { value: 'release', label: 'Liberar' }
          ]}
        />
        <div className="grid grid-cols-[150px_1fr] gap-3">
          <Field label="Fecha">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Importe">
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
        </div>
        <Field label="Cuenta donde está el dinero">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {(cat?.accounts ?? [])
              .filter((a) => a.active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Nota">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {row.allocations.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line text-[13px]">
            {row.allocations.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="num text-muted">{formatDate(a.date)}</span>
                <span className="truncate">{accountName(a.accountId)}</span>
                <span className="num">{formatEur(a.amountCents, { sign: true })}</span>
                <Button size="sm" variant="ghost" onClick={() => del.mutate([a.id])}>
                  Borrar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
