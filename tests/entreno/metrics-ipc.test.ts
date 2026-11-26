// Métodos `entreno:metrics.*` contra una base de prueba con el registro y la cola reales.
// Datos: la muestra ficticia de Hevy más unas sesiones inventadas, un boceto, un evento con tres
// bloques (uno de descarga) y objetivos. Hoy = miércoles 25/11/2026.
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMetricsService } from '../../src/main/modules/entreno/metrics'
import { applyHevyWorkouts } from '../../src/main/modules/entreno/hevyApply'
import { TRN_TABLES } from '../../src/main/modules/entreno/exports'
import { ENTRENO_METRICS } from '../../src/shared/modules/entreno/metrics'
import { META, entrenoApp, escribir, noDialogs, serie, sesion, type EntrenoApp } from './helpers'

const FX = path.resolve(__dirname, '../fixtures')
const HOY = '2026-11-25'

async function montar(): Promise<EntrenoApp & { ids: Record<string, number> }> {
  const app = await entrenoApp({ dbPath: null, backupsDir: null }, { ...noDialogs, openFile: async () => path.join(FX, 'hevy-ficticio-sesiones.csv') })
  app.ctx.todayOverride = HOY
  const h = app.h
  // Tipos de entreno antes de importar: así las sesiones con ese título quedan asignadas.
  const torso = await h['entreno:routines.save']({ name: 'Torso A', kind: 'GYM' })
  const nata = await h['entreno:routines.save']({ name: 'Natación técnica', kind: 'SWIM' })
  const p = (await h['entreno:import.preview']())!
  await h['entreno:import.apply'](p.token)
  escribir(app.ctx, () =>
    applyHevyWorkouts(app.db, {
      meta: { ...META, fileHash: 'extra', rowsTotal: 6 },
      newWorkouts: [
        sesion('Torso A', '2026-11-12T07:00', [serie('Press banca ficticio', 0, 0, { weightKg: 85, reps: 6 }), serie('Press banca ficticio', 0, 1, { weightKg: 85, reps: 5 })], {
          endTime: '2026-11-12T08:00'
        }),
        sesion('HYROX simulacro', '2026-11-21T10:00', [
          serie('Wall Ball', 0, 0, { weightKg: 6, reps: 20 }),
          serie('SkiErg', 1, 0, { weightKg: null, reps: null, distanceKm: 1, durationSeconds: 245 })
        ]),
        sesion('Torso A', '2026-11-24T07:00', [serie('Press banca ficticio', 0, 0, { weightKg: 82.5, reps: 9 })], { endTime: '2026-11-24T08:10' })
      ],
      changedWorkouts: []
    })
  )
  // Boceto: martes y jueves (18:00) Torso A, viernes Natación técnica.
  await h['entreno:baseWeek.save']([
    { weekday: 2, routineId: torso.id },
    { weekday: 4, routineId: torso.id, time: '18:00' },
    { weekday: 5, routineId: nata.id }
  ])
  const ev = await h['entreno:events.save']({ name: 'Carrera ficticia', date: '2027-03-20' })
  await h['entreno:blocks.save']({ name: 'Base', startDate: '2026-11-02', endDate: '2026-11-15', plannedGym: 2, plannedSwim: 1, plannedHyrox: 0, plannedRun: 0, plannedOther: 0, eventId: ev.id })
  await h['entreno:blocks.save']({ name: 'Descarga', startDate: '2026-11-16', endDate: '2026-11-22', plannedGym: 1, plannedSwim: 1, plannedHyrox: 0, plannedRun: 0, plannedOther: 0, eventId: ev.id, isDeload: true })
  await h['entreno:blocks.save']({ name: 'Específico', startDate: '2026-11-23', endDate: null, plannedGym: 2, plannedSwim: 1, plannedHyrox: 0, plannedRun: 0, plannedOther: 0, eventId: ev.id })
  const press = h['entreno:exercises.list']().find((e) => e.title === 'Press banca ficticio')!.id
  const g1 = await h['entreno:goals.save']({ name: 'Press a 110', type: 'E1RM', exerciseId: press, targetValue: 110, deadline: '2026-12-31' })
  const g2 = await h['entreno:goals.save']({ name: 'Nadar dos veces', type: 'FREQUENCY', kind: 'SWIM', targetValue: 2 })
  const g3 = await h['entreno:goals.save']({ name: 'La carrera', type: 'EVENT', eventId: ev.id })
  const g4 = await h['entreno:goals.save']({ name: 'Viejo', type: 'E1RM', exerciseId: press, targetValue: 90 })
  await h['entreno:goals.setStatus'](g4.id, 'ACHIEVED')
  const w = h['entreno:workouts.list']({})
  const wid = (title: string, start: string) => w.find((x) => x.title === title && x.startTime === start)!.id
  return {
    ...app,
    get db() {
      return app.ctx.db
    },
    ids: {
      torso: torso.id,
      nata: nata.id,
      ev: ev.id,
      press,
      g1: g1.id,
      g2: g2.id,
      g3: g3.id,
      g4: g4.id,
      w1105: wid('Torso A', '2026-11-05T07:05'),
      w1112: wid('Torso A', '2026-11-12T07:00'),
      w1124: wid('Torso A', '2026-11-24T07:00')
    }
  }
}

describe('entreno:metrics.*', async () => {
  const app = await montar()
  const h = app.h
  const { ids } = app

  it('las sesiones importadas con el nombre de un tipo de entreno quedan asignadas', () => {
    expect(h['entreno:workouts.get'](ids.w1124).routineId).toBe(ids.torso)
  })

  it('summary (semana): semana de hoy, próxima sesión y adherencia sin compensación', () => {
    const s = h['entreno:metrics.summary']()
    expect(s.today).toBe(HOY)
    expect(s.range).toMatchObject({ requested: 'week', period: 'week', from: '2026-11-23', to: '2026-11-29', weeks: ['2026-11-23'] })
    expect(s.week.source).toBe('boceto')
    expect(s.week.days.map((d) => d.status)).toEqual(['descanso', 'hecha', 'hoy', 'planificada', 'planificada', 'descanso', 'descanso'])
    expect(s.next).toMatchObject({ date: '2026-11-26', routineName: 'Torso A', time: '18:00', isToday: false })
    // 26/10 sin bloque ni plan; 02/11 y 09/11: bloque Base (1 de 3); 16/11 descarga (1 de 2); 23/11 boceto (1 de 3).
    expect(s.adherence.weeks.map((w) => [w.weekStart, w.source, w.planned, w.done])).toEqual([
      ['2026-10-26', 'ninguno', 0, 0],
      ['2026-11-02', 'bloque', 3, 1],
      ['2026-11-09', 'bloque', 3, 1],
      ['2026-11-16', 'bloque', 2, 1],
      ['2026-11-23', 'boceto', 3, 1]
    ])
    expect(s.adherence).toMatchObject({ planned: 11, done: 4 })
    expect(s.adherence.pct).toBeCloseTo(4 / 11, 10)
  })

  it('summary: volumen semanal de 8 semanas con la descarga, series y constancia', () => {
    const s = h['entreno:metrics.summary']({ period: 'week' })
    expect(s.volume.weeks).toHaveLength(8)
    expect(s.volume.weeks.filter((w) => w.isDeload).map((w) => w.weekKey)).toEqual(['2026-11-16'])
    expect(s.volume.current).toMatchObject({ weekKey: '2026-11-23', loadKg: 742.5 })
    // La semana anterior entera tiene 120 kg (sábado), pero se compara con su lunes–miércoles: 0 kg.
    expect(s.volume.previous!.loadKg).toBe(120)
    expect(s.volume).toMatchObject({ comparison: 'same-days', previousToDate: '2026-11-18', previousLoadKg: 0, changePct: null })
    expect(s.totals).toMatchObject({ loadKg: 742.5, sessions: 1, sets: 1, minutes: 70 })
    expect(s.muscleSets.weeks).toBe(1)
    expect(s.muscleSets.groups.length).toBeGreaterThan(0)
    expect(s.consistency.days).toHaveLength(84)
    // Niveles relativos al día más cargado (5/11, 7 series): el martes con 1 serie es carga baja.
    expect(s.consistency.start).toBe('2026-09-07')
    expect(s.consistency.days[59]).toBe(3)
    expect(s.consistency.days.slice(77, 84)).toEqual([0, 1, 0, null, null, null, null])
  })

  it('summary: objetivos activos, HYROX, récords y últimas sesiones', () => {
    const s = h['entreno:metrics.summary']()
    expect(s.goals.map((g) => g.name)).toEqual(['Press a 110', 'Nadar dos veces', 'La carrera'])
    expect(s.hyrox).not.toBeNull()
    expect(s.hyrox!.event.name).toBe('Carrera ficticia')
    expect(s.hyrox!.currentPhase).toMatchObject({ name: 'Específico', week: 1 })
    expect(s.recentRecords.map((r) => [r.workoutId, r.type, r.exerciseTitle])).toEqual([
      [ids.w1124, 'mejor-e1rm', 'Press banca ficticio'],
      [ids.w1124, 'reps-con-peso', 'Press banca ficticio'],
      [ids.w1112, 'peso-maximo', 'Press banca ficticio']
    ])
    expect(s.recentWorkouts).toHaveLength(5)
    expect(s.recentWorkouts[0]).toMatchObject({ workoutId: ids.w1124, title: 'Torso A', routineName: 'Torso A', minutes: 70, loadKg: 742.5 })
    expect(s.recentWorkouts[0].records).toHaveLength(2)
  })

  it('summary por mes y por bloque', () => {
    const m = h['entreno:metrics.summary']({ period: 'month' })
    expect(m.range).toMatchObject({ period: 'month', from: '2026-11-01', to: '2026-11-30' })
    expect(m.range.weeks).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'])
    expect(m.totals.sessions).toBe(5)
    expect(m.volume.weeks).toHaveLength(5)
    // El mes llega hasta la semana de hoy: mismos días.
    expect(m.volume.comparison).toBe('same-days')
    expect(m.muscleSets.weeks).toBe(5)
    // La semana resuelta y la próxima sesión siguen siendo las de hoy.
    expect(m.week.weekStart).toBe('2026-11-23')
    const b = h['entreno:metrics.summary']({ period: 'block', date: '2026-11-10' })
    expect(b.range).toMatchObject({ period: 'block', blockName: 'Base', from: '2026-11-02', to: '2026-11-15', weeks: ['2026-11-02', '2026-11-09'] })
    expect(b.adherence).toMatchObject({ planned: 6, done: 2 })
    // Periodo pasado: semana entera (9/11: 85 × 11 = 935 kg) frente a semana entera (2/11: press 1155 + remo 600 + curl 267).
    expect(b.volume).toMatchObject({ comparison: 'full-week', previousToDate: '2026-11-08', previousLoadKg: 2022 })
    expect(b.volume.current).toMatchObject({ weekKey: '2026-11-09', loadKg: 935, isCurrent: false })
    const sin = h['entreno:metrics.summary']({ period: 'block', date: '2026-10-01' })
    expect(sin.range).toMatchObject({ requested: 'block', period: 'week', blockId: null })
  })

  it('week y next ("¿qué me toca?")', () => {
    const w = h['entreno:metrics.week']('2026-11-26')
    expect(w.weekStart).toBe('2026-11-23')
    expect(w.slots.map((s) => [s.date, s.routineName, s.doneWorkoutId])).toEqual([
      ['2026-11-24', 'Torso A', ids.w1124],
      ['2026-11-26', 'Torso A', null],
      ['2026-11-27', 'Natación técnica', null]
    ])
    expect(h['entreno:metrics.next']()).toMatchObject({ date: '2026-11-26' })
    expect(h['entreno:metrics.next']('2026-11-27')).toMatchObject({ date: '2026-11-27', routineName: 'Natación técnica', isToday: true })
    expect(() => h['entreno:metrics.week']('26/11/2026')).toThrow(/Fecha no válida/)
  })

  it('records y workoutRecords', () => {
    const [r] = h['entreno:metrics.records'](ids.press)
    expect(r.exerciseTitle).toBe('Press banca ficticio')
    const byType = Object.fromEntries(r.records.filter((x) => x.type !== 'reps-con-peso').map((x) => [x.type, x.value]))
    expect(byType['peso-maximo']).toBe(85)
    expect(byType['mejor-e1rm']).toBeCloseTo(107.25, 10)
    // El calentamiento de 40 kg no da récord de reps con su peso.
    expect(r.records.filter((x) => x.type === 'reps-con-peso').map((x) => [x.weightKg, x.value])).toEqual([
      [82.5, 9],
      [85, 6]
    ])
    expect(h['entreno:metrics.workoutRecords'](ids.w1105)).toEqual([])
    expect(h['entreno:metrics.workoutRecords'](ids.w1124).map((x) => x.type)).toEqual(['mejor-e1rm', 'reps-con-peso'])
    expect(h['entreno:metrics.records']().length).toBeGreaterThan(1)
  })

  it('goals y goal: activos primero, progreso y proyección', () => {
    const all = h['entreno:metrics.goals']()
    expect(all.map((g) => [g.name, g.status])).toEqual([
      ['Press a 110', 'ACTIVE'],
      ['Nadar dos veces', 'ACTIVE'],
      ['La carrera', 'ACTIVE'],
      ['Viejo', 'ACHIEVED']
    ])
    const g = h['entreno:metrics.goal'](ids.g1)!
    expect(g.exerciseTitle).toBe('Press banca ficticio')
    expect(g.series.map((p) => p.weekKey)).toEqual(['2026-11-02', '2026-11-09', '2026-11-23'])
    expect(g.current).toBeCloseTo(107.25, 10)
    expect(g.achieved).toBe(false)
    // Regresión sobre x = 0, 1, 3 semanas e y = 104,5; 102; 107,25, evaluada el 31/12 (x = 59/7).
    expect(g.projection!.value).toBeCloseTo(112.82, 2)
    expect(g.projection!.line[1].date).toBe('2026-12-31')
    const f = h['entreno:metrics.goal'](ids.g2)!
    expect(f).toMatchObject({ unit: 'sesiones', current: 1, pct: 0.5, projection: null, projectionReason: 'sin-fecha-limite' })
    const e = h['entreno:metrics.goal'](ids.g3)!
    expect(e).toMatchObject({ eventName: 'Carrera ficticia', countdown: { daysLeft: 115, weeksLeft: 17 } })
    expect(h['entreno:metrics.goal'](9999)).toBeNull()
  })

  it('hyrox: fases, tiempo transcurrido y estaciones', () => {
    const x = h['entreno:metrics.hyrox'](ids.ev)!
    expect(x.elapsed).toMatchObject({ start: '2026-11-02', daysElapsed: 23, daysTotal: 138 })
    expect(x.phases.map((p) => [p.name, p.weeks, p.isDeload])).toEqual([
      ['Base', 2, false],
      ['Descarga', 1, true],
      ['Específico', 17, false]
    ])
    expect(x.stations.map((s) => s.station)).toEqual(['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jumps', 'Rowing', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls'])
    const ski = x.stations.find((s) => s.station === 'SkiErg')!
    expect(ski).toMatchObject({ timesDone: 1, bestDurationSeconds: { value: 245 } })
    expect(x.stations.find((s) => s.station === 'Wall Balls')).toMatchObject({ timesDone: 1, bestReps: { value: 20 }, bestWeightKg: { value: 6 } })
    expect(h['entreno:metrics.hyrox'](9999)).toBeNull()
  })

  it('inicio: lo justo para las tres tarjetas', () => {
    const i = h['entreno:metrics.inicio']()
    expect(i.week).toMatchObject({ weekStart: '2026-11-23', planned: 3, done: 1, sessions: 1 })
    expect(i.volume).toEqual({ weekKey: '2026-11-23', loadKg: 742.5, comparison: 'same-days', previousLoadKg: 0, previousToDate: '2026-11-18', changePct: null })
    // El sábado ya entran los 120 kg del sábado anterior.
    app.ctx.todayOverride = '2026-11-28'
    expect(h['entreno:metrics.inicio']().volume).toMatchObject({ previousLoadKg: 120, previousToDate: '2026-11-21' })
    expect(h['entreno:metrics.inicio']().volume.changePct).toBeCloseTo((742.5 - 120) / 120, 10)
    app.ctx.todayOverride = HOY
    expect(i.nextEvent).toMatchObject({ name: 'Carrera ficticia', daysLeft: 115 })
    expect(i.next).toMatchObject({ date: '2026-11-26', time: '18:00' })
    expect(i.records).toHaveLength(3)
  })

  it('compute: la métrica genérica y sus errores', () => {
    expect(h['entreno:metrics.compute']('volumen-carga', { groupBy: 'week', from: '2026-11-23' })).toEqual([{ key: '2026-11-23', value: 742.5 }])
    expect(() => h['entreno:metrics.compute']('no-existe', { groupBy: 'week' })).toThrow(/no existe/)
    expect(() => h['entreno:metrics.compute']('adherencia', { groupBy: 'month' })).toThrow(/no se puede agrupar/)
    expect(() => h['entreno:metrics.compute']('volumen-carga', { groupBy: 'año' } as never)).toThrow()
  })

  it('las métricas están registradas en el módulo con el contrato del núcleo (entreno.<id>)', () => {
    const mod = app.ctx.registry.modules.find((m) => m.id === 'entreno')!
    expect(mod.metrics.map((m) => ({ id: m.id, name: m.name, module: m.module }))).toEqual(ENTRENO_METRICS.map((m) => ({ id: `entreno.${m.id}`, name: m.name, module: 'entreno' })))
  })

  it('leer no escribe nada', () => {
    const count = () => Object.fromEntries([...TRN_TABLES, 'audit_log'].map((t) => [t, app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n]))
    const before = count()
    let changes = 0
    const off = app.ctx.onChange(() => changes++)
    h['entreno:metrics.summary']({ period: 'month' })
    h['entreno:metrics.week']('2026-11-02')
    h['entreno:metrics.next']('2026-12-01')
    h['entreno:metrics.records']()
    h['entreno:metrics.workoutRecords'](ids.w1124)
    h['entreno:metrics.goals']()
    h['entreno:metrics.goal'](ids.g1)
    h['entreno:metrics.hyrox'](ids.ev)
    h['entreno:metrics.inicio']()
    h['entreno:metrics.compute']('series', { groupBy: 'day' })
    off()
    expect(changes).toBe(0)
    expect(count()).toEqual(before)
    expect(app.db.hasPendingSave).toBe(false)
  })

  it('caché: se lee la base una vez y se vuelve a leer tras una escritura', async () => {
    const m = createMetricsService(app.ctx)
    m.summary()
    m.inicio()
    m.goals()
    expect(m.loads).toBe(1)
    await h['entreno:goals.save']({ name: 'Otro', type: 'FREQUENCY', kind: 'GYM', targetValue: 3 })
    expect(m.goals().map((g) => g.name)).toContain('Otro')
    expect(m.loads).toBe(2)
    // "Hoy" no se cachea.
    app.ctx.todayOverride = '2026-11-27'
    expect(m.next()).toMatchObject({ date: '2026-11-27', isToday: true })
    expect(m.loads).toBe(2)
    app.ctx.todayOverride = HOY
  })
})
