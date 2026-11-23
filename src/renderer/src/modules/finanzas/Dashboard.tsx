import { ArrowDown, ArrowRight, ArrowUp, CalendarBlank, ChartBar, ChartLineUp, ChartPieSlice, Clock, ListBullets, Pulse, Receipt, Target, Wallet, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDate, formatMonth, monthOf, todayISO } from '@shared/dates'
import { GOAL_HEALTH_LABEL } from '@shared/modules/finanzas/goals'
import { formatEur, formatPct } from '@shared/money'
import { BarList, IncomeExpenseChart, LEYENDA_INGRESOS_GASTOS, LinesChart, leyendaSeries, SERIE_CONTEXTO, type SerieSpec } from './components/charts'
import { MonthPicker } from './components/MonthPicker'
import { useTxEditor } from './components/TxEditor'
import {
  Accordion,
  BarraSegmentada,
  Button,
  Card,
  ChartFrame,
  CifraEur,
  cx,
  EmptyState,
  ErrorState,
  FilaDato,
  Importe,
  KpiCard,
  LoadingState,
  PageHeader,
  ProgressBar,
  Spark,
  StatusBadge,
  type AccItem
} from '../../core/ui'
import { rutaFinanzas } from '../../core/shell/nav'
import { useApi } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'

/** Texto del botón de acción de cada aviso, según adónde lleva */
function accionAviso(link: string | undefined): string {
  const base = (link ?? '/').split('?')[0]
  if (link?.includes('vista=revision')) return 'Revisar movimientos'
  return (
    {
      '/cuentas': 'Ver cuentas',
      '/presupuestos': 'Ver presupuestos',
      '/objetivos': 'Ver objetivos',
      '/prevision': 'Ver la previsión',
      '/recurrentes': 'Ver recurrentes',
      '/inversiones': 'Ver inversiones',
      '/': 'Ver el cálculo'
    } as Record<string, string>
  )[base] ?? 'Ver más'
}

export function DashboardPage() {
  const current = monthOf(todayISO())
  const [month, setMonth] = useState(current)
  const q = useApi('finanzas:dashboard.get', [month])
  const nw = useApi('finanzas:networth.series', [])
  const { cat, categoryName, accountName, maps } = useCatalog()
  const { openEdit, openNew } = useTxEditor()
  const navigate = useNavigate()
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const [todosAvisos, setTodosAvisos] = useState(false)
  const alternar = (id: string) =>
    setAbiertas((s) => {
      const nuevo = new Set(s)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })

  const cabecera = (
    <PageHeader
      titulo="Panel"
      texto={month === current ? 'Situación de hoy y del mes en curso.' : `Mes de ${formatMonth(month, true)}. Patrimonio y disponible siempre son de hoy.`}
      acciones={<MonthPicker month={month} onChange={setMonth} max={current} />}
    />
  )
  if (q.isLoading)
    return (
      <div data-module="finanzas">
        {cabecera}
        <div className="page-grid">
          <div className="card col-span-12 @4xl:col-span-8">
            <LoadingState filas={3} etiqueta="Cargando el panel" />
          </div>
          <div className="card col-span-12 @4xl:col-span-4">
            <LoadingState filas={3} etiqueta="Cargando el patrimonio" />
          </div>
        </div>
      </div>
    )
  if (q.error || !q.data)
    return (
      <div data-module="finanzas">
        {cabecera}
        <ErrorState titulo="No se ha podido cargar el panel" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
      </div>
    )

  const d = q.data
  const s = d.summary
  const av = d.available
  const isCurrent = month === current
  const minimo = cat?.settings.minLiquidityCents ?? 0
  const categories = Object.entries(s.expensesByCategory)
    .map(([k, v]) => ({ key: k, label: categoryName(k === '__none' ? null : k), value: -v }))
    .filter((r) => r.value !== 0)
    .sort((a, b) => b.value - a.value)
  const series = d.series.map((m) => ({ month: m.month, income: m.incomeCents, expenses: -m.totalExpensesCents }))
  const rateSeries = d.series.filter((m) => m.savingsRate !== null).map((m) => ({ month: m.month, rate: m.savingsRate, ord: m.savingsRateOrdinary }))
  const go = (params: Record<string, string>) => navigate(`/finanzas/movimientos?${new URLSearchParams(params).toString()}`)
  const puntos = nw.data ?? []
  const tendencia = puntos.slice(-12)
  const serieNw: SerieSpec[] = [
    { key: 'nw', name: 'Patrimonio neto' },
    { key: 'liq', name: 'Liquidez', color: SERIE_CONTEXTO, patron: 'punteada' }
  ]
  const serieTasa: SerieSpec[] = [
    { key: 'rate', name: 'Tasa de ahorro' },
    { key: 'ord', name: 'Sin gastos extraordinarios', color: SERIE_CONTEXTO, patron: 'punteada' }
  ]
  const nombreMes = formatMonth(month, true)
  const avisos = todosAvisos ? d.alerts : d.alerts.slice(0, 3)
  const irADisponible = () => {
    const el = document.getElementById('disponible')
    el?.scrollIntoView({ block: 'start' })
    el?.focus()
  }

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
          <BarList rows={categories} onClick={(k) => go({ mes: month, categoria: k })} max={12} />
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
    <div data-module="finanzas">
      {cabecera}

      <div className="page-grid">
        {/* Fila 1: Disponible (protagonista) y Patrimonio (secundario) */}
        <div id="disponible" tabIndex={-1} className="col-span-12 outline-none @4xl:col-span-8">
          <KpiCard
            protagonista
            titulo="Disponible para gastar"
            icono={<Wallet size={20} weight="duotone" aria-hidden />}
            valor={<CifraEur cents={av.availableCents} />}
            estado={
              av.availableCents < 0 ? (
                <StatusBadge tono="error">El disponible es negativo</StatusBadge>
              ) : av.belowMinimum ? (
                <StatusBadge tono="warning">Por debajo de tu mínimo de liquidez{minimo > 0 ? ` (${formatEur(minimo)})` : ''}</StatusBadge>
              ) : (
                <StatusBadge tono="success">Por encima de tu mínimo de liquidez{minimo > 0 ? ` (${formatEur(minimo)})` : ''}</StatusBadge>
              )
            }
            className="h-full"
          >
            <dl className="mt-6 flex flex-col gap-2 border-t border-line pt-4" aria-label="Cómo se calcula el disponible">
              <FilaDato etiqueta="Liquidez (cuentas que puedes gastar)" valor={formatEur(av.liquidityCents)} />
              <FilaDato etiqueta="Menos cargos recurrentes pendientes este mes" valor={av.pendingCents ? `−${formatEur(av.pendingCents)}` : formatEur(0)} />
              <FilaDato etiqueta="Menos reservado para objetivos" valor={av.reservationsCents ? `−${formatEur(av.reservationsCents)}` : formatEur(0)} />
              <FilaDato className="border-t border-line pt-2" etiqueta="Igual a disponible para gastar" valor={formatEur(av.availableCents)} fuerte />
            </dl>
            {av.liquidityCents > 0 && (
              <div className="mt-4">
                <BarraSegmentada
                  etiqueta="Reparto de la liquidez"
                  partes={[
                    { nombre: 'Disponible', valor: Math.max(av.availableCents, 0), color: 'var(--accent-mark)' },
                    { nombre: 'Cargos recurrentes pendientes', valor: av.pendingCents, color: 'var(--seq-3)' },
                    { nombre: 'Reservado para objetivos', valor: av.reservationsCents, color: 'var(--muted-mark)' }
                  ]}
                />
                <ul className="t-meta mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Leyenda del reparto">
                  {[
                    ['Disponible', 'var(--accent-mark)'],
                    ['Cargos recurrentes pendientes', 'var(--seq-3)'],
                    ['Reservado para objetivos', 'var(--muted-mark)']
                  ].map(([t, c]) => (
                    <li key={t} className="flex items-center gap-2">
                      <span className="size-3 r-tag" style={{ background: c }} aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {av.lines.length > 0 && (
              <details className="mt-4 border-t border-line pt-3">
                <summary className="t-label cursor-pointer font-semibold text-ink hover:underline">Ver el detalle de lo que se resta</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {av.lines.map((l, i) => (
                    <li key={i} className="t-label flex justify-between gap-4">
                      <span>{l.label}</span>
                      <span className="tnum text-ink">{formatEur(l.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </KpiCard>
        </div>

        <Card
          titulo="Patrimonio neto"
          icono={<ChartLineUp size={20} weight="duotone" aria-hidden />}
          accion={
            <Link to="/finanzas/patrimonio" className="btn btn-ghost btn-sm">
              Ver <ArrowRight size={14} aria-hidden />
            </Link>
          }
          className="col-span-12 flex flex-col @4xl:col-span-4"
        >
          <div className="t-kpi">
            <CifraEur cents={d.position.netWorthCents} />
          </div>
          {tendencia.length >= 2 && (
            <div className="mt-4">
              <Spark
                datos={tendencia.map((p) => p.netWorthCents / 100)}
                periodo={`${formatMonth(tendencia[0].month, true)} a ${formatMonth(tendencia[tendencia.length - 1].month, true)}`}
                etiquetaInicio={formatMonth(tendencia[0].month, true)}
                etiquetaFin="Hoy"
                formato={(x) => formatEur(Math.round(x * 100))}
                etiquetaX={(i) => formatMonth(tendencia[i].month, true)}
                nombre="Patrimonio neto"
                alto="var(--chart-h)"
              />
            </div>
          )}
          <dl className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
            <FilaDato etiqueta="Liquidez" valor={<Link to="/finanzas/cuentas" className="hover:underline">{formatEur(d.position.liquidCents)}</Link>} />
            <FilaDato etiqueta="Ahorro e huchas" valor={formatEur(d.position.savingsCents)} />
            <FilaDato etiqueta="Inversiones" valor={<Link to="/finanzas/inversiones" className="hover:underline">{formatEur(d.position.investmentsCents)}</Link>} />
          </dl>
        </Card>

        {/* Fila 2: ingresos, gastos y ahorro; avisos */}
        <Card titulo={isCurrent ? 'Este mes' : nombreMes} subtitulo={isCurrent ? nombreMes : undefined} icono={<CalendarBlank size={20} weight="duotone" aria-hidden />} className="col-span-12 @4xl:col-span-8">
          <div className="auto-grid">
            <MesCifra etiqueta="Ingresos" valor={<CifraEur cents={s.incomeCents} />} value={s.incomeCents} onClick={() => go({ mes: month, tipo: 'INCOME' })} prev={isCurrent ? undefined : d.prevSummary.incomeCents} />
            <MesCifra etiqueta="Gastos" valor={<CifraEur cents={-s.totalExpensesCents} />} value={-s.totalExpensesCents} onClick={() => go({ mes: month, gastos: '1' })} prev={isCurrent ? undefined : -d.prevSummary.totalExpensesCents} invert>
              {d.budgetTotalCents > 0 ? (
                <div className="mt-3">
                  <ProgressBar value={d.budgetUsedPct ?? 0} tone={(d.budgetUsedPct ?? 0) > 0.8 ? 'warning' : 'accent'} label={`Presupuesto de ${nombreMes} consumido`} valueText={`${formatPct(d.budgetUsedPct)} del presupuesto`} />
                  <p className="t-meta mt-2">
                    {formatPct(d.budgetUsedPct)} del presupuesto de {nombreMes} ({formatEur(d.budgetTotalCents)})
                  </p>
                  {(d.budgetUsedPct ?? 0) > 1 && (
                    <div className="mt-2">
                      <StatusBadge tono="warning">Presupuesto superado</StatusBadge>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/finanzas/presupuestos" className="t-meta mt-3 inline-block text-accent-text underline-offset-2 hover:underline">
                  Sin presupuesto: créalo
                </Link>
              )}
            </MesCifra>
            <MesCifra etiqueta="Flujo neto" valor={<CifraEur cents={s.netCashFlowCents} signo />} value={s.netCashFlowCents}>
              <p className="t-meta mt-2">Tasa de ahorro: {formatPct(s.savingsRate)} de los ingresos del mes</p>
              {s.extraordinaryCents !== 0 && <p className="t-meta mt-1">Sin extraordinarios: {formatPct(s.savingsRateOrdinary)}</p>}
            </MesCifra>
          </div>
        </Card>

        <Card titulo="Avisos" icono={<Warning size={20} weight="duotone" aria-hidden />} className="col-span-12 flex flex-col @4xl:col-span-4">
          {d.alerts.length === 0 ? (
            <div>
              <StatusBadge tono="success">Todo en orden</StatusBadge>
              <p className="t-label mt-3">Saldos verificados, sin duplicados ni movimientos por revisar.</p>
            </div>
          ) : (
            <ul className="divide-line flex flex-1 flex-col">
              {avisos.map((a, i) => (
                <li key={i} className="flex flex-col items-start gap-2 py-3 first:pt-0 last:pb-0">
                  <StatusBadge tono={a.level === 'error' ? 'error' : a.level === 'warn' ? 'warning' : 'info'} className="items-start">
                    {a.text}
                  </StatusBadge>
                  {(a.link ?? '/') === '/' ? (
                    <Button size="sm" variant="secondary" onClick={irADisponible}>
                      {accionAviso(a.link)}
                    </Button>
                  ) : (
                    <Link to={rutaFinanzas(a.link ?? '/')} className="btn btn-secondary btn-sm">
                      {accionAviso(a.link)}
                    </Link>
                  )}
                </li>
              ))}
              {d.alerts.length > 3 && (
                <li className="pt-3">
                  <Button size="sm" variant="ghost" aria-expanded={todosAvisos} onClick={() => setTodosAvisos((v) => !v)}>
                    {todosAvisos ? 'Ver menos avisos' : `Ver los ${d.alerts.length - 3} avisos restantes`}
                  </Button>
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      {/* Más detalle: se abre bajo demanda */}
      <section className="mt-10" aria-labelledby="mas-detalle">
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
    </div>
  )
}

/** Cifra del mes: etiqueta, valor y, al mirar un mes pasado, su variación frente al anterior. Pulsarla lleva a los movimientos que la forman */
function MesCifra({
  etiqueta,
  valor,
  value,
  onClick,
  prev,
  invert,
  children
}: {
  etiqueta: string
  valor: React.ReactNode
  value: number
  onClick?: () => void
  prev?: number
  invert?: boolean
  children?: React.ReactNode
}) {
  const delta = prev !== undefined && prev !== 0 ? (value - prev) / Math.abs(prev) : null
  return (
    <div>
      {onClick ? (
        <button type="button" onClick={onClick} className="group block w-full text-left" aria-label={`${etiqueta}: ver los movimientos`}>
          <div className="t-label flex items-center gap-1 group-hover:text-ink">
            {etiqueta}
            <ArrowRight size={14} aria-hidden className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </div>
          <div className={'t-kpi mt-1'}>{valor}</div>
        </button>
      ) : (
        <>
          <div className="t-label">{etiqueta}</div>
          <div className={'t-kpi mt-1'}>{valor}</div>
        </>
      )}
      {delta !== null && Number.isFinite(delta) && (
        <p className="t-meta mt-2 flex items-center gap-1">
          {delta >= 0 ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
          <span className={cx((invert ? delta > 0 : delta < 0) && 'text-ink-2')}>
            {delta >= 0 ? '+' : ''}
            {formatPct(delta)} vs mes anterior
          </span>
        </p>
      )}
      {children}
    </div>
  )
}
