// Orquestador del asistente con un proveedor falso, herramientas de prueba y almacén en memoria:
// eventos, bucle de herramientas y su límite, recorte de resultados, historial, propuestas sueltas y en
// grupo, confirmar, descartar, caducar, grupos que fallan a mitad, cancelar y estado de Ollama.
import { describe, expect, it } from 'vitest'
import { Assistant, clip, collectSuggestions, sameModel, systemPrompt, threadTitle, toolResultText } from '../../../src/main/core/ai/assistant'
import { LlmError } from '../../../src/main/core/ai/llmError'
import { UserError } from '../../../src/main/core/errors'
import {
  AI_GROUP_MIN,
  AI_HISTORY_MAX_MESSAGES,
  AI_MAX_TOOL_STEPS,
  AI_TOOL_RESULT_MAX_CHARS,
  type AiActionToolDef,
  type AiChange,
  type AiChangeDraft,
  type AiSuggestion,
  type AiToolDef,
  type LlmChatRequest,
  type LlmChunk
} from '../../../src/shared/core/ai-types'
import { FakeProvider, MemorySettings, MemoryStore, calls, eventLog, text, type Script } from './fakes'

interface Ctx {
  records: Map<string, string>
  applied: string[]
  failOn: Set<string>
}

const draft = (id: string, ctx: Ctx, value: string): AiChangeDraft => ({
  entity: 'thing',
  entityId: id,
  op: 'update',
  label: `Cosa ${id}`,
  fields: [{ label: 'Valor', before: ctx.records.get(id) ?? null, after: value }],
  payload: { id, value },
  fingerprint: ctx.records.get(id) ?? null
})

const setTool: AiActionToolDef<Ctx> = {
  kind: 'action',
  name: 'core_cosas_poner',
  label: 'Preparando cosas',
  description: 'Pone un valor en unas cosas.',
  parameters: { type: 'object', properties: {} },
  plan: (ctx, args) => {
    const a = args as { ids: string[]; value: string; criterio?: string }
    if (!Array.isArray(a.ids)) throw new UserError('Faltan los ids.')
    return { criterion: a.criterio ?? null, changes: a.ids.map((id) => draft(id, ctx, a.value)) }
  },
  apply: async (ctx, change: AiChange) => {
    const p = change.payload as { id: string; value: string }
    if (ctx.failOn.has(p.id)) throw new Error(`No se puede con ${p.id}.`)
    ctx.records.set(p.id, p.value)
    ctx.applied.push(p.id)
  },
  fingerprint: (ctx, change) => ctx.records.get(change.entityId!) ?? null
}

const tools: AiToolDef<Ctx>[] = [
  {
    kind: 'read',
    name: 'core_eco',
    label: 'Repitiendo',
    description: 'Devuelve sus argumentos.',
    parameters: { type: 'object', properties: {} },
    run: (_ctx, args) => ({ eco: args })
  },
  {
    kind: 'read',
    name: 'core_enorme',
    label: 'Devolviendo mucho',
    description: 'Devuelve un resultado enorme.',
    parameters: { type: 'object', properties: {} },
    run: () => ({ datos: 'x'.repeat(AI_TOOL_RESULT_MAX_CHARS * 3) })
  },
  {
    kind: 'read',
    name: 'core_falla',
    label: 'Fallando',
    description: 'Siempre falla.',
    parameters: { type: 'object', properties: {} },
    run: () => {
      throw new UserError('Argumentos no válidos para core_falla: falta algo')
    }
  },
  setTool
]

function setup(script?: Script, opts: { suggestions?: () => AiSuggestion[] } = {}) {
  const ctx: Ctx = { records: new Map([['a', '1'], ['b', '1'], ['c', '1'], ['d', '1']]), applied: [], failOn: new Set() }
  const store = new MemoryStore()
  const settings = new MemorySettings()
  const provider = new FakeProvider(script)
  const log = eventLog()
  const assistant = new Assistant<Ctx>({
    ctx,
    store,
    settings,
    provider: () => provider,
    tools,
    suggestions: opts.suggestions ?? (() => []),
    emit: log.emit,
    today: () => '2026-11-27'
  })
  const ask = async (t: string, threadId: string | null = null, extra: { suggestionIds?: string[] } = {}) => {
    const r = await assistant.send({ threadId, text: t, ...extra })
    await assistant.wait(r.runId)
    return r
  }
  return { ctx, store, settings, provider, log, assistant, ask }
}

const lastAssistant = (store: MemoryStore) => [...store.messages].reverse().find((m) => m.role === 'assistant')!

describe('asistente: respuestas y eventos', () => {
  it('send crea el hilo, guarda los mensajes y emite start, delta, message y done', async () => {
    const { store, log, ask, provider } = setup(() => text('Hola', ', ¿qué tal?'))
    const r = await ask('¿Cuánto gasté en ocio este mes de noviembre?')
    expect(store.threads).toHaveLength(1)
    expect(store.threads[0].title).toBe('¿Cuánto gasté en ocio este mes de noviembre?')
    expect(store.threads[0].model).toBe('qwen3:8b')
    expect(store.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', '¿Cuánto gasté en ocio este mes de noviembre?'],
      ['assistant', 'Hola, ¿qué tal?']
    ])
    expect(log.types()).toEqual(['start', 'delta', 'delta', 'message', 'done'])
    expect(log.events.every((e) => e.runId === r.runId && e.threadId === r.threadId)).toBe(true)
    const req = provider.requests[0]
    expect(req.messages[0].role).toBe('system')
    expect(req.model).toBe('qwen3:8b')
    expect(req.think).toBe(false)
    expect(req.tools?.map((t) => t.name)).toEqual(['core_eco', 'core_enorme', 'core_falla', 'core_cosas_poner'])
  })

  it('el prompt de sistema va en español, con la fecha de hoy, y deja claro que las acciones solo proponen', () => {
    const p = systemPrompt('2026-11-27')
    expect(p).toContain('viernes, 27 de noviembre de 2026')
    expect(p).toMatch(/No inventes/)
    expect(p).toMatch(/SOLO preparan una propuesta/)
    expect(p).toMatch(/confirme en la tarjeta/)
    expect(p).not.toMatch(/Finanzas app|finanzas-app/i)
  })

  it('una sola respuesta a la vez por hilo; hilo inexistente o texto vacío → error para Michael', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { assistant } = setup(async function* () {
      await gate
      yield* text('ya')
    })
    const r = await assistant.send({ threadId: null, text: 'uno' })
    await expect(assistant.send({ threadId: r.threadId, text: 'dos' })).rejects.toThrow(/Espera a que termine/)
    await expect(assistant.send({ threadId: 'no-existe', text: 'x' })).rejects.toThrow(/ya no existe/)
    await expect(assistant.send({ threadId: null, text: '   ' })).rejects.toBeInstanceOf(UserError)
    release()
    await assistant.wait(r.runId)
    expect(assistant.isRunning(r.threadId)).toBe(false)
    await expect(assistant.send({ threadId: r.threadId, text: 'tres' })).resolves.toMatchObject({ threadId: r.threadId })
  })

  it('con el asistente apagado no se llama al proveedor', async () => {
    const { assistant, settings, provider } = setup()
    settings.value.enabled = false
    await expect(assistant.send({ threadId: null, text: 'hola' })).rejects.toThrow(/apagado/)
    expect(provider.requests).toHaveLength(0)
  })

  it('el título del hilo son las primeras palabras', () => {
    expect(threadTitle('uno dos tres')).toBe('uno dos tres')
    expect(threadTitle('a b c d e f g h i j')).toBe('a b c d e f g h…')
  })

  it('Ollama apagado o sin modelo durante la respuesta → evento error con su código y mensaje', async () => {
    const { log, ask, store } = setup(() => {
      throw new LlmError('unreachable', 'No se puede conectar con Ollama.')
    })
    await ask('hola')
    const e = log.events.at(-1)!
    expect(e).toMatchObject({ type: 'error', code: 'unreachable', message: 'No se puede conectar con Ollama.' })
    expect(store.messages.map((m) => m.role)).toEqual(['user'])
    const s2 = setup(() => {
      throw new Error('boom')
    })
    await s2.ask('hola')
    expect(s2.log.events.at(-1)).toMatchObject({ type: 'error', code: 'internal' })
  })

  it('cancelar a mitad: evento aborted y se guarda lo que ya había escrito', async () => {
    const s = setup(async function* (req: LlmChatRequest) {
      yield { type: 'delta', text: 'Empiezo' } as LlmChunk
      await new Promise<void>((resolve) => req.signal!.addEventListener('abort', () => resolve()))
      throw new LlmError('aborted', 'Respuesta cancelada.')
    })
    const r = await s.assistant.send({ threadId: null, text: 'hola' })
    await new Promise((res) => setTimeout(res, 10))
    expect(s.assistant.cancel(r.runId)).toBe(true)
    await s.assistant.wait(r.runId)
    expect(s.log.events.at(-1)).toMatchObject({ type: 'error', code: 'aborted' })
    expect(lastAssistant(s.store).content).toBe('Empiezo')
    expect(s.assistant.cancel(r.runId)).toBe(false)
  })
})

describe('asistente: herramientas', () => {
  it('bucle: el modelo pide una herramienta, recibe su resultado y responde', async () => {
    const { ask, provider, store, log } = setup((_r, n) => (n === 0 ? calls(['core_eco', { x: 1 }]) : text('Listo.')))
    await ask('prueba')
    expect(provider.requests).toHaveLength(2)
    const second = provider.requests[1].messages
    expect(second.at(-2)).toMatchObject({ role: 'assistant', toolCalls: [{ name: 'core_eco', arguments: { x: 1 } }] })
    expect(second.at(-1)).toMatchObject({ role: 'tool', toolName: 'core_eco', content: '{"eco":{"x":1}}' })
    expect(store.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(log.events.filter((e) => e.type === 'tool')).toMatchObject([
      { name: 'core_eco', label: 'Repitiendo', state: 'start' },
      { name: 'core_eco', state: 'end', ok: true }
    ])
  })

  it(`límite de ${AI_MAX_TOOL_STEPS} pasos: después se le pide que conteste sin herramientas`, async () => {
    const { ask, provider, log } = setup((req) => (req.tools ? calls(['core_eco', {}]) : text('Con lo que tengo.')))
    await ask('bucle')
    expect(provider.requests).toHaveLength(AI_MAX_TOOL_STEPS + 1)
    expect(provider.requests.slice(0, AI_MAX_TOOL_STEPS).every((r) => r.tools?.length)).toBe(true)
    expect(provider.requests.at(-1)!.tools).toBeUndefined()
    expect(provider.requests.at(-1)!.messages.at(-1)).toMatchObject({ role: 'system' })
    expect(log.types().at(-1)).toBe('done')
  })

  it('resultados recortados a AI_TOOL_RESULT_MAX_CHARS; errores y herramientas desconocidas vuelven como texto', async () => {
    const { ask, provider, log } = setup((_r, n) =>
      n === 0 ? calls(['core_enorme', {}], ['core_falla', {}], ['core_no_existe', {}]) : text('Vale.')
    )
    await ask('prueba')
    const tools = provider.requests[1].messages.filter((m) => m.role === 'tool')
    expect(tools[0].content.length).toBeLessThanOrEqual(AI_TOOL_RESULT_MAX_CHARS)
    expect(tools[0].content).toMatch(/recortado\]$/)
    expect(tools[1].content).toBe('Error: Argumentos no válidos para core_falla: falta algo')
    expect(tools[2].content).toMatch(/^Error: La herramienta «core_no_existe» no existe/)
    expect(log.events.filter((e) => e.type === 'tool' && e.state === 'end').map((e) => (e as { ok?: boolean }).ok)).toEqual([true, false, false])
    expect(log.types().at(-1)).toBe('done')
  })

  it('ayudas de recorte', () => {
    expect(clip('abc', 10)).toBe('abc')
    expect(clip('a'.repeat(100), 40)).toHaveLength(40)
    expect(toolResultText({ a: 1 })).toBe('{"a":1}')
    expect(toolResultText(undefined)).toBe('null')
  })

  it(`historial: como mucho ${AI_HISTORY_MAX_MESSAGES} mensajes anteriores (y los resultados viejos, recortados)`, async () => {
    const s = setup((_r, n) => (n === 0 ? calls(['core_enorme', {}]) : text('ok')))
    const first = await s.ask('primera')
    for (let i = 0; i < 12; i++) await s.ask(`pregunta ${i}`, first.threadId)
    const last = s.provider.requests.at(-1)!
    expect(last.messages[0].role).toBe('system')
    expect(last.messages.length - 1).toBeLessThanOrEqual(AI_HISTORY_MAX_MESSAGES)
    expect(last.messages[1].role).not.toBe('tool')
    expect(last.messages.at(-1)).toMatchObject({ role: 'user', content: 'pregunta 11' })
  })

  it('«Coméntalo»: las sugerencias pedidas van como contexto del mensaje, sin guardarse en el hilo', async () => {
    const sug: AiSuggestion = { id: 'entreno.review.x', module: 'entreno', severity: 'warning', title: 'Press estancado', detail: 'Tres semanas igual.', asOf: '2026-11-23' }
    const s = setup(() => text('Te explico.'), { suggestions: () => [sug] })
    await s.ask('Coméntalo', null, { suggestionIds: ['entreno.review.x', 'no-existe'] })
    expect(s.provider.requests[0].messages.at(-1)!.content).toContain('Press estancado: Tres semanas igual.')
    expect(s.store.messages[0].content).toBe('Coméntalo')
  })
})

describe('asistente: propuestas', () => {
  const ask = async (args: Record<string, unknown>) => {
    const s = setup((_r, n) => (n === 0 ? calls(['core_cosas_poner', args]) : text('Te lo he preparado: confírmalo en la tarjeta.')))
    await s.ask('cambia cosas')
    return { ...s, proposals: lastAssistant(s.store).proposals ?? [] }
  }

  it(`con criterio y ${AI_GROUP_MIN} o más cambios → una propuesta en grupo; plan no escribe nada`, async () => {
    const s = await ask({ ids: ['a', 'b', 'c'], value: '2', criterio: 'poner 2 en las cosas a, b y c' })
    expect(s.proposals).toHaveLength(1)
    const p = s.proposals[0]
    expect(p).toMatchObject({ mode: 'group', status: 'pending', tool: 'core_cosas_poner', criterion: 'poner 2 en las cosas a, b y c' })
    expect(p.title).toBe('Poner 2 en las cosas a, b y c (3 cambios)')
    expect(p.changes.map((c) => c.status)).toEqual(['pending', 'pending', 'pending'])
    expect(p.messageId).toBe(lastAssistant(s.store).id)
    expect(s.ctx.applied).toEqual([])
    expect([...s.ctx.records.values()]).toEqual(['1', '1', '1', '1'])
    const toolMsg = s.store.messages.find((m) => m.role === 'tool')!
    expect(toolMsg.content).toMatch(/pendiente de confirmar/)
    expect(toolMsg.content).toMatch(/Todavía no se ha cambiado nada/)
    const msgEvent = s.log.events.find((e) => e.type === 'message')
    expect(msgEvent && 'message' in msgEvent ? msgEvent.message.proposals?.length : 0).toBe(1)
  })

  it(`con criterio pero menos de ${AI_GROUP_MIN}, o sin criterio → una propuesta suelta por cambio`, async () => {
    const pocos = await ask({ ids: ['a', 'b'], value: '2', criterio: 'poner 2' })
    expect(pocos.proposals.map((p) => p.mode)).toEqual(['single', 'single'])
    expect(pocos.proposals[0].title).toBe('Cambiar: Cosa a')
    const sinCriterio = await ask({ ids: ['a', 'b', 'c', 'd'], value: '2' })
    expect(sinCriterio.proposals.map((p) => p.mode)).toEqual(['single', 'single', 'single', 'single'])
    const nada = await ask({ ids: [], value: '2' })
    expect(nada.proposals).toEqual([])
    expect(nada.store.messages.find((m) => m.role === 'tool')!.content).toMatch(/sin cambios/)
  })

  it('aceptar aplica en orden y deja la propuesta aplicada; ya no se puede volver a aceptar ni descartar', async () => {
    const s = await ask({ ids: ['a', 'b', 'c'], value: '2', criterio: 'poner 2' })
    const out = await s.assistant.acceptProposal(s.proposals[0].id)
    expect(out.status).toBe('applied')
    expect(out.resolvedAt).not.toBeNull()
    expect(out.changes.map((c) => c.status)).toEqual(['applied', 'applied', 'applied'])
    expect(s.ctx.applied).toEqual(['a', 'b', 'c'])
    expect(s.store.getProposal(out.id)!.status).toBe('applied')
    await expect(s.assistant.acceptProposal(out.id)).rejects.toThrow(/ya no está pendiente/)
    await expect(s.assistant.rejectProposal(out.id)).rejects.toThrow(/ya no está pendiente/)
    await expect(s.assistant.acceptProposal('no-existe')).rejects.toThrow(/ya no existe/)
  })

  it('descartar no escribe nada', async () => {
    const s = await ask({ ids: ['a'], value: '2' })
    const out = await s.assistant.rejectProposal(s.proposals[0].id)
    expect(out.status).toBe('rejected')
    expect(s.ctx.applied).toEqual([])
    expect(s.store.getProposal(out.id)!.status).toBe('rejected')
  })

  it('si un registro cambió desde la propuesta, caduca entera y no se escribe nada', async () => {
    const s = await ask({ ids: ['a', 'b', 'c'], value: '2', criterio: 'poner 2' })
    s.ctx.records.set('c', 'cambiado a mano')
    const out = await s.assistant.acceptProposal(s.proposals[0].id)
    expect(out.status).toBe('stale')
    expect(out.changes.every((c) => c.status === 'skipped')).toBe(true)
    expect(s.ctx.applied).toEqual([])
  })

  it('un grupo que falla a mitad se para: partial, con el error en el cambio; si falla el primero, failed', async () => {
    const s = await ask({ ids: ['a', 'b', 'c'], value: '2', criterio: 'poner 2' })
    s.ctx.failOn.add('b')
    const out = await s.assistant.acceptProposal(s.proposals[0].id)
    expect(out.status).toBe('partial')
    expect(out.changes.map((c) => c.status)).toEqual(['applied', 'failed', 'skipped'])
    expect(out.changes[1].error).toBe('No se puede con b.')
    expect(s.ctx.applied).toEqual(['a'])

    const t = await ask({ ids: ['a', 'b', 'c'], value: '3', criterio: 'poner 3' })
    t.ctx.failOn.add('a')
    const out2 = await t.assistant.acceptProposal(t.proposals[0].id)
    expect(out2.status).toBe('failed')
    expect(out2.changes.map((c) => c.status)).toEqual(['failed', 'skipped', 'skipped'])
  })
})

describe('asistente: estado y sugerencias', () => {
  it('disabled, unreachable, model_missing y ready, con mensajes que dicen qué hacer', async () => {
    const s = setup()
    s.settings.value.enabled = false
    expect(await s.assistant.status()).toMatchObject({ state: 'disabled', models: [] })
    s.settings.value.enabled = true
    s.provider.listError = new LlmError('unreachable', 'x')
    const off = await s.assistant.status()
    expect(off.state).toBe('unreachable')
    expect(off.message).toMatch(/ollama\.com/)
    expect(off.message).toMatch(/ollama serve/)
    s.provider.listError = null
    s.provider.models = [{ name: 'llama3.2:latest' }]
    const missing = await s.assistant.status()
    expect(missing.state).toBe('model_missing')
    expect(missing.message).toContain('ollama pull qwen3:8b')
    expect(missing.message).toContain('llama3.2:latest')
    s.provider.models = [{ name: 'qwen3:8b' }]
    expect((await s.assistant.status()).state).toBe('ready')
    s.settings.value.model = 'mistral'
    s.provider.models = [{ name: 'mistral:latest' }]
    expect((await s.assistant.status()).state).toBe('ready')
  })

  it('sameModel: «modelo» y «modelo:latest» son el mismo', () => {
    expect(sameModel('qwen3:8b', 'qwen3:8b')).toBe(true)
    expect(sameModel('mistral', 'mistral:latest')).toBe(true)
    expect(sameModel('Mistral:Latest', 'mistral')).toBe(true)
    expect(sameModel('qwen3:8b', 'qwen3:14b')).toBe(false)
    expect(sameModel('qwen3', 'qwen3:8b')).toBe(false)
  })

  it('collectSuggestions: un módulo que falla no tumba los demás y no se repiten ids', () => {
    const s = (id: string): AiSuggestion => ({ id, module: 'finanzas', severity: 'info', title: id, detail: '', asOf: '2026-11-27' })
    const out = collectSuggestions(
      [
        { id: 'finanzas', suggestions: () => [s('a'), s('b')] },
        {
          id: 'entreno',
          suggestions: () => {
            throw new Error('roto')
          }
        },
        { id: 'otro', suggestions: () => [s('b'), s('c')] },
        { id: 'sin' }
      ],
      null
    )
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('el asistente rechaza nombres de herramienta repetidos o no válidos', () => {
    const base = { ctx: null, store: new MemoryStore(), settings: new MemorySettings(), provider: () => new FakeProvider(), suggestions: () => [], emit: () => undefined, today: () => '2026-11-27' }
    const t = tools[0]
    expect(() => new Assistant({ ...base, tools: [t, t] as unknown as AiToolDef<null>[] })).toThrow(/repetida/)
    expect(() => new Assistant({ ...base, tools: [{ ...t, name: 'mal.nombre' }] as unknown as AiToolDef<null>[] })).toThrow(/no válido/)
  })
})
