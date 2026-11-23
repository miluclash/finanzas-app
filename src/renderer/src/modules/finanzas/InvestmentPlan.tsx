// Pestaña «Plan»: vigila el plan de inversión (reparto de la próxima aportación, ejecuciones y reglas).
import { CheckCircle, GearSix, Info, Warning, WarningCircle } from '@phosphor-icons/react'
import { useRef, useState, type ReactNode } from 'react'
import { formatDate, formatMonth } from '@shared/dates'
import { formatEur, formatPct } from '@shared/money'
import { DEFAULT_PLAN, type PlanExecutionMonth, type PlanReport, type RuleStatus } from '@shared/modules/finanzas/investmentPlan'
import type { InvestmentPlanConfig } from '@shared/modules/finanzas/types'
import { DataTable, type Column } from './components/DataTable'
import { Aviso, Button, Card, Checkbox, DatePicker, EmptyState, ErrorState, KpiCard, LoadingState, Modal, MoneyField, Seccion, Select, StatusBadge, Tag, TextArea, TextField, type Tono } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'

const ICON: Record<RuleStatus, ReactNode> = {
  ok: <CheckCircle size={20} weight="fill" className="mt-px shrink-0 text-success" aria-label="Se cumple" />,
  warn: <Warning size={20} weight="fill" className="mt-px shrink-0 text-warning" aria-label="Atención" />,
  error: <WarningCircle size={20} weight="fill" className="mt-px shrink-0 text-error" aria-label="No se cumple" />,
  info: <Info size={20} weight="fill" className="mt-px shrink-0 text-info" aria-label="Información" />
}

const EXEC_LABEL: Record<PlanExecutionMonth['status'], { text: string; tono: Tono }> = {
  ok: { text: 'Ejecutada', tono: 'success' },
  short: { text: 'Incompleta', tono: 'warning' },
  missing: { text: 'Sin compras', tono: 'error' },
  pending: { text: 'Pendiente', tono: 'neutral' },
  extra: { text: 'Compras antes de fecha', tono: 'info' }
}

export function PlanView() {
  const q = useApi('finanzas:inv.plan', [])
  const [cfgOpen, setCfgOpen] = useState(false)
  const [thesisFor, setThesisFor] = useState<string | null>(null)
  if (q.isLoading) return <LoadingState filas={3} etiqueta="Cargando el plan de inversión" />
  if (q.error || !q.data) return <ErrorState titulo="No se ha podido cargar el plan" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
  const r = q.data!
  return (
    <div className="flex flex-col gap-6">
      {!r.config.enabled ? (
        <div className="card">
          <EmptyState
            icono={<GearSix size={24} aria-hidden />}
            titulo="Plan de inversión sin configurar"
            texto="Indica la aportación mensual, el día de ejecución, el bloque núcleo y el de satélites. La app vigilará las reglas del plan y te dirá cómo repartir cada aportación."
            accion={
              <Button variant="primary" onClick={() => setCfgOpen(true)}>
                Configurar plan
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {r.setupIssues.length > 0 && (
            <Aviso tono="warning">
              <ul className="list-disc pl-4">
                {r.setupIssues.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Aviso>
          )}
          <div className="grid gap-6 @lg:grid-cols-2 @4xl:grid-cols-4">
            <KpiCard titulo="Próxima ejecución" valor={<span className="kpi-num">{r.nextExecution ? formatDate(r.nextExecution) : '—'}</span>} contexto={`Día ${r.config.executionDay} de cada mes`} />
            <KpiCard titulo="Efectivo en el bróker" valor={<span className="kpi-num">{formatEur(r.brokerCashCents)}</span>} contexto={`Aportación: ${formatEur(r.config.monthlyCents)}`} />
            <KpiCard titulo="Comprado desde el inicio" valor={<span className="kpi-num">{formatEur(r.boughtSinceStartCents)}</span>} contexto={`Transferido ${formatEur(r.contributedSinceStartCents)}`} />
            <KpiCard
              titulo={`Cartera al ${r.config.endDate ? formatDate(r.config.endDate) : 'final'}`}
              valor={<span className="kpi-num">{r.projectedEndCents !== null ? formatEur(r.projectedEndCents) : '—'}</span>}
              contexto={`${r.remainingExecutions} ejecuciones más, sin contar mercado`}
            />
          </div>
          <div className="grid gap-6 @4xl:grid-cols-2">
            <Card
              titulo="Reparto de la próxima aportación"
              accion={
                <Button size="sm" variant="ghost" icon={<GearSix size={16} />} onClick={() => setCfgOpen(true)}>
                  Configurar
                </Button>
              }
            >
              <p className="t-meta mb-3">{r.nextExecution ? `Importes para los planes del ${formatDate(r.nextExecution)}. Fija euros, no participaciones.` : 'El plan ha terminado.'}</p>
              <SplitTable r={r} />
            </Card>
            <Card titulo="Reglas del plan">
              <ul className="divide-line">
                {r.rules.map((x) => (
                  <li key={x.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    {ICON[x.status]}
                    <div className="min-w-0">
                      <div className="t-body font-semibold">{x.label}</div>
                      <div className="t-label">{x.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Seccion titulo="Satélites" texto="Sin tesis escrita no reciben dinero. Si pasan su límite, dejan de recibir aportaciones; no se venden.">
            <SatTable r={r} onThesis={setThesisFor} />
          </Seccion>
          <Seccion titulo="Ejecuciones mes a mes">
            <ExecTable rows={r.executions} />
          </Seccion>
        </>
      )}
      {cfgOpen && <PlanForm cfg={r.config} onClose={() => setCfgOpen(false)} />}
      {thesisFor && <ThesisForm cfg={r.config} instrumentId={thesisFor} onClose={() => setThesisFor(null)} />}
    </div>
  )
}

function SplitTable({ r }: { r: PlanReport }) {
  if (!r.split.length) return <p className="t-label">Sin bloques definidos.</p>
  const total = r.split.reduce((s, x) => s + x.amountCents, 0)
  return (
    <div className="overflow-x-auto">
      <table className="table" data-density="compact" aria-label="Reparto de la próxima aportación">
        <thead>
          <tr>
            <th scope="col">Bloque</th>
            <th scope="col">Activo</th>
            <th scope="col" className="text-right">
              Objetivo
            </th>
            <th scope="col" className="text-right">
              Importe
            </th>
          </tr>
        </thead>
        <tbody>
          {r.split.map((x) => (
            <tr key={x.blockId}>
              <td>{x.blockName}</td>
              <td className="py-2">
                {x.instrumentName ?? '—'}
                {x.note && <div className="t-meta">{x.note}</div>}
              </td>
              <td className="tnum text-right">{formatPct(x.targetPct)}</td>
              <td className="tnum text-right font-semibold">{formatEur(x.amountCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={3} className="py-3">
              Total
            </td>
            <td className="tnum text-right">{formatEur(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function SatTable({ r, onThesis }: { r: PlanReport; onThesis: (id: string) => void }) {
  type Row = PlanReport['satellites'][number]
  const cols: Column<Row>[] = [
    { key: 'n', header: 'Satélite', cell: (x) => <span className="font-medium">{x.name}</span> },
    { key: 'v', header: 'Valor', align: 'right', cell: (x) => <span className="tnum">{formatEur(x.valueCents)}</span> },
    {
      key: 'w',
      header: 'Peso / límite',
      align: 'right',
      cell: (x) => (
        <span className={x.weight !== null && x.weight > x.maxPct ? 'tnum font-semibold text-warning' : 'tnum'}>
          {formatPct(x.weight)} / {formatPct(x.maxPct)}
        </span>
      )
    },
    {
      key: 't',
      header: 'Tesis',
      cell: (x) => (x.hasThesis ? <StatusBadge tono="success">Escrita{x.thesisReview ? ` · revisar ${formatDate(x.thesisReview)}` : ''}</StatusBadge> : <StatusBadge tono="warning">Sin tesis</StatusBadge>)
    },
    { key: 'm', header: 'Recibe dinero', cell: (x) => (x.receivesMoney ? <Tag>Sí</Tag> : <Tag>No</Tag>) },
    {
      key: 'a',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      cell: (x) => (
        <Button size="sm" variant="ghost" onClick={() => onThesis(x.instrumentId)}>
          {x.hasThesis ? 'Editar tesis' : 'Escribir tesis'}
        </Button>
      )
    }
  ]
  return (
    <DataTable
      rows={r.satellites}
      columns={cols}
      rowKey={(x) => x.instrumentId}
      empty={
        <div className="card">
          <EmptyState compacto icono={<Info size={20} aria-hidden />} titulo="Sin satélites" texto="Asigna activos al bloque de satélites en «Activos y reparto objetivo»." />
        </div>
      }
    />
  )
}

function ExecTable({ rows }: { rows: PlanExecutionMonth[] }) {
  const cols: Column<PlanExecutionMonth>[] = [
    { key: 'm', header: 'Mes', cell: (x) => <span className="capitalize">{formatMonth(x.month, true)}</span> },
    { key: 'd', header: 'Fecha prevista', cell: (x) => <span className="tnum">{formatDate(x.expectedDate)}</span> },
    { key: 'p', header: 'Previsto', align: 'right', cell: (x) => <span className="tnum">{formatEur(x.plannedCents)}</span> },
    { key: 'b', header: 'Comprado', align: 'right', cell: (x) => <span className="tnum">{formatEur(x.boughtCents)}</span> },
    {
      key: 'n',
      header: 'Compras',
      align: 'right',
      cell: (x) => (
        <span className="tnum">
          {x.buys}
          {x.manualBuys ? ` (${x.manualBuys} manual)` : ''}
        </span>
      )
    },
    { key: 's', header: 'Estado', cell: (x) => <StatusBadge tono={EXEC_LABEL[x.status].tono}>{EXEC_LABEL[x.status].text}</StatusBadge> }
  ]
  return (
    <DataTable
      rows={[...rows].reverse()}
      columns={cols}
      rowKey={(x) => x.month}
      empty={
        <div className="card">
          <EmptyState compacto icono={<Info size={20} aria-hidden />} titulo="El plan aún no ha empezado" texto="Cuando llegue la primera fecha de ejecución verás aquí cada mes." />
        </div>
      }
    />
  )
}

function PlanForm({ cfg, onClose }: { cfg: InvestmentPlanConfig; onClose: () => void }) {
  const { cat } = useCatalog()
  const [c, setC] = useState<InvestmentPlanConfig>({ ...DEFAULT_PLAN, ...cfg, enabled: true })
  const set = <K extends keyof InvestmentPlanConfig>(k: K, v: InvestmentPlanConfig[K]) => setC((p) => ({ ...p, [k]: v }))
  const save = useApiMutation('finanzas:settings.update', { success: 'Plan guardado', onSuccess: onClose })
  const accounts = cat?.accounts ?? []
  const blocks = cat?.blocks ?? []
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo="Plan de inversión"
        ancho="lg"
        onCerrar={onClose}
        pie={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="accent" cargando={save.isPending} onClick={() => save.mutate([{ investmentPlan: c }])}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Checkbox checked={c.enabled} onChange={(v) => set('enabled', v)} label="Vigilar el plan" />
          </div>
          <DatePicker label="Inicio del plan" value={c.startDate} onChange={(v) => set('startDate', v)} />
          <TextField type="date" label="Fin de las aportaciones" ayuda="Vacío si no tiene fin." value={c.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)} />
          <MoneyField label="Aportación mensual" value={c.monthlyCents} onChange={(v) => set('monthlyCents', v ?? 0)} />
          <Select label="Día de ejecución" ayuda="Trade Republic solo permite el 2 o el 16." value={c.executionDay} onChange={(e) => set('executionDay', Number(e.target.value))}>
            <option value={2}>Día 2</option>
            <option value={16}>Día 16</option>
          </Select>
          <Select label="Bloque núcleo" value={c.coreBlockId ?? ''} onChange={(e) => set('coreBlockId', e.target.value || null)}>
            <option value="">—</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select label="Bloque de satélites" value={c.satelliteBlockId ?? ''} onChange={(e) => set('satelliteBlockId', e.target.value || null)}>
            <option value="">—</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <TextField label="Máximo de satélites a la vez" type="number" min={0} max={20} unidad="satélites" value={c.maxSatellites} onChange={(e) => set('maxSatellites', Number(e.target.value))} className="[&_input]:text-right" />
          <Select label="Cuenta del bróker" value={c.brokerAccountId ?? ''} onChange={(e) => set('brokerAccountId', e.target.value || null)}>
            <option value="">—</option>
            {accounts
              .filter((a) => a.type === 'INVESTMENT' || a.type === 'CRYPTO')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
          <Select label="Cuenta del colchón" ayuda="La hucha donde está el colchón." value={c.cushionAccountId ?? ''} onChange={(e) => set('cushionAccountId', e.target.value || null)}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <MoneyField label="Colchón mínimo" value={c.cushionCents} onChange={(v) => set('cushionCents', v ?? 0)} />
          <DatePicker label="Primera revisión completa" value={c.firstReviewDate} onChange={(v) => set('firstReviewDate', v)} />
          <TextField label="Revisar cada" type="number" min={1} max={24} unidad="meses" value={c.reviewEveryMonths} onChange={(e) => set('reviewEveryMonths', Number(e.target.value))} className="[&_input]:text-right" />
        </div>
      </Modal>
    </div>
  )
}

function ThesisForm({ cfg, instrumentId, onClose }: { cfg: InvestmentPlanConfig; instrumentId: string; onClose: () => void }) {
  const { maps } = useCatalog()
  const cur = cfg.theses[instrumentId]
  const [text, setText] = useState(cur?.text ?? '')
  const [review, setReview] = useState(cur?.reviewDate ?? '')
  const textoRef = useRef<HTMLTextAreaElement>(null)
  const save = useApiMutation('finanzas:settings.update', { success: 'Tesis guardada', onSuccess: onClose })
  const name = maps.instrument.get(instrumentId)?.name ?? instrumentId
  const write = (t: string) => {
    const theses = { ...cfg.theses }
    if (t.trim()) theses[instrumentId] = { text: t, reviewDate: review || null }
    else delete theses[instrumentId]
    save.mutate([{ investmentPlan: { ...cfg, theses } }])
  }
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={`Tesis de ${name}`}
        ancho="lg"
        inicial={textoRef}
        onCerrar={onClose}
        pie={
          <>
            {cur && (
              <Button variant="danger" className="mr-auto" onClick={() => write('')}>
                Borrar tesis
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="accent" cargando={save.isPending} onClick={() => write(text)}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextArea
            ref={textoRef}
            label="Tesis"
            ayuda="Qué es y por qué lo hará mejor que el mercado · qué tiene que pasar en 3–5 años · qué te haría vender (que la tesis se rompa, no que baje el precio)."
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <TextField type="date" label="Fecha de revisión" value={review} onChange={(e) => setReview(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}
