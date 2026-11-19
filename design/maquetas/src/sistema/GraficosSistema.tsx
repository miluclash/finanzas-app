import { disponible, entreno, evolucionPatrimonio, gastosPorCategoria, mes } from '../../datos-ficticios'
import { eur, eurPlano, n } from '../lib'
import { BarraSegmentada, ChartFrame, Columnas, leyendaDe, Legend, Lineas, LeyendaMapa, MapaConstancia, MedidoresLista, ProgressBar, Spark, type Referencia, type SerieLinea } from '../ui/charts'
import { Bloque, Ficha } from './ficha'

const SERIES: SerieLinea[] = [
  { key: 'actual', nombre: 'Noviembre (real)', color: 'var(--series-1)', patron: 'solida' },
  { key: 'anterior', nombre: 'Octubre (histórico)', color: 'var(--muted-mark)', patron: 'punteada' }
]
const REF: Referencia[] = [{ y: 2200, texto: 'Presupuesto 2.200 €', patron: 'discontinua' }]
const DATOS = mes.acumuladoAnterior.map((a, i) => ({ dia: String(i + 1), anterior: a.v, actual: mes.acumuladoActual[i]?.v ?? null }))

export function GraficosSistema() {
  return (
    <>
      <Bloque id="reglas" titulo="Reglas de los gráficos" texto="Siguen la skill dataviz: primero la forma, el color al final y por función. Cada gráfico tiene título, periodo, unidad y una referencia para interpretarlo.">
        <ul className="auto-grid-wide">
          {[
            ['Forma antes que color', 'A veces no es un gráfico, sino una cifra con contexto.'],
            ['Barras desde cero', 'Escalas que no engañan. Las líneas pueden no empezar en cero si se rotula.'],
            ['El color nunca es la única señal', 'Patrón (continua, punteada, discontinua), leyenda, rótulo o símbolo.'],
            ['Porcentajes con denominador', 'Siempre dicen sobre qué y en qué periodo.'],
            ['Marcas finas', 'Línea de 2 px, barras con 4 px redondeados y ancladas a la base, 2 px de separación entre rellenos.'],
            ['Texto sin color de serie', 'La identidad la da la marca de al lado, no el color del texto.']
          ].map(([t, d]) => (
            <li key={t} className="card">
              <h3 className="t-card-title">{t}</h3>
              <p className="t-label mt-2">{d}</p>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque id="marco" titulo="Marco, leyenda y progreso" texto="Lo que envuelve a cada gráfico.">
        <Ficha
          nombre="ChartFrame"
          id="chartframe"
          uso="Envuelve cualquier gráfico con su título, periodo, unidad, leyenda y referencia. Ofrece un gemelo en tabla y tres estados distintos: sin datos, cargando y error."
          teclado="El botón «Ver como tabla» alterna el gráfico y su tabla; el botón de reintento del error es enfocable."
          bien={{ nodo: <p className="t-label">«Gasto acumulado · Noviembre 2026 · euros» y una frase de referencia.</p>, texto: 'Se interpreta sin adivinar.' }}
          mal={{ nodo: <p className="t-label">Un gráfico sin título, sin unidad y sin periodo.</p>, texto: 'No se sabe qué mide.' }}
        >
          <div className="auto-grid-wide">
            <div className="r-card border border-line p-4">
              <ChartFrame titulo="Sin datos" periodo="Noviembre 2026" unidad="euros" estado="vacio" />
            </div>
            <div className="r-card border border-line p-4">
              <ChartFrame titulo="Cargando" periodo="Noviembre 2026" unidad="euros" estado="cargando" />
            </div>
            <div className="r-card border border-line p-4">
              <ChartFrame titulo="Con error" periodo="Noviembre 2026" unidad="euros" estado="error" onReintentar={() => {}} />
            </div>
          </div>
        </Ficha>

        <Ficha
          nombre="Legend"
          id="legend"
          uso="Obligatoria desde dos series. Cada entrada lleva la muestra con el patrón de su línea. Una sola serie no necesita leyenda."
          teclado="No es interactiva."
          bien={{ nodo: <Legend items={[{ nombre: 'Real', color: 'var(--series-1)' }, { nombre: 'Histórico', color: 'var(--muted-mark)', patron: 'punteada' }, { nombre: 'Presupuesto', color: 'var(--ref)', patron: 'discontinua' }]} />, texto: 'Real, histórico y presupuesto se distinguen sin color.' }}
          mal={{ nodo: <Legend items={[{ nombre: 'A', color: 'var(--series-1)' }, { nombre: 'B', color: 'var(--series-2)' }]} />, texto: 'Dos líneas continuas que solo se distinguen por el color.' }}
        >
          <Legend items={[{ nombre: 'Observado', color: 'var(--series-1)' }, { nombre: 'Proyección', color: 'var(--series-1)', patron: 'discontinua' }, { nombre: 'Objetivo', color: 'var(--ref)', patron: 'punteada' }, { nombre: 'Semana de descarga', color: 'var(--muted-mark)', patron: 'trama' }]} />
        </Ficha>

        <Ficha
          nombre="ProgressBar"
          id="progressbar"
          uso="Una proporción frente a un límite (presupuesto consumido, progreso de un objetivo). Lleva nombre accesible, valor en texto y, si hay un ritmo esperado, una marca."
          teclado="No es interactiva; role=progressbar anuncia el valor."
          bien={{ nodo: <div><ProgressBar value={0.74} marker={0.63} label="Presupuesto consumido" /><p className="t-meta mt-2">74 % del presupuesto de noviembre; la marca, el 63 % del mes.</p></div>, texto: 'Dice sobre qué, en qué periodo y qué marca la línea.' }}
          mal={{ nodo: <div><ProgressBar value={0.74} label="Progreso" /><p className="t-meta mt-2">74 %</p></div>, texto: '74 % de qué.' }}
        >
          <div className="auto-grid-wide">
            <div><ProgressBar value={0.3} label="Acento" /><p className="t-meta mt-2">Acento</p></div>
            <div><ProgressBar value={0.74} tone="warning" label="Aviso" /><p className="t-meta mt-2">Aviso (con texto de estado al lado)</p></div>
            <div><ProgressBar value={0.9} tone="success" label="Éxito" /><p className="t-meta mt-2">Éxito</p></div>
          </div>
        </Ficha>
      </Bloque>

      <Bloque id="formas" titulo="Formas" texto="Una por pregunta. Pasa el ratón o enfoca con teclado para ver los valores.">
        <Ficha
          nombre="Sparkline"
          id="sparkline"
          uso="Una tendencia dentro de una tarjeta. Sin ejes, pero siempre con el periodo, el valor inicial y el final, y un tooltip."
          teclado="El resumen en texto está disponible para lectores de pantalla (role=img con el rango)."
          bien={{ nodo: <Spark datos={disponible.serie30} periodo="Últimos 30 días" etiquetaInicio="Hace 30 días" etiquetaFin="Hoy" formato={(v) => eur(v * 100, { sinDecimales: true })} nombre="Disponible" />, texto: 'Periodo, inicio y final a la vista.' }}
          mal={{ nodo: <div className="h-12 r-control bg-interactive" role="img" aria-label="Línea sin datos" />, texto: 'Una línea sin periodo ni valores: decora, no informa.' }}
        >
          <Spark datos={evolucionPatrimonio.map((d) => d.patrimonio)} periodo="Últimos 12 meses" etiquetaInicio="Hace 12 meses" etiquetaFin="Hoy" formato={(v) => eur(v * 100, { sinDecimales: true })} nombre="Patrimonio neto" etiquetaX={(i) => evolucionPatrimonio[i].mes} />
        </Ficha>

        <Ficha
          nombre="Líneas"
          id="lineas"
          uso="Tendencia en el tiempo con referencias. Lo real va en línea continua; lo histórico, punteada; el presupuesto y la proyección, discontinua; el objetivo, punteada rotulada."
          teclado="Las series y su tabla se pueden leer con «Ver como tabla»."
          bien={{ nodo: <p className="t-label">El presupuesto como línea discontinua rotulada «Presupuesto 2.200 €».</p>, texto: 'Se reconoce por patrón y rótulo.' }}
          mal={{ nodo: <p className="t-label">Presupuesto como una línea más del mismo color.</p>, texto: 'Se confunde con los datos reales.' }}
        >
          <ChartFrame titulo="Gasto acumulado" periodo="Noviembre 2026, días 1 a 30" unidad="euros" referencia="Compara con octubre completo y con el presupuesto del mes." leyenda={leyendaDe(SERIES, REF)} tabla={{ columnas: ['Día', 'Noviembre', 'Octubre'], filas: DATOS.filter((_, i) => i % 4 === 0).map((d) => [`Día ${d.dia}`, d.actual === null ? '—' : eurPlano(d.actual * 100), eurPlano(d.anterior * 100)]) }}>
            <Lineas datos={DATOS} claveX="dia" series={SERIES} referencias={REF} formato={(v) => eur(v * 100, { sinDecimales: true })} formatoEje={(v) => n(v)} ticks={[0, 600, 1200, 1800, 2400]} dominio={[0, 2400]} tituloTooltip={(l) => `Día ${l}`} />
          </ChartFrame>
        </Ficha>

        <Ficha
          nombre="Columnas"
          id="columnas"
          uso="Comparar valores de periodos distintos. Siempre desde cero. Una barra resaltada y el resto en gris; la anotada (por ejemplo, una descarga) lleva trama y rótulo."
          teclado="Cada barra muestra su valor en el tooltip; la tabla gemela da todos."
          bien={{ nodo: <p className="t-label">Barras desde cero y la semana de descarga con trama y rótulo.</p>, texto: 'La diferencia es real y la anotación no depende del color.' }}
          mal={{ nodo: <p className="t-label">Eje recortado que empieza en 12.000 kg.</p>, texto: 'Exagera las diferencias.' }}
        >
          <div data-module="entreno">
            <ChartFrame titulo="Volumen semanal" periodo="Últimas 8 semanas, S40 a S47" unidad="kg de volumen de entrenamiento" referencia="La semana actual, resaltada; S43 fue de descarga." tabla={{ columnas: ['Semana', 'kg'], filas: entreno.volumen.semanas.map((s) => [s.s, n(s.kg)]) }}>
              <Columnas datos={entreno.volumen.semanas} claveX="s" claveY="kg" nombre="Volumen semanal" resaltada={7} anotada={{ i: 3, texto: 'Descarga' }} formato={(x) => `${n(x)} kg`} />
            </ChartFrame>
          </div>
        </Ficha>

        <Ficha
          nombre="Medidores y barra segmentada"
          id="medidores"
          uso="Partes frente a un todo o a un rango. El rango de referencia va rotulado y cada fila lleva su estado (bajo, dentro, por encima) con icono y texto."
          teclado="Cada fila es enfocable y su tooltip repite nombre, valor y estado."
          bien={{ nodo: <p className="t-label">Cada fila con «Bajo», «Dentro» o «Por encima» y el rango «Mín. 10 · Máx. 20».</p>, texto: 'El estado se lee, no solo se ve.' }}
          mal={{ nodo: <p className="t-label">Barras de colores distintos sin leyenda ni rango.</p>, texto: 'Hay que adivinar qué significa cada color.' }}
        >
          <div className="auto-grid-wide">
            <div data-module="entreno">
              <ChartFrame titulo="Series efectivas por grupo" periodo="Semana 47, hasta hoy" unidad="series efectivas" referencia="Rango de referencia: entre 10 y 20 series por grupo y semana.">
                <MedidoresLista filas={entreno.seriesPorGrupo.slice(0, 4).map((g) => ({ nombre: g.grupo, valor: g.series }))} formato={(x) => `${x} series`} maximo={20} rango={{ min: 10, max: 20, etiqueta: 'rango' }} estado={(x) => (x < 10 ? { tono: 'warning', texto: 'Bajo' } : { tono: 'success', texto: 'Dentro' })} />
              </ChartFrame>
            </div>
            <div data-module="finanzas">
              <ChartFrame titulo="Gastos por categoría" periodo="Noviembre 2026" unidad="euros" referencia="Ordenadas de mayor a menor.">
                <MedidoresLista filas={gastosPorCategoria.slice(0, 4).map((c) => ({ nombre: c.nombre, valor: c.cents }))} formato={(v) => eur(v)} />
                <div className="mt-4">
                  <BarraSegmentada etiqueta="Reparto de la liquidez" partes={[{ nombre: 'Disponible', valor: 47, color: 'var(--accent-mark)' }, { nombre: 'Recibos', valor: 13, color: 'var(--seq-3)' }, { nombre: 'Reservado', valor: 40, color: 'var(--muted-mark)' }]} />
                </div>
              </ChartFrame>
            </div>
          </div>
        </Ficha>

        <Ficha
          nombre="Mapa de constancia"
          id="mapa"
          uso="Un tono secuencial para la carga de cada día. Lleva fechas, leyenda que dice qué mide y tooltip."
          teclado="Tab entra al mapa; las flechas se mueven por semanas y días; el tooltip aparece con el foco."
          bien={{ nodo: <p className="t-label">Leyenda: «Carga del día (series efectivas)» con los cuatro niveles.</p>, texto: 'Se sabe qué mide el color.' }}
          mal={{ nodo: <p className="t-label">Cuadrados verdes sin leyenda ni fechas.</p>, texto: 'No se sabe qué es cada cuadrado.' }}
        >
          <div data-module="entreno" className="max-w-md">
            <MapaConstancia datos={entreno.constancia} inicio={entreno.constanciaInicio} />
            <div className="mt-3">
              <LeyendaMapa />
            </div>
          </div>
        </Ficha>
      </Bloque>
    </>
  )
}
