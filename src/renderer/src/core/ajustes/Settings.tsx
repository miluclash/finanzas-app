import { Copy, DownloadSimple, FloppyDisk, FolderOpen, PencilSimple, Plus, ShieldCheck, UploadSimple } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatDate } from '@shared/dates'
import { COST_METHOD_LABEL, GROUP_KIND_LABEL, NATURE_LABEL } from '@shared/modules/finanzas/labels'
import { formatEur } from '@shared/money'
import { COST_METHODS, NATURES, type Category, type CategoryGroup, type CostMethod, type GroupKind, type Nature, type Settings } from '@shared/modules/finanzas/types'
import {
  Aviso,
  Button,
  Checkbox,
  ConfirmDialog,
  cx,
  DatePicker,
  ErrorState,
  IconButton,
  LoadingState,
  Modal,
  MoneyField,
  PageHeader,
  SegmentedControl,
  Select,
  StatusBadge,
  Tag,
  TextArea,
  TextField,
  Tooltip
} from '../ui'
import { api, useApi, useApiMutation } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'
import { toast } from '../../lib/toast'
import type { ImportPreview } from '../../../../main/modules/finanzas/importExcel'
import { AjustesEntreno } from '../../modules/entreno/AjustesEntreno'
import { Apariencia } from './Apariencia'

/* ======================= Estructura: navegación interna y secciones ======================= */
const ANCLAS = [
  ['apariencia', 'Apariencia'],
  ['seguimiento', 'Seguimiento y liquidez'],
  ['avisos', 'Avisos'],
  ['inversiones', 'Inversiones'],
  ['categorias', 'Categorías'],
  ['entreno', 'Entreno'],
  ['datos', 'Datos y copias'],
  ['mcp', 'Claude (MCP)'],
  ['registro', 'Registro de cambios']
] as const

function Bloque({ id, titulo, texto, children }: { id: string; titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="card scroll-mt-8">
      <h2 id={`${id}-t`} className="t-section">
        {titulo}
      </h2>
      {texto && <p className="t-label mt-1 max-w-3xl">{texto}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const [activa, setActiva] = useState<string>('apariencia')
  // La sección activa sigue al scroll del contenido
  useEffect(() => {
    const el = document.getElementById('contenido')
    if (!el) return
    const o = new IntersectionObserver(
      (es) => {
        const visible = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiva(visible.target.id)
      },
      { root: el, rootMargin: '0px 0px -60% 0px' }
    )
    ANCLAS.forEach(([id]) => document.getElementById(id) && o.observe(document.getElementById(id)!))
    return () => o.disconnect()
  }, [])
  return (
    <div>
      <PageHeader titulo="Ajustes y datos" texto="Todo lo configurable se cambia desde aquí. Los datos no salen de tu equipo." />
      <div className="settings-layout">
        <nav aria-label="Secciones de ajustes" className="h-fit self-start @4xl:sticky @4xl:top-0">
          <ul className="flex flex-wrap gap-1 @4xl:flex-col">
            {ANCLAS.map(([id, t]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={activa === id ? 'true' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    setActiva(id)
                    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="nav-item nav-item-sub"
                >
                  {t}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-6">
          <div id="apariencia" className="scroll-mt-8">
            <Apariencia />
          </div>
          <GeneralSettings />
          <Bloque id="categorias" titulo="Categorías" texto="Los grupos y categorías con los que clasificas. Puedes cambiarlos cuando quieras.">
            <CategoriesSettings />
          </Bloque>
          <Bloque id="entreno" titulo="Entreno" texto="Grupos musculares, métricas, reglas para decidir el tipo de sesión, importaciones de Hevy y los datos de entreno.">
            <AjustesEntreno />
          </Bloque>
          <Bloque id="datos" titulo="Datos y copias" texto="Importar, exportar, copiar y restaurar son cuatro cosas distintas. Antes de importar, restaurar o actualizar, la app hace una copia sola.">
            <DataSettings />
          </Bloque>
          <Bloque id="mcp" titulo="Conectar con Claude (MCP)" texto="Claude Desktop podrá leer tus datos (solo lectura) y revisar el plan de inversión.">
            <ClaudeMcp />
          </Bloque>
          <Bloque id="registro" titulo="Registro de cambios" texto="Lo último que ha cambiado en tus datos: altas, cambios, borrados, importaciones y restauraciones.">
            <AuditLog />
          </Bloque>
        </div>
      </div>
    </div>
  )
}

/* ======================= General: seguimiento, avisos e inversiones ======================= */
/** Rangos y tipo de cada campo: lo mismo que pide el esquema Zod de main (SettingsInput): entero donde dice int, decimal donde no */
const NUM = {
  emergencyMonths: { min: 0, max: 36, entero: true },
  budgetAlertPct: { min: 1, max: 100, entero: true },
  duplicateWindowDays: { min: 0, max: 30, entero: true },
  verifyStaleDays: { min: 1, max: 365, entero: true },
  concentrationAlertPct: { min: 1, max: 100, entero: false }
} as const
type NumKey = keyof typeof NUM
type Txt = Record<NumKey, string>
/** Con coma decimal, como se escribe en España */
const aTextoNum = (v: number) => String(v).replace('.', ',')
const deTexto = (t: string) => Number(t.trim().replace(',', '.'))
const aTexto = (s: Settings): Txt => ({
  emergencyMonths: aTextoNum(s.emergencyMonths),
  budgetAlertPct: aTextoNum(s.budgetAlertPct),
  duplicateWindowDays: aTextoNum(s.duplicateWindowDays),
  verifyStaleDays: aTextoNum(s.verifyStaleDays),
  concentrationAlertPct: aTextoNum(s.concentrationAlertPct)
})
const errorNum = (k: NumKey, t: string) => {
  const { min, max, entero } = NUM[k]
  const formato = entero ? /^\d+$/ : /^\d+([.,]\d+)?$/
  const v = deTexto(t)
  return formato.test(t.trim()) && v >= min && v <= max ? undefined : `Introduce un número ${entero ? 'entero ' : ''}entre ${min} y ${max}.`
}
/** Lo que se envía al guardar (los mismos campos de siempre) */
const aEnvio = (s: Settings, t: Txt) => ({
  trackingStart: s.trackingStart,
  minLiquidityCents: s.minLiquidityCents,
  emergencyMonths: deTexto(t.emergencyMonths),
  budgetAlertPct: deTexto(t.budgetAlertPct),
  duplicateWindowDays: deTexto(t.duplicateWindowDays),
  verifyStaleDays: deTexto(t.verifyStaleDays),
  concentrationAlertPct: deTexto(t.concentrationAlertPct),
  costMethod: s.costMethod,
  investmentFeeCategoryId: s.investmentFeeCategoryId,
  investmentIncomeCategoryId: s.investmentIncomeCategoryId
})

function GeneralSettings() {
  const { cat } = useCatalog()
  const [s, setS] = useState<Settings | null>(null)
  const [txt, setTxt] = useState<Txt | null>(null)
  const [guardado, setGuardado] = useState(false)
  useEffect(() => {
    if (cat && !s) {
      setS(cat.settings)
      setTxt(aTexto(cat.settings))
    }
  }, [cat, s])
  const save = useApiMutation('finanzas:settings.update', { success: 'Ajustes guardados' })
  if (!s || !cat || !txt)
    return (
      <div className="card">
        <LoadingState filas={3} etiqueta="Cargando los ajustes" />
      </div>
    )
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => (setS({ ...s, [k]: v }), setGuardado(false))
  const setNum = (k: NumKey, v: string) => (setTxt({ ...txt, [k]: v }), setGuardado(false))
  const errores = (Object.keys(NUM) as NumKey[]).filter((k) => errorNum(k, txt[k]))
  const hayError = errores.length > 0
  const sucio = JSON.stringify(aEnvio(s, txt)) !== JSON.stringify(aEnvio(cat.settings, aTexto(cat.settings)))
  const incomeCats = cat.categories.filter((c) => cat.groups.find((g) => g.id === c.groupId)?.kind === 'INCOME')
  const expenseCats = cat.categories.filter((c) => cat.groups.find((g) => g.id === c.groupId)?.kind === 'EXPENSE')
  const num = (k: NumKey, label: string, unidad: string, ayuda: string) => (
    <TextField label={label} unidad={unidad} inputMode={NUM[k].entero ? 'numeric' : 'decimal'} ayuda={ayuda} error={errorNum(k, txt[k])} value={txt[k]} onChange={(e) => setNum(k, e.target.value)} className="[&_input]:tabular-nums [&_input]:text-right" />
  )
  return (
    <>
      <Bloque id="seguimiento" titulo="Seguimiento y liquidez" texto="Desde cuándo cuentas y qué colchón quieres mantener.">
        <div className="auto-grid-wide">
          <TextField label="Moneda base" value="EUR" disabled readOnly ayuda="Por ahora solo euros." />
          <DatePicker label="Inicio del seguimiento" value={s.trackingStart} onChange={(v) => set('trackingStart', v)} ayuda="Fecha desde la que registras movimientos." />
          <MoneyField label="Mínimo de liquidez" value={s.minLiquidityCents} onChange={(v) => set('minLiquidityCents', v ?? 0)} ayuda="Por debajo, el panel y la previsión te avisan." />
          {num('emergencyMonths', 'Colchón de emergencia', 'meses', 'Meses de gastos que quieres tener ahorrados.')}
        </div>
      </Bloque>
      <Bloque id="avisos" titulo="Avisos" texto="Cuándo te avisa el panel.">
        <div className="auto-grid-wide">
          {num('budgetAlertPct', 'Avisar al llegar al presupuesto', '%', 'Entre 1 y 100.')}
          {num('duplicateWindowDays', 'Margen para detectar duplicados', 'días', 'Misma cuenta e importe en ± estos días. Entre 0 y 30.')}
          {num('verifyStaleDays', 'Avisar si una cuenta lleva sin verificar', 'días', 'Entre 1 y 365.')}
          {num('concentrationAlertPct', 'Concentración máxima por acción', '%', 'Para acciones sin peso máximo propio. Entre 1 y 100.')}
        </div>
      </Bloque>
      <Bloque id="inversiones" titulo="Inversiones" texto="Cómo se calculan las ventas y dónde se registran comisiones y dividendos.">
        <div className="auto-grid-wide">
          <Select label="Método de coste en ventas" value={s.costMethod} onChange={(e) => set('costMethod', e.target.value as CostMethod)}>
            {COST_METHODS.map((m) => (
              <option key={m} value={m}>
                {COST_METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
          <Select label="Categoría para comisiones de inversión" ayuda="Las comisiones se registran como gasto." value={s.investmentFeeCategoryId ?? ''} onChange={(e) => set('investmentFeeCategoryId', e.target.value || null)}>
            <option value="">—</option>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Categoría para dividendos e intereses" value={s.investmentIncomeCategoryId ?? ''} onChange={(e) => set('investmentIncomeCategoryId', e.target.value || null)}>
            <option value="">—</option>
            {incomeCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </Bloque>
      {/* Aviso de guardado: sin cambios, con cambios o con errores. Pegado abajo mientras se edita */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 r-card border border-line-strong bg-overlay px-4 py-3" role="region" aria-label="Guardado de ajustes" style={{ boxShadow: 'var(--shadow-raised)' }}>
        <div role="status" aria-live="polite">
          {hayError ? (
            <StatusBadge tono="error">Hay campos con errores: corrígelos para guardar</StatusBadge>
          ) : sucio ? (
            <StatusBadge tono="warning">Tienes cambios sin guardar</StatusBadge>
          ) : guardado ? (
            <StatusBadge tono="success">Cambios guardados</StatusBadge>
          ) : (
            <span className="t-meta">Sin cambios pendientes en seguimiento, avisos e inversiones</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            disabled={!sucio}
            onClick={() => {
              setS(cat.settings)
              setTxt(aTexto(cat.settings))
            }}
          >
            Descartar
          </Button>
          <Button variant="accent" disabled={!sucio || hayError} cargando={save.isPending} icon={<FloppyDisk size={16} />} onClick={() => save.mutate([aEnvio(s, txt)], { onSuccess: () => setGuardado(true) })}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </>
  )
}

/* ======================= Categorías ======================= */
function CategoriesSettings() {
  const { cat } = useCatalog()
  const [group, setGroup] = useState<CategoryGroup | 'new' | null>(null)
  const [category, setCategory] = useState<Category | { groupId: string } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  if (!cat)
    return (
      <LoadingState filas={3} etiqueta="Cargando las categorías" />
    )
  const sel = selected ? cat.categories.find((c) => c.id === selected) : null
  return (
    <div>
      <ul className="divide-line">
        {cat.groups.map((g) => (
          <li key={g.id} className="flex flex-wrap items-start gap-4 py-4 first:pt-0">
            <div className="w-48 shrink-0">
              <div className="t-body font-semibold">{g.name}</div>
              <div className="t-meta">{GROUP_KIND_LABEL[g.kind]}</div>
            </div>
            <ul className="flex min-w-0 flex-1 flex-wrap gap-2" aria-label={`Categorías de ${g.name}`}>
              {cat.categories
                .filter((c) => c.groupId === g.id)
                .map((c) => (
                  <li key={c.id}>
                    <button type="button" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)} className={cx('tag cursor-pointer hover:bg-interactive', selected === c.id && 'border-ink', !c.active && 'text-ink-3 line-through')}>
                      {c.name}
                    </button>
                  </li>
                ))}
            </ul>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" icon={<Plus size={14} weight="bold" />} onClick={() => setCategory({ groupId: g.id })}>
                Categoría
              </Button>
              <Tooltip texto={`Editar el grupo ${g.name}`}>
                <IconButton variant="ghost" size="sm" etiqueta={`Editar el grupo ${g.name}`} icono={<PencilSimple size={16} />} onClick={() => setGroup(g)} />
              </Tooltip>
            </div>
          </li>
        ))}
      </ul>
      <p className="t-meta mt-4">Pulsa una categoría para ver sus subcategorías, editarla o borrarla.</p>
      <Button className="mt-4" size="sm" icon={<Plus size={14} weight="bold" />} onClick={() => setGroup('new')}>
        Nuevo grupo
      </Button>
      {sel && <CategoryDetail category={sel} onEdit={() => setCategory(sel)} onClose={() => setSelected(null)} />}
      {group && <GroupForm group={group === 'new' ? null : group} onClose={() => setGroup(null)} />}
      {category && <CategoryForm category={'id' in category ? category : null} groupId={category.groupId} onClose={() => setCategory(null)} />}
    </div>
  )
}

function CategoryDetail({ category: c, onEdit, onClose }: { category: Category; onEdit: () => void; onClose: () => void }) {
  const { cat } = useCatalog()
  const usage = useApi('finanzas:categories.usage', [c.id])
  const [reassign, setReassign] = useState('')
  const [newSub, setNewSub] = useState('')
  const [fusion, setFusion] = useState<{ from: string; into: string } | null>(null)
  const del = useApiMutation('finanzas:categories.delete', { success: 'Categoría borrada', onSuccess: onClose })
  const addSub = useApiMutation('finanzas:subcategories.save', { success: 'Subcategoría añadida', onSuccess: () => setNewSub('') })
  const delSub = useApiMutation('finanzas:subcategories.delete', { success: 'Subcategoría borrada' })
  const merge = useApiMutation('finanzas:subcategories.merge', { success: (n) => `Fusionadas (${n} movimientos movidos)` })
  const renameSub = useApiMutation('finanzas:subcategories.save', { success: 'Subcategoría renombrada' })
  const subs = (cat?.subcategories ?? []).filter((s) => s.categoryId === c.id)
  const group = cat?.groups.find((g) => g.id === c.groupId)
  const sameKind = (cat?.categories ?? []).filter((x) => x.id !== c.id && cat?.groups.find((g) => g.id === x.groupId)?.kind === group?.kind)
  const used = (usage.data?.transactions ?? 0) + (usage.data?.recurring ?? 0)
  const fromSub = fusion ? subs.find((x) => x.id === fusion.from) : null
  const intoSub = fusion ? subs.find((x) => x.id === fusion.into) : null
  return (
    <>
      <Modal
        titulo={c.name}
        descripcion={`${group?.name} · gasto ${NATURE_LABEL[c.defaultNature].toLowerCase()} por defecto · ${usage.data?.transactions ?? 0} movimientos`}
        ancho="lg"
        onCerrar={onClose}
        pie={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button onClick={onEdit}>Editar categoría</Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="t-card-title mb-2">Subcategorías</h3>
            {subs.length === 0 && <p className="t-label">Sin subcategorías.</p>}
            <ul className="divide-line">
              {subs.map((s) => (
                <li key={s.id} className="flex flex-wrap items-end gap-2 py-2">
                  <TextField
                    label={`Nombre de la subcategoría ${s.name}`}
                    ocultarEtiqueta
                    tamano="sm"
                    defaultValue={s.name}
                    className="min-w-40 flex-1"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== s.name) renameSub.mutate([{ id: s.id, categoryId: s.categoryId, name: v, active: s.active }])
                    }}
                  />
                  <Select
                    label={`Fusionar ${s.name} en otra`}
                    ocultarEtiqueta
                    tamano="sm"
                    className="w-44"
                    value=""
                    onChange={(e) => {
                      const into = e.target.value
                      if (into) setFusion({ from: s.id, into })
                    }}
                  >
                    <option value="">Fusionar en…</option>
                    {subs
                      .filter((x) => x.id !== s.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </Select>
                  <Button size="sm" variant="ghost" aria-label={`Borrar la subcategoría ${s.name}`} onClick={() => delSub.mutate([s.id])}>
                    Borrar
                  </Button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (newSub.trim()) addSub.mutate([{ categoryId: c.id, name: newSub.trim(), active: true }])
              }}
            >
              <TextField label="Nueva subcategoría" tamano="sm" className="flex-1" value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Nombre" />
              <Button size="sm" type="submit">
                Añadir
              </Button>
            </form>
          </div>
          <div className="border-t border-line pt-6">
            <h3 className="t-card-title mb-2">Borrar categoría</h3>
            {used > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="t-label">
                  Se usa en {usage.data?.transactions} movimientos y {usage.data?.recurring} recurrentes. Elige a qué categoría pasan antes de borrarla (o desactívala).
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <Select label="Pasar a" tamano="sm" className="w-56" value={reassign} onChange={(e) => setReassign(e.target.value)}>
                    <option value="">Elige…</option>
                    {sameKind.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" variant="danger" disabled={!reassign} onClick={() => del.mutate([c.id, reassign])}>
                    Pasar y borrar
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="danger" onClick={() => del.mutate([c.id, null])}>
                Borrar
              </Button>
            )}
          </div>
        </div>
      </Modal>
      {fusion && (
        <ConfirmDialog
          titulo="¿Fusionar subcategorías?"
          texto={`«${fromSub?.name}» se unirá a «${intoSub?.name}» y sus movimientos pasarán a esta.`}
          confirmar="Fusionar"
          peligro={false}
          onCancelar={() => setFusion(null)}
          onConfirmar={() => (setFusion(null), merge.mutate([fusion.from, fusion.into]))}
        />
      )}
    </>
  )
}

function GroupForm({ group, onClose }: { group: CategoryGroup | null; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? '')
  const [kind, setKind] = useState<GroupKind>(group?.kind ?? 'EXPENSE')
  const nombreRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:groups.save', { success: 'Grupo guardado', onSuccess: onClose })
  const del = useApiMutation('finanzas:groups.delete', { success: 'Grupo borrado', onSuccess: onClose })
  return (
    <Modal
      titulo={group ? `Editar grupo ${group.name}` : 'Nuevo grupo'}
      ancho="sm"
      inicial={nombreRef}
      onCerrar={onClose}
      pie={
        <>
          {group && (
            <Button variant="danger" className="mr-auto" onClick={() => del.mutate([group.id])}>
              Borrar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" cargando={save.isPending} onClick={() => save.mutate([{ id: group?.id ?? null, name, kind, sortOrder: group?.sortOrder ?? 99 }])}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField ref={nombreRef} label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <span className="field-label">Tipo</span>
          <SegmentedControl
            label="Tipo de grupo"
            value={kind}
            onChange={setKind}
            opciones={[
              { id: 'EXPENSE', texto: 'Gastos' },
              { id: 'INCOME', texto: 'Ingresos' }
            ]}
          />
        </div>
      </div>
    </Modal>
  )
}

function CategoryForm({ category, groupId, onClose }: { category: Category | null; groupId: string; onClose: () => void }) {
  const { cat } = useCatalog()
  const [name, setName] = useState(category?.name ?? '')
  const [gid, setGid] = useState(category?.groupId ?? groupId)
  const [nature, setNature] = useState<Nature>(category?.defaultNature ?? 'VARIABLE')
  const [active, setActive] = useState(category?.active ?? true)
  const [notes, setNotes] = useState(category?.notes ?? '')
  const nombreRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:categories.save', { success: 'Categoría guardada', onSuccess: onClose })
  return (
    <Modal
      titulo={category ? `Editar ${category.name}` : 'Nueva categoría'}
      inicial={nombreRef}
      onCerrar={onClose}
      pie={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" cargando={save.isPending} onClick={() => save.mutate([{ id: category?.id ?? null, name, groupId: gid, defaultNature: nature, active, notes, sortOrder: category?.sortOrder ?? 99 }])}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField ref={nombreRef} label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Grupo" value={gid} onChange={(e) => setGid(e.target.value)}>
          {cat?.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select label="Tipo de gasto por defecto" ayuda="Fijo, variable o extraordinario. Cada movimiento puede cambiarlo." value={nature} onChange={(e) => setNature(e.target.value as Nature)}>
          {NATURES.map((n) => (
            <option key={n} value={n}>
              {NATURE_LABEL[n]}
            </option>
          ))}
        </Select>
        <Checkbox checked={active} onChange={setActive} label="Activa" ayuda="Las inactivas no aparecen al registrar movimientos, pero conservan su historial." />
        <TextArea label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  )
}

/* ======================= Datos y copias ======================= */
const tamano = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${(bytes / 1024).toFixed(0)} KB`)
/** Fechas y horas de las copias y del registro: siempre en hora de Madrid, no en UTC */
const ZONA = 'Europe/Madrid'
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA })
const fechaLocal = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA })
/** Día de calendario (en hora de Madrid) como número de días, para contar «hoy», «ayer» o «hace N días» sin depender de las horas */
const diaCalendario = (d: Date) => {
  const [y, m, dia] = d.toLocaleDateString('en-CA', { timeZone: ZONA }).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, dia) / 86400000)
}
const diasDesde = (iso: string) => diaCalendario(new Date()) - diaCalendario(new Date(iso))
/** «hoy», «ayer» o «hace N días», según el día de calendario de la copia */
const hace = (iso: string) => {
  const d = diasDesde(iso)
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`
}

function Fila({ icono, titulo, texto, children }: { icono?: ReactNode; titulo: string; texto: string; children: ReactNode }) {
  return (
    <div className="cols-label grid gap-4 py-6 first:pt-0 last:pb-0">
      <div>
        <h3 className="t-card-title flex items-center gap-2">
          {icono}
          {titulo}
        </h3>
        <p className="t-meta mt-1">{texto}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function DataSettings() {
  const info = useApi('core:app.info', [])
  const backups = useApi('core:backup.list', [])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [picking, setPicking] = useState(false)
  const [restaurar, setRestaurar] = useState<{ nombre: string; ruta: string | null } | null>(null)
  const create = useApiMutation('core:backup.create', { success: (b) => `Copia creada: ${b.name}` })
  // Tras restaurar, con éxito o con error, se refresca todo: la base activa puede haber cambiado.
  const restore = useApiMutation('core:backup.restore', { success: (r) => (r ? 'Copia restaurada' : null), invalidateOnError: true })
  const exportJson = useApiMutation('finanzas:export.json', { success: (f) => (f ? 'Exportado a JSON' : null) })
  const exportXlsx = useApiMutation('finanzas:export.xlsx', { success: (f) => (f ? 'Exportado a Excel' : null) })
  const exportCsv = useApiMutation('finanzas:export.csv', { success: (f) => (f ? `${f.length} archivos CSV exportados` : null) })
  const ultima = backups.data?.[0]
  const dias = ultima ? diasDesde(ultima.createdAt) : null
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 r-card bg-raised p-4" role="status">
        {ultima ? (
          <>
            <StatusBadge tono={dias !== null && dias > 7 ? 'warning' : 'success'}>
              Última copia: {hace(ultima.createdAt)}, {fechaLocal(ultima.createdAt)} a las {hora(ultima.createdAt)}
            </StatusBadge>
            <span className="t-meta tnum">
              {tamano(ultima.size)} · {ultima.auto ? 'automática' : 'creada a mano o antes de un cambio'}
            </span>
          </>
        ) : backups.isLoading ? (
          <span className="t-meta">Mirando las copias…</span>
        ) : (
          <StatusBadge tono="warning">Aún no hay copias</StatusBadge>
        )}
      </div>

      <div className="divide-line mt-6">
        <Fila icono={<UploadSimple size={20} weight="duotone" aria-hidden />} titulo="Importar" texto="Traer datos de un archivo.">
          <p className="t-label">Importa el Excel FINANCIAL_MASTER. Verás una vista previa con recuentos, avisos y duplicados antes de importar nada.</p>
          <Button
            className="mt-3"
            size="sm"
            cargando={picking}
            onClick={async () => {
              setPicking(true)
              try {
                const p = await api('finanzas:import.pick')
                if (p) setPreview(p)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e))
              } finally {
                setPicking(false)
              }
            }}
          >
            Elegir archivo .xlsx…
          </Button>
        </Fila>

        <Fila icono={<DownloadSimple size={20} weight="duotone" aria-hidden />} titulo="Exportar" texto="Sacar tus datos a un archivo.">
          <p className="t-label">Todo, con sus identificadores y relaciones.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => exportXlsx.mutate([])} cargando={exportXlsx.isPending}>
              Excel (.xlsx)
            </Button>
            <Button size="sm" onClick={() => exportCsv.mutate([])} cargando={exportCsv.isPending}>
              CSV (una tabla por archivo)
            </Button>
            <Button size="sm" onClick={() => exportJson.mutate([])} cargando={exportJson.isPending}>
              JSON completo (restaurable)
            </Button>
          </div>
        </Fila>

        <Fila icono={<ShieldCheck size={20} weight="duotone" aria-hidden />} titulo="Copias de seguridad" texto="Guardar una copia de la base.">
          <p className="t-label">Se hace una copia automática al abrir la app (una al día; se guardan las 30 últimas).</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="accent" icon={<FloppyDisk size={16} />} onClick={() => create.mutate([])} cargando={create.isPending}>
              Crear copia ahora
            </Button>
            <Button size="sm" icon={<FolderOpen size={16} />} onClick={() => api('core:backup.openFolder')}>
              Abrir carpeta de copias
            </Button>
          </div>
          {info.data && (
            <div className="t-meta mt-4">
              <p className="flex items-start gap-2">
                <FolderOpen size={16} aria-hidden className="mt-px shrink-0" />
                <code className="min-w-0 break-all">{info.data.dbPath}</code>
              </p>
              <p className="mt-1">
                Versión {info.data.version} · esquema v{info.data.schemaVersion}. Un único archivo SQLite que solo existe en este PC.
              </p>
              <Button className="mt-2" size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={() => api('core:data.openFolder')}>
                Mostrar en el Explorador
              </Button>
            </div>
          )}
        </Fila>

        <Fila titulo="Restaurar" texto="Volver a una copia anterior.">
          <p className="t-label">Sustituye los datos actuales por los de la copia. Antes se guarda una copia de lo que tienes ahora.</p>
          {backups.data?.length ? (
            <ul className="divide-line mt-3 r-card border border-line" aria-label="Copias disponibles">
              {backups.data.slice(0, 12).map((b) => (
                <li key={b.path} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <span className="t-body tnum min-w-0 flex-1 truncate" title={b.name}>
                    {b.name}
                  </span>
                  {b.auto && <Tag>Automática</Tag>}
                  <span className="t-meta tnum">{tamano(b.size)}</span>
                  <Button size="sm" variant="ghost" aria-label={`Restaurar ${b.name}`} onClick={() => setRestaurar({ nombre: b.name, ruta: b.path })}>
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-meta mt-3">Aún no hay copias.</p>
          )}
          <Button className="mt-3" size="sm" variant="danger" onClick={() => setRestaurar({ nombre: 'un archivo', ruta: null })}>
            Restaurar desde un archivo…
          </Button>
        </Fila>
      </div>

      {preview && <ImportPreviewModal preview={preview} onClose={() => setPreview(null)} />}
      {restaurar && (
        <ConfirmDialog
          titulo={restaurar.ruta ? '¿Restaurar esta copia?' : '¿Restaurar desde un archivo?'}
          texto={
            restaurar.ruta
              ? `Se sustituirán tus datos actuales por los de ${restaurar.nombre}. Antes se guarda una copia del estado actual.`
              : 'Elige una copia .sqlite o una exportación .json. Antes se guarda una copia del estado actual.'
          }
          confirmar={restaurar.ruta ? 'Restaurar copia' : 'Elegir archivo'}
          peligro={!!restaurar.ruta}
          onCancelar={() => setRestaurar(null)}
          onConfirmar={() => (restore.mutate(restaurar.ruta ? [restaurar.ruta] : []), setRestaurar(null))}
        />
      )}
    </div>
  )
}

function ClaudeMcp() {
  const q = useApi('finanzas:mcp.config', [])
  const json = q.data ? JSON.stringify(q.data, null, 2) : ''
  return (
    <div>
      <p className="t-label">Pega esto en claude_desktop_config.json y reinicia Claude.</p>
      <pre className="t-meta tnum mt-3 max-h-60 overflow-auto r-control bg-raised p-4" tabIndex={0} aria-label="Configuración para Claude Desktop">
        {json || 'Cargando…'}
      </pre>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          icon={<Copy size={14} />}
          disabled={!json}
          onClick={async () => {
            await navigator.clipboard.writeText(json)
            toast.success('Configuración copiada')
          }}
        >
          Copiar configuración
        </Button>
      </div>
      <p className="t-meta mt-3">
        En Claude Desktop: Ajustes → Desarrollador → Editar configuración. Si ya tienes otros servidores en «mcpServers», añade solo la entrada «finanzas». Tras actualizar la app, la ruta no cambia.
      </p>
    </div>
  )
}

export function ImportPreviewModal({ preview: p, onClose }: { preview: ImportPreview; onClose: () => void }) {
  const hasData = p.existing.accounts > 0 || p.existing.transactions > 0
  const [confirmReplace, setConfirmReplace] = useState(false)
  const apply = useApiMutation('finanzas:import.apply', {
    success: (r) => `Importados ${r.counts.transactions} movimientos y ${r.counts.accounts} cuentas${r.backup ? ' (copia previa guardada)' : ''}`,
    onSuccess: onClose
  })
  const blocking = p.errors.length > 0
  return (
    <Modal
      titulo={`Vista previa · ${p.fileName}`}
      ancho="xl"
      onCerrar={onClose}
      pie={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" disabled={(hasData && !confirmReplace) || apply.isPending} cargando={apply.isPending} onClick={() => apply.mutate([p.token, hasData])}>
            {hasData ? 'Reemplazar mis datos e importar' : 'Importar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <dl className="grid gap-x-8 sm:grid-cols-2 @lg:grid-cols-4">
          {Object.entries(p.counts).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line py-2">
              <dt className="t-label">{k}</dt>
              <dd className="tnum t-body font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {p.months.from && (
          <p className="t-label">
            Movimientos del {formatDate(p.months.from)} al {formatDate(p.months.to)}. {p.recurringLinked} enlazados a su recurrente
            {p.recurringUnlinked ? `, ${p.recurringUnlinked} marcados como fijos sin regla` : ''}.
          </p>
        )}
        <div>
          <h3 className="t-card-title mb-2">Saldos: app frente a Excel</h3>
          <ul className="divide-line r-card border border-line">
            {p.balanceCheck.map((b) => (
              <li key={b.accountId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                <span className="t-body">{b.name}</span>
                <span className="flex items-center gap-4">
                  <span className="tnum t-body">{formatEur(b.appCents)}</span>
                  {b.ok ? <StatusBadge tono="success">Cuadra</StatusBadge> : <StatusBadge tono="error">Excel: {formatEur(b.excelCents)}</StatusBadge>}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {p.errors.length > 0 && (
          <Aviso tono="error">
            {p.errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </Aviso>
        )}
        {p.skipped.length > 0 && (
          <Aviso tono="warning">
            <div className="font-semibold">Filas que no se pueden convertir ({p.skipped.length}):</div>
            {p.skipped.map((s, i) => (
              <div key={i}>
                {s.sheet} fila {s.row}: {s.reason}
              </div>
            ))}
          </Aviso>
        )}
        {p.warnings.length > 0 && (
          <Aviso tono="info">
            <div className="font-semibold">Avisos ({p.warnings.length})</div>
            {p.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </Aviso>
        )}
        {p.duplicates.length > 0 && (
          <Aviso tono="warning">
            <div className="font-semibold">Posibles duplicados ({p.duplicates.length}). Se importan igual; podrás revisarlos en Movimientos → Por revisar.</div>
            {p.duplicates.map((d) => (
              <div key={d.a + d.b}>
                {d.a} / {d.b}: {d.text}
              </div>
            ))}
          </Aviso>
        )}
        {hasData && (
          <div className="r-control border border-error p-4">
            <Checkbox checked={confirmReplace} onChange={setConfirmReplace} label={`Ya tienes ${p.existing.transactions} movimientos y ${p.existing.accounts} cuentas en la app. Entiendo que se reemplazarán (antes se guarda una copia).`} />
          </div>
        )}
        {blocking && <StatusBadge tono="error">Hay saldos que no cuadran con el Excel: revisa antes de importar.</StatusBadge>}
      </div>
    </Modal>
  )
}

/* ======================= Registro de cambios ======================= */
const ACCION: Record<string, string> = {
  create: 'Alta',
  update: 'Cambio',
  delete: 'Borrado',
  cancel: 'Anulado',
  status: 'Estado',
  merge: 'Fusión',
  import: 'Importación',
  restore: 'Restauración',
  copy: 'Copia',
  not_duplicate: 'No duplicado'
}
function AuditLog() {
  const [entity, setEntity] = useState('')
  const q = useApi('core:audit.list', [300, entity || undefined])
  if (q.isLoading) return <LoadingState filas={3} etiqueta="Cargando el registro" />
  if (q.error || !q.data) return <ErrorState titulo="No se ha podido cargar el registro" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
  return (
    <div className="flex flex-col gap-4">
      <Select label="Qué" className="w-56" value={entity} onChange={(e) => setEntity(e.target.value)}>
        <option value="">Todo</option>
        {['transactions', 'accounts', 'categories', 'subcategories', 'recurring_rules', 'goals', 'goal_allocations', 'budgets', 'investment_ops', 'instruments', 'prices', 'settings', 'import', 'backup'].map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </Select>
      <div className="card card-flush max-h-96 overflow-auto">
        <table className="table" data-density="compact" aria-label="Registro de cambios">
          <thead>
            <tr>
              <th scope="col">Cuándo</th>
              <th scope="col">Qué</th>
              <th scope="col">Registro</th>
              <th scope="col">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="tnum whitespace-nowrap text-ink-2">
                  {fechaLocal(a.ts)} {hora(a.ts)}
                </td>
                <td>
                  <Tag>{ACCION[a.action] ?? a.action}</Tag>
                </td>
                <td className="text-ink-2">
                  {a.entity} {a.entity_id}
                </td>
                <td className="py-2">{a.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
