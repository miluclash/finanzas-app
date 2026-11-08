// Servidor MCP de Finanzas (solo lectura).
//
// Claude Desktop lanza este proceso y habla con él por stdin/stdout con mensajes JSON-RPC.
// Por eso NUNCA se escribe nada en stdout con console.log: rompería el protocolo.
// Los mensajes de diagnóstico van a stderr (console.error), que Claude Desktop guarda en sus logs.
//
// Lee el mismo archivo finanzas.sqlite que la app y reutiliza sus cálculos (src/shared/domain),
// así que las cifras son idénticas a las de la pantalla. Nunca escribe en la base de datos.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { Db } from '../main/db/db'
import { loadSnapshot } from '../main/db/store'
import { addMonthsToMonth, monthOf, todayISO } from '../shared/dates'
import { budgetReport } from '../shared/domain/budgets'
import { buildCtx, type Ctx } from '../shared/domain/ctx'
import { goalProgress } from '../shared/domain/goals'
import { planReport } from '../shared/domain/investmentPlan'
import { portfolioSummary } from '../shared/domain/investments'
import { allBalances, monthSummary } from '../shared/domain/ledger'

// ---------- Acceso a los datos ----------

function dbPath(): string {
  if (process.env.FINANZAS_DB) return process.env.FINANZAS_DB
  const dir = process.env.FINANZAS_DATA_DIR
  if (dir) return path.join(dir, 'finanzas.sqlite')
  // Misma carpeta que usa la app: %APPDATA%\Finanzas (Windows) o equivalente
  const appData =
    process.env.APPDATA ??
    (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'))
  return path.join(appData, 'Finanzas', 'finanzas.sqlite')
}

let cache: { mtimeMs: number; day: string; ctx: Ctx } | null = null

/** Contexto de cálculo. Se vuelve a leer el archivo solo si la app lo ha guardado desde la última vez. */
async function ctx(): Promise<Ctx> {
  const file = dbPath()
  if (!fs.existsSync(file)) throw new Error(`No encuentro la base de datos en ${file}. Abre Finanzas al menos una vez.`)
  const mtimeMs = fs.statSync(file).mtimeMs
  const day = todayISO()
  if (cache && cache.mtimeMs === mtimeMs && cache.day === day) return cache.ctx
  const db = await Db.open(file) // copia en memoria: lo que pase aquí no toca el archivo
  const c = buildCtx(loadSnapshot(db), day)
  cache = { mtimeMs, day, ctx: c }
  return c
}

/** Convierte las claves …Cents a euros para que el modelo no tenga que dividir entre 100. */
function toEur(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(toEur)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) {
      if (k.endsWith('Cents') && (typeof x === 'number' || x === null)) out[k.slice(0, -5) + 'Eur'] = x === null ? null : x / 100
      else out[k] = toEur(x)
    }
    return out
  }
  return v
}

/** Respuesta de una herramienta: texto JSON. Si algo falla, se marca como error para que Claude lo sepa. */
async function reply(fn: (c: Ctx) => unknown) {
  try {
    const data = toEur(fn(await ctx()))
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] }
  } catch (e) {
    return { isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }] }
  }
}

const name = (c: Ctx, id: string | null) => (id ? (c.accountById.get(id)?.name ?? c.categoryById.get(id)?.name ?? c.instrumentById.get(id)?.name ?? id) : null)
const month = z.string().regex(/^\d{4}-\d{2}$/).describe('Mes AAAA-MM. Por defecto, el actual.')

// ---------- Servidor y herramientas ----------

const server = new McpServer({ name: 'finanzas', version: '1.0.0' })

server.registerTool(
  'estado_plan_inversion',
  {
    title: 'Estado del plan de inversión',
    description:
      'Informe del plan de inversión: reparto de la próxima aportación por bloque, ejecuciones mes a mes frente a lo previsto, ' +
      'reglas del plan (ventas, compras manuales, satélites, tesis, colchón, revisión) con su estado, satélites y proyección. ' +
      'Úsala para cualquier pregunta sobre si se está cumpliendo el plan o cuánto invertir.',
    annotations: { readOnlyHint: true }
  },
  () => reply((c) => planReport(c, c.settings.investmentPlan))
)

server.registerTool(
  'cartera',
  {
    title: 'Cartera de inversión',
    description: 'Posiciones (unidades, coste, valor, plusvalía, peso), reparto por bloques frente al objetivo, aportado, ganancia y alertas.',
    annotations: { readOnlyHint: true }
  },
  () =>
    reply((c) => {
      const s = portfolioSummary(c)
      return {
        ...s,
        holdings: s.holdings
          .filter((h) => Number(h.units) > 0)
          .map((h) => ({
            nombre: h.name,
            bloque: name(c, h.blockId) ?? (h.blockId ? c.blocks.find((b) => b.id === h.blockId)?.name : null),
            unidades: h.units,
            precioMedio: h.avgCost,
            ultimoPrecio: h.lastPrice,
            fechaPrecio: h.lastPriceDate,
            costBasisCents: h.costBasisCents,
            marketValueCents: h.marketValueCents,
            unrealizedCents: h.unrealizedCents,
            peso: h.weight
          }))
      }
    })
)

server.registerTool(
  'resumen_mes',
  {
    title: 'Resumen del mes',
    description: 'Ingresos, gastos, ahorro y gasto por categoría de un mes, y saldos actuales de cada cuenta.',
    inputSchema: { mes: month.optional() },
    annotations: { readOnlyHint: true }
  },
  ({ mes }) =>
    reply((c) => ({
      resumen: monthSummary(c, mes ?? monthOf(c.today)),
      saldos: allBalances(c).map((b) => ({ ...b, cuenta: name(c, b.accountId) }))
    }))
)

server.registerTool(
  'presupuestos',
  {
    title: 'Presupuestos',
    description: 'Presupuesto frente a gasto real por categoría en un mes, con el % del mes transcurrido.',
    inputSchema: { mes: month.optional() },
    annotations: { readOnlyHint: true }
  },
  ({ mes }) => reply((c) => budgetReport(c, mes ?? monthOf(c.today)))
)

server.registerTool(
  'objetivos',
  {
    title: 'Objetivos de ahorro',
    description: 'Huchas y objetivos (C1, IBM, HYROX…): ahorrado, falta, fecha límite y cuánto hay que apartar al mes.',
    annotations: { readOnlyHint: true }
  },
  () =>
    reply((c) =>
      c.goals.map((g) => ({ nombre: g.name, objetivoCents: g.targetCents, fechaLimite: g.deadline, estado: g.status, ...goalProgress(c, g) }))
    )
)

server.registerTool(
  'movimientos',
  {
    title: 'Buscar movimientos',
    description: 'Lista movimientos de las cuentas filtrando por fechas, texto, cuenta o categoría. Importes negativos = salidas.',
    inputSchema: {
      desde: z.string().optional().describe('Fecha AAAA-MM-DD. Por defecto, hace 3 meses.'),
      hasta: z.string().optional().describe('Fecha AAAA-MM-DD. Por defecto, hoy.'),
      texto: z.string().optional().describe('Busca en descripción, comercio y notas.'),
      cuenta: z.string().optional().describe('Nombre (o parte) de la cuenta.'),
      categoria: z.string().optional().describe('Nombre (o parte) de la categoría.'),
      limite: z.number().int().min(1).max(500).optional().describe('Máximo de resultados (por defecto 100).')
    },
    annotations: { readOnlyHint: true }
  },
  (a) =>
    reply((c) => {
      const desde = a.desde ?? `${addMonthsToMonth(monthOf(c.today), -3)}-01`
      const hasta = a.hasta ?? c.today
      const has = (v: string | null, q?: string) => !q || (v ?? '').toLowerCase().includes(q.toLowerCase())
      const rows = c.counted
        .filter((t) => t.date >= desde && t.date <= hasta)
        .filter((t) => has(name(c, t.accountId), a.cuenta) && (!a.categoria || has(name(c, t.categoryId), a.categoria)))
        .filter((t) => !a.texto || has(`${t.description} ${t.merchant ?? ''} ${t.notes ?? ''}`, a.texto))
      const lim = a.limite ?? 100
      return {
        total: rows.length,
        mostrados: Math.min(lim, rows.length),
        sumaCents: rows.reduce((s, t) => s + t.amountCents, 0),
        movimientos: rows.slice(-lim).map((t) => ({
          fecha: t.date,
          descripcion: t.description,
          amountCents: t.amountCents,
          tipo: t.type,
          cuenta: name(c, t.accountId),
          categoria: name(c, t.categoryId)
        }))
      }
    })
)

// Un "prompt" es una plantilla que aparece en el menú de Claude (+ → Finanzas) y arranca una tarea con un clic.
server.registerPrompt(
  'revision_mensual',
  { title: 'Revisión mensual del plan', description: 'Revisa el mes: gastos, objetivos y cumplimiento del plan de inversión.' },
  () => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text:
            'Haz mi revisión mensual con las herramientas de Finanzas: 1) resumen_mes y presupuestos del mes actual, ' +
            '2) objetivos, 3) estado_plan_inversion. Aplica las reglas del plan de inversión de este proyecto. ' +
            'Dime qué reglas fallan, cuánto poner en cada plan en la próxima ejecución y qué tengo que hacer antes de esa fecha.'
        }
      }
    ]
  })
)

async function main() {
  await server.connect(new StdioServerTransport())
  console.error(`[finanzas-mcp] listo. Base de datos: ${dbPath()}`)
}

main().catch((e) => {
  console.error('[finanzas-mcp] error al arrancar', e)
  process.exit(1)
})
