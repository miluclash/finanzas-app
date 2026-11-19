import {
  ArrowsLeftRight,
  Barbell,
  CheckCircle,
  Gauge,
  House,
  Moon,
  Plus,
  Sparkle,
  Sun,
  Tray,
  Wallet,
  WifiSlash
} from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { disponible, entreno, evolucionPatrimonio, gastosPorCategoria } from '../../datos-ficticios'
import { cx, eur, n, n1 } from '../lib'
import { Button, CifraEur, Chip, Delta, EmptyState, ErrorState, Estado, Field, Input, Meter, Segmented, Select, Skeleton, Switch } from '../ui/basics'
import { BarraSegmentada, Columnas, Lineas, MapaConstancia, MedidoresLista, Spark } from '../ui/charts'

/** Re-renderiza cuando cambia data-theme, para releer los valores de los tokens */
function useTemaAttr() {
  const [t, setT] = useState(document.documentElement.dataset.theme)
  useEffect(() => {
    const o = new MutationObserver(() => setT(document.documentElement.dataset.theme))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => o.disconnect()
  }, [])
  return t
}

function Sw({ v, texto, borde }: { v: string; texto?: string; borde?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hex, setHex] = useState('')
  const tema = useTemaAttr()
  useLayoutEffect(() => {
    if (ref.current) setHex(getComputedStyle(ref.current).getPropertyValue('--' + v).trim())
  })
  return (
    <div ref={ref} className="flex min-w-0 flex-col gap-1.5" data-t={tema}>
      <div className={cx('h-11 rounded-[var(--radius-sm)]', borde !== false && 'border border-line-strong')} style={{ background: `var(--${v})` }} />
      <div className="min-w-0">
        <div className="truncate text-[11.5px] font-[560] text-ink">{texto ?? v}</div>
        <div className="tnum text-[11px] uppercase text-ink-3">{hex.startsWith('var') ? '= ' + hex.slice(6, -1) : hex}</div>
      </div>
    </div>
  )
}
const Fila = ({ titulo, children, cols = 6 }: { titulo: string; children: ReactNode; cols?: number }) => (
  <div>
    <div className="t-label mb-2.5">{titulo}</div>
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {children}
    </div>
  </div>
)
function Bloque({ id, titulo, texto, children }: { id: string; titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-20" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="t-title" style={{ fontSize: '1.375rem' }}>
        {titulo}
      </h2>
      {texto && <p className="t-small mt-1.5 max-w-[70ch] text-ink-2">{texto}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}

/** Un panel con data-module: todo lo de dentro cambia de identidad sin tocar el código */
function Modulo({ id, nombre, nota, children }: { id: 'finanzas' | 'entreno'; nombre: string; nota: string; children: ReactNode }) {
  return (
    <div data-module={id} className="rounded-[var(--radius-xl)] border border-line-strong bg-bg p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h3 className="t-heading">{nombre}</h3>
        <span className="t-small text-ink-3">{nota}</span>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  )
}

export function Sistema() {
  const tema = useTemaAttr()
  const cambiar = (t: 'dark' | 'light') => {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('maquetas-tema', t)
  }
  const [seg, setSeg] = useState<'semana' | 'mes' | 'bloque'>('mes')
  const [sw, setSw] = useState(true)

  const secciones = [
    ['color', 'Color'],
    ['tipografia', 'Tipografía'],
    ['espaciado', 'Espaciado'],
    ['iconos', 'Iconos'],
    ['botones', 'Botones'],
    ['campos', 'Campos'],
    ['cifras', 'Cifras y tarjetas'],
    ['graficos', 'Gráficos'],
    ['estados', 'Estados'],
    ['foco', 'Foco y movimiento']
  ]

  return (
    <div>
      <header className="sticky top-0 z-30 mb-10 border-b border-line bg-bg/90 px-10 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-6">
        <div>
          <h1 className="t-title whitespace-nowrap">Sistema de diseño</h1>
          <p className="t-small whitespace-nowrap text-ink-3">Finanzas · F2 · tokens.css</p>
        </div>
        <nav aria-label="Secciones" className="ml-4 hidden gap-1 2xl:flex">
          {secciones.map(([id, t]) => (
            <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }} className="rounded-[var(--radius-sm)] px-2.5 py-1 text-[length:var(--fs-small)] text-ink-2 hover:bg-surface-3 hover:text-ink">
              {t}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Segmented label="Tema" value={(tema as 'dark' | 'light') ?? 'dark'} onChange={cambiar} opciones={[{ id: 'dark', texto: 'Oscuro', icono: <Moon size={15} /> }, { id: 'light', texto: 'Claro', icono: <Sun size={15} /> }]} />
          <a className="btn btn-secondary" href="#/inicio">
            Ir a Inicio
          </a>
        </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1240px] px-10 pb-24">

      {/* ------------------------------------------------------------- COLOR */}
      <Bloque id="color" titulo="Color" texto="Un núcleo neutro y dos identidades. Las superficies van en capas (materiales), la tinta en tres niveles y cada módulo redefine acento, estados, series de gráfico y densidad con data-module.">
        <div className="card flex flex-col gap-6 !p-6">
          <div className="t-heading">Núcleo neutro</div>
          <Fila titulo="Superficies, de la más honda a la más alta">
            <Sw v="bg" texto="bg · fondo" />
            <Sw v="sidebar" texto="sidebar" />
            <Sw v="surface-1" texto="surface-1 · tarjeta" />
            <Sw v="surface-2" texto="surface-2 · elevada" />
            <Sw v="surface-3" texto="surface-3 · activa" />
            <Sw v="overlay" texto="overlay · diálogo" />
          </Fila>
          <Fila titulo="Tinta y líneas">
            <Sw v="ink" texto="ink · principal" />
            <Sw v="ink-2" texto="ink-2 · secundaria" />
            <Sw v="ink-3" texto="ink-3 · apagada" />
            <Sw v="line" texto="line · separador" />
            <Sw v="line-strong" texto="line-strong" />
            <Sw v="control" texto="control · bordes 3:1" />
          </Fila>
          <Fila titulo="Estados (siempre con icono y etiqueta) y foco">
            <Sw v="pos" texto="pos" />
            <Sw v="neg" texto="neg" />
            <Sw v="warn" texto="warn" />
            <Sw v="pos-soft" texto="pos-soft" />
            <Sw v="neg-soft" texto="neg-soft" />
            <Sw v="focus" texto="focus" />
          </Fila>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5">
          {(['finanzas', 'entreno'] as const).map((m) => (
            <div key={m} data-module={m} className="card flex flex-col gap-6 !p-6">
              <div className="flex items-baseline justify-between">
                <div className="t-heading">{m === 'finanzas' ? 'Finanzas' : 'Entreno'}</div>
                <span className="t-small text-ink-3">{m === 'finanzas' ? 'casi negro · un acento apagado' : 'acento volt · más contraste'}</span>
              </div>
              <Fila titulo="Superficies" cols={4}>
                <Sw v="bg" />
                <Sw v="surface-1" />
                <Sw v="surface-2" />
                <Sw v="surface-3" />
              </Fila>
              <Fila titulo="Acento: relleno, texto y marca van separados" cols={4}>
                <Sw v="accent" texto="accent · relleno" />
                <Sw v="accent-text" texto="accent-text" />
                <Sw v="accent-mark" texto="accent-mark" />
                <Sw v="accent-soft" texto="accent-soft" />
              </Fila>
              <Fila titulo="Positivo, negativo, aviso" cols={4}>
                <Sw v="pos" />
                <Sw v="neg" />
                <Sw v="warn" />
                <Sw v="primary" texto="primary" />
              </Fila>
              <Fila titulo="Series categóricas (validadas con la skill dataviz)" cols={4}>
                <Sw v="series-1" />
                <Sw v="series-2" />
                <Sw v="series-3" />
                <Sw v="series-4" />
              </Fila>
              <Fila titulo="Secuencial de un solo tono" cols={5}>
                <Sw v="seq-1" />
                <Sw v="seq-2" />
                <Sw v="seq-3" />
                <Sw v="seq-4" />
                <Sw v="seq-5" />
              </Fila>
            </div>
          ))}
        </div>
      </Bloque>

      {/* -------------------------------------------------------- TIPOGRAFÍA */}
      <Bloque id="tipografia" titulo="Tipografía" texto="Inter variable con tamaño óptico. Cifras grandes y con peso, etiquetas pequeñas y apagadas. Las cifras grandes y sueltas llevan figuras proporcionales; las columnas y tablas, tabulares.">
        <div className="card !p-0">
          {[
            ['Héroe', '52 px · 620 · −3 %', <span key="a" className="num-hero">4.722<span className="text-ink-3" style={{ fontSize: '0.5em' }}>,14 €</span></span>],
            ['Cifra grande', '40 px · 600 · −2,4 %', <span key="b" className="num-display">47.944,96 €</span>],
            ['Título de página', '26 px · 650 · −2,2 %', <span key="c" className="t-title">Movimientos de noviembre</span>],
            ['Sección', '17 px · 560', <span key="d" className="t-heading">Gastos por categoría</span>],
            ['Cuerpo', '14 px · 420', <span key="e">Llevas el 74 % del presupuesto y el mes va por el 63 %.</span>],
            ['Secundario', '13 px · 420', <span key="f" className="t-small text-ink-2">Netos de reembolsos. Pulsa una categoría para ver sus movimientos.</span>],
            ['Etiqueta', '11,5 px · 500 · apagada', <span key="g" className="t-label">Disponible para gastar</span>]
          ].map(([t, d, e], i) => (
            <div key={t as string} className={cx('grid grid-cols-[180px_200px_1fr] items-baseline gap-6 px-6 py-4', i > 0 && 'border-t border-line')}>
              <span className="t-small font-[600]">{t as string}</span>
              <span className="t-small tnum text-ink-3">{d as string}</span>
              <span className="min-w-0">{e as ReactNode}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-5">
          <div className="card">
            <div className="t-label mb-3">Cifras tabulares en columna</div>
            <table className="w-full text-[length:var(--fs-body)]">
              <tbody>
                {[['Liquidez', 638452], ['Ahorro y huchas', 964000], ['Inversiones', 3192044]].map(([a, b]) => (
                  <tr key={a as string}>
                    <td className="py-1 text-ink-2">{a}</td>
                    <td className="tnum py-1 text-right font-[560]">{eur(b as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div data-module="entreno" className="card">
            <div className="t-label mb-3">Entreno: etiquetas en mayúsculas y cifras de marcador</div>
            <div className="flex items-baseline gap-2">
              <span className="num-display">{n(entreno.volumen.ultimos7Kg)}</span>
              <span className="text-[1.1rem] font-[700] text-ink-3">kg</span>
            </div>
          </div>
        </div>
      </Bloque>

      {/* --------------------------------------------------------- ESPACIADO */}
      <Bloque id="espaciado" titulo="Espaciado, radios y sombras" texto="Base de 4 px. Los radios crecen con el tamaño del elemento. Las sombras son de tres alturas.">
        <div className="grid grid-cols-3 gap-5">
          <div className="card">
            <div className="t-label mb-3">Espaciado</div>
            <ul className="flex flex-col gap-2">
              {[4, 8, 12, 16, 20, 24, 32, 40, 48].map((s) => (
                <li key={s} className="flex items-center gap-3 text-[length:var(--fs-small)]">
                  <span className="tnum w-12 text-ink-3">{s} px</span>
                  <span className="h-3 rounded-[3px]" style={{ width: s * 3, background: 'var(--accent-mark)' }} />
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <div className="t-label mb-3">Radios</div>
            <div className="grid grid-cols-3 gap-3">
              {[['xs', 4], ['sm', 8], ['md', 12], ['lg', 16], ['xl', 22], ['full', 999]].map(([n2, r]) => (
                <div key={n2 as string} className="flex flex-col items-center gap-1.5">
                  <div className="size-14 border border-control bg-surface-2" style={{ borderRadius: r as number }} />
                  <span className="tnum text-[11px] text-ink-3">
                    {n2} · {(r as number) > 100 ? '∞' : r}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="t-label mb-3">Sombras y densidad</div>
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex h-10 items-center rounded-[var(--radius-md)] bg-surface-1 px-3 text-[length:var(--fs-small)] text-ink-2" style={{ boxShadow: `var(--shadow-${s})` }}>
                  shadow-{s}
                </div>
              ))}
              <p className="t-small text-ink-3">Densidad: Finanzas 24 px de relleno y filas de 48; Entreno 16 y 34.</p>
            </div>
          </div>
        </div>
      </Bloque>

      {/* ------------------------------------------------------------ ICONOS */}
      <Bloque id="iconos" titulo="Iconos" texto="Phosphor. Trazo regular en la navegación; duotono o relleno para lo activo y las tarjetas destacadas.">
        <div className="card flex items-center gap-10">
          {[House, Wallet, Barbell, ArrowsLeftRight, Gauge, Sparkle].map((I, i) => (
            <div key={i} className="flex flex-col items-center gap-2 text-ink">
              <div className="flex items-center gap-3">
                <I size={24} weight="regular" />
                <I size={24} weight="duotone" className="text-accent-text" />
                <I size={24} weight="fill" className="text-accent-text" />
              </div>
              <span className="text-[11px] text-ink-3">regular · duotono · relleno</span>
            </div>
          ))}
        </div>
      </Bloque>

      {/* ----------------------------------------------------------- BOTONES */}
      <Bloque id="botones" titulo="Botones" texto="Primario, secundario, fantasma y peligro. El primario de Finanzas es tinta invertida; el de Entreno, volt (en claro, con borde oscurecido para que se vea).">
        <div className="grid grid-cols-2 gap-5">
          {(['finanzas', 'entreno'] as const).map((m) => (
            <div key={m} data-module={m} className="card flex flex-col gap-5">
              <div className="t-label">{m === 'finanzas' ? 'Finanzas (y núcleo)' : 'Entreno'}</div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" icon={<Plus size={16} weight="bold" />} kbd="N">
                  Nuevo movimiento
                </Button>
                <Button variant="secondary">Secundario</Button>
                <Button variant="ghost">Fantasma</Button>
                <Button variant="danger">Anular</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" size="sm">Pequeño</Button>
                <Button variant="primary" size="lg">Grande</Button>
                <Button variant="primary" disabled>Desactivado</Button>
                <Button variant="secondary" disabled>Desactivado</Button>
                <Button variant="ghost" aria-label="Añadir" icon={<Plus size={16} />} />
              </div>
            </div>
          ))}
        </div>
      </Bloque>

      {/* ------------------------------------------------------------ CAMPOS */}
      <Bloque id="campos" titulo="Campos y controles" texto="Borde de 3:1 contra la superficie, foco de dos píxeles y mensajes de error con icono.">
        <div className="card grid grid-cols-4 gap-x-6 gap-y-6">
          <Field label="Concepto" hint="Por ejemplo, compra semanal.">{(id) => <Input id={id} placeholder="Escribe un concepto" />}</Field>
          <Field label="Importe" error="Escribe un importe mayor que cero.">{(id) => <Input id={id} aria-invalid defaultValue="0,00" className="tnum text-right" />}</Field>
          <Field label="Cuenta">
            {(id) => (
              <Select id={id}>
                <option>Cuenta corriente</option>
                <option>Tarjeta</option>
              </Select>
            )}
          </Field>
          <Field label="Desactivado">{(id) => <Input id={id} value="EUR" disabled readOnly />}</Field>
          <div>
            <div className="field-label">Segmentado</div>
            <Segmented label="Periodo" value={seg} onChange={setSeg} opciones={[{ id: 'semana', texto: 'Semana' }, { id: 'mes', texto: 'Mes' }, { id: 'bloque', texto: 'Bloque' }]} />
          </div>
          <div>
            <div className="field-label">Interruptor</div>
            <div className="flex items-center gap-3">
              <Switch checked={sw} onChange={setSw} label="Avisar de duplicados" />
              <span className="t-small text-ink-2">{sw ? 'Activado' : 'Desactivado'}</span>
            </div>
          </div>
          <div className="col-span-2">
            <div className="field-label">Chips</div>
            <div className="flex flex-wrap gap-2">
              <Chip>Recurrente</Chip>
              <Chip tono="accent">Reembolso</Chip>
              <Chip tono="pos">Confirmado</Chip>
              <Chip tono="warn">Pendiente</Chip>
              <Chip tono="neg">Anulado</Chip>
            </div>
          </div>
        </div>
      </Bloque>

      {/* ------------------------------------------------- CIFRAS Y TARJETAS */}
      <Bloque id="cifras" titulo="Cifra con contexto y tarjeta" texto="Cada número dice respecto a qué se compara y si va bien o mal. El estado lleva icono y etiqueta: el color nunca va solo.">
        <div className="grid grid-cols-2 gap-5">
          <Modulo id="finanzas" nombre="Finanzas" nota="densidad baja">
            <div className="grid grid-cols-2 gap-4">
              <div className="card">
                <div className="t-label mb-2">Disponible para gastar</div>
                <div className="num-display"><CifraEur cents={disponible.disponibleCents} /></div>
                <div className="mt-2"><Estado tono="pos">Por encima de tu mínimo</Estado></div>
              </div>
              <div className="card">
                <div className="t-label mb-2">Gastos de noviembre</div>
                <div className="num-display">{eur(162345)}</div>
                <Meter className="mt-3" value={0.74} tone="warn" marker={0.63} label="Presupuesto" />
                <div className="mt-2"><Estado tono="warn">Por delante del ritmo</Estado></div>
              </div>
            </div>
            <div className="card">
              <div className="t-label mb-2">Ahorro del mes</div>
              <div className="flex items-baseline gap-3">
                <span className="num-stat">{eur(122415)}</span>
                <Delta valor="+502,85 €" contexto="más que todo octubre" dir="up" bueno />
              </div>
              <div className="t-label mb-2 mt-3 border-t border-line pt-3">Gasto del mes</div>
              <div className="flex items-baseline gap-3">
                <span className="num-stat">{eur(162345)}</span>
                <Delta valor="+16 %" contexto="de gasto vs octubre a esta altura" dir="up" bueno={false} />
              </div>
            </div>
          </Modulo>
          <Modulo id="entreno" nombre="Entreno" nota="densidad alta">
            <div className="grid grid-cols-2 gap-4">
              <div className="card card-hero">
                <div className="t-label mb-2" style={{ color: 'var(--hero-ink-2)' }}>Volumen · 7 días</div>
                <div className="num-display">{n(entreno.volumen.ultimos7Kg)} <span style={{ fontSize: '0.4em' }}>kg</span></div>
                <p className="t-small mt-2" style={{ color: 'var(--hero-ink-2)' }}><b style={{ color: 'var(--hero-ink)' }}>+5,9 %</b> vs 7 días anteriores</p>
              </div>
              <div className="card">
                <div className="t-label mb-2">Press banca · e1RM</div>
                <div className="num-display">{n1(entreno.e1rm.actualKg)} <span className="text-ink-3" style={{ fontSize: '0.4em' }}>kg</span></div>
                <Meter className="mt-3" value={0.69} label="Progreso hacia la meta" />
                <div className="mt-2"><Estado tono="pos">Llegas al ritmo actual</Estado></div>
              </div>
            </div>
            <div className="card">
              <div className="t-label mb-2">Sentadilla · e1RM</div>
              <div className="flex items-baseline gap-3">
                <span className="num-stat">128,0 kg</span>
                <Delta valor="+0,6 kg/sem" contexto="faltan 1,15 para la meta" dir="up" bueno={false} />
              </div>
              <div className="mt-2"><Estado tono="warn">No llegas al ritmo actual</Estado></div>
            </div>
          </Modulo>
        </div>
      </Bloque>

      {/* ---------------------------------------------------------- GRÁFICOS */}
      <Bloque id="graficos" titulo="Gráficos" texto="Primero la forma, el color al final. Líneas de 2 px, barras con 4 px redondeados anclados a la base, 2 px de separación entre rellenos, rejilla y ejes discretos, leyenda desde 2 series, etiquetas directas selectivas y tooltip al pasar el ratón. Pasa el ratón por encima.">
        <div className="grid grid-cols-2 gap-5">
          <Modulo id="finanzas" nombre="Finanzas" nota="acento azul apagado">
            <div className="card">
              <div className="t-label mb-2">Mini gráfico · tendencia</div>
              <Spark datos={disponible.serie30} formato={(x) => eur(x * 100, { sinDecimales: true })} nombre="Disponible" alto={70} etiquetaX={(i) => `Hace ${29 - i} días`} />
            </div>
            <div className="card">
              <div className="t-label mb-2">Líneas · 2 series con leyenda</div>
              <Lineas datos={evolucionPatrimonio} claveX="mes" alto={170} series={[{ key: 'patrimonio', nombre: 'Patrimonio neto', color: 'var(--series-1)' }, { key: 'liquidez', nombre: 'Liquidez', color: 'var(--muted-mark)' }]} formato={(x) => eur(x * 100, { sinDecimales: true })} formatoEje={(v) => (v === 0 ? '0' : `${v / 1000} mil`)} dominio={[0, 50000]} ticks={[0, 25000, 50000]} />
            </div>
            <div className="card">
              <div className="t-label mb-3">Medidores ordenados · una parte frente al todo</div>
              <MedidoresLista filas={gastosPorCategoria.slice(0, 4).map((c) => ({ nombre: c.nombre, valor: c.cents }))} formato={(v) => eur(v)} />
              <div className="mt-5">
                <BarraSegmentada partes={[{ nombre: 'Disponible', valor: 47, color: 'var(--accent-mark)' }, { nombre: 'Recibos', valor: 13, color: 'var(--seq-3)' }, { nombre: 'Reservado', valor: 40, color: 'var(--muted-mark)' }]} />
                <p className="t-small mt-2 text-ink-3">Barra segmentada fina: el texto de al lado lleva las cifras.</p>
              </div>
            </div>
          </Modulo>
          <Modulo id="entreno" nombre="Entreno" nota="acento volt">
            <div className="card">
              <div className="t-label mb-2">Columnas · una resaltada, el resto en gris</div>
              <Columnas datos={entreno.volumen.semanas} claveX="s" claveY="kg" nombre="Volumen" resaltada={7} alto={140} formato={(x) => `${n(x)} kg`} etiquetaUltima />
            </div>
            <div className="card">
              <div className="t-label mb-2">Series por grupo · marcador de mínimo</div>
              <MedidoresLista filas={entreno.seriesPorGrupo.slice(0, 5).map((g) => ({ nombre: g.grupo, valor: g.series }))} formato={(x) => `${x} series`} maximo={20} marcador={10} etiquetaMarcador="mín. 10" aviso={(x) => x < 10} />
            </div>
            <div className="card">
              <div className="t-label mb-3">Mapa de constancia · secuencial de un tono</div>
              <MapaConstancia datos={entreno.constancia} />
            </div>
          </Modulo>
        </div>
      </Bloque>

      {/* ------------------------------------------------------------ ESTADOS */}
      <Bloque id="estados" titulo="Estados: vacío, cargando y error" texto="Nunca texto suelto: cada estado tiene su icono, su frase corta y, si se puede, una salida.">
        <div className="grid grid-cols-3 gap-5">
          <div className="card">
            <div className="t-label mb-2">Vacío</div>
            <EmptyState icono={<Tray size={24} weight="duotone" />} titulo="Aún no hay movimientos" texto="Añade el primero con N o importa tu Excel." accion={<Button variant="primary" size="sm" icon={<Plus size={14} weight="bold" />}>Nuevo movimiento</Button>} />
          </div>
          <div className="card" aria-busy="true">
            <div className="t-label mb-2">Cargando (esqueleto)</div>
            <div className="flex flex-col gap-3 py-2" role="status" aria-label="Cargando">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-2 h-16 w-full" />
            </div>
          </div>
          <div className="card">
            <div className="t-label mb-3">Error</div>
            <ErrorState titulo="No se han podido leer los datos" texto="La base está bloqueada por otro programa. Ciérralo e inténtalo de nuevo." accion={<Button size="sm" icon={<WifiSlash size={14} />}>Reintentar</Button>} />
            <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-[length:var(--fs-small)]">
              <CheckCircle size={18} weight="fill" className="text-pos" aria-hidden /> Copia hecha hoy a las 08:12
            </div>
          </div>
        </div>
      </Bloque>

      {/* --------------------------------------------------- FOCO Y MOVIMIENTO */}
      <Bloque id="foco" titulo="Foco visible y movimiento" texto="Todo es alcanzable con el teclado y el foco se ve sobre cualquier superficie. Las transiciones duran entre 120 y 220 ms y se anulan con «reducir movimiento» del sistema.">
        <div className="grid grid-cols-2 gap-5">
          <div className="card">
            <div className="t-label mb-3">Foco (pulsa Tab para recorrer)</div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" className="forzar-foco">Primario con foco</Button>
              <Button variant="secondary">Secundario</Button>
              <Input className="forzar-foco !w-48" defaultValue="Campo con foco" aria-label="Campo de ejemplo" />
            </div>
          </div>
          <div className="card">
            <div className="t-label mb-3">Movimiento</div>
            <ul className="flex flex-col gap-1.5 text-[length:var(--fs-small)]">
              {[['Hover y pulsar', '120 ms', '--dur-fast'], ['Abrir tarjeta, desplegar', '180 ms', '--dur-base'], ['Cambio de página, barra lateral', '220 ms', '--dur-slow']].map(([a, b, c]) => (
                <li key={a} className="flex items-center gap-3">
                  <span className="tnum w-14 text-ink-3">{b}</span>
                  <span className="flex-1">{a}</span>
                  <code className="text-ink-3">{c}</code>
                </li>
              ))}
            </ul>
            <div className="card card-link mt-4 !p-3 text-[length:var(--fs-small)] text-ink-2" tabIndex={0}>
              Pasa el ratón por aquí: sube 2 px.
            </div>
          </div>
        </div>
      </Bloque>
      </div>
    </div>
  )
}
