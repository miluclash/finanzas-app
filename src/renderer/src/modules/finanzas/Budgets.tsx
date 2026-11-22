import { Copy } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMonthsToMonth, formatMonth, monthOf, todayISO } from '@shared/dates'
import { BUDGET_STATE_LABEL, type BudgetLine } from '@shared/modules/finanzas/budgets'
import { formatEur, formatPct } from '@shared/money'
import { MonthPicker } from './components/MonthPicker'
import { Button, Card, cx, ErrorState, LoadingState, MoneyField, PageHeader, ProgressBar, StatusBadge, Tabs } from '../../core/ui'
import { useApi, useApiMutation } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'

export function BudgetsPage() {
  const [tab, setTab] = useState<'budget' | 'months'>('budget')
  return (
    <div data-module="finanzas">
      <PageHeader titulo="Presupuestos y control mensual" texto="Presupuesto por categoría y mes, y la foto de cada mes: ingresos, gastos por grupo, flujo de caja y ahorro." />
      <Tabs
        label="Vista de presupuestos"
        value={tab}
        onChange={setTab}
        pestanas={[
          { id: 'budget', texto: 'Presupuesto del mes' },
          { id: 'months', texto: 'Control mensual' }
        ]}
      />
      <div className="mt-6">{tab === 'budget' ? <BudgetView /> : <MonthsView />}</div>
    </div>
  )
}

function BudgetView() {
  const current = monthOf(todayISO())
  const [month, setMonth] = useState(current)
  const q = useApi('finanzas:budgets.report', [month])
  const { cat, maps } = useCatalog()
  const navigate = useNavigate()
  const copy = useApiMutation('finanzas:budgets.copy', { success: (n) => `${n} presupuesto(s) copiados` })
  if (q.isLoading) return <LoadingState filas={4} etiqueta="Cargando el presupuesto" />
  if (q.error || !q.data) return <ErrorState titulo="No se ha podido cargar el presupuesto" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
  const r = q.data
  const groups = (cat?.groups ?? []).filter((g) => g.kind === 'EXPENSE')
  const ritmo = month === current && r.elapsedRatio < 1
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <Button size="sm" icon={<Copy size={14} />} onClick={() => copy.mutate([addMonthsToMonth(month, -1), month, false])}>
          Copiar de {formatMonth(addMonthsToMonth(month, -1))}
        </Button>
      </div>
      <Card titulo={`Presupuesto de ${formatMonth(month, true)}`} subtitulo="Copiar no toca los que ya tengas">
        <dl className="auto-grid">
          <div>
            <dt className="t-label">Presupuestado</dt>
            <dd className="tnum t-kpi mt-1">{formatEur(r.totalBudgetCents)}</dd>
          </div>
          <div>
            <dt className="t-label">Gastado</dt>
            <dd className="tnum t-kpi mt-1">{formatEur(r.totalSpentCents)}</dd>
          </div>
          {r.usedPct !== null && (
            <div>
              <dt className="t-label">Consumido</dt>
              <dd className="tnum t-kpi mt-1">{formatPct(r.usedPct)}</dd>
            </div>
          )}
        </dl>
        {r.usedPct !== null && (
          <div className="mt-4">
            <ProgressBar value={r.usedPct} marker={ritmo ? r.elapsedRatio : undefined} tone={r.usedPct > 1 ? 'warning' : 'accent'} label="Presupuesto consumido" valueText={`${formatPct(r.usedPct)} del presupuesto`} />
            {ritmo && (
              <p className="t-meta mt-2">
                La marca indica el {formatPct(r.elapsedRatio)} del mes transcurrido. «Ritmo alto» avisa cuando gastas más deprisa que el reparto lineal del presupuesto.
              </p>
            )}
          </div>
        )}
      </Card>
      <div className="card card-flush">
        <div className="overflow-x-auto">
          <table className="table" data-density="normal" aria-label="Presupuesto por categoría">
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col" className="text-right" style={{ width: '10rem' }}>
                  Presupuesto
                </th>
                <th scope="col" className="text-right">
                  Gastado
                </th>
                <th scope="col" className="text-right">
                  Queda
                </th>
                <th scope="col" style={{ width: '12rem' }}>
                  Consumido
                </th>
                <th scope="col" className="text-right">
                  Referencia
                </th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            {groups.map((g) => {
              const lines = r.lines.filter((l) => maps.category.get(l.categoryId)?.groupId === g.id)
              if (!lines.length) return null
              const spent = lines.reduce((s, l) => s + l.spentCents, 0)
              const budget = lines.reduce((s, l) => s + (l.budgetCents ?? 0), 0)
              return (
                <tbody key={g.id}>
                  <tr className="bg-raised">
                    <th scope="rowgroup" className="t-body !bg-raised text-ink">
                      {g.name}
                    </th>
                    <td className="tnum text-right font-semibold text-ink-2">{budget ? formatEur(budget) : ''}</td>
                    <td className="tnum text-right font-semibold text-ink-2">{formatEur(spent)}</td>
                    <td colSpan={4} />
                  </tr>
                  {lines.map((l) => (
                    <BudgetRow key={l.categoryId} line={l} month={month} name={maps.category.get(l.categoryId)?.name ?? l.categoryId} onOpen={() => navigate(`/finanzas/movimientos?mes=${month}&categoria=${l.categoryId}`)} />
                  ))}
                </tbody>
              )
            })}
          </table>
        </div>
      </div>
    </div>
  )
}

function BudgetRow({ line: l, month, name, onOpen }: { line: BudgetLine; month: string; name: string; onOpen: () => void }) {
  const [value, setValue] = useState<number | null>(l.budgetCents)
  useEffect(() => setValue(l.budgetCents), [l.budgetCents])
  const set = useApiMutation('finanzas:budgets.set', { silentError: false })
  const commit = () => {
    if (value === l.budgetCents) return
    set.mutate([{ month, categoryId: l.categoryId, amountCents: value }])
  }
  const tone = l.state === 'OVER' ? 'warning' : l.state === 'ALERT' || l.state === 'FAST' ? 'warning' : 'accent'
  return (
    <tr className="row">
      <td>{name}</td>
      <td onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}>
        <MoneyField label={`Presupuesto de ${name}`} ocultarEtiqueta tamano="sm" value={value} onChange={setValue} placeholder="—" className="ml-auto w-36" />
      </td>
      <td className="text-right">
        <button type="button" className="tnum hover:underline disabled:no-underline" onClick={onOpen} disabled={!l.spentCents} aria-label={`Gastado en ${name}: ver los movimientos`}>
          {formatEur(l.spentCents)}
        </button>
      </td>
      <td className="tnum text-right">{l.remainingCents === null ? <span className="text-ink-3">—</span> : <span className={cx(l.remainingCents < 0 && 'font-semibold')}>{formatEur(l.remainingCents)}</span>}</td>
      <td>
        {l.usedPct !== null ? (
          <div className="flex items-center gap-2">
            <ProgressBar className="flex-1" value={Math.min(l.usedPct, 1)} tone={tone} label={`Consumido de ${name}`} valueText={Number.isFinite(l.usedPct) ? formatPct(l.usedPct) : undefined} />
            <span className="tnum t-meta w-14 text-right">{Number.isFinite(l.usedPct) ? formatPct(l.usedPct) : '—'}</span>
          </div>
        ) : null}
      </td>
      <td className="tnum t-meta py-2 text-right leading-snug">
        <div>Mes anterior {formatEur(l.prevMonthCents)}</div>
        <div>Media 3 meses {formatEur(l.prevAvgCents)}</div>
      </td>
      <td>
        {l.state !== 'NO_BUDGET' && l.state !== 'OK' ? (
          <StatusBadge tono={l.state === 'OVER' ? 'error' : 'warning'}>{BUDGET_STATE_LABEL[l.state]}</StatusBadge>
        ) : l.state === 'OK' ? (
          <StatusBadge tono="success">Bien</StatusBadge>
        ) : null}
      </td>
    </tr>
  )
}

function MonthsView() {
  const q = useApi('finanzas:monthly.summaries', [12])
  const { cat, groupName } = useCatalog()
  const navigate = useNavigate()
  if (q.isLoading) return <LoadingState filas={4} etiqueta="Cargando el control mensual" />
  if (q.error || !q.data) return <ErrorState titulo="No se ha podido cargar el control mensual" texto={q.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => q.refetch()}>Reintentar</Button>} />
  const months = [...q.data].reverse()
  const groups = (cat?.groups ?? []).filter((g) => g.kind === 'EXPENSE').map((g) => g.id)
  const hasNone = months.some((m) => m.expensesByGroup['__none'])
  const groupCols = hasNone ? [...groups, '__none'] : groups
  const go = (p: Record<string, string>) => navigate(`/finanzas/movimientos?${new URLSearchParams(p).toString()}`)
  return (
    <div className="flex flex-col gap-3">
      <p className="t-label">
        Criterio de caja: cada movimiento cuenta en el mes de su fecha. Las transferencias entre tus cuentas y las compras de inversión no son gasto. Pulsa una cifra para ver los movimientos que la forman.
      </p>
      <div className="card card-flush">
        <div className="overflow-x-auto">
          <table className="table" data-density="compact" aria-label="Control mensual de los últimos 12 meses">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 text-left">
                  Mes
                </th>
                <th scope="col" className="text-right">
                  Ingresos
                </th>
                {groupCols.map((g) => (
                  <th key={g} scope="col" className="text-right">
                    {groupName(g)}
                  </th>
                ))}
                <th scope="col" className="text-right">
                  Total gastos
                </th>
                <th scope="col" className="text-right">
                  Flujo neto
                </th>
                <th scope="col" className="text-right">
                  A huchas
                </th>
                <th scope="col" className="text-right">
                  A inversión
                </th>
                <th scope="col" className="text-right">
                  Tasa ahorro
                </th>
                <th scope="col" className="text-right" title="Tasa de ahorro sin contar gastos extraordinarios">
                  Sin extraord.
                </th>
                <th scope="col" className="text-right">
                  Fijos
                </th>
                <th scope="col" className="text-right">
                  Variables
                </th>
                <th scope="col" className="text-right">
                  Extraord.
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="row text-right">
                  <td className="sticky left-0 z-10 bg-card text-left font-semibold capitalize">{formatMonth(m.month, true)}</td>
                  <Cell v={m.incomeCents} onClick={() => go({ mes: m.month, tipo: 'INCOME' })} />
                  {groupCols.map((g) => (
                    <Cell key={g} v={m.expensesByGroup[g] ?? 0} onClick={() => go(g === '__none' ? { mes: m.month, categoria: '__none', gastos: '1' } : { mes: m.month, grupo: g })} />
                  ))}
                  <Cell v={m.totalExpensesCents} strong onClick={() => go({ mes: m.month, gastos: '1' })} />
                  <Cell v={m.netCashFlowCents} strong color />
                  <Cell v={m.toSavingsCents} />
                  <Cell v={m.toInvestmentsCents} />
                  <td className="tnum">{formatPct(m.savingsRate)}</td>
                  <td className="tnum text-ink-3">{m.extraordinaryCents ? formatPct(m.savingsRateOrdinary) : ''}</td>
                  <Cell v={m.fixedCents} muted onClick={() => go({ mes: m.month, naturaleza: 'FIXED' })} />
                  <Cell v={m.variableCents} muted onClick={() => go({ mes: m.month, naturaleza: 'VARIABLE' })} />
                  <Cell v={m.extraordinaryCents} muted onClick={() => go({ mes: m.month, naturaleza: 'EXTRAORDINARY' })} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Cell({ v, onClick, strong, color, muted }: { v: number; onClick?: () => void; strong?: boolean; color?: boolean; muted?: boolean }) {
  const content = (
    <span className={cx('tnum', strong && 'font-semibold', color && v > 0 && 'text-success', muted && 'text-ink-2', v === 0 && 'text-ink-3')}>{v === 0 ? '—' : formatEur(v)}</span>
  )
  return <td>{onClick && v !== 0 ? <button type="button" className="hover:underline" onClick={onClick}>{content}</button> : content}</td>
}
