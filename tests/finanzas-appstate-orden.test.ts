// `AppState.init` tiene que encontrar el módulo de finanzas sea cual sea el orden de importación.
import { describe, expect, it } from 'vitest'
import { Db } from '../src/main/core/db'

describe('orden de importación del estado de finanzas', () => {
  for (const [nombre, primero] of [
    ['appState.ts y luego index.ts', ['appState', 'index']],
    ['metrics.ts primero', ['metrics', 'state']],
    ['state.ts', ['state']]
  ] as const) {
    it(nombre, async () => {
      const mods: Record<string, { AppState?: typeof import('../src/main/modules/finanzas/appState').AppState }> = {}
      for (const f of primero) mods[f] = await import(`../src/main/modules/finanzas/${f}.ts`)
      const AppState = (mods.appState ?? mods.state)?.AppState ?? (await import('../src/main/modules/finanzas/state')).AppState
      const idx = await import('../src/main/modules/finanzas/index')
      expect(idx.finanzasModule.metrics.length).toBeGreaterThan(0)
      const s = AppState.init(await Db.open(null), { dbPath: null, backupsDir: null })
      expect(s.ctx().accounts).toBeDefined()
    })
  }
})
