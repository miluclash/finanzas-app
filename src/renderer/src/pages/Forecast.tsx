import { useState } from 'react'
import { formatMonth } from '@shared/dates'
import { formatEur, parseEurToCents } from '@shared/money'
import type { Scenario } from '@shared/types'
import { LinesChart } from '../components/charts'
import { Amount, Badge, Button, confirmDialog, cx, ErrorBox, Field, Loading, Modal, MoneyInput, Notice, PageHeader, Section, TextInput } from '../components/ui'
import { useApi, useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'

export function ForecastPage() {
  const q = useApi('forecast.run', [12])
  const { cat } = useCatalog()
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null)
  const setSettings = useApiMutation('settings.update', { success: 'Escenario principal cambiado' })
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const results = q.data!
  const mainId = cat?.settings.forecastScenarioId
  const sel = results.find((r) => r.scenario.id === (selected ?? mainId)) ?? results[0]
  const min = cat?.settings.minLiquidityCents ?? 0
  const months = sel.rows.map((r) => r.month)
  const chartData = months.map((m, i) => {
    const row: Record<string, string | number> = { month: m }
    results.forEach((r, j) => (row[`s${j}`] = r.rows[i].endCents))
    return row
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Previsión a 12 meses"
        description="Estimación de tu caja libre mes a mes a partir de los recurrentes, el gasto variable y los objetivos. No es una certeza: revisa los supuestos."
        actions={<Button onClick={() => setEditing('new')}>Nuevo escenario</Button>}
      />
      <section className="grid rounded-lg border border-line bg-surface" style={{ gridTemplateColumns: `repeat(${results.length}, minmax(0,1fr))` }}>
        {results.map((r, i) => (
          <button
            key={r.scenario.id}
            onClick={() => setSelected(r.scenario.id)}
            className={cx('px-5 py-4 text-left hover:bg-surface-2', i > 0 && 'border-l border-line', r.scenario.id === sel.scenario.id && 'bg-accent-soft hover:bg-accent-soft')}
          >
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: `var(--series-${(i % 3) + 1})` }} />
              {r.scenario.name}
              {r.scenario.id === mainId && <Badge tone="accent">principal</Badge>}
            </div>
            <div className="num mt-1 text-[22px] font-semibold">{formatEur(r.endCents)}</div>
            <div className="text-[12px] text-muted">
              en {formatMonth(r.rows[r.rows.length - 1].month)} · mínimo {formatEur(r.minEndCents)}
              {r.minMonth ? ` (${formatMonth(r.minMonth)})` : ''}
            </div>
            {r.riskMonths.length > 0 && <div className="mt-1 text-[12px] text-neg">Baja del mínimo en {r.riskMonths.length} mes(es)</div>}
          </button>
        ))}
      </section>

      <Section title="Caja libre prevista a fin de cada mes" boxed>
        <LinesChart
          height={260}
          data={chartData}
          series={results.map((r, j) => ({ key: `s${j}`, name: r.scenario.name }))}
          reference={min > 0 ? { value: min, label: `Mínimo de liquidez ${formatEur(min)}` } : null}
        />
      </Section>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <Section
          title={`Detalle · ${sel.scenario.name}`}
          actions={
            <>
              {sel.scenario.id !== mainId && (
                <Button size="sm" onClick={() => setSettings.mutate([{ forecastScenarioId: sel.scenario.id }])}>
                  Usar como principal
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing(sel.scenario)}>
                Editar supuestos
              </Button>
            </>
          }
        >
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-right text-ink-2">
                  <th className="px-3 py-2 text-left font-medium">Mes</th>
                  <th className="px-3 py-2 font-medium">Inicio</th>
                  <th className="px-3 py-2 font-medium">Ingresos</th>
                  <th className="px-3 py-2 font-medium">Fijos</th>
                  <th className="px-3 py-2 font-medium">Variables</th>
                  <th className="px-3 py-2 font-medium">A huchas / inversión</th>
                  <th className="px-3 py-2 font-medium">Objetivos</th>
                  <th className="px-3 py-2 font-medium">Final</th>
                </tr>
              </thead>
              <tbody>
                {sel.rows.map((r, i) => (
                  <tr key={r.month} className={cx('border-b border-line text-right last:border-0', r.belowMinimum && 'bg-neg-soft')}>
                    <td className="px-3 py-2 text-left capitalize">
                      {formatMonth(r.month)}
                      {i === 0 && <span className="text-[12px] text-muted"> (resto)</span>}
                    </td>
                    <td className="num px-3 py-2 text-muted">{formatEur(r.startCents)}</td>
                    <td className="px-3 py-2">{r.incomeCents ? <Amount cents={r.incomeCents} /> : '—'}</td>
                    <td className="px-3 py-2">{r.fixedCents ? <Amount cents={r.fixedCents} /> : '—'}</td>
                    <td className="px-3 py-2">{r.variableCents ? <Amount cents={r.variableCents} /> : '—'}</td>
                    <td className="px-3 py-2">{r.transfersCents ? <Amount cents={r.transfersCents} /> : '—'}</td>
                    <td className="px-3 py-2">{r.goalsCents ? <Amount cents={r.goalsCents} /> : '—'}</td>
                    <td className={cx('num px-3 py-2 font-semibold', r.endCents < 0 && 'text-neg')}>{formatEur(r.endCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Supuestos usados" boxed>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] text-ink-2">
            {sel.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
            <li>Mínimo de liquidez: {formatEur(min)} (cámbialo en Ajustes).</li>
          </ul>
        </Section>
      </div>
      {editing && <ScenarioForm scenario={editing === 'new' ? null : editing} onClose={() => setEditing(null)} canDelete={results.length > 1} />}
    </div>
  )
}

function ScenarioForm({ scenario, onClose, canDelete }: { scenario: Scenario | null; onClose: () => void; canDelete: boolean }) {
  const [name, setName] = useState(scenario?.name ?? '')
  const [inc, setInc] = useState(String(Math.round(Number(scenario?.incomeFactor ?? '1') * 100)))
  const [exp, setExp] = useState(String(Math.round(Number(scenario?.expenseFactor ?? '1') * 100)))
  const [variable, setVariable] = useState<number | null>(scenario?.variableMonthlyCents ?? 20000)
  const save = useApiMutation('scenarios.save', { success: 'Escenario guardado', onSuccess: onClose })
  const del = useApiMutation('scenarios.delete', { success: 'Escenario borrado', onSuccess: onClose })
  const pctOk = (s: string) => parseEurToCents(s) !== null
  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={scenario ? `Supuestos · ${scenario.name}` : 'Nuevo escenario'}
      footer={
        <>
          {scenario && canDelete && (
            <Button
              variant="ghost"
              className="mr-auto text-neg"
              onClick={async () => {
                if (await confirmDialog({ title: 'Borrar escenario', confirm: 'Borrar', danger: true })) del.mutate([scenario.id])
              }}
            >
              Borrar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!pctOk(inc) || !pctOk(exp)}
            loading={save.isPending}
            onClick={() =>
              save.mutate([
                {
                  id: scenario?.id ?? null,
                  name,
                  incomeFactor: String(Number(inc.replace(',', '.')) / 100),
                  expenseFactor: String(Number(exp.replace(',', '.')) / 100),
                  variableMonthlyCents: variable ?? 0,
                  sortOrder: scenario?.sortOrder ?? 9
                }
              ])
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" required className="col-span-2">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Ingresos (% de lo previsto)" hint="100 = igual que los recurrentes; 95 = un 5 % menos">
          <TextInput inputMode="decimal" value={inc} onChange={(e) => setInc(e.target.value)} className="num text-right" />
        </Field>
        <Field label="Gastos (% de lo previsto)" hint="110 = un 10 % más de gasto">
          <TextInput inputMode="decimal" value={exp} onChange={(e) => setExp(e.target.value)} className="num text-right" />
        </Field>
        <Field label="Gasto variable al mes" hint="Comida, ocio, compras… lo que no es recurrente" className="col-span-2">
          <MoneyInput value={variable} onChange={setVariable} />
        </Field>
        <div className="col-span-2">
          <Notice tone="info">Las aportaciones a inversión y huchas se configuran como transferencias en Recurrentes, y las de objetivos en cada objetivo.</Notice>
        </div>
      </div>
    </Modal>
  )
}
