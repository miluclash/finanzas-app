import { Check } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { formatMonth } from '@shared/dates'
import { formatEur, parseEurToCents } from '@shared/money'
import type { Scenario } from '@shared/modules/finanzas/types'
import { LinesChart, leyendaSeries } from './components/charts'
import { Button, Card, ChartFrame, CifraEur, ConfirmDialog, cx, ErrorState, Importe, LoadingState, Modal, MoneyField, PageHeader, StatusBadge, Tag, TextField } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'

export function ForecastPage() {
  const q = useApi('finanzas:forecast.run', [12])
  const { cat } = useCatalog()
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null)
  const setSettings = useApiMutation('finanzas:settings.update', { success: 'Escenario principal cambiado' })
  const cabecera = (
    <PageHeader
      titulo="Previsión a 12 meses"
      texto="Estimación de tu caja libre mes a mes a partir de los recurrentes, el gasto variable y los objetivos. No es una certeza: revisa los supuestos."
      acciones={
        <Button variant="primary" onClick={() => setEditing('new')}>
          Nuevo escenario
        </Button>
      }
    />
  )
  if (q.isLoading)
    return (
      <div data-module="finanzas">
        {cabecera}
        <div className="card">
          <LoadingState filas={3} etiqueta="Calculando la previsión" />
        </div>
      </div>
    )
  if (q.error || !q.data)
    return (
      <div data-module="finanzas">
        {cabecera}
        <ErrorState titulo="No se ha podido calcular la previsión" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
      </div>
    )
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
  const serie = results.map((r, j) => ({ key: `s${j}`, name: r.scenario.name }))
  const reference = min > 0 ? { value: min, label: `Mínimo de liquidez ${formatEur(min)}` } : null
  return (
    <div data-module="finanzas">
      {cabecera}
      <div role="group" aria-label="Escenarios" className="auto-grid-wide">
        {results.map((r, i) => {
          const activo = r.scenario.id === sel.scenario.id
          return (
            <button
              key={r.scenario.id}
              type="button"
              aria-pressed={activo}
              onClick={() => setSelected(r.scenario.id)}
              className={cx('card text-left transition-colors', activo ? 'border-ink bg-raised' : 'hover:bg-raised')}
              style={activo ? { boxShadow: 'inset 0 0 0 1px var(--ink)' } : undefined}
            >
              <span className="t-label flex items-center gap-2">
                <span className="inline-block size-3 r-tag" style={{ background: `var(--series-${(i % 4) + 1})` }} aria-hidden />
                <span className="font-semibold text-ink">{r.scenario.name}</span>
                {r.scenario.id === mainId && <Tag tono="accent">Principal</Tag>}
                {activo && <Check size={16} weight="bold" className="ml-auto text-ink" aria-label="Escenario mostrado" />}
              </span>
              <span className="t-kpi mt-3 block">
                <CifraEur cents={r.endCents} />
              </span>
              <span className="t-label mt-2 block">
                en {formatMonth(r.rows[r.rows.length - 1].month)} · mínimo {formatEur(r.minEndCents)}
                {r.minMonth ? ` (${formatMonth(r.minMonth)})` : ''}
              </span>
              {r.riskMonths.length > 0 && (
                <span className="mt-3 block">
                  <StatusBadge tono="error">Baja del mínimo en {r.riskMonths.length} mes(es)</StatusBadge>
                </span>
              )}
            </button>
          )
        })}
      </div>

      <Card titulo="Caja libre prevista" className="mt-6">
        <ChartFrame
          titulo="Caja libre prevista a fin de cada mes"
          periodo={`${formatMonth(months[0], true)} a ${formatMonth(months[months.length - 1], true)}`}
          unidad="euros"
          referencia={min > 0 ? 'Cada línea es un escenario. La línea discontinua es el mínimo de liquidez que quieres mantener.' : 'Cada línea es un escenario.'}
          leyenda={leyendaSeries(serie, reference)}
          tabla={{ columnas: ['Mes', ...results.map((r) => r.scenario.name)], filas: months.map((m, i) => [formatMonth(m, true), ...results.map((r) => formatEur(r.rows[i].endCents))]) }}
        >
          <LinesChart leyenda={false} height={260} data={chartData} series={serie} reference={reference} />
        </ChartFrame>
      </Card>

      <div className="mt-6 flex flex-col gap-6">
        <section aria-label={`Detalle de ${sel.scenario.name}`} className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="t-section">Detalle · {sel.scenario.name}</h2>
            <div className="flex flex-wrap gap-2">
              {sel.scenario.id !== mainId && (
                <Button size="sm" onClick={() => setSettings.mutate([{ forecastScenarioId: sel.scenario.id }])}>
                  Usar como principal
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing(sel.scenario)}>
                Editar supuestos
              </Button>
            </div>
          </div>
          <div className="card card-flush">
            <div className="overflow-x-auto">
              <table className="table" data-density="normal" aria-label={`Previsión mes a mes: ${sel.scenario.name}`}>
                <thead>
                  <tr>
                    <th scope="col">Mes</th>
                    <th scope="col" className="text-right">
                      Inicio
                    </th>
                    <th scope="col" className="text-right">
                      Ingresos
                    </th>
                    <th scope="col" className="text-right">
                      Fijos
                    </th>
                    <th scope="col" className="text-right">
                      Variables
                    </th>
                    <th scope="col" className="text-right">
                      A huchas / inversión
                    </th>
                    <th scope="col" className="text-right">
                      Objetivos
                    </th>
                    <th scope="col" className="text-right">
                      Final
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sel.rows.map((r, i) => (
                    <tr key={r.month} className={cx('row', r.belowMinimum && 'bg-error-soft')}>
                      <td className="whitespace-nowrap">
                        <span className="capitalize">{formatMonth(r.month)}</span>
                        {i === 0 && <span className="t-meta whitespace-nowrap"> (resto)</span>}
                        {r.belowMinimum && (
                          <span className="ml-2 inline-block">
                            <Tag tono="warning">Bajo el mínimo</Tag>
                          </span>
                        )}
                      </td>
                      <td className="tnum text-right text-ink-2">{formatEur(r.startCents)}</td>
                      <td className="text-right">{r.incomeCents ? <Importe cents={r.incomeCents} /> : <span className="text-ink-3">—</span>}</td>
                      <td className="text-right">{r.fixedCents ? <Importe cents={r.fixedCents} /> : <span className="text-ink-3">—</span>}</td>
                      <td className="text-right">{r.variableCents ? <Importe cents={r.variableCents} /> : <span className="text-ink-3">—</span>}</td>
                      <td className="text-right">{r.transfersCents ? <Importe cents={r.transfersCents} /> : <span className="text-ink-3">—</span>}</td>
                      <td className="text-right">{r.goalsCents ? <Importe cents={r.goalsCents} /> : <span className="text-ink-3">—</span>}</td>
                      <td className={cx('tnum text-right font-semibold', r.endCents < 0 && 'text-error')}>{formatEur(r.endCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <Card titulo="Supuestos usados">
          <ul className="t-label flex list-disc flex-col gap-2 pl-4">
            {sel.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
            <li>Mínimo de liquidez: {formatEur(min)} (cámbialo en Ajustes).</li>
          </ul>
        </Card>
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
  const [borrar, setBorrar] = useState(false)
  const nombreRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('finanzas:scenarios.save', { success: 'Escenario guardado', onSuccess: onClose })
  const del = useApiMutation('finanzas:scenarios.delete', { success: 'Escenario borrado', onSuccess: onClose })
  const pctOk = (s: string) => parseEurToCents(s) !== null
  return (
    <div data-module="finanzas" className="contents">
      <Modal
        titulo={scenario ? `Supuestos · ${scenario.name}` : 'Nuevo escenario'}
        inicial={nombreRef}
        onCerrar={onClose}
        pie={
          <>
            {scenario && canDelete && (
              <Button variant="danger" className="mr-auto" onClick={() => setBorrar(true)}>
                Borrar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              disabled={!pctOk(inc) || !pctOk(exp)}
              cargando={save.isPending}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField ref={nombreRef} className="sm:col-span-2" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Prudente" />
          <TextField
            label="Ingresos (% de lo previsto)"
            unidad="%"
            inputMode="decimal"
            ayuda="100 = igual que los recurrentes; 95 = un 5 % menos."
            error={pctOk(inc) ? undefined : 'Escribe un número, por ejemplo 95.'}
            value={inc}
            onChange={(e) => setInc(e.target.value)}
            className="[&_input]:tabular-nums [&_input]:text-right"
          />
          <TextField
            label="Gastos (% de lo previsto)"
            unidad="%"
            inputMode="decimal"
            ayuda="110 = un 10 % más de gasto."
            error={pctOk(exp) ? undefined : 'Escribe un número, por ejemplo 110.'}
            value={exp}
            onChange={(e) => setExp(e.target.value)}
            className="[&_input]:tabular-nums [&_input]:text-right"
          />
          <MoneyField className="sm:col-span-2" label="Gasto variable al mes" ayuda="Comida, ocio, compras… lo que no es recurrente." value={variable} onChange={setVariable} />
          <div className="sm:col-span-2">
            <StatusBadge tono="info" className="items-start">
              Las aportaciones a inversión y huchas se configuran como transferencias en Recurrentes, y las de objetivos en cada objetivo.
            </StatusBadge>
          </div>
        </div>
      </Modal>
      {borrar && scenario && (
        <ConfirmDialog titulo="¿Borrar el escenario?" texto={`Se borra «${scenario.name}» y sus supuestos.`} confirmar="Borrar escenario" onCancelar={() => setBorrar(false)} onConfirmar={() => (setBorrar(false), del.mutate([scenario.id]))} />
      )}
    </div>
  )
}
