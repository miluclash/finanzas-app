import { ArrowRight, CalendarBlank, CaretLeft, CaretRight, ChartLineUp, ChartPieSlice, Clock, ListBullets, Pulse, Receipt, Target, Wallet, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { avisos, disponible, evolucionPatrimonio, gastosPorCategoria, mes, movimientos, objetivos, posicion, proximos30, tasaAhorroSerie } from '../../datos-ficticios'
import { eur, eurPlano, fecha, n, pct } from '../lib'
import { Button, IconButton } from '../ui/controls'
import { StatusBadge } from '../ui/feedback'
import { Accordion, Card, CifraEur, FilaDato, Importe, KpiCard, PageHeader, type AccItem } from '../ui/layout'
import { BarraSegmentada, ChartFrame, Columnas, leyendaDe, Lineas, MedidoresLista, ProgressBar, Spark, type Referencia, type SerieLinea } from '../ui/charts'

const abreInicial = new URLSearchParams(location.search).get('abre')

export function Finanzas() {
  const total12 = posicion.patrimonioCents - posicion.hace12mesesCents
  const ritmo = mes.diaActual / mes.diasDelMes
  const usado = mes.gastosCents / mes.presupuestoCents
  const ahorroOct = mes.anterior.ingresosCents - mes.anterior.gastosCents

  return (
    <div data-module="finanzas">
      <PageHeader
        titulo="Panel"
        texto="Situación de hoy y del mes en curso."
        acciones={
          <div className="flex items-center gap-1">
            <IconButton variant="ghost" etiqueta="Mes anterior" icono={<CaretLeft size={16} />} />
            <span className="t-body min-w-36 text-center font-semibold">Noviembre 2026</span>
            <IconButton variant="ghost" etiqueta="Mes siguiente" disabled icono={<CaretRight size={16} />} />
          </div>
        }
      />

      <div className="page-grid">
        {/* Fila 1: Disponible (protagonista) y Patrimonio (secundario) */}
        <KpiCard
          protagonista
          titulo="Disponible para gastar"
          icono={<Wallet size={20} weight="duotone" aria-hidden />}
          valor={<CifraEur cents={disponible.disponibleCents} />}
          estado={<StatusBadge tono="success">Por encima del mínimo de liquidez ({eurPlano(150000)})</StatusBadge>}
          className="col-span-12 @4xl:col-span-8"
        >
          <dl className="mt-6 flex flex-col gap-2 border-t border-line pt-4" aria-label="Cómo se calcula el disponible">
            <FilaDato etiqueta="Liquidez (cuentas que puedes gastar)" valor={eur(disponible.liquidezCents)} />
            <FilaDato etiqueta="Menos recibos pendientes este mes" valor={eur(-disponible.pendientesCents)} />
            <FilaDato etiqueta="Menos reservado para objetivos" valor={eur(-disponible.reservadoCents)} />
            <FilaDato className="border-t border-line pt-2" etiqueta="Igual a disponible para gastar" valor={eur(disponible.disponibleCents)} fuerte />
          </dl>
          <div className="mt-4">
            <BarraSegmentada
              etiqueta="Reparto de la liquidez"
              partes={[
                { nombre: 'Disponible', valor: disponible.disponibleCents, color: 'var(--accent-mark)' },
                { nombre: 'Recibos pendientes', valor: disponible.pendientesCents, color: 'var(--seq-3)' },
                { nombre: 'Reservado para objetivos', valor: disponible.reservadoCents, color: 'var(--muted-mark)' }
              ]}
            />
            <ul className="t-meta mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Leyenda del reparto">
              {[
                ['Disponible', 'var(--accent-mark)'],
                ['Recibos pendientes', 'var(--seq-3)'],
                ['Reservado para objetivos', 'var(--muted-mark)']
              ].map(([t, c]) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="size-3 r-tag" style={{ background: c }} aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </KpiCard>

        <Card titulo="Patrimonio neto" icono={<ChartLineUp size={20} weight="duotone" aria-hidden />} accion={<a href="#/finanzas/patrimonio" className="btn btn-ghost btn-sm">Ver <ArrowRight size={14} aria-hidden /></a>} className="col-span-12 flex flex-col @4xl:col-span-4">
          <div className="t-kpi">
            <CifraEur cents={posicion.patrimonioCents} />
          </div>
          <p className="t-label mt-2">
            <span className="font-semibold text-success">{eur(total12, { sign: true, sinDecimales: true })}</span> ({pct(total12 / posicion.hace12mesesCents)}) en los últimos 12 meses
          </p>
          <div className="mt-4">
            <Spark datos={evolucionPatrimonio.map((d) => d.patrimonio)} periodo="Últimos 12 meses" etiquetaInicio="Hace 12 meses" etiquetaFin="Hoy" formato={(v) => eur(v * 100, { sinDecimales: true })} etiquetaX={(i) => evolucionPatrimonio[i].mes} nombre="Patrimonio neto" />
          </div>
          <dl className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
            <FilaDato etiqueta="Liquidez" valor={eurPlano(posicion.liquidezCents)} />
            <FilaDato etiqueta="Ahorro y huchas" valor={eurPlano(posicion.ahorroCents)} />
            <FilaDato etiqueta="Inversiones" valor={eurPlano(posicion.inversionesCents)} />
          </dl>
        </Card>

        {/* Fila 2: ingresos, gastos y ahorro; avisos */}
        <Card titulo="Este mes" subtitulo="Noviembre 2026, día 19 de 30" icono={<CalendarBlank size={20} weight="duotone" aria-hidden />} className="col-span-12 flex flex-col @4xl:col-span-8">
          <div className="auto-grid">
            <div>
              <div className="t-label">Ingresos</div>
              <div className="t-kpi mt-1">
                <CifraEur cents={mes.ingresosCents} />
              </div>
              <p className="t-meta mt-2">Octubre completo: {eurPlano(mes.anterior.ingresosCents)}</p>
            </div>
            <div>
              <div className="t-label">Gastos</div>
              <div className="t-kpi mt-1">
                <CifraEur cents={mes.gastosCents} />
              </div>
              <ProgressBar className="mt-3" value={usado} marker={ritmo} label="Presupuesto de noviembre consumido" valueText={`${pct(usado)} del presupuesto`} />
              <p className="t-meta mt-2">
                {pct(usado)} del presupuesto de noviembre ({eurPlano(mes.presupuestoCents)}); la marca indica el {pct(ritmo)} del mes transcurrido
              </p>
              <div className="mt-2">
                <StatusBadge tono="info">Algo por delante del ritmo del mes</StatusBadge>
              </div>
            </div>
            <div>
              <div className="t-label">Ahorro</div>
              <div className="t-kpi mt-1">
                <CifraEur cents={mes.ahorroCents} />
              </div>
              <p className="t-meta mt-2">{pct(mes.tasaAhorro)} de los ingresos de noviembre</p>
              <p className="t-meta mt-1">
                <span className="font-semibold text-success">{eur(mes.ahorroCents - ahorroOct, { sign: true })}</span> más que todo octubre
              </p>
            </div>
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <div className="t-label mb-2 flex justify-between gap-4">
              <span>De cada 100 € que ingresas en noviembre</span>
              <span className="tnum">
                gastas <b className="font-semibold text-ink">{Math.round((1 - mes.tasaAhorro) * 100)} €</b> · ahorras <b className="font-semibold text-ink">{Math.round(mes.tasaAhorro * 100)} €</b>
              </span>
            </div>
            <BarraSegmentada etiqueta="Reparto de los ingresos de noviembre" partes={[{ nombre: 'Gastos', valor: mes.gastosCents, color: 'var(--muted-mark)' }, { nombre: 'Ahorro', valor: mes.ahorroCents, color: 'var(--accent-mark)' }]} />
          </div>
        </Card>

        <Card titulo="Avisos" icono={<Warning size={20} weight="duotone" aria-hidden />} className="col-span-12 flex flex-col @4xl:col-span-4">
          <ul className="divide-line flex flex-1 flex-col">
            {avisos.map((a, i) => (
              <li key={i} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <StatusBadge tono={a.nivel === 'warn' ? 'warning' : 'info'}>{a.texto}</StatusBadge>
                <a href={a.enlace} className="btn btn-secondary btn-sm self-start">
                  {i === 0 ? 'Revisar movimientos' : i === 1 ? 'Verificar la cuenta' : 'Ver el posible duplicado'}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Detalle />
    </div>
  )
}

const SERIES_ACUM: SerieLinea[] = [
  { key: 'actual', nombre: 'Noviembre (real)', color: 'var(--series-1)', patron: 'solida' },
  { key: 'anterior', nombre: 'Octubre (histórico)', color: 'var(--muted-mark)', patron: 'punteada' }
]
const REF_ACUM: Referencia[] = [{ y: mes.presupuestoCents / 100, texto: `Presupuesto ${eurPlano(mes.presupuestoCents)}`, patron: 'discontinua' }]

/* ---------- Más detalle: se abre bajo demanda ---------- */
function Detalle() {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set((abreInicial ?? 'categorias').split(',')))
  const alternar = (id: string) =>
    setAbiertas((s) => {
      const nuevo = new Set(s)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  const totalCat = gastosPorCategoria.reduce((a, c) => a + c.cents, 0)
  const entra = proximos30.filter((p) => p.cents > 0).reduce((a, p) => a + p.cents, 0)
  const sale = proximos30.filter((p) => p.cents < 0).reduce((a, p) => a + p.cents, 0)
  const datosAcum = mes.acumuladoAnterior.map((a, i) => ({ dia: String(i + 1), anterior: a.v, actual: mes.acumuladoActual[i]?.v ?? null }))

  const items: AccItem[] = [
    {
      id: 'proximos',
      titulo: 'Próximos 30 días',
      icono: <Clock size={20} weight="duotone" aria-hidden />,
      resumen: `${proximos30.length} movimientos · entran ${eurPlano(entra)}, salen ${eurPlano(-sale)}`,
      contenido: (
        <ul className="divide-line">
          {proximos30.map((p) => (
            <li key={p.concepto} className="flex items-center gap-4 py-3">
              <span className="tnum w-16 text-ink-3">{fecha(p.fecha)}</span>
              <span className="t-body flex-1">{p.concepto}</span>
              <span className="t-meta">{p.cuenta}</span>
              <Importe cents={p.cents} className="w-28 text-right" />
            </li>
          ))}
        </ul>
      )
    },
    {
      id: 'acumulado',
      titulo: 'Gasto acumulado del mes',
      icono: <Pulse size={20} weight="duotone" aria-hidden />,
      resumen: '16 % por encima de octubre a esta altura',
      contenido: (
        <ChartFrame
          titulo="Gasto acumulado"
          periodo="Noviembre 2026, días 1 a 30 (real hasta el 19)"
          unidad="euros"
          referencia="Compara el gasto acumulado de cada día con octubre completo y con el presupuesto del mes."
          leyenda={leyendaDe(SERIES_ACUM, REF_ACUM)}
          tabla={{ columnas: ['Día', 'Noviembre', 'Octubre'], filas: datosAcum.filter((_, i) => i % 3 === 0).map((d) => [`Día ${d.dia}`, d.actual === null ? '—' : eurPlano(d.actual * 100), eurPlano(d.anterior * 100)]) }}
        >
          <Lineas datos={datosAcum} claveX="dia" series={SERIES_ACUM} referencias={REF_ACUM} formato={(v) => eur(v * 100, { sinDecimales: true })} formatoEje={(v) => n(v)} ticks={[0, 600, 1200, 1800, 2400]} dominio={[0, 2400]} tituloTooltip={(l) => `Día ${l}`} />
        </ChartFrame>
      )
    },
    {
      id: 'categorias',
      titulo: 'Gastos por categoría',
      icono: <ChartPieSlice size={20} weight="duotone" aria-hidden />,
      resumen: `${eur(totalCat)} · la mayor, ${gastosPorCategoria[0].nombre}`,
      contenido: (
        <ChartFrame titulo="Gastos por categoría" periodo="Noviembre 2026 (hasta el día 19)" unidad="euros, netos de reembolsos" referencia={`Vivienda y alimentación suman el ${pct((gastosPorCategoria[0].cents + gastosPorCategoria[1].cents) / totalCat)} del gasto total de noviembre (${eur(totalCat)}).`}>
          <MedidoresLista filas={gastosPorCategoria.map((c) => ({ nombre: c.nombre, valor: c.cents }))} formato={(v) => eur(v)} />
          <Button className="mt-4" size="sm" variant="secondary" onClick={() => (location.hash = '#/movimientos')} icon={<ArrowRight size={14} />}>
            Ver movimientos
          </Button>
        </ChartFrame>
      )
    },
    {
      id: 'objetivos',
      titulo: 'Objetivos',
      icono: <Target size={20} weight="duotone" aria-hidden />,
      resumen: `${objetivos.length} activos · ${objetivos.filter((o) => o.salud === 'En riesgo').length} en riesgo`,
      contenido: (
        <ul className="auto-grid-wide">
          {objetivos.map((o) => {
            const v = o.actualCents / o.metaCents
            return (
              <li key={o.nombre}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="t-body font-semibold">{o.nombre}</span>
                  <span className="t-meta tnum">{pct(v)} de la meta</span>
                </div>
                <ProgressBar className="mt-2" value={v} tone={o.salud === 'En riesgo' ? 'warning' : 'accent'} label={`Progreso de ${o.nombre}`} />
                <p className="t-label tnum mt-2">
                  {eurPlano(o.actualCents)} de {eurPlano(o.metaCents)} · para {o.fecha}
                </p>
                <div className="mt-2">
                  <StatusBadge tono={o.salud === 'En riesgo' ? 'warning' : 'success'}>{o.salud}</StatusBadge>
                </div>
              </li>
            )
          })}
        </ul>
      )
    },
    {
      id: 'patrimonio',
      titulo: 'Evolución del patrimonio',
      icono: <ChartLineUp size={20} weight="duotone" aria-hidden />,
      resumen: `${eur(posicion.patrimonioCents - posicion.hace12mesesCents, { sign: true, sinDecimales: true })} en 12 meses`,
      contenido: (
        <ChartFrame
          titulo="Patrimonio neto y liquidez"
          periodo="Diciembre 2025 a noviembre 2026, fin de cada mes"
          unidad="euros"
          referencia="El eje arranca en cero para no exagerar la subida."
          leyenda={leyendaDe([{ key: 'p', nombre: 'Patrimonio neto', color: 'var(--series-1)' }, { key: 'l', nombre: 'Liquidez', color: 'var(--muted-mark)', patron: 'punteada' }])}
          tabla={{ columnas: ['Mes', 'Patrimonio', 'Liquidez'], filas: evolucionPatrimonio.map((d) => [d.mes, eurPlano(d.patrimonio * 100), eurPlano(d.liquidez * 100)]) }}
        >
          <Lineas datos={evolucionPatrimonio} claveX="mes" series={[{ key: 'patrimonio', nombre: 'Patrimonio neto', color: 'var(--series-1)' }, { key: 'liquidez', nombre: 'Liquidez', color: 'var(--muted-mark)', patron: 'punteada' }]} formato={(v) => eur(v * 100, { sinDecimales: true })} formatoEje={(v) => (v === 0 ? '0' : `${v / 1000} mil`)} dominio={[0, 50000]} ticks={[0, 10000, 20000, 30000, 40000, 50000]} />
        </ChartFrame>
      )
    },
    {
      id: 'tasa',
      titulo: 'Tasa de ahorro',
      icono: <Pulse size={20} weight="duotone" aria-hidden />,
      resumen: `${pct(mes.tasaAhorro)} este mes · media de 12 meses ${Math.round(tasaAhorroSerie.reduce((a, t) => a + t.tasa, 0) / tasaAhorroSerie.length)} %`,
      contenido: (
        <ChartFrame titulo="Tasa de ahorro" periodo="Diciembre 2025 a noviembre 2026" unidad="% sobre los ingresos de cada mes" referencia="Flujo neto entre los ingresos del mismo mes. El mes en curso, resaltado." tabla={{ columnas: ['Mes', 'Tasa de ahorro'], filas: tasaAhorroSerie.map((t) => [t.mes, `${t.tasa} %`]) }}>
          <Columnas datos={tasaAhorroSerie} claveX="mes" claveY="tasa" nombre="Tasa de ahorro" resaltada={11} formato={(v) => `${v} %`} />
        </ChartFrame>
      )
    },
    {
      id: 'ultimos',
      titulo: 'Últimos movimientos',
      icono: <Receipt size={20} weight="duotone" aria-hidden />,
      resumen: `Hoy: ${movimientos[0].concepto}, ${eur(movimientos[0].cents)}`,
      contenido: (
        <div>
          <ul className="divide-line">
            {movimientos.slice(0, 5).map((m) => (
              <li key={m.id} className="flex items-center gap-4 py-3">
                <span className="tnum w-16 text-ink-3">{fecha(m.fecha)}</span>
                <span className="t-body flex-1">{m.concepto}</span>
                <span className="t-meta">{m.categoria}</span>
                <Importe cents={m.cents} className="w-28 text-right" />
              </li>
            ))}
          </ul>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => (location.hash = '#/movimientos')} icon={<ArrowRight size={14} />}>
            Ver todos los movimientos
          </Button>
        </div>
      )
    }
  ]

  return (
    <section className="mt-10" aria-labelledby="mas-detalle">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="mas-detalle" className="t-section flex items-center gap-2">
          <ListBullets size={20} weight="duotone" aria-hidden /> Más detalle
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setAbiertas(abiertas.size ? new Set() : new Set(items.map((s) => s.id)))}>
          {abiertas.size ? 'Plegar todo' : 'Desplegar todo'}
        </Button>
      </div>
      <div className="card card-flush">
        <Accordion items={items} abiertas={abiertas} onToggle={alternar} />
      </div>
    </section>
  )
}
