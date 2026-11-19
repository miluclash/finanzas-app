import {
  ArrowRight,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartLineUp,
  ChartPieSlice,
  ListBullets,
  Pulse,
  Target,
  Wallet,
  Warning,
  WarningCircle,
  Info,
  Receipt
} from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import {
  avisos,
  disponible,
  evolucionPatrimonio,
  gastosPorCategoria,
  mes,
  movimientos,
  objetivos,
  posicion,
  proximos30,
  tasaAhorroSerie
} from '../../datos-ficticios'
import { cx, eur, fecha, n, pct } from '../lib'
import { Button, CardHead, CifraEur, Delta, Estado, Importe, Meter, PageHeader } from '../ui/basics'
import { BarraSegmentada, Columnas, Lineas, MedidoresLista, Spark } from '../ui/charts'

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
            <Button variant="ghost" size="sm" aria-label="Mes anterior" icon={<CaretLeft size={16} />} />
            <span className="min-w-[132px] text-center text-[length:var(--fs-body)] font-[560]">Noviembre 2026</span>
            <Button variant="ghost" size="sm" aria-label="Mes siguiente" disabled icon={<CaretRight size={16} />} />
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-[var(--density-gap)]">
        {/* Disponible para gastar: la cifra héroe de la vista */}
        <section className="card col-span-7 flex flex-col" aria-labelledby="t-disp">
          <CardHead titulo="Disponible para gastar" icono={<Wallet size={15} weight="duotone" />} accion={<Button variant="ghost" size="sm">Ver detalle</Button>} />
          <h2 id="t-disp" className="sr-only">
            Disponible para gastar
          </h2>
          <div className="num-hero text-ink" style={{ fontSize: 'var(--fs-hero)' }}>
            <CifraEur cents={disponible.disponibleCents} />
          </div>
          <div className="mt-3">
            <Estado tono="pos">Por encima de tu mínimo de liquidez (1.500 €)</Estado>
          </div>

          <div className="mt-auto pt-7">
            <div className="mb-2 flex items-baseline justify-between text-[length:var(--fs-small)]">
              <span className="text-ink-3">Reparto de tu liquidez</span>
              <span className="tnum font-[560] text-ink">{eur(disponible.liquidezCents)}</span>
            </div>
            <BarraSegmentada
              partes={[
                { nombre: 'Disponible', valor: disponible.disponibleCents, color: 'var(--accent-mark)' },
                { nombre: 'Recibos pendientes', valor: disponible.pendientesCents, color: 'var(--seq-3)' },
                { nombre: 'Reservado para objetivos', valor: disponible.reservadoCents, color: 'var(--muted-mark)' }
              ]}
            />
            <dl className="mt-3.5 grid grid-cols-3 gap-4 text-[length:var(--fs-small)]">
              {[
                ['Disponible', disponible.disponibleCents, 'var(--accent-mark)'],
                ['Recibos de este mes', -disponible.pendientesCents, 'var(--seq-3)'],
                ['Reservado a objetivos', -disponible.reservadoCents, 'var(--muted-mark)']
              ].map(([n, v, c]) => (
                <div key={n as string}>
                  <dt className="flex items-center gap-1.5 text-ink-3">
                    <span className="size-2 rounded-[3px]" style={{ background: c as string }} aria-hidden />
                    {n as string}
                  </dt>
                  <dd className="tnum mt-0.5 font-[560] text-ink">{eur(v as number)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Patrimonio */}
        <section className="card col-span-5 flex flex-col" aria-label="Patrimonio neto">
          <CardHead titulo="Patrimonio neto" icono={<ChartLineUp size={15} weight="duotone" />} accion={<a href="#/finanzas/patrimonio" className="t-small flex items-center gap-1 text-accent-text hover:underline">Ver patrimonio <ArrowRight size={12} /></a>} />
          <div className="num-display text-ink">
            <CifraEur cents={posicion.patrimonioCents} />
          </div>
          <Delta className="mt-2" valor={`${eur(total12, { sign: true, sinDecimales: true })} (${pct(total12 / posicion.hace12mesesCents)})`} contexto="en los últimos 12 meses" dir="up" bueno />
          <div className="mt-4">
            <Spark datos={evolucionPatrimonio.map((d) => d.patrimonio)} formato={(v) => eur(v * 100, { sinDecimales: true })} etiquetaX={(i) => evolucionPatrimonio[i].mes} nombre="Patrimonio" alto={64} />
          </div>
          <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-line pt-4 text-[length:var(--fs-small)]">
            {[
              ['Liquidez', posicion.liquidezCents],
              ['Ahorro y huchas', posicion.ahorroCents],
              ['Inversiones', posicion.inversionesCents]
            ].map(([n, v]) => (
              <div key={n as string}>
                <dt className="text-ink-3">{n as string}</dt>
                <dd className="tnum mt-0.5 font-[560] text-ink">{eur(v as number, { sinDecimales: true })}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Mes en curso */}
        <section className="card col-span-8 flex flex-col" aria-label="Mes en curso">
          <CardHead titulo="Este mes" icono={<CalendarBlank size={15} weight="duotone" />} accion={<span className="chip">Día {mes.diaActual} de {mes.diasDelMes}</span>} />
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="t-small text-ink-2">Ingresos</div>
              <div className="num-stat mt-1 text-ink">{eur(mes.ingresosCents)}</div>
              <p className="t-small mt-1.5 text-ink-3">Octubre entero: {eur(mes.anterior.ingresosCents, { sinDecimales: true })}</p>
            </div>
            <div>
              <div className="t-small text-ink-2">Gastos</div>
              <div className="num-stat mt-1 text-ink">{eur(mes.gastosCents)}</div>
              <Meter className="mt-2" value={usado} tone="warn" marker={ritmo} label="Presupuesto consumido" />
              <p className="t-small mt-1.5 text-ink-3">
                {pct(usado)} del presupuesto · el mes va por el {pct(ritmo)}
              </p>
              <Estado tono="warn" className="mt-1.5">
                Por delante del ritmo
              </Estado>
            </div>
            <div>
              <div className="t-small text-ink-2">Ahorro</div>
              <div className="num-stat mt-1 text-ink">{eur(mes.ahorroCents)}</div>
              <p className="t-small mt-1.5 text-ink-3">{pct(mes.tasaAhorro)} de tus ingresos</p>
              <Delta className="mt-1.5" valor={eur(mes.ahorroCents - ahorroOct, { sign: true })} contexto="más que todo octubre" dir="up" bueno />
            </div>
          </div>

          <div className="mt-auto border-t border-line pt-4">
            <div className="mb-2 flex items-baseline justify-between text-[length:var(--fs-small)]">
              <span className="text-ink-3">De cada 100 € que ingresas</span>
              <span className="tnum text-ink-2">
                gastas <b className="font-[650] text-ink">{Math.round((1 - mes.tasaAhorro) * 100)} €</b> · ahorras <b className="font-[650] text-ink">{Math.round(mes.tasaAhorro * 100)} €</b>
              </span>
            </div>
            <BarraSegmentada
              partes={[
                { nombre: 'Gastos', valor: mes.gastosCents, color: 'var(--muted-mark)' },
                { nombre: 'Ahorro', valor: mes.ahorroCents, color: 'var(--accent-mark)' }
              ]}
            />
          </div>
        </section>

        {/* Avisos */}
        <section className="card col-span-4 flex flex-col" aria-label="Avisos">
          <CardHead titulo="Avisos" icono={<Warning size={15} weight="duotone" />} accion={<span className="chip chip-warn">{avisos.length}</span>} />
          <ul className="flex flex-1 flex-col divide-hair">
            {avisos.map((a, i) => (
              <li key={i}>
                <a href={a.enlace} className="group -mx-2 flex items-start gap-3 rounded-[var(--radius-sm)] px-2 py-3.5 transition-colors hover:bg-surface-2">
                  {a.nivel === 'error' ? <WarningCircle size={20} weight="fill" className="mt-px shrink-0 text-neg" aria-hidden /> : a.nivel === 'warn' ? <Warning size={20} weight="fill" className="mt-px shrink-0 text-warn" aria-hidden /> : <Info size={20} weight="fill" className="mt-px shrink-0 text-ink-2" aria-hidden />}
                  <span className="t-small min-w-0 flex-1 text-ink">{a.texto}</span>
                  <CaretRight size={14} className="mt-1 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <p className="t-small mt-3 border-t border-line pt-3 text-ink-3">Lo demás está en orden: sin recibos fallidos ni saldos descuadrados.</p>
        </section>
      </div>

      <Detalle />
    </div>
  )
}

function MesAcumulado() {
  const datos = mes.acumuladoAnterior.map((a, i) => ({ dia: String(i + 1), anterior: a.v, actual: mes.acumuladoActual[i]?.v ?? null }))
  return (
    <Lineas
      datos={datos}
      claveX="dia"
      alto={170}
      series={[
        { key: 'actual', nombre: 'Noviembre', color: 'var(--series-1)' },
        { key: 'anterior', nombre: 'Octubre', color: 'var(--muted-mark)' }
      ]}
      formato={(v) => eur(v * 100, { sinDecimales: true })}
      formatoEje={(v) => n(v)}
      ticks={[0, 600, 1200, 1800, 2400]}
      tituloTooltip={(l) => `Día ${l}`}
      referencia={{ y: mes.presupuestoCents / 100, texto: `Presupuesto ${eur(mes.presupuestoCents, { sinDecimales: true })}` }}
      dominio={[0, 2400]}
    />
  )
}

/* ---------- Más detalle: se abre bajo demanda ---------- */
type Sec = { id: string; titulo: string; icono: ReactNode; resumen: ReactNode; contenido: ReactNode }

function Detalle() {
  const inicial = new Set((abreInicial ?? 'categorias').split(','))
  const [abiertas, setAbiertas] = useState<Set<string>>(inicial)
  const alternar = (id: string) =>
    setAbiertas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const totalCat = gastosPorCategoria.reduce((a, c) => a + c.cents, 0)
  const entra = proximos30.filter((p) => p.cents > 0).reduce((a, p) => a + p.cents, 0)
  const sale = proximos30.filter((p) => p.cents < 0).reduce((a, p) => a + p.cents, 0)

  const secciones: Sec[] = [
    {
      id: 'proximos',
      titulo: 'Próximos 30 días',
      icono: <CalendarBlank size={18} weight="duotone" />,
      resumen: `${proximos30.length} movimientos · entran ${eur(entra, { sinDecimales: true })}, salen ${eur(-sale, { sinDecimales: true })}`,
      contenido: (
        <ul className="divide-hair">
          {proximos30.map((p) => (
            <li key={p.concepto} className="flex items-center gap-4 py-2.5 text-[length:var(--fs-body)]">
              <span className="tnum w-14 text-ink-3">{fecha(p.fecha)}</span>
              <span className="flex-1">{p.concepto}</span>
              <span className="t-small text-ink-3">{p.cuenta}</span>
              <Importe cents={p.cents} className="w-28 text-right font-[560]" />
            </li>
          ))}
        </ul>
      )
    },
    {
      id: 'acumulado',
      titulo: 'Gasto acumulado del mes',
      icono: <Pulse size={18} weight="duotone" />,
      resumen: '16 % por encima de octubre a esta altura',
      contenido: (
        <div>
          <p className="t-small mb-2 text-ink-3">¿Vas más rápido que el mes pasado? Línea horizontal: tu presupuesto.</p>
          <MesAcumulado />
        </div>
      )
    },
    {
      id: 'categorias',
      titulo: 'Gastos por categoría',
      icono: <ChartPieSlice size={18} weight="duotone" />,
      resumen: `${eur(totalCat)} · la mayor, ${gastosPorCategoria[0].nombre}`,
      contenido: (
        <div className="grid grid-cols-[1fr_260px] gap-10">
          <MedidoresLista filas={gastosPorCategoria.map((c) => ({ nombre: c.nombre, valor: c.cents }))} formato={(v) => eur(v)} />
          <div className="border-l border-line pl-8">
            <p className="t-label">Lectura rápida</p>
            <p className="mt-2 text-[length:var(--fs-body)] text-ink">
              Vivienda y alimentación suman el <b className="font-[650]">{pct((gastosPorCategoria[0].cents + gastosPorCategoria[1].cents) / totalCat)}</b> de lo que has gastado este mes.
            </p>
            <p className="t-small mt-2 text-ink-3">Netos de reembolsos. Pulsa una categoría para ver sus movimientos.</p>
            <Button className="mt-4" size="sm" variant="secondary" onClick={() => (location.hash = '#/movimientos')}>
              Ver movimientos <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )
    },
    {
      id: 'objetivos',
      titulo: 'Objetivos',
      icono: <Target size={18} weight="duotone" />,
      resumen: `${objetivos.length} activos · ${objetivos.filter((o) => o.salud === 'En riesgo').length} en riesgo`,
      contenido: (
        <ul className="grid grid-cols-3 gap-6">
          {objetivos.map((o) => {
            const v = o.actualCents / o.metaCents
            return (
              <li key={o.nombre}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[length:var(--fs-body)] font-[560]">{o.nombre}</span>
                  <span className="tnum t-small text-ink-3">{pct(v)}</span>
                </div>
                <Meter className="mt-2" value={v} tone={o.salud === 'En riesgo' ? 'warn' : 'accent'} label={`Progreso de ${o.nombre}`} />
                <p className="tnum t-small mt-2 text-ink-2">
                  {eur(o.actualCents, { sinDecimales: true })} de {eur(o.metaCents, { sinDecimales: true })} · {o.fecha}
                </p>
                <Estado className="mt-1.5" tono={o.salud === 'En riesgo' ? 'warn' : 'pos'}>
                  {o.salud}
                </Estado>
              </li>
            )
          })}
        </ul>
      )
    },
    {
      id: 'patrimonio',
      titulo: 'Evolución del patrimonio',
      icono: <ChartLineUp size={18} weight="duotone" />,
      resumen: `${eur(posicion.patrimonioCents - posicion.hace12mesesCents, { sign: true, sinDecimales: true })} en 12 meses`,
      contenido: (
        <Lineas
          datos={evolucionPatrimonio}
          claveX="mes"
          alto={220}
          series={[
            { key: 'patrimonio', nombre: 'Patrimonio neto', color: 'var(--series-1)' },
            { key: 'liquidez', nombre: 'Liquidez', color: 'var(--muted-mark)' }
          ]}
          formato={(v) => eur(v * 100, { sinDecimales: true })}
          formatoEje={(v) => (v === 0 ? '0' : `${v / 1000} mil`)}
          dominio={[0, 50000]}
          ticks={[0, 10000, 20000, 30000, 40000, 50000]}
        />
      )
    },
    {
      id: 'tasa',
      titulo: 'Tasa de ahorro',
      icono: <Pulse size={18} weight="duotone" />,
      resumen: `${pct(mes.tasaAhorro)} este mes · media de 12 meses ${Math.round(tasaAhorroSerie.reduce((a, t) => a + t.tasa, 0) / tasaAhorroSerie.length)} %`,
      contenido: (
        <div>
          <p className="t-small mb-2 text-ink-3">Flujo neto entre los ingresos de cada mes. El mes en curso, resaltado.</p>
          <Columnas datos={tasaAhorroSerie} claveX="mes" claveY="tasa" nombre="Tasa de ahorro" resaltada={11} alto={170} formato={(v) => `${v} %`} etiquetaUltima />
        </div>
      )
    },
    {
      id: 'ultimos',
      titulo: 'Últimos movimientos',
      icono: <Receipt size={18} weight="duotone" />,
      resumen: `Hoy: ${movimientos[0].concepto}, ${eur(movimientos[0].cents)}`,
      contenido: (
        <div>
          <ul className="divide-hair">
            {movimientos.slice(0, 5).map((m) => (
              <li key={m.id} className="flex items-center gap-4 py-2.5 text-[length:var(--fs-body)]">
                <span className="tnum w-14 text-ink-3">{fecha(m.fecha)}</span>
                <span className="flex-1">{m.concepto}</span>
                <span className="t-small text-ink-3">{m.categoria}</span>
                <Importe cents={m.cents} className="w-24 text-right font-[560]" />
              </li>
            ))}
          </ul>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => (location.hash = '#/movimientos')}>
            Ver todos los movimientos <ArrowRight size={14} />
          </Button>
        </div>
      )
    }
  ]

  return (
    <section className="mt-9" aria-labelledby="mas-detalle">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="mas-detalle" className="t-label flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
          <ListBullets size={15} weight="duotone" aria-hidden /> Más detalle
        </h2>
        <button type="button" className="t-small text-ink-3 hover:text-ink" onClick={() => setAbiertas(abiertas.size ? new Set() : new Set(secciones.map((s) => s.id)))}>
          {abiertas.size ? 'Plegar todo' : 'Desplegar todo'}
        </button>
      </div>
      <div className="card divide-hair !p-0">
        {secciones.map((s) => {
          const abierta = abiertas.has(s.id)
          return (
            <div key={s.id}>
              <h3>
                <button
                  type="button"
                  aria-expanded={abierta}
                  aria-controls={`sec-${s.id}`}
                  onClick={() => alternar(s.id)}
                  className="flex min-h-[var(--density-row)] w-full items-center gap-3.5 px-6 py-3.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="text-ink-2">{s.icono}</span>
                  <span className="text-[length:var(--fs-body)] font-[600]">{s.titulo}</span>
                  <span className="t-small tnum ml-auto truncate text-ink-3">{abierta ? '' : s.resumen}</span>
                  <CaretDown size={14} className={cx('shrink-0 text-ink-3 transition-transform duration-[var(--dur-base)]', abierta && 'rotate-180')} aria-hidden />
                </button>
              </h3>
              {abierta && (
                <div id={`sec-${s.id}`} role="region" aria-label={s.titulo} className="fade-in px-6 pb-6 pt-1">
                  {s.contenido}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

