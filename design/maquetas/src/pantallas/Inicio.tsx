import { ArrowRight, Barbell, CalendarBlank, ChartLineUp, Medal, Receipt, Wallet } from '@phosphor-icons/react'
import { disponible, entreno, mes, movimientos, posicion } from '../../datos-ficticios'
import { eur, eurPlano, n, pct } from '../lib'
import { Button } from '../ui/controls'
import { Count, StatusBadge, Tag } from '../ui/feedback'
import { Card, CifraEur, CifraUnidad, KpiCard } from '../ui/layout'
import { ProgressBar, Spark } from '../ui/charts'

/** Inicio: lo de hoy arriba, un resumen de cada módulo y lo complementario al final.
 *  Va con los tokens del núcleo: no se tiñe de ningún módulo y no hay ninguna tarjeta lima. */
export function Inicio() {
  const pendientes = movimientos.filter((m) => m.estado === 'PENDING_REVIEW')
  const total12 = posicion.patrimonioCents - posicion.hace12mesesCents
  const usado = mes.gastosCents / mes.presupuestoCents
  const hechas = entreno.semana.filter((x) => x.estado === 'hecha').length
  const prevista = entreno.semana.filter((x) => x.tipo !== 'descanso').length
  const sesion = entreno.proximaSesion

  return (
    <div>
      <header className="mb-6">
        <h1 className="t-page">Buenas tardes</h1>
        <p className="t-label mt-2">Jueves, 19 de noviembre de 2026</p>
      </header>

      <div className="page-grid">
        {/* Hoy */}
        <div className="col-span-12 @3xl:col-span-6 @5xl:col-span-5">
          <KpiCard
            protagonista
            titulo="Disponible para gastar"
            icono={<Wallet size={20} weight="duotone" aria-hidden />}
            valor={<CifraEur cents={disponible.disponibleCents} />}
            contexto={`De ${eur(disponible.liquidezCents)} de liquidez, menos recibos y objetivos reservados`}
            estado={<StatusBadge tono="success">Por encima del mínimo de liquidez</StatusBadge>}
            className="h-full"
          />
        </div>
        <div className="col-span-12 @3xl:col-span-6 @5xl:col-span-4">
          <Card titulo="Por revisar" icono={<Receipt size={20} weight="duotone" aria-hidden />} className="h-full" accion={<Count tono="warning" label={`${pendientes.length} movimientos por revisar`}>{pendientes.length}</Count>}>
            <div className="t-kpi">
              {pendientes.length}
              <span className="unit">movimientos</span>
            </div>
            <ul className="mt-3 flex flex-col gap-1">
              {pendientes.map((m) => (
                <li key={m.id} className="t-label flex items-center justify-between gap-3">
                  <span className="truncate">{m.concepto}</span>
                  <span className="tnum text-ink">{eur(m.cents)}</span>
                </li>
              ))}
            </ul>
            <Button variant="primary" className="mt-4 w-full" onClick={() => (location.hash = '#/movimientos')} icon={<ArrowRight size={16} weight="bold" />}>
              Revisar ahora
            </Button>
          </Card>
        </div>
        <div className="col-span-12 @5xl:col-span-3">
          <Card titulo="Próxima sesión" icono={<CalendarBlank size={20} weight="duotone" aria-hidden />} className="h-full">
            <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:justify-between @5xl:flex-col @5xl:items-stretch @5xl:justify-start">
              <div>
                <div className="t-kpi">{sesion.nombre}</div>
                <p className="t-label mt-2">
                  {sesion.cuando}, {sesion.hora}
                </p>
                <p className="t-meta mt-1">{sesion.detalle}</p>
              </div>
              <a href="#/entreno" className="btn btn-secondary">
                Ver la semana
              </a>
            </div>
          </Card>
        </div>

        {/* Resúmenes */}
        <div className="col-span-12 @5xl:col-span-7">
          <Card titulo="Finanzas" subtitulo="Noviembre 2026" icono={<Wallet size={20} weight="duotone" aria-hidden />} accion={<a href="#/finanzas" className="btn btn-ghost btn-sm">Ver más <ArrowRight size={14} aria-hidden /></a>} className="h-full">
            <div className="auto-grid">
              <div>
                <div className="t-label">Patrimonio neto</div>
                <div className="t-kpi mt-1">
                  <CifraEur cents={posicion.patrimonioCents} />
                </div>
                <p className="t-meta mt-1">
                  {eur(total12, { sign: true, sinDecimales: true })} en 12 meses
                </p>
              </div>
              <div>
                <div className="t-label">Gastos del mes</div>
                <div className="t-kpi mt-1">
                  <CifraEur cents={mes.gastosCents} />
                </div>
                <ProgressBar className="mt-2" value={usado} marker={mes.diaActual / mes.diasDelMes} label="Presupuesto de noviembre consumido" valueText={`${pct(usado)} del presupuesto`} />
                <p className="t-meta mt-1">{pct(usado)} del presupuesto de noviembre ({eurPlano(mes.presupuestoCents)})</p>
              </div>
              <div>
                <div className="t-label">Ahorro del mes</div>
                <div className="t-kpi mt-1">
                  <CifraEur cents={mes.ahorroCents} />
                </div>
                <p className="t-meta mt-1">{pct(mes.tasaAhorro)} de los ingresos de noviembre</p>
              </div>
            </div>
          </Card>
        </div>
        <div className="col-span-12 @5xl:col-span-5">
          <Card titulo="Entreno" subtitulo="Semana 47" icono={<Barbell size={20} weight="duotone" aria-hidden />} accion={<a href="#/entreno" className="btn btn-ghost btn-sm">Ver más <ArrowRight size={14} aria-hidden /></a>} className="h-full">
            <div className="auto-grid">
              <div>
                <div className="t-label">Sesiones</div>
                <div className="t-kpi mt-1">
                  <CifraUnidad valor={`${hechas} de ${prevista}`} unidad="esta semana" />
                </div>
              </div>
              <div>
                <div className="t-label">Volumen semanal</div>
                <div className="t-kpi mt-1">
                  <CifraUnidad valor={n(entreno.volumen.ultimos7Kg)} unidad="kg" />
                </div>
                <p className="t-meta mt-1">+5,9 % sobre los 7 días anteriores</p>
              </div>
            </div>
            <p className="t-label mt-4 border-t border-line pt-3">
              HYROX Open Madrid, 20/03/2027: <b className="font-semibold text-ink">{entreno.hyrox.dias} días</b>
            </p>
          </Card>
        </div>

        {/* Complementario */}
        <div className="col-span-12 @5xl:col-span-7">
          <Card titulo="Récords recientes" subtitulo="Entreno, últimos 10 días" icono={<Medal size={20} weight="duotone" aria-hidden />} className="h-full">
            <ul className="auto-grid">
              {entreno.records.map((r) => (
                <li key={r.ejercicio}>
                  <div className="t-label">{r.ejercicio}</div>
                  <div className="t-body tnum mt-1 font-semibold">{r.marca}</div>
                  <Tag className="mt-2">{r.mejora} · {r.fecha}</Tag>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="col-span-12 @5xl:col-span-5">
          <Card titulo="Tendencia" subtitulo="Disponible, 30 días" icono={<ChartLineUp size={20} weight="duotone" aria-hidden />} className="h-full">
            <Spark datos={disponible.serie30} periodo="Últimos 30 días" etiquetaInicio="Hace 30 días" etiquetaFin="Hoy" formato={(x) => eur(x * 100, { sinDecimales: true })} etiquetaX={(i) => `Hace ${29 - i} días`} nombre="Disponible para gastar" />
          </Card>
        </div>
      </div>
    </div>
  )
}
