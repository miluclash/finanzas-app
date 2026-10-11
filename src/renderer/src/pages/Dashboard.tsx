import { AlertTriangle, ChevronLeft, ChevronRight, Info, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addMonthsToMonth, formatDate, formatMonth, monthOf, todayISO } from '@shared/dates'
import { GOAL_HEALTH_LABEL } from '@shared/domain/goals'
import { formatEur, formatPct } from '@shared/money'
import { BarList, IncomeExpenseChart, LinesChart } from '../components/charts'
import { useTxEditor } from '../components/TxEditor'
import { Amount, Button, cx, EmptyState, ErrorBox, IconButton, Loading, PageHeader, Progress, Section } from '../components/ui'
import { useApi } from '../lib/api'
import { useCatalog } from '../lib/catalog'

export function MonthPicker({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Mes anterior" onClick={() => onChange(addMonthsToMonth(month, -1))}>
        <ChevronLeft className="size-4" />
      </IconButton>
      <span className="min-w-[124px] text-center text-sm font-medium capitalize">{formatMonth(month, true)}</span>
      <IconButton label="Mes siguiente" disabled={!!max && month >= max} onClick={() => onChange(addMonthsToMonth(month, 1))} className="disabled:opacity-30">
        <ChevronRight className="size-4" />
      </IconButton>
    </div>
  )
}

export function DashboardPage() {
  const current = monthOf(todayISO())
  const [month, setMonth] = useState(current)
  const q = useApi('dashboard.get', [month])
  const nw = useApi('networth.series', [])
  const { cat, categoryName, accountName, maps } = useCatalog()
  const { openEdit, openNew } = useTxEditor()
  const navigate = useNavigate()
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const d = q.data!
  const s = d.summary
  const av = d.available
  const isCurrent = month === current
  const categories = Object.entries(s.expensesByCategory)
    .map(([k, v]) => ({ key: k, label: categoryName(k === '__none' ? null : k), value: -v }))
    .filter((r) => r.value !== 0)
    .sort((a, b) => b.value - a.value)
  const series = d.series.map((m) => ({ month: m.month, income: m.incomeCents, expenses: -m.totalExpensesCents }))
  const rateSeries = d.series.filter((m) => m.savingsRate !== null).map((m) => ({ month: m.month, rate: m.savingsRate, ord: m.savingsRateOrdinary }))
  const go = (params: Record<string, string>) => navigate(`/movimientos?${new URLSearchParams(params).toString()}`)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panel"
        description={isCurrent ? 'Situación de hoy y del mes en curso.' : `Mes de ${formatMonth(month, true)}. Patrimonio y disponible siempre son de hoy.`}
        actions={<MonthPicker month={month} onChange={setMonth} max={current} />}
      />

      {/* Tira principal: disponible vs liquidez vs patrimonio vs inversiones */}
      <section className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] rounded-lg border border-line bg-surface">
        <div className="border-r border-line px-5 py-4">
          <div className="text-[13px] text-ink-2">Disponible para gastar</div>
          <div className={cx('num mt-0.5 text-[34px] font-semibold leading-tight tracking-[-0.02em]', av.availableCents < 0 && 'text-neg')}>
            {formatEur(av.availableCents)}
          </div>
          <dl className="mt-2 flex flex-col gap-0.5 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Liquidez (cuentas que puedes gastar)</dt>
              <dd className="num">{formatEur(av.liquidityCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Cargos recurrentes pendientes este mes</dt>
              <dd className="num">{av.pendingCents ? `−${formatEur(av.pendingCents)}` : formatEur(0)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Reservado para objetivos</dt>
              <dd className="num">{av.reservationsCents ? `−${formatEur(av.reservationsCents)}` : formatEur(0)}</dd>
            </div>
          </dl>
          {av.lines.length > 0 && (
            <details className="mt-1.5 text-[12px] text-muted">
              <summary className="cursor-pointer hover:text-ink">Ver detalle</summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {av.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{l.label}</span>
                    <span className="num">{formatEur(l.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <Figure label="Liquidez" value={d.position.liquidCents} sub="Cuenta corriente y efectivo gastable" to="/cuentas" />
        <Figure label="Patrimonio neto" value={d.position.netWorthCents} sub={`Ahorro e huchas ${formatEur(d.position.savingsCents)}`} to="/patrimonio" />
        <Figure label="Inversiones" value={d.position.investmentsCents} sub="Valor de mercado + efectivo del bróker" to="/inversiones" last />
      </section>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <Section title={`${isCurrent ? 'Este mes' : formatMonth(month, true)}`} boxed>
          <div className="grid grid-cols-4 gap-x-6 gap-y-3">
            <MonthFigure label="Ingresos" value={s.incomeCents} onClick={() => go({ mes: month, tipo: 'INCOME' })} prev={isCurrent ? undefined : d.prevSummary.incomeCents} />
            <MonthFigure
              label="Gastos"
              value={-s.totalExpensesCents}
              onClick={() => go({ mes: month, gastos: '1' })}
              prev={isCurrent ? undefined : -d.prevSummary.totalExpensesCents}
              invert
            />
            <MonthFigure label="Flujo neto" value={s.netCashFlowCents} signed />
            <div>
              <div className="text-[12px] text-muted">Tasa de ahorro</div>
              <div className="num text-[18px] font-semibold">{formatPct(s.savingsRate)}</div>
              {s.extraordinaryCents !== 0 && <div className="text-[12px] text-muted">Sin extraordinarios: {formatPct(s.savingsRateOrdinary)}</div>}
            </div>
            <MonthFigure label="A huchas y ahorro" value={s.toSavingsCents} small />
            <MonthFigure label="A inversión (neto)" value={s.toInvestmentsCents} small />
            <MonthFigure label="Costes recurrentes / mes" value={-d.recurringMonthlyCents} small to="/recurrentes" />
            <div>
              <div className="text-[12px] text-muted">Presupuesto consumido</div>
              {d.budgetTotalCents > 0 ? (
                <>
                  <div className="num text-[15px] font-medium">{formatPct(d.budgetUsedPct)}</div>
                  <Progress value={d.budgetUsedPct} tone={(d.budgetUsedPct ?? 0) > 1 ? 'neg' : (d.budgetUsedPct ?? 0) > 0.8 ? 'warn' : 'accent'} className="mt-1" />
                </>
              ) : (
                <Link to="/presupuestos" className="text-[13px] text-accent hover:underline">
                  Sin presupuesto: créalo
                </Link>
              )}
            </div>
          </div>
          <div className="mt-4">
            {series.length > 0 ? <IncomeExpenseChart data={series} /> : <EmptyState title="Aún no hay meses con movimientos" />}
          </div>
        </Section>

        <div className="flex flex-col gap-6">
          <Section title="Avisos" boxed>
            {d.alerts.length === 0 ? (
              <p className="text-[13px] text-muted">Todo en orden: saldos verificados, sin duplicados ni movimientos por revisar.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.alerts.slice(0, 8).map((a, i) => (
                  <li key={i}>
                    <Link to={a.link ?? '/'} className="flex items-start gap-2 text-[13px] hover:underline">
                      {a.level === 'error' ? (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-neg" />
                      ) : a.level === 'warn' ? (
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                      ) : (
                        <Info className="mt-0.5 size-4 shrink-0 text-muted" />
                      )}
                      <span>{a.text}</span>
                    </Link>
                  </li>
                ))}
                {d.alerts.length > 8 && <li className="text-[12px] text-muted">y {d.alerts.length - 8} más…</li>}
              </ul>
            )}
          </Section>
          <Section title="Próximos 30 días" boxed actions={<Link to="/recurrentes" className="text-[12px] text-accent hover:underline">Recurrentes</Link>}>
            {d.upcoming.length === 0 ? (
              <p className="text-[13px] text-muted">No hay cobros ni cargos previstos.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {d.upcoming.map((u) => (
                  <li key={u.ruleId + u.date} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate">{u.concept}</span>
                      <span className="text-[12px] text-muted">
                        {formatDate(u.date)} · {accountName(u.accountId)}
                      </span>
                    </span>
                    <Amount cents={u.amountCents} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <Section title="Gastos por categoría" description="Netos de reembolsos. Pulsa una para ver sus movimientos." boxed>
          {categories.length ? (
            <BarList rows={categories} onClick={(k) => go({ mes: month, categoria: k })} max={12} />
          ) : (
            <p className="text-[13px] text-muted">Sin gastos este mes.</p>
          )}
        </Section>
        <Section title="Objetivos" boxed actions={<Link to="/objetivos" className="text-[12px] text-accent hover:underline">Ver todos</Link>}>
          {d.goals.length === 0 ? (
            <p className="text-[13px] text-muted">No tienes objetivos activos.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {d.goals.map((g) => (
                <li key={g.goalId}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate">{g.name}</span>
                    <span className="num shrink-0 text-muted">
                      {formatEur(g.progress.currentCents)}
                      {maps.goal.get(g.goalId)?.targetCents ? ` / ${formatEur(maps.goal.get(g.goalId)!.targetCents)}` : ''}
                    </span>
                  </div>
                  <Progress
                    className="mt-1"
                    value={g.progress.progress}
                    tone={g.progress.health === 'FUNDED' ? 'pos' : g.progress.health === 'AT_RISK' || g.progress.health === 'OVERDUE' ? 'warn' : 'accent'}
                  />
                  <div className="mt-0.5 text-[12px] text-muted">{GOAL_HEALTH_LABEL[g.progress.health]}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Section title="Evolución del patrimonio" boxed>
          {nw.data && nw.data.length > 0 ? (
            <LinesChart
              data={nw.data.map((p) => ({ month: p.month, nw: p.netWorthCents, liq: p.liquidCents }))}
              series={[
                { key: 'nw', name: 'Patrimonio neto' },
                { key: 'liq', name: 'Liquidez' }
              ]}
            />
          ) : (
            <Loading />
          )}
        </Section>
        <Section title="Tasa de ahorro" description="Flujo neto entre ingresos de cada mes" boxed>
          {rateSeries.length ? (
            <LinesChart
              pct
              data={rateSeries}
              series={[
                { key: 'rate', name: 'Tasa de ahorro' },
                { key: 'ord', name: 'Sin gastos extraordinarios' }
              ]}
            />
          ) : (
            <p className="text-[13px] text-muted">Necesitas meses con ingresos.</p>
          )}
        </Section>
      </div>

      <Section
        title="Últimos movimientos"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate('/movimientos')}>
              Ver todos
            </Button>
            <Button size="sm" onClick={() => openNew()}>
              Añadir
            </Button>
          </>
        }
      >
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="w-full text-[13px]">
            <tbody>
              {d.recent.map((t) => (
                <tr key={t.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => openEdit(t.id)}>
                  <td className="num w-24 px-3 py-2 text-muted">{formatDate(t.date)}</td>
                  <td className="px-3 py-2">{t.description}</td>
                  <td className="px-3 py-2 text-muted">{t.type === 'TRANSFER' ? 'Transferencia' : categoryName(t.categoryId)}</td>
                  <td className="px-3 py-2 text-muted">{accountName(t.accountId)}</td>
                  <td className="px-3 py-2 text-right">
                    <Amount cents={t.amountCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {cat && <div className="h-2" />}
    </div>
  )
}

function Figure({ label, value, sub, to, last }: { label: string; value: number; sub: string; to: string; last?: boolean }) {
  return (
    <Link to={to} className={cx('flex flex-col justify-center px-5 py-4 hover:bg-surface-2', !last && 'border-r border-line')}>
      <span className="text-[13px] text-ink-2">{label}</span>
      <span className="num text-[22px] font-semibold tracking-[-0.01em]">{formatEur(value)}</span>
      <span className="text-[12px] text-muted">{sub}</span>
    </Link>
  )
}

function MonthFigure({
  label,
  value,
  onClick,
  prev,
  signed,
  invert,
  small,
  to
}: {
  label: string
  value: number
  onClick?: () => void
  prev?: number
  signed?: boolean
  invert?: boolean
  small?: boolean
  to?: string
}) {
  const navigate = useNavigate()
  const delta = prev !== undefined && prev !== 0 ? (value - prev) / Math.abs(prev) : null
  const clickable = onClick ?? (to ? () => navigate(to) : undefined)
  return (
    <button type="button" disabled={!clickable} onClick={clickable} className="text-left enabled:hover:opacity-80">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={cx('num font-semibold', small ? 'text-[15px] font-medium' : 'text-[18px]', signed && value < 0 && 'text-neg', signed && value > 0 && 'text-pos')}>
        {formatEur(value, { sign: signed })}
      </div>
      {delta !== null && Number.isFinite(delta) && (
        <div className={cx('text-[12px]', (invert ? delta > 0 : delta < 0) ? 'text-warn' : 'text-muted')}>
          {delta >= 0 ? '+' : ''}
          {formatPct(delta)} vs mes anterior
        </div>
      )}
    </button>
  )
}
