import { formatMonth } from '@shared/dates'
import { ACCOUNT_TYPE_LABEL } from '@shared/modules/finanzas/labels'
import { formatEur, formatPct } from '@shared/money'
import { BarList, LinesChart, leyendaSeries, type SerieSpec } from './components/charts'
import { Button, Card, ChartFrame, CifraEur, ErrorState, Importe, KpiCard, LoadingState, PageHeader } from '../../core/ui'
import { useApi } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'

const SERIES: SerieSpec[] = [
  { key: 'nw', name: 'Patrimonio neto' },
  { key: 'liq', name: 'Liquidez' },
  { key: 'sav', name: 'Huchas y ahorro' }
]

export function NetWorthPage() {
  const series = useApi('finanzas:networth.series', [])
  const dash = useApi('finanzas:dashboard.get', [undefined])
  const { maps } = useCatalog()
  const cabecera = (
    <PageHeader
      titulo="Patrimonio y liquidez"
      texto="Tres cifras distintas: patrimonio (todo lo que tienes), liquidez (lo que puedes gastar hoy) y disponible (liquidez menos lo comprometido y reservado)."
    />
  )
  if (series.isLoading || dash.isLoading)
    return (
      <div data-module="finanzas">
        {cabecera}
        <div className="card">
          <LoadingState filas={3} etiqueta="Cargando el patrimonio" />
        </div>
      </div>
    )
  const fallo = series.error ?? dash.error
  if (fallo || !series.data || !dash.data)
    return (
      <div data-module="finanzas">
        {cabecera}
        <ErrorState
          titulo="No se ha podido cargar el patrimonio"
          texto={fallo?.message ?? 'Inténtalo de nuevo.'}
          accion={
            <Button
              size="sm"
              onClick={() => {
                series.refetch()
                dash.refetch()
              }}
            >
              Reintentar
            </Button>
          }
        />
      </div>
    )
  const p = dash.data.position
  const av = dash.data.available
  const pts = series.data
  const byAccount = p.byAccount
    .map((b) => ({ ...b, acc: maps.account.get(b.accountId) }))
    .filter((b) => b.acc && b.acc.includeNetWorth && b.balanceCents !== 0)
    .sort((a, b) => b.balanceCents - a.balanceCents)
  const distribucion = [
    { key: 'liq', label: 'Liquidez', value: p.liquidCents },
    { key: 'sav', label: 'Huchas, ahorro y efectivo reservado', value: p.savingsCents },
    { key: 'inv', label: 'Inversiones', value: p.investmentsCents }
  ].filter((r) => r.value !== 0)
  return (
    <div data-module="finanzas">
      {cabecera}
      <div className="auto-grid-wide">
        <KpiCard titulo="Patrimonio neto" valor={<CifraEur cents={p.netWorthCents} />} contexto={p.liabilitiesCents ? `Deudas ${formatEur(p.liabilitiesCents)}` : 'Sin deudas registradas'} />
        <KpiCard titulo="Liquidez" valor={<CifraEur cents={p.liquidCents} />} contexto={`${formatPct(p.netWorthCents ? p.liquidCents / p.netWorthCents : null)} del patrimonio`} />
        <KpiCard titulo="Disponible para gastar" valor={<CifraEur cents={av.availableCents} />} contexto="Liquidez − cargos pendientes − reservas" />
      </div>
      <div className="mt-6 grid gap-6 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card titulo="Evolución a fin de mes">
          {pts.length ? (
            <ChartFrame
              titulo="Patrimonio, liquidez y ahorro"
              periodo={`${formatMonth(pts[0].month, true)} a ${formatMonth(pts[pts.length - 1].month, true)}`}
              unidad="euros"
              referencia="Fin de cada mes; el mes en curso, a día de hoy. Sin meses futuros."
              leyenda={leyendaSeries(SERIES)}
              tabla={{ columnas: ['Mes', 'Patrimonio neto', 'Liquidez', 'Huchas y ahorro'], filas: pts.map((x) => [formatMonth(x.month, true), formatEur(x.netWorthCents), formatEur(x.liquidCents), formatEur(x.savingsCents)]) }}
            >
              <LinesChart leyenda={false} height={260} data={pts.map((x) => ({ month: x.month, nw: x.netWorthCents, liq: x.liquidCents, sav: x.savingsCents }))} series={SERIES} />
            </ChartFrame>
          ) : (
            <ChartFrame titulo="Patrimonio, liquidez y ahorro" periodo="Sin meses" unidad="euros" estado="vacio" />
          )}
        </Card>
        <Card titulo="Distribución" subtitulo="Reparto del patrimonio hoy">
          <BarList rows={distribucion} />
          <h3 className="t-label mb-2 mt-6 font-semibold text-ink">Por cuenta</h3>
          <BarList rows={byAccount.map((b) => ({ key: b.accountId, label: `${b.acc!.name} · ${ACCOUNT_TYPE_LABEL[b.acc!.type]}`, value: b.balanceCents }))} />
        </Card>
      </div>
      <h2 className="t-section mb-3 mt-10">Mes a mes</h2>
      <div className="card card-flush">
        <div className="overflow-x-auto">
          <table className="table" data-density="normal" aria-label="Patrimonio mes a mes">
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col" className="text-right">
                  Patrimonio neto
                </th>
                <th scope="col" className="text-right">
                  Cambio
                </th>
                <th scope="col" className="text-right">
                  Liquidez
                </th>
                <th scope="col" className="text-right">
                  Huchas y ahorro
                </th>
                <th scope="col" className="text-right">
                  Inversiones
                </th>
                <th scope="col" className="text-right">
                  Deudas
                </th>
              </tr>
            </thead>
            <tbody>
              {[...pts].reverse().map((x) => (
                <tr key={x.month} className="row">
                  <td className="capitalize">{formatMonth(x.month, true)}</td>
                  <td className="tnum text-right font-semibold">{formatEur(x.netWorthCents)}</td>
                  <td className="text-right">{x.changeCents === null ? <span className="text-ink-3">—</span> : <Importe cents={x.changeCents} />}</td>
                  <td className="tnum text-right">{formatEur(x.liquidCents)}</td>
                  <td className="tnum text-right">{formatEur(x.savingsCents)}</td>
                  <td className="tnum text-right">{formatEur(x.investmentsCents)}</td>
                  <td className="tnum text-right text-ink-3">{x.liabilitiesCents ? formatEur(x.liabilitiesCents) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
