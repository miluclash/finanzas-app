// Sugerencias de Finanzas para el asistente (F6): los avisos que ya calcula la app (`computeAlerts`),
// sin cambiar su lógica, con la forma de `AiSuggestion`. Funcionan aunque Ollama esté apagado.
import { createHash } from 'node:crypto'
import type { AiSuggestion, AiSuggestionSeverity } from '@shared/core/ai-types'
import { computeAlerts, type Alert } from '@shared/modules/finanzas/dashboard'
import type { CoreContext } from '../../core/context'
import { AppState } from './appState'

const SEVERITY: Record<Alert['level'], AiSuggestionSeverity> = { error: 'warning', warn: 'warning', info: 'info' }

const SECTION: Record<string, string> = {
  movimientos: 'Movimientos',
  cuentas: 'Cuentas',
  presupuestos: 'Presupuestos',
  objetivos: 'Objetivos',
  prevision: 'Previsión',
  recurrentes: 'Recurrentes',
  inversiones: 'Inversiones'
}

/** Ruta de la app: los avisos usan las rutas antiguas de finanzas (`/presupuestos` → `/finanzas/presupuestos`). */
export function alertHref(link: string | undefined): string {
  if (!link || link === '/') return '/finanzas'
  return link.startsWith('/finanzas') ? link : `/finanzas${link}`
}

/**
 * Clave estable de un aviso: su enlace y su texto sin cifras (así «3 movimientos pendientes» y
 * «4 movimientos pendientes» son la misma sugerencia).
 */
function alertId(a: Alert): string {
  const shape = `${a.link ?? '/'}|${a.text.replace(/[\d.,]+/g, '#')}`
  return `finanzas.alert.${createHash('sha1').update(shape).digest('hex').slice(0, 12)}`
}

export function finanzasSuggestions(ctx: CoreContext): AiSuggestion[] {
  const s = AppState.for(ctx)
  const today = s.today()
  const out: AiSuggestion[] = []
  const seen = new Set<string>()
  for (const a of computeAlerts(s.ctx())) {
    let id = alertId(a)
    for (let n = 2; seen.has(id); n++) id = `${alertId(a)}.${n}`
    seen.add(id)
    const section = SECTION[(a.link ?? '/').replace(/^\//, '').split(/[/?]/)[0]] ?? 'Finanzas'
    out.push({ id, module: 'finanzas', severity: SEVERITY[a.level], title: a.text, detail: `Míralo en ${section}.`, href: alertHref(a.link), asOf: today })
  }
  return out
}
