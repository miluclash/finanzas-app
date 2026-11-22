import { ArrowRight, Barbell, CalendarBlank, ChartLineUp, CheckCircle, Medal, Receipt, Wallet } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { formatMonth, monthOf, todayISO } from '@shared/dates'
import { formatEur, formatPct } from '@shared/money'
import { useApi } from '../../lib/api'
import { Button, Card, CifraEur, Count, EmptyState, ErrorState, KpiCard, LoadingState, ProgressBar, Spark, StatusBadge } from '../ui'

const LARGA = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function saludo(h: number) {
  return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'
}

/** Inicio, el panel de vida: lo de hoy arriba, un resumen de cada módulo y lo complementario al final.
 *  Va con los tokens del núcleo (no se tiñe de ningún módulo) y solo muestra lo que ya calcula el proceso principal. */
export function Inicio() {
  const mes = monthOf(todayISO())
  const dash = useApi('finanzas:dashboard.get', [mes])
  const nw = useApi('finanzas:networth.series', [])
  const rev = useApi('finanzas:tx.reviewQueue', [])
  const ahora = new Date()
  const fecha = LARGA.format(ahora)

  const cabecera = (
    <header className="mb-6">
      <h1 className="t-page">{saludo(ahora.getHours())}</h1>
      <p className="t-label mt-2 first-letter:uppercase">{fecha}</p>
    </header>
  )

  if (dash.isLoading)
    return (
      <div>
        {cabecera}
        <div className="page-grid">
          {[5, 4, 3].map((c) => (
            <div key={c} className={`card col-span-12 ${c === 5 ? '@5xl:col-span-5' : c === 4 ? '@5xl:col-span-4' : '@5xl:col-span-3'}`}>
              <LoadingState filas={2} etiqueta="Cargando el panel de inicio" />
            </div>
          ))}
        </div>
      </div>
    )
  if (dash.error || !dash.data)
    return (
      <div>
        {cabecera}
        <ErrorState titulo="No se han podido cargar tus datos" texto={dash.error?.message ?? 'Inténtalo de nuevo.'} accion={<Button size="sm" onClick={() => dash.refetch()}>Reintentar</Button>} />
      </div>
    )

  const d = dash.data
  const av = d.available
  const s = d.summary
  const q = rev.data
  const nPend = q ? q.pending.length : 0
  const nIssues = q ? q.issues.length : 0
  const nDup = q ? q.duplicates.length : 0
  const porRevisar = nPend + nIssues + nDup
  const puntos = nw.data ?? []
  const actual = puntos.find((p) => p.month === mes)
  const tendencia = puntos.slice(-12)

  return (
    <div>
      {cabecera}

      <div className="page-grid">
        {/* Hoy */}
        <div className="col-span-12 @3xl:col-span-6 @5xl:col-span-5">
          <KpiCard
            protagonista
            titulo="Disponible para gastar"
            icono={<Wallet size={20} weight="duotone" aria-hidden />}
            valor={<CifraEur cents={av.availableCents} />}
            contexto={`De ${formatEur(av.liquidityCents)} de liquidez, menos ${formatEur(av.pendingCents)} de cargos recurrentes pendientes y ${formatEur(av.reservationsCents)} reservados para objetivos`}
            estado={
              av.availableCents < 0 ? (
                <StatusBadge tono="error">El disponible es negativo</StatusBadge>
              ) : av.belowMinimum ? (
                <StatusBadge tono="warning">Por debajo de tu mínimo de liquidez</StatusBadge>
              ) : (
                <StatusBadge tono="success">Por encima del mínimo de liquidez</StatusBadge>
              )
            }
            className="h-full"
          />
        </div>
        <div className="col-span-12 @3xl:col-span-6 @5xl:col-span-4">
          <Card
            titulo="Por revisar"
            icono={<Receipt size={20} weight="duotone" aria-hidden />}
            className="h-full"
            accion={porRevisar > 0 ? <Count tono="warning" label={`${porRevisar} movimientos por revisar`}>{porRevisar}</Count> : undefined}
          >
            {!q ? (
              <LoadingState filas={2} etiqueta="Cargando los movimientos por revisar" />
            ) : porRevisar === 0 ? (
              <>
                <StatusBadge tono="success">Todo al día</StatusBadge>
                <p className="t-label mt-3">No tienes movimientos pendientes, con datos por corregir ni posibles duplicados.</p>
                <Link to="/finanzas/movimientos" className="btn btn-secondary mt-4 w-full">
                  Ir a Movimientos
                </Link>
              </>
            ) : (
              <>
                <div className="t-kpi">
                  {porRevisar}
                  <span className="unit">{porRevisar === 1 ? 'movimiento' : 'movimientos'}</span>
                </div>
                {nPend > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {q.pending.slice(0, 2).map((m) => (
                      <li key={m.id} className="t-label flex items-center justify-between gap-3">
                        <span className="truncate">{m.description}</span>
                        <span className="tnum text-ink">{formatEur(m.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(nIssues > 0 || nDup > 0) && (
                  <p className="t-meta mt-2">
                    {[nIssues > 0 && `${nIssues} con datos por corregir`, nDup > 0 && `${nDup} ${nDup === 1 ? 'posible duplicado' : 'posibles duplicados'}`].filter(Boolean).join(' · ')}
                  </p>
                )}
                <Link to="/finanzas/movimientos?vista=revision" className="btn btn-primary mt-4 w-full">
                  <ArrowRight size={16} weight="bold" aria-hidden />
                  Revisar ahora
                </Link>
              </>
            )}
          </Card>
        </div>
        <div className="col-span-12 @5xl:col-span-3">
          <Card titulo="Próxima sesión" icono={<CalendarBlank size={20} weight="duotone" aria-hidden />} className="h-full">
            <EmptyState horizontal icono={<Barbell size={20} aria-hidden />} titulo="Sin sesión prevista" texto="Importa tus entrenos de Hevy y aquí verás la siguiente. Llega en la próxima fase." />
          </Card>
        </div>

        {/* Resúmenes */}
        <div className="col-span-12 @5xl:col-span-7">
          <Card
            titulo="Finanzas"
            subtitulo={formatMonth(mes, true)}
            icono={<Wallet size={20} weight="duotone" aria-hidden />}
            accion={
              <Link to="/finanzas" className="btn btn-ghost btn-sm">
                Ver más <ArrowRight size={14} aria-hidden />
              </Link>
            }
            className="h-full"
          >
            <div className="auto-grid">
              <div>
                <div className="t-label">Patrimonio neto</div>
                <div className="t-kpi mt-1">
                  <CifraEur cents={d.position.netWorthCents} />
                </div>
                {actual && actual.changeCents !== null && <p className="t-meta mt-1">{formatEur(actual.changeCents, { sign: true })} desde el cierre del mes pasado</p>}
              </div>
              <div>
                <div className="t-label">Gastos del mes</div>
                <div className="t-kpi mt-1">
                  <CifraEur cents={-s.totalExpensesCents} />
                </div>
                {d.budgetTotalCents > 0 && d.budgetUsedPct !== null && (
                  <>
                    <ProgressBar className="mt-2" value={d.budgetUsedPct} tone={d.budgetUsedPct > 0.8 ? 'warning' : 'accent'} label={`Presupuesto de ${formatMonth(mes, true)} consumido`} valueText={`${formatPct(d.budgetUsedPct)} del presupuesto`} />
                    <p className="t-meta mt-1">
                      {formatPct(d.budgetUsedPct)} del presupuesto de {formatMonth(mes, true)} ({formatEur(d.budgetTotalCents)})
                    </p>
                  </>
                )}
              </div>
              <div>
                <div className="t-label">Flujo neto del mes</div>
                <div className="t-kpi mt-1">
                  <CifraEur cents={s.netCashFlowCents} signo />
                </div>
                {s.savingsRate !== null && <p className="t-meta mt-1">Tasa de ahorro: {formatPct(s.savingsRate)} de los ingresos del mes</p>}
              </div>
            </div>
          </Card>
        </div>
        <div className="col-span-12 @5xl:col-span-5">
          <Card
            titulo="Entreno"
            icono={<Barbell size={20} weight="duotone" aria-hidden />}
            accion={
              <Link to="/entreno" className="btn btn-ghost btn-sm">
                Ver más <ArrowRight size={14} aria-hidden />
              </Link>
            }
            className="h-full"
          >
            <EmptyState horizontal icono={<CheckCircle size={20} aria-hidden />} titulo="Importa tus entrenos de Hevy" texto="Aquí verás tus sesiones, tu volumen semanal y el camino a tus objetivos. Llega en la próxima fase." />
          </Card>
        </div>

        {/* Complementario */}
        <div className="col-span-12 @5xl:col-span-7">
          <Card titulo="Tendencia" subtitulo="Patrimonio neto, últimos meses" icono={<ChartLineUp size={20} weight="duotone" aria-hidden />} className="h-full">
            {tendencia.length >= 2 ? (
              <Spark
                datos={tendencia.map((p) => p.netWorthCents / 100)}
                periodo={`${formatMonth(tendencia[0].month, true)} a ${formatMonth(tendencia[tendencia.length - 1].month, true)}`}
                etiquetaInicio={formatMonth(tendencia[0].month, true)}
                etiquetaFin="Hoy"
                formato={(x) => formatEur(Math.round(x * 100))}
                etiquetaX={(i) => formatMonth(tendencia[i].month, true)}
                nombre="Patrimonio neto"
              />
            ) : (
              <EmptyState compacto icono={<ChartLineUp size={20} aria-hidden />} titulo="Aún no hay histórico" texto="Con un par de meses de movimientos verás aquí cómo evoluciona tu patrimonio." />
            )}
          </Card>
        </div>
        <div className="col-span-12 @5xl:col-span-5">
          <Card titulo="Récords recientes" subtitulo="Entreno" icono={<Medal size={20} weight="duotone" aria-hidden />} className="h-full">
            <EmptyState horizontal icono={<Medal size={20} aria-hidden />} titulo="Todavía no hay récords" texto="Tus mejores marcas aparecerán aquí cuando importes tus entrenos." />
          </Card>
        </div>
      </div>
    </div>
  )
}
