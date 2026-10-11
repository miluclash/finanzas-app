// Alta rápida y edición de movimientos y transferencias.
import { ChevronDown, ChevronRight, Link2 } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, formatDate, todayISO } from '@shared/dates'
import { applySign } from '@shared/domain/validation'
import { NATURE_LABEL, TX_TYPE_LABEL } from '@shared/labels'
import { formatEur } from '@shared/money'
import type { Nature, Transaction, TxStatus, TxType } from '@shared/types'
import { api, useApi, useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'
import { Button, confirmDialog, DateInput, Field, Modal, MoneyInput, Notice, Segmented, Select, TextArea, TextInput } from './ui'

type EditorState =
  | { kind: 'tx'; id?: string; defaults?: Partial<Transaction> }
  | { kind: 'transfer'; transferId?: string; defaults?: { fromAccountId?: string; toAccountId?: string; amountCents?: number; description?: string; goalId?: string } }
  | null

const Ctx = createContext<{
  openNew: (defaults?: Partial<Transaction>) => void
  openEdit: (id: string) => void
  openTransfer: (defaults?: NonNullable<Extract<EditorState, { kind: 'transfer' }>>['defaults']) => void
} | null>(null)

export function useTxEditor() {
  const c = useContext(Ctx)
  if (!c) throw new Error('TxEditorProvider no encontrado')
  return c
}

export function TxEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>(null)
  const [key, setKey] = useState(0)
  const openNew = useCallback((defaults?: Partial<Transaction>) => {
    setKey((k) => k + 1)
    setState({ kind: 'tx', defaults })
  }, [])
  const openTransfer = useCallback((defaults?: NonNullable<Extract<EditorState, { kind: 'transfer' }>>['defaults']) => {
    setKey((k) => k + 1)
    setState({ kind: 'transfer', defaults })
  }, [])
  const openEdit = useCallback(async (id: string) => {
    try {
      const d = await api('tx.get', id)
      setKey((k) => k + 1)
      if (d.tx.type === 'TRANSFER') setState({ kind: 'transfer', transferId: d.tx.transferId ?? undefined })
      else setState({ kind: 'tx', id })
    } catch {
      setState(null)
    }
  }, [])
  // Atajo de teclado: N = nuevo movimiento, T = transferencia
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (document.querySelector('dialog[open]')) return
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        openNew()
      } else if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        openTransfer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openNew, openTransfer])
  const value = useMemo(() => ({ openNew, openEdit, openTransfer }), [openNew, openEdit, openTransfer])
  return (
    <Ctx.Provider value={value}>
      {children}
      {state?.kind === 'tx' && (
        <TxModal key={key} id={state.id} defaults={state.defaults} onClose={() => setState(null)} onNew={() => openNew()} onTransfer={() => openTransfer()} />
      )}
      {state?.kind === 'transfer' && (
        <TransferModal key={key} transferId={state.transferId} defaults={state.defaults} onClose={() => setState(null)} onMovement={() => openNew()} />
      )}
    </Ctx.Provider>
  )
}

const MAIN_TYPES: Array<{ value: TxType; label: string }> = [
  { value: 'EXPENSE', label: 'Gasto' },
  { value: 'INCOME', label: 'Ingreso' },
  { value: 'REFUND', label: 'Reembolso' },
  { value: 'ADJUSTMENT', label: 'Ajuste' }
]

function TxModal({
  id,
  defaults,
  onClose,
  onNew,
  onTransfer
}: {
  id?: string
  defaults?: Partial<Transaction>
  onClose: () => void
  onNew: () => void
  onTransfer: () => void
}) {
  const { cat, maps, categoryKind } = useCatalog()
  const navigate = useNavigate()
  const existingQ = useApi('tx.get', [id ?? ''], { enabled: !!id })
  const existing = id ? existingQ.data?.tx : undefined
  const settings = cat?.settings
  const accounts = (cat?.accounts ?? []).filter((a) => a.active || a.id === existing?.accountId)
  const defaultAccount =
    defaults?.accountId ??
    (settings?.lastAccountId && maps.account.get(settings.lastAccountId)?.active ? settings.lastAccountId : null) ??
    accounts.find((a) => a.includeLiquidity)?.id ??
    accounts[0]?.id ??
    ''

  const [type, setType] = useState<TxType>(defaults?.type ?? 'EXPENSE')
  const [date, setDate] = useState(defaults?.date ?? todayISO())
  const [amount, setAmount] = useState<number | null>(defaults?.amountCents !== undefined ? Math.abs(defaults.amountCents) : null)
  const [direction, setDirection] = useState<1 | -1>(defaults?.amountCents && defaults.amountCents > 0 ? 1 : -1)
  const [accountId, setAccountId] = useState(defaultAccount)
  const [description, setDescription] = useState(defaults?.description ?? '')
  const [categoryId, setCategoryId] = useState<string>(defaults?.categoryId ?? '')
  const [subcategoryId, setSubcategoryId] = useState<string>(defaults?.subcategoryId ?? '')
  const [newSub, setNewSub] = useState<string | null>(null)
  const [merchant, setMerchant] = useState(defaults?.merchant ?? '')
  const [notes, setNotes] = useState(defaults?.notes ?? '')
  const [goalId, setGoalId] = useState(defaults?.goalId ?? '')
  const [recurringId, setRecurringId] = useState(defaults?.recurringId ?? '')
  const [linkedTxId, setLinkedTxId] = useState(defaults?.linkedTxId ?? '')
  const [nature, setNature] = useState<Nature | ''>(defaults?.nature ?? '')
  const [status, setStatus] = useState<TxStatus>(defaults?.status ?? 'CONFIRMED')
  const [more, setMore] = useState(false)
  const [loaded, setLoaded] = useState(!id)
  const [keepOpen, setKeepOpen] = useState(false)
  const amountRef = useRef<HTMLDivElement>(null)

  // Al cargar un movimiento existente, rellenar el formulario
  useEffect(() => {
    if (!existing || loaded) return
    setType(existing.type)
    setDate(existing.date)
    setAmount(Math.abs(existing.amountCents))
    setDirection(existing.amountCents >= 0 ? 1 : -1)
    setAccountId(existing.accountId)
    setDescription(existing.description)
    setCategoryId(existing.categoryId ?? '')
    setSubcategoryId(existing.subcategoryId ?? '')
    setMerchant(existing.merchant ?? '')
    setNotes(existing.notes ?? '')
    setGoalId(existing.goalId ?? '')
    setRecurringId(existing.recurringId ?? '')
    setLinkedTxId(existing.linkedTxId ?? '')
    setNature(existing.nature ?? '')
    setStatus(existing.status)
    setMore(!!(existing.merchant || existing.notes || existing.goalId || existing.recurringId || existing.nature || existing.status !== 'CONFIRMED'))
    setLoaded(true)
  }, [existing, loaded])

  // Categoría por defecto según el tipo (la última usada si encaja)
  const wantKind = type === 'INCOME' ? 'INCOME' : type === 'EXPENSE' || type === 'REFUND' ? 'EXPENSE' : null
  const categories = (cat?.categories ?? []).filter((c) => wantKind && categoryKind(c.id) === wantKind && (c.active || c.id === categoryId))
  useEffect(() => {
    if (!loaded || !wantKind) return
    if (categoryId && categoryKind(categoryId) === wantKind) return
    const last = settings?.lastCategoryId
    if (!id && last && categoryKind(last) === wantKind) setCategoryId(last)
    else if (categoryId && categoryKind(categoryId) !== wantKind) setCategoryId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, loaded, wantKind])

  const subcats = (cat?.subcategories ?? []).filter((s) => s.categoryId === categoryId && (s.active || s.id === subcategoryId))
  const signed = amount === null ? 0 : applySign(type, amount, direction)

  // Validación en vivo (incluye duplicados y sugerencia de recurrente)
  const draft = {
    id: id ?? null,
    date,
    accountId,
    description,
    amountCents: signed,
    type,
    categoryId: wantKind ? categoryId || null : null,
    subcategoryId: wantKind && !newSub ? subcategoryId || null : null,
    goalId: goalId || null,
    recurringId: recurringId || null,
    linkedTxId: linkedTxId || null,
    status,
    transferId: null
  }
  const [debounced, setDebounced] = useState(draft)
  const draftKey = JSON.stringify(draft)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(JSON.parse(draftKey)), 250)
    return () => clearTimeout(t)
  }, [draftKey])
  const check = useApi('tx.validate', [debounced], { enabled: loaded && !!debounced.accountId && !!amount, placeholderData: (p) => p })

  // Autocompletado desde el historial
  const [focusDesc, setFocusDesc] = useState(false)
  const sugg = useApi('tx.suggest', [description], { enabled: focusDesc && !id && description.trim().length >= 2 })

  // Gastos candidatos para enlazar un reembolso
  const refundCandidates = useApi(
    'tx.list',
    [{ type: 'EXPENSE', from: addDays(date || todayISO(), -180), to: date || todayISO(), categoryId: categoryId || undefined, limit: 60 }],
    { enabled: type === 'REFUND' }
  )

  const save = useApiMutation('tx.save', {
    success: (r) => `${id ? 'Movimiento actualizado' : 'Movimiento guardado'}: ${r.description}`,
    onSuccess: () => {
      if (keepOpen) onNew()
      else onClose()
    }
  })
  const setStatusM = useApiMutation('tx.setStatus', { success: 'Estado actualizado', onSuccess: onClose })
  const del = useApiMutation('tx.delete', { success: 'Movimiento eliminado', onSuccess: onClose })

  const submit = (another: boolean) => {
    setKeepOpen(another)
    save.mutate([
      {
        id: id ?? null,
        date,
        accountId,
        description: description.trim(),
        amountCents: signed,
        type,
        categoryId: wantKind ? categoryId || null : null,
        subcategoryId: wantKind && !newSub ? subcategoryId || null : null,
        newSubcategoryName: wantKind && newSub ? newSub : null,
        merchant: merchant || null,
        recurringId: recurringId || null,
        goalId: goalId || null,
        linkedTxId: type === 'REFUND' || linkedTxId ? linkedTxId || null : null,
        status,
        nature: nature || null,
        notes: notes || null,
        source: existing?.source ?? 'Manual'
      }
    ])
  }

  if (id && existing?.investmentOpId) {
    return (
      <Modal open onClose={onClose} title="Apunte de inversión" width={480} footer={<Button onClick={() => { onClose(); navigate('/inversiones') }}>Ir a Inversiones</Button>}>
        <Notice tone="info">
          Este apunte ({existing.description}, {formatEur(existing.amountCents)}) lo genera una operación de inversión. Para cambiarlo, edita la operación en
          Inversiones.
        </Notice>
      </Modal>
    )
  }

  const errors = check.data?.errors ?? []
  const warnings = check.data?.warnings ?? []
  const suggested = check.data?.suggestedRuleId ? maps.rule.get(check.data.suggestedRuleId) : null
  const rulesForAccount = (cat?.recurring ?? []).filter((r) => r.kind !== 'TRANSFER' && (r.active || r.id === recurringId))
  const goals = (cat?.goals ?? []).filter((g) => g.status === 'ACTIVE' || g.id === goalId)

  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title={id ? `Editar movimiento ${id}` : 'Nuevo movimiento'}
      footer={
        <>
          {id && existing && (
            <div className="mr-auto flex gap-2">
              {existing.status !== 'CANCELLED' ? (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Anular movimiento', text: 'Dejará de contar en saldos y métricas, pero se conserva en el historial.', confirm: 'Anular' }))
                      setStatusM.mutate([[id], 'CANCELLED'])
                  }}
                >
                  Anular
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setStatusM.mutate([[id], 'CONFIRMED'])}>
                  Reactivar
                </Button>
              )}
              <Button
                variant="ghost"
                className="text-neg"
                onClick={async () => {
                  if (
                    await confirmDialog({
                      title: 'Eliminar definitivamente',
                      text: 'Se borra del historial (queda en el registro de auditoría). Si solo quieres que no cuente, usa "Anular".',
                      confirm: 'Eliminar',
                      danger: true
                    })
                  )
                    del.mutate([id])
                }}
              >
                Eliminar
              </Button>
            </div>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          {!id && (
            <Button onClick={() => submit(true)} loading={save.isPending && keepOpen} disabled={errors.length > 0}>
              Guardar y añadir otro
            </Button>
          )}
          <Button variant="primary" onClick={() => submit(false)} loading={save.isPending && !keepOpen} disabled={errors.length > 0 || !loaded}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!errors.length) submit(false)
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            value={type}
            onChange={(v) => setType(v)}
            options={MAIN_TYPES.concat(
              type === 'INVESTMENT_BUY' || type === 'INVESTMENT_SELL' ? [{ value: type, label: TX_TYPE_LABEL[type] }] : []
            )}
          />
          {!id && (
            <Button size="sm" variant="ghost" onClick={onTransfer}>
              Es una transferencia entre mis cuentas
            </Button>
          )}
        </div>
        <div className="grid grid-cols-[150px_170px_minmax(0,1fr)] gap-3">
          <Field label="Fecha" required>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field
            label={type === 'ADJUSTMENT' ? 'Importe' : type === 'INCOME' || type === 'REFUND' ? 'Importe que entra' : 'Importe que sale'}
            required
            hint={type === 'ADJUSTMENT' ? undefined : 'En positivo; el signo se pone solo'}
          >
            <div ref={amountRef}>
              <MoneyInput value={amount} onChange={setAmount} autoFocus={!id} />
            </div>
          </Field>
          <Field label="Cuenta" required>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {type === 'ADJUSTMENT' && (
          <div className="flex items-center gap-3 text-[13px]">
            <span className="text-ink-2">El ajuste</span>
            <Segmented
              size="sm"
              value={direction === 1 ? 'up' : 'down'}
              onChange={(v) => setDirection(v === 'up' ? 1 : -1)}
              options={[
                { value: 'up', label: 'Sube el saldo' },
                { value: 'down', label: 'Baja el saldo' }
              ]}
            />
            <span className="text-muted">No cuenta como ingreso ni gasto (revalorizaciones, correcciones).</span>
          </div>
        )}
        <div className="relative">
          <Field label="Descripción" required>
            <TextInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={() => setFocusDesc(true)}
              onBlur={() => setTimeout(() => setFocusDesc(false), 150)}
              placeholder="Ej.: Mercadona, Nómina octubre…"
              autoComplete="off"
            />
          </Field>
          {focusDesc && (sugg.data?.length ?? 0) > 0 && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
              {sugg.data!.map((s) => (
                <li key={s.description}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] hover:bg-surface-2"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setDescription(s.description)
                      if (MAIN_TYPES.some((t) => t.value === s.type)) setType(s.type)
                      setAccountId(maps.account.get(s.accountId)?.active ? s.accountId : accountId)
                      setCategoryId(s.categoryId ?? '')
                      setSubcategoryId(s.subcategoryId ?? '')
                      setNewSub(null)
                      if (s.merchant) setMerchant(s.merchant)
                      setFocusDesc(false)
                      amountRef.current?.querySelector('input')?.focus()
                    }}
                  >
                    <span className="truncate">{s.description}</span>
                    <span className="shrink-0 text-muted">
                      {s.categoryId ? maps.category.get(s.categoryId)?.name : ''} · {formatEur(s.lastAmountCents)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {wantKind && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría" required>
              <Select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value)
                  setSubcategoryId('')
                  setNewSub(null)
                }}
              >
                <option value="">Elige…</option>
                {(cat?.groups ?? [])
                  .filter((g) => g.kind === wantKind)
                  .map((g) => (
                    <optgroup key={g.id} label={g.name}>
                      {categories
                        .filter((c) => c.groupId === g.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
              </Select>
            </Field>
            <Field label="Subcategoría" hint="Opcional">
              {newSub !== null ? (
                <div className="flex gap-1">
                  <TextInput autoFocus value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Nombre de la nueva subcategoría" />
                  <Button size="sm" variant="ghost" className="h-9" onClick={() => setNewSub(null)}>
                    Volver
                  </Button>
                </div>
              ) : (
                <Select
                  value={subcategoryId}
                  disabled={!categoryId}
                  onChange={(e) => {
                    if (e.target.value === '__new') setNewSub('')
                    else setSubcategoryId(e.target.value)
                  }}
                >
                  <option value="">—</option>
                  {subcats.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__new">+ Nueva subcategoría…</option>
                </Select>
              )}
            </Field>
          </div>
        )}
        {type === 'REFUND' && (
          <Field label="Gasto que se devuelve" hint="El reembolso resta de la categoría de ese gasto; no es un ingreso.">
            <Select
              value={linkedTxId}
              onChange={(e) => {
                setLinkedTxId(e.target.value)
                const t = refundCandidates.data?.rows.find((r) => r.id === e.target.value)
                if (t) {
                  if (t.categoryId) setCategoryId(t.categoryId)
                  if (!description) setDescription(`Devolución ${t.description}`)
                }
              }}
            >
              <option value="">Sin enlazar</option>
              {linkedTxId && !refundCandidates.data?.rows.some((r) => r.id === linkedTxId) && <option value={linkedTxId}>{linkedTxId}</option>}
              {refundCandidates.data?.rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatDate(r.date)} · {r.description} · {formatEur(r.amountCents)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <button type="button" className="flex items-center gap-1 self-start text-[13px] font-medium text-ink-2 hover:text-ink" onClick={() => setMore((m) => !m)}>
          {more ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Más detalles
        </button>
        {more && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface-2 p-3">
            <Field label="Comercio">
              <TextInput value={merchant} onChange={(e) => setMerchant(e.target.value)} />
            </Field>
            <Field label="Estado">
              <Select value={status} onChange={(e) => setStatus(e.target.value as TxStatus)}>
                <option value="CONFIRMED">Confirmado</option>
                <option value="PENDING_REVIEW">Pendiente de revisar</option>
                {id && <option value="CANCELLED">Anulado</option>}
              </Select>
            </Field>
            <Field label="Objetivo asociado" hint="Si se paga con dinero reservado para un objetivo">
              <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                <option value="">—</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Recurrente" hint="Enlázalo para que no se cuente dos veces en la previsión">
              <Select value={recurringId} onChange={(e) => setRecurringId(e.target.value)}>
                <option value="">—</option>
                {rulesForAccount.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.concept}
                  </option>
                ))}
              </Select>
            </Field>
            {(type === 'EXPENSE' || type === 'REFUND') && (
              <Field label="Tipo de gasto" hint="Automático: recurrente = fijo; si no, según la categoría">
                <Select value={nature} onChange={(e) => setNature(e.target.value as Nature | '')}>
                  <option value="">Automático</option>
                  {(['FIXED', 'VARIABLE', 'EXTRAORDINARY'] as Nature[]).map((n) => (
                    <option key={n} value={n}>
                      {NATURE_LABEL[n]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Notas" className="col-span-2">
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
            {existing && (
              <p className="col-span-2 text-[12px] text-muted">
                Origen: {existing.source ?? '—'} · Creado {formatDate(existing.createdAt.slice(0, 10))} · Modificado {formatDate(existing.updatedAt.slice(0, 10))}
              </p>
            )}
          </div>
        )}

        {suggested && !recurringId && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-accent-soft px-3 py-2 text-[13px]">
            <span className="flex items-center gap-2">
              <Link2 className="size-4 text-accent" />
              Parece el recurrente «{suggested.concept}».
            </span>
            <Button size="sm" onClick={() => setRecurringId(suggested.id)}>
              Enlazar
            </Button>
          </div>
        )}
        {errors.length > 0 && amount !== null && (
          <Notice tone="neg">
            {errors.map((e) => (
              <div key={e.code}>{e.message}</div>
            ))}
          </Notice>
        )}
        {warnings.filter((w) => w.code !== 'PENDING_REVIEW').length > 0 && (
          <Notice tone="warn">
            {warnings
              .filter((w) => w.code !== 'PENDING_REVIEW')
              .map((w) => (
                <div key={w.code}>{w.message}</div>
              ))}
          </Notice>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

function TransferModal({
  transferId,
  defaults,
  onClose,
  onMovement
}: {
  transferId?: string
  defaults?: { fromAccountId?: string; toAccountId?: string; amountCents?: number; description?: string; goalId?: string }
  onClose: () => void
  onMovement: () => void
}) {
  const { cat, maps } = useCatalog()
  const legsQ = useApi('tx.list', [{ transferId: transferId ?? '__none__', includeCancelled: true }], { enabled: !!transferId })
  const legs = (legsQ.data?.rows ?? []).filter((t) => t.transferId === transferId)
  const accounts = (cat?.accounts ?? []).filter((a) => a.active || legs.some((l) => l.accountId === a.id))
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState<number | null>(defaults?.amountCents ?? null)
  const [fromId, setFromId] = useState(defaults?.fromAccountId ?? accounts.find((a) => a.includeLiquidity)?.id ?? '')
  const [toId, setToId] = useState(defaults?.toAccountId ?? '')
  const [description, setDescription] = useState(defaults?.description ?? '')
  const [touchedDesc, setTouchedDesc] = useState(!!defaults?.description)
  const [goalId, setGoalId] = useState(defaults?.goalId ?? '')
  const [recurringId, setRecurringId] = useState('')
  const [status, setStatus] = useState<TxStatus>('CONFIRMED')
  const [notes, setNotes] = useState('')
  const [loaded, setLoaded] = useState(!transferId)
  useEffect(() => {
    if (loaded || legs.length < 2) return
    const out = legs.find((l) => l.amountCents < 0)!
    const inn = legs.find((l) => l.amountCents > 0)!
    setDate(out.date)
    setAmount(Math.abs(out.amountCents))
    setFromId(out.accountId)
    setToId(inn.accountId)
    setDescription(out.description)
    setTouchedDesc(true)
    setGoalId(out.goalId ?? '')
    setRecurringId(out.recurringId ?? '')
    setStatus(out.status)
    setNotes(out.notes ?? '')
    setLoaded(true)
  }, [legs, loaded])
  useEffect(() => {
    if (!touchedDesc && toId) setDescription(`Traspaso a ${maps.account.get(toId)?.name ?? ''}`)
  }, [toId, touchedDesc, maps.account])
  const save = useApiMutation('tx.saveTransfer', {
    success: transferId ? 'Transferencia actualizada' : 'Transferencia guardada',
    onSuccess: onClose
  })
  const setStatusM = useApiMutation('tx.setStatus', { success: 'Estado actualizado', onSuccess: onClose })
  const del = useApiMutation('tx.delete', { success: 'Transferencia eliminada', onSuccess: onClose })
  const sameAccount = fromId && toId && fromId === toId
  const transferRules = (cat?.recurring ?? []).filter((r) => r.kind === 'TRANSFER' && (r.active || r.id === recurringId))
  return (
    <Modal
      open
      onClose={onClose}
      width={600}
      title={transferId ? `Editar transferencia ${transferId}` : 'Nueva transferencia'}
      footer={
        <>
          {transferId && legs[0] && (
            <div className="mr-auto flex gap-2">
              {legs[0].status !== 'CANCELLED' ? (
                <Button variant="ghost" onClick={() => setStatusM.mutate([[legs[0].id], 'CANCELLED'])}>
                  Anular
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setStatusM.mutate([[legs[0].id], 'CONFIRMED'])}>
                  Reactivar
                </Button>
              )}
              <Button
                variant="ghost"
                className="text-neg"
                onClick={async () => {
                  if (await confirmDialog({ title: 'Eliminar transferencia', text: 'Se borran los dos apuntes.', confirm: 'Eliminar', danger: true }))
                    del.mutate([legs[0].id])
                }}
              >
                Eliminar
              </Button>
            </div>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!amount || !fromId || !toId || !!sameAccount || !loaded}
            onClick={() =>
              save.mutate([
                {
                  transferId: transferId ?? null,
                  date,
                  fromAccountId: fromId,
                  toAccountId: toId,
                  amountCents: amount ?? 0,
                  description: description.trim() || 'Transferencia',
                  goalId: goalId || null,
                  recurringId: recurringId || null,
                  status,
                  notes: notes || null
                }
              ])
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-muted">
          Mover dinero entre tus cuentas no es ingreso ni gasto: se guardan dos apuntes enlazados (sale de una, entra en otra) que siempre cuadran.
          {!transferId && (
            <>
              {' '}
              <button className="font-medium text-accent hover:underline" onClick={onMovement}>
                Registrar un gasto o ingreso
              </button>
            </>
          )}
        </p>
        <div className="grid grid-cols-[150px_170px_minmax(0,1fr)] gap-3">
          <Field label="Fecha" required>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Importe" required>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Estado">
            <Select value={status} onChange={(e) => setStatus(e.target.value as TxStatus)}>
              <option value="CONFIRMED">Confirmado</option>
              <option value="PENDING_REVIEW">Pendiente de revisar</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sale de" required>
            <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Elige…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Entra en" required error={sameAccount ? 'Elige otra cuenta' : null}>
            <Select value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Elige…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Descripción">
          <TextInput
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setTouchedDesc(true)
            }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Objetivo" hint="Opcional, para identificarla">
            <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">—</option>
              {(cat?.goals ?? [])
                .filter((g) => g.status === 'ACTIVE' || g.id === goalId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Transferencia recurrente" hint="Ej.: plan de inversión mensual">
            <Select value={recurringId} onChange={(e) => setRecurringId(e.target.value)}>
              <option value="">—</option>
              {transferRules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.concept}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notas">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        {legs.length > 0 && legs.some((l) => l.status === 'CANCELLED') && <Notice tone="warn">Esta transferencia está anulada.</Notice>}
      </div>
    </Modal>
  )
}
