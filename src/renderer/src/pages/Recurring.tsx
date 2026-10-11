import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate } from '@shared/dates'
import { FREQUENCY_LABEL, RECURRING_KIND_LABEL } from '@shared/labels'
import { formatEur } from '@shared/money'
import { FREQUENCIES, RECURRING_KINDS, type Frequency, type RecurringKind, type RecurringRule } from '@shared/types'
import { DataTable, type Column } from '../components/DataTable'
import {
  Amount,
  Badge,
  Button,
  Checkbox,
  confirmDialog,
  DateInput,
  ErrorBox,
  Field,
  Loading,
  Modal,
  MoneyInput,
  PageHeader,
  Section,
  Select,
  TextArea,
  TextInput
} from '../components/ui'
import { useApi, useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'
import type { ApiResult } from '../../../main/services/api'

type Row = ApiResult<'recurring.list'>[number]

export function RecurringPage() {
  const q = useApi('recurring.list', [])
  const { accountName, categoryName } = useCatalog()
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null)
  const navigate = useNavigate()
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
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
        <div>
          <div className="font-medium">{r.rule.concept}</div>
          <div className="text-[12px] text-muted">
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
          <Amount cents={r.rule.kind === 'INCOME' ? r.rule.amountCents : -r.rule.amountCents} />
          {(r.rule.minCents !== null || r.rule.maxCents !== null) && (
            <div className="text-[12px] text-muted">
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
          <span className="num">{formatDate(r.status.nextDate)}</span>
        ) : r.rule.startDate ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="text-[12px] text-muted">Sin fecha</span>
        )
    },
    {
      key: 'monthly',
      header: 'Equivalente mensual',
      align: 'right',
      sort: (r) => r.status.monthlyEquivalentCents,
      cell: (r) => (r.rule.frequency === 'ONE_OFF' ? <span className="text-muted">—</span> : <Amount cents={r.status.monthlyEquivalentCents} />)
    },
    {
      key: 'last',
      header: 'Último registrado',
      cell: (r) =>
        r.status.lastMatchedDate ? (
          <button
            className="num text-ink-2 hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/movimientos?recurrente=${r.rule.id}`)
            }}
          >
            {formatDate(r.status.lastMatchedDate)}
          </button>
        ) : (
          <span className="text-muted">—</span>
        )
    },
    {
      key: 'state',
      header: '',
      cell: (r) => (
        <span className="flex gap-1">
          {!r.rule.active && <Badge>Pausado</Badge>}
          {r.status.finished && r.rule.active && <Badge tone="pos">Terminado</Badge>}
          {r.status.overdue.length > 0 && (
            <Badge tone="warn" title={`Previsto: ${r.status.overdue.map(formatDate).join(', ')}`}>
              Sin registrar
            </Badge>
          )}
        </span>
      )
    }
  ]
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Recurrentes"
        description="Lo que esperas que se repita. Alimenta la previsión y el disponible, pero nunca crea movimientos reales: cuando llega el cargo, lo registras y queda enlazado."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nuevo recurrente
          </Button>
        }
      />
      <div className="flex flex-wrap gap-8 text-[13px]">
        <span className="text-muted">
          Ingresos/mes <Amount cents={income} />
        </span>
        <span className="text-muted">
          Gastos fijos/mes <Amount cents={expense} />
        </span>
        <span className="text-muted">
          Transferencias/mes <Amount cents={transfers} />
        </span>
        <span className="text-muted">
          Saldo recurrente <Amount cents={income + expense + transfers} strong />
        </span>
      </div>
      <DataTable rows={activeRows} columns={columns} rowKey={(r) => r.rule.id} onRowClick={(r) => setEditing(r.rule)} initialSort={{ key: 'next', dir: 'asc' }} />
      {finishedRows.length > 0 && (
        <Section title="Terminados o pausados">
          <DataTable rows={finishedRows} columns={columns} rowKey={(r) => r.rule.id} onRowClick={(r) => setEditing(r.rule)} dense />
        </Section>
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
  const save = useApiMutation('recurring.save', { success: (r) => `Recurrente guardado: ${r.concept}`, onSuccess: onClose })
  const del = useApiMutation('recurring.delete', { success: 'Recurrente borrado', onSuccess: onClose })
  const wantKind = kind === 'INCOME' ? 'INCOME' : 'EXPENSE'
  const accounts = (cat?.accounts ?? []).filter((a) => a.active || a.id === accountId || a.id === toAccountId)
  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title={rule ? `Editar ${rule.concept}` : 'Nuevo recurrente'}
      footer={
        <>
          {rule && (
            <Button
              variant="ghost"
              className="mr-auto text-neg"
              onClick={async () => {
                if (await confirmDialog({ title: 'Borrar recurrente', text: 'Los movimientos ya registrados se conservan; solo pierden el enlace. Para dejar de usarlo sin borrar, pausa la regla.', confirm: 'Borrar', danger: true }))
                  del.mutate([rule.id])
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Concepto" required className="col-span-2">
          <TextInput value={concept} onChange={(e) => setConcept(e.target.value)} autoFocus placeholder="Ej.: Gimnasio, Nómina, Plan de inversión" />
        </Field>
        <Field label="Tipo" required>
          <Select value={kind} onChange={(e) => setKind(e.target.value as RecurringKind)}>
            {RECURRING_KINDS.map((k) => (
              <option key={k} value={k}>
                {RECURRING_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Importe" required>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Frecuencia" required>
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={frequency === 'ONE_OFF' ? 'Fecha' : 'Fecha de un cargo (ancla)'} hint={frequency === 'ONE_OFF' ? undefined : 'Una fecha en la que toca; las siguientes se calculan solas. Vacía = se reparte cada mes'}>
          <DateInput value={startDate} onChange={setStartDate} />
        </Field>
        <Field label={kind === 'TRANSFER' ? 'Desde' : 'Cuenta'} required>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {kind === 'TRANSFER' ? (
          <Field label="Hacia" required>
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Elige…</option>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field label="Categoría" required>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Elige…</option>
              {(cat?.categories ?? [])
                .filter((c) => categoryKind(c.id) === wantKind)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        {frequency !== 'ONE_OFF' && (
          <Field label="Fecha final" hint="Opcional: último cargo previsto">
            <DateInput value={endDate} onChange={setEndDate} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mínimo" hint="Rango esperado">
            <MoneyInput value={min} onChange={setMin} placeholder="—" />
          </Field>
          <Field label="Máximo">
            <MoneyInput value={max} onChange={setMax} placeholder="—" />
          </Field>
        </div>
        <div className="col-span-2 flex gap-6">
          <Checkbox checked={essential} onChange={setEssential} label="Esencial" />
          <Checkbox checked={active} onChange={setActive} label="Activo" />
        </div>
        <Field label="Notas" className="col-span-2">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
