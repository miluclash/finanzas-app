// Constructor de gráficos: combina métricas registradas por los módulos (nunca código ni fórmulas
// escritas por el usuario). Vista previa en vivo con `core:charts.data(spec)` sin guardar; al
// guardar, `core:charts.save` valida de nuevo y su mensaje se muestra tal cual.
//
// Reglas a la vista: elegida la primera serie, las demás métricas se filtran a su unidad y las que
// no encajan salen desactivadas con la razón; las agrupaciones, la división y los tipos que no
// cumplen las reglas también salen desactivados, con su explicación.
import { Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CHART_MAX_SERIES,
  TIME_GROUPINGS,
  type ChartRange,
  type ChartSeries,
  type ChartSpec,
  type ChartType,
  type DimensionGrouping,
  type Grouping,
  type MetricFilterKey,
  type MetricFilters,
  type MetricMeta,
  type MetricOptionKind,
  type SavedChart
} from '@shared/core/metrics-types'
import { GROUPING_LABELS, UNIT_LABELS } from '@shared/core/charts/labels'
import { ChartSpecV1Schema } from '@shared/core/charts/schema'
import { FILTER_LABELS, admitsGrouping, chartGroupings, incompatibilityReason, upgradeSpec, validateSpec } from '@shared/core/charts/validate'
import { useApi, useApiMutation } from '../../lib/api'
import { Aviso, Button, Checkbox, DatePicker, ErrorState, IconButton, LoadingState, Modal, SegmentedControl, Select, TextField, cx } from '../ui'
import { GraficoVista } from './GraficoVista'

const NOMBRE_MODULO: Record<string, string> = { finanzas: 'Finanzas', entreno: 'Entreno' }
const nombreModulo = (m: string) => NOMBRE_MODULO[m] ?? m.charAt(0).toUpperCase() + m.slice(1)
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const TIPOS: { id: ChartType; texto: string }[] = [
  { id: 'line', texto: 'Línea' },
  { id: 'bar', texto: 'Barras' },
  { id: 'area', texto: 'Área' },
  { id: 'stacked', texto: 'Apiladas' },
  { id: 'scatter', texto: 'Dispersión' },
  { id: 'table', texto: 'Tabla' }
]

/** Qué lista de opciones rellena cada filtro. */
const OPCIONES_FILTRO: Record<MetricFilterKey, MetricOptionKind> = {
  exerciseId: 'exercise',
  groupId: 'muscleGroup',
  kind: 'kind',
  accountId: 'account',
  categoryId: 'category',
  categoryGroup: 'categoryGroup'
}

const RANGO_UNIDADES = [
  { id: 'day', uno: 'día', varios: 'días' },
  { id: 'week', uno: 'semana', varios: 'semanas' },
  { id: 'month', uno: 'mes', varios: 'meses' },
  { id: 'year', uno: 'año', varios: 'años' }
] as const

/** Retrasa un valor (la vista previa no se recalcula con cada tecla). */
function useRetrasado<T>(v: T, ms = 300): T {
  const [r, setR] = useState(v)
  useEffect(() => {
    const t = window.setTimeout(() => setR(v), ms)
    return () => window.clearTimeout(t)
  }, [v, ms])
  return r
}

/** Especificación inicial para un gráfico nuevo (primera métrica del módulo, si se indica). */
function nuevaSpec(metas: readonly MetricMeta[], modulo?: string): ChartSpec {
  const m = metas.find((x) => x.module === modulo) ?? metas[0]
  const g: Grouping = m ? (TIME_GROUPINGS.find((t) => admitsGrouping(m, t) && t !== 'day') ?? chartGroupings(m)[0]) : 'month'
  const range: ChartRange = g === 'week' ? { kind: 'last', unit: 'week', count: 12 } : g === 'year' ? { kind: 'last', unit: 'year', count: 3 } : g === 'day' ? { kind: 'last', unit: 'day', count: 30 } : { kind: 'last', unit: 'month', count: 6 }
  return { version: 1, type: 'line', series: [{ metricId: m?.id ?? '' }], groupBy: g, range }
}

/** Ajusta la especificación tras cambiar la primera serie: lo que deja de valer se quita o se cambia. */
function ajustar(spec: ChartSpec, metas: readonly MetricMeta[]): ChartSpec {
  const byId = new Map(metas.map((m) => [m.id, m]))
  const m0 = byId.get(spec.series[0]?.metricId ?? '')
  if (!m0) return spec
  let s: ChartSpec = { ...spec }
  if (!admitsGrouping(m0, s.groupBy)) s.groupBy = TIME_GROUPINGS.find((t) => admitsGrouping(m0, t)) ?? chartGroupings(m0)[0]
  if (s.splitBy && (!m0.splits.includes(s.splitBy) || s.series.length > 1 || s.splitBy === s.groupBy)) s = { ...s, splitBy: undefined }
  if (s.type === 'stacked' && m0.aggregation !== 'sum') s.type = 'bar'
  s.series = s.series.map((x) => {
    const m = byId.get(x.metricId)
    if (!m || !x.filters) return x
    const filters = Object.fromEntries(Object.entries(x.filters).filter(([k]) => m.filters.includes(k as MetricFilterKey))) as MetricFilters
    return { ...x, filters: Object.keys(filters).length ? filters : undefined }
  })
  return s
}

/** Quita claves vacías antes de enviar (Zod rechaza campos que no existen, no los vacíos). */
function limpia(spec: ChartSpec): ChartSpec {
  const out: ChartSpec = { ...spec, series: spec.series.map((s) => ({ metricId: s.metricId, ...(s.filters && Object.keys(s.filters).length ? { filters: s.filters } : {}), ...(s.label?.trim() ? { label: s.label.trim() } : {}) })) }
  if (!out.splitBy) delete out.splitBy
  if (!out.comparePrevious) delete out.comparePrevious
  if (out.target === null || out.target === undefined) delete out.target
  return out
}

export interface ConstructorGraficoProps {
  /** Gráfico que se edita (si no, uno nuevo). */
  chartId?: number
  /** Módulo con el que empezar (primera métrica de ese módulo). */
  modulo?: string
  onGuardado: (c: SavedChart) => void
  onCerrar: () => void
}

/** Constructor en un modal. Carga las métricas (y el gráfico si se edita) y abre el formulario. */
export function ConstructorGrafico({ chartId, modulo, onGuardado, onCerrar }: ConstructorGraficoProps) {
  const metas = useApi('core:metrics.list', [])
  const guardado = useApi('core:charts.get', [chartId ?? 0], { enabled: chartId != null })
  const titulo = chartId != null ? 'Editar gráfico' : 'Nuevo gráfico'
  const listo = metas.data && (chartId == null || guardado.data !== undefined)
  return (
    <Modal titulo={titulo} descripcion="Combina métricas de la app. La vista previa se actualiza al momento." onCerrar={onCerrar} ancho="xl">
      {(metas.isError || guardado.isError) && <ErrorState titulo="No se han podido cargar las métricas" texto={(metas.error ?? guardado.error)!.message} accion={<Button size="sm" onClick={() => (metas.refetch(), guardado.refetch())}>Reintentar</Button>} />}
      {!listo && !metas.isError && !guardado.isError && <LoadingState etiqueta="Cargando las métricas" />}
      {listo && <Formulario metas={metas.data!} chartId={chartId} guardado={guardado.data ?? null} modulo={modulo} onGuardado={onGuardado} onCerrar={onCerrar} />}
    </Modal>
  )
}

type Guardado = { id: number; title: string; spec: unknown } | null

function Formulario({ metas, chartId, guardado, modulo, onGuardado, onCerrar }: { metas: MetricMeta[]; chartId?: number; guardado: Guardado; modulo?: string; onGuardado: (c: SavedChart) => void; onCerrar: () => void }) {
  // Al editar: la especificación guardada si al menos tiene la forma de la versión 1.
  const inicial = useMemo(() => {
    if (!guardado) return { spec: nuevaSpec(metas, modulo), aviso: null as string | null }
    const up = upgradeSpec(guardado.spec)
    const r = up.ok ? ChartSpecV1Schema.safeParse(up.spec) : null
    if (r?.success) return { spec: r.data, aviso: null }
    return { spec: nuevaSpec(metas, modulo), aviso: 'La configuración guardada de este gráfico no se podía leer. Empieza de nuevo y guárdalo.' }
  }, [guardado, metas, modulo])
  const [spec, setSpec] = useState<ChartSpec>(inicial.spec)
  const [title, setTitle] = useState(guardado?.title ?? '')
  const [objetivoTexto, setObjetivoTexto] = useState(() => (inicial.spec.target == null ? '' : objetivoAEntrada(inicial.spec.target, metas.find((m) => m.id === inicial.spec.series[0]?.metricId)?.unit)))
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const tituloRef = useRef<HTMLInputElement>(null)

  const byId = useMemo(() => new Map(metas.map((m) => [m.id, m])), [metas])
  const m0 = byId.get(spec.series[0]?.metricId ?? '')
  const unidad = m0?.unit
  const enviar = useMemo(() => limpia(spec), [spec])
  const previa = useRetrasado(enviar)
  const avisos = useMemo(() => validateSpec(enviar, metas), [enviar, metas])
  const guardar = useApiMutation('core:charts.save', {
    success: chartId != null ? 'Gráfico guardado' : 'Gráfico creado',
    silentError: true,
    onSuccess: (c) => onGuardado(c)
  })

  const cambiar = (s: ChartSpec) => setSpec(ajustar(s, metas))
  const cambiarSerie = (i: number, x: Partial<ChartSeries>) => cambiar({ ...spec, series: spec.series.map((s, j) => (j === i ? { ...s, ...x } : s)) })
  const porModulo = useMemo(() => {
    const g = new Map<string, MetricMeta[]>()
    for (const m of metas) g.set(m.module, [...(g.get(m.module) ?? []), m])
    return [...g.entries()]
  }, [metas])

  // Agrupaciones: las de la primera métrica; desactivadas las que alguna serie no admite.
  const agrupaciones = m0 ? chartGroupings(m0) : []
  const razonAgrupacion = (g: Grouping) => {
    const mala = spec.series.map((s) => byId.get(s.metricId)).find((m) => m && !admitsGrouping(m, g))
    return mala ? `«${mala.name}» no se agrupa por ${GROUPING_LABELS[g]}` : null
  }
  const divisiones = (m0?.splits ?? []).filter((d) => d !== spec.groupBy)
  const todasSuman = spec.series.every((s) => byId.get(s.metricId)?.aggregation === 'sum')
  const tipoDesactivado = (t: ChartType): string | null =>
    t === 'stacked' && !todasSuman ? 'Las barras apiladas solo valen para métricas que se suman.' : t === 'scatter' && spec.series.length !== 2 ? 'La dispersión necesita exactamente dos series.' : null

  const onObjetivo = (txt: string) => {
    setObjetivoTexto(txt)
    const v = entradaAObjetivo(txt, unidad)
    setSpec((s) => ({ ...s, target: v }))
  }
  const enviarGuardar = () => {
    setErrorGuardar(null)
    if (!title.trim()) {
      setErrorGuardar('Ponle un título al gráfico.')
      tituloRef.current?.focus()
      return
    }
    guardar.mutate([{ ...(chartId != null ? { id: chartId } : {}), title, spec: enviar }], { onError: (e) => setErrorGuardar(e.message) })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        enviarGuardar()
      }}
    >
      {inicial.aviso && (
        <Aviso tono="warning" className="mb-4">
          {inicial.aviso}
        </Aviso>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <TextField ref={tituloRef} label="Título" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Por ejemplo, e1RM de press banca" />

          <fieldset className="flex flex-col gap-4">
            <legend className="t-label mb-2 font-semibold text-ink">Series</legend>
            {spec.series.map((s, i) => {
              const m = byId.get(s.metricId)
              return (
                <div key={i} className="flex flex-col gap-3 r-control border border-line p-4">
                  <div className="flex items-end gap-2">
                    <Select className="min-w-0 flex-1" label={spec.series.length > 1 ? `Métrica de la serie ${i + 1}` : 'Métrica'} value={s.metricId} onChange={(e) => cambiarSerie(i, { metricId: e.target.value, filters: undefined })}>
                      {!m && <option value={s.metricId}>{s.metricId ? `Métrica que ya no existe (${s.metricId})` : 'Elige una métrica'}</option>}
                      {porModulo.map(([mod, lista]) => (
                        <optgroup key={mod} label={nombreModulo(mod)}>
                          {lista.map((x) => {
                            const razon = i > 0 ? incompatibilityReason(x, { first: m0, groupBy: spec.groupBy, type: spec.type }) : null
                            return (
                              <option key={x.id} value={x.id} disabled={!!razon && x.id !== s.metricId}>
                                {razon ? `${x.name} (${razon})` : `${x.name} · ${UNIT_LABELS[x.unit]}`}
                              </option>
                            )
                          })}
                        </optgroup>
                      ))}
                    </Select>
                    {spec.series.length > 1 && <IconButton variant="ghost" etiqueta={`Quitar la serie ${i + 1}`} icono={<Trash size={16} />} onClick={() => cambiar({ ...spec, series: spec.series.filter((_, j) => j !== i) })} />}
                  </div>
                  {m && m.filters.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {m.filters.map((k) => (
                        <FiltroSerie key={k} clave={k} valor={s.filters?.[k]} onChange={(v) => cambiarSerie(i, { filters: { ...(s.filters ?? {}), [k]: v } })} />
                      ))}
                    </div>
                  )}
                  {spec.series.length > 1 && <TextField label="Nombre en la leyenda (opcional)" value={s.label ?? ''} maxLength={80} onChange={(e) => cambiarSerie(i, { label: e.target.value })} placeholder={m?.name} />}
                </div>
              )
            })}
            {spec.series.length < CHART_MAX_SERIES && (
              <div>
                <Button
                  size="sm"
                  icon={<Plus size={14} />}
                  disabled={!!spec.splitBy}
                  aria-describedby={spec.splitBy ? 'ayuda-serie' : undefined}
                  onClick={() => {
                    const otra = metas.find((x) => !incompatibilityReason(x, { first: m0, groupBy: spec.groupBy, type: spec.type }) && !spec.series.some((s) => s.metricId === x.id)) ?? m0
                    if (otra) cambiar({ ...spec, series: [...spec.series, { metricId: otra.id }] })
                  }}
                >
                  Añadir serie
                </Button>
                {spec.splitBy && (
                  <p id="ayuda-serie" className="field-help">
                    Con la división por {GROUPING_LABELS[spec.splitBy]} solo cabe una serie.
                  </p>
                )}
              </div>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Agrupar por" value={spec.groupBy} onChange={(e) => cambiar({ ...spec, groupBy: e.target.value as Grouping })}>
              {agrupaciones.map((g) => {
                const razon = razonAgrupacion(g)
                return (
                  <option key={g} value={g} disabled={!!razon}>
                    {mayus(GROUPING_LABELS[g])}
                    {razon ? ` (${razon})` : ''}
                  </option>
                )
              })}
            </Select>
            <Select
              label="Dividir por"
              value={spec.splitBy ?? ''}
              disabled={spec.series.length > 1 || divisiones.length === 0}
              ayuda={spec.series.length > 1 ? 'Solo con una serie.' : divisiones.length === 0 ? 'Esta métrica no se puede dividir.' : 'Una serie por cada valor.'}
              onChange={(e) => cambiar({ ...spec, splitBy: (e.target.value || undefined) as DimensionGrouping | undefined })}
            >
              <option value="">Sin dividir</option>
              {divisiones.map((d) => (
                <option key={d} value={d}>
                  {mayus(GROUPING_LABELS[d])}
                </option>
              ))}
            </Select>
          </div>

          <EditorRango rango={spec.range} onChange={(range) => cambiar({ ...spec, range })} />

          <div>
            <SegmentedControl<ChartType>
              label="Tipo de gráfico"
              value={spec.type}
              onChange={(type) => !tipoDesactivado(type) && cambiar({ ...spec, type })}
              opciones={TIPOS.map((t) => ({ ...t, desactivada: !!tipoDesactivado(t.id) && t.id !== spec.type }))}
            />
            {TIPOS.some((t) => tipoDesactivado(t.id)) && (
              <ul className="field-help mt-2 flex flex-col gap-1">
                {TIPOS.map((t) => tipoDesactivado(t.id)).filter((x, i, a) => x && a.indexOf(x) === i).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Checkbox
              label="Comparar con el periodo anterior"
              checked={!!spec.comparePrevious && spec.type !== 'scatter'}
              disabled={spec.type === 'scatter'}
              ayuda={spec.type === 'scatter' ? 'No se compara en la dispersión.' : 'El mismo tramo justo antes, alineado.'}
              onChange={(v) => cambiar({ ...spec, comparePrevious: v })}
            />
            <TextField label="Objetivo (opcional)" inputMode="decimal" value={objetivoTexto} unidad={unidad ? unidadEntrada(unidad) : undefined} onChange={(e) => onObjetivo(e.target.value)} error={objetivoTexto.trim() && spec.target == null ? 'Escribe un número.' : undefined} ayuda="Se dibuja como una línea discontinua." />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 self-start lg:sticky lg:top-0">
          <div className="card">
            <GraficoVista spec={previa} titulo={title.trim() || 'Vista previa'} />
          </div>
          {avisos.length > 0 && (
            <div role="alert" className="flex flex-col gap-2">
              {avisos.slice(0, 3).map((a, i) => (
                <Aviso key={i} tono="warning">
                  {a.message}
                </Aviso>
              ))}
            </div>
          )}
        </div>
      </div>

      {errorGuardar && (
        <div role="alert" className="mt-4">
          <Aviso tono="error">{errorGuardar}</Aviso>
        </div>
      )}
      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" cargando={guardar.isPending}>
          {chartId != null ? 'Guardar cambios' : 'Guardar gráfico'}
        </Button>
      </div>
    </form>
  )
}

/** Un filtro de una serie, con su lista de opciones del módulo que la conoce. */
function FiltroSerie({ clave, valor, onChange }: { clave: MetricFilterKey; valor: string | number | undefined; onChange: (v: string | number | undefined) => void }) {
  const q = useApi('core:metrics.options', [OPCIONES_FILTRO[clave]])
  const opciones = q.data ?? []
  const grupos = useMemo(() => {
    const g = new Map<string, typeof opciones>()
    for (const o of opciones) g.set(o.group ?? '', [...(g.get(o.group ?? '') ?? []), o])
    return [...g.entries()]
  }, [opciones])
  return (
    <Select
      label={mayus(FILTER_LABELS[clave])}
      value={valor === undefined ? '' : String(valor)}
      disabled={q.isPending}
      onChange={(e) => {
        const o = opciones.find((x) => String(x.value) === e.target.value)
        onChange(o ? o.value : undefined)
      }}
    >
      <option value="">Todos</option>
      {valor !== undefined && !opciones.some((o) => String(o.value) === String(valor)) && <option value={String(valor)}>Ya no existe ({String(valor)})</option>}
      {grupos.map(([g, lista]) =>
        g ? (
          <optgroup key={g} label={g}>
            {lista.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
                {o.inactive ? ' (inactivo)' : ''}
              </option>
            ))}
          </optgroup>
        ) : (
          lista.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
              {o.inactive ? ' (inactivo)' : ''}
            </option>
          ))
        )
      )}
    </Select>
  )
}

/** Rango: últimos N periodos, el periodo actual o fechas fijas. */
function EditorRango({ rango, onChange }: { rango: ChartRange; onChange: (r: ChartRange) => void }) {
  const hoy = new Date()
  const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const [cuentaTexto, setCuentaTexto] = useState(rango.kind === 'last' ? String(rango.count) : '12')
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="t-label mb-2 font-semibold text-ink">Rango</legend>
      <SegmentedControl<ChartRange['kind']>
        label="Tipo de rango"
        value={rango.kind}
        onChange={(k) =>
          onChange(
            k === 'last'
              ? { kind: 'last', unit: rango.kind === 'this' ? rango.unit : 'month', count: Number(cuentaTexto) || 6 }
              : k === 'this'
                ? { kind: 'this', unit: rango.kind === 'last' && rango.unit !== 'day' ? rango.unit : 'year' }
                : { kind: 'absolute', from: `${iso.slice(0, 4)}-01-01`, to: iso }
          )
        }
        opciones={[
          { id: 'last', texto: 'Últimos' },
          { id: 'this', texto: 'Actual' },
          { id: 'absolute', texto: 'Fechas' }
        ]}
      />
      {rango.kind === 'last' && (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Cuántos"
            inputMode="numeric"
            value={cuentaTexto}
            onChange={(e) => {
              setCuentaTexto(e.target.value)
              const n = Number(e.target.value)
              if (Number.isInteger(n) && n > 0) onChange({ ...rango, count: n })
            }}
            error={Number.isInteger(Number(cuentaTexto)) && Number(cuentaTexto) > 0 ? undefined : 'Un número entero mayor que 0.'}
          />
          <Select label="Periodo" value={rango.unit} onChange={(e) => onChange({ ...rango, unit: e.target.value as typeof rango.unit })}>
            {RANGO_UNIDADES.map((u) => (
              <option key={u.id} value={u.id}>
                {rango.count === 1 ? u.uno : u.varios}
              </option>
            ))}
          </Select>
        </div>
      )}
      {rango.kind === 'this' && (
        <Select label="Periodo" value={rango.unit} onChange={(e) => onChange({ kind: 'this', unit: e.target.value as 'week' | 'month' | 'year' })}>
          <option value="week">Esta semana</option>
          <option value="month">Este mes</option>
          <option value="year">Este año</option>
        </Select>
      )}
      {rango.kind === 'absolute' && (
        <div className={cx('grid grid-cols-2 gap-3')}>
          <DatePicker label="Desde" value={rango.from} onChange={(from) => onChange({ ...rango, from })} />
          <DatePicker label="Hasta" value={rango.to} onChange={(to) => onChange({ ...rango, to })} error={rango.from > rango.to ? 'Es anterior a la fecha de inicio.' : undefined} />
        </div>
      )}
    </fieldset>
  )
}

/** Unidad que se escribe en el campo de objetivo (los euros en euros, los % en %). */
function unidadEntrada(u: MetricMeta['unit']): string {
  return u === 'eur_cents' ? '€' : u === 'pct' ? '%' : UNIT_LABELS[u]
}
/** Valor guardado → texto del campo. */
function objetivoAEntrada(v: number, u?: MetricMeta['unit']): string {
  const x = u === 'eur_cents' ? v / 100 : u === 'pct' ? v * 100 : v
  return String(Math.round(x * 100) / 100).replace('.', ',')
}
/** Texto del campo → valor en la unidad de la métrica (null si está vacío o no es un número). */
function entradaAObjetivo(txt: string, u?: MetricMeta['unit']): number | null {
  const t = txt.trim().replace(/\./g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return u === 'eur_cents' ? Math.round(n * 100) : u === 'pct' ? n / 100 : n
}
