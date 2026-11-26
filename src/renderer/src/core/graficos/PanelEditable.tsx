// Panel editable: cuadrícula de tarjetas fijas (del registro de los módulos) y gráficos guardados.
//
// - Carga `core:dashboards.get` y lo fusiona con el diseño por defecto (`mergeDashboard`): fijas
//   conocidas = las del registro que declaran este panel; gráficos existentes = `core:charts.list`.
// - "Editar panel": los cambios se ven en vivo sobre un borrador y se guardan en una sola llamada
//   (`core:dashboards.save`) al pulsar Hecho; Cancelar los descarta.
// - Ordenar arrastrando (@dnd-kit, puntero y teclado, con anuncios en español) o con los botones
//   de cada tarjeta. Tamaños admitidos, ocultar las fijas (nunca se eliminan), quitar o editar los
//   gráficos, añadir tarjetas o un gráfico nuevo, restaurar el diseño y borrar un gráfico (de todos
//   los paneles), con confirmación.
// - El foco no se pierde: tras mover, ocultar o cerrar algo vuelve a un sitio razonable.
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, type SortingStrategy } from '@dnd-kit/sortable'
import { ArrowCounterClockwise, ArrowLeft, ArrowRight, ChartLineUp, DotsSixVertical, EyeSlash, PencilSimple, Plus, SquaresFour, Trash, X } from '@phosphor-icons/react'
import type { CardSize, DashboardCard, DashboardDefault, DashboardId, SavedChart } from '@shared/core/metrics-types'
import { chartCardId, fixedCardId, mergeDashboard } from '@shared/core/charts/dashboard'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useApi, useApiMutation } from '../../lib/api'
import { Button, ConfirmDialog, ErrorState, IconButton, LoadingState, PageHeader, Popover, Select, StatusBadge, cx } from '../ui'
import { ConstructorGrafico } from './ConstructorGrafico'
import { GraficoVista } from './GraficoVista'
import { CLASE_TAMANO, NOMBRE_TAMANO, TAMANOS_GRAFICO } from './rejilla'
import { tarjetasDePanel, useTarjetas, type FixedCardDef } from './tarjetas'

export interface PanelEditableProps {
  dashboardId: DashboardId
  /** Diseño por defecto (lo que se ve sin fila guardada y al restaurar). */
  porDefecto: DashboardDefault
  titulo?: string
  texto?: ReactNode
  /** Acciones de la cabecera de la página (el botón "Editar panel" se añade al final). */
  acciones?: ReactNode
  /** Contenido entre la cabecera y la cuadrícula (avisos de la página). */
  children?: ReactNode
}

type Grafico = { id: number; title: string; module: string }

/** Prefiere el movimiento reducido del sistema (sin animaciones al reordenar). */
function useMovimientoReducido(): boolean {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = () => setR(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return r
}

/**
 * Las tarjetas tienen tamaños distintos: mientras se arrastra no se recolocan (se desbordarían),
 * se marca el hueco de destino y se reordena al soltar.
 */
const sinRecolocar: SortingStrategy = () => null

/** Con ratón, cuenta la tarjeta que hay bajo el puntero; con teclado (sin puntero), la más cercana. */
const colision: CollisionDetection = (args) => {
  const bajo = pointerWithin(args)
  return bajo.length ? bajo : closestCenter(args)
}

const INSTRUCCIONES: ScreenReaderInstructions = {
  draggable: 'Para mover la tarjeta, pulsa Espacio o Intro. Muévela con las flechas y vuelve a pulsar Espacio o Intro para soltarla. Escape cancela el movimiento.'
}

export function PanelEditable({ dashboardId, porDefecto, titulo, texto, acciones, children }: PanelEditableProps) {
  const registro = useTarjetas()
  const fila = useApi('core:dashboards.get', [dashboardId])
  const lista = useApi('core:charts.list', [])
  const disponibles = useMemo(() => tarjetasDePanel(registro, dashboardId), [registro, dashboardId])
  const fijas = useMemo(() => new Map(disponibles.map((t) => [t.id, t])), [disponibles])
  const graficos = useMemo(() => new Map<string, Grafico>((lista.data ?? []).map((g) => [String(g.id), { id: g.id, title: g.title, module: g.module }])), [lista.data])
  const guardadas = useMemo(
    () => (fila.data && lista.data ? mergeDashboard(fila.data.saved ? fila.data.cards : null, porDefecto, [...fijas.keys()], [...graficos.keys()]) : null),
    [fila.data, lista.data, porDefecto, fijas, graficos]
  )

  const [borrador, setBorrador] = useState<DashboardCard[] | null>(null)
  const editando = borrador !== null
  const tarjetas = borrador ?? guardadas
  const [constructor, setConstructor] = useState<{ chartId?: number } | null>(null)
  const [confirmar, setConfirmar] = useState<null | { tipo: 'restaurar' } | { tipo: 'borrar'; grafico: Grafico }>(null)
  const [anuncio, setAnuncio] = useState('')
  const raiz = useRef<HTMLDivElement>(null)
  const botonEditar = useRef<HTMLButtonElement>(null)
  const botonHecho = useRef<HTMLButtonElement>(null)
  const [foco, setFoco] = useState<{ id: string; accion: string } | 'editar' | 'hecho' | 'anadir' | null>(null)
  const reducido = useMovimientoReducido()

  // Si los gráficos cambian mientras se edita (borrado, nuevo), el borrador se queda solo con los que existen.
  useEffect(() => {
    if (borrador && lista.data) {
      const vivos = borrador.filter((c) => c.type !== 'chart' || graficos.has(c.ref))
      if (vivos.length !== borrador.length) setBorrador(vivos)
    }
  }, [borrador, lista.data, graficos])

  // Devolver el foco tras cada cambio de la cuadrícula o del modo.
  useEffect(() => {
    if (!foco) return
    const r = raiz.current
    const t = window.setTimeout(() => {
      if (foco === 'editar') botonEditar.current?.focus()
      else if (foco === 'hecho') botonHecho.current?.focus()
      else if (foco === 'anadir') r?.querySelector<HTMLElement>('[data-anadir] button')?.focus()
      else {
        const tarjeta = r?.querySelector<HTMLElement>(`[data-card-id="${CSS_ESCAPE(foco.id)}"]`)
        const b = tarjeta?.querySelector<HTMLElement>(`[data-accion="${foco.accion}"]:not(:disabled)`) ?? tarjeta?.querySelector<HTMLElement>('[data-accion="mover"]')
        b?.focus()
      }
      setFoco(null)
    }, 0)
    return () => window.clearTimeout(t)
  }, [foco, tarjetas])

  const guardar = useApiMutation('core:dashboards.save', { success: 'Panel guardado', onSuccess: () => (setBorrador(null), setFoco('editar')) })
  const restaurar = useApiMutation('core:dashboards.reset', { success: 'Diseño restaurado', onSuccess: () => (setBorrador(null), setFoco('editar')) })
  const borrar = useApiMutation('core:charts.delete', { success: (r) => (r.removedCards > 1 ? `Gráfico borrado y quitado de ${r.removedCards} tarjetas` : 'Gráfico borrado') })

  const nombreDe = useCallback(
    (c: DashboardCard) => (c.type === 'fixed' ? (fijas.get(c.ref)?.title ?? c.ref) : (graficos.get(c.ref)?.title ?? 'Gráfico')),
    [fijas, graficos]
  )
  const visibles = (tarjetas ?? []).filter((c) => !c.hidden)

  // --- Acciones del borrador ---
  const empezar = () => {
    setBorrador(guardadas ? guardadas.map((c) => ({ ...c })) : [])
    setFoco('hecho')
  }
  const cancelar = () => {
    setBorrador(null)
    setFoco('editar')
  }
  const hecho = () => {
    if (!borrador) return
    if (JSON.stringify(borrador) === JSON.stringify(guardadas)) return cancelar()
    guardar.mutate([dashboardId, borrador])
  }
  const mover = (id: string, delta: -1 | 1) => {
    if (!borrador) return
    const vis = borrador.filter((c) => !c.hidden)
    const i = vis.findIndex((c) => c.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= vis.length) return
    const a = borrador.findIndex((c) => c.id === id)
    const b = borrador.findIndex((c) => c.id === vis[j].id)
    setBorrador(arrayMove(borrador, a, b))
    setAnuncio(`«${nombreDe(vis[i])}» está ahora en la posición ${j + 1} de ${vis.length}.`)
    setFoco({ id, accion: delta < 0 ? 'antes' : 'despues' })
  }
  const tamano = (id: string, size: CardSize) => {
    setBorrador((b) => b && b.map((c) => (c.id === id ? { ...c, size } : c)))
    setFoco({ id, accion: 'tamano' })
  }
  /** Ocultar una fija o quitar un gráfico: el foco pasa a la tarjeta siguiente (o a "Añadir"). */
  const fuera = (id: string, quitar: boolean) => {
    if (!borrador) return
    const vis = borrador.filter((c) => !c.hidden)
    const i = vis.findIndex((c) => c.id === id)
    const siguiente = vis[i + 1] ?? vis[i - 1]
    const c = borrador.find((x) => x.id === id)!
    setBorrador(quitar ? borrador.filter((x) => x.id !== id) : borrador.map((x) => (x.id === id ? { ...x, hidden: true } : x)))
    setAnuncio(quitar ? `«${nombreDe(c)}» se ha quitado del panel.` : `«${nombreDe(c)}» se ha ocultado. Puedes volver a mostrarla con «Añadir tarjeta».`)
    setFoco(siguiente ? { id: siguiente.id, accion: 'mover' } : 'anadir')
  }
  const anadirFija = (def: FixedCardDef) => {
    setBorrador((b) => {
      if (!b) return b
      const ya = b.find((c) => c.type === 'fixed' && c.ref === def.id)
      const resto = b.filter((c) => c !== ya)
      const id = ya?.id ?? (b.some((c) => c.id === fixedCardId(def.id)) ? `${fixedCardId(def.id)}:${b.length}` : fixedCardId(def.id))
      return [...resto, { id, type: 'fixed', ref: def.id, size: ya?.size ?? def.defaultSize, hidden: false }]
    })
    setAnuncio(`«${def.title}» se ha añadido al final del panel.`)
    setFoco({ id: borrador?.find((c) => c.type === 'fixed' && c.ref === def.id)?.id ?? fixedCardId(def.id), accion: 'mover' })
  }
  const anadirGrafico = (g: Pick<SavedChart, 'id' | 'title'>) => {
    const id = chartCardId(g.id, (borrador ?? []).map((c) => c.id))
    setBorrador((b) => (b ? [...b, { id, type: 'chart', ref: String(g.id), size: 'm', hidden: false }] : b))
    setAnuncio(`«${g.title}» se ha añadido al final del panel.`)
    setFoco({ id, accion: 'mover' })
  }

  // --- Arrastrar ---
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = visibles.map((c) => c.id)
  const posicion = (id: string | number) => ids.indexOf(String(id)) + 1
  const nombrePorId = (id: string | number) => {
    const c = visibles.find((x) => x.id === String(id))
    return c ? nombreDe(c) : 'la tarjeta'
  }
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Has cogido «${nombrePorId(active.id)}». Está en la posición ${posicion(active.id)} de ${ids.length}.`,
    onDragOver: ({ active, over }) => (over ? `«${nombrePorId(active.id)}» pasaría a la posición ${posicion(over.id)} de ${ids.length}.` : `«${nombrePorId(active.id)}» no está sobre ninguna posición.`),
    onDragEnd: ({ active, over }) => (over ? `Has soltado «${nombrePorId(active.id)}» en la posición ${posicion(over.id)} de ${ids.length}.` : `Has soltado «${nombrePorId(active.id)}» sin moverla.`),
    onDragCancel: ({ active }) => `Movimiento cancelado. «${nombrePorId(active.id)}» vuelve a la posición ${posicion(active.id)}.`
  }
  const [arrastrada, setArrastrada] = useState<string | null>(null)
  const alCoger = ({ active }: DragStartEvent) => setArrastrada(String(active.id))
  const alSoltar = ({ active, over }: DragEndEvent) => {
    setArrastrada(null)
    if (!borrador || !over || active.id === over.id) return
    const a = borrador.findIndex((c) => c.id === active.id)
    const b = borrador.findIndex((c) => c.id === over.id)
    if (a >= 0 && b >= 0) setBorrador(arrayMove(borrador, a, b))
  }

  // --- Lo que se puede añadir ---
  const enPanel = new Set((tarjetas ?? []).filter((c) => !c.hidden).map((c) => (c.type === 'fixed' ? `f:${c.ref}` : `c:${c.ref}`)))
  const ocultas = disponibles.filter((t) => (tarjetas ?? []).some((c) => c.type === 'fixed' && c.ref === t.id && c.hidden))
  const nuevas = disponibles.filter((t) => !(tarjetas ?? []).some((c) => c.type === 'fixed' && c.ref === t.id))
  const graficosLibres = [...graficos.values()].filter((g) => !enPanel.has(`c:${g.id}`))

  const cargando = !tarjetas && !fila.error && !lista.error
  const accionesCabecera = (
    <>
      {acciones}
      {!editando && (
        <Button ref={botonEditar} icon={<SquaresFour size={16} aria-hidden />} onClick={empezar} disabled={!guardadas}>
          Editar panel
        </Button>
      )}
    </>
  )

  return (
    <div ref={raiz}>
      {titulo ? <PageHeader titulo={titulo} texto={texto} acciones={accionesCabecera} /> : <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{accionesCabecera}</div>}
      {editando && (
        <div role="region" aria-label="Edición del panel" className="elevated sticky top-0 mb-4 flex flex-wrap items-center gap-3 r-card px-4 py-3" style={{ zIndex: 'var(--z-sticky)' }}>
          <p className="t-label min-w-0 flex-1 basis-64 text-ink-2">Arrastra las tarjetas por el asa o usa sus botones. Los cambios se guardan al pulsar «Hecho».</p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span data-anadir>
            <Popover
              etiqueta="Añadir tarjeta"
              alinear="right"
              boton={({ abierto, alternar, id }) => (
                <Button data-popover-trigger icon={<Plus size={16} aria-hidden />} aria-expanded={abierto} aria-controls={id} onClick={alternar}>
                  Añadir tarjeta
                </Button>
              )}
            >
              {(cerrar) => (
                <MenuAnadir
                  ocultas={ocultas}
                  nuevas={nuevas}
                  graficos={graficosLibres}
                  onFija={(d) => (cerrar(), anadirFija(d))}
                  onGrafico={(g) => (cerrar(), anadirGrafico(g))}
                  onNuevo={() => (cerrar(), setConstructor({}))}
                />
              )}
            </Popover>
          </span>
          <Button variant="ghost" icon={<ArrowCounterClockwise size={16} aria-hidden />} onClick={() => setConfirmar({ tipo: 'restaurar' })}>
            Restaurar diseño
          </Button>
          <Button variant="ghost" onClick={cancelar}>
            Cancelar
          </Button>
          <Button ref={botonHecho} variant="primary" onClick={hecho} cargando={guardar.isPending}>
            Hecho
          </Button>
          </div>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {anuncio}
      </div>
      {children}
      {(fila.error || lista.error) && (
        <ErrorState titulo="No se ha podido cargar el panel" texto={(fila.error ?? lista.error)!.message} accion={<Button size="sm" onClick={() => (fila.refetch(), lista.refetch())}>Reintentar</Button>} />
      )}
      {cargando && <LoadingState etiqueta="Cargando el panel" />}
      {tarjetas && (
        <DndContext
          sensors={sensores}
          collisionDetection={colision}
          onDragStart={alCoger}
          onDragEnd={alSoltar}
          onDragCancel={() => setArrastrada(null)}
          // Solo desplazamiento vertical: el contenido nunca se mueve hacia los lados al arrastrar.
          autoScroll={{ threshold: { x: 0, y: 0.15 } }}
          accessibility={{ announcements: anuncios, screenReaderInstructions: INSTRUCCIONES }}
        >
          <SortableContext items={ids} strategy={sinRecolocar} disabled={!editando}>
            <div className="page-grid">
              {visibles.map((c, i) => (
                <Tarjeta
                  key={c.id}
                  card={c}
                  nombre={nombreDe(c)}
                  def={c.type === 'fixed' ? fijas.get(c.ref) : undefined}
                  grafico={c.type === 'chart' ? graficos.get(c.ref) : undefined}
                  editando={editando}
                  primera={i === 0}
                  ultima={i === visibles.length - 1}
                  onMover={(d) => mover(c.id, d)}
                  onTamano={(s) => tamano(c.id, s)}
                  onFuera={() => fuera(c.id, c.type === 'chart')}
                  onEditarGrafico={(id) => setConstructor({ chartId: id })}
                  onBorrarGrafico={(g) => setConfirmar({ tipo: 'borrar', grafico: g })}
                />
              ))}
            </div>
          </SortableContext>
          {/* Fantasma ligero en una capa propia (no se vuelve a dibujar la tarjeta ni desborda el contenido). */}
          {createPortal(
          <DragOverlay dropAnimation={reducido ? null : undefined} zIndex={60}>
            {arrastrada ? (
              <div className="elevated flex h-full items-start gap-2 r-card border border-dashed border-line-strong p-4">
                <DotsSixVertical size={16} aria-hidden />
                <span className="t-label truncate font-semibold text-ink">{nombrePorId(arrastrada)}</span>
              </div>
            ) : null}
          </DragOverlay>,
          document.body
          )}
        </DndContext>
      )}
      {tarjetas && visibles.length === 0 && (
        <div className="card mt-4 flex flex-col items-start gap-3">
          <StatusBadge tono="info">Panel vacío</StatusBadge>
          <p className="t-label text-ink-2">Todas las tarjetas están ocultas. {editando ? 'Vuelve a mostrarlas con «Añadir tarjeta».' : 'Pulsa «Editar panel» para volver a mostrarlas.'}</p>
        </div>
      )}

      {constructor && (
        <ConstructorGrafico
          chartId={constructor.chartId}
          modulo={dashboardId === 'inicio' ? undefined : dashboardId}
          onCerrar={() => setConstructor(null)}
          onGuardado={(g) => {
            setConstructor(null)
            if (constructor.chartId == null) {
              if (editando) anadirGrafico(g)
              else {
                // Nuevo gráfico desde fuera del modo edición: se añade y se guarda el panel.
                const base = guardadas ?? []
                guardar.mutate([dashboardId, [...base, { id: chartCardId(g.id, base.map((c) => c.id)), type: 'chart', ref: String(g.id), size: 'm', hidden: false }]])
              }
            }
          }}
        />
      )}
      {confirmar?.tipo === 'restaurar' && (
        <ConfirmDialog
          titulo="¿Restaurar el diseño del panel?"
          texto="Vuelven las tarjetas de siempre, en su orden y tamaño. Los gráficos que hayas añadido se quitan del panel, pero no se borran."
          confirmar="Restaurar diseño"
          peligro={false}
          onCancelar={() => setConfirmar(null)}
          onConfirmar={() => {
            setConfirmar(null)
            restaurar.mutate([dashboardId])
          }}
        />
      )}
      {confirmar?.tipo === 'borrar' && (
        <ConfirmDialog
          titulo={`¿Borrar el gráfico «${confirmar.grafico.title}»?`}
          texto="Se borra el gráfico y se quita de todos los paneles donde esté (Inicio, Finanzas y Entreno). No se puede deshacer."
          confirmar="Borrar gráfico"
          onCancelar={() => setConfirmar(null)}
          onConfirmar={() => {
            const g = confirmar.grafico
            setConfirmar(null)
            if (borrador) fuera(borrador.find((c) => c.type === 'chart' && c.ref === String(g.id))?.id ?? '', true)
            borrar.mutate([g.id])
          }}
        />
      )}
    </div>
  )
}

/** Escapa un id para usarlo en un selector de atributo. */
const CSS_ESCAPE = (s: string) => (typeof window !== 'undefined' && window.CSS?.escape ? window.CSS.escape(s) : s.replace(/["\\]/g, '\\$&'))

function MenuAnadir({ ocultas, nuevas, graficos, onFija, onGrafico, onNuevo }: { ocultas: FixedCardDef[]; nuevas: FixedCardDef[]; graficos: Grafico[]; onFija: (d: FixedCardDef) => void; onGrafico: (g: Grafico) => void; onNuevo: () => void }) {
  const grupo = (titulo: string, items: ReactNode[]) =>
    items.length > 0 && (
      <div>
        <div className="t-meta mb-1 px-2">{titulo}</div>
        <ul className="flex flex-col">{items}</ul>
      </div>
    )
  const item = (key: string, texto: string, onClick: () => void, icono: ReactNode) => (
    <li key={key}>
      <button type="button" className="t-label flex w-full items-center gap-2 r-control px-2 py-2 text-left text-ink hover:bg-interactive focus-visible:bg-interactive" onClick={onClick}>
        {icono}
        <span className="min-w-0 truncate">{texto}</span>
      </button>
    </li>
  )
  return (
    <div className="flex max-h-96 w-72 flex-col gap-3 overflow-y-auto">
      {grupo('Tarjetas ocultas', ocultas.map((t) => item(`o:${t.id}`, t.title, () => onFija(t), <EyeSlash size={16} aria-hidden />)))}
      {grupo('Tarjetas disponibles', nuevas.map((t) => item(`n:${t.id}`, t.title, () => onFija(t), <SquaresFour size={16} aria-hidden />)))}
      {grupo('Gráficos guardados', graficos.map((g) => item(`g:${g.id}`, g.title, () => onGrafico(g), <ChartLineUp size={16} aria-hidden />)))}
      {ocultas.length + nuevas.length + graficos.length === 0 && <p className="t-label px-2 text-ink-2">Ya está todo en el panel.</p>}
      <div className="border-t border-line pt-3">
        <Button className="w-full" variant="primary" icon={<Plus size={16} aria-hidden />} onClick={onNuevo}>
          Nuevo gráfico
        </Button>
      </div>
    </div>
  )
}

function Tarjeta({
  card,
  nombre,
  def,
  grafico,
  editando,
  primera,
  ultima,
  onMover,
  onTamano,
  onFuera,
  onEditarGrafico,
  onBorrarGrafico
}: {
  card: DashboardCard
  nombre: string
  def?: FixedCardDef
  grafico?: Grafico
  editando: boolean
  primera: boolean
  ultima: boolean
  onMover: (d: -1 | 1) => void
  onTamano: (s: CardSize) => void
  onFuera: () => void
  onEditarGrafico: (id: number) => void
  onBorrarGrafico: (g: Grafico) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, isOver, active } = useSortable({
    id: card.id,
    disabled: !editando,
    transition: null
  })
  const tamanos = card.type === 'fixed' ? (def?.sizes ?? [card.size]) : TAMANOS_GRAFICO
  // Hueco de destino: contorno discontinuo con el color del foco (no solo color: también el rótulo).
  const destino = isOver && !!active && active.id !== card.id
  const estilo = destino ? { outline: 'var(--mark-line) dashed var(--focus)', outlineOffset: 'var(--space-1)', borderRadius: 'var(--radius-card)' } : undefined
  const contenido =
    card.type === 'fixed' ? (
      def ? (
        <def.Component size={card.size} editando={editando} />
      ) : null
    ) : grafico ? (
      <section className="card h-full" data-module={grafico.module === 'core' ? undefined : grafico.module} aria-label={grafico.title}>
        <GraficoVista chartId={grafico.id} titulo={grafico.title} alto={card.size === 's' ? 'var(--chart-h-sm)' : 'var(--chart-h)'} onEditar={() => onEditarGrafico(grafico.id)} />
      </section>
    ) : null
  return (
    <div ref={setNodeRef} style={estilo} data-card-id={card.id} className={cx(CLASE_TAMANO[card.size], 'min-w-0', editando && 'flex flex-col gap-2', isDragging && 'opacity-40')}>
      {editando && (
        <div role="toolbar" aria-label={`Tarjeta «${nombre}»`} className="flex items-center gap-1 r-control border border-dashed border-line-strong bg-raised px-2 py-1">
          <button
            ref={setActivatorNodeRef}
            type="button"
            data-accion="mover"
            className="btn btn-ghost btn-sm btn-icon cursor-grab touch-none active:cursor-grabbing"
            aria-label={`Reordenar «${nombre}» (arrastrar)`}
            {...attributes}
            {...listeners}
          >
            <DotsSixVertical size={16} aria-hidden />
          </button>
          <span className="t-label min-w-0 flex-1 truncate font-semibold text-ink" title={nombre}>{nombre}</span>
          {destino && <StatusBadge tono="info">Irá aquí</StatusBadge>}
          <IconButton size="sm" variant="ghost" data-accion="antes" etiqueta={`Mover «${nombre}» antes`} icono={<ArrowLeft size={16} />} disabled={primera} onClick={() => onMover(-1)} />
          <IconButton size="sm" variant="ghost" data-accion="despues" etiqueta={`Mover «${nombre}» después`} icono={<ArrowRight size={16} />} disabled={ultima} onClick={() => onMover(1)} />
          {tamanos.length > 1 && (
            <Select className="w-28 shrink-0" tamano="sm" label={`Tamaño de «${nombre}»`} ocultarEtiqueta data-accion="tamano" value={card.size} onChange={(e) => onTamano(e.target.value as CardSize)}>
              {tamanos.map((s) => (
                <option key={s} value={s}>
                  {NOMBRE_TAMANO[s]}
                </option>
              ))}
            </Select>
          )}
          {card.type === 'chart' && grafico && <IconButton size="sm" variant="ghost" data-accion="editar" etiqueta={`Editar el gráfico «${nombre}»`} icono={<PencilSimple size={16} />} onClick={() => onEditarGrafico(grafico.id)} />}
          {card.type === 'chart' && grafico && <IconButton size="sm" variant="ghost" data-accion="borrar" etiqueta={`Borrar el gráfico «${nombre}»`} icono={<Trash size={16} />} onClick={() => onBorrarGrafico(grafico)} />}
          <IconButton size="sm" variant="ghost" data-accion="fuera" etiqueta={card.type === 'fixed' ? `Ocultar «${nombre}»` : `Quitar «${nombre}» del panel`} icono={card.type === 'fixed' ? <EyeSlash size={16} /> : <X size={16} />} onClick={onFuera} />
        </div>
      )}
      <div className={cx('min-w-0', editando ? 'flex-1' : 'h-full')}>{contenido}</div>
    </div>
  )
}
