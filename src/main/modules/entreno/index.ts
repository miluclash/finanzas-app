// Módulo Entreno: lo que registra en el núcleo.
//
// Sin `requiredTables`: el núcleo comprueba las tablas de una copia `.sqlite` ANTES de migrarla, y
// una copia de antes de Entreno (sin tablas trn_) tiene que poder restaurarse; al migrarla se crean
// las tablas de Entreno y sus datos iniciales.
import { ENTRENO_METRICS } from '@shared/modules/entreno/metrics'
import { defineModule } from '../../core/registry'
import { restoreEntrenoJson } from './exports'
import { createEntrenoHandlers, isEmpty } from './handlers'
import { MIGRATIONS } from './migrations'
import { autosaveWeeks } from './planning'
import { seedEntreno } from './seed'

export const entrenoModule = defineModule({
  id: 'entreno',
  name: 'Entreno',
  migrations: MIGRATIONS,
  ipc: (ctx, deps) => createEntrenoHandlers(ctx, deps.dialogs),
  restoreJson: (ctx, obj) => restoreEntrenoJson(ctx, obj),
  // Contrato actual del núcleo: solo id y nombre (el cálculo va por `entreno:metrics.compute`).
  metrics: ENTRENO_METRICS.map((m) => ({ id: m.id, name: m.name })),
  aiTools: [],
  seed: (db) => seedEntreno(db),
  // Guarda con el boceto las semanas empezadas sin plan (no escribe nada si no falta ninguna).
  startup: (ctx) => void autosaveWeeks(ctx.db, ctx.today()),
  isEmpty: (ctx) => isEmpty(ctx)
})
