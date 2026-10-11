import { Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMonthsToMonth, formatMonth, monthOf, todayISO } from '@shared/dates'
import { BUDGET_STATE_LABEL, type BudgetLine } from '@shared/domain/budgets'
import { formatEur, formatPct } from '@shared/money'
import { Amount, Badge, Button, cx, ErrorBox, Loading, MoneyInput, PageHeader, Progress, Tabs } from '../components/ui'
import { useApi, useApiMutation } from '../lib/api'
import { useCatalog } from '../lib/catalog'
import { MonthPicker } from './Dashboard'

export function BudgetsPage() {
  const [tab, setTab] = useState<'budget' | 'months'>('budget')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Presupuestos y control mensual"
        description="Presupuesto por categoría y mes, y la foto de cada mes: ingresos, gastos por grupo, flujo de caja y ahorro."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'budget', label: 'Presupuesto del mes' },
          { id: 'months', label: 'Control mensual' }
        ]}
      />
      {tab === 'budget' ? <BudgetView /> : <MonthsView />}
    </div>
  )
}

function BudgetView() {
  const current = monthOf(todayISO())
  const [month, setMonth] = useState(current)
  const q = useApi('budgets.report', [month])
  const { cat, maps } = useCatalog()
  const navigate = useNavigate()
  const copy = useApiMutation('budgets.copy', { success: (n) => `${n} presupuesto(s) copiados` })
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const r = q.data!
  const groups = (cat?.groups ?? []).filter((g) => g.kind === 'EXPENSE')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <div className="flex items-center gap-4 text-[13px]">
          <span className="text-muted">
            Presupuestado <span className="num text-ink">{formatEur(r.totalBudgetCents)}</span>
          </span>
          <span className="text-muted">
            Gastado <span className="num text-ink">{formatEur(r.totalSpentCents)}</span>
          </span>
          {r.usedPct !== null && (
            <span className="text-muted">
              Consumido <span className="num text-ink">{formatPct(r.usedPct)}</span>
            </span>
          )}
          <Button
            size="sm"
            icon={<Copy className="size-3.5" />}
            onClick={() => copy.mutate([addMonthsToMonth(month, -1), month, false])}
            title="Copia los presupuestos del mes anterior sin tocar los que ya tengas"
          >
            Copiar de {formatMonth(addMonthsToMonth(month, -1))}
          </Button>
        </div>
      </div>
      {month === current && r.elapsedRatio < 1 && (
        <p className="text-[12px] text-muted">
          Va transcurrido el {formatPct(r.elapsedRatio)} del mes. "Ritmo alto" avisa cuando gastas más deprisa que el reparto lineal del presupuesto.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-ink-2">
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="w-40 px-3 py-2 text-right font-medium">Presupuesto</th>
              <th className="px-3 py-2 text-right font-medium">Gastado</th>
              <th className="px-3 py-2 text-right font-medium">Queda</th>
              <th className="w-44 px-3 py-2 font-medium">Consumido</th>
              <th className="px-3 py-2 text-right font-medium">Mes anterior</th>
              <th className="px-3 py-2 text-right font-medium">Media 3 meses</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const lines = r.lines.filter((l) => maps.category.get(l.categoryId)?.groupId === g.id)
            if (!lines.length) return null
            const spent = lines.reduce((s, l) => s + l.spentCents, 0)
            const budget = lines.reduce((s, l) => s + (l.budgetCents ?? 0), 0)
            return (
              <tbody key={g.id}>
                <tr className="border-b border-line bg-surface-2/60">
                  <td className="px-3 py-1.5 font-semibold">{g.name}</td>
                  <td className="num px-3 py-1.5 text-right text-ink-2">{budget ? formatEur(budget) : ''}</td>
                  <td className="num px-3 py-1.5 text-right text-ink-2">{formatEur(spent)}</td>
                  <td colSpan={5} />
                </tr>
                {lines.map((l) => (
                  <BudgetRow
                    key={l.categoryId}
                    line={l}
                    month={month}
                    name={maps.category.get(l.categoryId)?.name ?? l.categoryId}
                    onOpen={() => navigate(`/movimientos?mes=${month}&categoria=${l.categoryId}`)}
                  />
                ))}
              </tbody>
            )
          })}
        </table>
      </div>
    </div>
  )
}

function BudgetRow({ line: l, month, name, onOpen }: { line: BudgetLine; month: string; name: string; onOpen: () => void }) {
  const [value, setValue] = useState<number | null>(l.budgetCents)
  useEffect(() => setValue(l.budgetCents), [l.budgetCents])
  const set = useApiMutation('budgets.set', { silentError: false })
  const commit = () => {
    if (value === l.budgetCents) return
    set.mutate([{ month, categoryId: l.categoryId, amountCents: value }])
  }
  const tone = l.state === 'OVER' ? 'neg' : l.state === 'ALERT' || l.state === 'FAST' ? 'warn' : 'accent'
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="px-3 py-1.5">{name}</td>
      <td className="px-3 py-1" onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}>
        <MoneyInput value={value} onChange={setValue} placeholder="—" className="ml-auto w-32" />
      </td>
      <td className="px-3 py-1.5 text-right">
        <button className="num hover:underline" onClick={onOpen} disabled={!l.spentCents}>
          {formatEur(l.spentCents)}
        </button>
      </td>
      <td className="px-3 py-1.5 text-right">
        {l.remainingCents === null ? <span className="text-muted">—</span> : <Amount cents={l.remainingCents} colored={false} className={cx(l.remainingCents < 0 && 'text-neg')} sign={false} />}
      </td>
      <td className="px-3 py-1.5">
        {l.usedPct !== null ? (
          <div className="flex items-center gap-2">
            <Progress value={Math.min(l.usedPct, 1)} tone={tone} />
            <span className="num w-12 text-right text-[12px] text-muted">{Number.isFinite(l.usedPct) ? formatPct(l.usedPct) : '—'}</span>
          </div>
        ) : null}
      </td>
      <td className="num px-3 py-1.5 text-right text-muted">{formatEur(l.prevMonthCents)}</td>
      <td className="num px-3 py-1.5 text-right text-muted">{formatEur(l.prevAvgCents)}</td>
      <td className="px-3 py-1.5">
        {l.state !== 'NO_BUDGET' && l.state !== 'OK' ? (
          <Badge tone={l.state === 'OVER' ? 'neg' : 'warn'}>{BUDGET_STATE_LABEL[l.state]}</Badge>
        ) : l.state === 'OK' ? (
          <span className="text-[12px] text-muted">Bien</span>
        ) : null}
      </td>
    </tr>
  )
}

function MonthsView() {
  const q = useApi('monthly.summaries', [12])
  const { cat, groupName } = useCatalog()
  const navigate = useNavigate()
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const months = [...q.data!].reverse()
  const groups = (cat?.groups ?? []).filter((g) => g.kind === 'EXPENSE').map((g) => g.id)
  const hasNone = months.some((m) => m.expensesByGroup['__none'])
  const groupCols = hasNone ? [...groups, '__none'] : groups
  const go = (p: Record<string, string>) => navigate(`/movimientos?${new URLSearchParams(p).toString()}`)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-muted">
        Criterio de caja: cada movimiento cuenta en el mes de su fecha. Las transferencias entre tus cuentas y las compras de inversión no son gasto. Pulsa una
        cifra para ver los movimientos que la forman.
      </p>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-right text-ink-2">
              <th className="sticky left-0 bg-surface-2 px-3 py-2 text-left font-medium">Mes</th>
              <th className="px-3 py-2 font-medium">Ingresos</th>
              {groupCols.map((g) => (
                <th key={g} className="px-3 py-2 font-medium">
                  {groupName(g)}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Total gastos</th>
              <th className="px-3 py-2 font-medium">Flujo neto</th>
              <th className="px-3 py-2 font-medium">A huchas</th>
              <th className="px-3 py-2 font-medium">A inversión</th>
              <th className="px-3 py-2 font-medium">Tasa ahorro</th>
              <th className="px-3 py-2 font-medium" title="Tasa de ahorro sin contar gastos extraordinarios">
                Sin extraord.
              </th>
              <th className="px-3 py-2 font-medium">Fijos</th>
              <th className="px-3 py-2 font-medium">Variables</th>
              <th className="px-3 py-2 font-medium">Extraord.</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-b border-line text-right last:border-0">
                <td className="sticky left-0 bg-surface px-3 py-2 text-left font-medium capitalize">{formatMonth(m.month, true)}</td>
                <Cell v={m.incomeCents} onClick={() => go({ mes: m.month, tipo: 'INCOME' })} />
                {groupCols.map((g) => (
                  <Cell key={g} v={m.expensesByGroup[g] ?? 0} onClick={() => go(g === '__none' ? { mes: m.month, categoria: '__none', gastos: '1' } : { mes: m.month, grupo: g })} />
                ))}
                <Cell v={m.totalExpensesCents} strong onClick={() => go({ mes: m.month, gastos: '1' })} />
                <Cell v={m.netCashFlowCents} strong color />
                <Cell v={m.toSavingsCents} />
                <Cell v={m.toInvestmentsCents} />
                <td className="num px-3 py-2">{formatPct(m.savingsRate)}</td>
                <td className="num px-3 py-2 text-muted">{m.extraordinaryCents ? formatPct(m.savingsRateOrdinary) : ''}</td>
                <Cell v={m.fixedCents} muted onClick={() => go({ mes: m.month, naturaleza: 'FIXED' })} />
                <Cell v={m.variableCents} muted onClick={() => go({ mes: m.month, naturaleza: 'VARIABLE' })} />
                <Cell v={m.extraordinaryCents} muted onClick={() => go({ mes: m.month, naturaleza: 'EXTRAORDINARY' })} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Cell({ v, onClick, strong, color, muted }: { v: number; onClick?: () => void; strong?: boolean; color?: boolean; muted?: boolean }) {
  const content = (
    <span className={cx('num', strong && 'font-semibold', color && v < 0 && 'text-neg', color && v > 0 && 'text-pos', muted && 'text-muted', v === 0 && 'text-muted/60')}>
      {v === 0 ? '—' : formatEur(v)}
    </span>
  )
  return <td className="px-3 py-2">{onClick && v !== 0 ? <button className="hover:underline" onClick={onClick}>{content}</button> : content}</td>
}
