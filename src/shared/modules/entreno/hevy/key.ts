import type { IsoLocalDateTime } from './dates'

/**
 * Clave estable de una sesión de Hevy (`hevy_key` en trn_workouts): `título|start_time ISO local`.
 * El título se usa tal cual (sin recortar ni cambiar mayúsculas) y el ISO tiene longitud fija,
 * así que la clave no es ambigua aunque el título contenga `|`.
 * Ejemplo: `Torso A|2026-11-05T07:05`.
 */
export function hevyKey(title: string, startIso: IsoLocalDateTime): string {
  return `${title}|${startIso}`
}
