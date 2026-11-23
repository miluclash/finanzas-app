// Alta rápida y edición de movimientos y transferencias.
// Orden de los campos: importe, concepto, categoría y cuenta, fecha, acciones. Foco inicial en el importe;
// Intro guarda, Esc cierra y el foco vuelve a quien lo abrió (lo hace el Modal del sistema de diseño).
import { ArrowRight, CaretDown, CaretRight, CheckCircle, Info, LinkSimple } from '@phosphor-icons/react'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, formatDate, todayISO } from '@shared/dates'
import { applySign } from '@shared/modules/finanzas/validation'
import { NATURE_LABEL, TX_TYPE_LABEL } from '@shared/modules/finanzas/labels'
import { formatEur } from '@shared/money'
import type { Nature, Transaction, TxStatus, TxType } from '@shared/modules/finanzas/types'
import { api, useApi, useApiMutation } from '../../../lib/api'
import { useCatalog } from '../../../lib/catalog'
import { Button, ConfirmDialog, DatePicker, hayCapaAbierta, Modal, MoneyField, SegmentedControl, Select, StatusBadge, TextArea, TextField } from '../../../core/ui'

type TransferDefaults = { fromAccountId?: string; toAccountId?: string; amountCents?: number; description?: string; goalId?: string; date?: string }
type EditorState = { kind: 'tx'; id?: string; defaults?: Partial<Transaction> } | { kind: 'transfer'; transferId?: string; defaults?: TransferDefaults } | null

const Ctx = createContext<{
  openNew: (defaults?: Partial<Transaction>) => void
  openEdit: (id: string) => void
  openTransfer: (defaults?: TransferDefaults) => void
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
  const openTransfer = useCallback((defaults?: TransferDefaults) => {
    setKey((k) => k + 1)
    setState({ kind: 'transfer', defaults })
  }, [])
  const openEdit = useCallback(async (id: string) => {
    try {
      const d = await api('finanzas:tx.get', id)
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
      if (hayCapaAbierta()) return
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
      {/* Los diálogos cuelgan de la raíz, fuera de la página: llevan la identidad de Finanzas */}
      <div data-module="finanzas" className="contents">
        {state?.kind === 'tx' && <TxModal key={key} id={state.id} defaults={state.defaults} onClose={() => setState(null)} onNew={openNew} onTransfer={openTransfer} />}
        {state?.kind === 'transfer' && <TransferModal key={key} transferId={state.transferId} defaults={state.defaults} onClose={() => setState(null)} onMovement={openNew} />}
      </div>
    </Ctx.Provider>
  )
}

type Segmento = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'REFUND' | 'ADJUSTMENT' | 'INVESTMENT_BUY' | 'INVESTMENT_SELL'

/** Gasto / Ingreso / Transferencia. Si el apunte es de otro tipo (reembolso, ajuste…), aparece como cuarta opción ya marcada */
function TipoMovimiento({ value, onChange, bloquear }: { value: Segmento; onChange: (v: Segmento) => void; bloquear: 'transferencia' | 'resto' | null }) {
  const especial = value !== 'EXPENSE' && value !== 'INCOME' && value !== 'TRANSFER'
  return (
    <SegmentedControl<Segmento>
      label="Tipo de movimiento"
      value={value}
      onChange={onChange}
      opciones={[
        { id: 'EXPENSE', texto: 'Gasto', desactivada: bloquear === 'resto' },
        { id: 'INCOME', texto: 'Ingreso', desactivada: bloquear === 'resto' },
        { id: 'TRANSFER', texto: 'Transferencia', desactivada: bloquear === 'transferencia' },
        ...(especial ? [{ id: value, texto: TX_TYPE_LABEL[value as TxType] }] : [])
      ]}
    />
  )
}

/** Botón que despliega «Más detalles» con su estado a la vista */
function MasDetalles({ abierto, onAlternar, id, texto = 'Más detalles' }: { abierto: boolean; onAlternar: () => void; id: string; texto?: string }) {
  return (
    <button type="button" className="t-label flex items-center gap-1 self-start font-semibold text-ink-2 hover:text-ink" aria-expanded={abierto} aria-controls={id} onClick={onAlternar}>
      {abierto ? <CaretDown size={16} aria-hidden /> : <CaretRight size={16} aria-hidden />}
      {texto}
    </button>
  )
}

/** Cierra el diálogo con una breve confirmación de que se ha guardado */
function useCierreTrasGuardar(onClose: () => void) {
  const [hecho, setHecho] = useState(false)
  const t = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(t.current), [])
  return {
    hecho,
    terminar: () => {
      setHecho(true)
      t.current = window.setTimeout(onClose, 600)
    }
  }
}

function enfocarPrimerError() {
  window.setTimeout(() => document.querySelector<HTMLElement>('#tx-form [aria-invalid="true"]')?.focus(), 0)
}

const ERROR_IMPORTE = 'Escribe un importe mayor que cero.'

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
  onNew: (defaults?: Partial<Transaction>) => void
  onTransfer: (defaults?: TransferDefaults) => void
}) {
  const { cat, maps, categoryKind } = useCatalog()
  const navigate = useNavigate()
  const existingQ = useApi('finanzas:tx.get', [id ?? ''], { enabled: !!id })
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
  const [intentado, setIntentado] = useState(false)
  const [confirmar, setConfirmar] = useState<'anular' | 'eliminar' | null>(null)
  const importeRef = useRef<HTMLInputElement>(null)
  const { hecho, terminar } = useCierreTrasGuardar(onClose)
  const uid = useId()

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
    setMore(!!(existing.merchant || existing.notes || existing.goalId || existing.recurringId || existing.nature || existing.status !== 'CONFIRMED' || existing.type === 'REFUND' || existing.type === 'ADJUSTMENT'))
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
  const check = useApi('finanzas:tx.validate', [debounced], { enabled: loaded && !!debounced.accountId && (!!amount || type === 'ADJUSTMENT'), placeholderData: (p) => p })

  // Autocompletado desde el historial, con flechas e Intro
  const [focusDesc, setFocusDesc] = useState(false)
  const [sugIdx, setSugIdx] = useState(-1)
  const sugg = useApi('finanzas:tx.suggest', [description], { enabled: focusDesc && !id && description.trim().length >= 2 })
  const sugerencias = focusDesc ? (sugg.data ?? []) : []
  useEffect(() => setSugIdx(-1), [description])

  // Gastos candidatos para enlazar un reembolso
  const refundCandidates = useApi(
    'finanzas:tx.list',
    [{ type: 'EXPENSE', from: addDays(date || todayISO(), -180), to: date || todayISO(), categoryId: categoryId || undefined, limit: 60 }],
    { enabled: type === 'REFUND' }
  )

  const save = useApiMutation('finanzas:tx.save', {
    success: (r) => `${id ? 'Movimiento actualizado' : 'Movimiento guardado'}: ${r.description}`,
    onSuccess: () => {
      if (keepOpen) onNew()
      else terminar()
    }
  })
  const setStatusM = useApiMutation('finanzas:tx.setStatus', { success: 'Estado actualizado', onSuccess: onClose })
  const del = useApiMutation('finanzas:tx.delete', { success: 'Movimiento eliminado', onSuccess: onClose })

  const errors = check.data?.errors ?? []
  const warnings = check.data?.warnings ?? []
  // Errores por campo: los locales (vacíos) y los que devuelve la validación. Se muestran al intentar guardar
  const errCampo = (campo: string) => errors.find((e) => e.field === campo)?.message
  // Igual que la validación de main: el importe no puede ser 0 salvo en un ajuste de saldo
  const errImporte = type !== 'ADJUSTMENT' && (amount === null || amount === 0) ? ERROR_IMPORTE : errCampo('amountCents')
  const errConcepto = description.trim() === '' ? 'Escribe un concepto.' : errCampo('description')
  const errCategoria = wantKind ? errCampo('categoryId') : undefined
  const errCuenta = errCampo('accountId')
  const errFecha = errCampo('date')
  const generales = errors.filter((e) => !['amountCents', 'description', 'categoryId', 'accountId', 'date'].includes(e.field ?? ''))
  const hayErrores = !!errImporte || !!errConcepto || !!errCategoria || !!errCuenta || !!errFecha || generales.length > 0
  const mostrar = (m?: string) => (intentado ? m : undefined)

  const submit = (another: boolean) => {
    if (hayErrores) {
      setIntentado(true)
      enfocarPrimerError()
      return
    }
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

  const elegirSugerencia = (s: NonNullable<typeof sugg.data>[number]) => {
    setDescription(s.description)
    if (['EXPENSE', 'INCOME', 'REFUND', 'ADJUSTMENT'].includes(s.type)) setType(s.type)
    setAccountId(maps.account.get(s.accountId)?.active ? s.accountId : accountId)
    setCategoryId(s.categoryId ?? '')
    setSubcategoryId(s.subcategoryId ?? '')
    setNewSub(null)
    if (s.merchant) setMerchant(s.merchant)
    setFocusDesc(false)
    importeRef.current?.focus()
  }

  if (id && existing?.investmentOpId) {
    return (
      <Modal
        titulo="Apunte de inversión"
        ancho="sm"
        onCerrar={onClose}
        pie={
          <Button
            variant="accent"
            onClick={() => {
              onClose()
              navigate('/finanzas/inversiones')
            }}
          >
            Ir a Inversiones
          </Button>
        }
      >
        <p className="t-label flex items-start gap-2">
          <Info size={16} className="mt-px shrink-0" aria-hidden />
          Este apunte ({existing.description}, {formatEur(existing.amountCents)}) lo genera una operación de inversión. Para cambiarlo, edita la operación en Inversiones.
        </p>
      </Modal>
    )
  }

  const suggested = check.data?.suggestedRuleId ? maps.rule.get(check.data.suggestedRuleId) : null
  const rulesForAccount = (cat?.recurring ?? []).filter((r) => r.kind !== 'TRANSFER' && (r.active || r.id === recurringId))
  const goals = (cat?.goals ?? []).filter((g) => g.status === 'ACTIVE' || g.id === goalId)
  const ocupado = save.isPending || hecho
  const titulo = id ? `Editar movimiento ${id}` : type === 'INCOME' ? 'Nuevo ingreso' : type === 'REFUND' ? 'Nuevo reembolso' : type === 'ADJUSTMENT' ? 'Nuevo ajuste' : 'Nuevo gasto'
  const especial = type === 'REFUND' || type === 'ADJUSTMENT' ? type : ''

  return (
    <>
      <Modal
        titulo={titulo}
        descripcion={id ? undefined : 'Los campos con error se marcan al guardar.'}
        ancho="lg"
        inicial={importeRef}
        onCerrar={onClose}
        pie={
          hecho ? (
            <StatusBadge tono="success">{id ? 'Movimiento actualizado' : 'Movimiento guardado'}</StatusBadge>
          ) : (
            <>
              {id && existing && (
                <div className="mr-auto flex gap-2">
                  {existing.status !== 'CANCELLED' ? (
                    <Button variant="ghost" onClick={() => setConfirmar('anular')}>
                      Anular
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setStatusM.mutate([[id], 'CONFIRMED'])}>
                      Reactivar
                    </Button>
                  )}
                  <Button variant="danger" onClick={() => setConfirmar('eliminar')}>
                    Eliminar
                  </Button>
                </div>
              )}
              <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
                Cancelar
              </Button>
              {!id && (
                <Button onClick={() => submit(true)} cargando={save.isPending && keepOpen} disabled={!loaded || ocupado}>
                  Guardar y añadir otro
                </Button>
              )}
              <Button variant="accent" type="submit" form="tx-form" cargando={save.isPending && !keepOpen} disabled={!loaded || ocupado}>
                Guardar
              </Button>
            </>
          )
        }
      >
        <form
          id="tx-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit(false)
          }}
        >
          <fieldset disabled={ocupado} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
            <TipoMovimiento
              value={type}
              bloquear={id ? 'transferencia' : null}
              onChange={(v) => {
                if (id && v === 'TRANSFER') return
                if (v === 'TRANSFER') onTransfer({ amountCents: amount ?? undefined, description: description.trim() || undefined, fromAccountId: accountId || undefined, date })
                else setType(v as TxType)
              }}
            />
            <MoneyField
              ref={importeRef}
              label={type === 'ADJUSTMENT' ? 'Importe' : type === 'INCOME' || type === 'REFUND' ? 'Importe que entra' : 'Importe que sale'}
              value={amount}
              onChange={setAmount}
              tamano="lg"
              ayuda={type === 'ADJUSTMENT' ? undefined : 'En positivo; el signo se pone solo.'}
              error={mostrar(errImporte)}
            />
            {type === 'ADJUSTMENT' && (
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl
                  label="Efecto del ajuste"
                  tamano="sm"
                  value={direction === 1 ? 'up' : 'down'}
                  onChange={(v) => setDirection(v === 'up' ? 1 : -1)}
                  opciones={[
                    { id: 'up', texto: 'Sube el saldo' },
                    { id: 'down', texto: 'Baja el saldo' }
                  ]}
                />
                <span className="t-meta">No cuenta como ingreso ni gasto (revalorizaciones, correcciones).</span>
              </div>
            )}
            <div className="relative">
              <TextField
                label="Concepto"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onFocus={() => setFocusDesc(true)}
                onBlur={() => setTimeout(() => setFocusDesc(false), 150)}
                onKeyDown={(e) => {
                  if (!sugerencias.length) return
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSugIdx((i) => (e.key === 'ArrowDown' ? (i + 1) % sugerencias.length : (i - 1 + sugerencias.length) % sugerencias.length))
                  } else if (e.key === 'Enter' && sugIdx >= 0) {
                    e.preventDefault()
                    elegirSugerencia(sugerencias[sugIdx])
                  } else if (e.key === 'Escape') {
                    e.stopPropagation()
                    setFocusDesc(false)
                  }
                }}
                placeholder="Ej.: Mercadona, Nómina octubre…"
                autoComplete="off"
                role="combobox"
                aria-expanded={sugerencias.length > 0}
                aria-controls={`${uid}-sug`}
                aria-autocomplete="list"
                error={mostrar(errConcepto)}
              />
              {sugerencias.length > 0 && (
                <ul id={`${uid}-sug`} role="listbox" aria-label="Sugerencias del historial" className="elevated absolute z-10 mt-1 max-h-56 w-full overflow-y-auto r-control py-1">
                  {sugerencias.map((s, i) => (
                    <li key={s.description} role="option" aria-selected={i === sugIdx}>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={`t-body flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-interactive ${i === sugIdx ? 'bg-interactive' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          elegirSugerencia(s)
                        }}
                      >
                        <span className="truncate">{s.description}</span>
                        <span className="t-meta shrink-0">
                          {s.categoryId ? maps.category.get(s.categoryId)?.name : ''} · {formatEur(s.lastAmountCents)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {wantKind && (
                <Select
                  label="Categoría"
                  value={categoryId}
                  error={mostrar(errCategoria)}
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
              )}
              <Select label="Cuenta" value={accountId} onChange={(e) => setAccountId(e.target.value)} error={mostrar(errCuenta)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              {wantKind &&
                (newSub !== null ? (
                  <div>
                    <TextField label="Nueva subcategoría" autoFocus value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Nombre de la nueva subcategoría" ayuda="Se crea al guardar." />
                    <Button size="sm" variant="ghost" className="mt-1" onClick={() => setNewSub(null)}>
                      Volver a la lista
                    </Button>
                  </div>
                ) : (
                  <Select
                    label="Subcategoría (opcional)"
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
                ))}
              <DatePicker label="Fecha" value={date} onChange={setDate} error={mostrar(errFecha)} />
            </div>
            {type === 'REFUND' && (
              <Select
                label="Gasto que se devuelve"
                ayuda="El reembolso resta de la categoría de ese gasto; no es un ingreso."
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
            )}

            <MasDetalles abierto={more} onAlternar={() => setMore((m) => !m)} id={`${uid}-mas`} />
            {more && (
              <div id={`${uid}-mas`} className="fade-in grid gap-4 r-control bg-raised p-4 sm:grid-cols-2">
                <Select
                  label="Tipo de apunte"
                  ayuda="Reembolso y ajuste no son gasto ni ingreso normales."
                  value={especial}
                  disabled={type === 'INVESTMENT_BUY' || type === 'INVESTMENT_SELL'}
                  onChange={(e) => setType(e.target.value === '' ? (type === 'INCOME' ? 'INCOME' : 'EXPENSE') : (e.target.value as TxType))}
                >
                  <option value="">Normal (gasto o ingreso)</option>
                  <option value="REFUND">Reembolso (devolución de un gasto)</option>
                  <option value="ADJUSTMENT">Ajuste de saldo</option>
                </Select>
                <TextField label="Comercio" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
                <Select label="Estado" value={status} onChange={(e) => setStatus(e.target.value as TxStatus)}>
                  <option value="CONFIRMED">Confirmado</option>
                  <option value="PENDING_REVIEW">Pendiente de revisar</option>
                  {id && <option value="CANCELLED">Anulado</option>}
                </Select>
                <Select label="Objetivo asociado" ayuda="Si se paga con dinero reservado para un objetivo." value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  <option value="">—</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
                <Select label="Recurrente" ayuda="Enlázalo para que no se cuente dos veces en la previsión." value={recurringId} onChange={(e) => setRecurringId(e.target.value)}>
                  <option value="">—</option>
                  {rulesForAccount.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.concept}
                    </option>
                  ))}
                </Select>
                {(type === 'EXPENSE' || type === 'REFUND') && (
                  <Select label="Tipo de gasto" ayuda="Automático: recurrente = fijo; si no, según la categoría." value={nature} onChange={(e) => setNature(e.target.value as Nature | '')}>
                    <option value="">Automático</option>
                    {(['FIXED', 'VARIABLE', 'EXTRAORDINARY'] as Nature[]).map((n) => (
                      <option key={n} value={n}>
                        {NATURE_LABEL[n]}
                      </option>
                    ))}
                  </Select>
                )}
                <TextArea label="Notas" className="sm:col-span-2" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                {existing && (
                  <p className="t-meta sm:col-span-2">
                    Origen: {existing.source ?? '—'} · Creado {formatDate(existing.createdAt.slice(0, 10))} · Modificado {formatDate(existing.updatedAt.slice(0, 10))}
                  </p>
                )}
              </div>
            )}

            {suggested && !recurringId && (
              <div className="flex flex-wrap items-center justify-between gap-2 r-control bg-accent-soft px-4 py-2">
                <span className="t-label flex items-center gap-2 text-ink">
                  <LinkSimple size={16} className="text-accent-text" aria-hidden />
                  Parece el recurrente «{suggested.concept}».
                </span>
                <Button size="sm" onClick={() => setRecurringId(suggested.id)}>
                  Enlazar
                </Button>
              </div>
            )}
            {intentado && generales.length > 0 && (
              <div role="alert" className="flex flex-col gap-1">
                {generales.map((e) => (
                  <StatusBadge key={e.code} tono="error" className="items-start">
                    {e.message}
                  </StatusBadge>
                ))}
              </div>
            )}
            {warnings.filter((w) => w.code !== 'PENDING_REVIEW').length > 0 && (
              <div className="flex flex-col gap-1">
                {warnings
                  .filter((w) => w.code !== 'PENDING_REVIEW')
                  .map((w) => (
                    <StatusBadge key={w.code} tono="warning" className="items-start">
                      {w.message}
                    </StatusBadge>
                  ))}
              </div>
            )}
          </fieldset>
          {hecho && (
            <p className="t-label mt-4 flex items-center gap-2" role="status">
              <CheckCircle size={16} weight="fill" className="text-success" aria-hidden /> Listo. Se cierra solo.
            </p>
          )}
        </form>
      </Modal>
      {confirmar === 'anular' && id && (
        <ConfirmDialog
          titulo="¿Anular este movimiento?"
          texto="Dejará de contar en saldos y métricas, pero se conserva en el historial."
          confirmar="Anular movimiento"
          onCancelar={() => setConfirmar(null)}
          onConfirmar={() => (setConfirmar(null), setStatusM.mutate([[id], 'CANCELLED']))}
        />
      )}
      {confirmar === 'eliminar' && id && (
        <ConfirmDialog
          titulo="¿Eliminar definitivamente?"
          texto='Se borra del historial (queda en el registro de auditoría). Si solo quieres que no cuente, usa "Anular".'
          confirmar="Eliminar"
          onCancelar={() => setConfirmar(null)}
          onConfirmar={() => (setConfirmar(null), del.mutate([id]))}
        />
      )}
    </>
  )
}

function TransferModal({ transferId, defaults, onClose, onMovement }: { transferId?: string; defaults?: TransferDefaults; onClose: () => void; onMovement: (defaults?: Partial<Transaction>) => void }) {
  const { cat, maps } = useCatalog()
  const legsQ = useApi('finanzas:tx.list', [{ transferId: transferId ?? '__none__', includeCancelled: true }], { enabled: !!transferId })
  const legs = (legsQ.data?.rows ?? []).filter((t) => t.transferId === transferId)
  const accounts = (cat?.accounts ?? []).filter((a) => a.active || legs.some((l) => l.accountId === a.id))
  const [date, setDate] = useState(defaults?.date ?? todayISO())
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
  const [more, setMore] = useState(false)
  const [intentado, setIntentado] = useState(false)
  const [confirmar, setConfirmar] = useState<'eliminar' | null>(null)
  const importeRef = useRef<HTMLInputElement>(null)
  const { hecho, terminar } = useCierreTrasGuardar(onClose)
  const uid = useId()
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
    setMore(!!(out.goalId || out.recurringId || out.notes || out.status !== 'CONFIRMED'))
    setLoaded(true)
  }, [legs, loaded])
  useEffect(() => {
    if (!touchedDesc && toId) setDescription(`Traspaso a ${maps.account.get(toId)?.name ?? ''}`)
  }, [toId, touchedDesc, maps.account])
  const save = useApiMutation('finanzas:tx.saveTransfer', {
    success: transferId ? 'Transferencia actualizada' : 'Transferencia guardada',
    onSuccess: terminar
  })
  const setStatusM = useApiMutation('finanzas:tx.setStatus', { success: 'Estado actualizado', onSuccess: onClose })
  const del = useApiMutation('finanzas:tx.delete', { success: 'Transferencia eliminada', onSuccess: onClose })
  const sameAccount = !!fromId && !!toId && fromId === toId
  const transferRules = (cat?.recurring ?? []).filter((r) => r.kind === 'TRANSFER' && (r.active || r.id === recurringId))
  const errImporte = !amount ? ERROR_IMPORTE : undefined
  const errOrigen = !fromId ? 'Elige la cuenta de origen.' : undefined
  const errDestino = !toId ? 'Elige la cuenta de destino.' : sameAccount ? 'El destino tiene que ser distinto del origen.' : undefined
  const mostrar = (m?: string) => (intentado ? m : undefined)
  const guardar = () => {
    if (errImporte || errOrigen || errDestino) {
      setIntentado(true)
      enfocarPrimerError()
      return
    }
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
  const ocupado = save.isPending || hecho
  return (
    <>
      <Modal
        titulo={transferId ? `Editar transferencia ${transferId}` : 'Nueva transferencia'}
        descripcion={transferId ? undefined : 'Los campos con error se marcan al guardar.'}
        ancho="lg"
        inicial={importeRef}
        onCerrar={onClose}
        pie={
          hecho ? (
            <StatusBadge tono="success">{transferId ? 'Transferencia actualizada' : 'Transferencia guardada'}</StatusBadge>
          ) : (
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
                  <Button variant="danger" onClick={() => setConfirmar('eliminar')}>
                    Eliminar
                  </Button>
                </div>
              )}
              <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
                Cancelar
              </Button>
              <Button variant="accent" type="submit" form="tx-form" cargando={save.isPending} disabled={!loaded || ocupado}>
                Guardar
              </Button>
            </>
          )
        }
      >
        <form
          id="tx-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            guardar()
          }}
        >
          <fieldset disabled={ocupado} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
            <TipoMovimiento
              value="TRANSFER"
              bloquear={transferId ? 'resto' : null}
              onChange={(v) => v !== 'TRANSFER' && !transferId && onMovement({ type: v as TxType, amountCents: amount ?? undefined, accountId: fromId || undefined, description: touchedDesc ? description.trim() || undefined : undefined, date })}
            />
            <p className="t-label flex items-start gap-2">
              <Info size={16} className="mt-px shrink-0" aria-hidden />
              Mover dinero entre tus cuentas no es ingreso ni gasto: se guardan dos apuntes enlazados (sale de una, entra en otra) que siempre cuadran.
            </p>
            <MoneyField ref={importeRef} label="Importe a traspasar" value={amount} onChange={setAmount} tamano="lg" error={mostrar(errImporte)} />
            <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <Select label="Sale de (origen)" value={fromId} onChange={(e) => setFromId(e.target.value)} error={mostrar(errOrigen)}>
                <option value="">Elige…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <ArrowRight size={20} className="mt-10 hidden text-ink-3 sm:block" aria-hidden />
              <Select label="Entra en (destino)" value={toId} onChange={(e) => setToId(e.target.value)} error={mostrar(errDestino)}>
                <option value="">Elige…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <DatePicker label="Fecha" value={date} onChange={setDate} />

            <MasDetalles abierto={more} onAlternar={() => setMore((m) => !m)} id={`${uid}-mas`} />
            {more && (
              <div id={`${uid}-mas`} className="fade-in grid gap-4 r-control bg-raised p-4 sm:grid-cols-2">
                <TextField
                  label="Descripción"
                  className="sm:col-span-2"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    setTouchedDesc(true)
                  }}
                />
                <Select label="Estado" value={status} onChange={(e) => setStatus(e.target.value as TxStatus)}>
                  <option value="CONFIRMED">Confirmado</option>
                  <option value="PENDING_REVIEW">Pendiente de revisar</option>
                </Select>
                <Select label="Objetivo" ayuda="Opcional, para identificarla." value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  <option value="">—</option>
                  {(cat?.goals ?? [])
                    .filter((g) => g.status === 'ACTIVE' || g.id === goalId)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </Select>
                <Select label="Transferencia recurrente" ayuda="Ej.: plan de inversión mensual." value={recurringId} onChange={(e) => setRecurringId(e.target.value)}>
                  <option value="">—</option>
                  {transferRules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.concept}
                    </option>
                  ))}
                </Select>
                <TextArea label="Notas" className="sm:col-span-2" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            )}
            {legs.length > 0 && legs.some((l) => l.status === 'CANCELLED') && <StatusBadge tono="warning">Esta transferencia está anulada.</StatusBadge>}
          </fieldset>
          {hecho && (
            <p className="t-label mt-4 flex items-center gap-2" role="status">
              <CheckCircle size={16} weight="fill" className="text-success" aria-hidden /> Listo. Se cierra solo.
            </p>
          )}
        </form>
      </Modal>
      {confirmar === 'eliminar' && transferId && legs[0] && (
        <ConfirmDialog
          titulo="¿Eliminar la transferencia?"
          texto="Se borran los dos apuntes."
          confirmar="Eliminar"
          onCancelar={() => setConfirmar(null)}
          onConfirmar={() => (setConfirmar(null), del.mutate([legs[0].id]))}
        />
      )}
    </>
  )
}
