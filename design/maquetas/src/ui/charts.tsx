// Gráficos según la skill dataviz: marcas finas (línea 2 px, barras con 4 px redondeados en el extremo y
// ancladas a la base), rejilla y ejes discretos, leyenda con 2 o más series, etiquetas directas selectivas y
// el texto nunca lleva el color de la serie. Todo con tooltip al pasar el ratón.
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { cx } from '../lib'

/* eslint-disable @typescript-eslint/no-explicit-any */
type TipProps = { active?: boolean; payload?: readonly any[]; label?: string | number }

export type Serie = { key: string; nombre: string; color: string; dash?: string }

/** Tooltip: el valor manda, el nombre acompaña; clave de línea corta en vez de caja */
function ChartTip({ active, payload, label, formato, titulo }: TipProps & { formato: (v: number, key: string) => string; titulo?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null
  const filas = payload.filter((p) => p.value !== null && p.value !== undefined)
  if (!filas.length) return null
  return (
    <div className="pop-in min-w-[140px] rounded-[var(--radius-sm)] border border-line-strong bg-overlay px-3 py-2 shadow-[var(--shadow-2)]">
      {label !== undefined && <div className="mb-1 text-[11px] text-ink-3">{titulo ? titulo(label) : label}</div>}
      <div className="flex flex-col gap-1">
        {filas.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span className="inline-block h-[2px] w-3 rounded-full" style={{ background: p.color ?? p.stroke ?? p.fill }} aria-hidden />
            <span className="text-ink-2">{p.name}</span>
            <span className="tnum ml-auto font-[600] text-ink">{formato(Number(p.value), String(p.dataKey))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
const cursorLinea = { stroke: 'var(--line-strong)', strokeWidth: 1 }

/** Leyenda: obligatoria desde 2 series; clave de línea y texto en tinta */
export function Leyenda({ series, className }: { series: { nombre: string; color: string; dash?: boolean }[]; className?: string }) {
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1', className)} aria-label="Leyenda">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <span className="inline-block h-[2px] w-4 rounded-full" style={{ background: s.dash ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` : s.color }} aria-hidden />
          {s.nombre}
        </li>
      ))}
    </ul>
  )
}

/** Punto final: 8 px con anillo de 2 px del color de la superficie */
const dotFinal = (color: string, anillo: string, total: number) =>
  function DotFinal(p: any) {
    if (p.index !== total - 1) return <g key={p.index} />
    return <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={color} stroke={anillo} strokeWidth={2} />
  }

/* ------------------------------------------------------------------ */
/** Mini gráfico de tendencia: una cifra con contexto, no un gráfico completo */
export function Spark({
  datos,
  color = 'var(--accent-mark)',
  anillo = 'var(--surface-1)',
  alto = 56,
  formato,
  etiquetaX,
  area = true,
  nombre = 'Valor'
}: {
  datos: number[]
  color?: string
  anillo?: string
  alto?: number
  formato: (v: number) => string
  etiquetaX?: (i: number) => string
  area?: boolean
  nombre?: string
}) {
  const d = datos.map((v, i) => ({ i, v }))
  const min = Math.min(...datos)
  const max = Math.max(...datos)
  const pad = (max - min) * 0.15 || 1
  const id = `sp-${color.replace(/\W/g, '')}`
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={d} margin={{ top: 6, right: 6, bottom: 2, left: 6 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min - pad, max + pad]} />
          <XAxis hide dataKey="i" />
          <Tooltip
            cursor={cursorLinea}
            isAnimationActive={false}
            content={(p: TipProps) => <ChartTip {...p} label={etiquetaX && p.payload?.[0] ? etiquetaX(p.payload[0].payload.i) : undefined} formato={(v) => formato(v)} />}
          />
          <Area
            type="monotone"
            dataKey="v"
            name={nombre}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={area ? `url(#${id})` : 'none'}
            dot={dotFinal(color, anillo, d.length)}
            activeDot={{ r: 4, fill: color, stroke: anillo, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/** Columnas con una resaltada (énfasis): la actual en acento, el resto en gris */
export function Columnas({
  datos,
  claveX,
  claveY,
  nombre,
  resaltada,
  colorResaltada = 'var(--accent-mark)',
  colorResto = 'var(--muted-mark)',
  alto = 120,
  formato,
  ejeY,
  claseGrafico,
  etiquetaUltima,
  media
}: {
  datos: any[]
  claveX: string
  claveY: string
  nombre: string
  resaltada: number
  colorResaltada?: string
  colorResto?: string
  alto?: number
  formato: (v: number) => string
  ejeY?: boolean
  claseGrafico?: string
  etiquetaUltima?: boolean
  media?: { valor: number; texto: string }
}) {
  return (
    <div style={{ height: alto }} className={cx('w-full', claseGrafico)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: etiquetaUltima ? 18 : 6, right: 4, bottom: 0, left: ejeY ? 0 : 4 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey={claveX} tickLine={false} axisLine={false} tickMargin={6} interval={0} />
          {ejeY ? <YAxis tickLine={false} axisLine={false} width={34} tickFormatter={(v) => formato(v)} /> : <YAxis hide />}
          <Tooltip
            cursor={{ fill: 'var(--surface-3)', opacity: 0.55 }}
            isAnimationActive={false}
            content={(p: TipProps) => <ChartTip {...p} formato={(v) => formato(v)} />}
          />
          {media && <ReferenceLine y={media.valor} stroke="var(--ink-3)" strokeWidth={1} label={{ value: media.texto, position: 'insideTopRight', fill: 'var(--ink-3)', fontSize: 11 }} />}
          <Bar
            dataKey={claveY}
            name={nombre}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            label={etiquetaUltima ? ((p: any) => (p.index === resaltada ? <text key="l" x={p.x + p.width / 2} y={p.y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--lbl, var(--ink))" className="tnum">{formato(p.value)}</text> : <g key={p.index} />)) : false}
          >
            {datos.map((_, i) => (
              <Cell key={i} fill={i === resaltada ? colorResaltada : colorResto} stroke="none" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
const ultimoDe = (datos: any[], key: string) => {
  for (let i = datos.length - 1; i >= 0; i--) if (datos[i][key] !== null && datos[i][key] !== undefined) return i
  return -1
}

/** Líneas de una o varias series sobre un eje. Con 2 o más series, leyenda arriba y etiqueta directa al final de la primera */
export function Lineas({
  datos,
  claveX,
  series,
  alto = 200,
  formato,
  formatoEje,
  tituloTooltip,
  etiquetaFinal = true,
  referencia,
  dominio,
  ticks
}: {
  datos: any[]
  claveX: string
  series: Serie[]
  alto?: number
  formato: (v: number, key: string) => string
  formatoEje?: (v: number) => string
  tituloTooltip?: (l: string | number) => string
  etiquetaFinal?: boolean
  referencia?: { y: number; texto: string }
  dominio?: [number | 'auto', number | 'auto']
  ticks?: number[]
}) {
  return (
    <div>
      {series.length > 1 && <Leyenda series={series.map((s) => ({ nombre: s.nombre, color: s.color, dash: !!s.dash }))} className="mb-2" />}
      <div style={{ height: alto }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 14, right: etiquetaFinal ? 46 : 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={claveX} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={formatoEje ?? ((v) => String(v))} domain={dominio ?? ['auto', 'auto']} ticks={ticks} />
            <Tooltip cursor={cursorLinea} isAnimationActive={false} content={(p: TipProps) => <ChartTip {...p} formato={formato} titulo={tituloTooltip} />} />
            {referencia && (
              <ReferenceLine y={referencia.y} stroke="var(--ink-3)" strokeWidth={1} label={{ value: referencia.texto, position: 'insideTopLeft', fill: 'var(--ink-2)', fontSize: 11 }} />
            )}
            {series.map((s, si) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.nombre}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                connectNulls
                dot={false}
                activeDot={{ r: 4, fill: s.color, stroke: 'var(--surface-1)', strokeWidth: 2 }}
                isAnimationActive={false}
                label={
                  etiquetaFinal && si === 0
                    ? (p: any) =>
                        p.index === ultimoDe(datos, s.key) ? (
                          <g key="e">
                            <circle cx={p.x} cy={p.y} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
                            <text x={p.x + 10} y={p.y + 4} fontSize={12} fontWeight={600} fill="var(--ink)" className="tnum">
                              {formato(p.value, s.key)}
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
    </div>
  )
}

/* ------------------------------------------------------------------ */
/** Lista de medidores: nombre, barra y cifra en filas alineadas (forma recomendada para ranking de partes) */
export function MedidoresLista({
  filas,
  color = 'var(--accent-mark)',
  formato,
  marcador,
  etiquetaMarcador,
  maximo,
  aviso
}: {
  filas: { nombre: string; valor: number }[]
  color?: string
  formato: (v: number) => string
  marcador?: number
  etiquetaMarcador?: string
  maximo?: number
  aviso?: (v: number) => boolean
}) {
  const max = maximo ?? Math.max(...filas.map((f) => f.valor))
  return (
    <ul className="flex flex-col" style={{ gap: 'calc(var(--density-gap) * 0.55)' }}>
      {filas.map((f) => {
        const baja = aviso?.(f.valor)
        return (
          <li key={f.nombre} className="tip grid grid-cols-[minmax(0,10.5rem)_1fr_auto] items-center gap-3 text-[length:var(--fs-small)]" tabIndex={0} aria-label={`${f.nombre}: ${formato(f.valor)}${baja ? ', por debajo del mínimo' : ''}`}>
            <span className="truncate text-ink-2">{f.nombre}</span>
            <span className="relative h-2 rounded-full bg-track">
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] rounded-l-full" style={{ width: `${(f.valor / max) * 100}%`, background: color }} />
              {marcador !== undefined && <span className="absolute -inset-y-1 w-px bg-ink-3" style={{ left: `${(marcador / max) * 100}%` }} aria-hidden />}
            </span>
            <span className="tnum min-w-[4.5rem] text-right font-[560] text-ink">{formato(f.valor)}</span>
            <span className="tip-box">
              {f.nombre}: {formato(f.valor)}
              {baja ? ' · por debajo del mínimo' : ''}
            </span>
          </li>
        )
      })}
      {marcador !== undefined && etiquetaMarcador && (
        <li className="grid grid-cols-[minmax(0,10.5rem)_1fr_auto] gap-3 text-[length:var(--fs-label)] text-ink-3" aria-hidden>
          <span />
          <span className="relative h-3">
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(marcador / max) * 100}%` }}>
              {etiquetaMarcador}
            </span>
          </span>
          <span className="min-w-[4.5rem]" />
        </li>
      )}
    </ul>
  )
}

/** Barra segmentada fina: un todo repartido en partes junto a sus cifras */
export function BarraSegmentada({ partes, alto = 8 }: { partes: { nombre: string; valor: number; color: string }[]; alto?: number }) {
  const total = partes.reduce((a, p) => a + p.valor, 0)
  return (
    <div className="flex w-full gap-[2px]" style={{ height: alto }} role="img" aria-label={partes.map((p) => `${p.nombre} ${Math.round((p.valor / total) * 100)} %`).join(', ')}>
      {partes.map((p, i) => (
        <span key={p.nombre} style={{ flex: p.valor, background: p.color, borderRadius: i === 0 ? '999px 2px 2px 999px' : i === partes.length - 1 ? '2px 999px 999px 2px' : 2 }} />
      ))}
    </div>
  )
}

/** Mapa de constancia: secuencial de un solo tono, de menos a más */
export function MapaConstancia({ datos, semanas = 12 }: { datos: (number | null)[]; semanas?: number }) {
  const niveles = ['var(--seq-2)', 'var(--seq-4)', 'var(--seq-5)']
  const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  return (
    <div className="flex gap-2" role="img" aria-label="Mapa de constancia de las últimas 12 semanas">
      <div className="flex flex-col gap-[3px] text-[10px] text-ink-3" aria-hidden>
        {dias.map((d, i) => (
          <span key={d} className="grid h-[19px] place-items-center" style={{ visibility: i % 2 === 0 ? 'visible' : 'hidden' }}>
            {d}
          </span>
        ))}
      </div>
      <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${semanas}, minmax(0, 1fr))`, gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 19px)' }}>
        {datos.map((v, i) => (
          <span
            key={i}
            className="rounded-[3px]"
            title={v === null ? 'Sin datos todavía' : v === 0 ? 'Sin entreno' : `Intensidad ${v}`}
            style={{ background: v === null ? 'transparent' : v === 0 ? 'var(--track)' : niveles[Math.min(v, 3) - 1], border: v === null ? '1px solid var(--line)' : 'none' }}
          />
        ))}
      </div>
    </div>
  )
}
export const escalaConstancia = ['var(--track)', 'var(--seq-2)', 'var(--seq-4)', 'var(--seq-5)']

