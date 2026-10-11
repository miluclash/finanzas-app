import { FolderOpen, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDate } from '@shared/dates'
import { COST_METHOD_LABEL, GROUP_KIND_LABEL, NATURE_LABEL } from '@shared/labels'
import { formatEur } from '@shared/money'
import { COST_METHODS, NATURES, type Category, type CategoryGroup, type CostMethod, type GroupKind, type Nature, type Settings } from '@shared/types'
import {
  Badge,
  Button,
  Checkbox,
  confirmDialog,
  cx,
  DateInput,
  ErrorBox,
  Field,
  Loading,
  Modal,
  MoneyInput,
  Notice,
  PageHeader,
  Section,
  Segmented,
  Select,
  Tabs,
  TextArea,
  TextInput
} from '../components/ui'
import { api, useApi, useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'
import { toast } from '../lib/toast'
import type { ImportPreview } from '../../../main/services/importExcel'

type Tab = 'general' | 'categorias' | 'datos' | 'auditoria'

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('general')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ajustes y datos" description="Reglas, categorías, importación, exportación y copias de seguridad. Todo editable." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'categorias', label: 'Categorías' },
          { id: 'datos', label: 'Importar, exportar y copias' },
          { id: 'auditoria', label: 'Registro de cambios' }
        ]}
      />
      {tab === 'general' && <GeneralSettings />}
      {tab === 'categorias' && <CategoriesSettings />}
      {tab === 'datos' && <DataSettings />}
      {tab === 'auditoria' && <AuditLog />}
    </div>
  )
}

function GeneralSettings() {
  const { cat } = useCatalog()
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => {
    if (cat && !s) setS(cat.settings)
  }, [cat, s])
  const save = useApiMutation('settings.update', { success: 'Ajustes guardados' })
  if (!s || !cat) return <Loading />
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v })
  const incomeCats = cat.categories.filter((c) => cat.groups.find((g) => g.id === c.groupId)?.kind === 'INCOME')
  const expenseCats = cat.categories.filter((c) => cat.groups.find((g) => g.id === c.groupId)?.kind === 'EXPENSE')
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <Section title="Seguimiento y liquidez" boxed>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Moneda base">
            <TextInput value="EUR" disabled />
          </Field>
          <Field label="Inicio del seguimiento" hint="Fecha desde la que registras movimientos">
            <DateInput value={s.trackingStart} onChange={(v) => set('trackingStart', v)} />
          </Field>
          <Field label="Mínimo de liquidez" hint="Por debajo, el panel y la previsión avisan">
            <MoneyInput value={s.minLiquidityCents} onChange={(v) => set('minLiquidityCents', v ?? 0)} />
          </Field>
          <Field label="Meses de gastos para el colchón" hint="Referencia para el fondo de emergencia">
            <TextInput type="number" min={0} max={36} value={s.emergencyMonths} onChange={(e) => set('emergencyMonths', Number(e.target.value))} />
          </Field>
        </div>
      </Section>
      <Section title="Avisos" boxed>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Aviso de presupuesto al llegar al (%)">
            <TextInput type="number" min={1} max={100} value={s.budgetAlertPct} onChange={(e) => set('budgetAlertPct', Number(e.target.value))} />
          </Field>
          <Field label="Días de margen para detectar duplicados" hint="Misma cuenta e importe en ± estos días">
            <TextInput type="number" min={0} max={30} value={s.duplicateWindowDays} onChange={(e) => set('duplicateWindowDays', Number(e.target.value))} />
          </Field>
          <Field label="Avisar si una cuenta lleva sin verificar (días)">
            <TextInput type="number" min={1} max={365} value={s.verifyStaleDays} onChange={(e) => set('verifyStaleDays', Number(e.target.value))} />
          </Field>
          <Field label="Concentración máxima por acción (%)" hint="Para acciones sin peso máximo propio">
            <TextInput type="number" min={1} max={100} value={s.concentrationAlertPct} onChange={(e) => set('concentrationAlertPct', Number(e.target.value))} />
          </Field>
        </div>
      </Section>
      <Section title="Inversiones" boxed>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Método de coste en ventas">
            <Select value={s.costMethod} onChange={(e) => set('costMethod', e.target.value as CostMethod)}>
              {COST_METHODS.map((m) => (
                <option key={m} value={m}>
                  {COST_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <div />
          <Field label="Categoría para comisiones de inversión" hint="Las comisiones se registran como gasto">
            <Select value={s.investmentFeeCategoryId ?? ''} onChange={(e) => set('investmentFeeCategoryId', e.target.value || null)}>
              <option value="">—</option>
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoría para dividendos e intereses">
            <Select value={s.investmentIncomeCategoryId ?? ''} onChange={(e) => set('investmentIncomeCategoryId', e.target.value || null)}>
              <option value="">—</option>
              {incomeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>
      <Section title="Apariencia" boxed>
        <Segmented
          value={s.theme}
          onChange={(v) => {
            set('theme', v)
            save.mutate([{ theme: v }])
          }}
          options={[
            { value: 'system', label: 'Como Windows' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' }
          ]}
        />
      </Section>
      <div>
        <Button
          variant="primary"
          loading={save.isPending}
          onClick={() =>
            save.mutate([
              {
                trackingStart: s.trackingStart,
                minLiquidityCents: s.minLiquidityCents,
                emergencyMonths: s.emergencyMonths,
                budgetAlertPct: s.budgetAlertPct,
                duplicateWindowDays: s.duplicateWindowDays,
                verifyStaleDays: s.verifyStaleDays,
                concentrationAlertPct: s.concentrationAlertPct,
                costMethod: s.costMethod,
                investmentFeeCategoryId: s.investmentFeeCategoryId,
                investmentIncomeCategoryId: s.investmentIncomeCategoryId
              }
            ])
          }
        >
          Guardar ajustes
        </Button>
      </div>
    </div>
  )
}

function CategoriesSettings() {
  const { cat } = useCatalog()
  const [group, setGroup] = useState<CategoryGroup | 'new' | null>(null)
  const [category, setCategory] = useState<Category | { groupId: string } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  if (!cat) return <Loading />
  const sel = selected ? cat.categories.find((c) => c.id === selected) : null
  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between">
          <p className="text-[13px] text-muted">Grupos y categorías. Pulsa una categoría para ver sus subcategorías.</p>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setGroup('new')}>
            Nuevo grupo
          </Button>
        </div>
        {cat.groups.map((g) => (
          <section key={g.id} className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{g.name}</span>
                <Badge tone={g.kind === 'INCOME' ? 'pos' : 'neutral'}>{GROUP_KIND_LABEL[g.kind]}</Badge>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setGroup(g)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setCategory({ groupId: g.id })}>
                  Categoría
                </Button>
              </div>
            </div>
            <ul className="flex flex-wrap gap-1.5 p-3">
              {cat.categories
                .filter((c) => c.groupId === g.id)
                .map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      className={cx(
                        'rounded-md border px-2.5 py-1 text-[13px]',
                        selected === c.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
                        !c.active && 'text-muted line-through'
                      )}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      <div>{sel ? <CategoryDetail category={sel} onEdit={() => setCategory(sel)} onDeleted={() => setSelected(null)} /> : <p className="text-[13px] text-muted">Elige una categoría.</p>}</div>
      {group && <GroupForm group={group === 'new' ? null : group} onClose={() => setGroup(null)} />}
      {category && <CategoryForm category={'id' in category ? category : null} groupId={category.groupId} onClose={() => setCategory(null)} />}
    </div>
  )
}

function CategoryDetail({ category: c, onEdit, onDeleted }: { category: Category; onEdit: () => void; onDeleted: () => void }) {
  const { cat } = useCatalog()
  const usage = useApi('categories.usage', [c.id])
  const [reassign, setReassign] = useState('')
  const [newSub, setNewSub] = useState('')
  const del = useApiMutation('categories.delete', { success: 'Categoría borrada', onSuccess: onDeleted })
  const addSub = useApiMutation('subcategories.save', { success: 'Subcategoría añadida', onSuccess: () => setNewSub('') })
  const delSub = useApiMutation('subcategories.delete', { success: 'Subcategoría borrada' })
  const merge = useApiMutation('subcategories.merge', { success: (n) => `Fusionadas (${n} movimientos movidos)` })
  const renameSub = useApiMutation('subcategories.save', { success: 'Subcategoría renombrada' })
  const subs = (cat?.subcategories ?? []).filter((s) => s.categoryId === c.id)
  const group = cat?.groups.find((g) => g.id === c.groupId)
  const sameKind = (cat?.categories ?? []).filter((x) => x.id !== c.id && cat?.groups.find((g) => g.id === x.groupId)?.kind === group?.kind)
  const used = (usage.data?.transactions ?? 0) + (usage.data?.recurring ?? 0)
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[16px] font-semibold">{c.name}</h2>
          <p className="text-[12px] text-muted">
            {group?.name} · gasto {NATURE_LABEL[c.defaultNature].toLowerCase()} por defecto · {usage.data?.transactions ?? 0} movimientos
          </p>
        </div>
        <Button size="sm" onClick={onEdit}>
          Editar
        </Button>
      </div>
      <div>
        <h3 className="mb-1.5 text-[13px] font-medium">Subcategorías</h3>
        {subs.length === 0 && <p className="text-[13px] text-muted">Sin subcategorías.</p>}
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {subs.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
              <TextInput
                defaultValue={s.name}
                className="h-8"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== s.name) renameSub.mutate([{ id: s.id, categoryId: s.categoryId, name: v, active: s.active }])
                }}
              />
              <Select
                className="h-8 w-40"
                value=""
                onChange={async (e) => {
                  const into = e.target.value
                  if (!into) return
                  const target = subs.find((x) => x.id === into)
                  if (await confirmDialog({ title: 'Fusionar subcategorías', text: `"${s.name}" se unirá a "${target?.name}" y sus movimientos pasarán a esta.`, confirm: 'Fusionar' }))
                    merge.mutate([s.id, into])
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
              <Button size="sm" variant="ghost" onClick={() => delSub.mutate([s.id])}>
                Borrar
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (newSub.trim()) addSub.mutate([{ categoryId: c.id, name: newSub.trim(), active: true }])
          }}
        >
          <TextInput value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Nueva subcategoría" className="h-8" />
          <Button size="sm" type="submit">
            Añadir
          </Button>
        </form>
      </div>
      <div className="border-t border-line pt-3">
        <h3 className="mb-1.5 text-[13px] font-medium">Borrar categoría</h3>
        {used > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] text-muted">
              Se usa en {usage.data?.transactions} movimientos y {usage.data?.recurring} recurrentes. Elige a qué categoría pasan antes de borrarla (o desactívala).
            </p>
            <div className="flex gap-2">
              <Select className="h-8" value={reassign} onChange={(e) => setReassign(e.target.value)}>
                <option value="">Pasar a…</option>
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
    </section>
  )
}

function GroupForm({ group, onClose }: { group: CategoryGroup | null; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? '')
  const [kind, setKind] = useState<GroupKind>(group?.kind ?? 'EXPENSE')
  const save = useApiMutation('groups.save', { success: 'Grupo guardado', onSuccess: onClose })
  const del = useApiMutation('groups.delete', { success: 'Grupo borrado', onSuccess: onClose })
  return (
    <Modal
      open
      onClose={onClose}
      width={440}
      title={group ? `Editar grupo ${group.name}` : 'Nuevo grupo'}
      footer={
        <>
          {group && (
            <Button variant="ghost" className="mr-auto text-neg" onClick={() => del.mutate([group.id])}>
              Borrar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => save.mutate([{ id: group?.id ?? null, name, kind, sortOrder: group?.sortOrder ?? 99 }])}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Nombre" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Tipo">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'EXPENSE', label: 'Gastos' },
              { value: 'INCOME', label: 'Ingresos' }
            ]}
          />
        </Field>
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
  const save = useApiMutation('categories.save', { success: 'Categoría guardada', onSuccess: onClose })
  return (
    <Modal
      open
      onClose={onClose}
      width={480}
      title={category ? `Editar ${category.name}` : 'Nueva categoría'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => save.mutate([{ id: category?.id ?? null, name, groupId: gid, defaultNature: nature, active, notes, sortOrder: category?.sortOrder ?? 99 }])}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Nombre" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Grupo">
          <Select value={gid} onChange={(e) => setGid(e.target.value)}>
            {cat?.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo de gasto por defecto" hint="Fijo, variable o extraordinario. Cada movimiento puede cambiarlo.">
          <Select value={nature} onChange={(e) => setNature(e.target.value as Nature)}>
            {NATURES.map((n) => (
              <option key={n} value={n}>
                {NATURE_LABEL[n]}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox checked={active} onChange={setActive} label="Activa" hint="Las inactivas no aparecen al registrar movimientos, pero conservan su historial." />
        <Field label="Notas">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function DataSettings() {
  const info = useApi('app.info', [])
  const backups = useApi('backup.list', [])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [picking, setPicking] = useState(false)
  const create = useApiMutation('backup.create', { success: (b) => `Copia creada: ${b.name}` })
  const restore = useApiMutation('backup.restore', { success: (r) => (r ? 'Copia restaurada' : null) })
  const exportJson = useApiMutation('export.json', { success: (f) => (f ? 'Exportado a JSON' : null) })
  const exportXlsx = useApiMutation('export.xlsx', { success: (f) => (f ? 'Exportado a Excel' : null) })
  const exportCsv = useApiMutation('export.csv', { success: (f) => (f ? `${f.length} archivos CSV exportados` : null) })
  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <Section title="Importar el Excel FINANCIAL_MASTER" description="Verás una vista previa con recuentos, avisos y duplicados antes de importar nada." boxed>
        <Button
          loading={picking}
          onClick={async () => {
            setPicking(true)
            try {
              const p = await api('import.pick')
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
      </Section>
      <Section title="Exportar" description="Todo, con sus identificadores y relaciones." boxed>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exportXlsx.mutate([])} loading={exportXlsx.isPending}>
            Excel (.xlsx)
          </Button>
          <Button onClick={() => exportCsv.mutate([])} loading={exportCsv.isPending}>
            CSV (una tabla por archivo)
          </Button>
          <Button onClick={() => exportJson.mutate([])} loading={exportJson.isPending}>
            JSON completo (restaurable)
          </Button>
        </div>
      </Section>
      <Section
        title="Copias de seguridad"
        description="Se hace una copia automática al abrir la app (una al día; se guardan las 30 últimas). Restaurar guarda antes una copia del estado actual."
        boxed
        actions={
          <>
            <Button size="sm" icon={<FolderOpen className="size-3.5" />} onClick={() => api('backup.openFolder')}>
              Abrir carpeta
            </Button>
            <Button size="sm" onClick={() => create.mutate([])} loading={create.isPending}>
              Crear copia ahora
            </Button>
          </>
        }
      >
        {backups.data?.length ? (
          <ul className="divide-y divide-line rounded-md border border-line text-[13px]">
            {backups.data.slice(0, 12).map((b) => (
              <li key={b.path} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="truncate">{b.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-muted">{(b.size / 1024).toFixed(0)} KB</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (await confirmDialog({ title: 'Restaurar copia', text: `Se sustituirán tus datos actuales por los de ${b.name}. Antes se guarda una copia del estado actual.`, confirm: 'Restaurar', danger: true }))
                        restore.mutate([b.path])
                    }}
                  >
                    Restaurar
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">Aún no hay copias.</p>
        )}
        <div className="mt-3">
          <Button
            size="sm"
            onClick={async () => {
              if (await confirmDialog({ title: 'Restaurar desde archivo', text: 'Elige una copia .sqlite o una exportación .json. Antes se guarda una copia del estado actual.', confirm: 'Elegir archivo' }))
                restore.mutate([])
            }}
          >
            Restaurar desde un archivo…
          </Button>
        </div>
      </Section>
      {info.data && (
        <Section title="Dónde están tus datos" boxed>
          <p className="break-all text-[13px] text-ink-2">{info.data.dbPath}</p>
          <p className="mt-1 text-[12px] text-muted">
            Versión {info.data.version} · esquema v{info.data.schemaVersion}. Un único archivo SQLite que solo existe en este PC.
          </p>
          <Button size="sm" className="mt-2" icon={<FolderOpen className="size-3.5" />} onClick={() => api('data.openFolder')}>
            Mostrar en el Explorador
          </Button>
        </Section>
      )}
      {preview && <ImportPreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

export function ImportPreviewModal({ preview: p, onClose }: { preview: ImportPreview; onClose: () => void }) {
  const hasData = p.existing.accounts > 0 || p.existing.transactions > 0
  const [confirmReplace, setConfirmReplace] = useState(false)
  const apply = useApiMutation('import.apply', {
    success: (r) => `Importados ${r.counts.transactions} movimientos y ${r.counts.accounts} cuentas${r.backup ? ' (copia previa guardada)' : ''}`,
    onSuccess: onClose
  })
  const blocking = p.errors.length > 0
  return (
    <Modal
      open
      onClose={onClose}
      width={760}
      title={`Vista previa · ${p.fileName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={(hasData && !confirmReplace) || apply.isPending} loading={apply.isPending} onClick={() => apply.mutate([p.token, hasData])}>
            {hasData ? 'Reemplazar mis datos e importar' : 'Importar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-[13px]">
        <div className="grid grid-cols-4 gap-x-6 gap-y-1">
          {Object.entries(p.counts).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-line py-1">
              <span className="text-muted">{k}</span>
              <span className="num font-medium">{v}</span>
            </div>
          ))}
        </div>
        {p.months.from && (
          <p className="text-muted">
            Movimientos del {formatDate(p.months.from)} al {formatDate(p.months.to)}. {p.recurringLinked} enlazados a su recurrente
            {p.recurringUnlinked ? `, ${p.recurringUnlinked} marcados como fijos sin regla` : ''}.
          </p>
        )}
        <div>
          <h3 className="mb-1 font-medium">Saldos: app frente a Excel</h3>
          <ul className="divide-y divide-line rounded-md border border-line">
            {p.balanceCheck.map((b) => (
              <li key={b.accountId} className="flex justify-between px-3 py-1.5">
                <span>{b.name}</span>
                <span className="flex gap-4">
                  <span className="num">{formatEur(b.appCents)}</span>
                  <span className={b.ok ? 'text-pos' : 'text-neg'}>{b.ok ? 'cuadra' : `Excel: ${formatEur(b.excelCents)}`}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {p.errors.length > 0 && (
          <Notice tone="neg">
            {p.errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </Notice>
        )}
        {p.skipped.length > 0 && (
          <Notice tone="warn">
            <div className="font-medium">Filas que no se pueden convertir ({p.skipped.length}):</div>
            {p.skipped.map((s, i) => (
              <div key={i}>
                {s.sheet} fila {s.row}: {s.reason}
              </div>
            ))}
          </Notice>
        )}
        {p.warnings.length > 0 && (
          <Notice tone="info">
            <div className="font-medium">Avisos ({p.warnings.length})</div>
            {p.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </Notice>
        )}
        {p.duplicates.length > 0 && (
          <Notice tone="warn">
            <div className="font-medium">Posibles duplicados ({p.duplicates.length}). Se importan igual; podrás revisarlos en Movimientos → Por revisar.</div>
            {p.duplicates.map((d) => (
              <div key={d.a + d.b}>
                {d.a} / {d.b}: {d.text}
              </div>
            ))}
          </Notice>
        )}
        {hasData && (
          <div className="rounded-md border border-neg/40 p-3">
            <Checkbox
              checked={confirmReplace}
              onChange={setConfirmReplace}
              label={`Ya tienes ${p.existing.transactions} movimientos y ${p.existing.accounts} cuentas en la app. Entiendo que se reemplazarán (antes se guarda una copia).`}
            />
          </div>
        )}
        {blocking && <p className="text-neg">Hay saldos que no cuadran con el Excel: revisa antes de importar.</p>}
      </div>
    </Modal>
  )
}

function AuditLog() {
  const [entity, setEntity] = useState('')
  const q = useApi('audit.list', [300, entity || undefined])
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const label: Record<string, string> = {
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
  return (
    <div className="flex flex-col gap-3">
      <Select className="w-56" value={entity} onChange={(e) => setEntity(e.target.value)}>
        <option value="">Todo</option>
        {['transactions', 'accounts', 'categories', 'subcategories', 'recurring_rules', 'goals', 'goal_allocations', 'budgets', 'investment_ops', 'instruments', 'prices', 'settings', 'import', 'backup'].map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </Select>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-ink-2">
              <th className="px-3 py-2 font-medium">Cuándo</th>
              <th className="px-3 py-2 font-medium">Qué</th>
              <th className="px-3 py-2 font-medium">Registro</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {q.data!.map((a) => (
              <tr key={a.id} className="border-b border-line align-top last:border-0">
                <td className="num whitespace-nowrap px-3 py-1.5 text-muted">
                  {formatDate(a.ts.slice(0, 10))} {new Date(a.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-3 py-1.5">
                  <Badge>{label[a.action] ?? a.action}</Badge>
                </td>
                <td className="px-3 py-1.5 text-ink-2">
                  {a.entity} {a.entity_id}
                </td>
                <td className="px-3 py-1.5">{a.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
