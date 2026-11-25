// F4, huecos de tests comprobados por los métodos IPC reales: casos a mano de la Verificación del
// plan, datos grandes, cambio de hora, bloques solapados al editar y lecturas sin escritura.
// Datos inventados. Semanas de lunes a domingo; el 2 nov 2026 es lunes.
import { describe, expect, it } from 'vitest'
import { createMetricsService } from '../../src/main/modules/entreno/metrics'
import { applyHevyWorkouts } from '../../src/main/modules/entreno/hevyApply'
import { TRN_TABLES } from '../../src/main/modules/entreno/exports'
import { META, entrenoApp, escribir, serie, sesion, type EntrenoApp } from './helpers'

function importar(app: EntrenoApp, nuevas: ReturnType<typeof sesion>[], hash = 'v1') {
  return escribir(app.ctx, () => applyHevyWorkouts(app.db, { meta: { ...META, fileHash: hash }, newWorkouts: nuevas, changedWorkouts: [] }))
}

const crol = (extra = {}) => serie('Crol ficticio', 0, 0, { weightKg: null, reps: 20, distanceKm: 1, ...extra })
const press = (i: number, kg: number, reps: number, extra = {}) => serie('Press banca ficticio', 0, i, { weightKg: kg, reps, ...extra })

describe('casos a mano por IPC', () => {
  it('Epley 100 x 5 = 116,7; calentamientos fuera; secundarios 0,5; semana lunes-domingo', async () => {
    const app = await entrenoApp()
    const h = app.h
    app.ctx.todayOverride = '2026-11-08'
    importar(app, [
      sesion('Lunes', '2026-11-02T07:00', [press(0, 40, 10, { setType: 'warmup' }), press(1, 100, 5)]),
      sesion('Domingo', '2026-11-08T23:30', [press(0, 80, 8)]),
      sesion('Lunes siguiente', '2026-11-09T00:10', [press(0, 60, 5)])
    ])
    const ex = h['entreno:exercises.list']().find((e) => e.title === 'Press banca ficticio')!
    const grupos = h['entreno:muscleGroups.list']()
    const pecho = grupos.find((g) => g.name === 'Pecho')!
    const triceps = grupos.find((g) => g.name === 'Tríceps')!
    await h['entreno:exercises.save']({ ...ex, primaryGroupId: pecho.id, secondaryGroupIds: [triceps.id] })

    const [r] = h['entreno:metrics.records'](ex.id)
    const e1 = r.records.find((x) => x.type === 'mejor-e1rm')!
    expect(e1.value).toBeCloseTo(116.7, 1)
    expect(r.records.some((x) => x.type === 'reps-con-peso' && x.weightKg === 40)).toBe(false)

    const s = h['entreno:metrics.summary']({ period: 'week' })
    expect(s.range).toMatchObject({ from: '2026-11-02', to: '2026-11-08' })
    // Lunes y domingo entran; el lunes siguiente a las 00:10 no. Calentamiento fuera: 100x5 + 80x8.
    expect(s.totals).toMatchObject({ sessions: 2, sets: 2, loadKg: 500 + 640 })
    const g = (n: string) => s.muscleSets.groups.find((x) => x.name === n)!
    expect(g('Pecho').sets).toBe(2)
    expect(g('Tríceps').sets).toBe(1)
  })

  it('proyección conocida, semanas vacías fuera de la regresión y menos de 3 semanas -> pocos-datos', async () => {
    const app = await entrenoApp()
    const h = app.h
    app.ctx.todayOverride = '2026-11-25'
    // 6 repeticiones: e1RM = peso x 1,2. Semanas 2/11, 9/11 y 23/11 (la del 16/11 queda vacía).
    importar(app, [
      sesion('A', '2026-11-02T07:00', [press(0, 50, 6)]),
      sesion('B', '2026-11-10T07:00', [press(0, 55, 6)]),
      sesion('C', '2026-11-24T07:00', [press(0, 65, 6)]),
      sesion('D', '2026-11-03T07:00', [serie('Remo ficticio', 0, 0, { weightKg: 50, reps: 6 })]),
      sesion('E', '2026-11-11T07:00', [serie('Remo ficticio', 0, 0, { weightKg: 55, reps: 6 })])
    ])
    const id = (t: string) => h['entreno:exercises.list']().find((e) => e.title === t)!.id
    const g1 = await h['entreno:goals.save']({ name: 'Press', type: 'E1RM', exerciseId: id('Press banca ficticio'), targetValue: 100, deadline: '2026-12-14' })
    const g2 = await h['entreno:goals.save']({ name: 'Remo', type: 'E1RM', exerciseId: id('Remo ficticio'), targetValue: 100, deadline: '2026-12-14' })
    const a = h['entreno:metrics.goal'](g1.id)!
    expect(a.series.map((p) => p.weekKey)).toEqual(['2026-11-02', '2026-11-09', '2026-11-23'])
    // y = 60 + 6x exacto en x = 0, 1, 3; el 14/12 es x = 6: 96. Si la semana vacía contara como 0 no saldría.
    expect(a.projection!.value).toBeCloseTo(96, 6)
    expect(a.projection!.line[1].date).toBe('2026-12-14')
    const b = h['entreno:metrics.goal'](g2.id)!
    expect(b.series).toHaveLength(2)
    expect(b.projection).toBeNull()
    expect(b.projectionReason).toBe('pocos-datos')
  })

  it('adherencia: dos del mismo tipo cuentan las dos, lo que falta no se compensa y nunca pasa de 100 %', async () => {
    const app = await entrenoApp()
    const h = app.h
    app.ctx.todayOverride = '2026-11-25'
    const a = await h['entreno:routines.save']({ name: 'Fuerza A', kind: 'GYM' })
    const nat = await h['entreno:routines.save']({ name: 'Natación', kind: 'SWIM' })
    const plan = (ws: string, dias: [string, number][]) => h['entreno:weekPlan.save'](ws, dias.map(([date, routineId]) => ({ date, routineId })))
    await plan('2026-11-02', [['2026-11-02', a.id], ['2026-11-05', a.id], ['2026-11-06', nat.id]])
    await plan('2026-11-09', [['2026-11-09', a.id], ['2026-11-12', a.id], ['2026-11-13', nat.id]])
    await plan('2026-11-16', [['2026-11-16', a.id], ['2026-11-19', a.id], ['2026-11-20', nat.id]])
    importar(app, [
      // Semana 1: dos Fuerza A (martes y sábado) y ninguna natación.
      sesion('Fuerza A', '2026-11-03T07:00', [press(0, 60, 8)]),
      sesion('Fuerza A', '2026-11-07T07:00', [press(0, 60, 8)]),
      // Semana 2: tres Fuerza A (una de más) y ninguna natación.
      sesion('Fuerza A', '2026-11-09T07:00', [press(0, 60, 8)]),
      sesion('Fuerza A', '2026-11-10T07:00', [press(0, 60, 8)]),
      sesion('Fuerza A', '2026-11-11T07:00', [press(0, 60, 8)]),
      // Semana 3: Fuerza A x2 y dos nataciones (una de más).
      sesion('Fuerza A', '2026-11-16T07:00', [press(0, 60, 8)]),
      sesion('Fuerza A', '2026-11-17T07:00', [press(0, 60, 8)]),
      sesion('Natación', '2026-11-18T18:00', [crol()]),
      sesion('Natación', '2026-11-19T18:00', [crol()])
    ])
    const w1 = h['entreno:metrics.week']('2026-11-02')
    const hechos = w1.slots.filter((s) => s.routineName === 'Fuerza A').map((s) => s.doneWorkoutId)
    expect(hechos.every((x) => x != null)).toBe(true)
    expect(new Set(hechos).size).toBe(2)
    expect(w1.slots.find((s) => s.routineName === 'Natación')!.doneWorkoutId).toBeNull()

    const s = h['entreno:metrics.summary']()
    const sem = (ws: string) => s.adherence.weeks.find((w) => w.weekStart === ws)!
    expect([sem('2026-11-02').planned, sem('2026-11-02').done]).toEqual([3, 2])
    expect([sem('2026-11-09').planned, sem('2026-11-09').done]).toEqual([3, 2])
    expect([sem('2026-11-16').planned, sem('2026-11-16').done]).toEqual([3, 3])
    for (const w of s.adherence.weeks) if (w.pct != null) expect(w.pct).toBeLessThanOrEqual(1)
    // La natación que faltó en la semana 1 no se recupera con las dos de la semana 3.
    expect(sem('2026-11-02').pct).toBeCloseTo(2 / 3, 10)
    expect(sem('2026-11-16').pct).toBe(1)
  })
})

describe('datos grandes', () => {
  it('2 años de sesiones: summary rápido en frío y estable', async () => {
    const app = await entrenoApp()
    app.ctx.todayOverride = '2026-11-25'
    const ejercicios = ['Press banca ficticio', 'Sentadilla ficticia', 'Remo ficticio', 'Peso muerto ficticio', 'Press militar ficticio', 'Dominadas ficticias', 'Curl ficticio', 'Zancadas ficticias']
    let seed = 12345
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const dia = (d: number) => new Date(Date.UTC(2025, 0, 1 + d)).toISOString().slice(0, 10)
    const sesiones: ReturnType<typeof sesion>[] = []
    for (let d = 0; d < 690; d++) {
      if (![0, 1, 3, 4, 5].includes(d % 7)) continue
      const sets = ejercicios.flatMap((t, e) => [0, 1, 2].map((i) => serie(t, e, i, { weightKg: 20 + Math.round(rnd() * 80), reps: 3 + Math.floor(rnd() * 10), rpe: 7 + Math.floor(rnd() * 3) })))
      sesiones.push(sesion('Fuerza', `${dia(d)}T07:00`, sets, { endTime: `${dia(d)}T08:05` }))
    }
    expect(sesiones.length).toBeGreaterThanOrEqual(400)
    expect(sesiones.reduce((a, x) => a + x.sets.length, 0)).toBeGreaterThanOrEqual(10000)
    importar(app, sesiones, 'grande')
    const t0 = performance.now()
    const a = app.h['entreno:metrics.summary']()
    const ms = performance.now() - t0
    // Medido: ~340 ms solo y ~650-740 ms con la suite en paralelo; 1500 evita un test frágil.
    expect(ms).toBeLessThan(1500)
    expect(app.h['entreno:metrics.summary']()).toEqual(a)
    expect(createMetricsService(app.ctx).summary()).toEqual(a)
    expect(a.volume.weeks.some((w) => w.loadKg > 0)).toBe(true)
  })
})

describe('cambio de hora (29/03/2026 y 25/10/2026, domingos)', () => {
  it('duración por reloj, semana y día de la semana correctos', async () => {
    const app = await entrenoApp()
    const h = app.h
    app.ctx.todayOverride = '2026-03-23'
    const dom = await h['entreno:routines.save']({ name: 'Domingo largo', kind: 'GYM' })
    await h['entreno:baseWeek.save']([{ weekday: 7, routineId: dom.id }])
    importar(app, [
      sesion('Domingo largo', '2026-03-29T01:30', [press(0, 60, 8)], { endTime: '2026-03-29T03:30' }),
      sesion('Domingo largo', '2026-10-25T01:30', [press(0, 60, 8)], { endTime: '2026-10-25T03:30' })
    ])
    const ids = h['entreno:workouts.list']({}).map((w) => [w.startTime, w.id] as const)
    const id = (f: string) => ids.find(([s]) => s.startsWith(f))![1]
    for (const [dia, lunes] of [['2026-03-29', '2026-03-23'], ['2026-10-25', '2026-10-19']] as const) {
      app.ctx.todayOverride = dia
      const w = h['entreno:workouts.get'](id(dia))
      expect(w.durationSeconds).toBe(7200)
      const sem = h['entreno:metrics.week'](dia)
      expect(sem.weekStart).toBe(lunes)
      const slot = sem.slots.find((s) => s.date === dia)!
      expect(slot.doneWorkoutId).toBe(id(dia))
      const s = h['entreno:metrics.summary']({ period: 'week' })
      expect(s.range).toMatchObject({ from: lunes, to: dia })
      expect(s.totals.minutes).toBe(120)
      expect(s.week.days).toHaveLength(7)
      expect(s.week.days[6].date).toBe(dia)
    }
  })
})

describe('bloques solapados al editar', () => {
  it('editar un bloque para que pise a otro se rechaza y no cambia nada', async () => {
    const app = await entrenoApp()
    const h = app.h
    importar(app, [sesion('X', '2026-11-20T07:00', [press(0, 60, 8)])])
    const a = await h['entreno:blocks.save']({ name: 'A', startDate: '2026-11-02', endDate: '2026-11-15' })
    const b = await h['entreno:blocks.save']({ name: 'B', startDate: '2026-11-16', endDate: '2026-11-30' })
    const antes = h['entreno:blocks.list']()
    const bloque = () => app.db.get<{ block_id: number | null }>('SELECT block_id FROM trn_workouts')!.block_id
    expect(bloque()).toBe(b.id)
    await expect(h['entreno:blocks.save']({ ...a, endDate: '2026-11-16' })).rejects.toThrow(/se solapa con «B»/)
    await expect(h['entreno:blocks.save']({ ...b, startDate: '2026-11-10' })).rejects.toThrow(/se solapa con «A»/)
    expect(h['entreno:blocks.list']()).toEqual(antes)
    expect(bloque()).toBe(b.id)
  })
})

describe('las lecturas metrics.* no escriben', () => {
  it('ni tablas de entreno ni audit_log ni cola', async () => {
    const app = await entrenoApp()
    const h = app.h
    app.ctx.todayOverride = '2026-11-25'
    const r = await h['entreno:routines.save']({ name: 'Fuerza A', kind: 'GYM' })
    await h['entreno:baseWeek.save']([{ weekday: 1, routineId: r.id }])
    importar(app, [sesion('Fuerza A', '2026-11-02T07:00', [press(0, 60, 8)])])
    const ex = h['entreno:exercises.list']()[0].id
    const g = await h['entreno:goals.save']({ name: 'P', type: 'E1RM', exerciseId: ex, targetValue: 100 })
    const tablas = [...TRN_TABLES, 'audit_log']
    const foto = () => tablas.map((t) => app.db.all(`SELECT * FROM ${t}`))
    const antes = foto()
    let cambios = 0
    const off = app.ctx.onChange(() => cambios++)
    h['entreno:metrics.summary']({ period: 'month' })
    h['entreno:metrics.week']('2026-11-02')
    h['entreno:metrics.week']('2026-10-05')
    h['entreno:metrics.next']()
    h['entreno:metrics.records']()
    h['entreno:metrics.goal'](g.id)
    h['entreno:metrics.goals']()
    h['entreno:metrics.inicio']()
    off()
    expect(cambios).toBe(0)
    expect(foto()).toEqual(antes)
    expect(app.db.hasPendingSave).toBe(false)
  })
})
