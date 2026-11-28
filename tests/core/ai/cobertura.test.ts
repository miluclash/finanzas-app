// Huecos de la IA local con la app entera y un proveedor falso: propuestas caducadas (objetivo de
// entreno, gráficos que no caducan), grupo que falla a mitad con la cola real, Ollama apagado o sin
// modelo, URLs no locales, calidad de las herramientas reales, acciones fuera de alcance, que proponer
// no escribe nada y sugerencias de un módulo que falla. Datos inventados. Hoy = miércoles 25/11/2026.
import { describe, expect, it, vi } from 'vitest'
import { createAppHandlers } from '../../../src/main/app'
import type { Assistant } from '../../../src/main/core/ai/assistant'
import { CORE_AI_TOOLS } from '../../../src/main/core/ai/coreTools'
import { LlmError } from '../../../src/main/core/ai/llmError'
import { StaleChangeError } from '../../../src/main/core/ai/toolkit'
import type { CoreContext } from '../../../src/main/core/context'
import { checkAiTools } from '../../../src/main/core/registry'
import { AppState } from '../../../src/main/modules/finanzas/state'
import {
  AI_TOOL_NAME_RE,
  type AiActionToolDef,
  type AiChange,
  type AiProposal,
  type AiToolDef
} from '../../../src/shared/core/ai-types'
import { account, cat, tx } from '../../helpers'
import { entrenoApp, noDialogs } from '../../entreno/helpers'
import { FakeProvider, calls, eventLog, text, type Script } from './fakes'

const HOY = '2026-11-25'

async function montar(opts: { prepare?: (ctx: CoreContext) => void } = {}) {
  const app = await entrenoApp()
  app.ctx.todayOverride = HOY
  opts.prepare?.(app.ctx)
  const s = AppState.for(app.ctx)
  const acc = account(s, { name: 'Cuenta corriente', openingBalanceCents: 100_000 })
  const steam = ['2026-11-03', '2026-11-10', '2026-11-17'].map((date, i) =>
    tx(s, { accountId: acc.id, amountCents: -(999 + i), description: `Steam juego ${i + 1}`, date, categoryId: cat(s, 'Otros gastos') })
  )
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
  const proponer = async (tool: string, args: Record<string, unknown>): Promise<AiProposal[]> => {
    script = (_r, n) => (n % 2 === 0 ? calls([tool, args]) : text('Listo: confírmalo en la tarjeta.'))
    const r = await h['core:ai.send']({ threadId: null, text: 'hazlo' })
    await assistant.wait(r.runId)
    const msgs = h['core:ai.threads.get'](r.threadId)!.messages
    return msgs.filter((m) => m.role === 'assistant').at(-1)!.proposals ?? []
  }
  const auditCount = () => app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n
  return { app, s, acc, steam, h, provider, log, proponer, auditCount, setScript: (x: Script) => (script = x), get assistant() { return assistant } }
}

/** Etiquetas de cola que no son del propio asistente (las escrituras reales de datos). */
const etiquetasDatos = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => String(c[0])).filter((l) => !l.startsWith('core:ai.'))

describe('propuestas caducadas con la app entera', () => {
  it('objetivo de entreno: si cambia antes de confirmar, caduca y no escribe en datos ni en la auditoría', async () => {
    const m = await montar()
    const press = await m.h['entreno:exercises.save']({ title: 'Press banca ficticio' })
    const [crear] = await m.proponer('entreno_objetivo_guardar', { nombre: 'Press a 100', tipo: 'E1RM', ejercicio: press.title, objetivo: 100 })
    await m.h['core:ai.proposals.accept']({ proposalId: crear.id })
    const goal = m.h['entreno:goals.list']().find((x) => x.name === 'Press a 100')!
    const [prop] = await m.proponer('entreno_objetivo_estado', { id: goal.id, estado: 'ACHIEVED' })
    await m.h['entreno:goals.setStatus'](goal.id, 'ABANDONED')
    const enqueue = vi.spyOn(m.app.ctx.queue, 'enqueue')
    const audit = m.auditCount()
    const out = await m.h['core:ai.proposals.accept']({ proposalId: prop.id })
    expect(out.status).toBe('stale')
    expect(out.changes.every((c) => c.status === 'skipped')).toBe(true)
    expect(etiquetasDatos(enqueue)).toEqual([])
    expect(m.auditCount()).toBe(audit)
    expect(m.h['entreno:goals.list']().find((x) => x.id === goal.id)!.status).toBe('ABANDONED')
  })

  it('movimiento borrado a mano tras proponer editarlo: caduca y no escribe', async () => {
    const m = await montar()
    const [prop] = await m.proponer('finanzas_movimiento_editar', { id: m.steam[0].id, importe: 20 })
    await m.h['finanzas:tx.delete'](m.steam[0].id as never)
    const enqueue = vi.spyOn(m.app.ctx.queue, 'enqueue')
    const audit = m.auditCount()
    expect((await m.h['core:ai.proposals.accept']({ proposalId: prop.id })).status).toBe('stale')
    expect(etiquetasDatos(enqueue)).toEqual([])
    expect(m.auditCount()).toBe(audit)
  })

  it('el gráfico es una creación: no caduca aunque cambie el resto de gráficos', async () => {
    const m = await montar()
    const args = { titulo: 'Gastos', tipo: 'bar', series: [{ metrica: 'finanzas.gastos' }], agrupar: 'month', rango: { tipo: 'ultimos', unidad: 'month', cantidad: 6 } }
    const [a] = await m.proponer('core_grafico_crear', args)
    expect(a.changes[0].fingerprint).toBeNull()
    const [b] = await m.proponer('core_grafico_crear', { ...args, titulo: 'Otro' })
    await m.h['core:ai.proposals.accept']({ proposalId: b.id })
    const out = await m.h['core:ai.proposals.accept']({ proposalId: a.id })
    expect(out.status).toBe('applied')
    expect(m.h['core:charts.list']().map((c) => c.title).sort()).toEqual(['Gastos', 'Otro'])
  })
})

describe('propuestas: ya resueltas o inexistentes (handlers reales)', () => {
  it('aceptar o descartar dos veces, o con un id que no existe, da un error claro y no escribe', async () => {
    const m = await montar()
    const [p] = await m.proponer('finanzas_movimiento_editar', { id: m.steam[0].id, importe: 20 })
    expect((await m.h['core:ai.proposals.reject'](p.id)).status).toBe('rejected')
    const enqueue = vi.spyOn(m.app.ctx.queue, 'enqueue')
    await expect(m.h['core:ai.proposals.accept']({ proposalId: p.id })).rejects.toThrow(/ya no está pendiente/)
    await expect(m.h['core:ai.proposals.reject'](p.id)).rejects.toThrow(/ya no está pendiente/)
    await expect(m.h['core:ai.proposals.accept']({ proposalId: 'no-existe' })).rejects.toThrow(/ya no existe/)
    await expect(m.h['core:ai.proposals.reject']('no-existe')).rejects.toThrow(/ya no existe/)
    await expect(m.h['core:ai.proposals.accept']({ proposalId: '' })).rejects.toThrow(/no válida/)
    expect(enqueue).not.toHaveBeenCalled()
    expect(m.s.ctx().txById.get(m.steam[0].id)!.amountCents).toBe(-999)
  })

  it('grupo que falla a mitad con la cola real: partial, el primero applied, el que falla failed y el resto skipped', async () => {
    const m = await montar()
    const [p] = await m.proponer('finanzas_movimientos_recategorizar', { texto: 'steam', categoriaNueva: 'entretenimiento' })
    expect(p.mode).toBe('group')
    const original = m.app.ctx.queue.enqueue.bind(m.app.ctx.queue)
    let n = 0
    vi.spyOn(m.app.ctx.queue, 'enqueue').mockImplementation(((label: string, fn: () => unknown, o?: unknown) => {
      if (label === 'finanzas:tx.save' && ++n === 2) return Promise.reject(new Error('Disco lleno'))
      return original(label, fn, o as never)
    }) as never)
    const out = await m.h['core:ai.proposals.accept']({ proposalId: p.id })
    expect(out.status).toBe('partial')
    expect(out.changes.map((c) => c.status)).toEqual(['applied', 'failed', 'skipped'])
    expect(out.changes[1].error).toMatch(/Disco lleno/)
    const ocio = cat(m.s, 'Entretenimiento')
    const cambiados = out.changes.map((c) => m.s.ctx().txById.get(c.entityId!)!.categoryId === ocio)
    expect(cambiados).toEqual([true, false, false])
    // Queda guardada así y ya no se puede aceptar otra vez.
    expect(m.h['core:ai.threads.get'](p.threadId)!.messages.find((x) => x.id === p.messageId)!.proposals![0].status).toBe('partial')
    await expect(m.h['core:ai.proposals.accept']({ proposalId: p.id })).rejects.toThrow(/ya no está pendiente/)
  })

  it('si falla el primer cambio del grupo: failed y no se escribe nada', async () => {
    const m = await montar()
    const [p] = await m.proponer('finanzas_movimientos_recategorizar', { texto: 'steam', categoriaNueva: 'entretenimiento' })
    const original = m.app.ctx.queue.enqueue.bind(m.app.ctx.queue)
    vi.spyOn(m.app.ctx.queue, 'enqueue').mockImplementation(((label: string, fn: () => unknown, o?: unknown) =>
      label === 'finanzas:tx.save' ? Promise.reject(new Error('Sin permiso')) : original(label, fn, o as never)) as never)
    const out = await m.h['core:ai.proposals.accept']({ proposalId: p.id })
    expect(out.status).toBe('failed')
    expect(out.changes.map((c) => c.status)).toEqual(['failed', 'skipped', 'skipped'])
    const ocio = cat(m.s, 'Entretenimiento')
    expect(m.steam.every((t) => m.s.ctx().txById.get(t.id)!.categoryId !== ocio)).toBe(true)
  })
})

describe('Ollama apagado, sin modelo o con una URL que no es local', () => {
  it('ai.send con Ollama caído: evento error limpio, nada guardado de la respuesta y el resto de handlers responde', async () => {
    const m = await montar()
    m.setScript(() => {
      throw new LlmError('unreachable', 'No se puede conectar con Ollama.')
    })
    const r = await m.h['core:ai.send']({ threadId: null, text: 'hola' })
    await m.assistant.wait(r.runId)
    expect(m.log.events.at(-1)).toMatchObject({ type: 'error', code: 'unreachable', runId: r.runId })
    expect(m.log.types()).not.toContain('done')
    expect(m.h['core:ai.threads.get'](r.threadId)!.messages.map((x) => x.role)).toEqual(['user'])
    // La app sigue respondiendo.
    expect(m.h['finanzas:budgets.report']('2026-11').lines).toBeDefined()
    expect(Array.isArray(m.h['core:ai.suggestions']())).toBe(true)
    expect(m.h['core:ai.settings.get']().enabled).toBe(true)
    // Y el hilo queda libre: se puede preguntar otra vez cuando Ollama vuelve.
    m.setScript(() => text('Ya estoy.'))
    const r2 = await m.h['core:ai.send']({ threadId: r.threadId, text: 'otra vez' })
    await m.assistant.wait(r2.runId)
    expect(m.log.events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('ai.send sin el modelo: evento error model_missing', async () => {
    const m = await montar()
    m.setScript(() => {
      throw new LlmError('model_missing', 'Falta el modelo.')
    })
    const r = await m.h['core:ai.send']({ threadId: null, text: 'hola' })
    await m.assistant.wait(r.runId)
    expect(m.log.events.at(-1)).toMatchObject({ type: 'error', code: 'model_missing', message: 'Falta el modelo.' })
  })

  it('ai.status con el proveedor real y un puerto cerrado → unreachable, y con ajustes inválidos tampoco rompe', async () => {
    const app = await entrenoApp()
    const h = createAppHandlers(app.ctx, noDialogs, '0.0.0')
    await h['core:ai.settings.save']({ baseUrl: 'http://127.0.0.1:1' })
    const st = await h['core:ai.status']()
    expect(st.state).toBe('unreachable')
    expect(st.models).toEqual([])
    expect(st.message).toMatch(/ollama/i)
    expect(h['core:ai.suggestions']()).toBeInstanceOf(Array)
    await h['core:ai.settings.save']({ enabled: false })
    expect((await h['core:ai.status']()).state).toBe('disabled')
  })

  it.each([
    'http://ejemplo.invalid:11434',
    'https://api.example.com',
    'http://localhost.evil.com:11434',
    'http://127.0.0.1.evil.com',
    'http://user@evil.com:11434',
    'ftp://localhost',
    'no es una url',
    ''
  ])('guardar la URL «%s» se rechaza y no cambia el ajuste', async (url) => {
    const app = await entrenoApp()
    const h = createAppHandlers(app.ctx, noDialogs, '0.0.0')
    const antes = h['core:ai.settings.get']().baseUrl
    await expect(h['core:ai.settings.save']({ baseUrl: url })).rejects.toThrow()
    expect(h['core:ai.settings.get']().baseUrl).toBe(antes)
  })

  it.each(['http://localhost:11434', 'http://127.0.0.1:11434', 'http://[::1]:11434'])('la URL local «%s» se acepta', async (url) => {
    const app = await entrenoApp()
    const h = createAppHandlers(app.ctx, noDialogs, '0.0.0')
    expect((await h['core:ai.settings.save']({ baseUrl: url })).baseUrl).toBe(url)
  })
})

describe('herramientas reales: nombres, textos y alcance', () => {
  async function todas() {
    const app = await entrenoApp()
    return [...CORE_AI_TOOLS, ...app.ctx.registry.aiTools] as AiToolDef<CoreContext>[]
  }

  it('todas pasan la validación del contrato, con prefijo de su dueño, únicas, con descripción y etiqueta en español', async () => {
    const list = await todas()
    expect(list.length).toBeGreaterThan(20)
    checkAiTools(CORE_AI_TOOLS, 'core')
    const app = await entrenoApp()
    for (const mod of app.ctx.registry.modules) checkAiTools(mod.aiTools, mod.id)
    expect(new Set(list.map((t) => t.name)).size).toBe(list.length)
    for (const t of list) {
      expect(t.name, t.name).toMatch(AI_TOOL_NAME_RE)
      expect(t.description.length, t.name).toBeGreaterThan(30)
      expect(t.description, t.name).toMatch(/[áéíóúñ]| (el|la|los|las|de|un|una|que|y|para) /i)
      expect(t.label, t.name).toMatch(/^[A-ZÁÉÍÓÚÑ]/)
      expect(t.label, t.name).not.toMatch(/[_.]/)
      expect(t.parameters.type).toBe('object')
    }
  })

  it('el esquema que ve el modelo exige lo mismo que valida la herramienta (todas las acciones dicen que NO guardan)', async () => {
    for (const t of (await todas()).filter((x) => x.kind === 'action')) expect(t.description, t.name).toMatch(/NO (guarda|escribe|cambia)|no (guarda|escribe|cambia)|propone|prepara/i)
  })

  it('no hay acciones sobre cuentas, categorías, inversiones, reglas, ajustes, fusionar ejercicios, importaciones ni restaurar', async () => {
    const prohibido = /cuenta|categorias?_(crear|guardar|borrar)|inversion|regla|ajuste|setting|fusion|merge|import|restaur|backup|copia|cuentas_/i
    for (const t of (await todas()).filter((x) => x.kind === 'action')) {
      // `finanzas_movimiento_crear` y similares trabajan con cuentas solo como dato; el nombre no las gestiona.
      expect(t.name, t.name).not.toMatch(prohibido)
    }
  })

  it('proponer (plan) no escribe nada: ni cola ni auditoría; confirmar solo usa etiquetas de las acciones permitidas', async () => {
    const m = await montar()
    const ctx = m.app.ctx
    const tool = (n: string) => ctx.registry.aiTool(n) ?? CORE_AI_TOOLS.find((x) => x.name === n)!
    const aplicar = async (name: string, args: Record<string, unknown>) => {
      const t = tool(name) as AiActionToolDef<CoreContext>
      const plan = t.plan(ctx, args)
      for (const [i, d] of plan.changes.entries()) await t.apply(ctx, { ...d, id: `x${i}`, status: 'pending' } as AiChange)
    }
    // Requisitos para poder proponer cambios sobre cosas que ya existen.
    const press = await m.h['entreno:exercises.save']({ title: 'Press banca ficticio' })
    const torso = await m.h['entreno:routines.save']({ name: 'Torso A', kind: 'GYM', items: [{ exerciseId: press.id, targetSets: 3, repsMin: 6, repsMax: 8 }] })
    await aplicar('entreno_objetivo_guardar', { nombre: 'Press a 100', tipo: 'E1RM', ejercicio: 'Press banca ficticio', objetivo: 100 })
    await aplicar('entreno_sesion_guardar', {
      titulo: 'Torso A',
      inicio: '2026-11-24T07:00',
      fin: '2026-11-24T08:00',
      rutina: 'Torso A',
      ejercicios: [{ ejercicio: 'press banca', series: [{ pesoKg: 80, reps: 8 }] }]
    })
    await aplicar('entreno_semana_guardar', { semana: '2026-11-30', sesiones: [{ fecha: '2026-12-01', rutina: 'Torso A' }, { fecha: '2026-12-03', rutina: 'Torso A' }] })
    void torso
    const goal = m.h['entreno:goals.list']().find((x) => x.name === 'Press a 100')!
    const w = m.h['entreno:workouts.list']({}).find((x) => x.startTime === '2026-11-24T07:00')!
    const [t0, t1] = m.steam

    const casos: Array<[string, Record<string, unknown>]> = [
      ['finanzas_movimiento_crear', { fecha: '2026-11-24', descripcion: 'Cine', importe: 8.5, tipo: 'gasto', categoria: 'Entretenimiento', cuenta: 'cuenta corriente' }],
      ['finanzas_movimiento_editar', { id: t0.id, importe: 20 }],
      ['finanzas_movimientos_categoria', { ids: [t0.id], categoria: 'Salud' }],
      ['finanzas_movimientos_estado', { ids: [t0.id], estado: 'anulado' }],
      ['finanzas_movimientos_recategorizar', { texto: 'steam', categoriaNueva: 'entretenimiento' }],
      ['finanzas_presupuesto_fijar', { mes: '2026-11', categoria: 'Alimentación', importe: 300 }],
      ['finanzas_objetivo_guardar', { nombre: 'Viaje', objetivo: 1200, fechaLimite: '2027-06-30' }],
      ['finanzas_movimiento_borrar', { ids: [t1.id] }],
      ['entreno_sesion_guardar', { titulo: 'Otra', inicio: '2026-11-23T07:00', fin: '2026-11-23T08:00', ejercicios: [{ ejercicio: 'press banca', series: [{ pesoKg: 70, reps: 8 }] }] }],
      ['entreno_sesion_datos', { id: w.id, esfuerzo: 8, notas: 'Buena' }],
      ['entreno_evento_guardar', { nombre: 'Carrera ficticia', fecha: '2027-03-20' }],
      ['entreno_objetivo_guardar', { nombre: 'Otro objetivo', tipo: 'E1RM', ejercicio: 'Press banca ficticio', objetivo: 110 }],
      ['entreno_objetivo_estado', { id: goal.id, estado: 'ACHIEVED' }],
      ['entreno_rutina_guardar', { nombre: 'Natación técnica', tipo: 'SWIM' }],
      ['entreno_semana_guardar', { semana: '2026-12-07', sesiones: [{ fecha: '2026-12-08', rutina: 'Torso A' }] }],
      ['entreno_semana_mover', { desde: '2026-12-01', hasta: '2026-12-02' }],
      ['entreno_semana_quitar', { fecha: '2026-12-03', rutina: 'Torso A' }],
      ['core_grafico_crear', { titulo: 'Gastos', tipo: 'bar', series: [{ metrica: 'finanzas.gastos' }], agrupar: 'month', rango: { tipo: 'ultimos', unidad: 'month', cantidad: 6 } }]
    ]
    const acciones = [...CORE_AI_TOOLS, ...ctx.registry.aiTools].filter((t) => t.kind === 'action').map((t) => t.name)
    // Hay caso para cada acción real (si alguien añade una, este test le pide su caso).
    expect([...new Set(casos.map((c) => c[0]))].sort()).toEqual([...acciones].sort())

    const antes = ctx.queue.committedCount
    const audit = m.auditCount()
    const planes: Array<[string, ReturnType<AiActionToolDef<CoreContext>['plan']>]> = []
    for (const [name, args] of casos) {
      const t = tool(name) as AiActionToolDef<CoreContext>
      const plan = t.plan(ctx, args)
      expect(plan.changes.length, name).toBeGreaterThan(0)
      planes.push([name, plan])
      expect(ctx.queue.committedCount, name).toBe(antes)
      expect(m.auditCount(), name).toBe(audit)
    }

    // Confirmar: solo etiquetas de los handlers de la página de lo que sí se puede cambiar.
    const enqueue = vi.spyOn(ctx.queue, 'enqueue')
    for (const [name, plan] of planes) {
      const t = tool(name) as AiActionToolDef<CoreContext>
      // Varios casos tocan el mismo registro: al aplicarlos seguidos, los posteriores caducan (y no escriben).
      for (const [i, d] of plan.changes.entries())
        await t.apply(ctx, { ...d, id: `y${i}`, status: 'pending' } as AiChange).catch((e) => {
          if (!(e instanceof StaleChangeError)) throw e
        })
    }
    const labels = [...new Set(enqueue.mock.calls.map((c) => String(c[0])))]
    expect(labels.length).toBeGreaterThan(8)
    const permitido = /^(finanzas:(tx\.|budgets\.|goals\.)|entreno:(workouts\.|events\.|goals\.|routines\.|weekPlan\.)|core:charts\.save$)/
    const prohibido = /account|categor(y|ies)|invest|rule|setting|merge|import|restore|backup|exercises\./i
    for (const l of labels) {
      expect(l, l).toMatch(permitido)
      expect(l, l).not.toMatch(prohibido)
    }
  })
})

describe('sugerencias con la app entera', () => {
  it('un módulo cuyas sugerencias lanzan error no impide las de los demás', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const m = await montar({
        prepare: (ctx) => {
          const entreno = ctx.registry.get('entreno')!
          ;(entreno as { suggestions?: unknown }).suggestions = () => {
            throw new Error('roto')
          }
        }
      })
      tx(m.s, { accountId: m.acc.id, amountCents: -1000, description: 'Por revisar', status: 'PENDING_REVIEW' })
      const sug = m.h['core:ai.suggestions']()
      expect(sug.some((x) => x.module === 'finanzas')).toBe(true)
      expect(sug.some((x) => x.module === 'entreno')).toBe(false)
      expect(aviso).toHaveBeenCalled()
    } finally {
      aviso.mockRestore()
    }
  })

  it('y al revés: si fallan las de finanzas, siguen las de entreno', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const m = await montar({
        prepare: (ctx) => {
          ;(ctx.registry.get('finanzas') as { suggestions?: unknown }).suggestions = () => {
            throw new Error('roto')
          }
          ;(ctx.registry.get('entreno') as { suggestions?: unknown }).suggestions = () => [
            { id: 'entreno.test.x', module: 'entreno', severity: 'info', title: 'Prueba', detail: 'Detalle', asOf: HOY }
          ]
        }
      })
      expect(m.h['core:ai.suggestions']().map((x) => x.id)).toEqual(['entreno.test.x'])
    } finally {
      aviso.mockRestore()
    }
  })
})
