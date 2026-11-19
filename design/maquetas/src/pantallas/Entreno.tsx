import { ArrowUp, Barbell, CalendarCheck, Flag, Lightning, Medal, PersonSimpleSwim, Target, Timer, Trophy, UploadSimple } from '@phosphor-icons/react'
import { useState } from 'react'
import { entreno } from '../../datos-ficticios'
import { n, n1, n2, pct } from '../lib'
import { Button, SegmentedControl } from '../ui/controls'
import { StatusBadge, Tag } from '../ui/feedback'
import { Card, CifraUnidad, PageHeader } from '../ui/layout'
import { BarraSegmentada, ChartFrame, Columnas, leyendaDe, Lineas, LeyendaMapa, MapaConstancia, MedidoresLista, ProgressBar, type Referencia, type SerieLinea } from '../ui/charts'
import { LeyendaSemana, WeekSessionCell, type EstadoSesion } from '../ui/session'

const semanaDe = (i: number) => `S${((34 + i) % 52) + 1}`
const ESTADO_SEMANA: Record<string, EstadoSesion> = { hecha: 'hecha', hoy: 'hoy', prevista: 'planificada', descanso: 'descanso' }

export function Entreno() {
  const [rango, setRango] = useState<'semana' | 'mes' | 'bloque'>('semana')
  const v = entreno.volumen
  const e = entreno.e1rm
  const s2 = entreno.segundoObjetivo
  const sesiones = entreno.semana.filter((x) => x.tipo !== 'descanso')
  const hechas = sesiones.filter((x) => x.estado === 'hecha').length
  const gym = sesiones.filter((x) => x.tipo === 'gimnasio')
  const nat = sesiones.filter((x) => x.tipo === 'natacion')
  const variacion = (v.ultimos7Kg - v.anteriores7Kg) / v.anteriores7Kg
  const ses = entreno.proximaSesion

  const datosE1rm = Array.from({ length: 22 }, (_, i) => {
    const w = i + 1
    const real = e.serie[i]?.kg ?? null
    const proy = w >= 12 ? Math.round((e.actualKg + ((e.proyeccionKg - e.actualKg) / 10) * (w - 12)) * 10) / 10 : null
    return { semana: semanaDe(w), kg: real, proy }
  })
  const SERIES: SerieLinea[] = [
    { key: 'kg', nombre: 'Observado (e1RM semanal)', color: 'var(--series-1)', patron: 'solida' },
    { key: 'proy', nombre: 'Proyección', color: 'var(--series-1)', patron: 'discontinua', marcadorFinal: 'hueco' }
  ]
  const REF: Referencia[] = [{ y: e.metaKg, texto: `Objetivo ${e.metaKg} kg`, patron: 'punteada' }]
  const estadoGrupo = (x: number) => (x < entreno.objetivoMin ? { tono: 'warning' as const, texto: 'Bajo' } : x <= entreno.objetivoMax ? { tono: 'success' as const, texto: 'Dentro' } : { tono: 'info' as const, texto: 'Por encima' })

  return (
    <div data-module="entreno">
      <PageHeader
        titulo="Resumen"
        texto="Semana 47 · del 16 al 22 de noviembre de 2026"
        acciones={
          <>
            <SegmentedControl label="Periodo" value={rango} onChange={setRango} opciones={[{ id: 'semana', texto: 'Semana' }, { id: 'mes', texto: 'Mes' }, { id: 'bloque', texto: 'Bloque' }]} />
            <Button variant="primary" icon={<UploadSimple size={16} weight="bold" />}>
              Importar de Hevy
            </Button>
          </>
        }
      />

      <div className="page-grid">
        {/* 1. Semana: cumplimiento y próxima sesión */}
        <Card titulo="Semana" subtitulo="Cumplimiento" icono={<CalendarCheck size={20} weight="duotone" aria-hidden />} accion={<Tag>Últimas 4 semanas: 92 %</Tag>} className="col-span-12 flex flex-col @4xl:col-span-8">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div className="t-kpi">
              <CifraUnidad valor={`${hechas} de ${sesiones.length}`} unidad="sesiones hechas" />
            </div>
            <p className="t-label">
              Gimnasio {gym.filter((x) => x.estado === 'hecha').length} de {gym.length} · Natación {nat.filter((x) => x.estado === 'hecha').length} de {nat.length}
            </p>
          </div>
          <ol className="mt-4 grid grid-cols-4 gap-2 @3xl:grid-cols-7" aria-label="Semana del 16 al 22 de noviembre">
            {entreno.semana.map((x) => (
              <WeekSessionCell key={x.dia} dia={x.dia} tipo={x.tipo} estado={ESTADO_SEMANA[x.estado]} nombre={x.nombre} />
            ))}
          </ol>
          <div className="mt-4">
            <LeyendaSemana />
          </div>
        </Card>
        <Card titulo="Próxima sesión" icono={<Timer size={20} weight="duotone" aria-hidden />} className="col-span-12 flex flex-col @4xl:col-span-4">
          <div className="t-kpi">{ses.nombre}</div>
          <p className="t-label mt-2">
            {ses.cuando}, {ses.hora}
          </p>
          <p className="t-meta mt-1">{ses.detalle}</p>
          <div className="mt-auto pt-4">
            <Button variant="secondary" className="w-full">
              Ver la sesión
            </Button>
          </div>
        </Card>

        {/* 2. Volumen y tendencia (la única tarjeta intensa) */}
        <Card hero titulo="Volumen semanal" subtitulo="kg de volumen de entrenamiento" icono={<Barbell size={20} weight="fill" aria-hidden />} className="col-span-12 flex flex-col @4xl:col-span-7">
          <div className="t-kpi-hero">
            <CifraUnidad valor={n(v.ultimos7Kg)} unidad="kg" />
          </div>
          <p className="t-label mt-2 flex flex-wrap items-center gap-2" style={{ color: 'var(--hero-ink-2)' }}>
            <span className="inline-flex items-center gap-1 r-full px-2 font-semibold" style={{ background: 'var(--hero-ink)', color: 'var(--hero-bg)' }}>
              <ArrowUp size={14} weight="bold" aria-hidden />
              {n1(variacion * 100)} %
            </span>
            sobre los 7 días anteriores ({n(v.anteriores7Kg)} kg)
          </p>
          <div className="mt-4">
            <ChartFrame
              hero
              titulo="Volumen semanal"
              periodo="Últimas 8 semanas, S40 a S47"
              unidad="kg de volumen de entrenamiento (peso × repeticiones)"
              referencia="S43 fue una semana de descarga (barra con trama). La barra de la semana actual, resaltada."
              tabla={{ columnas: ['Semana', 'Volumen (kg)'], filas: v.semanas.map((s) => [s.s, n(s.kg)]) }}
            >
              <Columnas datos={v.semanas} claveX="s" claveY="kg" nombre="Volumen semanal" resaltada={7} anotada={{ i: 3, texto: 'Descarga' }} colorResaltada="var(--hero-mark)" colorResto="var(--hero-mark-dim)" claseGrafico="hero-chart" formato={(x) => `${n(x)} kg`} />
            </ChartFrame>
          </div>
        </Card>
        <Card titulo="Series por grupo" subtitulo="esta semana" icono={<Target size={20} weight="duotone" aria-hidden />} className="col-span-12 flex flex-col @4xl:col-span-5">
          <ChartFrame titulo="Series efectivas por grupo muscular" periodo="Semana 47, hasta hoy" unidad="series efectivas" referencia={`Rango de referencia: entre ${entreno.objetivoMin} y ${entreno.objetivoMax} series por grupo y semana.`}>
            <MedidoresLista filas={entreno.seriesPorGrupo.map((g) => ({ nombre: g.grupo, valor: g.series }))} formato={(x) => `${x}`} maximo={entreno.objetivoMax} rango={{ min: entreno.objetivoMin, max: entreno.objetivoMax, etiqueta: 'rango' }} estado={estadoGrupo} />
          </ChartFrame>
        </Card>

        {/* 3. HYROX y objetivos */}
        <Card titulo="HYROX" subtitulo="Open Madrid · 20/03/2027" icono={<Flag size={20} weight="duotone" aria-hidden />} className="col-span-12 flex flex-col @4xl:col-span-4">
          <div className="t-kpi">
            <CifraUnidad valor={String(entreno.hyrox.dias)} unidad="días" />
          </div>
          <p className="t-label mt-2">Quedan {entreno.hyrox.semanas} semanas</p>
          <div className="mt-4">
            <ProgressBar value={49 / 170} label="Tiempo transcurrido del bloque de preparación" valueText="49 de 170 días, el 29 %" />
            <p className="t-meta mt-2">Tiempo transcurrido del bloque: 49 de 170 días ({pct(49 / 170)}), desde el 1 de octubre.</p>
          </div>
          <div className="mt-6">
            <p className="t-label mb-2">Fases del bloque, en semanas</p>
            <BarraSegmentada etiqueta="Fases del bloque de preparación" partes={[{ nombre: 'Fuerza base', valor: 8, color: 'var(--accent-mark)' }, { nombre: 'Específico', valor: 10, color: 'var(--muted-mark)' }, { nombre: 'Afinado', valor: 6, color: 'var(--track)' }]} />
            <ul className="t-meta mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <li>Fuerza base: 1 a 8 (actual)</li>
              <li>Específico: 9 a 18</li>
              <li>Afinado: 19 a 24</li>
            </ul>
          </div>
          <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
            <p className="t-label">
              Fase actual: <b className="font-semibold text-ink">{entreno.hyrox.bloque}</b>, semana {entreno.hyrox.semanaBloque}
            </p>
            <p className="t-meta">Hasta entonces, 102 sesiones previstas.</p>
          </div>
        </Card>
        <Card titulo="Objetivos" subtitulo="Fuerza, e1RM" icono={<Trophy size={20} weight="duotone" aria-hidden />} className="col-span-12 flex flex-col @4xl:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="t-label">
                {e.ejercicio}: objetivo {e.metaKg} kg antes del {e.fechaMeta}
              </div>
              <div className="t-kpi mt-1">
                <CifraUnidad valor={n1(e.actualKg)} unidad="kg e1RM observado" />
              </div>
            </div>
            <div className="flex flex-col items-start gap-1 @3xl:items-end">
              <p className="t-label tnum">
                Proyección: <b className="font-semibold text-ink">{n1(e.proyeccionKg)} kg</b> el {e.fechaMeta.slice(0, 6)}
              </p>
              <StatusBadge tono="success">Proyección por encima del objetivo</StatusBadge>
            </div>
          </div>
          <div className="mt-4">
            <ChartFrame
              titulo={`${e.ejercicio}: e1RM semanal`}
              periodo="S36 a S47 observadas; proyección hasta S5"
              unidad="kg (1RM estimado)"
              referencia={`Proyección al ritmo actual de +${n2(e.ritmoKgSemana)} kg por semana. Es una estimación, no una promesa.`}
              leyenda={leyendaDe(SERIES, REF)}
              tabla={{ columnas: ['Semana', 'Observado (kg)'], filas: e.serie.map((s, i) => [semanaDe(i + 1), n1(s.kg)]) }}
            >
              <Lineas datos={datosE1rm} claveX="semana" series={SERIES} referencias={REF} formato={(x) => `${n1(x)} kg`} etiquetaFinal={false} dominio={[86, 106]} ticks={[90, 95, 100, 105]} />
            </ChartFrame>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="t-label">
                {s2.ejercicio}: objetivo {s2.metaKg} kg antes del {s2.fechaMeta}
              </span>
              <span className="t-label tnum">
                Observado {n1(s2.actualKg)} kg · Proyección: {n1(s2.proyeccionKg)} kg el 31 ene
              </span>
            </div>
            <ProgressBar className="mt-2" tone="warning" value={s2.actualKg / s2.metaKg} label="Observado frente al objetivo de sentadilla" valueText={`${n1(s2.actualKg)} de ${s2.metaKg} kg`} />
            <div className="mt-2">
              <StatusBadge tono="warning">Proyección por debajo del objetivo: faltarían {n1(s2.metaKg - s2.proyeccionKg)} kg</StatusBadge>
            </div>
          </div>
        </Card>

        {/* 4. Récords, últimas sesiones y constancia */}
        <Card titulo="Récords" subtitulo="últimos 10 días" icono={<Medal size={20} weight="duotone" aria-hidden />} className="col-span-12 @3xl:col-span-6 @5xl:col-span-4">
          <ul className="divide-line">
            {entreno.records.map((r) => (
              <li key={r.ejercicio} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid size-10 shrink-0 place-items-center r-control bg-accent-soft text-accent-text">
                  <Trophy size={20} weight="fill" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="t-body truncate font-semibold">{r.ejercicio}</div>
                  <div className="t-meta">
                    {r.fecha} · {r.tipo}
                  </div>
                </div>
                <div className="text-right">
                  <div className="t-body tnum font-semibold">{r.marca}</div>
                  <div className="t-meta tnum">{r.mejora}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card titulo="Últimas sesiones" icono={<Lightning size={20} weight="duotone" aria-hidden />} accion={<a href="#/entreno/sesiones" className="btn btn-ghost btn-sm">Ver todas</a>} className="col-span-12 @3xl:col-span-6 @5xl:col-span-4">
          <ul className="divide-line">
            {entreno.sesiones.map((s) => {
              const Ico = s.tipo === 'gimnasio' ? Barbell : PersonSimpleSwim
              return (
                <li key={s.fecha} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0" style={{ minHeight: 'var(--row-h)' }}>
                  <Ico size={20} weight="duotone" className="shrink-0 text-accent-text" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="t-body block truncate font-semibold">{s.nombre}</span>
                    <span className="t-meta">
                      {s.fecha} · {s.dur}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="t-body tnum block font-semibold">{s.dato}</span>
                    <span className="t-meta tnum">{s.extra}</span>
                  </span>
                  {s.pr && <Tag tono="accent">Récord</Tag>}
                </li>
              )
            })}
          </ul>
        </Card>
        <Card titulo="Constancia" subtitulo="12 semanas" icono={<CalendarCheck size={20} weight="duotone" aria-hidden />} className="col-span-12 flex flex-col @5xl:col-span-4">
          <MapaConstancia datos={entreno.constancia} inicio={entreno.constanciaInicio} />
          <div className="mt-4">
            <LeyendaMapa />
          </div>
          <p className="t-label mt-auto pt-4">
            <b className="font-semibold text-ink">{pct(0.92)}</b> de las sesiones previstas, de septiembre a noviembre.
          </p>
        </Card>
      </div>
    </div>
  )
}
