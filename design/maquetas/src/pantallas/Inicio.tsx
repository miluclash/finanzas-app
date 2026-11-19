import { ArrowUpRight, Barbell, CaretRight, Flag, Info, Medal, PersonSimpleSwim, Target, Trophy, Wallet, Warning, ChartLineUp, Gauge, Bell } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { avisos, disponible, entreno, evolucionPatrimonio, mes, posicion } from '../../datos-ficticios'
import { cx, eur, n, n1, pct } from '../lib'
import { CifraEur, Delta, Estado, Meter } from '../ui/basics'
import { Columnas, Spark } from '../ui/charts'

/** Tarjeta del bento: lleva su propio data-module, así que cambian color, densidad y cifras sin tocar el código */
function Tarjeta({ modulo, hash, etiqueta, icono, className, hero, children, nombre }: { modulo: 'finanzas' | 'entreno'; hash: string; etiqueta: string; icono: ReactNode; className?: string; hero?: boolean; children: ReactNode; nombre: string }) {
  return (
    <a href={hash} data-module={modulo} aria-label={`${nombre}: abrir ${modulo === 'finanzas' ? 'Finanzas' : 'Entreno'}`} className={cx('card card-link group flex flex-col no-underline', hero && 'card-hero', className)} style={{ color: hero ? 'var(--hero-ink)' : 'var(--ink)' }}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="t-label flex items-center gap-1.5" style={{ color: hero ? 'var(--hero-ink-2)' : 'var(--ink-2)' }}>
          {icono}
          {etiqueta}
        </span>
        <ArrowUpRight size={15} className="opacity-0 transition-opacity duration-[var(--dur-base)] group-hover:opacity-70 group-focus-visible:opacity-70" aria-hidden />
      </div>
      {children}
    </a>
  )
}

export function Inicio() {
  const v = entreno.volumen
  const e = entreno.e1rm
  const hechas = entreno.semana.filter((x) => x.estado === 'hecha').length
  const ritmo = mes.diaActual / mes.diasDelMes
  const usado = mes.gastosCents / mes.presupuestoCents
  const total12 = posicion.patrimonioCents - posicion.hace12mesesCents

  return (
    <div>
      <header className="mb-6">
        <h1 className="t-title">Buenas tardes</h1>
        <p className="t-small mt-1.5 text-ink-2">Jueves, 19 de noviembre · así van tus finanzas y tu entreno hoy.</p>
      </header>

      <div className="grid grid-cols-12 gap-3.5" style={{ gridAutoRows: '156px' }}>
        <Tarjeta modulo="finanzas" hash="#/finanzas" nombre="Disponible para gastar" etiqueta="Disponible para gastar" icono={<Wallet size={15} weight="duotone" />} className="col-span-4 row-span-2">
          <div className="num-display">
            <CifraEur cents={disponible.disponibleCents} />
          </div>
          <p className="t-small mt-1.5 text-ink-2">Tras recibos pendientes ({eur(disponible.pendientesCents, { sinDecimales: true })}) y objetivos ({eur(disponible.reservadoCents, { sinDecimales: true })})</p>
          <div className="mt-auto">
            <Spark datos={disponible.serie30} formato={(x) => eur(x * 100, { sinDecimales: true })} etiquetaX={(i) => `Hace ${29 - i} días`} nombre="Disponible" alto={118} />
            <div className="mt-1 flex items-center justify-between">
              <span className="t-small text-ink-3">Últimos 30 días</span>
              <Estado tono="pos">Por encima del mínimo</Estado>
            </div>
          </div>
        </Tarjeta>

        <Tarjeta modulo="entreno" hash="#/entreno" nombre="Volumen de los últimos 7 días" hero etiqueta="Volumen · últimos 7 días" icono={<Barbell size={15} weight="fill" />} className="col-span-4 row-span-2">
          <div className="flex items-baseline gap-1.5">
            <span className="num-display" style={{ fontSize: '2.75rem' }}>
              {n(v.ultimos7Kg)}
            </span>
            <span className="text-[1.05rem] font-[700]" style={{ color: 'var(--hero-ink-2)' }}>
              kg
            </span>
          </div>
          <p className="t-small mt-1" style={{ color: 'var(--hero-ink-2)' }}>
            <b className="font-[700]" style={{ color: 'var(--hero-ink)' }}>
              +5,9 %
            </b>{' '}
            vs 7 días anteriores
          </p>
          <div className="mt-auto">
            <Columnas datos={v.semanas} claveX="s" claveY="kg" nombre="Volumen" resaltada={7} colorResaltada="var(--hero-mark)" colorResto="var(--hero-mark-dim)" alto={112} claseGrafico="hero-chart" formato={(x) => `${n(x)} kg`} />
          </div>
        </Tarjeta>

        <Tarjeta modulo="entreno" hash="#/entreno" nombre="Cuenta atrás a HYROX" etiqueta="HYROX Open Madrid" icono={<Flag size={15} weight="duotone" />} className="col-span-4">
          <div className="flex items-baseline gap-2">
            <span className="num-display">{entreno.hyrox.dias}</span>
            <span className="text-[1.1rem] font-[600] text-ink-3">días</span>
            <span className="t-small ml-auto text-ink-2">20/03/2027</span>
          </div>
          <Meter className="mt-auto" value={49 / 170} label="Preparación transcurrida" />
          <p className="t-small mt-2 text-ink-3">Bloque {entreno.hyrox.bloque.toLowerCase()} · semana {entreno.hyrox.semanaBloque}</p>
        </Tarjeta>

        <Tarjeta modulo="entreno" hash="#/entreno" nombre="Sesiones de la semana" etiqueta="Sesiones de la semana" icono={<PersonSimpleSwim size={15} weight="duotone" />} className="col-span-4">
          <div className="flex items-baseline gap-2">
            <span className="num-display">{hechas}</span>
            <span className="text-[1.1rem] font-[600] text-ink-3">de 6</span>
            <ol className="ml-auto flex gap-1" aria-hidden>
              {entreno.semana.map((x) => (
                <li key={x.dia} className={cx('size-3.5 rounded-full border', x.estado === 'hecha' ? 'border-transparent' : x.estado === 'hoy' ? 'border-accent-mark' : 'border-control')} style={x.estado === 'hecha' ? { background: 'var(--accent-mark)' } : undefined} />
              ))}
            </ol>
          </div>
          <div className="mt-auto">
            <Estado tono="pos">En ritmo</Estado>
            <p className="t-small mt-1 text-ink-3">2 de gimnasio y 1 de natación hechas</p>
          </div>
        </Tarjeta>

        <Tarjeta modulo="finanzas" hash="#/finanzas" nombre="Patrimonio neto" etiqueta="Patrimonio neto" icono={<ChartLineUp size={15} weight="duotone" />} className="col-span-4">
          <div className="num-display">
            <CifraEur cents={posicion.patrimonioCents} />
          </div>
          <Delta className="mt-1.5" valor={eur(total12, { sign: true, sinDecimales: true })} contexto="en 12 meses" dir="up" bueno />
          <div className="mt-auto -mb-2">
            <Spark datos={evolucionPatrimonio.map((d) => d.patrimonio)} formato={(x) => eur(x * 100, { sinDecimales: true })} etiquetaX={(i) => evolucionPatrimonio[i].mes} nombre="Patrimonio" alto={40} area={false} />
          </div>
        </Tarjeta>

        <Tarjeta modulo="finanzas" hash="#/finanzas" nombre="Gastos de noviembre" etiqueta="Gastos de noviembre" icono={<Gauge size={15} weight="duotone" />} className="col-span-4">
          <div className="num-display">
            <CifraEur cents={mes.gastosCents} />
          </div>
          <Meter className="mt-auto" value={usado} tone="warn" marker={ritmo} label="Presupuesto consumido" />
          <p className="t-small mt-2 text-ink-3">
            {pct(usado)} del presupuesto · el mes va por el {pct(ritmo)}
          </p>
        </Tarjeta>

        <Tarjeta modulo="entreno" hash="#/entreno" nombre="Objetivo de press banca" etiqueta="Press banca · meta 100 kg" icono={<Target size={15} weight="duotone" />} className="col-span-4">
          <div className="flex items-baseline gap-1.5">
            <span className="num-display">{n1(e.actualKg)}</span>
            <span className="text-[1.1rem] font-[600] text-ink-3">kg e1RM</span>
          </div>
          <Meter className="mt-auto" value={(e.actualKg - 88) / (e.metaKg - 88)} label="Progreso hacia la meta de e1RM" />
          <div className="mt-2">
            <Estado tono="pos">Llegas: {n1(e.proyeccionKg)} kg proyectados</Estado>
          </div>
        </Tarjeta>

        <Tarjeta modulo="finanzas" hash="#/finanzas" nombre="Avisos" etiqueta="Avisos" icono={<Bell size={15} weight="duotone" />} className="col-span-6">
          <ul className="flex flex-col gap-2">
            {avisos.map((a, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[length:var(--fs-small)]">
                {a.nivel === 'warn' ? <Warning size={17} weight="fill" className="shrink-0 text-warn" aria-hidden /> : <Info size={17} weight="fill" className="shrink-0 text-ink-2" aria-hidden />}
                <span className="truncate">{a.texto}</span>
                <CaretRight size={12} className="ml-auto shrink-0 text-ink-3" aria-hidden />
              </li>
            ))}
          </ul>
        </Tarjeta>

        <Tarjeta modulo="entreno" hash="#/entreno" nombre="Último récord" etiqueta="Récords recientes" icono={<Medal size={15} weight="duotone" />} className="col-span-6">
          <ul className="flex flex-col gap-1.5">
            {entreno.records.map((r) => (
              <li key={r.ejercicio} className="flex items-center gap-2.5 text-[length:var(--fs-small)]">
                <Trophy size={16} weight="fill" className="shrink-0 text-accent-text" aria-hidden />
                <span className="font-[600]">{r.ejercicio}</span>
                <span className="tnum text-ink-2">{r.marca}</span>
                <span className="tnum ml-auto font-[650] text-pos">{r.mejora}</span>
                <span className="w-12 text-right text-ink-3">{r.fecha}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  )
}
