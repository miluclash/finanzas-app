// Pestaña «Plan»: vigila el plan de inversión (reparto de la próxima aportación, ejecuciones y reglas).
import { AlertTriangle, CheckCircle2, Info, Settings2, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatDate, formatMonth } from '@shared/dates'
import { formatEur, formatPct } from '@shared/money'
import { DEFAULT_PLAN, type PlanExecutionMonth, type PlanReport, type RuleStatus } from '@shared/domain/investmentPlan'
import type { InvestmentPlanConfig } from '@shared/types'
import { DataTable, type Column } from '../components/DataTable'
import { Badge, Button, Checkbox, DateInput, EmptyState, ErrorBox, Field, Loading, Modal, MoneyInput, Notice, Section, Select, TextArea, TextInput } from '../components/ui'
import { useApi, useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'

const ICON: Record<RuleStatus, ReactNode> = {
  ok: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-pos" />,
  warn: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />,
  error: <XCircle className="mt-0.5 size-4 shrink-0 text-neg" />,
  info: <Info className="mt-0.5 size-4 shrink-0 text-muted" />
}

const EXEC_LABEL: Record<PlanExecutionMonth['status'], { text: string; tone: 'pos' | 'warn' | 'neg' | 'neutral' | 'accent' }> = {
  ok: { text: 'Ejecutada', tone: 'pos' },
  short: { text: 'Incompleta', tone: 'warn' },
  missing: { text: 'Sin compras', tone: 'neg' },
  pending: { text: 'Pendiente', tone: 'neutral' },
  extra: { text: 'Compras antes de fecha', tone: 'accent' }
}

export function PlanView() {
  const q = useApi('inv.plan', [])
  const [cfgOpen, setCfgOpen] = useState(false)
  const [thesisFor, setThesisFor] = useState<string | null>(null)
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const r = q.data!
  return (
    <div className="flex flex-col gap-6">
      {!r.config.enabled ? (
        <EmptyState
          title="Plan de inversión sin configurar"
          text="Indica la aportación mensual, el día de ejecución, el bloque núcleo y el de satélites. La app vigilará las reglas del plan y te dirá cómo repartir cada aportación."
          action={<Button variant="primary" onClick={() => setCfgOpen(true)}>Configurar plan</Button>}
        />
      ) : (
        <>
          {r.setupIssues.length > 0 && (
            <Notice tone="warn">
              <ul className="list-disc pl-4">{r.setupIssues.map((t) => <li key={t}>{t}</li>)}</ul>
            </Notice>
          )}
          <section className="grid grid-cols-4 rounded-lg border border-line bg-surface">
            <Fig label="Próxima ejecución" value={r.nextExecution ? formatDate(r.nextExecution) : '—'} sub={`Día ${r.config.executionDay} de cada mes`} />
            <Fig label="Efectivo en el bróker" value={formatEur(r.brokerCashCents)} sub={`Aportación: ${formatEur(r.config.monthlyCents)}`} border />
            <Fig label="Comprado desde el inicio" value={formatEur(r.boughtSinceStartCents)} sub={`Transferido ${formatEur(r.contributedSinceStartCents)}`} border />
            <Fig
              label={`Cartera al ${r.config.endDate ? formatDate(r.config.endDate) : 'final'}`}
              value={r.projectedEndCents !== null ? formatEur(r.projectedEndCents) : '—'}
              sub={`${r.remainingExecutions} ejecuciones más, sin contar mercado`}
              border
            />
          </section>
          <div className="grid grid-cols-2 gap-6">
            <Section
              title="Reparto de la próxima aportación"
              description={r.nextExecution ? `Importes para los planes del ${formatDate(r.nextExecution)}. Fija euros, no participaciones.` : 'El plan ha terminado.'}
              boxed
              actions={<Button size="sm" variant="ghost" icon={<Settings2 className="size-4" />} onClick={() => setCfgOpen(true)}>Configurar</Button>}
            >
              <SplitTable r={r} />
            </Section>
            <Section title="Reglas del plan" boxed>
              <ul className="flex flex-col gap-2">
                {r.rules.map((x) => (
                  <li key={x.id} className="flex items-start gap-2 text-[13px]">
                    {ICON[x.status]}
                    <div>
                      <div className="font-medium text-ink">{x.label}</div>
                      <div className="text-muted">{x.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
          <Section title="Satélites" description="Sin tesis escrita no reciben dinero. Si pasan su límite, dejan de recibir aportaciones; no se venden.">
            <SatTable r={r} onThesis={setThesisFor} />
          </Section>
          <Section title="Ejecuciones mes a mes">
            <ExecTable rows={r.executions} />
          </Section>
        </>
      )}
      {cfgOpen && <PlanForm cfg={r.config} onClose={() => setCfgOpen(false)} />}
      {thesisFor && <ThesisForm cfg={r.config} instrumentId={thesisFor} onClose={() => setThesisFor(null)} />}
    </div>
  )
}

function Fig({ label, value, sub, border }: { label: string; value: string; sub: string; border?: boolean }) {
  return (
    <div className={border ? 'border-l border-line px-4 py-3' : 'px-4 py-3'}>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="num text-lg font-semibold text-ink">{value}</div>
      <div className="text-[12px] text-muted">{sub}</div>
    </div>
  )
}

function SplitTable({ r }: { r: PlanReport }) {
  if (!r.split.length) return <p className="text-[13px] text-muted">Sin bloques definidos.</p>
  const total = r.split.reduce((s, x) => s + x.amountCents, 0)
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-left text-muted">
          <th className="pb-1 font-medium">Bloque</th>
          <th className="pb-1 font-medium">Activo</th>
          <th className="pb-1 text-right font-medium">Objetivo</th>
          <th className="pb-1 text-right font-medium">Importe</th>
        </tr>
      </thead>
      <tbody>
        {r.split.map((x) => (
          <tr key={x.blockId} className="border-t border-line align-top">
            <td className="py-1.5">{x.blockName}</td>
            <td className="py-1.5">
              {x.instrumentName ?? '—'}
              {x.note && <div className="text-[12px] text-muted">{x.note}</div>}
            </td>
            <td className="num py-1.5 text-right">{formatPct(x.targetPct)}</td>
            <td className="num py-1.5 text-right font-medium">{formatEur(x.amountCents)}</td>
          </tr>
        ))}
        <tr className="border-t border-line-strong font-semibold">
          <td className="py-1.5" colSpan={3}>Total</td>
          <td className="num py-1.5 text-right">{formatEur(total)}</td>
        </tr>
      </tbody>
    </table>
  )
}

function SatTable({ r, onThesis }: { r: PlanReport; onThesis: (id: string) => void }) {
  type Row = PlanReport['satellites'][number]
  const cols: Column<Row>[] = [
    { key: 'n', header: 'Satélite', cell: (x) => <span className="font-medium">{x.name}</span> },
    { key: 'v', header: 'Valor', align: 'right', cell: (x) => <span className="num">{formatEur(x.valueCents)}</span> },
    {
      key: 'w',
      header: 'Peso / límite',
      align: 'right',
      cell: (x) => (
        <span className={x.weight !== null && x.weight > x.maxPct ? 'num text-warn' : 'num'}>
          {formatPct(x.weight)} / {formatPct(x.maxPct)}
        </span>
      )
    },
    {
      key: 't',
      header: 'Tesis',
      cell: (x) => (x.hasThesis ? <Badge tone="pos">Escrita{x.thesisReview ? ` · revisar ${formatDate(x.thesisReview)}` : ''}</Badge> : <Badge tone="warn">Sin tesis</Badge>)
    },
    { key: 'm', header: 'Recibe dinero', cell: (x) => (x.receivesMoney ? <Badge tone="pos">Sí</Badge> : <Badge>No</Badge>) },
    { key: 'a', header: '', align: 'right', cell: (x) => <Button size="sm" variant="ghost" onClick={() => onThesis(x.instrumentId)}>{x.hasThesis ? 'Editar tesis' : 'Escribir tesis'}</Button> }
  ]
  return (
    <DataTable
      rows={r.satellites}
      columns={cols}
      rowKey={(x) => x.instrumentId}
      empty={<EmptyState title="Sin satélites" text="Asigna activos al bloque de satélites en «Activos y reparto objetivo»." />}
    />
  )
}

function ExecTable({ rows }: { rows: PlanExecutionMonth[] }) {
  const cols: Column<PlanExecutionMonth>[] = [
    { key: 'm', header: 'Mes', cell: (x) => formatMonth(x.month, true) },
    { key: 'd', header: 'Fecha prevista', cell: (x) => formatDate(x.expectedDate) },
    { key: 'p', header: 'Previsto', align: 'right', cell: (x) => <span className="num">{formatEur(x.plannedCents)}</span> },
    { key: 'b', header: 'Comprado', align: 'right', cell: (x) => <span className="num">{formatEur(x.boughtCents)}</span> },
    { key: 'n', header: 'Compras', align: 'right', cell: (x) => <span className="num">{x.buys}{x.manualBuys ? ` (${x.manualBuys} manual)` : ''}</span> },
    { key: 's', header: 'Estado', cell: (x) => <Badge tone={EXEC_LABEL[x.status].tone}>{EXEC_LABEL[x.status].text}</Badge> }
  ]
  return <DataTable rows={[...rows].reverse()} columns={cols} rowKey={(x) => x.month} empty={<EmptyState title="El plan aún no ha empezado" />} />
}

function PlanForm({ cfg, onClose }: { cfg: InvestmentPlanConfig; onClose: () => void }) {
  const { cat } = useCatalog()
  const [c, setC] = useState<InvestmentPlanConfig>({ ...DEFAULT_PLAN, ...cfg, enabled: true })
  const set = <K extends keyof InvestmentPlanConfig>(k: K, v: InvestmentPlanConfig[K]) => setC((p) => ({ ...p, [k]: v }))
  const save = useApiMutation('settings.update', { success: 'Plan guardado', onSuccess: onClose })
  const accounts = cat?.accounts ?? []
  const blocks = cat?.blocks ?? []
  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title="Plan de inversión"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate([{ investmentPlan: c }])}>Guardar</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Checkbox checked={c.enabled} onChange={(v) => set('enabled', v)} label="Vigilar el plan" />
        <Field label="Inicio del plan"><DateInput value={c.startDate} onChange={(v) => set('startDate', v)} /></Field>
        <Field label="Fin de las aportaciones" hint="Vacío si no tiene fin"><DateInput value={c.endDate ?? ''} onChange={(v) => set('endDate', v || null)} /></Field>
        <Field label="Aportación mensual"><MoneyInput value={c.monthlyCents} onChange={(v) => set('monthlyCents', v ?? 0)} /></Field>
        <Field label="Día de ejecución" hint="Trade Republic solo permite el 2 o el 16">
          <Select value={c.executionDay} onChange={(e) => set('executionDay', Number(e.target.value))}>
            <option value={2}>Día 2</option>
            <option value={16}>Día 16</option>
          </Select>
        </Field>
        <Field label="Bloque núcleo">
          <Select value={c.coreBlockId ?? ''} onChange={(e) => set('coreBlockId', e.target.value || null)}>
            <option value="">—</option>
            {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Bloque de satélites">
          <Select value={c.satelliteBlockId ?? ''} onChange={(e) => set('satelliteBlockId', e.target.value || null)}>
            <option value="">—</option>
            {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Máximo de satélites a la vez">
          <TextInput type="number" min={0} max={20} value={c.maxSatellites} onChange={(e) => set('maxSatellites', Number(e.target.value))} />
        </Field>
        <Field label="Cuenta del bróker">
          <Select value={c.brokerAccountId ?? ''} onChange={(e) => set('brokerAccountId', e.target.value || null)}>
            <option value="">—</option>
            {accounts.filter((a) => a.type === 'INVESTMENT' || a.type === 'CRYPTO').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Cuenta del colchón" hint="La hucha donde está el colchón">
          <Select value={c.cushionAccountId ?? ''} onChange={(e) => set('cushionAccountId', e.target.value || null)}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Colchón mínimo"><MoneyInput value={c.cushionCents} onChange={(v) => set('cushionCents', v ?? 0)} /></Field>
        <Field label="Primera revisión completa"><DateInput value={c.firstReviewDate} onChange={(v) => set('firstReviewDate', v)} /></Field>
        <Field label="Revisar cada (meses)">
          <TextInput type="number" min={1} max={24} value={c.reviewEveryMonths} onChange={(e) => set('reviewEveryMonths', Number(e.target.value))} />
        </Field>
      </div>
    </Modal>
  )
}

function ThesisForm({ cfg, instrumentId, onClose }: { cfg: InvestmentPlanConfig; instrumentId: string; onClose: () => void }) {
  const { maps } = useCatalog()
  const cur = cfg.theses[instrumentId]
  const [text, setText] = useState(cur?.text ?? '')
  const [review, setReview] = useState(cur?.reviewDate ?? '')
  const save = useApiMutation('settings.update', { success: 'Tesis guardada', onSuccess: onClose })
  const name = maps.instrument.get(instrumentId)?.name ?? instrumentId
  const write = (t: string) => {
    const theses = { ...cfg.theses }
    if (t.trim()) theses[instrumentId] = { text: t, reviewDate: review || null }
    else delete theses[instrumentId]
    save.mutate([{ investmentPlan: { ...cfg, theses } }])
  }
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={`Tesis de ${name}`}
      footer={
        <>
          {cur && <Button variant="ghost" className="mr-auto text-neg" onClick={() => write('')}>Borrar tesis</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => write(text)}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Tesis" hint="Qué es y por qué lo hará mejor que el mercado · qué tiene que pasar en 3–5 años · qué te haría vender (que la tesis se rompa, no que baje el precio)">
          <TextArea rows={8} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </Field>
        <Field label="Fecha de revisión"><DateInput value={review} onChange={setReview} /></Field>
      </div>
    </Modal>
  )
}
