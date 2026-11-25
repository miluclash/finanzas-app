// Estaciones de HYROX y los nombres con los que pueden aparecer los ejercicios.
//
// Clave = nombre oficial en inglés de la estación; valor = otros nombres que cuentan como esa
// estación: en español (varios posibles) y los del catálogo de Hevy en inglés. Un ejercicio es de
// una estación si su nombre ES la clave o uno de los valores tras normalizar (minúsculas, sin
// tildes, sin espacios ni signos: `normalizeKey`). No basta con "contener": "Burpee" o
// "Farmers Walk(static)" no son estaciones.
//
// Lo usan la migración 2006 (propone la estación de los ejercicios que ya existían) y el alta de
// ejercicios (manual o al importar). La migración se aplica una sola vez: si este diccionario
// cambia más adelante, solo afecta a los ejercicios que se creen después; los existentes se
// cambian a mano en Ejercicios.
import { normalizeKey } from './normalize'

export const HYROX_STATIONS = {
  SkiErg: ['Esquí ergómetro', 'Ergómetro de esquí', 'Ski Erg', 'Ski Ergometer'],
  'Sled Push': ['Empuje de trineo', 'Empuje del trineo', 'Sled Push (Machine)'],
  'Sled Pull': ['Arrastre de trineo', 'Tirón de trineo', 'Tirón del trineo', 'Sled Pull (Machine)'],
  'Burpee Broad Jumps': ['Burpees con salto largo', 'Burpee con salto horizontal', 'Burpee con salto largo', 'Burpee Broad Jump'],
  Rowing: ['Remo ergómetro', 'Remo en máquina', 'Rowing Machine', 'Row Erg'],
  'Farmers Carry': ['Paseo del granjero', 'Transporte de granjero', 'Farmers Walk', "Farmer's Carry", "Farmer's Walk"],
  'Sandbag Lunges': ['Zancadas con saco', 'Zancadas con sandbag', 'Sandbag Lunge'],
  'Wall Balls': ['Lanzamientos a la pared', 'Lanzamiento a la pared', 'Wall Ball']
} as const satisfies Record<string, readonly string[]>

export type HyroxStation = keyof typeof HYROX_STATIONS

/** Las 8 estaciones, en el orden de la carrera. */
export const HYROX_STATION_KEYS = Object.keys(HYROX_STATIONS) as HyroxStation[]

/** Nombre normalizado → estación (las claves y todos sus nombres). */
const LOOKUP: ReadonlyMap<string, HyroxStation> = new Map(
  HYROX_STATION_KEYS.flatMap((k) => [k, ...HYROX_STATIONS[k]].map((n) => [normalizeKey(n), k] as const))
)

export function isHyroxStation(v: unknown): v is HyroxStation {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(HYROX_STATIONS, v)
}

/** Estación de un ejercicio por su nombre (igual tras normalizar), o null si no es ninguna. */
export function matchHyroxStation(title: string | null | undefined): HyroxStation | null {
  if (!title) return null
  return LOOKUP.get(normalizeKey(title)) ?? null
}
