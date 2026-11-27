// OllamaProvider contra un servidor HTTP de prueba en 127.0.0.1 (nada de Ollama real): streaming
// NDJSON, herramientas, lista de modelos, errores tipados, tiempos de espera, cancelar y URL no local.
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OllamaProvider, toOllamaMessages } from '../../../src/main/core/ai/ollama'
import { LlmError } from '../../../src/main/core/ai/llmError'
import type { LlmChunk } from '../../../src/shared/core/ai-types'

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void

let handler: Handler = (_q, _b, res) => res.end()
const bodies: Array<{ url: string; body: string }> = []
let server: http.Server
let base = ''

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      bodies.push({ url: req.url ?? '', body })
      handler(req, body, res)
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
})

const ndjson = (...lines: unknown[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n'

async function collect(it: AsyncIterable<LlmChunk>): Promise<LlmChunk[]> {
  const out: LlmChunk[] = []
  for await (const c of it) out.push(c)
  return out
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(LlmError)
    return (e as LlmError).code
  }
  return 'sin error'
}

const req = { model: 'qwen3:8b', messages: [{ role: 'user' as const, content: 'hola' }] }

describe('OllamaProvider', () => {
  it('chat: lee el NDJSON en trozos (también una línea partida), con texto, herramientas y fin', async () => {
    handler = (_q, _b, res) => {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
      const all = ndjson(
        { message: { role: 'assistant', content: 'Hola, ' }, done: false },
        { message: { role: 'assistant', content: 'Michael.' }, done: false },
        { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'core_metricas_lista', arguments: { modulo: 'finanzas' } } }] }, done: false },
        { message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 12, eval_count: 7 }
      )
      // Se parte a mitad de una línea para comprobar que el búfer junta los trozos.
      res.write(all.slice(0, 30))
      setTimeout(() => res.end(all.slice(30)), 20)
    }
    const p = new OllamaProvider({ baseUrl: `${base}/` })
    const chunks = await collect(
      p.chat({ ...req, tools: [{ name: 'core_metricas_lista', description: 'x', parameters: { type: 'object', properties: {} } }], think: false })
    )
    expect(chunks.filter((c) => c.type === 'delta').map((c) => (c as { text: string }).text).join('')).toBe('Hola, Michael.')
    const tc = chunks.find((c) => c.type === 'toolCalls') as Extract<LlmChunk, { type: 'toolCalls' }>
    expect(tc.calls).toHaveLength(1)
    expect(tc.calls[0]).toMatchObject({ name: 'core_metricas_lista', arguments: { modulo: 'finanzas' } })
    expect(tc.calls[0].id).toMatch(/\S/)
    expect(chunks.at(-1)).toEqual({ type: 'done', promptTokens: 12, completionTokens: 7 })
    const sent = JSON.parse(bodies.at(-1)!.body)
    expect(bodies.at(-1)!.url).toBe('/api/chat')
    expect(sent).toMatchObject({ model: 'qwen3:8b', stream: true, think: false, options: { num_ctx: 12_288 } })
    expect(sent.tools[0]).toEqual({ type: 'function', function: { name: 'core_metricas_lista', description: 'x', parameters: { type: 'object', properties: {} } } })
  })

  it('convierte el historial al formato de Ollama (llamadas y resultados de herramientas)', () => {
    expect(
      toOllamaMessages([
        { role: 'system', content: 's' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'x_y', arguments: { n: 1 } }] },
        { role: 'tool', content: '{"ok":1}', toolCallId: 'a', toolName: 'x_y' }
      ])
    ).toEqual([
      { role: 'system', content: 's' },
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'x_y', arguments: { n: 1 } } }] },
      { role: 'tool', content: '{"ok":1}', tool_name: 'x_y' }
    ])
  })

  it('los argumentos en texto JSON también se leen', async () => {
    handler = (_q, _b, res) => {
      res.end(ndjson({ message: { content: '', tool_calls: [{ function: { name: 'a_b', arguments: '{"x":2}' } }] }, done: false }, { done: true }))
    }
    const chunks = await collect(new OllamaProvider({ baseUrl: base }).chat(req))
    expect((chunks[0] as Extract<LlmChunk, { type: 'toolCalls' }>).calls[0].arguments).toEqual({ x: 2 })
  })

  it('listModels: nombres y tamaños de /api/tags', async () => {
    handler = (_q, _b, res) => res.end(JSON.stringify({ models: [{ name: 'qwen3:8b', size: 5_200_000_000 }, { model: 'llama3.2:latest' }] }))
    expect(await new OllamaProvider({ baseUrl: base }).listModels()).toEqual([{ name: 'qwen3:8b', size: 5_200_000_000 }, { name: 'llama3.2:latest' }])
    expect(bodies.at(-1)!.url).toBe('/api/tags')
  })

  it('modelo sin descargar → model_missing con la orden ollama pull', async () => {
    handler = (_q, _b, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'model "qwen3:8b" not found, try pulling it first' }))
    }
    const e = await collect(new OllamaProvider({ baseUrl: base }).chat(req)).catch((x) => x)
    expect(e).toBeInstanceOf(LlmError)
    expect(e.code).toBe('model_missing')
    expect(e.message).toContain('ollama pull qwen3:8b')
  })

  it('un error dentro del streaming también se tipa', async () => {
    handler = (_q, _b, res) => res.end(ndjson({ message: { content: 'a' }, done: false }, { error: 'model "x" not found' }))
    expect(await codeOf(collect(new OllamaProvider({ baseUrl: base }).chat(req)))).toBe('model_missing')
  })

  it('un modelo que no razona rechaza «think»: se reintenta sin él', async () => {
    let n = 0
    handler = (_q, body, res) => {
      n++
      if ('think' in JSON.parse(body)) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: '"llama3" does not support thinking' }))
      } else res.end(ndjson({ message: { content: 'ok' }, done: true }))
    }
    const chunks = await collect(new OllamaProvider({ baseUrl: base }).chat({ ...req, think: false }))
    expect(n).toBe(2)
    expect(chunks[0]).toEqual({ type: 'delta', text: 'ok' })
  })

  it('una respuesta que se corta antes de terminar → bad_response', async () => {
    handler = (_q, _b, res) => res.end(ndjson({ message: { content: 'a' }, done: false }))
    expect(await codeOf(collect(new OllamaProvider({ baseUrl: base }).chat(req)))).toBe('bad_response')
  })

  it('Ollama apagado (puerto cerrado) → unreachable, en chat y en listModels', async () => {
    const tmp = http.createServer()
    await new Promise<void>((r) => tmp.listen(0, '127.0.0.1', r))
    const port = (tmp.address() as AddressInfo).port
    await new Promise<void>((r) => tmp.close(() => r()))
    const p = new OllamaProvider({ baseUrl: `http://127.0.0.1:${port}` })
    expect(await codeOf(p.listModels())).toBe('unreachable')
    expect(await codeOf(collect(p.chat(req)))).toBe('unreachable')
  })

  it('tiempo de espera entre trozos → timeout; y la lista de modelos también tiene el suyo', async () => {
    handler = (_q, _b, res) => {
      res.writeHead(200)
      res.write(ndjson({ message: { content: 'a' }, done: false }))
      // y se queda callado
    }
    expect(await codeOf(collect(new OllamaProvider({ baseUrl: base, firstChunkTimeoutMs: 2000, chunkTimeoutMs: 80 }).chat(req)))).toBe('timeout')
    handler = () => undefined
    expect(await codeOf(new OllamaProvider({ baseUrl: base, listTimeoutMs: 80 }).listModels())).toBe('timeout')
    expect(await codeOf(collect(new OllamaProvider({ baseUrl: base, firstChunkTimeoutMs: 80 }).chat(req)))).toBe('timeout')
  })

  it('cancelar con AbortSignal → aborted (antes y durante la respuesta)', async () => {
    handler = (_q, _b, res) => {
      res.writeHead(200)
      res.write(ndjson({ message: { content: 'a' }, done: false }))
    }
    const ctrl = new AbortController()
    const p = new OllamaProvider({ baseUrl: base })
    const run = (async () => {
      for await (const c of p.chat({ ...req, signal: ctrl.signal })) if (c.type === 'delta') ctrl.abort()
    })()
    expect(await codeOf(run)).toBe('aborted')
    const ya = new AbortController()
    ya.abort()
    expect(await codeOf(collect(p.chat({ ...req, signal: ya.signal })))).toBe('aborted')
  })

  it('una URL que no es de este equipo se rechaza (bad_url) sin hacer ninguna petición', async () => {
    const antes = bodies.length
    for (const url of ['http://ejemplo.invalid:11434', 'http://192.168.1.10:11434', 'ftp://localhost:11434', 'http://user:pw@localhost:11434']) {
      const p = new OllamaProvider({ baseUrl: url })
      expect(await codeOf(p.listModels())).toBe('bad_url')
      expect(await codeOf(collect(p.chat(req)))).toBe('bad_url')
    }
    expect(bodies.length).toBe(antes)
  })
})
