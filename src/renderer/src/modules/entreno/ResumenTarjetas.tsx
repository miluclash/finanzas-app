// Tarjetas del Resumen de Entreno. Solo pintan lo que devuelve `entreno:metrics.summary`: no calculan nada.
import { ArrowDown, ArrowUp, Barbell, CalendarCheck, Flag, Lightning, Medal, Target, Timer, Trophy } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { formatDate } from '@shared/dates'
import type { EntrenoSummary } from '@shared/modules/entreno/metrics/views'
import type { StationStats } from '@shared/modules/entreno/metrics/event'
import type { NextSession } from '@shared/modules/entreno/metrics/plan'
import { WORKOUT_KINDS, type WorkoutKind } from '@shared/modules/entreno/types'
import { BarraSegmentada, Card, ChartFrame, CifraUnidad, Columnas, EmptyState, LeyendaMapa, LeyendaSemana, MapaConstancia, MedidoresLista, ProgressBar, Tag, WeekSessionCell, type EstadoSesion, type EstadoFila } from '../../core/ui'
import { textoComparacionVolumen, sinVolumenPrevio, anteriorRecord, cuando, fechaCorta, fechaDe, formatCambio, formatDistancia, formatDuracion, formatEntero, formatKg, formatNum, formatNum1, formatPorcentaje, formatTiempo, HYROX_STATION_LABEL, KIND_LABEL, marcaRecord, nombreRecord } from './format'
import { ObjetivoDetalle } from './ObjetivoDetalle'
import { KIND_ICON } from './Piezas'

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const TIPO_PLURAL: Record<WorkoutKind, string> = { GYM: 'Gimnasio', SWIM: 'Natación', HYROX: 'HYROX', RUN: 'Carrera', OTHER: 'Otro' }

/* ======================= Semana ======================= */
export function SemanaCard({ s }: { s: EntrenoSummary }) {
  const w = s.week
  const huecos = w.slots
  const hechos = huecos.filter((x) => x.doneWorkoutId !== null).length
  const sesiones = w.days.flatMap((d) => d.workouts)
  const extra = Math.max(0, sesiones.length - hechos)
  const porTipo = WORKOUT_KINDS.map((k) => ({ k, previstas: huecos.filter((x) => x.kind === k).length, hechas: huecos.filter((x) => x.kind === k && x.doneWorkoutId !== null).length })).filter((t) => t.previstas > 0)
  // Semana: las 4 semanas completas anteriores a la actual (la última de la lista es la actual); cada una ya viene acotada al 100 %.
  // Mes o bloque: sus semanas. Las que no tienen nada previsto no cuentan.
  const esSemana = s.range.period === 'week'
  const consideradas = (esSemana ? s.adherence.weeks.slice(0, -1) : s.adherence.weeks).filter((x) => x.planned > 0)
  const previstas = consideradas.reduce((a, x) => a + x.planned, 0)
  const pct = previstas > 0 ? consideradas.reduce((a, x) => a + x.done, 0) / previstas : null
  const etiqueta = pct === null ? 'Sin plan en esas semanas' : `${esSemana ? 'Últimas 4 semanas' : s.range.period === 'month' ? 'Semanas del mes' : 'Semanas del bloque'}: ${formatPorcentaje(pct)}`

  return (
    <Card
      titulo="Semana"
      subtitulo="Cumplimiento"
      icono={<CalendarCheck size={20} weight="duotone" aria-hidden />}
      accion={<Tag title="Sesiones hechas frente a las previstas, semana a semana. Una semana no compensa a otra.">{etiqueta}</Tag>}
      className="flex h-full flex-col"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {huecos.length > 0 ? (
          <>
            <div className="t-kpi">
              <CifraUnidad valor={`${hechos} de ${huecos.length}`} unidad={huecos.length === 1 ? 'sesión hecha' : 'sesiones hechas'} />
            </div>
            <p className="t-label">
              {porTipo.map((t, i) => (
                <span key={t.k}>
                  {i > 0 && ' · '}
                  {TIPO_PLURAL[t.k]} {t.hechas} de {t.previstas}
                </span>
              ))}
              {extra > 0 && ` · ${extra} ${extra === 1 ? 'sesión más' : 'sesiones más'} fuera del plan`}
            </p>
          </>
        ) : (
          <>
            <div className="t-kpi">
              <CifraUnidad valor={String(sesiones.length)} unidad={sesiones.length === 1 ? 'sesión hecha' : 'sesiones hechas'} />
            </div>
            <p className="t-label">
              Esta semana no tienes nada planificado. Crea tu semana base en <Link to="/entreno/plan?vista=boceto" className="font-semibold text-accent-text hover:underline">Plan</Link> y aquí verás lo que te toca.
            </p>
          </>
        )}
      </div>
      <ol className="mt-4 grid grid-cols-4 gap-2 @3xl:grid-cols-7" aria-label={`Semana del ${formatDate(w.weekStart)} al ${formatDate(w.weekEnd)}`}>
        {w.days.map((d) => {
          const hecho = d.status === 'hecha'
          const kind: WorkoutKind | null = hecho ? (d.workouts[0]?.kind ?? null) : (d.slots[0]?.kind ?? null)
          const nombre = hecho ? (d.workouts[0]?.title ?? 'Sesión') : d.slots[0] ? d.slots[0].routineName : d.status === 'descanso' || w.source !== 'ninguno' ? '' : 'Sin plan'
          const n = hecho ? d.workouts.length : d.slots.length
          return <WeekSessionCell key={d.date} dia={`${DIAS_CORTOS[d.weekday - 1]} ${Number(d.date.slice(8))}`} icono={kind ? KIND_ICON[kind] : undefined} estado={d.status as EstadoSesion} nombre={nombre} extra={n > 1 ? `+${n - 1}` : undefined} />
        })}
      </ol>
      <div className="mt-4">
        <LeyendaSemana />
      </div>
    </Card>
  )
}

/* ======================= Próxima sesión ======================= */
/** La usan el Resumen y el Inicio: sus datos no dependen del periodo. */
export function ProximaCard({ n, today }: { n: NextSession | null; today: string }) {
  const I = n ? KIND_ICON[n.kind ?? 'OTHER'] : Timer
  return (
    <Card titulo="Próxima sesión" icono={<Timer size={20} weight="duotone" aria-hidden />} className="flex h-full flex-col">
      {n ? (
        <>
          <div className="t-kpi">{n.routineName || 'Sesión'}</div>
          <p className="t-label mt-2">{cuando(n.date, today, n.time)}</p>
          <p className="t-meta mt-1 flex items-center gap-1">
            <I size={14} aria-hidden /> {n.kind ? KIND_LABEL[n.kind] : 'Tipo de entreno borrado'}
            {n.isToday && ' · es hoy'}
          </p>
          <div className="mt-auto pt-4">
            <Link to="/entreno/plan" className="btn btn-secondary w-full">
              Ver el plan
            </Link>
          </div>
        </>
      ) : (
        <EmptyState compacto icono={<Timer size={20} aria-hidden />} titulo="Nada previsto" texto="Crea tu semana base en Plan y aquí verás la siguiente sesión." accion={<Link to="/entreno/plan?vista=boceto" className="btn btn-secondary btn-sm">Ir a Plan</Link>} />
      )}
    </Card>
  )
}

/* ======================= Volumen ======================= */
export function VolumenCard({ s }: { s: EntrenoSummary }) {
  const v = s.volume
  const esSemana = s.range.period === 'week'
  const vacio = v.weeks.every((x) => x.loadKg === 0)
  const kg = esSemana ? v.current.loadKg : s.totals.loadKg
  const hasta = Math.max(0, v.weeks.findIndex((x) => x.isCurrent))
  const resaltada = v.weeks.some((x) => x.isCurrent) ? hasta : v.weeks.length - 1
  const descargas = v.weeks.map((x, i) => ({ i, texto: 'Descarga', d: x.isDeload })).filter((x) => x.d)
  const rotulo = (x: { isoWeek: number }) => `S${x.isoWeek}`
  const ch = v.changePct
  return (
    <Card hero titulo="Volumen semanal" subtitulo="kg de volumen de entrenamiento" icono={<Barbell size={20} weight="fill" aria-hidden />} className="flex h-full flex-col">
      {vacio ? (
        <EmptyState compacto icono={<Barbell size={20} aria-hidden />} titulo="Todavía no hay volumen" texto="Aparecerá cuando registres series con peso. Los calentamientos no cuentan." />
      ) : (
        <>
          <div className="t-kpi-hero">
            <CifraUnidad valor={formatEntero(kg)} unidad={esSemana ? 'kg' : 'kg en el periodo'} />
          </div>
          {esSemana && (
            <p className="t-label mt-2 flex flex-wrap items-center gap-2" style={{ color: 'var(--hero-ink-2)' }}>
              {ch !== null ? (
                <>
                  <span className="inline-flex items-center gap-1 r-full px-2 font-semibold" style={{ background: 'var(--hero-ink)', color: 'var(--hero-bg)' }}>
                    {ch >= 0 ? <ArrowUp size={14} weight="bold" aria-hidden /> : <ArrowDown size={14} weight="bold" aria-hidden />}
                    {formatCambio(ch)}
                  </span>
                  <span>{textoComparacionVolumen(v.comparison, v.previousLoadKg, v.previousToDate)}</span>
                </>
              ) : (
                <span>{v.previous || v.comparison === 'same-days' ? sinVolumenPrevio(v.comparison) : 'Aún no hay una semana anterior con la que comparar.'}</span>
              )}
            </p>
          )}
          <div className="mt-4">
            <ChartFrame
              hero
              titulo="Volumen semanal"
              periodo={`Últimas ${v.weeks.length} semanas, ${rotulo(v.weeks[0])} a ${rotulo(v.weeks[v.weeks.length - 1])}`}
              unidad="kg de volumen de entrenamiento (peso × repeticiones)"
              referencia={`${descargas.length ? `${descargas.map((d) => rotulo(v.weeks[d.i])).join(' y ')} ${descargas.length === 1 ? 'fue una semana' : 'fueron semanas'} de descarga (barra con trama). ` : ''}La barra resaltada es ${esSemana ? 'la semana en curso, todavía incompleta' : 'la última semana del periodo'}.${s.totals.bodyweightReps > 0 ? ` Además, ${formatEntero(s.totals.bodyweightReps)} repeticiones de peso corporal, que no suman kg.` : ''}`}
              tabla={{ columnas: ['Semana', 'Volumen (kg)', 'Series', 'Sesiones'], filas: v.weeks.map((x) => [`${rotulo(x)} · ${fechaCorta(x.weekKey)}${x.isDeload ? ' (descarga)' : ''}`, formatEntero(x.loadKg), x.sets, x.sessions]) }}
            >
              <Columnas datos={v.weeks.map((x) => ({ s: rotulo(x), kg: Math.round(x.loadKg) }))} claveX="s" claveY="kg" nombre="Volumen semanal" resaltada={resaltada} anotada={descargas} colorResaltada="var(--hero-mark)" colorResto="var(--hero-mark-dim)" claseGrafico="hero-chart" formato={(x) => `${formatEntero(x)} kg`} />
            </ChartFrame>
          </div>
        </>
      )}
    </Card>
  )
}

/* ======================= Series por grupo ======================= */
const ESTADO_GRUPO: Record<'bajo' | 'dentro' | 'por-encima', EstadoFila> = {
  bajo: { tono: 'warning', texto: 'Bajo' },
  dentro: { tono: 'success', texto: 'Dentro' },
  'por-encima': { tono: 'info', texto: 'Por encima' }
}
export function SeriesCard({ s }: { s: EntrenoSummary }) {
  const todos = s.muscleSets.groups
  const con = todos.filter((g) => g.sets > 0).sort((a, b) => b.sets - a.sets)
  const sin = todos.filter((g) => g.sets === 0)
  const mismoRango = todos.length > 0 && todos.every((g) => g.min === todos[0].min && g.max === todos[0].max)
  const esSemana = s.range.period === 'week'
  return (
    <Card titulo="Series por grupo" subtitulo={esSemana ? 'esta semana' : 'media por semana'} icono={<Target size={20} weight="duotone" aria-hidden />} className="flex h-full flex-col">
      {con.length === 0 ? (
        <EmptyState compacto icono={<Target size={20} aria-hidden />} titulo="Sin series en este periodo" texto="Si tus ejercicios no tienen grupo muscular, no se pueden repartir. Ponlo en Ejercicios." accion={<Link to="/entreno/ejercicios?cat=sin-grupo" className="btn btn-secondary btn-sm">Ver ejercicios sin grupo</Link>} />
      ) : (
        <ChartFrame
          titulo="Series efectivas por grupo muscular"
          periodo={esSemana ? `Semana ${s.week.weekStart === s.range.from ? 'actual' : 'elegida'}, hasta hoy` : `Media semanal de ${s.muscleSets.weeks} ${s.muscleSets.weeks === 1 ? 'semana' : 'semanas'}`}
          unidad="series efectivas"
          referencia={mismoRango ? `Rango de referencia: entre ${todos[0].min} y ${todos[0].max} series por grupo y semana.` : 'Cada grupo tiene su propio rango de series por semana (se cambia en Ajustes › Entreno).'}
        >
          <MedidoresLista
            filas={con.map((g) => ({ nombre: g.name, valor: Math.round(g.sets * 10) / 10, rango: { min: g.min, max: g.max }, estado: ESTADO_GRUPO[g.status] }))}
            formato={(x) => formatNum1(x)}
            rango={mismoRango ? { min: todos[0].min, max: todos[0].max, etiqueta: 'rango' } : undefined}
          />
        </ChartFrame>
      )}
      {sin.length > 0 && con.length > 0 && <p className="t-meta mt-3">Sin series: {sin.map((g) => g.name).join(', ')}.</p>}
    </Card>
  )
}

/* ======================= HYROX ======================= */
const marcaEstacion = (st: StationStats): string =>
  [
    st.bestWeightKg && formatKg(st.bestWeightKg.value),
    // La mejor distancia no se repite si la mejor duración ya dice en qué distancia fue («4:33 en 1 km»)
    st.bestDistanceKm && !st.bestDurationSeconds?.distanceKm && formatDistancia(st.bestDistanceKm.value),
    st.bestDurationSeconds && `${formatTiempo(st.bestDurationSeconds.value)}${st.bestDurationSeconds.distanceKm ? ` en ${formatDistancia(st.bestDurationSeconds.distanceKm)}` : ''}`,
    st.bestReps && `${formatNum(st.bestReps.value)} reps`
  ]
    .filter(Boolean)
    .join(' · ') || '—'

export function HyroxCard({ s }: { s: EntrenoSummary }) {
  const h = s.hyrox
  if (!h)
    return (
      <Card titulo="HYROX" icono={<Flag size={20} weight="duotone" aria-hidden />} className="flex h-full flex-col">
        <EmptyState
          compacto
          icono={<Flag size={20} aria-hidden />}
          titulo="Sin evento HYROX"
          texto="Crea el evento en Objetivos y un bloque que sea su fase en Plan. Entonces verás la cuenta atrás, las fases y tus estaciones."
          accion={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/entreno/objetivos" className="btn btn-secondary btn-sm">
                Ir a Objetivos
              </Link>
              <Link to="/entreno/plan?vista=bloques" className="btn btn-ghost btn-sm">
                Ir a Bloques
              </Link>
            </div>
          }
        />
      </Card>
    )
  const c = h.countdown
  const hechas = h.stations.filter((x) => x.timesDone > 0)
  const el = h.elapsed
  const colorFase = (p: (typeof h.phases)[number]) => (p.isCurrent ? 'var(--accent-mark)' : p.endDate < s.today ? 'var(--muted-mark)' : 'var(--track)')
  return (
    <Card titulo="HYROX" subtitulo={`${h.event.name} · ${formatDate(h.event.date)}`} icono={<Flag size={20} weight="duotone" aria-hidden />} className="flex h-full flex-col">
      <div className="t-kpi">
        <CifraUnidad valor={String(Math.max(c.daysLeft, 0))} unidad={c.daysLeft === 1 ? 'día' : 'días'} />
      </div>
      <p className="t-label mt-2">{c.daysLeft === 0 ? 'Es hoy' : `Quedan ${c.weeksLeft} ${c.weeksLeft === 1 ? 'semana' : 'semanas'} de entrenamiento`}</p>
      {el ? (
        <div className="mt-4">
          <ProgressBar value={el.pct} label="Tiempo transcurrido desde el inicio del primer bloque" valueText={`${el.daysElapsed} de ${el.daysTotal} días, el ${formatPorcentaje(el.pct)}`} />
          <p className="t-meta mt-2">
            Tiempo transcurrido desde el inicio del primer bloque: {el.daysElapsed} de {el.daysTotal} días ({formatPorcentaje(el.pct)}), desde el {formatDate(el.start)}.
          </p>
        </div>
      ) : (
        <p className="t-meta mt-3">
          Este evento aún no tiene bloques. Crea uno como fase suya en <Link to="/entreno/plan?vista=bloques" className="font-semibold text-accent-text hover:underline">Plan › Bloques</Link>.
        </p>
      )}
      {h.phases.length > 0 && (
        <div className="mt-6">
          <p className="t-label mb-2">Fases, en semanas</p>
          <BarraSegmentada etiqueta="Fases del evento" partes={h.phases.map((p) => ({ nombre: p.name, valor: Math.max(p.weeks, 1), color: colorFase(p) }))} />
          <ul className="t-meta mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {h.phases.map((p) => (
              <li key={p.blockId}>
                {p.name}: {p.weeks} {p.weeks === 1 ? 'semana' : 'semanas'}
                {p.isDeload && ' (descarga)'}
                {p.isCurrent && ' (actual)'}
              </li>
            ))}
          </ul>
        </div>
      )}
      {h.currentPhase && (
        <p className="t-label mt-4">
          Fase actual: <b className="font-semibold text-ink">{h.currentPhase.name}</b>, semana {h.currentPhase.week} de {h.currentPhase.weeks}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2 border-t border-line pt-4">
        <p className="t-label font-semibold text-ink">Estaciones y carrera</p>
        {hechas.length === 0 && h.run.sessions === 0 ? (
          <p className="t-meta">Aún no hay series de estaciones. Asigna la estación a tus ejercicios en Ejercicios para verlas aquí.</p>
        ) : (
          <ul className="divide-line" aria-label="Estaciones de HYROX">
            {hechas.map((st) => (
              <li key={st.station} className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
                <span className="min-w-0">
                  <span className="t-body font-semibold">{st.station}</span> <span className="t-meta">{HYROX_STATION_LABEL[st.station as keyof typeof HYROX_STATION_LABEL] ?? ''} · {st.timesDone} {st.timesDone === 1 ? 'vez' : 'veces'}</span>
                </span>
                <span className="t-label tnum shrink-0">Mejor: {marcaEstacion(st)}</span>
              </li>
            ))}
            {h.run.sessions > 0 && (
              <li className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  <span className="t-body font-semibold">Carrera</span> <span className="t-meta">{h.run.sessions} {h.run.sessions === 1 ? 'sesión' : 'sesiones'}</span>
                </span>
                <span className="t-label tnum shrink-0">
                  {h.run.distanceKm !== null && formatDistancia(h.run.distanceKm)}
                  {h.run.bestPaceSecPerKm && ` · mejor ritmo ${formatTiempo(h.run.bestPaceSecPerKm.value)} /km`}
                </span>
              </li>
            )}
          </ul>
        )}
        {h.stations.length - hechas.length > 0 && hechas.length > 0 && <p className="t-meta">{h.stations.length - hechas.length} estaciones sin registrar.</p>}
      </div>
    </Card>
  )
}

/* ======================= Objetivos ======================= */
export function ObjetivosCard({ s }: { s: EntrenoSummary }) {
  const g = s.goals
  // El gráfico grande es para el primer objetivo de fuerza; los eventos que ya salen en la tarjeta de HYROX no se repiten
  const principal = g.find((x) => x.type === 'E1RM') ?? g.find((x) => x.type === 'WEIGHT_REPS') ?? g.find((x) => x.type !== 'EVENT') ?? null
  const resto = g.filter((x) => x !== principal && !(x.type === 'EVENT' && x.eventId !== null && x.eventId === s.hyrox?.event.id))
  return (
    <Card
      titulo="Objetivos"
      subtitulo="activos"
      icono={<Trophy size={20} weight="duotone" aria-hidden />}
      accion={
        <Link to="/entreno/objetivos" className="btn btn-ghost btn-sm">
          Ver todos
        </Link>
      }
      className="flex h-full flex-col"
    >
      {g.length === 0 ? (
        <EmptyState compacto icono={<Trophy size={20} aria-hidden />} titulo="Añade un objetivo" texto="Por ejemplo, llegar a un e1RM, subir tu volumen semanal o entrenar un número de veces por semana. Aquí verás el camino." accion={<Link to="/entreno/objetivos?nuevo=1" className="btn btn-primary btn-sm">Nuevo objetivo</Link>} />
      ) : (
        <div className="flex flex-col gap-4">
          {principal && <ObjetivoDetalle g={principal} />}
          {resto.slice(0, 3).map((x) => (
            <div key={x.goalId} className={principal || x !== resto[0] ? 'border-t border-line pt-4' : ''}>
              <ObjetivoDetalle g={x} modo="compacto" />
            </div>
          ))}
          {resto.length > 3 && (
            <p className="t-meta border-t border-line pt-3">
              {resto.length - 3} {resto.length - 3 === 1 ? 'objetivo más' : 'objetivos más'} en <Link to="/entreno/objetivos" className="font-semibold text-accent-text hover:underline">Objetivos</Link>.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

/* ======================= Récords ======================= */
export function RecordsCard({ s }: { s: EntrenoSummary }) {
  return (
    <Card titulo="Récords" subtitulo="los 5 últimos" icono={<Medal size={20} weight="duotone" aria-hidden />} className="h-full">
      {s.recentRecords.length === 0 ? (
        <EmptyState compacto icono={<Medal size={20} aria-hidden />} titulo="Todavía no hay récords" texto="Se marcan cuando superas una marca anterior de un ejercicio: hacen falta al menos dos sesiones." />
      ) : (
        <ul className="divide-line">
          {s.recentRecords.map((r) => (
            <li key={`${r.workoutId}-${r.exerciseId}-${r.type}-${r.weightKg}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid size-10 shrink-0 place-items-center r-control bg-accent-soft text-accent-text">
                <Trophy size={20} weight="fill" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="t-body truncate font-semibold" title={r.exerciseTitle}>
                  {r.exerciseTitle}
                </div>
                <div className="t-meta">
                  {formatDate(r.date)} · {nombreRecord(r.type)}
                </div>
              </div>
              <div className="text-right">
                <div className="t-body tnum font-semibold">{marcaRecord(r.type, r.value, r.weightKg)}</div>
                <div className="t-meta tnum">{anteriorRecord(r.type, r.previous)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ======================= Últimas sesiones ======================= */
export function UltimasCard({ s }: { s: EntrenoSummary }) {
  return (
    <Card
      titulo="Últimas sesiones"
      icono={<Lightning size={20} weight="duotone" aria-hidden />}
      accion={
        <Link to="/entreno/sesiones" className="btn btn-ghost btn-sm">
          Ver todas
        </Link>
      }
      className="h-full"
    >
      {s.recentWorkouts.length === 0 ? (
        <EmptyState compacto icono={<Lightning size={20} aria-hidden />} titulo="Aún no hay sesiones" texto="Importa tu historial de Hevy o apunta una sesión a mano." />
      ) : (
        <ul className="divide-line">
          {s.recentWorkouts.map((w) => {
            const I = KIND_ICON[w.kind]
            return (
              <li key={w.workoutId}>
                <Link to={`/entreno/sesiones/${w.workoutId}`} className="-mx-2 flex items-center gap-3 r-control px-2 py-2 text-ink hover:bg-interactive" style={{ minHeight: 'var(--row-h)' }} aria-label={`${w.title}, ${fechaDe(w.startTime)}${w.records.length ? ', con récord' : ''}`}>
                  <I size={20} weight="duotone" className="shrink-0 text-accent-text" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="t-body block truncate font-semibold">{w.title}</span>
                    <span className="t-meta">
                      {fechaDe(w.startTime)}
                      {w.minutes !== null && ` · ${formatDuracion(w.minutes * 60)}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="t-body tnum block font-semibold">{w.loadKg > 0 ? `${formatEntero(w.loadKg)} kg` : `${w.sets} ${w.sets === 1 ? 'serie' : 'series'}`}</span>
                    <span className="t-meta tnum">{w.loadKg > 0 ? `${w.sets} ${w.sets === 1 ? 'serie' : 'series'}` : KIND_LABEL[w.kind]}</span>
                  </span>
                  {w.records.length > 0 && <Tag tono="accent">Récord</Tag>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/* ======================= Constancia ======================= */
export function ConstanciaCard({ s }: { s: EntrenoSummary }) {
  const c = s.consistency
  const dias = c.days.filter((d) => d !== null && d > 0).length
  return (
    <Card titulo="Constancia" subtitulo={`${c.weeks} semanas`} icono={<CalendarCheck size={20} weight="duotone" aria-hidden />} className="flex h-full flex-col">
      <MapaConstancia datos={c.days} inicio={c.start} semanas={c.weeks} />
      <div className="mt-4">
        <LeyendaMapa />
      </div>
      <p className="t-label mt-auto pt-4">
        <b className="font-semibold text-ink">{dias}</b> {dias === 1 ? 'día' : 'días'} con entreno desde el {formatDate(c.start)}. El tono es relativo al día más cargado.
      </p>
    </Card>
  )
}
