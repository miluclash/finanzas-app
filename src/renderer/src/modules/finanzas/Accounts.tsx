import { ArrowsLeftRight, Bank, Plus, Wallet } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate, todayISO } from '@shared/dates'
import { ACCOUNT_TYPE_LABEL } from '@shared/modules/finanzas/labels'
import { formatEur } from '@shared/money'
import { ACCOUNT_TYPES, type Account, type AccountType } from '@shared/modules/finanzas/types'
import { useTxEditor } from './components/TxEditor'
import { Button, Card, Checkbox, CifraEur, ConfirmDialog, DatePicker, EmptyState, ErrorState, KpiCard, LoadingState, Modal, MoneyField, PageHeader, Select, StatusBadge, Tag, TextArea, TextField } from '../../core/ui'
import { useApi, useApiMutation, type ApiError } from '../../lib/api'
import type { ApiResult } from '../../../../main/app'

type Row = ApiResult<'finanzas:accounts.list'>[number]

export function AccountsPage() {
  const q = useApi('finanzas:accounts.list', [])
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [reconciling, setReconciling] = useState<Row | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const navigate = useNavigate()
  const { openTransfer } = useTxEditor()
  const cabecera = (
    <PageHeader
      titulo="Cuentas"
      texto="Saldo = saldo inicial + movimientos válidos desde la fecha de apertura. Verifica con el banco para detectar descuadres sin tocar el historial."
      acciones={
        <>
          <Button kbd="T" icon={<ArrowsLeftRight size={16} />} onClick={() => openTransfer()}>
            Transferencia
          </Button>
          <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => setEditing('new')}>
            Nueva cuenta
          </Button>
        </>
      }
    />
  )
  if (q.isLoading)
    return (
      <div data-module="finanzas">
        {cabecera}
        <div className="card">
          <LoadingState filas={3} etiqueta="Cargando las cuentas" />
        </div>
      </div>
    )
  if (q.error || !q.data)
    return (
      <div data-module="finanzas">
        {cabecera}
        <ErrorState titulo="No se han podido cargar las cuentas" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
      </div>
    )
  const rows = q.data!.filter((r) => showInactive || r.account.active)
  const inactive = q.data!.filter((r) => !r.account.active).length
  const totalNW = q.data!.filter((r) => r.account.includeNetWorth).reduce((s, r) => s + r.balance.balanceCents, 0)
  const totalLiq = q.data!.filter((r) => r.account.includeLiquidity).reduce((s, r) => s + r.balance.balanceCents, 0)
  return (
    <div data-module="finanzas">
      {cabecera}
      <div className="page-grid">
        <KpiCard titulo="Patrimonio (cuentas incluidas)" icono={<Bank size={20} weight="duotone" aria-hidden />} valor={<CifraEur cents={totalNW} />} contexto="Suma de las cuentas que cuentan para el patrimonio" className="col-span-12 @3xl:col-span-6" />
        <KpiCard titulo="Liquidez" icono={<Wallet size={20} weight="duotone" aria-hidden />} valor={<CifraEur cents={totalLiq} />} contexto="Suma de las cuentas que son dinero gastable" className="col-span-12 @3xl:col-span-6" />
      </div>

      <h2 className="t-section mb-3 mt-10">Tus cuentas</h2>
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icono={<Bank size={24} aria-hidden />} titulo="Aún no tienes cuentas" texto="Crea la primera para empezar a registrar movimientos." accion={<Button variant="primary" onClick={() => setEditing('new')}>Nueva cuenta</Button>} />
        </div>
      ) : (
        <ul className="page-grid">
          {rows.map((r) => {
            const rec = r.balance.lastReconciliation
            return (
              <li key={r.account.id} className="col-span-12 @3xl:col-span-6">
                <Card as="article" etiqueta={r.account.name} className="flex h-full flex-col">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className={r.account.active ? 't-card-title' : 't-card-title text-ink-3'}>{r.account.name}</h3>
                      <p className="t-meta mt-1">
                        {r.account.id} · {r.account.institution ?? 'Sin entidad'} · {ACCOUNT_TYPE_LABEL[r.account.type]}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {r.account.includeNetWorth && <Tag>Patrimonio</Tag>}
                      {r.account.includeLiquidity && <Tag tono="accent">Liquidez</Tag>}
                      {!r.account.active && <Tag tono="warning">Inactiva</Tag>}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="t-label">Saldo calculado</div>
                    <div className="t-kpi mt-1">
                      <CifraEur cents={r.balance.balanceCents} />
                    </div>
                    {r.balance.holdingsCents !== 0 && (
                      <p className="t-meta mt-1">
                        efectivo {formatEur(r.balance.cashCents)} · posiciones {formatEur(r.balance.holdingsCents)}
                      </p>
                    )}
                  </div>
                  <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="t-label">Saldo del banco</dt>
                      <dd className="tnum text-ink-2">{rec ? `${formatEur(rec.bankBalanceCents)} · el ${formatDate(rec.date)}` : 'Sin verificar'}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="t-label">Diferencia</dt>
                      <dd>
                        {!rec ? <span className="text-ink-3">—</span> : rec.differenceCents === 0 ? <StatusBadge tono="success">Cuadra</StatusBadge> : <StatusBadge tono="error">{formatEur(rec.differenceCents, { sign: true })}</StatusBadge>}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <Button size="sm" variant="secondary" onClick={() => setReconciling(r)}>
                      Verificar saldo
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/finanzas/movimientos?cuenta=${r.account.id}`)}>
                      Movimientos ({r.txCount})
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto" aria-label={`Editar la cuenta ${r.account.name}`} onClick={() => setEditing(r.account)}>
                      Editar
                    </Button>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {inactive > 0 && (
        <div className="mt-6">
          <Checkbox checked={showInactive} onChange={setShowInactive} label={`Mostrar cuentas inactivas (${inactive})`} />
        </div>
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
  const [borrar, setBorrar] = useState(false)
  const nombreRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:accounts.save', { success: (a) => `Cuenta guardada: ${a.name}`, onSuccess: onClose })
  const del = useApiMutation('finanzas:accounts.delete', { success: 'Cuenta borrada', onSuccess: onClose })
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={account ? `Editar ${account.name}` : 'Nueva cuenta'}
        ancho="lg"
        inicial={nombreRef}
        onCerrar={onClose}
        pie={
          <>
            {account && (
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
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField ref={nombreRef} label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Cuenta corriente" />
          <TextField label="Entidad" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Ej.: Santander" />
          <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <TextField label="Moneda" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          <MoneyField label="Saldo inicial" ayuda={type === 'LIABILITY' ? 'Las deudas van en negativo.' : 'Saldo en la fecha de apertura.'} value={opening} onChange={setOpening} permitirNegativo />
          <DatePicker label="Fecha de apertura" value={openingDate} onChange={setOpeningDate} ayuda="Los movimientos anteriores no suman (ya están en el saldo inicial)." />
          {(type === 'INVESTMENT' || type === 'CRYPTO') && (
            <MoneyField className="sm:col-span-2" label="Aportado antes de la apertura" ayuda="Lo que metiste de tu bolsillo antes de empezar a registrarla (para separar aportado y rentabilidad)." value={contrib} onChange={setContrib} />
          )}
          <div className="flex flex-col gap-3 r-control bg-raised p-4 sm:col-span-2">
            <Checkbox checked={nw} onChange={setNw} label="Cuenta para el patrimonio" />
            <Checkbox
              checked={liq && type !== 'LIABILITY'}
              disabled={type === 'LIABILITY'}
              onChange={setLiq}
              label="Es dinero que puedo gastar hoy (liquidez)"
              ayuda="Márcalo solo en la cuenta corriente y el efectivo de uso diario. Huchas, efectivo reservado e inversiones, no."
            />
            <Checkbox checked={active} onChange={setActive} label="Activa" ayuda="Una cuenta inactiva conserva su historial pero no aparece al registrar movimientos." />
          </div>
          <TextArea className="sm:col-span-2" label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
      {borrar && account && (
        <ConfirmDialog
          titulo="¿Borrar la cuenta?"
          texto="Solo se puede si no tiene movimientos. Si los tiene, desactívala."
          confirmar="Borrar cuenta"
          onCancelar={() => setBorrar(false)}
          onConfirmar={() => (setBorrar(false), del.mutate([account.id]))}
        />
      )}
    </div>
  )
}

function ReconcileModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const [date, setDate] = useState(todayISO())
  const [bank, setBank] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<{ differenceCents: number } | null>(null)
  const bancoRef = useRef<HTMLInputElement>(null)
  const history = useApi('finanzas:accounts.reconciliations', [row.account.id])
  const save = useApiMutation('finanzas:accounts.reconcile', {
    onSuccess: (r) => setResult(r),
    success: (r) => (r.differenceCents === 0 ? 'Saldo verificado: cuadra con el banco' : 'Saldo registrado: hay diferencia')
  })
  const delRec = useApiMutation('finanzas:accounts.deleteReconciliation', { success: 'Verificación borrada' })
  return (
    <div data-module="finanzas" className="contents">
      <Modal titulo={`Verificar saldo · ${row.account.name}`} ancho="lg" inicial={bancoRef} onCerrar={onClose} pie={<Button onClick={onClose}>Cerrar</Button>}>
        <div className="flex flex-col gap-4">
          <p className="t-label">
            Escribe el saldo que ves en el banco en una fecha. La app lo compara con el saldo calculado a esa misma fecha y te dice si hay descuadre; no se modifica ningún movimiento.
          </p>
          <div className="grid items-start gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <DatePicker label="Fecha" value={date} onChange={setDate} />
            <MoneyField ref={bancoRef} label="Saldo en el banco" value={bank} onChange={setBank} permitirNegativo />
            <Button className="sm:mt-6" variant="accent" disabled={bank === null} cargando={save.isPending} onClick={() => save.mutate([{ accountId: row.account.id, date, bankBalanceCents: bank ?? 0, notes }])}>
              Comprobar
            </Button>
          </div>
          <TextField label="Nota" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          {result &&
            (result.differenceCents === 0 ? (
              <StatusBadge tono="success">Cuadra: el saldo calculado coincide con el del banco.</StatusBadge>
            ) : (
              <div role="alert">
                <StatusBadge tono="error" className="items-start">
                  La app calcula {formatEur(result.differenceCents, { sign: true })} respecto al banco. Busca movimientos que falten, sobren o estén duplicados hasta esa fecha (filtra Movimientos por esta cuenta).
                </StatusBadge>
              </div>
            ))}
          <div>
            <h3 className="t-card-title mb-2">Historial de verificaciones</h3>
            {history.data?.length ? (
              <ul className="divide-line">
                {history.data.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span className="tnum t-label">{formatDate(h.date)}</span>
                    <span className="tnum t-body">banco {formatEur(h.bankBalanceCents)}</span>
                    {h.differenceCents === 0 ? <StatusBadge tono="success">Cuadra</StatusBadge> : <StatusBadge tono="error">{formatEur(h.differenceCents, { sign: true })}</StatusBadge>}
                    <Button size="sm" variant="ghost" onClick={() => delRec.mutate([h.id])}>
                      Borrar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-label">Aún no has verificado esta cuenta.</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export type { ApiError }
