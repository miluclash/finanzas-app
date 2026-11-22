// Gráficos de Finanzas con el sistema de diseño (skill dataviz): marcas finas, un solo eje Y, barras desde cero,
// leyenda desde 2 series, referencias discontinuas y rotuladas, color con patrón y rótulo, nunca solo color.
// Las cifras llegan en céntimos y se formatean con los formateadores de siempre. Quien los usa los envuelve en un
// ChartFrame (título, periodo, unidad y referencia) cuando el gráfico va suelto en una tarjeta.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMonth } from '@shared/dates'
import { formatEur, formatPct } from '@shared/money'
import type { MonthKey } from '@shared/modules/finanzas/types'
import { ChartTip, cx, Legend, Lineas, MARCA, type ItemLeyenda, type Patron, type Referencia, type SerieLinea } from '../../../core/ui'

const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 })
const sinDecimales = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' })
const eurTick = (v: number) => `${compact.format(v / 100)} €`
const monthTick = (m: string | number) => formatMonth(String(m) as MonthKey).replace(/ \d{2}(\d{2})$/, ' $1')
const pctTick = (v: number) => formatPct(v).replace(',0', '')

/** Series de Finanzas por orden: azul, ámbar, aguamarina y violeta (validadas para daltonismo) */
const COLORES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)']
export const SERIE_CONTEXTO = 'var(--muted-mark)'

export type SerieSpec = { key: string; name: string; color?: string; patron?: Patron }
const aSeriesLinea = (series: SerieSpec[]): SerieLinea[] => series.map((s, i) => ({ key: s.key, nombre: s.name, color: s.color ?? COLORES[i % COLORES.length], patron: s.patron }))

/** Leyenda de las series de LinesChart, para pasarla a ChartFrame cuando éste las enmarca */
export const leyendaSeries = (series: SerieSpec[], reference?: { label: string } | null): ItemLeyenda[] => [
  ...aSeriesLinea(series).map((s) => ({ nombre: s.nombre, color: s.color, patron: s.patron ?? ('solida' as Patron) })),
  ...(reference ? [{ nombre: reference.label, color: 'var(--ref)', patron: 'discontinua' as Patron }] : [])
]

/** Ingresos frente a gastos por mes: columnas agrupadas desde cero, con tooltip. La leyenda la pone el ChartFrame que lo envuelve */
export function IncomeExpenseChart({ data, height = 220 }: { data: Array<{ month: string; income: number; expenses: number }>; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Ingresos frente a gastos por mes">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={MARCA.anillo} barCategoryGap="28%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthTick} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tickMargin={8} />
          <YAxis tickFormatter={eurTick} tickLine={false} axisLine={false} width={64} domain={[0, 'auto']} />
          <Tooltip
            cursor={{ fill: 'var(--interactive)', opacity: 0.5 }}
            isAnimationActive={false}
            content={(p) => <ChartTip active={p.active} payload={p.payload} label={p.label} titulo={(l) => formatMonth(String(l) as MonthKey, true)} formato={(v) => formatEur(v)} />}
          />
          <Bar dataKey="income" name="Ingresos" fill={COLORES[0]} radius={[MARCA.radioBarra, MARCA.radioBarra, 0, 0]} maxBarSize={MARCA.barraMax} isAnimationActive={false} />
          <Bar dataKey="expenses" name="Gastos" fill={COLORES[1]} radius={[MARCA.radioBarra, MARCA.radioBarra, 0, 0]} maxBarSize={MARCA.barraMax} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
export const LEYENDA_INGRESOS_GASTOS: ItemLeyenda[] = [
  { nombre: 'Ingresos', color: COLORES[0], patron: 'barra' },
  { nombre: 'Gastos', color: COLORES[1], patron: 'barra' }
]

/** Líneas por mes sobre un solo eje. La referencia (mínimo, objetivo, presupuesto) va discontinua y rotulada */
export function LinesChart({
  data,
  series,
  height = 220,
  pct,
  reference,
  leyenda = true
}: {
  data: Array<Record<string, number | string | null>>
  series: SerieSpec[]
  height?: number
  pct?: boolean
  reference?: { value: number; label: string } | null
  /** Con false no pinta su leyenda (la pinta el ChartFrame que lo envuelve) */
  leyenda?: boolean
}) {
  const formato = (v: number) => (pct ? formatPct(v) : formatEur(v))
  const referencias: Referencia[] | undefined = reference ? [{ y: reference.value, texto: reference.label, patron: 'discontinua' }] : undefined
  const spec = aSeriesLinea(series)
  // La etiqueta final lleva el importe sin céntimos; el margen se ajusta a su longitud para no recortarla
  const formatoFinal = (v: number) => (pct ? formatPct(v) : sinDecimales.format(v / 100))
  const ultimos = data.length ? spec.map((s) => formatoFinal(Number(data[data.length - 1][s.key] ?? 0)).length) : [0]
  const margen = Math.max(56, Math.max(...ultimos) * 8 + 16)
  // Si todo es positivo, el eje arranca en cero para no exagerar los cambios
  const positivo = data.every((d) => spec.every((s) => d[s.key] === null || Number(d[s.key]) >= 0))
  return (
    <div>
      {leyenda && series.length > 1 && <Legend className="mb-2" items={leyendaSeries(series, reference)} />}
      <Lineas
        datos={data}
        claveX="month"
        series={spec}
        alto={`${height}px`}
        formato={(v) => formato(v)}
        formatoFinal={formatoFinal}
        formatoEje={pct ? pctTick : eurTick}
        formatoX={monthTick}
        tituloTooltip={(l) => formatMonth(String(l) as MonthKey, true)}
        referencias={referencias}
        dominio={positivo ? [0, 'auto'] : ['auto', 'auto']}
        anchoEje={64}
        margenFinal={margen}
      />
    </div>
  )
}

/** Barras horizontales en HTML (desglose por categoría, reparto de activos). Un solo tono, desde cero */
export function BarList({
  rows,
  total,
  onClick,
  formatValue = (v) => formatEur(v),
  max = 10
}: {
  rows: Array<{ key: string; label: string; value: number; sub?: string }>
  total?: number
  onClick?: (key: string) => void
  formatValue?: (v: number) => string
  max?: number
}) {
  const top = Math.max(...rows.map((r) => Math.abs(r.value)), 1)
  const sum = total ?? rows.reduce((s, r) => s + Math.abs(r.value), 0)
  const shown = rows.slice(0, max)
  const rest = rows.slice(max)
  const restValue = rest.reduce((s, r) => s + r.value, 0)
  return (
    <ul className="flex flex-col gap-1">
      {[...shown, ...(rest.length ? [{ key: '__rest', label: `Otras (${rest.length})`, value: restValue }] : [])].map((r) => {
        const activa = !!onClick && r.key !== '__rest'
        return (
          <li key={r.key}>
            <button
              type="button"
              disabled={!activa}
              onClick={() => onClick?.(r.key)}
              className={cx('group grid min-h-10 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 r-control px-2 py-1 text-left', activa && 'cursor-pointer hover:bg-raised')}
            >
              <span className="t-body truncate text-ink-2 group-enabled:group-hover:text-ink">{r.label}</span>
              <span className="tnum t-body text-ink">
                {formatValue(r.value)}
                {sum > 0 && <span className="t-meta ml-2 inline-block w-12 text-right">{formatPct(Math.abs(r.value) / sum)}</span>}
              </span>
              <span className="col-span-2 mt-1 block h-2 overflow-hidden r-full bg-track">
                <span className="block h-full" style={{ width: `${(Math.abs(r.value) / top) * 100}%`, background: 'var(--series-1)', borderRadius: 'var(--radius-full) var(--radius-mark) var(--radius-mark) var(--radius-full)' }} />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
