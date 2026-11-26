// Tarjetas de Entreno para los paneles editables (Resumen de Entreno e Inicio). Cada una pide sus datos y pinta
// sus propios estados de carga, error y vacío. No calculan nada: enseñan lo que devuelven las métricas de Entreno.
import { ArrowDown, ArrowRight, ArrowUp, Barbell, CheckCircle, Medal } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { formatDate } from '@shared/dates'
import { weekLabelNumber } from '@shared/modules/entreno/metrics/weeks'
import { Card, CifraUnidad, EmptyState, TarjetaConsulta, Tag } from '../../core/ui'
import type { FixedCardDef } from '../../core/graficos'
import { useApi } from '../../lib/api'
import { anteriorRecord, fechaCorta, formatCambio, formatEntero, marcaRecord, sinVolumenPrevio, textoComparacionVolumen } from './format'
import { useResumenEntreno } from './periodoResumen'
import { ConstanciaCard, HyroxCard, ObjetivosCard, ProximaCard, RecordsCard, SemanaCard, SeriesCard, UltimasCard, VolumenCard } from './ResumenTarjetas'

const ERROR = 'No se ha podido calcular el resumen'
const COMUN = { carga: 'Calculando tu resumen', error: ERROR } as const

/** Envuelve una tarjeta del Resumen: carga, error y datos del periodo elegido. */
function delResumen(titulo: string, Pieza: (p: { s: NonNullable<ReturnType<typeof useResumenEntreno>['data']> }) => React.ReactNode, icono?: React.ReactNode) {
  return function TarjetaResumen() {
    const q = useResumenEntreno()
    return (
      <TarjetaConsulta q={q} titulo={titulo} icono={icono} {...COMUN} filas={3}>
        {(s) => <Pieza s={s} />}
      </TarjetaConsulta>
    )
  }
}

const SemanaTarjeta = delResumen('Semana', SemanaCard)
const VolumenTarjeta = delResumen('Volumen semanal', VolumenCard)
const SeriesTarjeta = delResumen('Series por grupo', SeriesCard)
const HyroxTarjeta = delResumen('HYROX', HyroxCard)
const ObjetivosTarjeta = delResumen('Objetivos', ObjetivosCard)
const RecordsTarjeta = delResumen('Récords', RecordsCard)
const UltimasTarjeta = delResumen('Últimas sesiones', UltimasCard)
const ConstanciaTarjeta = delResumen('Constancia', ConstanciaCard)

/* ======================= Próxima sesión (Resumen e Inicio) ======================= */
function ProximaTarjeta() {
  const q = useApi('entreno:metrics.inicio', [])
  return (
    <TarjetaConsulta q={q} titulo="Próxima sesión" carga="Calculando tu próxima sesión" error="No se han podido calcular tus datos de entreno">
      {(d) => <ProximaCard n={d.next} today={d.today} />}
    </TarjetaConsulta>
  )
}

/* ======================= Entreno (Inicio) ======================= */
function ResumenInicioTarjeta() {
  const q = useApi('entreno:metrics.inicio', [])
  return (
    <TarjetaConsulta q={q} titulo="Entreno" icono={<Barbell size={20} weight="duotone" aria-hidden />} carga="Calculando tu resumen de entreno" error="No se han podido calcular tus datos de entreno" filas={2}>
      {(d) => {
        const { week, volume, nextEvent } = d
        const vacio = week.planned === 0 && week.sessions === 0 && volume.loadKg === 0 && d.records.length === 0
        const ch = volume.changePct
        return (
          <Card
            titulo="Entreno"
            subtitulo={`Semana ${weekLabelNumber(week.weekStart)}`}
            icono={<Barbell size={20} weight="duotone" aria-hidden />}
            accion={
              <Link to="/entreno" className="btn btn-ghost btn-sm">
                Ver más <ArrowRight size={14} aria-hidden />
              </Link>
            }
            className="h-full"
          >
            {vacio ? (
              <EmptyState
                horizontal
                icono={<CheckCircle size={20} aria-hidden />}
                titulo="Importa tus entrenos de Hevy"
                texto="Aquí verás tus sesiones de la semana, tu volumen y la cuenta atrás de tu próximo evento."
                accion={<Link to="/entreno" className="btn btn-secondary btn-sm">Ir a Entreno</Link>}
              />
            ) : (
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
            )}
          </Card>
        )
      }}
    </TarjetaConsulta>
  )
}

/* ======================= Récords recientes (Inicio) ======================= */
function RecordsRecientesTarjeta() {
  const q = useApi('entreno:metrics.inicio', [])
  return (
    <TarjetaConsulta q={q} titulo="Récords recientes" icono={<Medal size={20} weight="duotone" aria-hidden />} carga="Calculando tus récords" error="No se han podido calcular tus datos de entreno" filas={2}>
      {(d) => (
        <Card titulo="Récords recientes" subtitulo="Entreno" icono={<Medal size={20} weight="duotone" aria-hidden />} className="h-full">
          {d.records.length === 0 ? (
            <EmptyState horizontal icono={<Medal size={20} aria-hidden />} titulo="Todavía no hay récords" texto="Tus mejores marcas aparecerán aquí cuando superes una marca anterior. Hacen falta al menos dos sesiones del mismo ejercicio." />
          ) : (
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
          )}
        </Card>
      )}
    </TarjetaConsulta>
  )
}

/* ======================= Registro ======================= */
// Las del Resumen usan el periodo elegido en su cabecera; fuera del Resumen enseñan la semana.
export const tarjetasEntreno: FixedCardDef[] = [
  { id: 'entreno.semana', module: 'entreno', title: 'Semana', sizes: ['l', 'full'], defaultSize: 'l', panels: ['entreno', 'inicio'], Component: SemanaTarjeta },
  { id: 'entreno.proxima', module: 'entreno', title: 'Próxima sesión', sizes: ['s', 'm'], defaultSize: 's', panels: ['entreno', 'inicio'], Component: ProximaTarjeta },
  { id: 'entreno.volumen', module: 'entreno', title: 'Volumen semanal', sizes: ['m', 'l', 'full'], defaultSize: 'l', panels: ['entreno', 'inicio'], Component: VolumenTarjeta },
  { id: 'entreno.series', module: 'entreno', title: 'Series por grupo', sizes: ['s', 'm', 'l'], defaultSize: 'm', panels: ['entreno', 'inicio'], Component: SeriesTarjeta },
  { id: 'entreno.hyrox', module: 'entreno', title: 'HYROX', sizes: ['m', 'l', 'full'], defaultSize: 'm', panels: ['entreno', 'inicio'], Component: HyroxTarjeta },
  { id: 'entreno.objetivos', module: 'entreno', title: 'Objetivos', sizes: ['m', 'l', 'full'], defaultSize: 'l', panels: ['entreno', 'inicio'], Component: ObjetivosTarjeta },
  { id: 'entreno.records', module: 'entreno', title: 'Récords', sizes: ['s', 'm'], defaultSize: 's', panels: ['entreno', 'inicio'], Component: RecordsTarjeta },
  { id: 'entreno.ultimas', module: 'entreno', title: 'Últimas sesiones', sizes: ['s', 'm'], defaultSize: 's', panels: ['entreno', 'inicio'], Component: UltimasTarjeta },
  { id: 'entreno.constancia', module: 'entreno', title: 'Constancia', sizes: ['s', 'm'], defaultSize: 's', panels: ['entreno', 'inicio'], Component: ConstanciaTarjeta },
  { id: 'entreno.resumen', module: 'entreno', title: 'Resumen de Entreno', sizes: ['s', 'm', 'l'], defaultSize: 's', panels: ['inicio'], Component: ResumenInicioTarjeta },
  { id: 'entreno.records-recientes', module: 'entreno', title: 'Récords recientes', sizes: ['s', 'm', 'l'], defaultSize: 's', panels: ['inicio'], Component: RecordsRecientesTarjeta }
]
