// Fusión de un panel guardado con su diseño por defecto. La hace la interfaz al cargar (el diseño
// por defecto y el registro de tarjetas fijas viven en ella); el proceso principal devuelve la fila
// tal cual.
//
// - Sin fila guardada: el diseño por defecto, todo visible.
// - Tarjetas fijas con un id que ya no existe (o que no se puede usar en este panel): fuera.
// - Gráficos cuyo `ref` ya no existe: fuera.
// - Ids de tarjeta repetidos: se queda la primera. Una tarjeta fija no se repite.
// - Tarjetas fijas del diseño por defecto que no están en la lista guardada: al final, visibles.
// Las fijas nunca se eliminan: solo se ocultan (`hidden`).
import type { CardSize, DashboardCard, DashboardDefault } from '../metrics-types'

type DefaultCards = DashboardDefault | readonly { ref: string; size: CardSize }[]
type IdSet = ReadonlySet<string> | readonly string[]

const has = (s: IdSet, v: string) => (Array.isArray(s) ? (s as readonly string[]).includes(v) : (s as ReadonlySet<string>).has(v))

/** Id de tarjeta de una fija (estable: uno por tarjeta fija y panel). */
export const fixedCardId = (ref: string): string => `fixed:${ref}`

/** Id nuevo para una tarjeta de gráfico, que no choque con los que ya hay. */
export function chartCardId(ref: string | number, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = `chart:${ref}`
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}:${n}`)) n++
  return `${base}:${n}`
}

/** Tarjetas del diseño por defecto, todas visibles. */
export function defaultCards(defaults: DefaultCards): DashboardCard[] {
  const list = 'cards' in defaults ? defaults.cards : defaults
  return list.map((c) => ({ id: fixedCardId(c.ref), type: 'fixed', ref: c.ref, size: c.size, hidden: false }))
}

export function mergeDashboard(
  saved: readonly DashboardCard[] | null,
  defaults: DefaultCards,
  knownFixedIds: IdSet,
  existingChartIds: IdSet
): DashboardCard[] {
  const defs = defaultCards(defaults).filter((c) => has(knownFixedIds, c.ref))
  if (!saved) return defs
  const out: DashboardCard[] = []
  const ids = new Set<string>()
  const fixed = new Set<string>()
  for (const c of saved) {
    if (ids.has(c.id)) continue
    if (c.type === 'fixed') {
      if (!has(knownFixedIds, c.ref) || fixed.has(c.ref)) continue
      fixed.add(c.ref)
    } else if (!has(existingChartIds, c.ref)) continue
    ids.add(c.id)
    out.push({ ...c })
  }
  for (const d of defs) {
    if (fixed.has(d.ref)) continue
    let id = d.id
    for (let n = 2; ids.has(id); n++) id = `${d.id}:${n}`
    ids.add(id)
    fixed.add(d.ref)
    out.push({ ...d, id })
  }
  return out
}
