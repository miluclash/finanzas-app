// Progreso de un objetivo: lo observado, la proyección (línea discontinua, con su rótulo), la referencia del objetivo y
// el texto de estimación. Lo comparten el Resumen y la página de Objetivos. No calcula nada: pinta lo que devuelve metrics.goals().
import { CalendarStar, CheckCircle, ChartLineUp } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { addDays, diffDays, formatDate } from '@shared/dates'
import type { GoalView } from '@shared/modules/entreno/metrics/views'
import type { GoalUnit } from '@shared/modules/entreno/metrics/goals'
import { Aviso, Button, ChartFrame, CifraUnidad, leyendaDe, Lineas, ProgressBar, StatusBadge, type Referencia, type SerieLinea } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { fechaCorta, formatKg, formatNum, formatNum1, formatPorcentaje, KIND_LABEL } from './format'

const UNIDAD_CORTA: Record<GoalUnit, string> = { kg: 'kg', series: 'series', reps: 'reps', sesiones: 'sesiones', dias: 'días' }
const unidadDe = (g: GoalView) => (g.unit ? UNIDAD_CORTA[g.unit] : '')
const conUnidad = (g: GoalView, v: number | null) => (v === null ? '—' : `${formatNum1(v)} ${unidadDe(g)}`.trim())

/** «Press banca: e1RM de 120 kg antes del 31/01/2027» */
export function describirVista(g: GoalView): string {
  const limite = g.deadline ? ` antes del ${formatDate(g.deadline)}` : ''
  switch (g.type) {
    case 'E1RM':
      return `${g.exerciseTitle ?? 'Ejercicio'}: e1RM de ${formatKg(g.target)}${limite}`
    case 'WEIGHT_REPS':
      return `${g.exerciseTitle ?? 'Ejercicio'}: ${formatKg(g.target)} × ${formatNum(g.targetReps)} repeticiones${limite}`
    case 'WEEKLY_VOLUME':
      return g.groupId !== null ? `${g.groupName}: ${formatNum(g.target)} series efectivas por semana${limite}` : `${g.exerciseTitle}: ${formatNum(g.target)} kg por semana${limite}`
    case 'FREQUENCY':
      return g.kind !== null ? `${KIND_LABEL[g.kind]}: ${formatNum(g.target)} sesiones por semana${limite}` : `${g.groupName}: ${formatNum(g.target)} días por semana${limite}`
    case 'EVENT':
      return g.countdown ? `Evento el ${formatDate(g.countdown.date)}` : 'Evento'
  }
}

/** Qué se dibuja: semanas desde la primera observada hasta la fecha límite (o la última observada), con la tendencia interpolada. */
function datosGrafico(g: GoalView) {
  if (g.series.length === 0) return []
  const obs = new Map(g.series.map((p) => [p.weekKey, p.value]))
  const pr = g.projection
  const primera = g.series[0].weekKey
  const ultima = g.series[g.series.length - 1].weekKey
  const a = pr?.line[0]
  const b = pr?.line[pr.line.length - 1]
  const inicio = a && a.date < primera ? a.date : primera
  const fin = b && b.date > ultima ? b.date : ultima
  const claves: string[] = []
  for (let d = inicio, i = 0; d <= fin && i < 90; d = addDays(d, 7), i++) claves.push(d)
  if (claves[claves.length - 1] !== fin) claves.push(fin)
  return claves.map((k) => {
    let proy: number | null = null
    if (a && b && k >= a.date && k <= b.date) {
      const total = diffDays(b.date, a.date)
      proy = total === 0 ? b.value : Math.round((a.value + ((b.value - a.value) * diffDays(k, a.date)) / total) * 100) / 100
    }
    return { x: k, obs: obs.get(k) ?? null, proy }
  })
}

/** Eje Y con marcas redondas (1, 2, 2,5, 5 × 10ⁿ) que cubren de `lo` a `hi` */
function ejeBonito(lo: number, hi: number): { dominio: [number, number]; ticks: number[] } {
  const bruto = Math.max(hi - lo, 1) / 3
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const f = bruto / pot
  const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pot
  const min = Math.max(0, Math.floor(lo / paso) * paso)
  const max = Math.ceil(hi / paso) * paso
  const ticks: number[] = []
  for (let v = min; v <= max + paso / 2; v += paso) ticks.push(Math.round(v * 100) / 100)
  return { dominio: [min, max], ticks }
}

const TEXTO_RAZON: Record<NonNullable<GoalView['projectionReason']>, string> = {
  'pocos-datos': 'Faltan datos para proyectar: hacen falta al menos 3 semanas con datos.',
  'sin-fecha-limite': 'Pon una fecha límite al objetivo para ver la proyección.',
  'fecha-pasada': 'La fecha límite ya ha pasado: no se proyecta.'
}

/** Proyección escrita como estimación: «Proyección: 104,1 kg el 31 ene». Con su razón si no hay. */
export function TextoProyeccion({ g, breve }: { g: GoalView; breve?: boolean }) {
  if (g.projection)
    return (
      <p className="t-label">
        Proyección:  <b className="font-semibold text-ink">{conUnidad(g, g.projection.value)}</b> el {fechaCorta(g.projection.date)}
      </p>
    )
  // En la lista compacta, no repetir en cada objetivo que falta la fecha límite
  if (g.projectionReason && !(breve && g.projectionReason === 'sin-fecha-limite')) return <p className="t-label">{TEXTO_RAZON[g.projectionReason]}</p>
  return null
}

/** Cómo queda la proyección frente al objetivo. Con icono y texto, y siempre como estimación. */
function EstadoProyeccion({ g }: { g: GoalView }) {
  if (!g.projection || g.target === null) return null
  const falta = g.target - g.projection.value
  if (falta <= 0)
    return (
      <StatusBadge tono="success">
        Proyección por encima del objetivo
      </StatusBadge>
    )
  return (
    <StatusBadge tono="warning">
      Proyección por debajo del objetivo: faltarían {formatNum1(falta)} {unidadDe(g)}
    </StatusBadge>
  )
}

export type ModoObjetivo = 'completo' | 'tarjeta' | 'compacto'

/**
 * `completo`: observado en grande, proyección, gráfico y barra (primer objetivo del Resumen).
 * `tarjeta`: lo mismo en pequeño (página de Objetivos). `compacto`: solo barra y texto (resto del Resumen).
 */
export function ObjetivoDetalle({ g, modo = 'completo', ocultarNombre }: { g: GoalView; modo?: ModoObjetivo; ocultarNombre?: boolean }) {
  const marcar = useApiMutation('entreno:goals.setStatus', { success: 'Objetivo marcado como conseguido' })
  const datos = useMemo(() => datosGrafico(g), [g])

  if (g.type === 'EVENT') return <EventoObjetivo g={g} sinTexto={modo === 'tarjeta'} ocultarNombre={ocultarNombre} />

  const series: SerieLinea[] = [
    { key: 'obs', nombre: 'Observado (semanal)', color: 'var(--series-1)', patron: 'solida' },
    ...(g.projection ? [{ key: 'proy', nombre: 'Proyección', color: 'var(--series-1)', patron: 'discontinua' as const, marcadorFinal: 'hueco' as const }] : [])
  ]
  const refs: Referencia[] = g.target !== null ? [{ y: g.target, texto: `Objetivo ${formatNum1(g.target)} ${unidadDe(g)}`.trim(), patron: 'punteada' }] : []
  const valores = [...g.series.map((p) => p.value), ...(g.projection ? g.projection.line.map((p) => p.value) : []), ...(g.target !== null ? [g.target] : [])]
  const lo = Math.min(...valores)
  const hi = Math.max(...valores)
  const pad = (hi - lo) * 0.15 || hi * 0.1 || 1
  const { dominio, ticks } = ejeBonito(lo - pad, hi + pad)
  const sinDatos = g.series.length === 0

  // En la tarjeta de la página de Objetivos el nombre y la descripción ya están encima
  const cabecera =
    modo === 'tarjeta' ? null : (
      <>
        {!ocultarNombre && <div className="t-body font-semibold">{g.name}</div>}
        <div className="t-label">{describirVista(g)}</div>
      </>
    )

  const alcanzado =
    g.achieved &&
    (modo === 'tarjeta' ? (
      <StatusBadge tono="success">Objetivo alcanzado: ya puedes marcarlo como conseguido</StatusBadge>
    ) : (
    <Aviso tono="success">
      <div>Has alcanzado el objetivo. Si quieres, márcalo como conseguido y pasa a la lista de conseguidos.</div>
      <div>
        <Button size="sm" variant="primary" icon={<CheckCircle size={16} aria-hidden />} cargando={marcar.isPending} onClick={() => marcar.mutate([g.goalId, 'ACHIEVED'])} aria-label={`Marcar como conseguido: ${g.name}`}>
          Marcar como conseguido
        </Button>
      </div>
    </Aviso>
    ))

  if (modo === 'compacto')
    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="t-label">{ocultarNombre ? describirVista(g) : g.name}</span>
          <span className="t-label tnum">Observado {conUnidad(g, g.current)}</span>
        </div>
        {g.pct !== null && <ProgressBar className="mt-2" tone={g.achieved ? 'success' : 'accent'} value={g.pct} label={`Observado frente al objetivo: ${g.name}`} valueText={`${conUnidad(g, g.current)} de ${conUnidad(g, g.target)}, el ${formatPorcentaje(g.pct)}`} />}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <TextoProyeccion g={g} breve />
          <EstadoProyeccion g={g} />
        </div>
        {alcanzado && <div className="mt-2">{alcanzado}</div>}
      </div>
    )

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {cabecera}
          {!sinDatos && (
            <div className={modo === 'completo' ? 't-kpi mt-1' : 't-body mt-1 font-semibold'}>
              {modo === 'completo' ? <CifraUnidad valor={formatNum1(g.current)} unidad={`${unidadDe(g)} observado`} /> : <span className="tnum">Observado: {conUnidad(g, g.current)}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-1 @3xl:items-end">
          <TextoProyeccion g={g} />
          <EstadoProyeccion g={g} />
        </div>
      </div>
      {g.pct !== null && !sinDatos && (
        <div className="mt-3">
          <ProgressBar tone={g.achieved ? 'success' : 'accent'} value={g.pct} label={`Observado frente al objetivo: ${g.name}`} valueText={`${conUnidad(g, g.current)} de ${conUnidad(g, g.target)}, el ${formatPorcentaje(g.pct)}`} />
          <p className="t-meta mt-1">
            {formatPorcentaje(g.pct)} del objetivo ({conUnidad(g, g.current)} de {conUnidad(g, g.target)})
          </p>
        </div>
      )}
      {sinDatos ? (
        <p className="t-label mt-3 flex items-start gap-2">
          <ChartLineUp size={18} aria-hidden className="mt-px shrink-0 text-ink-3" />
          Todavía no hay sesiones que cuenten para este objetivo. El gráfico aparecerá cuando las haya.
        </p>
      ) : (
        <div className="mt-4">
          <ChartFrame
            titulo={`${g.name}: evolución semanal`}
            periodo={`Semanas con datos desde el ${fechaCorta(g.series[0].weekKey)}${g.projection ? `; proyección hasta el ${fechaCorta(g.projection.date)}` : ''}`}
            unidad={g.type === 'E1RM' ? 'kg (1RM estimado)' : unidadDe(g)}
            referencia={g.projection ? `Proyección al ritmo de las últimas semanas con datos (${g.projection.slopePerWeek >= 0 ? '+' : '−'}${formatNum1(Math.abs(g.projection.slopePerWeek))} ${unidadDe(g)} por semana). Es una estimación, no una promesa.` : undefined}
            leyenda={leyendaDe(series, refs)}
            tabla={{ columnas: ['Semana', `Observado (${unidadDe(g)})`], filas: g.series.map((p) => [fechaCorta(p.weekKey), formatNum1(p.value)]) }}
          >
            <Lineas datos={datos} claveX="x" series={series} referencias={refs} formato={(v) => conUnidad(g, v)} formatoX={(v) => fechaCorta(String(v))} tituloTooltip={(l) => `Semana del ${fechaCorta(String(l))}`} etiquetaFinal={false} dominio={dominio} ticks={ticks} formatoEje={(v) => formatNum1(v)} alto={modo === 'tarjeta' ? 'var(--chart-h-sm)' : undefined} />
          </ChartFrame>
        </div>
      )}
      {alcanzado && <div className="mt-3">{alcanzado}</div>}
    </div>
  )
}

function EventoObjetivo({ g, ocultarNombre, sinTexto }: { g: GoalView; ocultarNombre?: boolean; sinTexto?: boolean }) {
  const c = g.countdown
  return (
    <div>
      {!ocultarNombre && !sinTexto && <div className="t-body font-semibold">{g.name}</div>}
      {!sinTexto && <div className="t-label">{describirVista(g)}</div>}
      {c ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div className="t-kpi">
            <CifraUnidad valor={String(Math.max(c.daysLeft, 0))} unidad={c.daysLeft === 1 ? 'día' : 'días'} />
          </div>
          <p className="t-label flex items-center gap-2">
            <CalendarStar size={16} aria-hidden />
            {c.isPast ? 'El evento ya ha pasado' : c.daysLeft === 0 ? 'Es hoy' : `Quedan ${c.weeksLeft} ${c.weeksLeft === 1 ? 'semana' : 'semanas'} de entrenamiento`}
          </p>
        </div>
      ) : (
        <p className="t-label mt-2">El evento ya no existe.</p>
      )}
    </div>
  )
}

/** Todos los objetivos con su progreso. Una sola petición compartida por quien la use. */
export function useObjetivosVista() {
  return useApi('entreno:metrics.goals', [])
}
