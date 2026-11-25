import { ArrowDown, ArrowRight, ArrowUp, Barbell, CalendarBlank, ChartLineUp, CheckCircle, Medal, Receipt, Wallet } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { formatMonth, monthOf, todayISO } from '@shared/dates'
import { formatEur, formatPct } from '@shared/money'
import { useApi } from '../../lib/api'
import { Button, Card, CifraEur, CifraUnidad, Count, EmptyState, ErrorState, KpiCard, LoadingState, ProgressBar, Spark, StatusBadge, Tag } from '../ui'
import type { EntrenoInicio } from '@shared/modules/entreno/metrics/views'
import { textoComparacionVolumen, sinVolumenPrevio, anteriorRecord, cuando, fechaCorta, formatCambio, formatEntero, KIND_LABEL, marcaRecord } from '../../modules/entreno/format'
import { KIND_ICON } from '../../modules/entreno/Piezas'
import { weekLabelNumber } from '@shared/modules/entreno/metrics/weeks'
import { formatDate } from '@shared/dates'

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
  const ent = useApi('entreno:metrics.inicio', [])
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
          <ProximaSesion q={ent} />
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
            subtitulo={ent.data ? `Semana ${weekLabelNumber(ent.data.week.weekStart)}` : undefined}
            icono={<Barbell size={20} weight="duotone" aria-hidden />}
            accion={
              <Link to="/entreno" className="btn btn-ghost btn-sm">
                Ver más <ArrowRight size={14} aria-hidden />
              </Link>
            }
            className="h-full"
          >
            <ResumenEntreno q={ent} />
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
            <RecordsInicio q={ent} />
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ======================= Entreno en el Inicio (datos de metrics.inicio) ======================= */
type ConsultaEntreno = { data?: EntrenoInicio; isLoading: boolean; error: Error | null; refetch: () => unknown }

function EstadoConsulta({ q, etiqueta }: { q: ConsultaEntreno; etiqueta: string }) {
  if (q.isLoading) return <LoadingState filas={2} etiqueta={etiqueta} />
  return (
    <div>
      <p className="t-label">No se han podido calcular tus datos de entreno{q.error ? `: ${q.error.message}` : '.'}</p>
      <Button size="sm" className="mt-3" onClick={() => q.refetch()}>
        Reintentar
      </Button>
    </div>
  )
}

function ProximaSesion({ q }: { q: ConsultaEntreno }) {
  const d = q.data
  const n = d?.next
  const I = n?.kind ? KIND_ICON[n.kind] : Barbell
  return (
    <Card titulo="Próxima sesión" icono={<CalendarBlank size={20} weight="duotone" aria-hidden />} className="h-full">
      {!d ? (
        <EstadoConsulta q={q} etiqueta="Calculando tu próxima sesión" />
      ) : n ? (
        <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:justify-between @5xl:flex-col @5xl:items-stretch @5xl:justify-start">
          <div>
            <div className="t-kpi">{n.routineName || 'Sesión'}</div>
            <p className="t-label mt-2">{cuando(n.date, d.today, n.time)}</p>
            <p className="t-meta mt-1 flex items-center gap-1">
              <I size={14} aria-hidden /> {n.kind ? KIND_LABEL[n.kind] : 'Tipo de entreno borrado'}
            </p>
          </div>
          <Link to="/entreno/plan" className="btn btn-secondary">
            Ver la semana
          </Link>
        </div>
      ) : (
        <EmptyState horizontal icono={<Barbell size={20} aria-hidden />} titulo="Sin sesión prevista" texto="Crea tu semana base en Plan y aquí verás la siguiente sesión." accion={<Link to="/entreno/plan?vista=boceto" className="btn btn-secondary btn-sm">Ir a Plan</Link>} />
      )}
    </Card>
  )
}

function ResumenEntreno({ q }: { q: ConsultaEntreno }) {
  const d = q.data
  if (!d) return <EstadoConsulta q={q} etiqueta="Calculando tu resumen de entreno" />
  const { week, volume, nextEvent } = d
  const vacio = week.planned === 0 && week.sessions === 0 && volume.loadKg === 0 && d.records.length === 0
  if (vacio)
    return (
      <EmptyState
        horizontal
        icono={<CheckCircle size={20} aria-hidden />}
        titulo="Importa tus entrenos de Hevy"
        texto="Aquí verás tus sesiones de la semana, tu volumen y la cuenta atrás de tu próximo evento."
        accion={<Link to="/entreno" className="btn btn-secondary btn-sm">Ir a Entreno</Link>}
      />
    )
  const ch = volume.changePct
  return (
    <>
      <div className="auto-grid">
        <div>
          <div className="t-label">Sesiones</div>
          <div className="t-kpi mt-1">
            <CifraUnidad valor={week.planned > 0 ? `${week.done} de ${week.planned}` : String(week.sessions)} unidad="esta semana" />
          </div>
          {week.planned === 0 && <p className="t-meta mt-1">Sin plan: crea tu semana base en Plan.</p>}
        </div>
        <div>
          <div className="t-label">Volumen semanal</div>
          <div className="t-kpi mt-1">
            <CifraUnidad valor={formatEntero(volume.loadKg)} unidad="kg" />
          </div>
          <p className="t-meta mt-1">
            {ch !== null ? (
              <>
                {ch >= 0 ? <ArrowUp size={12} weight="bold" aria-hidden className="mr-1 inline" /> : <ArrowDown size={12} weight="bold" aria-hidden className="mr-1 inline" />}
                {formatCambio(ch)} {textoComparacionVolumen(volume.comparison, volume.previousLoadKg, volume.previousToDate)}
              </>
            ) : (
              sinVolumenPrevio(volume.comparison).replace(/^./, (c) => c.toUpperCase())
            )}
          </p>
        </div>
      </div>
      {nextEvent && !nextEvent.isPast && (
        <p className="t-label mt-4 border-t border-line pt-3">
          {nextEvent.name}, {formatDate(nextEvent.date)}: <b className="font-semibold text-ink">{nextEvent.daysLeft === 0 ? 'es hoy' : `${nextEvent.daysLeft} ${nextEvent.daysLeft === 1 ? 'día' : 'días'}`}</b>
        </p>
      )}
    </>
  )
}

function RecordsInicio({ q }: { q: ConsultaEntreno }) {
  const d = q.data
  if (!d) return <EstadoConsulta q={q} etiqueta="Calculando tus récords" />
  if (d.records.length === 0) return <EmptyState horizontal icono={<Medal size={20} aria-hidden />} titulo="Todavía no hay récords" texto="Tus mejores marcas aparecerán aquí cuando superes una marca anterior. Hacen falta al menos dos sesiones del mismo ejercicio." />
  return (
    <ul className="auto-grid">
      {d.records.map((r) => (
        <li key={`${r.workoutId}-${r.exerciseId}-${r.type}-${r.weightKg}`}>
          <div className="t-label">{r.exerciseTitle}</div>
          <div className="t-body tnum mt-1 font-semibold">{marcaRecord(r.type, r.value, r.weightKg)}</div>
          <Tag className="mt-2">
            {anteriorRecord(r.type, r.previous)} · {fechaCorta(r.date)}
          </Tag>
        </li>
      ))}
    </ul>
  )
}
