// Lógica pura de métricas de Entreno (§6 de docs/EVOLUCION.md). Sin base de datos, sin Electron y
// sin reloj: la fecha de "hoy" entra siempre como parámetro.
//
// Uso: `const ctx = prepareMetrics(facts, settings)` una vez por petición y luego las funciones.
export * from './types'
export * from './weeks'
export * from './context'
export * from './volume'
export * from './records'
export * from './plan'
export * from './goals'
export * from './event'
export * from './trend'
export * from './registry'
export * from './adapt'
export * from './views'
export * from './chart'
export * from './review'
