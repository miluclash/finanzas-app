import { CalendarBlank, Clock, MagnifyingGlass, Wallet } from '@phosphor-icons/react'
import { useState } from 'react'
import { movimientos, type Movimiento } from '../../datos-ficticios'
import { AssistantPanel } from '../shell/AssistantPanel'
import { leerRuta } from '../shell/nav'
import { Sidebar } from '../shell/Sidebar'
import { Topbar } from '../shell/Topbar'
import { eur, fecha } from '../lib'
import { Button, SegmentedControl, Select, TextField } from '../ui/controls'
import { StatusBadge } from '../ui/feedback'
import { Accordion, Card, CifraEur, CifraUnidad, DataTable, FilterBar, Importe, KpiCard, PageHeader, type Columna } from '../ui/layout'
import { LeyendaSemana, WeekSessionCell } from '../ui/session'
import { Bloque, Etiqueta, Ficha } from './ficha'

const ruta = leerRuta('#/finanzas')
const MUESTRA = movimientos.slice(0, 4)
const COLS: Columna<Movimiento>[] = [
  { id: 'f', cabecera: 'Fecha', ancho: '6rem', celda: (m) => <span className="tnum text-ink-2">{fecha(m.fecha)}</span> },
  { id: 'c', cabecera: 'Concepto', celda: (m) => <span className="font-medium">{m.concepto}</span> },
  { id: 'i', cabecera: 'Importe', alinear: 'right', ancho: '8rem', celda: (m) => <Importe cents={m.cents} /> }
]

export function Estructura() {
  const [densidad, setDensidad] = useState<'compact' | 'normal' | 'comfortable'>('normal')
  const [abierta, setAbierta] = useState<string | null>('m1')
  const [filtro, setFiltro] = useState(true)
  const [pastillas, setPastillas] = useState([{ id: 'a', texto: 'Cuenta: Tarjeta' }, { id: 'b', texto: 'Tipo: gastos' }])
  const [acc, setAcc] = useState<Set<string>>(new Set(['a']))
  const [plegada, setPlegada] = useState(false)

  return (
    <>
      <Bloque id="shell" titulo="Shell y navegación" texto="Barra lateral con los módulos, topbar con migas, búsqueda y asistente, y un contenido con ancho máximo cuyas columnas bajan de fila cuando falta sitio.">
        <Ficha
          nombre="AppShell"
          id="appshell"
          uso="Marco de toda la app: Sidebar a la izquierda, Topbar y contenido en el centro, AssistantPanel a la derecha (opcional). El contenido tiene ancho máximo (1.200 px) y una cuadrícula que se reorganiza según el ancho de su contenedor, no el de la ventana."
          teclado="Tab empieza por «Saltar al contenido»; después la barra lateral, la topbar y el contenido. Ctrl K abre el buscador, Ctrl B pliega la barra, N abre «Nuevo movimiento» en Finanzas."
          bien={{ nodo: <p className="t-label">En 1.024 px la barra se pliega sola y las tarjetas pasan de tres columnas a dos.</p>, texto: 'Reflow real: las columnas bajan de fila.' }}
          mal={{ nodo: <p className="t-label">Tres KPIs aplastados en 140 px cada uno con la cifra partida.</p>, texto: 'Nunca aplastar: si no caben, bajan.' }}
        >
          <div className="cols-diagram h-40 gap-2 r-card border border-line bg-canvas p-2" aria-hidden>
            <div className="r-control bg-sidebar" />
            <div className="flex flex-col gap-2">
              <div className="h-4 r-control bg-raised" />
              <div className="grid flex-1 grid-cols-3 gap-2">
                <div className="r-control bg-card" />
                <div className="r-control bg-card" />
                <div className="r-control bg-card" />
              </div>
            </div>
            <div className="r-control bg-sidebar" />
          </div>
          <p className="t-meta mt-2">Esquema: barra lateral, topbar y contenido, panel del asistente.</p>
        </Ficha>

        <Ficha
          nombre="Sidebar"
          id="sidebar"
          uso="Navegación entre módulos y secciones. Expandida muestra texto; plegada, solo iconos con tooltip. El elemento activo se marca por fondo e indicador, no solo por color."
          teclado="Tab recorre los enlaces; Intro abre; el botón de los módulos despliega o pliega su grupo; Ctrl B pliega toda la barra."
          bien={{ nodo: <p className="t-label">Plegada: cada icono con tooltip y «Nuevo movimiento» a mano.</p>, texto: 'Todo sigue siendo alcanzable.' }}
          mal={{ nodo: <p className="t-label">Plegada con iconos sin nombre ni tooltip.</p>, texto: 'Nadie sabe qué es cada icono.' }}
        >
          <div className="flex flex-wrap items-start gap-6">
            <div className="h-96 overflow-hidden r-card border border-line" data-module="finanzas">
              <Sidebar ruta={ruta} plegada={false} abierto={{ finanzas: true, entreno: false }} setAbierto={() => {}} onPlegar={() => {}} onNuevo={() => {}} />
            </div>
            <div className="h-96 overflow-hidden r-card border border-line" data-module="finanzas">
              <Sidebar ruta={ruta} plegada abierto={{ finanzas: true }} setAbierto={() => {}} onPlegar={() => {}} onNuevo={() => {}} />
            </div>
            <div className="t-label max-w-xs">
              <Etiqueta>Estados del elemento</Etiqueta>
              <ul className="flex flex-col gap-2">
                <li>Normal: texto secundario.</li>
                <li>Hover: fondo interactivo.</li>
                <li>Activo: fondo interactivo, texto principal, icono relleno e indicador a la izquierda.</li>
                <li>Foco: anillo de alto contraste.</li>
              </ul>
              <Button className="mt-4" size="sm" onClick={() => setPlegada(!plegada)}>
                {plegada ? 'Ver expandida' : 'Ver plegada'}
              </Button>
            </div>
          </div>
        </Ficha>

        <Ficha
          nombre="Topbar"
          id="topbar"
          uso="Migas de pan discretas (no compiten con el título de la página), búsqueda de comandos y botón del asistente."
          teclado="Tab llega a la búsqueda y al asistente; Ctrl K abre la búsqueda desde cualquier sitio."
          bien={{ nodo: <p className="t-label">Migas en texto terciario: «Finanzas › Panel».</p>, texto: 'Orientan sin gritar.' }}
          mal={{ nodo: <p className="t-label">Migas del mismo tamaño que el título.</p>, texto: 'Compiten con el título de la página.' }}
        >
          <div className="overflow-hidden r-card border border-line">
            <Topbar migas={['Finanzas', 'Panel']} onBuscar={() => {}} ia={false} onIa={() => {}} />
          </div>
        </Ficha>

        <Ficha
          nombre="AssistantPanel"
          id="assistantpanel"
          uso="Hueco del asistente local. Redimensionable entre 320 y 560 px; en ventanas estrechas se abre por encima del contenido. Hoy solo dice «Próximamente», sin respuestas simuladas."
          teclado="Se abre con el botón de la topbar; el asa de ancho se enfoca con Tab y se mueve con ← y →; Esc o el botón de cerrar lo cierran."
          bien={{ nodo: <p className="t-label">Estado vacío honesto: «Próximamente».</p>, texto: 'No promete lo que aún no existe.' }}
          mal={{ nodo: <p className="t-label">Una conversación inventada con respuestas.</p>, texto: 'Simula una función que no está.' }}
        >
          <div className="h-96 w-fit overflow-hidden r-card border border-line">
            <AssistantPanel ancho={360} onAncho={() => {}} onCerrar={() => {}} superpuesto={false} />
          </div>
        </Ficha>
      </Bloque>

      <Bloque id="layout" titulo="Páginas y tarjetas" texto="Un título de página, tarjetas con un protagonista y varios secundarios, y el detalle bajo demanda.">
        <Ficha
          nombre="PageHeader"
          id="pageheader"
          uso="Título de la página (28 px), una línea de ayuda y las acciones de la página; solo una es primaria."
          teclado="Las acciones se alcanzan en orden de lectura."
          bien={{ nodo: <PageHeader titulo="Movimientos" texto="El libro de todas las cifras." acciones={<Button variant="primary">Nuevo movimiento</Button>} />, texto: 'Un título, una ayuda y una acción principal.' }}
          mal={{ nodo: <PageHeader titulo="MOVIMIENTOS DE LA APP DE FINANZAS" acciones={<><Button variant="primary">A</Button><Button variant="primary">B</Button></>} />, texto: 'Mayúsculas en un título largo y dos primarios.' }}
        >
          <PageHeader titulo="Panel" texto="Situación de hoy y del mes en curso." acciones={<Button>Mes anterior</Button>} />
        </Ficha>

        <Ficha
          nombre="Card"
          id="card"
          uso="Agrupa una información con su título. Se separa del lienzo por tono y un borde fino, sin sombra. Relleno según la densidad (16, 24 o 24 px)."
          teclado="Si toda la tarjeta es un enlace, recibe foco y se activa con Intro; si no, solo sus controles internos."
          bien={{ nodo: <Card titulo="Patrimonio neto"><p className="t-label">Un tema por tarjeta.</p></Card>, texto: 'Un título corto y un tema.' }}
          mal={{ nodo: <div className="r-card border-4 border-ink p-4 t-label">Bordes gruesos en todas las tarjetas.</div>, texto: 'El borde grueso ensucia; basta un hilo y el tono.' }}
        >
          <div className="auto-grid-wide">
            <Card titulo="Normal" icono={<Wallet size={20} weight="duotone" aria-hidden />}>
              <p className="t-label">Contenido de la tarjeta.</p>
            </Card>
            <Card titulo="Con acción" accion={<Button size="sm" variant="ghost">Ver más</Button>}>
              <p className="t-label">Acción en la cabecera.</p>
            </Card>
            <div data-module="entreno" className="contents">
              <Card hero titulo="Marcador" subtitulo="única por pantalla">
                <p className="t-label" style={{ color: 'var(--hero-ink-2)' }}>
                  Solo la métrica central de Entreno y nunca en Inicio.
                </p>
              </Card>
            </div>
          </div>
        </Ficha>

        <Ficha
          nombre="KpiCard"
          id="kpicard"
          uso="Una cifra con su contexto (respecto a qué) y su estado con icono y texto. Protagonista (44 px) una por vista; de tarjeta (32 px) para el resto."
          teclado="No es interactiva por sí misma; las acciones de la cabecera sí."
          bien={{ nodo: <KpiCard titulo="Gastos" valor={<CifraEur cents={162345} />} contexto="74 % del presupuesto de noviembre" estado={<StatusBadge tono="info">Algo por delante del ritmo</StatusBadge>} />, texto: 'La cifra dice sobre qué y en qué periodo.' }}
          mal={{ nodo: <div className="t-kpi">74 %</div>, texto: 'Un porcentaje sin decir de qué ni de cuándo.' }}
        >
          <div className="auto-grid-wide">
            <KpiCard protagonista titulo="Protagonista" valor={<CifraEur cents={472214} />} contexto="Disponible para gastar" />
            <KpiCard titulo="De tarjeta" valor={<CifraUnidad valor="15.240" unidad="kg" />} contexto="Volumen de los últimos 7 días" />
            <KpiCard titulo="Con estado" valor={<CifraEur cents={122415} />} contexto="43 % de los ingresos de noviembre" estado={<StatusBadge tono="success">Por encima de octubre</StatusBadge>} />
          </div>
        </Ficha>

        <Ficha
          nombre="Accordion"
          id="accordion"
          uso="Detalle que se abre bajo demanda. Abierto o cerrado se ve por fondo, indicador, chevron y la palabra «Abierto»; todo el encabezado es zona de clic."
          teclado="Tab llega a cada encabezado; Intro o Espacio abren y cierran; el contenido abierto está en el orden de lectura."
          bien={{ nodo: <p className="t-label">Cerrado muestra un resumen: «6 movimientos · entran 2.640 €».</p>, texto: 'Se entiende sin abrir.' }}
          mal={{ nodo: <p className="t-label">Solo una flechita de 12 px como zona de clic.</p>, texto: 'Zona de clic diminuta y estado poco claro.' }}
        >
          <div className="card card-flush">
            <Accordion
              abiertas={acc}
              onToggle={(id) => setAcc((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })}
              items={[
                { id: 'a', titulo: 'Próximos 30 días', icono: <Clock size={20} weight="duotone" aria-hidden />, resumen: '6 movimientos · entran 2.640 €, salen 1.188 €', contenido: <p className="t-label">Contenido abierto de la sección.</p> },
                { id: 'b', titulo: 'Objetivos', icono: <CalendarBlank size={20} weight="duotone" aria-hidden />, resumen: '3 activos · 1 en riesgo', contenido: <p className="t-label">Otro contenido.</p> }
              ]}
            />
          </div>
        </Ficha>
      </Bloque>

      <Bloque id="datos" titulo="Datos y filtros" texto="Las tablas solo donde hay que comparar filas. Cifras a la derecha, conceptos a la izquierda.">
        <Ficha
          nombre="DataTable"
          id="datatable"
          uso="Comparar filas (movimientos). Tres densidades: compacta (36 px), normal (44) y cómoda (52). La fila abierta se integra por tono, sin tarjeta dentro de tarjeta."
          teclado="Tab llega al botón de cada fila; Intro la abre; las acciones del detalle siguen en orden. La fila con foco o con ratón se resalta."
          bien={{ nodo: <p className="t-label">Importes tabulares a la derecha, con signo.</p>, texto: 'Se comparan de un vistazo.' }}
          mal={{ nodo: <p className="t-label">Importes centrados y con tipografía proporcional.</p>, texto: 'Las cifras no alinean los decimales.' }}
        >
          <div className="mb-3">
            <SegmentedControl label="Densidad" tamano="sm" value={densidad} onChange={setDensidad} opciones={[{ id: 'compact', texto: 'Compacta' }, { id: 'normal', texto: 'Normal' }, { id: 'comfortable', texto: 'Cómoda' }]} />
          </div>
          <div className="card card-flush">
            <DataTable titulo="Muestra de movimientos" columnas={COLS} filas={MUESTRA} id={(m) => m.id} abierta={abierta} onAlternar={(id) => setAbierta(abierta === id ? null : id)} densidad={densidad} nombreFila={(m) => `${m.concepto}, ${eur(m.cents)}`} forzarHover="m2" detalle={(m) => <p className="t-label">Detalle de «{m.concepto}»: integrado en la fila, sin bordes anidados.</p>} />
          </div>
        </Ficha>

        <Ficha
          nombre="FilterBar"
          id="filterbar"
          uso="Una fila con lo más usado (búsqueda, periodo, estado) y un botón Filtros con contador que abre el resto. Los filtros activos son pastillas con «Limpiar»."
          teclado="Tab recorre la barra; el botón Filtros anuncia si está abierto; cada pastilla se quita con su botón; «Limpiar» las quita todas."
          bien={{ nodo: <p className="t-label">Contador «2» en el botón y pastillas visibles.</p>, texto: 'Siempre se sabe qué está filtrado.' }}
          mal={{ nodo: <p className="t-label">Seis desplegables en fila sin saber cuáles están activos.</p>, texto: 'Ruido y estado invisible.' }}
        >
          <FilterBar
            principal={
              <>
                <TextField className="w-56" label="Buscar" ocultarEtiqueta placeholder="Buscar…" icono={<MagnifyingGlass size={16} />} />
                <Select className="w-44" label="Periodo" ocultarEtiqueta><option>Noviembre 2026</option></Select>
              </>
            }
            contador={pastillas.length}
            abierto={filtro}
            onAlternar={() => setFiltro(!filtro)}
            avanzados={<p className="t-label">Aquí van cuenta, categoría, tipo y anulados.</p>}
            pastillas={pastillas}
            onQuitar={(id) => setPastillas(pastillas.filter((p) => p.id !== id))}
            onLimpiar={() => setPastillas([])}
          />
        </Ficha>
      </Bloque>

      <Bloque id="entreno" titulo="Entreno" texto="Componentes propios del módulo, con los tokens de Entreno.">
        <Ficha
          nombre="WeekSessionCell"
          id="weeksessioncell"
          uso="Una celda por día de la semana. Cuatro estados que se distinguen por fondo, borde, icono y texto: hecha (fondo lima), hoy (borde lima), planificada (neutra) y descanso (atenuada, para que no parezca un fallo)."
          teclado="No es interactiva; cada celda tiene un nombre accesible con el día, la sesión y su estado."
          bien={{ nodo: <p className="t-label">Leyenda con los cuatro estados junto a la semana.</p>, texto: 'Se entiende sin adivinar.' }}
          mal={{ nodo: <p className="t-label">Descanso en rojo o con una cruz.</p>, texto: 'Un descanso no es un fallo.' }}
        >
          <div data-module="entreno">
            <ol className="grid grid-cols-4 gap-2 @3xl:grid-cols-7" aria-label="Estados de la celda">
              <WeekSessionCell dia="L" tipo="gimnasio" estado="hecha" nombre="Empuje" />
              <WeekSessionCell dia="M" tipo="natacion" estado="hecha" nombre="Natación" />
              <WeekSessionCell dia="J" tipo="gimnasio" estado="hoy" nombre="Pierna" />
              <WeekSessionCell dia="V" tipo="natacion" estado="planificada" nombre="Natación" />
              <WeekSessionCell dia="D" tipo="descanso" estado="descanso" nombre="Descanso" />
            </ol>
            <div className="mt-4">
              <LeyendaSemana />
            </div>
          </div>
        </Ficha>
      </Bloque>
    </>
  )
}
