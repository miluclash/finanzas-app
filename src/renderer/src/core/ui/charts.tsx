// Gráficos según la skill dataviz: primero la forma, el color al final y por función.
// Marcas finas (línea 2 px, barras con 4 px redondeados en el extremo y ancladas a la base),
// rejilla y ejes discretos, leyenda desde 2 series, etiquetas directas selectivas, el texto nunca
// lleva el color de la serie y lo real, lo histórico, el presupuesto, el objetivo y la proyección
// se distinguen también por patrón (continua, punteada, discontinua) y por rótulo.
// Cada gráfico lleva título, periodo, unidad y una referencia para interpretarlo (ChartFrame).
import { ArrowClockwise, ChartLine, Table as TableIcon, Tray } from '@phosphor-icons/react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { type TooltipPayloadEntry, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Area, AreaChart, Scatter, ScatterChart } from 'recharts'
import { cx } from './cx'
import { Button, IconButton } from './controls'
import { EmptyState, ErrorState, StatusBadge, type Tono } from './feedback'

/** Espejo en números de los tokens --mark-* (Recharts necesita números en sus atributos) */
export const MARCA = { linea: 2, punto: 4, anillo: 2, barraMax: 24, radioBarra: 4 }
/** Lo que Recharts entrega al tooltip y a las etiquetas: solo los campos que usamos */
type TipProps = { active?: boolean; payload?: readonly TooltipPayloadEntry[]; label?: string | number }
type EtiquetaProps = { index?: number; x?: number | string; y?: number | string; width?: number | string; value?: unknown }
type PuntoProps = { index?: number; cx?: number; cy?: number }
/** Una fila de datos de un gráfico: la clave X y las series */
type Fila = Record<string, string | number | null | undefined>
export type Patron = 'solida' | 'discontinua' | 'punteada' | 'rayapunto' | 'rayadoble'
const DASH: Record<Patron, string | undefined> = { solida: undefined, discontinua: '8 4', punteada: '2 4', rayapunto: '8 3 2 3', rayadoble: '8 3 2 3 2 3' }

/* ======================= Tooltip del gráfico ======================= */
export function ChartTip({ active, payload, label, formato, titulo }: TipProps & { formato: (v: number, key: string) => string; titulo?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null
  const filas = payload.filter((p) => p.value !== null && p.value !== undefined)
  if (!filas.length) return null
  return (
    <div className="elevated pop-in r-control px-3 py-2" style={{ minWidth: '9rem' }}>
      {label !== undefined && <div className="t-meta mb-1">{titulo ? titulo(label) : label}</div>}
      <div className="flex flex-col gap-1">
        {filas.map((p, i) => (
          <div key={i} className="t-label flex items-center gap-2">
            <svg width="16" height="8" aria-hidden>
              <line x1="0" y1="4" x2="16" y2="4" stroke={p.color ?? p.stroke ?? p.fill} strokeWidth={MARCA.linea} strokeDasharray={p.strokeDasharray} />
            </svg>
            <span>{p.name}</span>
            <span className="tnum ml-auto font-semibold text-ink">{formato(Number(p.value), String(p.dataKey))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
const cursorLinea = { stroke: 'var(--line-strong)', strokeWidth: 1 }

/* ======================= Legend ======================= */
export type ItemLeyenda = { nombre: string; color: string; patron?: Patron | 'barra' | 'trama' | 'puntos' | 'contorno' }
/** Legend: clave de línea con su patrón y texto en tinta. Obligatoria desde 2 series */
export function Legend({ items, className }: { items: ItemLeyenda[]; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1', className)} aria-label="Leyenda">
      {items.map((s, i) => (
        <li key={`${i}-${s.nombre}`} className="t-label flex items-center gap-2">
          <svg width="24" height="10" aria-hidden>
            {s.patron === 'barra' ? (
              <rect x="6" y="1" width="12" height="8" rx="2" fill={s.color} />
            ) : s.patron === 'contorno' ? (
              <rect x="6.75" y="1.75" width="10.5" height="6.5" rx="2" fill="none" stroke={s.color} strokeWidth={1.5} strokeDasharray="3 2" />
            ) : s.patron === 'trama' || s.patron === 'puntos' ? (
              <>
                <defs>
                  {s.patron === 'trama' ? (
                    <pattern id={`${uid}-lg${i}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                      <rect width="2" height="5" fill={s.color} />
                    </pattern>
                  ) : (
                    <pattern id={`${uid}-lg${i}`} patternUnits="userSpaceOnUse" width="4" height="4">
                      <circle cx="2" cy="2" r="1.2" fill={s.color} />
                    </pattern>
                  )}
                </defs>
                <rect x="6" y="1" width="12" height="8" rx="2" fill={`url(#${uid}-lg${i})`} stroke={s.color} />
              </>
            ) : (
              <line x1="1" y1="5" x2="23" y2="5" stroke={s.color} strokeWidth={MARCA.linea} strokeDasharray={DASH[s.patron ?? 'solida']} strokeLinecap="round" />
            )}
          </svg>
          {s.nombre}
        </li>
      ))}
    </ul>
  )
}

/* ======================= ChartFrame ======================= */
export type TablaGrafico = { columnas: string[]; filas: (string | number)[][] }
/** ChartFrame: título, periodo, unidad, referencia y leyenda. Estados sin datos, cargando y error distintos. Gemelo en tabla */
export function ChartFrame({
  titulo,
  periodo,
  unidad,
  referencia,
  leyenda,
  estado = 'ok',
  onReintentar,
  tabla,
  descripcion,
  children,
  hero,
  alto
}: {
  titulo: string
  periodo: string
  unidad: string
  referencia?: string
  leyenda?: ItemLeyenda[]
  estado?: 'ok' | 'vacio' | 'cargando' | 'error'
  onReintentar?: () => void
  tabla?: TablaGrafico
  descripcion?: string
  children?: ReactNode
  hero?: boolean
  alto?: string
}) {
  const [verTabla, setVerTabla] = useState(false)
  const ink2 = hero ? { color: 'var(--hero-ink-2)' } : undefined
  return (
    <figure aria-label={descripcion ?? `${titulo}. ${periodo}. ${unidad}`} className="min-w-0">
      <figcaption className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="t-label font-semibold" style={hero ? { color: 'var(--hero-ink)' } : { color: 'var(--ink)' }}>
            {titulo}
          </div>
          <div className="t-meta" style={ink2}>
            {periodo} · {unidad}
          </div>
        </div>
        {tabla && estado === 'ok' && (
          <IconButton variant="ghost" size="sm" etiqueta={verTabla ? 'Ver el gráfico' : 'Ver como tabla'} aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)} icono={verTabla ? <ChartLine size={16} /> : <TableIcon size={16} />} />
        )}
      </figcaption>
      {leyenda && leyenda.length > 1 && estado === 'ok' && !verTabla && <Legend items={leyenda} className="mb-2" />}
      {estado === 'cargando' && (
        <div role="status" aria-busy="true" aria-label={`Cargando ${titulo}`} className="skeleton w-full" style={{ height: alto ?? 'var(--chart-h-sm)' }} />
      )}
      {estado === 'vacio' && <EmptyState compacto icono={<Tray size={20} />} titulo="Sin datos en este periodo" texto="Cuando haya movimientos aparecerán aquí." />}
      {estado === 'error' && <ErrorState titulo="No se ha podido dibujar el gráfico" texto="Los datos no llegaron. Inténtalo de nuevo." accion={<Button size="sm" onClick={onReintentar} icon={<ArrowClockwise size={14} />}>Reintentar</Button>} />}
      {estado === 'ok' && !verTabla && children}
      {estado === 'ok' && verTabla && tabla && (
        <div className="overflow-x-auto">
          <table className="w-full t-label tnum">
            <caption className="sr-only">{titulo}</caption>
            <thead>
              <tr>
                {tabla.columnas.map((c, i) => (
                  <th key={c} scope="col" className={cx('py-2 font-semibold text-ink-2', i === 0 ? 'text-left' : 'text-right')}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.filas.map((f, i) => (
                <tr key={i} className="border-t border-line">
                  {f.map((c, j) => (
                    <td key={j} className={cx('py-2', j === 0 ? 'text-left text-ink-2' : 'text-right text-ink')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {referencia && estado === 'ok' && (
        <p className="t-meta mt-2" style={ink2}>
          {referencia}
        </p>
      )}
    </figure>
  )
}

/* ======================= ProgressBar ======================= */
export function ProgressBar({ value, tone = 'accent', label, valueText, marker, className }: { value: number; tone?: 'accent' | 'warning' | 'info' | 'success'; label: string; valueText?: string; marker?: number; className?: string }) {
  const color = tone === 'accent' ? 'var(--accent-mark)' : `var(--${tone})`
  return (
    <div className={cx('progress', className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(value, 1) * 100)} aria-valuetext={valueText}>
      <i style={{ width: `${Math.min(value, 1) * 100}%`, background: color }} />
      {marker !== undefined && <b style={{ left: `calc(${marker * 100}% - 1px)` }} aria-hidden />}
    </div>
  )
}

/* ======================= Sparkline ======================= */
/** Mini tendencia con periodo, valor inicial y final y tooltip. Sin ejes, pero nunca sin contexto */
export function Spark({
  datos,
  periodo,
  etiquetaInicio,
  etiquetaFin,
  formato,
  color = 'var(--accent-mark)',
  alto = 'var(--chart-h-xs)',
  area = true,
  nombre,
  etiquetaX
}: {
  datos: number[]
  periodo: string
  etiquetaInicio: string
  etiquetaFin: string
  formato: (v: number) => string
  color?: string
  alto?: string
  area?: boolean
  nombre: string
  etiquetaX?: (i: number) => string
}) {
  const d = datos.map((v, i) => ({ i, v }))
  const min = Math.min(...datos)
  const max = Math.max(...datos)
  const pad = (max - min) * 0.15 || 1
  const id = `sp-${nombre.replace(/\W/g, '')}`
  const ultimo = datos.length - 1
  return (
    <div>
      <div style={{ height: alto }} className="w-full" role="img" aria-label={`${nombre}, ${periodo}: de ${formato(datos[0])} a ${formato(datos[ultimo])}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={d} margin={{ top: 6, right: 6, bottom: 2, left: 6 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[min - pad, max + pad]} />
            <XAxis hide dataKey="i" />
            <RTooltip cursor={cursorLinea} isAnimationActive={false} content={(p: TipProps) => <ChartTip {...p} label={etiquetaX && p.payload?.[0] ? etiquetaX(p.payload[0].payload.i) : undefined} formato={(v) => formato(v)} />} />
            <Area
              type="monotone"
              dataKey="v"
              name={nombre}
              stroke={color}
              strokeWidth={MARCA.linea}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={area ? `url(#${id})` : 'none'}
              dot={(p: PuntoProps) => (p.index === ultimo ? <circle key={p.index} cx={p.cx} cy={p.cy} r={MARCA.punto} fill={color} stroke="var(--card)" strokeWidth={MARCA.anillo} /> : <g key={p.index} />)}
              activeDot={{ r: MARCA.punto, fill: color, stroke: 'var(--card)', strokeWidth: MARCA.anillo }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="t-meta tnum mt-1 flex justify-between gap-2">
        <span>
          {etiquetaInicio}: <span className="text-ink-2">{formato(datos[0])}</span>
        </span>
        <span>
          {etiquetaFin}: <span className="font-semibold text-ink">{formato(datos[ultimo])}</span>
        </span>
      </div>
    </div>
  )
}

/* ======================= Columnas ======================= */
/** Columnas desde cero. Una resaltada (énfasis) y el resto en gris. Una anotada con trama a 45° y rótulo, no solo por color */
export function Columnas({
  datos,
  claveX,
  claveY,
  nombre,
  resaltada,
  anotada,
  colorResaltada = 'var(--accent-mark)',
  colorResto = 'var(--muted-mark)',
  alto = 'var(--chart-h)',
  formato,
  claseGrafico,
  etiquetaUltima = true
}: {
  datos: object[]
  claveX: string
  claveY: string
  nombre: string
  resaltada: number
  anotada?: { i: number; texto: string } | { i: number; texto: string }[]
  colorResaltada?: string
  colorResto?: string
  alto?: string
  formato: (v: number) => string
  claseGrafico?: string
  etiquetaUltima?: boolean
}) {
  const pid = `tr-${nombre.replace(/\W/g, '')}`
  const notas = anotada ? (Array.isArray(anotada) ? anotada : [anotada]) : []
  return (
    <div style={{ height: alto }} className={cx('w-full', claseGrafico)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 24, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
          <defs>
            <pattern id={pid} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="2.5" height="6" fill={colorResto} />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={claveX} tickLine={false} axisLine={false} tickMargin={8} interval={0} />
          <YAxis hide domain={[0, 'auto']} />
          <RTooltip cursor={{ fill: 'var(--interactive)', opacity: 0.5 }} isAnimationActive={false} content={(p: TipProps) => <ChartTip {...p} formato={(v) => formato(v)} />} />
          <Bar
            dataKey={claveY}
            name={nombre}
            maxBarSize={MARCA.barraMax}
            radius={[MARCA.radioBarra, MARCA.radioBarra, 0, 0]}
            isAnimationActive={false}
            label={(p: EtiquetaProps) => {
              const esUltima = etiquetaUltima && p.index === resaltada
              const nota = notas.find((x) => x.i === p.index)
              const esNota = !!nota
              if (!esUltima && !esNota) return <g key={p.index} />
              return (
                <text key={p.index} x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 8} textAnchor="middle" className="tnum" fontWeight={600} fill="var(--lbl, var(--ink))" style={{ fontSize: 'var(--fs-label)' }}>
                  {nota ? nota.texto : formato(Number(p.value))}
                </text>
              )
            }}
          >
            {datos.map((_, i) => {
              const nota = notas.some((x) => x.i === i)
              return <Cell key={i} fill={nota ? `url(#${pid})` : i === resaltada ? colorResaltada : colorResto} stroke={nota ? colorResto : 'none'} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ======================= Líneas ======================= */
export type SerieLinea = { key: string; nombre: string; color: string; patron?: Patron; marcadorFinal?: 'relleno' | 'hueco' }
export type Referencia = { y: number; texto: string; patron?: Patron; posicion?: 'insideTopLeft' | 'insideTopRight' | 'insideBottomRight' }
const ultimoDe = (datos: object[], key: string) => {
  for (let i = datos.length - 1; i >= 0; i--) if ((datos[i] as Fila)[key] !== null && (datos[i] as Fila)[key] !== undefined) return i
  return -1
}
/** Líneas sobre un solo eje. Referencias (presupuesto, objetivo) con patrón y rótulo; etiqueta directa al final de la primera serie */
export function Lineas({
  datos,
  claveX,
  series,
  alto = 'var(--chart-h)',
  formato,
  formatoEje,
  tituloTooltip,
  etiquetaFinal = true,
  referencias,
  dominio,
  ticks,
  formatoX,
  formatoFinal,
  anchoEje = 48,
  margenFinal = 56
}: {
  datos: object[]
  claveX: string
  series: SerieLinea[]
  alto?: string
  formato: (v: number, key: string) => string
  formatoEje?: (v: number) => string
  tituloTooltip?: (l: string | number) => string
  etiquetaFinal?: boolean
  referencias?: Referencia[]
  dominio?: [number | 'auto', number | 'auto']
  ticks?: number[]
  /** Texto de cada marca del eje X (por ejemplo, de «2026-11» a «nov 26») */
  formatoX?: (v: string | number) => string
  /** Texto de la etiqueta directa del final de la línea (por defecto, el mismo del tooltip) */
  formatoFinal?: (v: number, key: string) => string
  /** Ancho reservado al eje Y y al margen derecho de la etiqueta final, en px */
  anchoEje?: number
  margenFinal?: number
}) {
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 16, right: etiquetaFinal ? margenFinal : 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={claveX} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tickMargin={8} minTickGap={16} tickFormatter={formatoX} />
          <YAxis tickLine={false} axisLine={false} width={anchoEje} tickFormatter={formatoEje ?? ((v) => String(v))} domain={dominio ?? ['auto', 'auto']} ticks={ticks} />
          <RTooltip cursor={cursorLinea} isAnimationActive={false} content={(p: TipProps) => <ChartTip {...p} formato={formato} titulo={tituloTooltip} />} />
          {referencias?.map((r) => (
            <ReferenceLine key={r.texto} y={r.y} stroke="var(--ref)" strokeWidth={MARCA.linea - 0.5} strokeDasharray={DASH[r.patron ?? 'solida']} label={{ value: r.texto, position: r.posicion ?? 'insideTopLeft', fill: 'var(--ink-2)', style: { fontSize: 'var(--fs-label)' } }} />
          ))}
          {series.map((s, si) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.nombre}
              stroke={s.color}
              strokeWidth={MARCA.linea}
              strokeDasharray={DASH[s.patron ?? 'solida']}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls
              dot={false}
              activeDot={{ r: MARCA.punto, fill: s.color, stroke: 'var(--card)', strokeWidth: MARCA.anillo }}
              isAnimationActive={false}
              label={
                etiquetaFinal && si === 0
                  ? (p: EtiquetaProps) =>
                      p.index === ultimoDe(datos, s.key) ? (
                        <g key="e">
                          <circle cx={Number(p.x)} cy={Number(p.y)} r={MARCA.punto} fill={s.marcadorFinal === 'hueco' ? 'var(--card)' : s.color} stroke={s.marcadorFinal === 'hueco' ? s.color : 'var(--card)'} strokeWidth={MARCA.anillo} />
                          <text x={Number(p.x) + 10} y={Number(p.y) + 4} fontWeight={600} fill="var(--ink)" className="tnum" style={{ fontSize: 'var(--fs-label)' }}>
                            {(formatoFinal ?? formato)(Number(p.value), s.key)}
                          </text>
                        </g>
                      ) : (
                        <g key={p.index} />
                      )
                  : undefined
              }
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
export const leyendaDe = (series: SerieLinea[], referencias?: Referencia[]): ItemLeyenda[] => [
  ...series.map((s) => ({ nombre: s.nombre, color: s.color, patron: s.patron ?? ('solida' as Patron) })),
  ...(referencias ?? []).map((r) => ({ nombre: r.texto, color: 'var(--ref)', patron: r.patron ?? ('solida' as Patron) }))
]

/* ======================= Medidores ordenados ======================= */
export type EstadoFila = { tono: Tono; texto: string }
/** Lista de medidores: nombre, barra y cifra en filas alineadas; con rango de referencia rotulado y estado por fila */
export function MedidoresLista({
  filas,
  color = 'var(--accent-mark)',
  formato,
  rango,
  maximo,
  estado
}: {
  /** `rango` propio de la fila (si cada una tiene el suyo); si no, el rango común */
  filas: { nombre: string; valor: number; rango?: { min: number; max: number }; estado?: EstadoFila }[]
  color?: string
  formato: (v: number) => string
  rango?: { min: number; max: number; etiqueta: string }
  maximo?: number
  estado?: (v: number) => EstadoFila
}) {
  const max = maximo ?? Math.max(1, ...filas.map((f) => f.valor), ...filas.map((f) => f.rango?.max ?? 0))
  const conEstado = !!estado || filas.some((f) => f.estado)
  const cols = conEstado ? 'cols-meter-status' : 'cols-meter'
  return (
    <ul className={cx('flex flex-col', conEstado ? 'gap-4' : 'gap-3')}>
      {filas.map((f) => {
        const e = f.estado ?? estado?.(f.valor)
        const r = f.rango ?? rango
        return (
          <li key={f.nombre} className={cx('tip grid items-center gap-3 t-label', cols)} tabIndex={0} aria-label={`${f.nombre}: ${formato(f.valor)}${f.rango ? ` (rango ${f.rango.min} a ${f.rango.max})` : ''}${e ? `, ${e.texto}` : ''}`}>
            <span className="truncate text-ink-2">{f.nombre}</span>
            <span className="relative block h-2 r-full bg-track">
              {r && <span className="absolute inset-y-0 bg-interactive" style={{ left: `${(r.min / max) * 100}%`, width: `${((r.max - r.min) / max) * 100}%`, opacity: 0.7 }} aria-hidden />}
              <span className="absolute inset-y-0 left-0 block" style={{ width: `${(f.valor / max) * 100}%`, background: color, borderRadius: 'var(--radius-full) var(--radius-mark) var(--radius-mark) var(--radius-full)' }} />
              {r && (
                <>
                  <span className="absolute -inset-y-1 w-px bg-ink-3" style={{ left: `${(r.min / max) * 100}%` }} aria-hidden />
                  <span className="absolute -inset-y-1 w-px bg-ink-3" style={{ left: `${(r.max / max) * 100}%` }} aria-hidden />
                </>
              )}
            </span>
            <span className="tnum text-right font-semibold text-ink">{formato(f.valor)}</span>
            {e && <StatusBadge tono={e.tono}>{e.texto}</StatusBadge>}
            <span className="tip-box">
              {f.nombre}: {formato(f.valor)}
              {e ? ` · ${e.texto}` : ''}
            </span>
          </li>
        )
      })}
      {rango && (
        <li className={cx('grid gap-3 t-meta', cols)} aria-hidden>
          <span />
          <span className="relative block h-4">
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(rango.min / max) * 100}%` }}>
              Mín. {rango.min}
            </span>
            <span className="absolute right-0 whitespace-nowrap">
              Máx. {rango.max}
            </span>
          </span>
          <span />
          {conEstado && <span />}
        </li>
      )}
    </ul>
  )
}

/** Barra segmentada: un todo repartido en partes junto a sus cifras */
export function BarraSegmentada({ partes, etiqueta }: { partes: { nombre: string; valor: number; color: string }[]; etiqueta: string }) {
  const total = partes.reduce((a, p) => a + p.valor, 0)
  return (
    <div className="flex h-2 w-full gap-[var(--mark-line)]" role="img" aria-label={`${etiqueta}: ${partes.map((p) => `${p.nombre} ${Math.round((p.valor / total) * 100)} %`).join(', ')}`}>
      {partes.map((p, i) => (
        <span key={p.nombre} style={{ flex: p.valor, background: p.color, borderRadius: i === 0 ? 'var(--radius-full) var(--radius-mark) var(--radius-mark) var(--radius-full)' : i === partes.length - 1 ? 'var(--radius-mark) var(--radius-full) var(--radius-full) var(--radius-mark)' : 'var(--radius-mark)' }} />
      ))}
    </div>
  )
}

/* ======================= Mapa de constancia ======================= */
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const CARGA = ['Sin entreno', 'Carga baja', 'Carga media', 'Carga alta']
const NIVELES = ['var(--track)', 'var(--seq-2)', 'var(--seq-4)', 'var(--seq-5)']
/** Mapa de calor: cada celda es un día. Secuencial de un solo tono; con fechas, leyenda y tooltip (también con teclado) */
export function MapaConstancia({ datos, inicio, semanas = 12 }: { datos: (number | null)[]; inicio: string; semanas?: number }) {
  const caja = useRef<HTMLDivElement>(null)
  const [foco, setFoco] = useState(0)
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null)
  const fecha = (i: number) => {
    const d = new Date(inicio + 'T12:00:00')
    d.setDate(d.getDate() + i)
    return `${DIAS_CORTOS[i % 7]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`
  }
  const texto = (i: number) => (datos[i] === null ? `${fecha(i)}: todavía sin datos` : `${fecha(i)}: ${CARGA[datos[i]!]}`)
  const mostrar = (i: number) => {
    const el = caja.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)
    const c = caja.current
    if (!el || !c) return
    const a = el.getBoundingClientRect()
    const b = c.getBoundingClientRect()
    setTip({ i, x: a.left - b.left + a.width / 2, y: a.top - b.top })
  }
  const mover = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' ? 7 : e.key === 'ArrowLeft' ? -7 : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const j = Math.min(Math.max(i + delta, 0), datos.length - 1)
    setFoco(j)
    caja.current?.querySelector<HTMLElement>(`[data-i="${j}"]`)?.focus()
  }
  return (
    <div ref={caja} className="relative">
      <div className="flex gap-2">
        <div className="t-micro flex flex-col gap-1" aria-hidden>
          {DIAS_CORTOS.map((d, i) => (
            <span key={d} className="grid h-4 place-items-center" style={{ visibility: i % 2 === 0 ? 'visible' : 'hidden' }}>
              {d.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        <div role="grid" aria-label="Constancia de las últimas 12 semanas" className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${semanas}, minmax(0, 1fr))`, gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, var(--space-4))' }}>
          {datos.map((v, i) => (
            <button
              key={i}
              type="button"
              role="gridcell"
              data-i={i}
              tabIndex={i === foco ? 0 : -1}
              aria-label={texto(i)}
              onMouseEnter={() => mostrar(i)}
              onMouseLeave={() => setTip(null)}
              onFocus={() => (setFoco(i), mostrar(i))}
              onBlur={() => setTip(null)}
              onKeyDown={(e) => mover(e, i)}
              className="block r-tag p-0"
              style={{ background: v === null ? 'transparent' : NIVELES[Math.min(v, 3)], border: v === null ? '1px solid var(--line-strong)' : 'none' }}
            />
          ))}
        </div>
      </div>
      {tip && (
        <div role="tooltip" className="tooltip" style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - var(--space-2)))' }}>
          {texto(tip.i)}
        </div>
      )}
    </div>
  )
}
export function LeyendaMapa() {
  return (
    <div className="t-meta flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Leyenda del mapa de constancia">
      <span>Carga del día (series efectivas):</span>
      {NIVELES.map((c, i) => (
        <span key={c} className="inline-flex items-center gap-1">
          <span className="size-3 r-tag" style={{ background: c }} aria-hidden />
          {['0', 'baja', 'media', 'alta'][i]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="size-3 r-tag border border-line-strong" aria-hidden />
        sin datos
      </span>
    </div>
  )
}


/* ======================= Barras (agrupadas o apiladas) ======================= */
/** Id seguro para `url(#…)` a partir de useId */
const idSvg = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '')
/** Relleno de una barra. `contorno`: solo el borde, discontinuo (series de referencia: presupuesto, plan) */
export type RellenoBarra = 'solido' | 'trama' | 'puntos' | 'contorno'
export type SerieBarra = { key: string; nombre: string; color: string; relleno?: RellenoBarra; stackId?: string }
/** Barras desde cero con una o varias series. Con `stackId`, apiladas; con `trama`, rayadas a 45° (histórico, periodo anterior) */
export function Barras({
  datos,
  claveX,
  series,
  alto = 'var(--chart-h)',
  formato,
  formatoEje,
  formatoX,
  tituloTooltip,
  referencias,
  anchoEje = 56,
  soloEnteros = false
}: {
  datos: object[]
  claveX: string
  series: SerieBarra[]
  alto?: string
  formato: (v: number, key: string) => string
  formatoEje?: (v: number) => string
  formatoX?: (v: string | number) => string
  tituloTooltip?: (l: string | number) => string
  referencias?: Referencia[]
  anchoEje?: number
  /** La unidad solo toma valores enteros: sin marcas con decimales en el eje */
  soloEnteros?: boolean
}) {
  const uid = idSvg(useId())
  const ultimaDePila = new Map<string, string>()
  for (const s of series) if (s.stackId) ultimaDePila.set(s.stackId, s.key)
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={MARCA.anillo}>
          <defs>
            {series.map((s, i) =>
              s.relleno === 'trama' ? (
                <pattern key={s.key} id={`${uid}-t${i}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="2.5" height="6" fill={s.color} />
                </pattern>
              ) : s.relleno === 'puntos' ? (
                <pattern key={s.key} id={`${uid}-t${i}`} patternUnits="userSpaceOnUse" width="5" height="5">
                  <circle cx="2.5" cy="2.5" r="1.5" fill={s.color} />
                </pattern>
              ) : null
            )}
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={claveX} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tickMargin={8} minTickGap={8} tickFormatter={formatoX} />
          <YAxis tickLine={false} axisLine={false} width={anchoEje} tickFormatter={formatoEje ?? ((v) => String(v))} domain={[(min: number) => Math.min(0, min), 'auto']} allowDecimals={!soloEnteros} />
          <RTooltip cursor={{ fill: 'var(--interactive)', opacity: 0.5 }} isAnimationActive={false} content={(p: TipProps) => <ChartTip {...p} formato={formato} titulo={tituloTooltip} />} />
          {referencias?.map((r) => (
            <ReferenceLine key={r.texto} y={r.y} ifOverflow="extendDomain" stroke="var(--ref)" strokeWidth={MARCA.linea - 0.5} strokeDasharray={DASH[r.patron ?? 'discontinua']} label={{ value: r.texto, position: r.posicion ?? 'insideTopRight', fill: 'var(--ink-2)', style: { fontSize: 'var(--fs-label)' } }} />
          ))}
          {series.map((s, i) => {
            const arriba = !s.stackId || ultimaDePila.get(s.stackId) === s.key
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.nombre}
                stackId={s.stackId}
                fill={s.relleno === 'contorno' ? 'none' : s.relleno && s.relleno !== 'solido' ? `url(#${uid}-t${i})` : s.color}
                stroke={s.relleno && s.relleno !== 'solido' ? s.color : undefined}
                strokeWidth={s.relleno === 'contorno' ? MARCA.linea : s.relleno && s.relleno !== 'solido' ? 1 : 0}
                strokeDasharray={s.relleno === 'contorno' ? '4 3' : undefined}
                maxBarSize={MARCA.barraMax}
                radius={arriba ? [MARCA.radioBarra, MARCA.radioBarra, 0, 0] : 0}
                isAnimationActive={false}
              />
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ======================= Áreas ======================= */
/** Líneas con relleno suave bajo las series continuas; las de otro patrón (histórico, anterior) van sin relleno */
export function Areas({
  datos,
  claveX,
  series,
  alto = 'var(--chart-h)',
  formato,
  formatoEje,
  formatoX,
  tituloTooltip,
  referencias,
  anchoEje = 56,
  soloEnteros = false
}: {
  datos: object[]
  claveX: string
  series: SerieLinea[]
  alto?: string
  formato: (v: number, key: string) => string
  formatoEje?: (v: number) => string
  formatoX?: (v: string | number) => string
  tituloTooltip?: (l: string | number) => string
  referencias?: Referencia[]
  anchoEje?: number
  /** La unidad solo toma valores enteros: sin marcas con decimales en el eje */
  soloEnteros?: boolean
}) {
  const uid = idSvg(useId())
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${uid}-g${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={claveX} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tickMargin={8} minTickGap={16} tickFormatter={formatoX} />
          <YAxis tickLine={false} axisLine={false} width={anchoEje} tickFormatter={formatoEje ?? ((v) => String(v))} domain={[(min: number) => Math.min(0, min), 'auto']} allowDecimals={!soloEnteros} />
          <RTooltip cursor={cursorLinea} isAnimationActive={false} content={(p: TipProps) => <ChartTip {...p} formato={formato} titulo={tituloTooltip} />} />
          {referencias?.map((r) => (
            <ReferenceLine key={r.texto} y={r.y} ifOverflow="extendDomain" stroke="var(--ref)" strokeWidth={MARCA.linea - 0.5} strokeDasharray={DASH[r.patron ?? 'discontinua']} label={{ value: r.texto, position: r.posicion ?? 'insideTopRight', fill: 'var(--ink-2)', style: { fontSize: 'var(--fs-label)' } }} />
          ))}
          {series.map((s, i) =>
            (s.patron ?? 'solida') === 'solida' ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.nombre} stroke={s.color} strokeWidth={MARCA.linea} fill={`url(#${uid}-g${i})`} connectNulls activeDot={{ r: MARCA.punto, fill: s.color, stroke: 'var(--card)', strokeWidth: MARCA.anillo }} isAnimationActive={false} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.nombre} stroke={s.color} strokeWidth={MARCA.linea} strokeDasharray={DASH[s.patron ?? 'solida']} strokeLinecap="round" connectNulls dot={false} activeDot={{ r: MARCA.punto, fill: s.color, stroke: 'var(--card)', strokeWidth: MARCA.anillo }} isAnimationActive={false} />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ======================= Dispersión ======================= */
export type PuntoDispersion = { x: number; y: number; etiqueta: string }
/** Dispersión de dos series: cada punto es un periodo (o un valor de la dimensión), con su rótulo en el tooltip */
export function Dispersion({
  puntos,
  nombreX,
  nombreY,
  formatoX,
  formatoY,
  formatoEjeX,
  formatoEjeY,
  color = 'var(--accent-mark)',
  alto = 'var(--chart-h)',
  referencias,
  anchoEje = 56,
  soloEnteros = false
}: {
  puntos: PuntoDispersion[]
  nombreX: string
  nombreY: string
  formatoX: (v: number) => string
  formatoY: (v: number) => string
  formatoEjeX?: (v: number) => string
  formatoEjeY?: (v: number) => string
  color?: string
  alto?: string
  referencias?: Referencia[]
  anchoEje?: number
  /** La unidad solo toma valores enteros: sin marcas con decimales en el eje */
  soloEnteros?: boolean
}) {
  const Tip = ({ active, payload }: TipProps) => {
    const p = active ? (payload?.[0]?.payload as PuntoDispersion | undefined) : undefined
    if (!p) return null
    return (
      <div className="elevated pop-in r-control px-3 py-2" style={{ minWidth: '9rem' }}>
        <div className="t-meta mb-1">{p.etiqueta}</div>
        <div className="t-label flex justify-between gap-3">
          <span>{nombreX}</span>
          <span className="tnum font-semibold text-ink">{formatoX(p.x)}</span>
        </div>
        <div className="t-label flex justify-between gap-3">
          <span>{nombreY}</span>
          <span className="tnum font-semibold text-ink">{formatoY(p.y)}</span>
        </div>
      </div>
    )
  }
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" name={nombreX} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tickMargin={8} tickFormatter={formatoEjeX ?? formatoX} domain={['auto', 'auto']} />
          <YAxis type="number" dataKey="y" name={nombreY} tickLine={false} axisLine={false} width={anchoEje} tickFormatter={formatoEjeY ?? formatoY} domain={['auto', 'auto']} />
          <RTooltip cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '2 4' }} isAnimationActive={false} content={(p: TipProps) => <Tip {...p} />} />
          {referencias?.map((r) => (
            <ReferenceLine key={r.texto} y={r.y} ifOverflow="extendDomain" stroke="var(--ref)" strokeWidth={MARCA.linea - 0.5} strokeDasharray={DASH[r.patron ?? 'discontinua']} label={{ value: r.texto, position: r.posicion ?? 'insideTopRight', fill: 'var(--ink-2)', style: { fontSize: 'var(--fs-label)' } }} />
          ))}
          <Scatter data={puntos} name={`${nombreY} frente a ${nombreX}`} fill={color} stroke="var(--card)" strokeWidth={MARCA.anillo} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
