import { ArrowUp, Barbell, DownloadSimple, Calendar, Check, Flag, Lightning, Medal, PersonSimpleSwim, Target, Timer, Trophy } from '@phosphor-icons/react'
import { useState } from 'react'
import { entreno } from '../../datos-ficticios'
import { cx, n, n1, n2, pct } from '../lib'
import { Button, CardHead, Chip, Estado, Meter, PageHeader, Segmented } from '../ui/basics'
import { Columnas, Lineas, MapaConstancia, MedidoresLista } from '../ui/charts'

const semanaDe = (i: number) => `S${((34 + i) % 52) + 1}`

export function Entreno() {
  const [rango, setRango] = useState<'semana' | 'mes' | 'bloque'>('semana')
  const v = entreno.volumen
  const e = entreno.e1rm
  const s2 = entreno.segundoObjetivo
  const hechas = entreno.semana.filter((x) => x.estado === 'hecha').length
  const gym = entreno.semana.filter((x) => x.tipo === 'gimnasio')
  const nat = entreno.semana.filter((x) => x.tipo === 'natacion')
  const variacion = (v.ultimos7Kg - v.anteriores7Kg) / v.anteriores7Kg

  // e1RM real y proyección sobre un mismo eje de semanas
  const datosE1rm = Array.from({ length: 22 }, (_, i) => {
    const w = i + 1
    const real = e.serie[i]?.kg ?? null
    const proy = w >= 12 ? Math.round((e.actualKg + ((e.proyeccionKg - e.actualKg) / 10) * (w - 12)) * 10) / 10 : null
    return { semana: semanaDe(w), kg: real, proy }
  })
  const bajos = entreno.seriesPorGrupo.filter((g) => g.series < entreno.objetivoMin).length

  return (
    <div data-module="entreno">
      <PageHeader
        titulo="Resumen"
        texto="Semana 47 · del 16 al 22 de noviembre"
        acciones={
          <>
            <Segmented label="Periodo" value={rango} onChange={setRango} opciones={[{ id: 'semana', texto: 'Semana' }, { id: 'mes', texto: 'Mes' }, { id: 'bloque', texto: 'Bloque' }]} />
            <Button variant="primary" icon={<DownloadSimple size={16} weight="bold" />}>
              Importar de Hevy
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-12 gap-[var(--density-gap)]">
        {/* Volumen: tarjeta marcador */}
        <section className="card card-hero col-span-4 flex flex-col" aria-label="Volumen de los últimos 7 días">
          <div className="t-label flex items-center gap-1.5" style={{ color: 'var(--hero-ink-2)' }}>
            <Barbell size={15} weight="fill" aria-hidden /> Volumen · últimos 7 días
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="num-display" style={{ fontSize: '3rem' }}>
              {n(v.ultimos7Kg)}
            </span>
            <span className="text-[1.1rem] font-[700]" style={{ color: 'var(--hero-ink-2)' }}>
              kg
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[length:var(--fs-small)]">
            <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-[700] tnum" style={{ background: 'var(--hero-ink)', color: 'var(--hero-bg)' }}>
              <ArrowUp size={12} weight="bold" aria-hidden />
              {n1(variacion * 100)} %
            </span>
            <span style={{ color: 'var(--hero-ink-2)' }}>vs 7 días anteriores ({n(v.anteriores7Kg)} kg)</span>
          </div>
          <div className="mt-auto pt-4">
            <Columnas
              datos={v.semanas}
              claveX="s"
              claveY="kg"
              nombre="Volumen"
              resaltada={7}
              colorResaltada="var(--hero-mark)"
              colorResto="var(--hero-mark-dim)"
              alto={104}
              claseGrafico="hero-chart"
              formato={(x) => `${n(x)} kg`}
            />
            <p className="mt-1 text-[11px] font-[500]" style={{ color: 'var(--hero-ink-2)' }}>
              S43 fue de descarga
            </p>
          </div>
        </section>

        {/* Adherencia */}
        <section className="card col-span-4 flex flex-col" aria-label="Sesiones de la semana">
          <CardHead titulo="Sesiones de la semana" icono={<Calendar size={15} weight="duotone" />} accion={<Chip>4 sem. · 92 %</Chip>} />
          <div className="flex items-baseline gap-2">
            <span className="num-display">{hechas}</span>
            <span className="text-[1.25rem] font-[600] text-ink-3">de {entreno.semana.length}</span>
            <span className="t-small ml-auto text-ink-2">
              Gimnasio {gym.filter((x) => x.estado === 'hecha').length}/{gym.length} · Natación {nat.filter((x) => x.estado === 'hecha').length}/{nat.length}
            </span>
          </div>
          <ol className="mt-4 grid grid-cols-6 gap-1.5" aria-label="Sesiones previstas">
            {entreno.semana.map((x) => {
              const Ico = x.tipo === 'gimnasio' ? Barbell : PersonSimpleSwim
              const hecha = x.estado === 'hecha'
              const hoy = x.estado === 'hoy'
              return (
                <li
                  key={x.dia}
                  className={cx('flex h-[76px] flex-col items-center justify-between rounded-[var(--radius-md)] border py-2 text-center', hecha ? 'border-transparent' : hoy ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface-2')}
                  style={hecha ? { background: 'var(--accent)', color: 'var(--on-accent)' } : undefined}
                  aria-label={`${x.nombre}, ${hecha ? 'hecha' : hoy ? 'hoy' : 'prevista'}`}
                >
                  <span className="text-[11px] font-[700] opacity-80">{x.dia}</span>
                  <Ico size={22} weight={hecha || hoy ? 'fill' : 'regular'} className={hoy ? 'text-accent-text' : hecha ? '' : 'text-ink-3'} aria-hidden />
                  {hecha ? <Check size={13} weight="bold" aria-hidden /> : <span className={cx('text-[10px] font-[650]', hoy ? 'text-accent-text' : 'text-ink-3')}>{hoy ? 'HOY' : '—'}</span>}
                </li>
              )
            })}
          </ol>
          <div className="mt-auto pt-3">
            <Estado tono="pos">En ritmo: te quedan 3 sesiones en 3 días</Estado>
          </div>
        </section>

        {/* Cuenta atrás */}
        <section className="card col-span-4 flex flex-col" aria-label="Cuenta atrás a HYROX">
          <CardHead titulo={`${entreno.hyrox.nombre} · ${entreno.hyrox.fecha}`} icono={<Flag size={15} weight="duotone" />} />
          <div className="flex items-baseline gap-2">
            <span className="num-display">{entreno.hyrox.dias}</span>
            <span className="text-[1.25rem] font-[600] text-ink-3">días</span>
            <span className="t-small ml-auto text-ink-2">{entreno.hyrox.semanas} semanas</span>
          </div>
          <div className="mt-4">
            <Meter value={49 / 170} label="Preparación transcurrida" />
            <div className="t-small mt-2 flex justify-between text-ink-3">
              <span>Inicio 1 oct.</span>
              <span>29 % hecho</span>
              <span>20 mar.</span>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <p className="t-small text-ink-2">
              Hasta entonces, <b className="font-[700] text-ink">102 sesiones</b> previstas.
            </p>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3" aria-label="Fases de la preparación">
            <Chip tono="accent" icon={<Lightning size={13} weight="fill" />}>
              {entreno.hyrox.bloque} · sem. 4/8
            </Chip>
            <Chip>Específico</Chip>
            <Chip>Afinado</Chip>
          </div>
        </section>

        {/* Series efectivas por grupo muscular */}
        <section className="card col-span-5 flex flex-col" aria-label="Series efectivas por grupo muscular">
          <CardHead titulo="Series efectivas por grupo" icono={<Target size={15} weight="duotone" />} accion={<span className="t-small text-ink-3">esta semana</span>} />
          <MedidoresLista
            filas={entreno.seriesPorGrupo.map((g) => ({ nombre: g.grupo, valor: g.series }))}
            formato={(x) => `${x} series`}
            maximo={entreno.objetivoMax}
            marcador={entreno.objetivoMin}
            etiquetaMarcador={`mín. ${entreno.objetivoMin}`}
            aviso={(x) => x < entreno.objetivoMin}
          />
          <div className="mt-auto pt-3">
            <Estado tono="warn">{bajos} grupos por debajo del mínimo: hombros, brazos y core</Estado>
          </div>
        </section>

        {/* Objetivo de e1RM con proyección */}
        <section className="card col-span-7 flex flex-col" aria-label="Objetivo de fuerza">
          <CardHead titulo={`Objetivo · ${e.ejercicio} ${e.metaKg} kg (e1RM)`} icono={<Trophy size={15} weight="duotone" />} accion={<Chip>Antes del {e.fechaMeta}</Chip>} />
          <div className="grid grid-cols-[190px_1fr] gap-5">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="num-display">{n1(e.actualKg)}</span>
                <span className="text-[1.1rem] font-[600] text-ink-3">kg</span>
              </div>
              <p className="t-small mt-1 text-ink-2">e1RM actual · faltan {n1(e.metaKg - e.actualKg)} kg</p>
              <Estado className="mt-3" tono="pos">
                Llegas al ritmo actual
              </Estado>
              <p className="t-small mt-1 text-ink-3">
                +{n2(e.ritmoKgSemana)} kg/sem → {n1(e.proyeccionKg)} kg el {e.fechaMeta.slice(0, 6)}
              </p>
              <div className="mt-auto border-t border-line pt-3">
                <div className="t-small flex items-center justify-between">
                  <span className="font-[600] text-ink">{s2.ejercicio}</span>
                  <span className="tnum text-ink-3">
                    {n1(s2.actualKg)} / {s2.metaKg} kg
                  </span>
                </div>
                <Meter className="mt-1.5" value={s2.actualKg / s2.metaKg} tone="warn" label="Progreso de la sentadilla" />
                <Estado className="mt-2" tono="warn">
                  No llegas: {n1(s2.proyeccionKg)} kg
                </Estado>
                <p className="t-small mt-0.5 text-ink-3">Harían falta +{n2(s2.necesitaKgSemana)} kg/sem</p>
              </div>
            </div>
            <Lineas
              datos={datosE1rm}
              claveX="semana"
              alto={196}
              series={[
                { key: 'kg', nombre: 'e1RM real', color: 'var(--series-1)' },
                { key: 'proy', nombre: 'Proyección al ritmo actual', color: 'var(--series-1)', dash: '5 5' }
              ]}
              formato={(x) => `${n1(x)} kg`}
              etiquetaFinal={false}
              referencia={{ y: e.metaKg, texto: `Meta ${e.metaKg} kg` }}
              dominio={[86, 106]}
              ticks={[90, 95, 100, 105]}
              formatoEje={(x) => `${x}`}
            />
          </div>
        </section>

        {/* Récords */}
        <section className="card col-span-4 flex flex-col" aria-label="Récords recientes">
          <CardHead titulo="Récords recientes" icono={<Medal size={15} weight="duotone" />} accion={<Chip tono="accent">3 en 10 días</Chip>} />
          <ul className="divide-hair flex flex-1 flex-col">
            {entreno.records.map((r) => (
              <li key={r.ejercicio} className="flex flex-1 items-center gap-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-text">
                  <Trophy size={19} weight="fill" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[length:var(--fs-body)] font-[600]">{r.ejercicio}</div>
                  <div className="t-small text-ink-3">
                    {r.fecha} · {r.tipo}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum text-[length:var(--fs-body)] font-[700]">{r.marca}</div>
                  <span className="t-small tnum font-[650] text-pos">{r.mejora}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Últimas sesiones */}
        <section className="card col-span-5" aria-label="Últimas sesiones">
          <CardHead titulo="Últimas sesiones" icono={<Timer size={15} weight="duotone" />} accion={<a href="#/entreno/sesiones" className="t-small text-accent-text hover:underline">Ver todas</a>} />
          <ul className="divide-hair">
            {entreno.sesiones.map((s) => {
              const Ico = s.tipo === 'gimnasio' ? Barbell : PersonSimpleSwim
              return (
                <li key={s.fecha} className="flex min-h-[var(--density-row)] items-center gap-3 py-1.5 first:pt-0 last:pb-0">
                  <Ico size={18} weight="duotone" className="shrink-0 text-accent-text" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--fs-body)] font-[600]">{s.nombre}</span>
                    <span className="t-small text-ink-3">
                      {s.fecha} · {s.dur}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="tnum block text-[length:var(--fs-body)] font-[700]">{s.dato}</span>
                    <span className="t-small tnum text-ink-3">{s.extra}</span>
                  </span>
                  <span className="w-[42px] text-right">{s.pr && <Chip tono="accent" className="!px-1.5">PR</Chip>}</span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Constancia */}
        <section className="card col-span-3 flex flex-col" aria-label="Constancia">
          <CardHead titulo="Constancia" icono={<Lightning size={15} weight="duotone" />} />
          <MapaConstancia datos={entreno.constancia} />
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-3" aria-hidden>
            Menos
            {['var(--track)', 'var(--seq-2)', 'var(--seq-4)', 'var(--seq-5)'].map((c) => (
              <span key={c} className="size-3 rounded-[3px]" style={{ background: c }} />
            ))}
            Más
          </div>
          <p className="t-small mt-auto pt-3 text-ink-2">
            <b className="font-[700] text-ink">{pct(0.92)}</b> de adherencia en 12 semanas
          </p>
        </section>
      </div>
    </div>
  )
}

