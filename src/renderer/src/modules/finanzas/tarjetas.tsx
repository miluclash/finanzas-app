// Tarjetas de Finanzas para los paneles editables (Panel de Finanzas e Inicio). Cada una pide sus datos y
// pinta sus propios estados de carga, error y vacío. No calculan nada: enseñan lo que devuelve el proceso principal.
import { ArrowDown, ArrowRight, ArrowUp, CalendarBlank, ChartLineUp, Receipt, Wallet, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatMonth, monthOf, todayISO } from '@shared/dates'
import { formatEur, formatPct } from '@shared/money'
import { rutaFinanzas } from '../../core/shell/nav'
import {
  BarraSegmentada,
  Button,
  Card,
  CifraEur,
  Count,
  cx,
  EmptyState,
  FilaDato,
  KpiCard,
  LoadingState,
  ProgressBar,
  Spark,
  StatusBadge,
  TarjetaConsulta
} from '../../core/ui'
import type { FixedCardDef, FixedCardProps } from '../../core/graficos'
import { useApi } from '../../lib/api'
import { useCatalog } from '../../lib/catalog'
import { MasDetalleCard } from './MasDetalleCard'
import { useMesPanel } from './mesPanel'

/** Datos del panel del mes elegido (o del mes en curso fuera del Panel) */
function useDashboard() {
  const mes = useMesPanel()
  return { mes, q: useApi('finanzas:dashboard.get', [mes]) }
}

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

/* ======================= Disponible para gastar ======================= */
/** Ancha o completa: el cálculo entero con su reparto. Pequeña o mediana: la cifra con una frase de contexto. */
function DisponibleCard({ size }: FixedCardProps) {
  const { q } = useDashboard()
  const { cat } = useCatalog()
  return (
    <TarjetaConsulta q={q} titulo="Disponible para gastar" icono={<Wallet size={20} weight="duotone" aria-hidden />} carga="Cargando el disponible" error="No se ha podido cargar el disponible" filas={3}>
      {(d) => {
        const av = d.available
        const detallada = size === 'l' || size === 'full'
        const minimo = cat?.settings.minLiquidityCents ?? 0
        if (!detallada)
          return (
            <div id="disponible" tabIndex={-1} className="h-full outline-none">
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
          )
        return (
          <div id="disponible" tabIndex={-1} className="h-full outline-none">
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
        )
      }}
    </TarjetaConsulta>
  )
}

/* ======================= Patrimonio neto ======================= */
function PatrimonioCard() {
  const { q } = useDashboard()
  const nw = useApi('finanzas:networth.series', [])
  return (
    <TarjetaConsulta q={q} titulo="Patrimonio neto" icono={<ChartLineUp size={20} weight="duotone" aria-hidden />} carga="Cargando el patrimonio" error="No se ha podido cargar el patrimonio" filas={3}>
      {(d) => {
        const tendencia = (nw.data ?? []).slice(-12)
        return (
          <Card
            titulo="Patrimonio neto"
            icono={<ChartLineUp size={20} weight="duotone" aria-hidden />}
            accion={
              <Link to="/finanzas/patrimonio" className="btn btn-ghost btn-sm">
                Ver <ArrowRight size={14} aria-hidden />
              </Link>
            }
            className="flex h-full flex-col"
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
        )
      }}
    </TarjetaConsulta>
  )
}

/* ======================= Este mes ======================= */
function MesCard() {
  const { mes, q } = useDashboard()
  const navigate = useNavigate()
  const current = monthOf(todayISO())
  return (
    <TarjetaConsulta q={q} titulo="Este mes" icono={<CalendarBlank size={20} weight="duotone" aria-hidden />} carga="Cargando el mes" error="No se ha podido cargar el mes" filas={3}>
      {(d) => {
        const s = d.summary
        const isCurrent = mes === current
        const nombreMes = formatMonth(mes, true)
        const go = (params: Record<string, string>) => navigate(`/finanzas/movimientos?${new URLSearchParams(params).toString()}`)
        return (
          <Card titulo={isCurrent ? 'Este mes' : nombreMes} subtitulo={isCurrent ? nombreMes : undefined} icono={<CalendarBlank size={20} weight="duotone" aria-hidden />} className="h-full">
            <div className="auto-grid">
              <MesCifra etiqueta="Ingresos" valor={<CifraEur cents={s.incomeCents} />} value={s.incomeCents} onClick={() => go({ mes, tipo: 'INCOME' })} prev={isCurrent ? undefined : d.prevSummary.incomeCents} />
              <MesCifra etiqueta="Gastos" valor={<CifraEur cents={-s.totalExpensesCents} />} value={-s.totalExpensesCents} onClick={() => go({ mes, gastos: '1' })} prev={isCurrent ? undefined : -d.prevSummary.totalExpensesCents} invert>
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
        )
      }}
    </TarjetaConsulta>
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

/* ======================= Avisos ======================= */
function AvisosCard() {
  const { q } = useDashboard()
  const navigate = useNavigate()
  const [todos, setTodos] = useState(false)
  // «Ver el cálculo» lleva al Disponible de esta pantalla; si no está en ella, al Panel de Finanzas
  const irADisponible = () => {
    const el = document.getElementById('disponible')
    if (!el) return navigate('/finanzas')
    el.scrollIntoView({ block: 'start' })
    el.focus()
  }
  return (
    <TarjetaConsulta q={q} titulo="Avisos" icono={<Warning size={20} weight="duotone" aria-hidden />} carga="Cargando los avisos" error="No se han podido cargar los avisos" filas={2}>
      {(d) => {
        const avisos = todos ? d.alerts : d.alerts.slice(0, 3)
        return (
          <Card titulo="Avisos" icono={<Warning size={20} weight="duotone" aria-hidden />} className="flex h-full flex-col">
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
                    <Button size="sm" variant="ghost" aria-expanded={todos} onClick={() => setTodos((v) => !v)}>
                      {todos ? 'Ver menos avisos' : `Ver los ${d.alerts.length - 3} avisos restantes`}
                    </Button>
                  </li>
                )}
              </ul>
            )}
          </Card>
        )
      }}
    </TarjetaConsulta>
  )
}

/* ======================= Por revisar (Inicio) ======================= */
function PorRevisarCard() {
  const rev = useApi('finanzas:tx.reviewQueue', [])
  return (
    <TarjetaConsulta q={rev} titulo="Por revisar" icono={<Receipt size={20} weight="duotone" aria-hidden />} carga="Cargando los movimientos por revisar" error="No se han podido cargar los movimientos por revisar" filas={2}>
      {(q) => {
        const nPend = q.pending.length
        const nIssues = q.issues.length
        const nDup = q.duplicates.length
        const porRevisar = nPend + nIssues + nDup
        return (
          <Card
            titulo="Por revisar"
            icono={<Receipt size={20} weight="duotone" aria-hidden />}
            className="h-full"
            accion={porRevisar > 0 ? <Count tono="warning" label={`${porRevisar} movimientos por revisar`}>{porRevisar}</Count> : undefined}
          >
            {porRevisar === 0 ? (
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
        )
      }}
    </TarjetaConsulta>
  )
}

/* ======================= Resumen de Finanzas (Inicio) ======================= */
function ResumenCard() {
  const { mes, q } = useDashboard()
  const nw = useApi('finanzas:networth.series', [])
  return (
    <TarjetaConsulta q={q} titulo="Finanzas" icono={<Wallet size={20} weight="duotone" aria-hidden />} carga="Cargando el resumen de Finanzas" error="No se ha podido cargar el resumen de Finanzas" filas={2}>
      {(d) => {
        const s = d.summary
        const actual = (nw.data ?? []).find((p) => p.month === mes)
        return (
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
        )
      }}
    </TarjetaConsulta>
  )
}

/* ======================= Tendencia del patrimonio (Inicio) ======================= */
function TendenciaCard() {
  const nw = useApi('finanzas:networth.series', [])
  if (nw.isLoading)
    return (
      <Card titulo="Tendencia" subtitulo="Patrimonio neto, últimos meses" icono={<ChartLineUp size={20} weight="duotone" aria-hidden />} className="h-full">
        <LoadingState filas={2} etiqueta="Cargando la tendencia" />
      </Card>
    )
  const tendencia = (nw.data ?? []).slice(-12)
  return (
    <Card titulo="Tendencia" subtitulo="Patrimonio neto, últimos meses" icono={<ChartLineUp size={20} weight="duotone" aria-hidden />} className="h-full">
      {nw.error ? (
        <EmptyState compacto icono={<ChartLineUp size={20} aria-hidden />} titulo="No se ha podido cargar la tendencia" texto={nw.error.message} accion={<Button size="sm" onClick={() => nw.refetch()}>Reintentar</Button>} />
      ) : tendencia.length >= 2 ? (
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
  )
}

/* ======================= Registro ======================= */
export const tarjetasFinanzas: FixedCardDef[] = [
  { id: 'finanzas.disponible', module: 'finanzas', title: 'Disponible para gastar', sizes: ['s', 'm', 'l', 'full'], defaultSize: 'l', panels: ['finanzas', 'inicio'], Component: DisponibleCard },
  { id: 'finanzas.patrimonio', module: 'finanzas', title: 'Patrimonio neto', sizes: ['s', 'm', 'l'], defaultSize: 's', panels: ['finanzas', 'inicio'], Component: PatrimonioCard },
  { id: 'finanzas.mes', module: 'finanzas', title: 'Este mes', sizes: ['m', 'l', 'full'], defaultSize: 'l', panels: ['finanzas', 'inicio'], Component: MesCard },
  { id: 'finanzas.avisos', module: 'finanzas', title: 'Avisos', sizes: ['s', 'm', 'l'], defaultSize: 's', panels: ['finanzas', 'inicio'], Component: AvisosCard },
  { id: 'finanzas.detalle', module: 'finanzas', title: 'Más detalle', sizes: ['full'], defaultSize: 'full', panels: ['finanzas'], Component: MasDetalleCard },
  { id: 'finanzas.por-revisar', module: 'finanzas', title: 'Por revisar', sizes: ['s', 'm'], defaultSize: 's', panels: ['finanzas', 'inicio'], Component: PorRevisarCard },
  { id: 'finanzas.resumen', module: 'finanzas', title: 'Resumen de Finanzas', sizes: ['m', 'l', 'full'], defaultSize: 'l', panels: ['inicio'], Component: ResumenCard },
  { id: 'finanzas.tendencia', module: 'finanzas', title: 'Tendencia del patrimonio', sizes: ['s', 'm', 'l', 'full'], defaultSize: 'l', panels: ['finanzas', 'inicio'], Component: TendenciaCard }
]
