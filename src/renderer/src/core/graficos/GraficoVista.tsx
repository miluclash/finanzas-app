// Dibuja un gráfico del constructor (`ChartData` de `core:charts.data`). Todo llega calculado del
// proceso principal: aquí solo se elige la forma, el color por función y el formato de las cifras.
//
// - Serie actual: color de la serie (paleta del módulo, 4 colores) por patrón (3): hasta 12 series
//   (el máximo de una división antes de "Otros") sin repetir combinación. Barras: lisa, rayada y
//   punteada; líneas: continua, raya-punto y raya-doble punto.
// - Serie de referencia (`reference`: presupuesto, plan): discontinua en líneas y áreas, solo con
//   borde discontinuo y sin relleno en barras, y con esa misma marca en la leyenda.
// - Periodo anterior: el color de su serie más claro (mezclado al 55 %), punteado en líneas y áreas y
//   rayado en barras (el anterior de una referencia, solo con borde). Rotulado «· periodo anterior».
//   Así presupuesto (discontinuo, color pleno) y periodo anterior (punteado, más claro) no se confunden.
// - "Otros" (división): gris de contexto.
// - Objetivo: línea de referencia discontinua rotulada «Objetivo: …».
// - Estados: cargando, sin datos, error (con reintentar) y «Gráfico no válido · Editar» con el
//   primer aviso tal cual, que nunca rompe el panel.
import { PencilSimple } from '@phosphor-icons/react'
import { keepPreviousData } from '@tanstack/react-query'
import type { ChartSpec, ChartValidationIssue } from '@shared/core/metrics-types'
import type { ChartData, ChartDataSeries } from '@shared/core/charts/types'
import { GROUPING_LABELS } from '@shared/core/charts/labels'
import { useMemo } from 'react'
import { useApi } from '../../lib/api'
import {
  Areas,
  Barras,
  Button,
  ChartFrame,
  Dispersion,
  Lineas,
  StatusBadge,
  cx,
  type ItemLeyenda,
  type Patron,
  type Referencia,
  type RellenoBarra,
  type SerieBarra,
  type SerieLinea,
  type TablaGrafico
} from '../ui'
import { NOMBRE_TOTAL, formatoEje, formatoValor, textoAnterior, textoCambio, textoPeriodo, textoUnidad } from './formato'

const PALETA = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)']
const OTROS = 'var(--muted-mark)'
/** Unidades que solo toman valores enteros: el eje no lleva marcas con decimales. */
const UNIDADES_ENTERAS = new Set<ChartData['unit']>(['sessions', 'days', 'reps', 'm', 'min', 'sets_rpe'])

const TIPO_TEXTO: Record<ChartData['type'], string> = {
  line: 'líneas',
  bar: 'barras',
  area: 'área',
  stacked: 'barras apiladas',
  scatter: 'dispersión',
  table: 'tabla'
}

interface Estilo {
  color: string
  /** Trazo en líneas y áreas. */
  patron: Patron
  /** Relleno en barras. */
  relleno: RellenoBarra
}

const PATRONES_LINEA: Patron[] = ['solida', 'rayapunto', 'rayadoble']
/** El mismo color, más claro: para el periodo anterior. */
const masClaro = (color: string) => `color-mix(in srgb, ${color} 55%, transparent)`
const RELLENOS: RellenoBarra[] = ['solido', 'trama', 'puntos']

/** Color y patrón de cada serie (las anteriores heredan el color de la suya). */
function estilos(series: ChartDataSeries[]): Map<string, Estilo> {
  const out = new Map<string, Estilo>()
  let i = 0
  for (const s of series) {
    if (s.previous) continue
    const otros = s.split === null
    const color = otros ? OTROS : PALETA[i % PALETA.length]
    const vuelta = otros ? 0 : Math.floor(i / PALETA.length) % PATRONES_LINEA.length
    out.set(s.id, s.reference ? { color, patron: 'discontinua', relleno: 'contorno' } : { color, patron: PATRONES_LINEA[vuelta], relleno: RELLENOS[vuelta] })
    if (!otros) i++
  }
  for (const s of series)
    if (s.previous) {
      const base = out.get(s.of!)
      out.set(s.id, { color: masClaro(base?.color ?? OTROS), patron: 'punteada', relleno: base?.relleno === 'contorno' ? 'contorno' : 'trama' })
    }
  return out
}

/**
 * Marcas redondas del eje (1, 2 o 5 por potencia de 10) que cubren `lo`–`hi` con unas 4 divisiones.
 * Las líneas no tienen por qué empezar en cero; las barras sí (lo hace su componente).
 */
export function marcasRedondas(lo: number, hi: number, entero = false): number[] {
  if (lo === hi) {
    const d = Math.abs(lo) * 0.1 || 1
    lo -= d
    hi += d
  }
  const bruto = (hi - lo) / 4
  const p = 10 ** Math.floor(Math.log10(bruto))
  const paso = Math.max(entero ? 1 : 0, [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= bruto) ?? 10 * p)
  const ini = Math.floor(lo / paso) * paso
  const fin = Math.ceil(hi / paso) * paso
  const out: number[] = []
  for (let v = ini; v <= fin + paso / 2; v += paso) out.push(Number(v.toFixed(10)))
  return out
}

/** Gráfico no válido: el primer aviso tal cual y un botón para editarlo. No rompe el panel. */
export function GraficoNoValido({ titulo, issues, onEditar }: { titulo: string; issues: ChartValidationIssue[]; onEditar?: () => void }) {
  return (
    <div role="group" aria-label={`${titulo}: gráfico no válido`} className="flex flex-col items-start gap-3">
      <div className="t-label font-semibold text-ink">{titulo}</div>
      <StatusBadge tono="warning">Gráfico no válido</StatusBadge>
      <p className="t-label text-ink-2">
        {issues[0]?.message ?? 'La configuración del gráfico no es válida.'}
        {issues.length > 1 && <span className="text-ink-3"> ({issues.length - 1} {issues.length === 2 ? 'aviso más' : 'avisos más'})</span>}
      </p>
      {onEditar && (
        <Button size="sm" onClick={onEditar} icon={<PencilSimple size={14} />}>
          Editar
        </Button>
      )}
    </div>
  )
}

export interface GraficoVistaProps {
  /** Gráfico guardado (por id) o especificación sin guardar (vista previa del constructor). */
  chartId?: number
  spec?: ChartSpec
  titulo: string
  alto?: string
  /** Muestra «Editar» en el estado de gráfico no válido. */
  onEditar?: () => void
  className?: string
}

/** Pide los datos al proceso principal y dibuja el gráfico (o su estado). */
export function GraficoVista({ chartId, spec, titulo, alto, onEditar, className }: GraficoVistaProps) {
  const arg = (chartId ?? spec) as number | ChartSpec
  const q = useApi('core:charts.data', [arg], { placeholderData: keepPreviousData, enabled: arg !== undefined })
  const estado = q.isPending ? 'cargando' : q.isError ? 'error' : null
  return (
    <div className={cx('min-w-0', className)} aria-busy={q.isFetching || undefined}>
      {estado && <ChartFrame titulo={titulo} periodo="—" unidad="—" estado={estado} onReintentar={() => q.refetch()} alto={alto} />}
      {q.data && !q.data.ok && <GraficoNoValido titulo={titulo} issues={q.data.issues} onEditar={onEditar} />}
      {q.data?.ok && <GraficoDatos data={q.data.data} titulo={titulo} alto={alto} />}
    </div>
  )
}

/** Dibuja unos datos ya calculados. */
export function GraficoDatos({ data, titulo, alto = 'var(--chart-h)' }: { data: ChartData; titulo: string; alto?: string }) {
  const fmt = (v: number) => formatoValor(data.unit, v)
  const fmtEje = (v: number) => formatoEje(data.unit, v)
  const est = useMemo(() => estilos(data.series), [data.series])
  const porClave = useMemo(() => new Map(data.points.map((p) => [p.key, p])), [data.points])
  const filas = useMemo(() => data.points.map((p) => ({ _k: p.key, ...p.values })), [data.points])
  const actuales = data.series.filter((s) => !s.previous)
  const anteriores = data.series.filter((s) => s.previous)

  const formatoX = (k: string | number) => porClave.get(String(k))?.label ?? String(k)
  const tituloTooltip = (k: string | number) => {
    const p = porClave.get(String(k))
    if (!p) return String(k)
    return p.prevLongLabel ? `${p.longLabel} · anterior: ${p.prevLongLabel}` : p.longLabel
  }
  const referencias: Referencia[] = data.target !== null ? [{ y: data.target, texto: `Objetivo: ${fmt(data.target)}`, patron: 'discontinua', posicion: 'insideTopRight' }] : []

  // Leyenda: series (con su patrón) y objetivo.
  const barras = data.type === 'bar' || data.type === 'stacked'
  // Con división y periodo anterior, las anteriores se resumen en una sola entrada de la leyenda.
  const resumirAnteriores = !!data.splitBy && anteriores.length > 0
  const leyenda: ItemLeyenda[] = [
    ...(resumirAnteriores ? actuales : data.series).map((s) => {
      const e = est.get(s.id)!
      return { nombre: s.label, color: e.color, patron: barras ? (e.relleno === 'solido' ? ('barra' as const) : e.relleno) : e.patron }
    }),
    ...(resumirAnteriores ? [{ nombre: 'Periodo anterior (mismos colores, más claros y ' + (barras ? 'rayados)' : 'punteados)'), color: OTROS, patron: barras ? ('trama' as const) : ('punteada' as const) }] : []),
    ...referencias.map((r) => ({ nombre: r.texto, color: 'var(--ref)', patron: 'discontinua' as const }))
  ]

  // Referencia para interpretar: total con su agregación y cambio frente al periodo anterior.
  const partes: string[] = []
  if (data.type !== 'scatter') {
    if (data.splitBy) {
      const agg = actuales[0]?.aggregation
      if (agg === 'sum') {
        const tot = actuales.reduce((a, s) => a + (s.total ?? 0), 0)
        const ant = anteriores.length ? anteriores.reduce((a, s) => a + (s.total ?? 0), 0) : null
        const cambio = textoCambio(tot, ant)
        partes.push(`Total: ${fmt(tot)}${ant !== null ? ` · periodo anterior: ${fmt(ant)}${cambio ? ` (${cambio})` : ''}` : ''}`)
      }
    } else
      for (const s of actuales.slice(0, 2)) {
        const ant = anteriores.find((p) => p.of === s.id)
        const cambio = ant ? textoCambio(s.total, ant.total) : null
        const nombre = actuales.length > 1 ? `${s.label}: ` : ''
        partes.push(`${nombre}${NOMBRE_TOTAL[s.aggregation]}: ${fmt(s.total ?? Number.NaN)}${ant ? ` · periodo anterior: ${fmt(ant.total ?? Number.NaN)}${cambio ? ` (${cambio})` : ''}` : ''}`)
      }
  }
  partes.push(...data.notes)
  const referencia = partes.join('. ') || undefined

  const periodo = textoPeriodo(data.range, data.groupBy) + (data.previous ? ` · comparado con ${textoAnterior(data.previous, data.previousFullMonths)}` : '')
  const tabla: TablaGrafico = {
    columnas: [GROUPING_LABELS[data.groupBy].replace(/^./, (c) => c.toUpperCase()), ...data.table.columns.map((c) => c.label)],
    filas: [
      ...data.table.rows.map((r) => [r.label, ...r.cells.map((c) => formatoValor(data.unit, c))]),
      ['Total', ...data.table.totals.map((t, i) => (t === null ? '—' : `${formatoValor(data.unit, t)}${data.series[i] && data.series[i].aggregation !== 'sum' ? ` (${NOMBRE_TOTAL[data.series[i].aggregation].toLowerCase()})` : ''}`))]
    ]
  }
  const descripcion = `${titulo}. Gráfico de ${TIPO_TEXTO[data.type]}. ${periodo}. ${textoUnidad(data.unit)}.${referencia ? ` ${referencia}.` : ''}`

  let cuerpo: React.ReactNode
  if (data.type === 'table') cuerpo = <TablaDatos tabla={tabla} titulo={titulo} />
  else if (data.type === 'scatter' && data.scatter)
    cuerpo = (
      <Dispersion
        puntos={data.scatter.points.map((p) => ({ x: p.x, y: p.y, etiqueta: p.longLabel }))}
        nombreX={data.scatter.x.label}
        nombreY={data.scatter.y.label}
        formatoX={fmt}
        formatoY={fmt}
        formatoEjeX={fmtEje}
        formatoEjeY={fmtEje}
        color={est.get(data.scatter.y.id)?.color}
        alto={alto}
        referencias={referencias}
      />
    )
  else if (barras) {
    const series: SerieBarra[] = data.series.map((s) => {
      const e = est.get(s.id)!
      return { key: s.id, nombre: s.label, color: e.color, relleno: e.relleno, stackId: data.type === 'stacked' ? s.stackId : undefined }
    })
    cuerpo = <Barras datos={filas} claveX="_k" series={series} alto={alto} formato={fmt} formatoEje={fmtEje} formatoX={formatoX} tituloTooltip={tituloTooltip} referencias={referencias} soloEnteros={UNIDADES_ENTERAS.has(data.unit)} />
  } else {
    const series: SerieLinea[] = data.series.map((s) => {
      const e = est.get(s.id)!
      return { key: s.id, nombre: s.label, color: e.color, patron: e.patron, marcadorFinal: s.previous ? 'hueco' : 'relleno' }
    })
    if (data.type === 'area')
      cuerpo = <Areas datos={filas} claveX="_k" series={series} alto={alto} formato={fmt} formatoEje={fmtEje} formatoX={formatoX} tituloTooltip={tituloTooltip} referencias={referencias} soloEnteros={UNIDADES_ENTERAS.has(data.unit)} />
    else {
      // Dominio que incluye el objetivo (si no, la línea de referencia se saldría del dibujo).
      const valores = filas.flatMap((f) => data.series.map((s) => (f as Record<string, unknown>)[s.id])).filter((v): v is number => typeof v === 'number')
      if (data.target !== null) valores.push(data.target)
      const marcas = valores.length ? marcasRedondas(Math.min(...valores), Math.max(...valores), UNIDADES_ENTERAS.has(data.unit)) : undefined
      cuerpo = (
        <Lineas
          datos={filas}
          claveX="_k"
          series={series}
          alto={alto}
          formato={fmt}
          formatoEje={fmtEje}
          formatoX={formatoX}
          tituloTooltip={tituloTooltip}
          referencias={referencias}
          dominio={marcas ? [marcas[0], marcas[marcas.length - 1]] : undefined}
          ticks={marcas}
          etiquetaFinal={actuales.length === 1}
          formatoFinal={(v) => fmt(v)}
          anchoEje={56}
          margenFinal={72}
        />
      )
    }
  }

  return (
    <ChartFrame
      titulo={titulo}
      periodo={periodo}
      unidad={textoUnidad(data.unit)}
      referencia={referencia}
      leyenda={data.type === 'table' || data.type === 'scatter' ? undefined : leyenda}
      estado={data.empty ? 'vacio' : 'ok'}
      tabla={data.type === 'table' ? undefined : tabla}
      descripcion={descripcion}
      alto={alto}
    >
      {cuerpo}
    </ChartFrame>
  )
}

/** Tabla de datos del gráfico (tipo tabla): cifras tabulares a la derecha y fila de totales. */
function TablaDatos({ tabla, titulo }: { tabla: TablaGrafico; titulo: string }) {
  const ultima = tabla.filas.length - 1
  return (
    <div className="max-h-96 overflow-auto" tabIndex={0} role="region" aria-label={`Tabla: ${titulo}`}>
      <table className="w-full t-label tnum">
        <caption className="sr-only">{titulo}</caption>
        <thead className="sticky top-0 bg-card">
          <tr>
            {tabla.columnas.map((c, i) => (
              <th key={i} scope="col" className={cx('py-2 font-semibold text-ink-2', i === 0 ? 'text-left' : 'pl-4 text-right')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f, i) => (
            <tr key={i} className={cx('border-t', i === ultima ? 'border-line-strong font-semibold' : 'border-line')}>
              {f.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className={cx('py-2 text-left font-normal', i === ultima ? 'font-semibold text-ink' : 'text-ink-2')}>
                    {c}
                  </th>
                ) : (
                  <td key={j} className="py-2 pl-4 text-right text-ink">
                    {c}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

