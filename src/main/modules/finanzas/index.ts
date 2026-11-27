// Módulo Finanzas: lo que registra en el núcleo.
import { defineModule } from '../../core/registry'
import { FINANZAS_AI_TOOLS } from './aiTools'
import { restoreFromJson } from './exports'
import { createFinanzasHandlers, isEmpty } from './handlers'
import { MIGRATIONS } from './migrations'
import { FINANZAS_METRICS, finanzasMetricOptions } from './metrics'
import { AppState, registerFinanzasModule } from './appState'
import { seedIfEmpty } from './store'
import { finanzasSuggestions } from './suggestions'

export const finanzasModule = defineModule({
  id: 'finanzas',
  name: 'Finanzas',
  migrations: MIGRATIONS,
  ipc: (ctx, deps) => createFinanzasHandlers(AppState.for(ctx), deps.dialogs),
  metrics: FINANZAS_METRICS,
  metricOptions: (ctx, kind) => finanzasMetricOptions(ctx, kind),
  aiTools: FINANZAS_AI_TOOLS,
  suggestions: (ctx) => finanzasSuggestions(ctx),
  seed: (db) => {
    seedIfEmpty(db)
  },
  isEmpty: (ctx) => isEmpty(AppState.for(ctx)),
  requiredTables: ['accounts', 'transactions', 'categories'],
  restoreJson: (ctx, obj) => {
    if ((obj as { app?: unknown } | null)?.app !== 'finanzas-app') return false
    restoreFromJson(AppState.for(ctx), obj)
    return true
  }
})

registerFinanzasModule(finanzasModule)
