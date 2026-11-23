// La vista trn_v_hevy devuelve las 14 columnas de Hevy en su orden, con las fechas en el formato
// de Hevy (`5 Nov 2026, 07:05`) y en el orden del CSV real. Datos inventados.
import { describe, expect, it } from 'vitest'
import { applyHevyWorkouts } from '../../src/main/modules/entreno/hevyApply'
import { HEVY_VIEW_COLUMNS, type HevyViewRow } from '../../src/shared/modules/entreno/types'
import { META, entrenoApp, escribir, serie, sesion } from './helpers'

describe('vista trn_v_hevy', () => {
  it('columnas, formato de fechas (día de un dígito, medianoche, sin fin) y orden', async () => {
    const { ctx, db } = await entrenoApp()
    escribir(ctx, () =>
      applyHevyWorkouts(db, {
        meta: META,
        newWorkouts: [
          sesion('Torso A', '2026-11-05T07:05', [serie('Remo ficticio', 1, 0), serie('Press ficticio', 0, 1), serie('Press ficticio', 0, 0)], {
            endTime: '2026-11-05T08:10',
            description: 'Buena sesión'
          }),
          sesion('Medianoche', '2027-01-01T00:00', [serie('Plancha ficticia', 0, 0, { weightKg: null, reps: null, durationSeconds: 60 })], {
            endTime: '2027-01-01T00:30'
          }),
          sesion('Sin fin', '2026-12-31T23:59', [serie('Curl ficticio', 0, 0, { rpe: 8.5, supersetId: '0', exerciseNotes: 'lento' })])
        ],
        changedWorkouts: []
      })
    )

    const res = db.all<HevyViewRow>('SELECT * FROM trn_v_hevy')
    expect(Object.keys(res[0])).toEqual([...HEVY_VIEW_COLUMNS])
    // Sesiones de la más reciente a la más antigua; dentro, por ejercicio y serie.
    expect(res.map((r) => [r.title, r.start_time, r.end_time, r.exercise_title, r.set_index])).toEqual([
      ['Medianoche', '1 Jan 2027, 00:00', '1 Jan 2027, 00:30', 'Plancha ficticia', 0],
      ['Sin fin', '31 Dec 2026, 23:59', null, 'Curl ficticio', 0],
      ['Torso A', '5 Nov 2026, 07:05', '5 Nov 2026, 08:10', 'Press ficticio', 0],
      ['Torso A', '5 Nov 2026, 07:05', '5 Nov 2026, 08:10', 'Press ficticio', 1],
      ['Torso A', '5 Nov 2026, 07:05', '5 Nov 2026, 08:10', 'Remo ficticio', 0]
    ])
    expect(res[1]).toEqual({
      title: 'Sin fin',
      start_time: '31 Dec 2026, 23:59',
      end_time: null,
      description: null,
      exercise_title: 'Curl ficticio',
      superset_id: '0',
      exercise_notes: 'lento',
      set_index: 0,
      set_type: 'normal',
      weight_kg: 60,
      reps: 8,
      distance_km: null,
      duration_seconds: null,
      rpe: 8.5
    })
    expect(res[0]).toMatchObject({ weight_kg: null, reps: null, duration_seconds: 60 })
    expect(res[2].description).toBe('Buena sesión')
  })

  it('todos los meses salen con su abreviatura inglesa', async () => {
    const { ctx, db } = await entrenoApp()
    const meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    escribir(ctx, () =>
      applyHevyWorkouts(db, {
        meta: META,
        newWorkouts: meses.map((_, i) => sesion(`Mes ${i + 1}`, `2026-${String(i + 1).padStart(2, '0')}-1${i % 2}T09:0${i % 10}`, [serie('Press', 0, 0)])),
        changedWorkouts: []
      })
    )
    const fechas = db.all<{ start_time: string }>('SELECT start_time FROM trn_v_hevy').map((r) => r.start_time).reverse()
    expect(fechas).toEqual(meses.map((m, i) => `1${i % 2} ${m} 2026, 09:0${i % 10}`))
  })
})
