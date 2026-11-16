// Módulo Finanzas: lo que registra en el núcleo.
import { defineModule } from '../../core/registry'
import { restoreFromJson } from './exports'
import { createFinanzasHandlers, isEmpty } from './handlers'
import { MIGRATIONS } from './migrations'
import { AppState } from './state'
import { seedIfEmpty } from './store'

export const finanzasModule = defineModule({
  id: 'finanzas',
  name: 'Finanzas',
  migrations: MIGRATIONS,
  ipc: (ctx, deps) => createFinanzasHandlers(AppState.for(ctx), deps.dialogs),
  metrics: [],
  aiTools: [],
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
