import { formatMonth } from '@shared/dates'
import { ACCOUNT_TYPE_LABEL } from '@shared/labels'
import { formatEur, formatPct } from '@shared/money'
import { BarList, LinesChart } from '../components/charts'
import { Amount, ErrorBox, Loading, PageHeader, Section } from '../components/ui'
import { useApi } from '../lib/api'
import { useCatalog } from '../lib/catalog'

export function NetWorthPage() {
  const series = useApi('networth.series', [])
  const dash = useApi('dashboard.get', [undefined])
  const { maps } = useCatalog()
  if (series.isLoading || dash.isLoading) return <Loading />
  if (series.error) return <ErrorBox error={series.error} />
  if (dash.error) return <ErrorBox error={dash.error} />
  const p = dash.data!.position
  const av = dash.data!.available
  const pts = series.data!
  const byAccount = p.byAccount
    .map((b) => ({ ...b, acc: maps.account.get(b.accountId) }))
    .filter((b) => b.acc && b.acc.includeNetWorth && b.balanceCents !== 0)
    .sort((a, b) => b.balanceCents - a.balanceCents)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Patrimonio y liquidez"
        description="Tres cifras distintas: patrimonio (todo lo que tienes), liquidez (lo que puedes gastar hoy) y disponible (liquidez menos lo comprometido y reservado)."
      />
      <section className="grid grid-cols-3 rounded-lg border border-line bg-surface">
        <Big label="Patrimonio neto" value={p.netWorthCents} sub={p.liabilitiesCents ? `Deudas ${formatEur(p.liabilitiesCents)}` : 'Sin deudas registradas'} />
        <Big label="Liquidez" value={p.liquidCents} sub={`${formatPct(p.netWorthCents ? p.liquidCents / p.netWorthCents : null)} del patrimonio`} border />
        <Big label="Disponible para gastar" value={av.availableCents} sub="Liquidez − cargos pendientes − reservas" border />
      </section>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
        <Section title="Evolución a fin de mes" description="El mes en curso, a día de hoy. Sin meses futuros." boxed>
          <LinesChart
            height={260}
            data={pts.map((x) => ({ month: x.month, nw: x.netWorthCents, liq: x.liquidCents, sav: x.savingsCents }))}
            series={[
              { key: 'nw', name: 'Patrimonio neto' },
              { key: 'liq', name: 'Liquidez' },
              { key: 'sav', name: 'Huchas y ahorro' }
            ]}
          />
        </Section>
        <Section title="Distribución" boxed>
          <BarList
            rows={[
              { key: 'liq', label: 'Liquidez', value: p.liquidCents },
              { key: 'sav', label: 'Huchas, ahorro y efectivo reservado', value: p.savingsCents },
              { key: 'inv', label: 'Inversiones', value: p.investmentsCents }
            ].filter((r) => r.value !== 0)}
          />
          <h3 className="mb-2 mt-5 text-[13px] font-medium text-ink-2">Por cuenta</h3>
          <BarList rows={byAccount.map((b) => ({ key: b.accountId, label: `${b.acc!.name} · ${ACCOUNT_TYPE_LABEL[b.acc!.type]}`, value: b.balanceCents }))} />
        </Section>
      </div>
      <Section title="Mes a mes">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-right text-ink-2">
                <th className="px-3 py-2 text-left font-medium">Mes</th>
                <th className="px-3 py-2 font-medium">Patrimonio neto</th>
                <th className="px-3 py-2 font-medium">Cambio</th>
                <th className="px-3 py-2 font-medium">Liquidez</th>
                <th className="px-3 py-2 font-medium">Huchas y ahorro</th>
                <th className="px-3 py-2 font-medium">Inversiones</th>
                <th className="px-3 py-2 font-medium">Deudas</th>
              </tr>
            </thead>
            <tbody>
              {[...pts].reverse().map((x) => (
                <tr key={x.month} className="border-b border-line text-right last:border-0">
                  <td className="px-3 py-2 text-left capitalize">{formatMonth(x.month, true)}</td>
                  <td className="num px-3 py-2 font-medium">{formatEur(x.netWorthCents)}</td>
                  <td className="px-3 py-2">{x.changeCents === null ? '—' : <Amount cents={x.changeCents} />}</td>
                  <td className="num px-3 py-2">{formatEur(x.liquidCents)}</td>
                  <td className="num px-3 py-2">{formatEur(x.savingsCents)}</td>
                  <td className="num px-3 py-2">{formatEur(x.investmentsCents)}</td>
                  <td className="num px-3 py-2 text-muted">{x.liabilitiesCents ? formatEur(x.liabilitiesCents) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

function Big({ label, value, sub, border }: { label: string; value: number; sub: string; border?: boolean }) {
  return (
    <div className={border ? 'border-l border-line px-5 py-4' : 'px-5 py-4'}>
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="num text-[26px] font-semibold tracking-[-0.01em]">{formatEur(value)}</div>
      <div className="text-[12px] text-muted">{sub}</div>
    </div>
  )
}
