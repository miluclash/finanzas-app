import { CheckCircle2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate, todayISO } from '@shared/dates'
import { ACCOUNT_TYPE_LABEL } from '@shared/labels'
import { formatEur } from '@shared/money'
import { ACCOUNT_TYPES, type Account, type AccountType } from '@shared/types'
import { DataTable, type Column } from '../components/DataTable'
import { useTxEditor } from '../components/TxEditor'
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
  Notice,
  PageHeader,
  Select,
  TextArea,
  TextInput
} from '../components/ui'
import { useApi, useApiMutation, type ApiError } from '../lib/api'
import type { ApiResult } from '../../../main/services/api'

type Row = ApiResult<'accounts.list'>[number]

export function AccountsPage() {
  const q = useApi('accounts.list', [])
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [reconciling, setReconciling] = useState<Row | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const navigate = useNavigate()
  const { openTransfer } = useTxEditor()
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const rows = q.data!.filter((r) => showInactive || r.account.active)
  const inactive = q.data!.filter((r) => !r.account.active).length
  const totalNW = q.data!.filter((r) => r.account.includeNetWorth).reduce((s, r) => s + r.balance.balanceCents, 0)
  const totalLiq = q.data!.filter((r) => r.account.includeLiquidity).reduce((s, r) => s + r.balance.balanceCents, 0)
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Cuenta',
      sort: (r) => r.account.sortOrder,
      cell: (r) => (
        <div>
          <div className={r.account.active ? 'font-medium' : 'text-muted'}>{r.account.name}</div>
          <div className="text-[12px] text-muted">
            {r.account.id} · {r.account.institution ?? 'Sin entidad'} · {ACCOUNT_TYPE_LABEL[r.account.type]}
          </div>
        </div>
      )
    },
    {
      key: 'flags',
      header: 'Cuenta para',
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.account.includeNetWorth && <Badge>Patrimonio</Badge>}
          {r.account.includeLiquidity && <Badge tone="accent">Liquidez</Badge>}
          {!r.account.active && <Badge tone="warn">Inactiva</Badge>}
        </span>
      )
    },
    {
      key: 'balance',
      header: 'Saldo calculado',
      align: 'right',
      sort: (r) => r.balance.balanceCents,
      cell: (r) => (
        <div>
          <Amount cents={r.balance.balanceCents} colored={false} sign={false} strong />
          {r.balance.holdingsCents !== 0 && (
            <div className="text-[12px] text-muted">
              efectivo {formatEur(r.balance.cashCents)} · posiciones {formatEur(r.balance.holdingsCents)}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'verified',
      header: 'Saldo del banco',
      align: 'right',
      cell: (r) =>
        r.balance.lastReconciliation ? (
          <div>
            <span className="num">{formatEur(r.balance.lastReconciliation.bankBalanceCents)}</span>
            <div className="text-[12px] text-muted">el {formatDate(r.balance.lastReconciliation.date)}</div>
          </div>
        ) : (
          <span className="text-muted">Sin verificar</span>
        )
    },
    {
      key: 'diff',
      header: 'Diferencia',
      align: 'right',
      cell: (r) => {
        const rec = r.balance.lastReconciliation
        if (!rec) return <span className="text-muted">—</span>
        if (rec.differenceCents === 0)
          return (
            <span className="inline-flex items-center gap-1 text-pos">
              <CheckCircle2 className="size-4" /> Cuadra
            </span>
          )
        return <span className="num font-medium text-neg">{formatEur(rec.differenceCents, { sign: true })}</span>
      }
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" onClick={() => setReconciling(r)}>
            Verificar saldo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/movimientos?cuenta=${r.account.id}`)}>
            Movimientos ({r.txCount})
          </Button>
        </span>
      )
    }
  ]
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cuentas"
        description="Saldo = saldo inicial + movimientos válidos desde la fecha de apertura. Verifica con el banco para detectar descuadres sin tocar el historial."
        actions={
          <>
            <Button onClick={() => openTransfer()}>Transferencia</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Nueva cuenta
            </Button>
          </>
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.account.id}
        onRowClick={(r) => setEditing(r.account)}
        footer={
          <tr className="text-[13px]">
            <td className="px-3 py-2 font-medium" colSpan={2}>
              Patrimonio (cuentas incluidas)
            </td>
            <td className="px-3 py-2 text-right">
              <Amount cents={totalNW} colored={false} sign={false} strong />
            </td>
            <td className="px-3 py-2 text-right text-muted" colSpan={3}>
              Liquidez <span className="num text-ink">{formatEur(totalLiq)}</span>
            </td>
          </tr>
        }
      />
      {inactive > 0 && (
        <Checkbox checked={showInactive} onChange={setShowInactive} label={`Mostrar cuentas inactivas (${inactive})`} />
      )}
      {editing && <AccountForm account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {reconciling && <ReconcileModal row={reconciling} onClose={() => setReconciling(null)} />}
    </div>
  )
}

export function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'CHECKING')
  const [currency, setCurrency] = useState(account?.currency ?? 'EUR')
  const [opening, setOpening] = useState<number | null>(account?.openingBalanceCents ?? 0)
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? todayISO())
  const [active, setActive] = useState(account?.active ?? true)
  const [nw, setNw] = useState(account?.includeNetWorth ?? true)
  const [liq, setLiq] = useState(account?.includeLiquidity ?? (type === 'CHECKING' || type === 'CASH'))
  const [contrib, setContrib] = useState<number | null>(account?.initialContributionsCents ?? 0)
  const [notes, setNotes] = useState(account?.notes ?? '')
  const save = useApiMutation('accounts.save', { success: (a) => `Cuenta guardada: ${a.name}`, onSuccess: onClose })
  const del = useApiMutation('accounts.delete', { success: 'Cuenta borrada', onSuccess: onClose })
  return (
    <Modal
      open
      onClose={onClose}
      title={account ? `Editar ${account.name}` : 'Nueva cuenta'}
      width={620}
      footer={
        <>
          {account && (
            <Button
              variant="ghost"
              className="mr-auto text-neg"
              onClick={async () => {
                if (await confirmDialog({ title: 'Borrar cuenta', text: 'Solo se puede si no tiene movimientos. Si los tiene, desactívala.', confirm: 'Borrar', danger: true }))
                  del.mutate([account.id])
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
                  id: account?.id ?? null,
                  name,
                  institution,
                  type,
                  currency,
                  openingBalanceCents: opening ?? 0,
                  openingDate,
                  active,
                  includeNetWorth: nw,
                  includeLiquidity: type === 'LIABILITY' ? false : liq,
                  initialContributionsCents: contrib ?? 0,
                  notes,
                  sortOrder: account?.sortOrder ?? 0
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
        <Field label="Nombre" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej.: Cuenta corriente" />
        </Field>
        <Field label="Entidad">
          <TextInput value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Ej.: Santander" />
        </Field>
        <Field label="Tipo" required>
          <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Moneda">
          <TextInput value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Saldo inicial" hint={type === 'LIABILITY' ? 'Las deudas van en negativo' : 'Saldo en la fecha de apertura'}>
          <MoneyInput value={opening} onChange={setOpening} allowNegative />
        </Field>
        <Field label="Fecha de apertura" hint="Los movimientos anteriores no suman (ya están en el saldo inicial)">
          <DateInput value={openingDate} onChange={setOpeningDate} />
        </Field>
        {(type === 'INVESTMENT' || type === 'CRYPTO') && (
          <Field label="Aportado antes de la apertura" hint="Lo que metiste de tu bolsillo antes de empezar a registrarla (para separar aportado y rentabilidad)" className="col-span-2">
            <MoneyInput value={contrib} onChange={setContrib} />
          </Field>
        )}
        <div className="col-span-2 flex flex-col gap-2 rounded-md border border-line bg-surface-2 p-3">
          <Checkbox checked={nw} onChange={setNw} label="Cuenta para el patrimonio" />
          <Checkbox
            checked={liq && type !== 'LIABILITY'}
            disabled={type === 'LIABILITY'}
            onChange={setLiq}
            label="Es dinero que puedo gastar hoy (liquidez)"
            hint="Márcalo solo en la cuenta corriente y el efectivo de uso diario. Huchas, efectivo reservado e inversiones, no."
          />
          <Checkbox checked={active} onChange={setActive} label="Activa" hint="Una cuenta inactiva conserva su historial pero no aparece al registrar movimientos." />
        </div>
        <Field label="Notas" className="col-span-2">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ReconcileModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const [date, setDate] = useState(todayISO())
  const [bank, setBank] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<{ differenceCents: number } | null>(null)
  const history = useApi('accounts.reconciliations', [row.account.id])
  const save = useApiMutation('accounts.reconcile', {
    onSuccess: (r) => setResult(r),
    success: (r) => (r.differenceCents === 0 ? 'Saldo verificado: cuadra con el banco' : 'Saldo registrado: hay diferencia')
  })
  const delRec = useApiMutation('accounts.deleteReconciliation', { success: 'Verificación borrada' })
  return (
    <Modal open onClose={onClose} title={`Verificar saldo · ${row.account.name}`} width={600} footer={<Button onClick={onClose}>Cerrar</Button>}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-muted">
          Escribe el saldo que ves en el banco en una fecha. La app lo compara con el saldo calculado a esa misma fecha y te dice si hay descuadre; no se modifica
          ningún movimiento.
        </p>
        <div className="grid grid-cols-[150px_1fr_auto] items-end gap-3">
          <Field label="Fecha">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Saldo en el banco">
            <MoneyInput value={bank} onChange={setBank} allowNegative autoFocus />
          </Field>
          <Button
            variant="primary"
            disabled={bank === null}
            loading={save.isPending}
            onClick={() => save.mutate([{ accountId: row.account.id, date, bankBalanceCents: bank ?? 0, notes }])}
          >
            Comprobar
          </Button>
        </div>
        <Field label="Nota">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </Field>
        {result &&
          (result.differenceCents === 0 ? (
            <Notice tone="pos">Cuadra: el saldo calculado coincide con el del banco.</Notice>
          ) : (
            <Notice tone="neg">
              La app calcula {formatEur(result.differenceCents, { sign: true })} respecto al banco. Busca movimientos que falten, sobren o estén duplicados hasta esa
              fecha (filtra Movimientos por esta cuenta).
            </Notice>
          ))}
        <div>
          <h3 className="mb-1 text-[13px] font-medium">Historial de verificaciones</h3>
          {history.data?.length ? (
            <ul className="divide-y divide-line rounded-md border border-line">
              {history.data.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="num text-muted">{formatDate(h.date)}</span>
                  <span className="num">banco {formatEur(h.bankBalanceCents)}</span>
                  <span className={h.differenceCents === 0 ? 'text-pos' : 'num text-neg'}>
                    {h.differenceCents === 0 ? 'cuadra' : formatEur(h.differenceCents, { sign: true })}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => delRec.mutate([h.id])}>
                    Borrar
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">Aún no has verificado esta cuenta.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

export type { ApiError }
