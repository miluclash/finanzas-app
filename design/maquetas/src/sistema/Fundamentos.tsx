import { Barbell, GearSix, House, Sparkle, Wallet } from '@phosphor-icons/react'
import { Button } from '../ui/controls'
import { StatusBadge } from '../ui/feedback'
import { Bloque, Etiqueta, FilaSw, Sw, TablaContrastes } from './ficha'

const PARES_NUCLEO: [string, string, number, string][] = [
  ['ink', 'card', 4.5, 'texto principal'],
  ['ink-2', 'card', 4.5, 'texto secundario'],
  ['ink-3', 'card', 4.5, 'texto terciario (metadatos)'],
  ['ink-3', 'interactive', 4.5, 'terciario sobre fila activa'],
  ['ink-disabled', 'card', 2.5, 'deshabilitado (solo informativo)'],
  ['control', 'card', 3, 'borde de campos y botones'],
  ['focus', 'card', 3, 'anillo de foco'],
  ['focus', 'canvas', 3, 'anillo de foco sobre el lienzo'],
  ['on-primary', 'primary', 4.5, 'texto del botón primario'],
  ['success', 'card', 4.5, 'estado éxito'],
  ['warning', 'card', 4.5, 'estado aviso'],
  ['error', 'card', 4.5, 'estado error'],
  ['info', 'card', 4.5, 'estado información']
]
const PARES_MODULO: [string, string, number, string][] = [
  ['accent-text', 'card', 4.5, 'texto de acento'],
  ['accent-mark', 'card', 3, 'marcas, iconos y progreso'],
  ['on-primary', 'primary', 4.5, 'texto del botón primario'],
  ['primary-edge', 'card', 3, 'borde del botón primario'],
  ['on-accent', 'accent', 4.5, 'texto del botón de acento'],
  ['series-1', 'card', 3, 'serie 1'],
  ['series-2', 'card', 3, 'serie 2'],
  ['series-3', 'card', 3, 'serie 3'],
  ['series-4', 'card', 3, 'serie 4'],
  ['muted-mark', 'card', 3, 'histórico (gris)']
]

const ESCALA: [string, string, string, string, string][] = [
  ['KPI protagonista', '44 px', '40–44', '--fs-kpi-hero', 't-kpi-hero'],
  ['KPI de tarjeta', '32 px', '30–36', '--fs-kpi', 't-kpi'],
  ['Título de página', '28 px', '26–28', '--fs-page', 't-page'],
  ['Título de sección', '19 px', '18–20', '--fs-section', 't-section'],
  ['Título de tarjeta', '15 px', '14–16', '--fs-card-title', 't-card-title'],
  ['Texto habitual', '14 px', '14', '--fs-body', 't-body'],
  ['Etiqueta secundaria', '13 px', '12–13', '--fs-label', 't-label'],
  ['Microtexto (excepcional)', '12 px', '11–12', '--fs-micro', 't-micro']
]
const ESPACIOS: [string, string][] = [
  ['4', 'entre icono y texto'],
  ['8', 'entre etiqueta y valor'],
  ['12', 'dentro de un grupo'],
  ['16', 'controles y filas compactas'],
  ['24', 'relleno de tarjeta'],
  ['32', 'entre secciones'],
  ['40', 'bloques principales'],
  ['48', 'bloques principales amplios']
]

export function Fundamentos() {
  return (
    <>
      <Bloque id="principios" titulo="Principios" texto="Seis ideas que guían cada decisión. Si una pantalla nueva no encaja, se pregunta antes de inventar.">
        <ol className="auto-grid-wide">
          {[
            ['Claridad antes que espectáculo', 'Cada pantalla responde a una pregunta principal.'],
            ['Jerarquía editorial', 'Un protagonista, varios secundarios y el detalle bajo demanda.'],
            ['Densidad deliberada', 'Finanzas, baja; Entreno, alta. Compactar sin perder legibilidad.'],
            ['La identidad no es un estado', 'El lima y el azul son marca. Éxito, aviso, error e información tienen sus propios colores.'],
            ['Contraste verificable', 'Nunca texto casi invisible para parecer sofisticado. Todo medido, en los dos temas.'],
            ['Sistema, no excepciones', 'Mismos tokens, componentes y estados en todas las pantallas.']
          ].map(([t, d], i) => (
            <li key={t} className="card">
              <div className="t-meta tnum">0{i + 1}</div>
              <h3 className="t-card-title mt-1">{t}</h3>
              <p className="t-label mt-2">{d}</p>
            </li>
          ))}
        </ol>
      </Bloque>

      <Bloque id="color" titulo="Color" texto="La profundidad sale de la luminosidad de las superficies, sin negro puro: lienzo, tarjeta, elevado e interactivo. El texto va en cuatro niveles. Los estados tienen tokens propios, separados de la identidad.">
        <div className="card flex flex-col gap-6">
          <FilaSw titulo="Superficies, de la más honda a la más alta">
            <Sw v="canvas" texto="canvas · lienzo" />
            <Sw v="sidebar" texto="sidebar" />
            <Sw v="card" texto="card · tarjeta" />
            <Sw v="raised" texto="raised · elevado" />
            <Sw v="interactive" texto="interactive" />
            <Sw v="line-strong" texto="line-strong · borde" />
          </FilaSw>
          <FilaSw titulo="Texto en cuatro niveles, bordes de control y foco">
            <Sw v="ink" texto="ink · principal" />
            <Sw v="ink-2" texto="ink-2 · secundario" />
            <Sw v="ink-3" texto="ink-3 · terciario" />
            <Sw v="ink-disabled" texto="ink-disabled" />
            <Sw v="control" texto="control · 3:1" />
            <Sw v="focus" texto="focus" />
          </FilaSw>
          <FilaSw titulo="Estados: éxito, aviso, error e información (siempre con icono y texto)">
            <Sw v="success" />
            <Sw v="warning" />
            <Sw v="error" />
            <Sw v="info" />
            <Sw v="success-soft" />
            <Sw v="error-soft" />
          </FilaSw>
          <div>
            <Etiqueta>Así se usan</Etiqueta>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <StatusBadge tono="success">Por encima del mínimo</StatusBadge>
              <StatusBadge tono="warning">Dos por revisar</StatusBadge>
              <StatusBadge tono="error">No se pudo guardar</StatusBadge>
              <StatusBadge tono="info">Algo por delante del ritmo</StatusBadge>
            </div>
          </div>
        </div>

        <div className="mt-6 auto-grid-wide">
          {(['finanzas', 'entreno'] as const).map((m) => (
            <div key={m} data-module={m} className="card flex flex-col gap-6">
              <div className="flex items-baseline justify-between">
                <h3 className="t-card-title">{m === 'finanzas' ? 'Finanzas' : 'Entreno'}</h3>
                <span className="t-meta">{m === 'finanzas' ? 'azul apagado · densidad cómoda' : 'lima · densidad compacta'}</span>
              </div>
              <FilaSw titulo="Acento: relleno, texto y marca van separados" min="6rem">
                <Sw v="accent" texto="accent · relleno" />
                <Sw v="accent-text" texto="accent-text" />
                <Sw v="accent-mark" texto="accent-mark" />
                <Sw v="accent-soft" texto="accent-soft" />
              </FilaSw>
              <FilaSw titulo="Series categóricas, validadas con la skill dataviz" min="6rem">
                <Sw v="series-1" />
                <Sw v="series-2" />
                <Sw v="series-3" />
                <Sw v="series-4" />
              </FilaSw>
              <FilaSw titulo="Secuencial de un solo tono" min="5rem">
                <Sw v="seq-1" />
                <Sw v="seq-2" />
                <Sw v="seq-3" />
                <Sw v="seq-4" />
                <Sw v="seq-5" />
              </FilaSw>
            </div>
          ))}
        </div>
        <p className="t-label mt-4 max-w-3xl">
          Un gasto no es un error: los importes se distinguen por el signo («−» y «+»), la alineación a la derecha y la tipografía tabular. El verde de los ingresos solo refuerza el signo.
        </p>
      </Bloque>

      <Bloque id="contrastes" titulo="Contrastes comprobados" texto="Medidos aquí mismo con los valores reales de los tokens en el tema activo. Cambia de tema arriba para ver el otro. El informe completo (todas las superficies, los dos temas y los dos módulos) está en la cabecera de tokens.css y se regenera con contrastes.mjs.">
        <div className="flex flex-col gap-4">
          <div className="card">
            <h3 className="t-card-title mb-3">Núcleo</h3>
            <TablaContrastes titulo="Contrastes del núcleo" pares={PARES_NUCLEO} />
          </div>
          <div data-module="finanzas" className="card">
            <h3 className="t-card-title mb-3">Finanzas</h3>
            <TablaContrastes titulo="Contrastes de Finanzas" pares={PARES_MODULO} />
          </div>
          <div data-module="entreno" className="card">
            <h3 className="t-card-title mb-3">Entreno</h3>
            <TablaContrastes titulo="Contrastes de Entreno" pares={PARES_MODULO} />
          </div>
        </div>
      </Bloque>

      <Bloque id="tipografia" titulo="Tipografía" texto="Solo Inter, con tamaño óptico. Cada escalón es un token y una clase: no hay tamaños sueltos. Mayúsculas solo en etiquetas cortas de Entreno.">
        <div className="card card-flush">
          {ESCALA.map(([n, px, rango, tok, cls], i) => (
            <div key={n} className={`cols-spec items-baseline gap-4 px-6 py-4 ${i > 0 ? 'border-t border-line' : ''}`}>
              <span className="t-label font-semibold text-ink">{n}</span>
              <span className="t-meta tnum">
                {px} (rango {rango}) · <code>{tok}</code>
              </span>
              <span className={cls}>{i < 2 ? '4.722,14 €' : i < 5 ? 'Movimientos de noviembre' : 'Texto de ejemplo en español de España'}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 auto-grid-wide">
          <div className="card">
            <Etiqueta>Cifras tabulares en columna, a la derecha</Etiqueta>
            <dl className="flex flex-col gap-2">
              {[
                ['Liquidez', '6.384,52 €'],
                ['Ahorro y huchas', '9.640,00 €'],
                ['Inversiones', '31.920,44 €']
              ].map(([a, b]) => (
                <div key={a} className="flex justify-between">
                  <dt className="t-label">{a}</dt>
                  <dd className="tnum t-body font-medium">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="card">
            <Etiqueta>La unidad se separa por peso y tamaño</Etiqueta>
            <div className="t-kpi">
              15.240<span className="unit">kg</span>
            </div>
            <div className="t-kpi mt-2">
              4.722<span className="unit-cents">,14 €</span>
            </div>
          </div>
          <div data-module="entreno" className="card">
            <Etiqueta>Título de tarjeta de Entreno: corto y en mayúsculas</Etiqueta>
            <h4 className="t-card-title">Volumen semanal</h4>
            <p className="t-meta mt-1">El detalle va en texto normal, fuera del título.</p>
          </div>
        </div>
      </Bloque>

      <Bloque id="espaciado" titulo="Espaciado, densidades, radios y sombras" texto="Escala de 4 px. Tres densidades con reglas iguales en toda la app. Las sombras solo se usan en lo elevado; lo demás se separa por tono.">
        <div className="auto-grid-wide">
          <div className="card">
            <Etiqueta>Escala de espaciado (px)</Etiqueta>
            <ul className="flex flex-col gap-2">
              {ESPACIOS.map(([px, uso]) => (
                <li key={px} className="t-label flex items-center gap-3">
                  <span className="tnum w-8 text-ink-3">{px}</span>
                  <span className="h-3 r-tag bg-accent-mark" style={{ width: `calc(var(--space-1) * ${Number(px) / 4} * 2)` }} />
                  <span>{uso}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <Etiqueta>Radios</Etiqueta>
            <ul className="grid grid-cols-3 gap-4">
              {[
                ['Tarjeta', '12', 'var(--radius-card)'],
                ['Modal', '16', 'var(--radius-modal)'],
                ['Botón y campo', '8', 'var(--radius-control)'],
                ['Etiqueta', '6', 'var(--radius-tag)'],
                ['Pastilla', 'total', 'var(--radius-full)']
              ].map(([n, px, r]) => (
                <li key={n} className="flex flex-col items-center gap-2">
                  <span className="size-12 border border-control bg-raised" style={{ borderRadius: r }} />
                  <span className="t-meta text-center">
                    {n} · {px}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <Etiqueta>Sombra: solo en lo elevado</Etiqueta>
            <div className="flex flex-col gap-4">
              <div className="r-card border border-line bg-card p-3 t-label">Tarjeta: sin sombra, separada por tono y borde fino</div>
              <div className="elevated r-card p-3 t-label">Menú o modal: sombra elevada</div>
            </div>
            <Etiqueta>
              <span className="mt-4 block">Alturas de botones y campos</span>
            </Etiqueta>
            <p className="t-label">32 px pequeño · 40 px normal · 48 px grande.</p>
          </div>
        </div>

        <div className="mt-6 auto-grid-wide">
          {(['compact', 'normal', 'comfortable'] as const).map((d) => (
            <div key={d} data-density={d} className="card">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="t-card-title">{d === 'compact' ? 'Compacta' : d === 'normal' ? 'Normal' : 'Cómoda'}</h3>
                <span className="t-meta">{d === 'compact' ? 'Entreno' : d === 'normal' ? 'Inicio y Ajustes' : 'Finanzas'}</span>
              </div>
              <ul className="divide-line">
                {['Compra semanal', 'Alquiler', 'Café y tostada'].map((c) => (
                  <li key={c} className="t-body flex items-center justify-between" style={{ minHeight: 'var(--row-h)' }}>
                    <span>{c}</span>
                    <span className="tnum text-ink-2">−12,40 €</span>
                  </li>
                ))}
              </ul>
              <p className="t-meta mt-3">
                {d === 'compact' ? 'Filas de 36 px, tarjeta de 16, hueco de 12.' : d === 'normal' ? 'Filas de 44 px, tarjeta de 24, hueco de 16.' : 'Filas de 52 px, tarjeta de 24, hueco de 24.'}
              </p>
            </div>
          ))}
        </div>
      </Bloque>

      <Bloque id="botones-principales" titulo="Regla de los botones principales" texto="Una sola acción principal por vista. El color del botón principal depende de dónde esté y de la jerarquía.">
        <div className="auto-grid-wide">
          <div className="card flex flex-col gap-4">
            <h3 className="t-card-title">Finanzas y núcleo: tinta invertida</h3>
            <p className="t-label">La acción principal de la página va en blanco (oscuro) o negro (claro).</p>
            <div>
              <Button variant="primary">Nuevo movimiento</Button>
            </div>
          </div>
          <div data-module="finanzas" className="card flex flex-col gap-4">
            <h3 className="t-card-title">Finanzas: azul para confirmar</h3>
            <p className="t-label">Dentro de un diálogo o un panel, la confirmación va en azul. La tinta se reserva para la página.</p>
            <div>
              <Button variant="accent">Guardar movimiento</Button>
            </div>
          </div>
          <div data-module="entreno" className="card flex flex-col gap-4">
            <h3 className="t-card-title">Entreno: lima</h3>
            <p className="t-label">El primario es lima, en la página y en los diálogos.</p>
            <div>
              <Button variant="primary">Importar de Hevy</Button>
            </div>
          </div>
          <div className="card flex flex-col gap-4">
            <h3 className="t-card-title">Destructivo</h3>
            <p className="t-label">Contorno en error en la vista; relleno en error solo en el diálogo de confirmación.</p>
            <div className="flex gap-2">
              <Button variant="danger">Anular</Button>
              <Button variant="danger-solid">Anular movimiento</Button>
            </div>
          </div>
        </div>
      </Bloque>

      <Bloque id="iconos" titulo="Iconos" texto="Phosphor. Trazo regular en la navegación; duotono o relleno para lo activo y las tarjetas destacadas. Siempre con nombre accesible si van solos.">
        <div className="card flex flex-wrap items-center gap-8">
          {[House, Wallet, Barbell, GearSix, Sparkle].map((I, i) => (
            <div key={i} className="flex items-center gap-3 text-ink">
              <I size={24} weight="regular" aria-hidden />
              <I size={24} weight="duotone" className="text-accent-text" aria-hidden />
              <I size={24} weight="fill" className="text-accent-text" aria-hidden />
            </div>
          ))}
          <span className="t-meta">regular · duotono · relleno</span>
        </div>
      </Bloque>
    </>
  )
}
