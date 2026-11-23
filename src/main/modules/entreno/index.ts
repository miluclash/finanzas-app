// Módulo Entreno: lo que registra en el núcleo.
//
// Sin `requiredTables`: el núcleo comprueba las tablas de una copia `.sqlite` ANTES de migrarla, y
// una copia de antes de Entreno (sin tablas trn_) tiene que poder restaurarse; al migrarla se crean
// las tablas de Entreno y sus datos iniciales.
import { defineModule } from '../../core/registry'
import { restoreEntrenoJson } from './exports'
import { createEntrenoHandlers, isEmpty } from './handlers'
import { MIGRATIONS } from './migrations'
import { seedEntreno } from './seed'

export const entrenoModule = defineModule({
  id: 'entreno',
  name: 'Entreno',
  migrations: MIGRATIONS,
  ipc: (ctx, deps) => createEntrenoHandlers(ctx, deps.dialogs),
  restoreJson: (ctx, obj) => restoreEntrenoJson(ctx, obj),
  metrics: [],
  aiTools: [],
  seed: (db) => seedEntreno(db),
  isEmpty: (ctx) => isEmpty(ctx)
})
