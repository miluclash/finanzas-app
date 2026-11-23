import type { HevySessionData, KindRule, SessionKind } from './types'

/** Minúsculas y sin tildes, para comparar reglas. */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Deduce el tipo de sesión con reglas editables. Gana la regla activa de mayor prioridad que case
 * (empate: la primera de la lista). Sin coincidencias: GYM.
 * `field: 'title'` mira el título de la sesión; `'exercise'`, los títulos de sus ejercicios.
 */
export function deduceKind(
  session: Pick<HevySessionData, 'title'> & { sets: { exerciseTitle: string }[] },
  rules: KindRule[]
): SessionKind {
  const title = normalizeText(session.title)
  const exercises = [...new Set(session.sets.map((s) => normalizeText(s.exerciseTitle)))]
  let best: KindRule | null = null
  for (const r of rules) {
    if (!r.active) continue
    const needle = normalizeText(r.contains)
    if (needle === '') continue
    const hit = r.field === 'title' ? title.includes(needle) : exercises.some((e) => e.includes(needle))
    if (hit && (best === null || r.priority > best.priority)) best = r
  }
  return best ? best.kind : 'GYM'
}
