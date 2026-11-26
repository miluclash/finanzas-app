// Tarjeta «Más detalle» del Panel de Finanzas: un acordeón con el detalle que se abre bajo demanda.
import { ArrowRight, ChartBar, ChartLineUp, ChartPieSlice, Clock, ListBullets, Pulse, Receipt, Target } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDate, formatMonth } from '@shared/dates'
import { GOAL_HEALTH_LABEL } from '@shared/modules/finanzas/goals'
import { formatEur, formatPct } from '@shared/money'
import { Accordion, Button, ChartFrame, EmptyState, Importe, LoadingState, ProgressBar, StatusBadge, TarjetaConsulta, type AccItem } from '../../core/ui'
import { useApi } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'
import { BarList, IncomeExpenseChart, LEYENDA_INGRESOS_GASTOS, LinesChart, leyendaSeries, SERIE_CONTEXTO, type SerieSpec } from './components/charts'
import { useTxEditor } from './components/TxEditor'
import { useMesPanel } from './mesPanel'

export function MasDetalleCard() {
  const mes = useMesPanel()
  const q = useApi('finanzas:dashboard.get', [mes])
  const nw = useApi('finanzas:networth.series', [])
  const { categoryName, accountName, maps } = useCatalog()
  const { openEdit, openNew } = useTxEditor()
  const navigate = useNavigate()
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const alternar = (id: string) =>
    setAbiertas((s) => {
      const nuevo = new Set(s)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })

  return (
    <TarjetaConsulta q={q} titulo="Más detalle" icono={<ListBullets size={20} weight="duotone" aria-hidden />} carga="Cargando el detalle" error="No se ha podido cargar el detalle" filas={3}>
      {(d) => {
        const s = d.summary
        const categories = Object.entries(s.expensesByCategory)
          .map(([k, v]) => ({ key: k, label: categoryName(k === '__none' ? null : k), value: -v }))
          .filter((r) => r.value !== 0)
          .sort((a, b) => b.value - a.value)
        const series = d.series.map((m) => ({ month: m.month, income: m.incomeCents, expenses: -m.totalExpensesCents }))
        const rateSeries = d.series.filter((m) => m.savingsRate !== null).map((m) => ({ month: m.month, rate: m.savingsRate, ord: m.savingsRateOrdinary }))
        const go = (params: Record<string, string>) => navigate(`/finanzas/movimientos?${new URLSearchParams(params).toString()}`)
        const serieNw: SerieSpec[] = [
          { key: 'nw', name: 'Patrimonio neto' },
          { key: 'liq', name: 'Liquidez', color: SERIE_CONTEXTO, patron: 'punteada' }
        ]
        const serieTasa: SerieSpec[] = [
          { key: 'rate', name: 'Tasa de ahorro' },
          { key: 'ord', name: 'Sin gastos extraordinarios', color: SERIE_CONTEXTO, patron: 'punteada' }
        ]
        const nombreMes = formatMonth(mes, true)

        const items: AccItem[] = [
          {
            id: 'proximos',
            titulo: 'Próximos 30 días',
            icono: <Clock size={20} weight="duotone" aria-hidden />,
            resumen: d.upcoming.length === 0 ? 'Sin cobros ni cargos previstos' : `${d.upcoming.length} cobros o cargos previstos`,
            contenido:
              d.upcoming.length === 0 ? (
                <p className="t-label">No hay cobros ni cargos previstos.</p>
              ) : (
                <div>
                  <ul className="divide-line">
                    {d.upcoming.map((u) => (
                      <li key={u.ruleId + u.date} className="flex items-center gap-4 py-3">
                        <span className="tnum w-24 shrink-0 text-ink-3">{formatDate(u.date)}</span>
                        <span className="t-body min-w-0 flex-1 truncate">{u.concept}</span>
                        <span className="t-meta hidden shrink-0 @3xl:inline">{accountName(u.accountId)}</span>
                        <Importe cents={u.amountCents} className="w-28 shrink-0 text-right" />
                      </li>
                    ))}
                  </ul>
                  <Link to="/finanzas/recurrentes" className="btn btn-secondary btn-sm mt-3">
                    Ver recurrentes <ArrowRight size={14} aria-hidden />
                  </Link>
                </div>
              )
          },
          {
            id: 'categorias',
            titulo: 'Gastos por categoría',
            icono: <ChartPieSlice size={20} weight="duotone" aria-hidden />,
            resumen: categories.length ? `${categories.length} categorías · la mayor, ${categories[0].label}` : 'Sin gastos este mes',
            contenido: categories.length ? (
              <ChartFrame titulo="Gastos por categoría" periodo={nombreMes} unidad="euros, netos de reembolsos" referencia="Pulsa una categoría para ver sus movimientos.">
                <BarList rows={categories} onClick={(k) => go({ mes, categoria: k })} max={12} />
              </ChartFrame>
            ) : (
              <p className="t-label">Sin gastos este mes.</p>
            )
          },
          {
            id: 'objetivos',
            titulo: 'Objetivos',
            icono: <Target size={20} weight="duotone" aria-hidden />,
            resumen: d.goals.length === 0 ? 'Sin objetivos activos' : `${d.goals.length} activos · ${d.goals.filter((g) => g.progress.health === 'AT_RISK' || g.progress.health === 'OVERDUE').length} con retraso`,
            contenido:
              d.goals.length === 0 ? (
                <p className="t-label">No tienes objetivos activos.</p>
              ) : (
                <div>
                  <ul className="auto-grid-wide">
                    {d.goals.map((g) => {
                      const meta = maps.goal.get(g.goalId)?.targetCents
                      const retraso = g.progress.health === 'AT_RISK' || g.progress.health === 'OVERDUE'
                      return (
                        <li key={g.goalId}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="t-body truncate font-semibold" title={g.name}>{g.name}</span>
                            <span className="t-meta tnum shrink-0">
                              {formatEur(g.progress.currentCents)}
                              {meta ? ` / ${formatEur(meta)}` : ''}
                            </span>
                          </div>
                          <ProgressBar className="mt-2" value={g.progress.progress ?? 0} tone={g.progress.health === 'FUNDED' ? 'success' : retraso ? 'warning' : 'accent'} label={`Progreso de ${g.name}`} />
                          <div className="mt-2">
                            <StatusBadge tono={g.progress.health === 'FUNDED' ? 'success' : retraso ? 'warning' : 'info'}>{GOAL_HEALTH_LABEL[g.progress.health]}</StatusBadge>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <Link to="/finanzas/objetivos" className="btn btn-secondary btn-sm mt-4">
                    Ver todos los objetivos <ArrowRight size={14} aria-hidden />
                  </Link>
                </div>
              )
          },
          {
            id: 'patrimonio',
            titulo: 'Evolución del patrimonio',
            icono: <ChartLineUp size={20} weight="duotone" aria-hidden />,
            resumen: `Hoy ${formatEur(d.position.netWorthCents)}`,
            contenido:
              nw.data && nw.data.length > 0 ? (
                <ChartFrame
                  titulo="Patrimonio neto y liquidez"
                  periodo={`${formatMonth(nw.data[0].month, true)} a ${formatMonth(nw.data[nw.data.length - 1].month, true)}`}
                  unidad="euros"
                  referencia="Fin de cada mes; el último punto es el de hoy."
                  leyenda={leyendaSeries(serieNw)}
                  tabla={{ columnas: ['Mes', 'Patrimonio neto', 'Liquidez'], filas: nw.data.map((p) => [formatMonth(p.month, true), formatEur(p.netWorthCents), formatEur(p.liquidCents)]) }}
                >
                  <LinesChart leyenda={false} data={nw.data.map((p) => ({ month: p.month, nw: p.netWorthCents, liq: p.liquidCents }))} series={serieNw} />
                </ChartFrame>
              ) : (
                <LoadingState filas={2} etiqueta="Cargando la evolución del patrimonio" />
              )
          },
          {
            id: 'tasa',
            titulo: 'Tasa de ahorro',
            icono: <Pulse size={20} weight="duotone" aria-hidden />,
            resumen: `Este mes ${formatPct(s.savingsRate)}`,
            contenido: rateSeries.length ? (
              <ChartFrame
                titulo="Tasa de ahorro"
                periodo={`${formatMonth(rateSeries[0].month, true)} a ${formatMonth(rateSeries[rateSeries.length - 1].month, true)}`}
                unidad="% sobre los ingresos de cada mes"
                referencia="Flujo neto entre los ingresos del mismo mes. La línea punteada deja fuera los gastos extraordinarios."
                leyenda={leyendaSeries(serieTasa)}
                tabla={{ columnas: ['Mes', 'Tasa de ahorro', 'Sin extraordinarios'], filas: rateSeries.map((r) => [formatMonth(r.month, true), formatPct(r.rate), formatPct(r.ord)]) }}
              >
                <LinesChart leyenda={false} pct data={rateSeries} series={serieTasa} />
              </ChartFrame>
            ) : (
              <p className="t-label">Necesitas meses con ingresos.</p>
            )
          },
          {
            id: 'meses',
            titulo: 'Ingresos y gastos por mes',
            icono: <ChartBar size={20} weight="duotone" aria-hidden />,
            resumen: series.length ? `Últimos ${series.length} meses` : 'Aún sin meses',
            contenido: (
              <div className="flex flex-col gap-6">
                <dl className="auto-grid" aria-label={`Más cifras de ${nombreMes}`}>
                  <div>
                    <dt className="t-meta">A huchas y ahorro</dt>
                    <dd className="tnum t-body mt-1 font-semibold">{formatEur(s.toSavingsCents)}</dd>
                  </div>
                  <div>
                    <dt className="t-meta">A inversión (neto)</dt>
                    <dd className="tnum t-body mt-1 font-semibold">{formatEur(s.toInvestmentsCents)}</dd>
                  </div>
                  <div>
                    <dt className="t-meta">Costes recurrentes al mes</dt>
                    <dd className="tnum t-body mt-1 font-semibold">
                      <Link to="/finanzas/recurrentes" className="hover:underline">
                        {formatEur(-d.recurringMonthlyCents)}
                      </Link>
                    </dd>
                  </div>
                </dl>
                {series.length > 0 ? (
                  <ChartFrame
                    titulo="Ingresos y gastos"
                    periodo={`${formatMonth(series[0].month, true)} a ${formatMonth(series[series.length - 1].month, true)}`}
                    unidad="euros"
                    referencia="Las barras arrancan en cero. Los gastos son netos de reembolsos."
                    leyenda={LEYENDA_INGRESOS_GASTOS}
                    tabla={{ columnas: ['Mes', 'Ingresos', 'Gastos'], filas: series.map((m) => [formatMonth(m.month, true), formatEur(m.income), formatEur(m.expenses)]) }}
                  >
                    <IncomeExpenseChart data={series} />
                  </ChartFrame>
                ) : (
                  <EmptyState compacto icono={<ChartBar size={20} aria-hidden />} titulo="Aún no hay meses con movimientos" texto="Cuando registres movimientos verás aquí su evolución." />
                )}
              </div>
            )
          },
          {
            id: 'ultimos',
            titulo: 'Últimos movimientos',
            icono: <Receipt size={20} weight="duotone" aria-hidden />,
            resumen: d.recent.length ? `${d.recent[0].description}, ${formatEur(d.recent[0].amountCents)}` : 'Sin movimientos',
            contenido: (
              <div>
                {d.recent.length === 0 ? (
                  <p className="t-label">Todavía no hay movimientos.</p>
                ) : (
                  <ul className="divide-line">
                    {d.recent.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => openEdit(t.id)} className="flex w-full items-center gap-4 py-3 text-left hover:bg-raised" aria-label={`Editar ${t.description}, ${formatEur(t.amountCents, { sign: true })}`}>
                          <span className="tnum w-24 shrink-0 text-ink-3">{formatDate(t.date)}</span>
                          <span className="t-body min-w-0 flex-1 truncate">{t.description}</span>
                          <span className="t-meta hidden shrink-0 @3xl:inline">{t.type === 'TRANSFER' ? 'Transferencia' : categoryName(t.categoryId)}</span>
                          <span className="t-meta hidden shrink-0 @3xl:inline">{accountName(t.accountId)}</span>
                          <Importe cents={t.amountCents} className="w-28 shrink-0 text-right" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => navigate('/finanzas/movimientos')} icon={<ArrowRight size={14} />}>
                    Ver todos los movimientos
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openNew()}>
                    Añadir
                  </Button>
                </div>
              </div>
            )
          }
        ]

        return (
          <section className="pt-4" aria-labelledby="mas-detalle">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 id="mas-detalle" className="t-section flex items-center gap-2">
                <ListBullets size={20} weight="duotone" aria-hidden /> Más detalle
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setAbiertas(abiertas.size ? new Set() : new Set(items.map((x) => x.id)))}>
                {abiertas.size ? 'Plegar todo' : 'Desplegar todo'}
              </Button>
            </div>
            <div className="card card-flush">
              <Accordion items={items} abiertas={abiertas} onToggle={alternar} />
            </div>
          </section>
        )
      }}
    </TarjetaConsulta>
  )
}
