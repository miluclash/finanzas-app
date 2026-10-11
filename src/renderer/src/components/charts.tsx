// Gráficos (Recharts). Colores categóricos validados: azul, naranja, aguamarina. Un solo eje Y.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps
} from 'recharts'
import { formatMonth } from '@shared/dates'
import { formatEur, formatPct } from '@shared/money'
import type { MonthKey } from '@shared/types'
import { cx } from './ui'

const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 })
const eurTick = (v: number) => `${compact.format(v / 100)} €`
const monthTick = (m: string) => formatMonth(m as MonthKey).replace(/ \d{2}(\d{2})$/, ' $1')

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)']

function TooltipBox({
  active,
  payload,
  label,
  pct
}: Partial<TooltipContentProps<number, string>> & { pct?: boolean }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 font-medium text-ink">{formatMonth(String(label) as MonthKey, true)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="inline-block size-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num text-ink">{pct ? formatPct(Number(p.value)) : formatEur(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

const legendStyle = { fontSize: 12, color: 'var(--ink-2)', paddingTop: 4 }

export function IncomeExpenseChart({ data, height = 220 }: { data: Array<{ month: string; income: number; expenses: number }>; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Ingresos frente a gastos por mes">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthTick} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
          <YAxis tickFormatter={eurTick} tickLine={false} axisLine={false} width={68} />
          <Tooltip content={<TooltipBox />} />
          <Legend wrapperStyle={legendStyle} iconType="square" iconSize={8} itemSorter={null} />
          <Bar dataKey="income" name="Ingresos" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="expenses" name="Gastos" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function LinesChart({
  data,
  series,
  height = 220,
  pct,
  reference
}: {
  data: Array<Record<string, number | string | null>>
  series: Array<{ key: string; name: string }>
  height?: number
  pct?: boolean
  reference?: { value: number; label: string } | null
}) {
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.name).join(', ')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthTick} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
          <YAxis
            tickFormatter={pct ? (v: number) => formatPct(v).replace(',0', '') : eurTick}
            tickLine={false}
            axisLine={false}
            width={68}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<TooltipBox pct={pct} />} />
          {series.length > 1 && <Legend wrapperStyle={legendStyle} iconType="plainline" itemSorter={null} />}
          {reference && (
            <ReferenceLine
              y={reference.value}
              stroke="var(--muted)"
              strokeDasharray="4 4"
              label={{ value: reference.label, position: 'insideTopLeft', fill: 'var(--muted)', fontSize: 11 }}
            />
          )}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="linear"
              dataKey={s.key}
              name={s.name}
              stroke={SERIES[i % SERIES.length]}
              strokeWidth={2}
              dot={data.length <= 14 ? { r: 3, strokeWidth: 2, fill: 'var(--surface)' } : false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Barras horizontales en HTML (desglose por categoría, reparto de activos). Un solo tono. */
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
    <ul className="flex flex-col gap-1.5">
      {[...shown, ...(rest.length ? [{ key: '__rest', label: `Otras (${rest.length})`, value: restValue }] : [])].map((r) => (
        <li key={r.key}>
          <button
            type="button"
            disabled={!onClick || r.key === '__rest'}
            onClick={() => onClick?.(r.key)}
            className={cx('group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-left', onClick && 'cursor-pointer')}
          >
            <span className="truncate text-[13px] text-ink-2 group-enabled:group-hover:text-ink">{r.label}</span>
            <span className="num text-[13px] text-ink">
              {formatValue(r.value)}
              {sum > 0 && <span className="ml-2 inline-block w-11 text-right text-[12px] text-muted">{formatPct(Math.abs(r.value) / sum)}</span>}
            </span>
            <span className="col-span-2 mt-0.5 h-1.5 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full" style={{ width: `${(Math.abs(r.value) / top) * 100}%`, background: 'var(--series-1)' }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
