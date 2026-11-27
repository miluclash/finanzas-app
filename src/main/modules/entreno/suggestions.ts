// Sugerencias de Entreno: la revisión semanal (`weeklyReview`, lógica pura) convertida en
// `AiSuggestion` con textos en español. Solo lee (contexto de métricas en caché); no escribe nada.
// Las usan `core:ai.suggestions` (aunque Ollama esté apagado) y la herramienta
// `entreno_revision_semanal` del asistente.
//
// Ids estables `entreno.review.<tipo>.<clave>`: lo que es un estado que sigue (estancamiento, grupo
// bajo, ritmo de un objetivo, HYROX) lleva solo el id del ejercicio, grupo, objetivo o evento; lo que
// es de una semana concreta (adherencia, récords, grupos al día) lleva también el lunes de la semana.
import { formatDate } from '@shared/dates'
import type { AiSuggestion } from '@shared/core/ai-types'
import {
  RECORD_NAMES,
  type AdherenceFinding,
  type GoalUnit,
  type HyroxFinding,
  type MuscleFinding,
  type MusclesOkFinding,
  type PaceFinding,
  type RecordFinding,
  type RecordType,
  type ReviewFinding,
  type StagnationFinding,
  type StationsFinding,
  type WeeklyReview
} from '@shared/modules/entreno/metrics'
import type { WorkoutKind } from '@shared/modules/entreno/types'
import type { CoreContext } from '../../core/context'
import { metricsServiceFor } from './metrics'

// ---------- Formato (el mismo que la interfaz de Entreno: coma decimal, kg, fechas dd/mm/aaaa) ----------

const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' })
const num1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' })
const int = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })

const kg = (v: number) => `${num.format(v)} kg`
const kg1 = (v: number) => `${num1.format(v)} kg`
const pct = (x: number) => `${int.format(Math.round(x * 100))} %`
const plural = (n: number, uno: string, varios: string) => `${num1.format(n)} ${n === 1 ? uno : varios}`

const KIND_LABEL: Record<WorkoutKind, string> = { GYM: 'gimnasio', SWIM: 'natación', HYROX: 'HYROX', RUN: 'carrera', OTHER: 'otro' }
const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const weekday = (d: string) => WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]
const day = (d: string) => Number(d.slice(8, 10))
const month = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1]

/** «del 16 al 22 de noviembre»; si cambia el mes, lo dice en cada extremo; si cambia el año, también. */
function weekRange(from: string, to: string): string {
  if (from.slice(0, 4) !== to.slice(0, 4)) return `del ${day(from)} de ${month(from)} de ${from.slice(0, 4)} al ${day(to)} de ${month(to)} de ${to.slice(0, 4)}`
  if (from.slice(5, 7) !== to.slice(5, 7)) return `del ${day(from)} de ${month(from)} al ${day(to)} de ${month(to)}`
  return `del ${day(from)} al ${day(to)} de ${month(to)}`
}

/** Valor de un objetivo con su unidad. */
function goalValue(v: number, unit: GoalUnit | null): string {
  switch (unit) {
    case 'kg':
      return kg1(v)
    case 'series':
      return plural(v, 'serie', 'series')
    case 'reps':
      return plural(v, 'repetición', 'repeticiones')
    case 'sesiones':
      return plural(v, 'sesión', 'sesiones')
    case 'dias':
      return plural(v, 'día', 'días')
    default:
      return num1.format(v)
  }
}

function recordMark(type: RecordType, value: number, weightKg: number | null): string {
  if (type === 'reps-con-peso') return `${num.format(value)} reps con ${kg(weightKg ?? 0)}`
  if (type === 'reps-peso-corporal') return `${num.format(value)} reps`
  if (type === 'mejor-e1rm') return kg1(value)
  if (type === 'volumen-sesion') return `${int.format(value)} kg`
  return kg(value)
}

const listaY = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

// ---------- Hallazgo → sugerencia ----------

function adherence(f: AdherenceFinding, r: WeeklyReview): AiSuggestion {
  const semana = `la semana ${weekRange(r.weekStart, r.weekEnd)}`
  const faltas = f.missed.map((m) =>
    m.date ? `${m.routineName ?? KIND_LABEL[m.kind!]} (${weekday(m.date)})` : `${plural(m.count, 'sesión', 'sesiones')} de ${KIND_LABEL[m.kind!]}`
  )
  const extra = f.extra > 0 ? ` Además hiciste ${plural(f.extra, 'sesión', 'sesiones')} fuera de lo previsto.` : ''
  const falto = faltas.length ? ` Te ${faltas.length === 1 && f.missed[0].count === 1 ? 'faltó' : 'faltaron'}: ${listaY(faltas)}.` : ''
  const base = {
    id: `entreno.review.adherence.${r.weekStart}`,
    module: 'entreno' as const,
    severity: f.severity,
    href: '/entreno/plan',
    asOf: r.weekStart
  }
  if (f.severity === 'success')
    return { ...base, title: 'Semana cumplida', detail: `Hiciste las ${f.planned} sesiones previstas ${semana}.${extra}` }
  const title = f.severity === 'warning' ? `Semana floja: ${f.done} de ${f.planned} sesiones` : `${f.done} de ${f.planned} sesiones la semana pasada`
  return { ...base, title, detail: `Hiciste ${f.done} de las ${f.planned} sesiones previstas ${semana} (${pct(f.pct)}).${falto}${extra}` }
}

function stagnation(f: StagnationFinding, r: WeeklyReview): AiSuggestion {
  const marca = (v: number) => (f.measure === 'e1rm' ? kg1(v) : plural(v, 'repetición', 'repeticiones'))
  const que = f.measure === 'e1rm' ? 'Tu mejor e1RM' : 'Tu mejor marca'
  return {
    id: `entreno.review.stagnation.${f.exerciseId}`,
    module: 'entreno',
    severity: f.severity,
    title: `${f.exerciseTitle || 'Un ejercicio'} lleva ${f.weeks} semanas sin mejorar`,
    detail:
      `${que} sigue en ${marca(f.best)} (${formatDate(f.bestDate)}). En las últimas ${f.weeks} semanas, con ${plural(f.sessions, 'sesión', 'sesiones')}, ` +
      `lo más alto ha sido ${marca(f.windowBest)}. Puede ser buen momento para cambiar el estímulo (repeticiones, carga o descanso) o meter una descarga.`,
    href: `/entreno/ejercicios?q=${encodeURIComponent(f.exerciseTitle)}`,
    asOf: r.weekStart
  }
}

function muscle(f: MuscleFinding, r: WeeklyReview): AiSuggestion {
  return {
    id: `entreno.review.muscle.${f.groupId}`,
    module: 'entreno',
    severity: f.severity,
    title: `Pocas series de ${f.groupName}`,
    detail: `La semana pasada ${f.sets === 0 ? 'no hiciste ninguna serie' : `hiciste ${plural(f.sets, 'serie efectiva', 'series efectivas')}`} de ${f.groupName}; lo previsto es entre ${num1.format(f.min)} y ${num1.format(f.max)}.`,
    href: '/entreno',
    asOf: r.weekStart
  }
}

function musclesOk(f: MusclesOkFinding, r: WeeklyReview): AiSuggestion {
  return {
    id: `entreno.review.muscles-ok.${r.weekStart}`,
    module: 'entreno',
    severity: f.severity,
    title: 'Todos los grupos musculares en su sitio',
    detail: `La semana pasada llegaste al mínimo de series en ${f.groups === 1 ? 'el grupo que tiene' : `los ${f.groups} grupos que tienen`} objetivo.`,
    href: '/entreno',
    asOf: r.weekStart
  }
}

function pace(f: PaceFinding, r: WeeklyReview): AiSuggestion {
  const nombre = f.goalName ? `«${f.goalName}»` : 'sin nombre'
  const meta = goalValue(f.target, f.unit)
  const fecha = formatDate(f.deadline)
  const evento = f.eventName ? ` (${f.eventName})` : ''
  const base = { id: `entreno.review.pace.${f.goalId}`, module: 'entreno' as const, severity: f.severity, href: '/entreno/objetivos', asOf: r.today }
  if (f.status === 'achieved')
    return {
      ...base,
      title: `Objetivo ${nombre} conseguido`,
      detail: `Ya has llegado a ${meta}${f.best != null ? ` (tu mejor semana: ${goalValue(f.best, f.unit)})` : ''}. Puedes marcarlo como conseguido en Objetivos.`
    }
  const vas = f.current != null ? `Vas por ${goalValue(f.current, f.unit)} de ${meta}. ` : ''
  const llegarias = `Al ritmo de las últimas semanas llegarías a ${goalValue(Math.max(0, f.projected!), f.unit)} el ${fecha}${evento}`
  if (f.status === 'on-track') return { ...base, title: `Objetivo ${nombre}: vas a buen ritmo`, detail: `${vas}${llegarias}.` }
  return { ...base, title: `Objetivo ${nombre}: a este ritmo no llegas`, detail: `${vas}${llegarias}, por debajo de ${meta}.` }
}

function hyrox(f: HyroxFinding, r: WeeklyReview): AiSuggestion {
  const cuanto =
    f.daysLeft === 0 ? 'es hoy' : f.daysLeft < 14 ? `queda${f.daysLeft === 1 ? '' : 'n'} ${plural(f.daysLeft, 'día', 'días')}` : `quedan ${f.weeksLeft} semanas`
  const fase = f.phase ? ` Estás en la fase «${f.phase.name}», semana ${f.phase.week} de ${f.phase.weeks}.` : ''
  return {
    id: `entreno.review.hyrox.${f.eventId}`,
    module: 'entreno',
    severity: f.severity,
    title: `${f.eventName}: ${cuanto}`,
    detail: `El evento es el ${formatDate(f.date)}.${fase}`,
    href: '/entreno',
    asOf: r.today
  }
}

function stations(f: StationsFinding, r: WeeklyReview): AiSuggestion {
  const base = { id: `entreno.review.stations.${f.eventId}`, module: 'entreno' as const, severity: f.severity, href: '/entreno', asOf: r.weekStart }
  if (!f.stale.length)
    return {
      ...base,
      title: 'Estaciones de HYROX al día',
      detail: `Has practicado las ${f.total} estaciones en las últimas ${f.weeks === 1 ? 'semana' : `${f.weeks} semanas`}. Sigue así de cara a ${f.eventName}.`
    }
  const nombres = f.stale.map((s) => `${s.station} (${s.lastDate ? `última vez el ${formatDate(s.lastDate)}` : 'sin hacer todavía'})`)
  return {
    ...base,
    title: `${f.stale.length === 1 ? 'Una estación' : `${f.stale.length} estaciones`} de HYROX sin practicar`,
    detail: `En ${f.weeks === 1 ? 'la última semana' : `las últimas ${f.weeks} semanas`} no has hecho: ${listaY(nombres)}. Conviene meterlas antes de ${f.eventName}.`
  }
}

function record(f: RecordFinding, r: WeeklyReview): AiSuggestion {
  const mas = f.count > 1 ? ` Esa semana batiste ${f.count - 1 === 1 ? 'otro récord' : `${f.count - 1} récords más`} en este ejercicio.` : ''
  return {
    id: `entreno.review.record.${f.exerciseId}-${r.weekStart}`,
    module: 'entreno',
    severity: f.severity,
    title: `Récord en ${f.exerciseTitle || 'un ejercicio'}`,
    detail: `${RECORD_NAMES[f.type]}: ${recordMark(f.type, f.value, f.weightKg)} (antes ${recordMark(f.type === 'reps-con-peso' ? 'reps-peso-corporal' : f.type, f.previous, null)}), el ${formatDate(f.date)}.${mas}`,
    href: `/entreno/sesiones/${f.workoutId}`,
    asOf: r.weekStart
  }
}

/** Una sugerencia por hallazgo, en el orden de la revisión. */
export function reviewToSuggestions(r: WeeklyReview): AiSuggestion[] {
  return r.findings.map((f: ReviewFinding) => {
    switch (f.kind) {
      case 'adherence':
        return adherence(f, r)
      case 'stagnation':
        return stagnation(f, r)
      case 'muscle':
        return muscle(f, r)
      case 'muscles-ok':
        return musclesOk(f, r)
      case 'pace':
        return pace(f, r)
      case 'hyrox':
        return hyrox(f, r)
      case 'stations':
        return stations(f, r)
      case 'record':
        return record(f, r)
    }
  })
}

/** Sugerencias de Entreno (revisión de la última semana completa). Solo lee. */
export function entrenoSuggestions(ctx: CoreContext): AiSuggestion[] {
  return reviewToSuggestions(metricsServiceFor(ctx).review())
}
