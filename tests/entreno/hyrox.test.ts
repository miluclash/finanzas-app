// Diccionario de estaciones HYROX: coincidencia exacta tras normalizar (no "contiene").
import { describe, expect, it } from 'vitest'
import { HYROX_STATION_KEYS, HYROX_STATIONS, isHyroxStation, matchHyroxStation } from '../../src/shared/modules/entreno/hyrox'
import { normalizeKey } from '../../src/shared/modules/entreno/normalize'
import { MIGRATIONS } from '../../src/main/modules/entreno/migrations'

describe('estaciones HYROX', () => {
  it('son las 8 oficiales, en el orden de la carrera', () => {
    expect(HYROX_STATION_KEYS).toEqual([
      'SkiErg',
      'Sled Push',
      'Sled Pull',
      'Burpee Broad Jumps',
      'Rowing',
      'Farmers Carry',
      'Sandbag Lunges',
      'Wall Balls'
    ])
    expect(isHyroxStation('Rowing')).toBe(true)
    expect(isHyroxStation('rowing')).toBe(false)
    expect(isHyroxStation('toString')).toBe(false)
  })

  it('la migración 2006 admite exactamente las mismas claves en su CHECK', () => {
    const sql = MIGRATIONS.find((m) => m.version === 2006)!.up
    const lista = /hyrox_station IN\s*\(([^)]*)\)/.exec(sql)![1]
    expect([...lista.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual(HYROX_STATION_KEYS)
  })

  it('casa la clave, los nombres en español y los del catálogo de Hevy', () => {
    const casos: Array<[string, string]> = [
      ['SkiErg', 'SkiErg'],
      ['Ski Erg', 'SkiErg'],
      ['ski-erg', 'SkiErg'],
      ['Esquí ergómetro', 'SkiErg'],
      ['ESQUI ERGOMETRO', 'SkiErg'],
      ['Ergómetro de esquí', 'SkiErg'],
      ['Sled Push', 'Sled Push'],
      ['Sled Push (Machine)', 'Sled Push'],
      ['Empuje de trineo', 'Sled Push'],
      ['Arrastre de trineo', 'Sled Pull'],
      ['Tirón de trineo', 'Sled Pull'],
      ['Burpees con salto largo', 'Burpee Broad Jumps'],
      ['Burpee con salto horizontal', 'Burpee Broad Jumps'],
      ['Burpee Broad Jump', 'Burpee Broad Jumps'],
      ['Rowing Machine', 'Rowing'],
      ['Remo ergómetro', 'Rowing'],
      ['Remo en máquina', 'Rowing'],
      ['Farmers Walk', 'Farmers Carry'],
      ["Farmer's Carry", 'Farmers Carry'],
      ['Paseo del granjero', 'Farmers Carry'],
      ['Transporte de granjero', 'Farmers Carry'],
      ['Zancadas con saco', 'Sandbag Lunges'],
      ['Zancadas con sandbag', 'Sandbag Lunges'],
      ['Wall Ball', 'Wall Balls'],
      ['wall balls', 'Wall Balls'],
      ['Lanzamientos a la pared', 'Wall Balls']
    ]
    for (const [nombre, estacion] of casos) expect([nombre, matchHyroxStation(nombre)]).toEqual([nombre, estacion])
  })

  it('no basta con contener el nombre: Burpee, Farmers Walk(static) y parecidos no son estaciones', () => {
    for (const nombre of ['Burpee', 'Farmers Walk(static)', 'Farmers Walk (static)', 'Remo con barra', 'Sled', 'Wall Ball Squat', 'Rowing (Machine) suave', '', '  '])
      expect([nombre, matchHyroxStation(nombre)]).toEqual([nombre, null])
    expect(matchHyroxStation(null)).toBeNull()
    expect(matchHyroxStation(undefined)).toBeNull()
  })

  it('ningún nombre normalizado está en dos estaciones', () => {
    const vistos = new Map<string, string>()
    for (const k of HYROX_STATION_KEYS)
      for (const n of [k, ...HYROX_STATIONS[k]]) {
        const key = normalizeKey(n)
        expect(key.length).toBeGreaterThan(0)
        const prev = vistos.get(key)
        if (prev) expect(prev).toBe(k)
        vistos.set(key, k)
      }
  })

  it('normalizeKey: minúsculas, sin tildes, sin espacios ni signos', () => {
    expect(normalizeKey('  Fuerza A! ')).toBe('fuerzaa')
    expect(normalizeKey('Natación — técnica')).toBe('nataciontecnica')
    expect(normalizeKey('Año 2')).toBe('ano2')
  })
})
