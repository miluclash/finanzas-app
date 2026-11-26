// Módulo Entreno: lo que registra en el núcleo.
//
// Sin `requiredTables`: el núcleo comprueba las tablas de una copia `.sqlite` ANTES de migrarla, y
// una copia de antes de Entreno (sin tablas trn_) tiene que poder restaurarse; al migrarla se crean
// las tablas de Entreno y sus datos iniciales.
import { ENTRENO_CHART_METRICS, entrenoMetricOptions } from '@shared/modules/entreno/metrics'
import { defineModule, type MetricDef } from '../../core/registry'
import { restoreEntrenoJson } from './exports'
import { createEntrenoHandlers, isEmpty } from './handlers'
import { metricsServiceFor } from './metrics'
import { MIGRATIONS } from './migrations'
import { autosaveWeeks } from './planning'
import { seedEntreno } from './seed'

/**
 * Métricas con el contrato del núcleo (`entreno.<id>`). Calculan sobre el contexto de métricas en
 * caché (el mismo que usan los handlers `entreno:metrics.*`, que no cambian).
 */
const metrics: MetricDef[] = ENTRENO_CHART_METRICS.map(({ localId: _local, compute, ...meta }) => ({
  ...meta,
  compute: (ctx, q) => compute(metricsServiceFor(ctx).context(), q)
}))

export const entrenoModule = defineModule({
  id: 'entreno',
  name: 'Entreno',
  migrations: MIGRATIONS,
  ipc: (ctx, deps) => createEntrenoHandlers(ctx, deps.dialogs),
  restoreJson: (ctx, obj) => restoreEntrenoJson(ctx, obj),
  metrics,
  metricOptions: (ctx, kind) => entrenoMetricOptions(metricsServiceFor(ctx).context(), kind),
  aiTools: [],
  seed: (db) => seedEntreno(db),
  // Guarda con el boceto las semanas empezadas sin plan (no escribe nada si no falta ninguna).
  startup: (ctx) => void autosaveWeeks(ctx.db, ctx.today()),
  isEmpty: (ctx) => isEmpty(ctx)
})
