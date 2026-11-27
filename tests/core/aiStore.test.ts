// Almacén de conversaciones del asistente (core_ai_threads / core_ai_messages, migración 1003):
// todo por la cola, orden por actividad, borrado en cascada y propuestas que se leen y actualizan.
import { describe, expect, it, vi } from 'vitest'
import { AI_THREAD_DEFAULT_TITLE, AI_THREAD_TITLE_MAX, createAiStore } from '../../src/main/core/aiStore'
import { UserError } from '../../src/main/core/errors'
import type { AiProposal, NewAiMessage } from '../../src/shared/core/ai-types'
import { entrenoApp, escribir } from '../entreno/helpers'

/** App en memoria con un almacén de reloj y ids fijos (cada llamada avanza un segundo). */
async function montar() {
  const app = await entrenoApp()
  let t = Date.parse('2026-11-27T10:00:00.000Z')
  let n = 0
  const store = createAiStore(app.ctx, { now: () => new Date((t += 1000)).toISOString(), newId: () => `id-${++n}` })
  return { ...app, store }
}

const cuenta = (db: { get<T>(sql: string): T | undefined }, tabla: string) => db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tabla}`)!.n

function propuesta(extra: Partial<AiProposal> = {}): AiProposal {
  return {
    id: '',
    threadId: '',
    messageId: '',
    tool: 'finanzas_tx_update',
    mode: 'single',
    title: 'Cambiar categoría de un movimiento a Ocio',
    criterion: null,
    changes: [
      {
        id: '',
        entity: 'transaction',
        entityId: '7',
        op: 'update',
        label: 'Tienda ficticia · 12,99 € · 3 nov 2026',
        fields: [{ label: 'Categoría', before: 'Otros', after: 'Ocio' }],
        payload: { id: 7, categoryId: 3 },
        fingerprint: 'abc',
        status: 'pending'
      }
    ],
    status: 'pending',
    createdAt: '2026-11-27T10:00:00.000Z',
    resolvedAt: null,
    ...extra
  }
}

describe('almacén de conversaciones', () => {
  it('crea, lista por actividad (updatedAt desc) y añadir un mensaje sube el hilo', async () => {
    const { store } = await montar()
    const a = await store.createThread({ title: '  ¿Qué   me toca hoy?  ', model: 'qwen3:8b' })
    const b = await store.createThread({ title: 'Gastos de ocio', model: 'qwen3:8b' })
    expect(a).toMatchObject({ title: '¿Qué me toca hoy?', model: 'qwen3:8b' })
    expect(a.createdAt).toBe(a.updatedAt)
    expect(store.listThreads().map((t) => t.id)).toEqual([b.id, a.id])

    const m = await store.appendMessage(a.id, { role: 'user', content: 'Hola' })
    expect(store.listThreads().map((t) => t.id)).toEqual([a.id, b.id])
    expect(store.listThreads()[0].updatedAt).toBe(m.createdAt)
    expect(store.listThreads()[0].createdAt).toBe(a.createdAt)
  })

  it('título: por defecto si viene vacío, recortado si es largo; renombrar valida', async () => {
    const { store } = await montar()
    const vacio = await store.createThread({ title: '   ', model: 'm' })
    expect(vacio.title).toBe(AI_THREAD_DEFAULT_TITLE)
    const largo = await store.createThread({ title: 'x'.repeat(500), model: 'm' })
    expect(largo.title).toHaveLength(AI_THREAD_TITLE_MAX)

    await store.renameThread(vacio.id, '  Plan  de la semana ')
    expect(store.getThread(vacio.id)!.thread.title).toBe('Plan de la semana')
    await expect(store.renameThread(vacio.id, '   ')).rejects.toBeInstanceOf(UserError)
    await expect(store.renameThread('no-existe', 'Algo')).rejects.toThrow(/ya no existe/)
  })

  it('guarda y devuelve mensajes de los tres roles, en orden y tal cual', async () => {
    const { store } = await montar()
    const t = await store.createThread({ title: 'Prueba', model: 'm' })
    const entrada: NewAiMessage[] = [
      { role: 'user', content: '¿Cuánto gasté en ocio?' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'finanzas_month_summary', arguments: { month: '2026-11' } }] },
      { role: 'tool', content: '{"ocio":1299}', toolCallId: 'c1', toolName: 'finanzas_month_summary' },
      { role: 'assistant', content: 'Este mes llevas 12,99 € en ocio.' }
    ]
    const guardados = []
    for (const m of entrada) guardados.push(await store.appendMessage(t.id, m))
    const detalle = store.getThread(t.id)!
    expect(detalle.thread.id).toBe(t.id)
    expect(detalle.messages).toEqual(guardados)
    expect(detalle.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(detalle.messages[1].toolCalls).toEqual(entrada[1].toolCalls)
    expect(detalle.messages[2]).toMatchObject({ toolCallId: 'c1', toolName: 'finanzas_month_summary' })
    // Sin campos vacíos de más.
    expect(Object.keys(detalle.messages[0]).sort()).toEqual(['content', 'createdAt', 'id', 'role', 'threadId'])
    expect(store.getThread('no-existe')).toBeNull()
  })

  it('rechaza mensajes mal formados o de una conversación que no existe, sin escribir nada', async () => {
    const { store, db } = await montar()
    const t = await store.createThread({ title: 'Prueba', model: 'm' })
    await expect(store.appendMessage('no-existe', { role: 'user', content: 'x' })).rejects.toBeInstanceOf(UserError)
    await expect(store.appendMessage(t.id, { role: 'system' as never, content: 'x' })).rejects.toThrow(/Rol/)
    await expect(store.appendMessage(t.id, { role: 'user', content: 1 as never })).rejects.toThrow(/texto/)
    await expect(store.appendMessage(t.id, { role: 'user', content: 'x', toolCalls: [] })).rejects.toThrow(/asistente/)
    await expect(store.appendMessage(t.id, { role: 'assistant', content: 'x', toolName: 'a' })).rejects.toThrow(/herramienta/)
    await expect(store.appendMessage(t.id, { role: 'tool', content: 'x', proposals: [propuesta()] })).rejects.toThrow(/propuestas/)
    await expect(store.appendMessage(t.id, { role: 'assistant', content: 'x', proposals: [propuesta({ status: 'rara' as never })] })).rejects.toThrow(
      /estado/
    )
    expect(cuenta(db, 'core_ai_messages')).toBe(0)
  })

  it('todas las escrituras pasan por la cola (core:ai.*) y fuera de ella la base no deja escribir', async () => {
    const { store, ctx, db } = await montar()
    const spy = vi.spyOn(ctx.queue, 'enqueue')
    const antes = ctx.queue.committedCount
    const t = await store.createThread({ title: 'Prueba', model: 'm' })
    await store.renameThread(t.id, 'Otra')
    const m = await store.appendMessage(t.id, { role: 'assistant', content: 'Te propongo esto', proposals: [propuesta()] })
    await store.updateProposal({ ...m.proposals![0], status: 'rejected', resolvedAt: '2026-11-27T11:00:00.000Z' })
    await store.deleteThread(t.id)
    await store.deleteAllThreads()
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      'core:ai.threads.create',
      'core:ai.threads.rename',
      'core:ai.messages.append',
      'core:ai.proposals.update',
      'core:ai.threads.delete',
      'core:ai.threads.deleteAll'
    ])
    expect(ctx.queue.committedCount - antes).toBe(6)
    // Las lecturas no encolan nada.
    spy.mockClear()
    store.listThreads()
    store.getThread('x')
    store.getProposal('x')
    expect(spy).not.toHaveBeenCalled()
    expect(() => db.run("INSERT INTO core_ai_threads (id, title, model, created_at, updated_at) VALUES ('x', 'x', 'm', 'a', 'a')")).toThrow(
      /fuera de la cola/
    )
  })

  it('las conversaciones no se auditan', async () => {
    const { store, db } = await montar()
    const antes = cuenta(db, 'audit_log')
    const t = await store.createThread({ title: 'Prueba', model: 'm' })
    await store.appendMessage(t.id, { role: 'user', content: 'Hola' })
    await store.deleteThread(t.id)
    expect(cuenta(db, 'audit_log')).toBe(antes)
  })
})

describe('borrado', () => {
  it('borrar un hilo borra sus mensajes y sus propuestas, y deja los demás', async () => {
    const { store, db } = await montar()
    const a = await store.createThread({ title: 'A', model: 'm' })
    const b = await store.createThread({ title: 'B', model: 'm' })
    const m = await store.appendMessage(a.id, { role: 'assistant', content: 'x', proposals: [propuesta()] })
    await store.appendMessage(a.id, { role: 'user', content: 'y' })
    await store.appendMessage(b.id, { role: 'user', content: 'z' })
    const pid = m.proposals![0].id
    expect(store.getProposal(pid)).not.toBeNull()

    await store.deleteThread(a.id)
    expect(store.getThread(a.id)).toBeNull()
    expect(store.getProposal(pid)).toBeNull()
    expect(db.all('SELECT thread_id FROM core_ai_messages')).toEqual([{ thread_id: b.id }])
    expect(store.listThreads().map((t) => t.id)).toEqual([b.id])
    // Borrar uno que ya no existe no falla.
    await expect(store.deleteThread(a.id)).resolves.toBeUndefined()
  })

  it('la clave ajena borra los mensajes en cascada también desde SQL', async () => {
    const { store, ctx, db } = await montar()
    const a = await store.createThread({ title: 'A', model: 'm' })
    await store.appendMessage(a.id, { role: 'user', content: 'y' })
    escribir(ctx, () => db.run('DELETE FROM core_ai_threads WHERE id = ?', [a.id]))
    expect(cuenta(db, 'core_ai_messages')).toBe(0)
  })

  it('borrar todas devuelve cuántas había y deja las tablas vacías', async () => {
    const { store, db } = await montar()
    expect(await store.deleteAllThreads()).toBe(0)
    for (const title of ['A', 'B', 'C']) {
      const t = await store.createThread({ title, model: 'm' })
      await store.appendMessage(t.id, { role: 'user', content: title })
    }
    expect(await store.deleteAllThreads()).toBe(3)
    expect(cuenta(db, 'core_ai_threads')).toBe(0)
    expect(cuenta(db, 'core_ai_messages')).toBe(0)
    expect(store.listThreads()).toEqual([])
  })
})

describe('propuestas', () => {
  it('al guardar el mensaje se rellenan threadId, messageId y los ids que falten', async () => {
    const { store } = await montar()
    const t = await store.createThread({ title: 'P', model: 'm' })
    const m = await store.appendMessage(t.id, {
      role: 'assistant',
      content: 'Dos propuestas',
      proposals: [propuesta(), propuesta({ id: 'propia', mode: 'group', criterion: 'movimientos de Steam' })]
    })
    const [p1, p2] = m.proposals!
    expect(p1.id).toBeTruthy()
    expect(p1.changes[0].id).toBeTruthy()
    expect(p2.id).toBe('propia')
    for (const p of m.proposals!) expect(p).toMatchObject({ threadId: t.id, messageId: m.id })
    expect(store.getProposal(p1.id)).toEqual(p1)
    expect(store.getProposal('propia')).toEqual(p2)
    expect(store.getProposal('no-existe')).toBeNull()
    expect(store.getProposal('')).toBeNull()
  })

  it('updateProposal cambia el estado de una sin tocar las otras del mismo mensaje', async () => {
    const { store } = await montar()
    const t = await store.createThread({ title: 'P', model: 'm' })
    const m = await store.appendMessage(t.id, { role: 'assistant', content: 'x', proposals: [propuesta({ id: 'p1' }), propuesta({ id: 'p2' })] })
    const p1 = store.getProposal('p1')!
    const aplicada: AiProposal = {
      ...p1,
      status: 'partial',
      resolvedAt: '2026-11-27T12:00:00.000Z',
      changes: [{ ...p1.changes[0], status: 'failed', error: 'El movimiento ya no existe.' }]
    }
    await store.updateProposal(aplicada)
    expect(store.getProposal('p1')).toEqual(aplicada)
    expect(store.getProposal('p2')).toEqual(m.proposals![1])
    // Y se ve igual al leer la conversación.
    expect(store.getThread(t.id)!.messages[0].proposals).toEqual([aplicada, m.proposals![1]])
  })

  it('updateProposal rechaza propuestas que no existen, mal formadas o movidas de mensaje', async () => {
    const { store } = await montar()
    const t = await store.createThread({ title: 'P', model: 'm' })
    const m = await store.appendMessage(t.id, { role: 'assistant', content: 'x', proposals: [propuesta({ id: 'p1' })] })
    const p = m.proposals![0]
    await expect(store.updateProposal({ ...p, id: 'otra' })).rejects.toThrow(/ya no existe/)
    await expect(store.updateProposal({ ...p, status: 'hecha' as never })).rejects.toThrow(/estado/)
    await expect(store.updateProposal({ ...p, changes: [] })).rejects.toThrow(/cambios/)
    await expect(store.updateProposal({ ...p, messageId: 'otro', status: 'applied' })).rejects.toThrow(/no puede cambiar/)
    expect(store.getProposal('p1')).toEqual(p)
  })

  it('no admite ids de propuesta repetidos (en el mismo mensaje ni frente a otro)', async () => {
    const { store } = await montar()
    const t = await store.createThread({ title: 'P', model: 'm' })
    await expect(
      store.appendMessage(t.id, { role: 'assistant', content: 'x', proposals: [propuesta({ id: 'p1' }), propuesta({ id: 'p1' })] })
    ).rejects.toThrow(/repetido/)
    await store.appendMessage(t.id, { role: 'assistant', content: 'x', proposals: [propuesta({ id: 'p1' })] })
    await expect(store.appendMessage(t.id, { role: 'assistant', content: 'y', proposals: [propuesta({ id: 'p1' })] })).rejects.toThrow(/repetido/)
    expect(store.getThread(t.id)!.messages).toHaveLength(1)
  })
})

describe('restricciones en SQL (1003)', () => {
  it('rol conocido, campos de herramienta solo donde tocan, JSON en forma de lista y hilo existente', async () => {
    const { ctx, db } = await montar()
    const ts = '2026-11-27T10:00:00.000Z'
    escribir(ctx, () => db.run("INSERT INTO core_ai_threads (id, title, model, created_at, updated_at) VALUES ('t', 'T', 'm', ?, ?)", [ts, ts]))
    const ins = (cols: string, vals: string) => () =>
      escribir(ctx, () => db.run(`INSERT INTO core_ai_messages (id, thread_id, seq, created_at, ${cols}) VALUES ('m${Math.random()}', 't', 1, '${ts}', ${vals})`))
    expect(ins('role, content', "'system', 'x'")).toThrow()
    expect(ins('role, content, tool_call_id', "'user', 'x', 'c1'")).toThrow()
    expect(ins('role, content, tool_calls_json', "'tool', 'x', '[]'")).toThrow()
    expect(ins('role, content, proposals_json', "'assistant', 'x', '{}'")).toThrow()
    expect(ins('role, content, proposals_json', "'assistant', 'x', 'no es json'")).toThrow()
    expect(() =>
      escribir(ctx, () => db.run(`INSERT INTO core_ai_messages (id, thread_id, seq, role, content, created_at) VALUES ('h', 'otro', 1, 'user', 'x', ?)`, [ts]))
    ).toThrow()
    expect(() =>
      escribir(ctx, () => db.run("INSERT INTO core_ai_threads (id, title, model, created_at, updated_at) VALUES ('t2', '  ', 'm', ?, ?)", [ts, ts]))
    ).toThrow()
    ins('role, content, proposals_json', "'assistant', 'x', '[]'")()
    // Mismo hilo y mismo seq: repetido.
    expect(ins('role, content', "'user', 'x'")).toThrow()
    expect(cuenta(db, 'core_ai_messages')).toBe(1)
  })
})
