// Asistente con la app entera (finanzas + entreno, cola y almacén reales) y un proveedor falso:
// handlers `core:ai.*`, herramientas de cada módulo, que proponer no escribe nada, que confirmar pasa
// por la cola con la etiqueta del handler de la página, propuestas caducadas y sugerencias.
// Datos inventados. Hoy = miércoles 25/11/2026.
import { describe, expect, it, vi } from 'vitest'
import { createAppHandlers } from '../../../src/main/app'
import type { Assistant } from '../../../src/main/core/ai/assistant'
import { toolResultText } from '../../../src/main/core/ai/assistant'
import { CORE_AI_TOOLS } from '../../../src/main/core/ai/coreTools'
import type { CoreContext } from '../../../src/main/core/context'
import { AppState } from '../../../src/main/modules/finanzas/state'
import { AI_TOOL_RESULT_MAX_CHARS, AI_TX_SEARCH_MAX, type AiProposal, type AiReadToolDef } from '../../../src/shared/core/ai-types'
import { account, cat, tx } from '../../helpers'
import { entrenoApp, noDialogs } from '../../entreno/helpers'
import { FakeProvider, calls, eventLog, text, type Script } from './fakes'

const HOY = '2026-11-25'

/** Los importes llevan espacios duros (formato español); para comparar, espacios normales. */
function plano<T>(x: T): T {
  return JSON.parse(JSON.stringify(x).replace(/[  ]/g, ' ')) as T
}

async function montar() {
  const app = await entrenoApp()
  app.ctx.todayOverride = HOY
  const s = AppState.for(app.ctx)
  const acc = account(s, { name: 'Cuenta corriente', openingBalanceCents: 100_000 })
  const steam = ['2026-11-03', '2026-11-10', '2026-11-17'].map((date, i) =>
    tx(s, { accountId: acc.id, amountCents: -(999 + i), description: `Steam juego ${i + 1}`, date, categoryId: cat(s, 'Otros gastos') })
  )
  const super1 = tx(s, { accountId: acc.id, amountCents: -4520, description: 'Mercadona', date: '2026-11-05' })
  tx(s, { accountId: acc.id, amountCents: 250_000, description: 'Nómina noviembre', date: '2026-11-01' })
  let script: Script = () => text('Hola.')
  const provider = new FakeProvider((r, n) => script(r, n))
  const log = eventLog()
  let assistant!: Assistant<CoreContext>
  const h = createAppHandlers(app.ctx, noDialogs, '0.0.0', {
    aiProvider: () => provider,
    aiEmit: log.emit,
    onAssistant: (a) => {
      assistant = a
    }
  })
  /** Una pregunta en la que el modelo llama a una herramienta y después contesta. */
  const proponer = async (tool: string, args: Record<string, unknown>): Promise<{ proposals: AiProposal[]; toolResult: string }> => {
    script = (_r, n) => (n % 2 === 0 ? calls([tool, args]) : text('Listo: revísalo y confírmalo en la tarjeta.'))
    provider.requests.length = 0
    const r = await h['core:ai.send']({ threadId: null, text: 'hazlo' })
    await assistant.wait(r.runId)
    const msgs = h['core:ai.threads.get'](r.threadId)!.messages
    const final = msgs.filter((m) => m.role === 'assistant').at(-1)!
    return plano({ proposals: final.proposals ?? [], toolResult: msgs.find((m) => m.role === 'tool')?.content ?? '' })
  }
  const tool = (name: string) => {
    const t = app.ctx.registry.aiTool(name) ?? CORE_AI_TOOLS.find((x) => x.name === name)
    if (!t) throw new Error(`falta ${name}`)
    return t
  }
  const leer = (name: string, args: unknown = {}) => plano((tool(name) as AiReadToolDef<CoreContext>).run(app.ctx, args)) as Record<string, unknown>
  return { app, s, acc, steam, super1, h, provider, log, proponer, leer, tool, setScript: (x: Script) => (script = x), get assistant() { return assistant } }
}

describe('core:ai.* con la app entera', () => {
  it('las acciones son exactamente las decididas (fuera cuentas, categorías, inversiones, reglas, ajustes, importaciones)', async () => {
    const { app } = await montar()
    const acciones = app.ctx.registry.aiTools.filter((t) => t.kind === 'action').map((t) => t.name).sort()
    expect(acciones).toEqual(
      [
        'entreno_evento_guardar',
        'entreno_objetivo_estado',
        'entreno_objetivo_guardar',
        'entreno_rutina_guardar',
        'entreno_semana_guardar',
        'entreno_semana_mover',
        'entreno_semana_quitar',
        'entreno_sesion_datos',
        'entreno_sesion_guardar',
        'finanzas_movimiento_borrar',
        'finanzas_movimiento_crear',
        'finanzas_movimiento_editar',
        'finanzas_movimientos_categoria',
        'finanzas_movimientos_estado',
        'finanzas_movimientos_recategorizar',
        'finanzas_objetivo_guardar',
        'finanzas_presupuesto_fijar'
      ].sort()
    )
  })

  it('send, eventos, conversación guardada, borrar y borrar todo', async () => {
    const { h, log, assistant } = await montar()
    const r = await h['core:ai.send']({ threadId: null, text: '¿Qué tal voy este mes?' })
    await assistant.wait(r.runId)
    expect(log.types()).toEqual(['start', 'delta', 'message', 'done'])
    expect(h['core:ai.threads.list']().map((t) => t.title)).toEqual(['¿Qué tal voy este mes?'])
    expect(h['core:ai.threads.get'](r.threadId)!.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    await h['core:ai.threads.delete'](r.threadId)
    expect(h['core:ai.threads.get'](r.threadId)).toBeNull()
    const r2 = await h['core:ai.send']({ threadId: null, text: 'otra' })
    await assistant.wait(r2.runId)
    expect(await h['core:ai.threads.deleteAll']()).toBe(1)
    expect(h['core:ai.cancel']('no-existe')).toBe(false)
  })

  it('estado y ajustes: el proveedor falso responde; una URL que no es local se rechaza', async () => {
    const { h, provider } = await montar()
    expect((await h['core:ai.status']()).state).toBe('ready')
    provider.models = []
    expect((await h['core:ai.status']()).state).toBe('model_missing')
    expect(h['core:ai.settings.get']().model).toBe('qwen3:8b')
    await expect(h['core:ai.settings.save']({ baseUrl: 'http://ejemplo.invalid:11434' })).rejects.toThrow(/este equipo/)
    expect((await h['core:ai.settings.save']({ enabled: false })).enabled).toBe(false)
    expect((await h['core:ai.status']()).state).toBe('disabled')
    await expect(h['core:ai.send']({ threadId: null, text: 'hola' })).rejects.toThrow(/apagado/)
  })

  it('sugerencias: los avisos de finanzas (con su ruta) y la revisión de entreno, aunque Ollama no responda', async () => {
    const { h, s, acc, provider } = await montar()
    tx(s, { accountId: acc.id, amountCents: -1000, description: 'Por revisar', status: 'PENDING_REVIEW' })
    provider.listError = new Error('apagado')
    const sug = h['core:ai.suggestions']()
    const pend = sug.find((x) => x.module === 'finanzas' && /pendientes de revisar/.test(x.title))
    expect(pend).toMatchObject({ severity: 'warning', href: '/finanzas/movimientos?vista=revision', asOf: HOY })
    expect(pend!.id).toMatch(/^finanzas\.alert\./)
    expect(new Set(sug.map((x) => x.id)).size).toBe(sug.length)
    // El id no depende de la cifra: con otro pendiente más, la sugerencia es la misma.
    tx(s, { accountId: acc.id, amountCents: -2000, description: 'Otra por revisar', status: 'PENDING_REVIEW' })
    expect(h['core:ai.suggestions']().find((x) => /pendientes de revisar/.test(x.title))!.id).toBe(pend!.id)
  })
})

describe('herramientas de finanzas', () => {
  it('lectura: resumen del mes, alertas, presupuestos, objetivos, patrimonio, categorías y cuentas, en € y recortadas', async () => {
    const { leer } = await montar()
    const r = leer('finanzas_resumen_mes')
    expect(r).toMatchObject({ mes: '2026-11', ingresos: '2.500,00 €', movimientos: 5 })
    expect(r.gastos).toBe('75,20 €')
    expect((r.gastosPorCategoria as Array<{ categoria: string }>)[0].categoria).toBe('Alimentación')
    for (const name of ['finanzas_alertas', 'finanzas_presupuestos', 'finanzas_objetivos', 'finanzas_patrimonio', 'finanzas_categorias', 'finanzas_cuentas']) {
      const out = leer(name)
      expect(toolResultText(out).length, name).toBeLessThanOrEqual(AI_TOOL_RESULT_MAX_CHARS)
    }
    expect((leer('finanzas_cuentas').cuentas as Array<{ saldo: string }>)[0].saldo).toBe('3.424,80 €')
    expect(() => leer('finanzas_resumen_mes', { mes: 'noviembre' })).toThrow(/Argumentos no válidos/)
  })

  it(`buscar movimientos: filtros por texto, categoría (por nombre) e importe; como mucho ${AI_TX_SEARCH_MAX}`, async () => {
    const { leer, s, acc } = await montar()
    const r = leer('finanzas_movimientos_buscar', { texto: 'steam' })
    expect(r.coincidencias).toBe(3)
    expect((r.movimientos as Array<{ descripcion: string }>).map((m) => m.descripcion)).toEqual(['Steam juego 3', 'Steam juego 2', 'Steam juego 1'])
    expect(r.suma).toBe('-30,00 €')
    expect(leer('finanzas_movimientos_buscar', { categoria: 'alimentacion' }).coincidencias).toBe(1)
    expect(leer('finanzas_movimientos_buscar', { importeMin: 40 }).coincidencias).toBe(2)
    for (let i = 0; i < 60; i++) tx(s, { accountId: acc.id, amountCents: -100, description: `Café ${i}`, date: '2026-10-02' })
    const muchos = leer('finanzas_movimientos_buscar', { texto: 'café', limite: AI_TX_SEARCH_MAX })
    expect(muchos.coincidencias).toBe(60)
    expect((muchos.movimientos as unknown[]).length).toBe(AI_TX_SEARCH_MAX)
    expect(muchos.recortado).toMatch(/50/)
    expect(() => leer('finanzas_movimientos_buscar', { limite: AI_TX_SEARCH_MAX + 1 })).toThrow(/Argumentos no válidos/)
    expect(toolResultText(muchos).length).toBeLessThanOrEqual(AI_TOOL_RESULT_MAX_CHARS)
  })

  it('recategorizar por criterio: un grupo; proponer no escribe nada y confirmar pasa por la cola (finanzas:tx.save)', async () => {
    const { app, s, h, proponer, steam } = await montar()
    const ocio = cat(s, 'Entretenimiento')
    const enqueue = vi.spyOn(app.ctx.queue, 'enqueue')
    const auditAntes = app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'transactions'")!.n
    const { proposals, toolResult } = await proponer('finanzas_movimientos_recategorizar', { texto: 'steam', categoriaNueva: 'entretenimiento' })
    expect(toolResult).toMatch(/pendiente de confirmar/)
    expect(proposals).toHaveLength(1)
    const p = proposals[0]
    expect(p.mode).toBe('group')
    expect(p.criterion).toBe('pasar a «Entretenimiento» los movimientos cuya descripción o comercio contiene «steam»')
    expect(p.changes.map((c) => c.entityId).sort()).toEqual(steam.map((t) => t.id).sort())
    expect(p.changes[0].fields).toEqual([{ label: 'Categoría', before: 'Otros gastos', after: 'Entretenimiento' }])
    // Mientras se proponía solo escribió el almacén del asistente.
    expect(enqueue.mock.calls.map((c) => c[0]).every((l) => l.startsWith('core:ai.'))).toBe(true)
    expect(steam.every((t) => s.ctx().txById.get(t.id)!.categoryId !== ocio)).toBe(true)
    expect(app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'transactions'")!.n).toBe(auditAntes)

    enqueue.mockClear()
    const out = await h['core:ai.proposals.accept']({ proposalId: p.id })
    expect(out.status).toBe('applied')
    expect(enqueue.mock.calls.map((c) => c[0]).filter((l) => l.startsWith('finanzas:'))).toEqual(['finanzas:tx.save', 'finanzas:tx.save', 'finanzas:tx.save'])
    expect(steam.every((t) => s.ctx().txById.get(t.id)!.categoryId === ocio)).toBe(true)
    expect(app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'transactions'")!.n).toBe(auditAntes + 3)
    // La propuesta queda guardada como aplicada en su mensaje.
    const msg = h['core:ai.threads.get'](p.threadId)!.messages.find((m) => m.id === p.messageId)!
    expect(msg.proposals![0].status).toBe('applied')
  })

  it('caduca si el movimiento cambia antes de confirmar; descartar no escribe', async () => {
    const { s, h, proponer, steam } = await montar()
    const { proposals } = await proponer('finanzas_movimiento_editar', { id: steam[0].id, importe: 20 })
    expect(proposals.map((p) => p.mode)).toEqual(['single'])
    expect(proposals[0].changes[0].fields).toEqual([{ label: 'Importe', before: '-9,99 €', after: '-20,00 €' }])
    await h['finanzas:tx.save']({ ...s.ctx().txById.get(steam[0].id)!, description: 'Cambiado a mano' })
    const out = await h['core:ai.proposals.accept']({ proposalId: proposals[0].id })
    expect(out.status).toBe('stale')
    expect(s.ctx().txById.get(steam[0].id)!.amountCents).toBe(-999)

    const { proposals: p2 } = await proponer('finanzas_movimientos_estado', { ids: [steam[1].id, steam[2].id], estado: 'anulado' })
    expect(p2.map((p) => p.mode)).toEqual(['single', 'single'])
    expect((await h['core:ai.proposals.reject'](p2[0].id)).status).toBe('rejected')
    expect(s.ctx().txById.get(steam[1].id)!.status).toBe('CONFIRMED')
    expect((await h['core:ai.proposals.accept']({ proposalId: p2[1].id })).status).toBe('applied')
    expect(s.ctx().txById.get(steam[2].id)!.status).toBe('CANCELLED')
  })

  it('crear, cambiar categoría y borrar movimientos; presupuesto y objetivo', async () => {
    const { s, h, proponer, super1, acc } = await montar()
    const crear = await proponer('finanzas_movimiento_crear', {
      fecha: '2026-11-24',
      descripcion: 'Cine',
      importe: 8.5,
      tipo: 'gasto',
      categoria: 'Entretenimiento',
      cuenta: 'cuenta corriente'
    })
    expect(crear.proposals[0].changes[0]).toMatchObject({ op: 'create', label: 'Cine · -8,50 € · 24/11/2026', fingerprint: null })
    await h['core:ai.proposals.accept']({ proposalId: crear.proposals[0].id })
    const cine = s.ctx().transactions.find((t) => t.description === 'Cine')!
    expect(cine).toMatchObject({ amountCents: -850, type: 'EXPENSE', accountId: acc.id, source: 'Asistente' })

    const cambio = await proponer('finanzas_movimientos_categoria', { ids: [super1.id], categoria: 'Salud' })
    await h['core:ai.proposals.accept']({ proposalId: cambio.proposals[0].id })
    expect(s.ctx().txById.get(super1.id)!.categoryId).toBe(cat(s, 'Salud'))

    const borrar = await proponer('finanzas_movimiento_borrar', { ids: [cine.id] })
    expect(borrar.proposals[0].changes[0].op).toBe('delete')
    await h['core:ai.proposals.accept']({ proposalId: borrar.proposals[0].id })
    expect(s.ctx().txById.has(cine.id)).toBe(false)

    const pres = await proponer('finanzas_presupuesto_fijar', { mes: '2026-11', categoria: 'Alimentación', importe: 300 })
    expect(pres.proposals[0].changes[0]).toMatchObject({ op: 'create', fields: [{ label: 'Presupuesto', before: null, after: '300,00 €' }] })
    await h['core:ai.proposals.accept']({ proposalId: pres.proposals[0].id })
    const linea = h['finanzas:budgets.report']('2026-11').lines.find((l) => l.categoryId === cat(s, 'Alimentación'))!
    expect(linea.budgetCents).toBe(30_000)

    const obj = await proponer('finanzas_objetivo_guardar', { nombre: 'Viaje', objetivo: 1200, fechaLimite: '2027-06-30' })
    await h['core:ai.proposals.accept']({ proposalId: obj.proposals[0].id })
    const g = s.ctx().goals.find((x) => x.name === 'Viaje')!
    expect(g).toMatchObject({ targetCents: 120_000, deadline: '2027-06-30', status: 'ACTIVE' })
    const pausa = await proponer('finanzas_objetivo_guardar', { id: g.id, estado: 'PAUSED' })
    expect(pausa.proposals[0].changes[0].fields).toEqual([{ label: 'Estado', before: 'Activo', after: 'En pausa' }])
  })

  it('un error en el plan vuelve al modelo como texto y no crea propuestas', async () => {
    const { proponer } = await montar()
    const r = await proponer('finanzas_movimiento_crear', { fecha: '2026-11-24', descripcion: 'X', importe: 5, tipo: 'gasto', categoria: 'No existe nada así' })
    expect(r.proposals).toEqual([])
    expect(r.toolResult).toMatch(/^Error: No encuentro la categoría/)
  })
})

describe('herramientas del núcleo', () => {
  it('métricas: lista, cálculo en € y opciones', async () => {
    const { leer } = await montar()
    const lista = leer('core_metricas_lista', { modulo: 'finanzas' }) as unknown as Array<{ id: string }>
    expect(lista.some((m) => m.id === 'finanzas.gastos')).toBe(true)
    const r = leer('core_metrica_calcular', { metrica: 'finanzas.gastos', desde: '2026-11-01', hasta: '2026-11-30', agrupar: 'month' })
    expect(r.puntos).toEqual([{ clave: '2026-11', valor: '75,20 €' }])
    expect(() => leer('core_metrica_calcular', { metrica: 'no.existe', agrupar: 'month' })).toThrow(/no existe/)
    expect((leer('core_metrica_opciones', { tipo: 'category' }).opciones as unknown[]).length).toBeGreaterThan(0)
  })

  it('gráfico: propuesta con vista previa; al confirmar se guarda con core:charts.save', async () => {
    const { h, proponer, app } = await montar()
    const enqueue = vi.spyOn(app.ctx.queue, 'enqueue')
    const { proposals } = await proponer('core_grafico_crear', {
      titulo: 'Gastos por mes',
      tipo: 'bar',
      series: [{ metrica: 'finanzas.gastos' }],
      agrupar: 'month',
      rango: { tipo: 'ultimos', unidad: 'month', cantidad: 12 },
      objetivo: 1500
    })
    const c = proposals[0].changes[0]
    expect(c.preview).toMatchObject({ kind: 'chart', title: 'Gastos por mes', spec: { version: 1, type: 'bar', target: 150_000 } })
    expect(h['core:charts.list']()).toEqual([])
    expect(enqueue.mock.calls.some((x) => x[0] === 'core:charts.save')).toBe(false)
    await h['core:ai.proposals.accept']({ proposalId: proposals[0].id })
    expect(enqueue.mock.calls.some((x) => x[0] === 'core:charts.save')).toBe(true)
    expect(h['core:charts.list']().map((x) => x.title)).toEqual(['Gastos por mes'])
    const malo = await proponer('core_grafico_crear', {
      titulo: 'Malo',
      tipo: 'scatter',
      series: [{ metrica: 'finanzas.gastos' }],
      agrupar: 'month',
      rango: { tipo: 'este', unidad: 'year' }
    })
    expect(malo.proposals).toEqual([])
    expect(malo.toolResult).toMatch(/dispersión/)
  })
})

describe('herramientas de entreno', () => {
  async function conEntreno() {
    const m = await montar()
    const h = m.h
    const press = await h['entreno:exercises.save']({ title: 'Press banca ficticio' })
    const sentadilla = await h['entreno:exercises.save']({ title: 'Sentadilla ficticia' })
    const torso = await h['entreno:routines.save']({ name: 'Torso A', kind: 'GYM', items: [{ exerciseId: press.id, targetSets: 3, repsMin: 6, repsMax: 8 }] })
    const pierna = await h['entreno:routines.save']({ name: 'Pierna', kind: 'GYM' })
    await h['entreno:baseWeek.save']([
      { weekday: 4, routineId: torso.id, time: '18:00' },
      { weekday: 5, routineId: pierna.id }
    ])
    return { ...m, press, sentadilla, torso, pierna }
  }

  it('lectura: semana, «¿qué me toca?», resumen, objetivos, récords, listas y revisión semanal', async () => {
    const { leer } = await conEntreno()
    const sem = leer('entreno_semana')
    expect(sem).toMatchObject({ desde: '2026-11-23', hasta: '2026-11-29' })
    expect(leer('entreno_proxima_sesion')).toMatchObject({
      proxima: { fecha: '2026-11-26', dia: 'jueves', rutina: 'Torso A', hora: '18:00', ejercicios: [{ ejercicio: 'Press banca ficticio', series: 3, reps: '6-8' }] }
    })
    for (const name of [
      'entreno_resumen',
      'entreno_objetivos',
      'entreno_records',
      'entreno_ejercicios',
      'entreno_grupos_musculares',
      'entreno_rutinas',
      'entreno_eventos',
      'entreno_sesiones_buscar',
      'entreno_revision_semanal'
    ]) {
      const out = leer(name)
      expect(toolResultText(out).length, name).toBeLessThanOrEqual(AI_TOOL_RESULT_MAX_CHARS)
    }
    expect((leer('entreno_ejercicios', { texto: 'press' }).ejercicios as Array<{ nombre: string }>).map((e) => e.nombre)).toEqual(['Press banca ficticio'])
  })

  it('sesión manual, datos extra, evento, objetivos, rutina y plan de la semana: proponer y confirmar', async () => {
    const { h, proponer, app, torso } = await conEntreno()
    const enqueue = vi.spyOn(app.ctx.queue, 'enqueue')
    const accept = async (ps: AiProposal[]) => {
      expect(ps).toHaveLength(1)
      const out = await h['core:ai.proposals.accept']({ proposalId: ps[0].id })
      expect(out.status, JSON.stringify(out.changes.map((c) => c.error))).toBe('applied')
      return out
    }
    const labels = () => enqueue.mock.calls.map((c) => c[0]).filter((l) => l.startsWith('entreno:'))

    await accept(
      (
        await proponer('entreno_sesion_guardar', {
          titulo: 'Torso A',
          inicio: '2026-11-24T07:00',
          fin: '2026-11-24T08:00',
          rutina: 'Torso A',
          ejercicios: [{ ejercicio: 'press banca', series: [{ pesoKg: 80, reps: 8 }, { pesoKg: 80, reps: 7 }] }]
        })
      ).proposals
    )
    const w = h['entreno:workouts.list']({}).find((x) => x.startTime === '2026-11-24T07:00')!
    expect(w).toMatchObject({ source: 'MANUAL', routineId: torso.id, setCount: 2 })
    await accept((await proponer('entreno_sesion_datos', { id: w.id, esfuerzo: 8, notas: 'Buena' })).proposals)
    expect(h['entreno:workouts.get'](w.id)).toMatchObject({ perceivedEffort: 8, notes: 'Buena' })

    await accept((await proponer('entreno_evento_guardar', { nombre: 'Carrera ficticia', fecha: '2027-03-20' })).proposals)
    expect(h['entreno:events.list']().map((e) => e.name)).toEqual(['Carrera ficticia'])

    await accept((await proponer('entreno_objetivo_guardar', { nombre: 'Press a 100', tipo: 'E1RM', ejercicio: 'Press banca ficticio', objetivo: 100 })).proposals)
    const g = h['entreno:goals.list']().find((x) => x.name === 'Press a 100')!
    await accept((await proponer('entreno_objetivo_estado', { id: g.id, estado: 'ACHIEVED' })).proposals)
    expect(h['entreno:goals.list']().find((x) => x.id === g.id)!.status).toBe('ACHIEVED')

    await accept((await proponer('entreno_rutina_guardar', { nombre: 'Natación técnica', tipo: 'SWIM' })).proposals)
    expect(h['entreno:routines.list']().map((r) => r.name)).toContain('Natación técnica')

    await accept(
      (
        await proponer('entreno_semana_guardar', {
          semana: '2026-11-30',
          sesiones: [
            { fecha: '2026-12-01', rutina: 'Torso A' },
            { fecha: '2026-12-03', rutina: 'Natación técnica', hora: '19:00' }
          ]
        })
      ).proposals
    )
    const plan = () => h['entreno:weekPlan.get']('2026-11-30')
    expect((await plan()).slots.map((x) => [x.date, x.routineName])).toEqual([
      ['2026-12-01', 'Torso A'],
      ['2026-12-03', 'Natación técnica']
    ])
    await accept((await proponer('entreno_semana_mover', { desde: '2026-12-01', hasta: '2026-12-02' })).proposals)
    expect((await plan()).slots.map((x) => x.date)).toEqual(['2026-12-02', '2026-12-03'])
    await accept((await proponer('entreno_semana_quitar', { fecha: '2026-12-03', rutina: 'natación' })).proposals)
    expect((await plan()).slots.map((x) => x.routineName)).toEqual(['Torso A'])

    expect(labels()).toEqual([
      'entreno:workouts.saveManual',
      'entreno:workouts.updateExtras',
      'entreno:events.save',
      'entreno:goals.save',
      'entreno:goals.setStatus',
      'entreno:routines.save',
      'entreno:weekPlan.save',
      'entreno:weekPlan.move',
      'entreno:weekPlan.remove'
    ])
  })

  it('el plan de la semana caduca si cambia antes de confirmar; la semana tiene que empezar en lunes', async () => {
    const { h, proponer } = await conEntreno()
    const { proposals } = await proponer('entreno_semana_quitar', { fecha: '2026-11-26' })
    await h['entreno:weekPlan.move']({ from: { date: '2026-11-26', order: 0 }, to: { date: '2026-11-28' } })
    expect((await h['core:ai.proposals.accept']({ proposalId: proposals[0].id })).status).toBe('stale')
    const r = await proponer('entreno_semana_guardar', { semana: '2026-11-25', sesiones: [] })
    expect(r.toolResult).toMatch(/lunes/)
  })
})

describe('arreglos de la revisión: carreras con la cola ocupada y detalles de los planes', () => {
  /** Ocupa la cola hasta que se llame a la función devuelta (como una copia o una importación larga). */
  function ocuparCola(ctx: CoreContext): () => Promise<void> {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const busy = ctx.queue.enqueueTask('test:ocupada', async () => {
      await gate
    })
    return async () => {
      release()
      await busy
    }
  }

  it('dos propuestas sueltas sobre el mismo movimiento, confirmadas con la cola ocupada: la segunda caduca', async () => {
    const { app, s, h, proponer, steam } = await montar()
    const p1 = (await proponer('finanzas_movimiento_editar', { id: steam[0].id, importe: 20 })).proposals[0]
    const p2 = (await proponer('finanzas_movimiento_editar', { id: steam[0].id, importe: 30 })).proposals[0]
    const liberar = ocuparCola(app.ctx)
    // Las dos pasan la comprobación previa (nada ha cambiado todavía) y encolan su escritura.
    const a1 = h['core:ai.proposals.accept']({ proposalId: p1.id })
    const a2 = h['core:ai.proposals.accept']({ proposalId: p2.id })
    await liberar()
    const [r1, r2] = await Promise.all([a1, a2])
    expect(r1.status).toBe('applied')
    expect(r2.status).toBe('stale')
    expect(r2.changes.map((c) => c.status)).toEqual(['skipped'])
    expect(s.ctx().txById.get(steam[0].id)!.amountCents).toBe(-2000)
    expect(h['core:ai.threads.get'](p2.threadId)!.messages.find((m) => m.id === p2.messageId)!.proposals![0].status).toBe('stale')
  })

  it('un grupo no pisa una edición hecha en la página entre dos cambios: se para (partial)', async () => {
    const { app, s, h, proponer } = await montar()
    const p = (await proponer('finanzas_movimientos_recategorizar', { texto: 'steam', categoriaNueva: 'Entretenimiento' })).proposals[0]
    expect(p.mode).toBe('group')
    const segundo = p.changes[1].entityId!
    const liberar = ocuparCola(app.ctx)
    const acc = h['core:ai.proposals.accept']({ proposalId: p.id })
    // La edición de la página entra en la cola después del primer cambio y antes del segundo.
    await Promise.resolve()
    const pagina = h['finanzas:tx.save']({ ...s.ctx().txById.get(segundo)!, description: 'Editado en la página' })
    await liberar()
    const out = await acc
    await pagina
    expect(out.status).toBe('partial')
    expect(out.changes.map((c) => c.status)).toEqual(['applied', 'failed', 'skipped'])
    expect(out.changes[1].error).toMatch(/ha cambiado desde la propuesta/)
    const t = s.ctx().txById.get(segundo)!
    expect(t.description).toBe('Editado en la página')
    expect(t.categoryId).toBe(cat(s, 'Otros gastos'))
    expect(s.ctx().txById.get(p.changes[0].entityId!)!.categoryId).toBe(cat(s, 'Entretenimiento'))
  })

  it('editar el importe de un ajuste conserva su signo (como la página)', async () => {
    const { s, h, acc, proponer } = await montar()
    const ajuste = tx(s, { accountId: acc.id, amountCents: -5000, type: 'ADJUSTMENT', categoryId: null, description: 'Ajuste de saldo' })
    const { proposals } = await proponer('finanzas_movimiento_editar', { id: ajuste.id, importe: 30 })
    expect(proposals[0].changes[0].fields).toEqual([{ label: 'Importe', before: '-50,00 €', after: '-30,00 €' }])
    await h['core:ai.proposals.accept']({ proposalId: proposals[0].id })
    expect(s.ctx().txById.get(ajuste.id)!.amountCents).toBe(-3000)
  })

  it('presupuesto: sin aviso se conserva el que hay; con null se quita', async () => {
    const { s, h, proponer } = await montar()
    await h['finanzas:budgets.set']({ month: '2026-11', categoryId: cat(s, 'Alimentación'), amountCents: 20_000, alertPct: 80 })
    const igual = (await proponer('finanzas_presupuesto_fijar', { mes: '2026-11', categoria: 'Alimentación', importe: 300 })).proposals[0]
    expect(igual.changes[0].payload).toMatchObject({ alertPct: 80 })
    expect(igual.changes[0].fields.map((f) => f.label)).toEqual(['Presupuesto'])
    const quitar = (await proponer('finanzas_presupuesto_fijar', { mes: '2026-11', categoria: 'Alimentación', importe: 200, alertaPct: null })).proposals[0]
    expect(quitar.changes[0].payload).toMatchObject({ alertPct: null })
    expect(quitar.changes[0].fields).toEqual([{ label: 'Aviso al', before: '80 %', after: null }])
  })

  it('recategorizar: busca el texto solo en descripción y comercio, y dice cuántos omite y por qué', async () => {
    const { s, acc, proponer } = await montar()
    tx(s, { accountId: acc.id, amountCents: 500, description: 'Steam venta de cromos', date: '2026-11-20' })
    // «steam» en las notas no cuenta (el buscador general sí lo encontraría).
    tx(s, { accountId: acc.id, amountCents: -700, description: 'Kiosco', notes: 'regalo de steam', date: '2026-11-21' })
    const r = await proponer('finanzas_movimientos_recategorizar', { texto: 'steam', categoriaNueva: 'Entretenimiento' })
    const p = r.proposals[0]
    expect(p.changes).toHaveLength(3)
    expect(p.changes.every((c) => /^Steam juego/.test(c.label))).toBe(true)
    expect(p.criterion).toMatch(/^pasar a «Entretenimiento» los movimientos cuya descripción o comercio contiene «steam» \(se omite 1 que no admite el cambio; p\. ej\. Steam venta de cromos/)
    expect(r.toolResult).toContain('se omite 1')
  })

  it('plan de la semana: un cambio solo de nota también es un cambio', async () => {
    const { h, proponer } = await montar()
    const torso = await h['entreno:routines.save']({ name: 'Torso A', kind: 'GYM' })
    await h['entreno:weekPlan.save']('2026-11-30', [{ date: '2026-12-01', routineId: torso.id, note: 'suave' }])
    const igual = await proponer('entreno_semana_guardar', { semana: '2026-11-30', sesiones: [{ fecha: '2026-12-01', rutina: 'Torso A', nota: 'suave' }] })
    expect(igual.proposals).toEqual([])
    const nota = await proponer('entreno_semana_guardar', { semana: '2026-11-30', sesiones: [{ fecha: '2026-12-01', rutina: 'Torso A', nota: 'fuerte' }] })
    expect(nota.proposals[0].changes[0].fields).toEqual([{ label: 'Sesiones', before: 'martes Torso A · suave', after: 'martes Torso A · fuerte' }])
  })
})
