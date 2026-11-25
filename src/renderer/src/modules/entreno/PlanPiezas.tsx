// Piezas que comparten la semana concreta y el boceto: los días con sus huecos, el menú «Mover a…» y el formulario de un hueco.
import { ArrowDown, ArrowsLeftRight, ArrowUp, Clock, Moon, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Routine, WorkoutKind } from '@shared/modules/entreno/types'
import { Aviso, Button, IconButton, Modal, Popover, Select, Tag, TextField, Tooltip } from '../../core/ui'
import { KIND_LABEL } from './format'
import { KIND_ICON } from './Piezas'

export type HuecoVista = {
  key: string
  nombre: string
  kind: WorkoutKind
  time: string | null
  note?: string | null
  /** El tipo de entreno está desactivado: se ve en el plan, pero ya no se ofrece al planificar. */
  inactivo?: boolean
}
export type DiaVista = { id: string; titulo: string; subtitulo?: string; hoy?: boolean; huecos: HuecoVista[] }

type DiasProps = {
  dias: DiaVista[]
  etiqueta: string
  ocupado?: boolean
  onAñadir: (dia: number) => void
  onEditar: (dia: number, hueco: number) => void
  onQuitar: (dia: number, hueco: number) => void
  onMover: (dia: number, hueco: number, destino: number) => void
  onReordenar: (dia: number, hueco: number, delta: -1 | 1) => void
}

/** Un icono con su explicación al pasar el ratón o al enfocarlo. */
function Accion({ texto, children }: { texto: string; children: React.ReactElement }) {
  return <Tooltip texto={texto}>{children}</Tooltip>
}

/** Los días de la semana en una lista vertical: se lee igual en ventanas estrechas y se recorre bien con teclado. */
export function DiasPlan({ dias, etiqueta, ocupado, onAñadir, onEditar, onQuitar, onMover, onReordenar }: DiasProps) {
  return (
    <ol className="divide-line r-card border border-line bg-card" aria-label={etiqueta}>
      {dias.map((dia, di) => (
        <li key={dia.id} className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-4" aria-label={dia.subtitulo ? `${dia.titulo} ${dia.subtitulo}` : dia.titulo}>
          <div className="w-32 shrink-0 pt-1">
            <h3 className="t-body font-semibold">{dia.titulo}</h3>
            {dia.subtitulo && <p className="t-meta tnum">{dia.subtitulo}</p>}
            {dia.hoy && (
              <Tag tono="accent" className="mt-2">
                Hoy
              </Tag>
            )}
          </div>
          <div className="min-w-64 flex-1">
            {dia.huecos.length === 0 ? (
              <p className="t-label flex h-9 items-center gap-2 text-ink-3">
                <Moon size={16} aria-hidden /> Descanso
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dia.huecos.map((h, hi) => {
                  const I = KIND_ICON[h.kind]
                  return (
                    <li key={h.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 r-control border border-line bg-raised py-2 pl-3 pr-2">
                      <I size={18} weight="duotone" className="shrink-0 text-accent-text" aria-hidden />
                      <span className="t-body min-w-0 max-w-64 truncate font-semibold" title={h.nombre}>
                        {h.nombre}
                      </span>
                      <span className="t-meta">{KIND_LABEL[h.kind]}</span>
                      {h.inactivo && <Tag>Desactivado</Tag>}
                      {h.time && (
                        <Tag icono={<Clock size={14} aria-hidden />} className="tnum">
                          {h.time}
                        </Tag>
                      )}
                      {h.note && (
                        <span className="t-meta max-w-48 truncate" title={h.note}>
                          {h.note}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        <Accion texto="Subir en el día">
                          <IconButton variant="ghost" size="sm" etiqueta={`Subir ${h.nombre} en el ${dia.titulo}`} icono={<ArrowUp size={16} />} disabled={ocupado || hi === 0} onClick={() => onReordenar(di, hi, -1)} />
                        </Accion>
                        <Accion texto="Bajar en el día">
                          <IconButton variant="ghost" size="sm" etiqueta={`Bajar ${h.nombre} en el ${dia.titulo}`} icono={<ArrowDown size={16} />} disabled={ocupado || hi === dia.huecos.length - 1} onClick={() => onReordenar(di, hi, 1)} />
                        </Accion>
                        <Popover
                          etiqueta={`Mover ${h.nombre} a otro día`}
                          alinear="right"
                          boton={({ abierto, alternar }) => (
                            <Accion texto="Mover a otro día">
                              <IconButton data-popover-trigger variant="ghost" size="sm" etiqueta={`Mover ${h.nombre} del ${dia.titulo} a otro día`} icono={<ArrowsLeftRight size={16} />} aria-haspopup="dialog" aria-expanded={abierto} disabled={ocupado} onClick={alternar} />
                            </Accion>
                          )}
                        >
                          {(cerrar) => <MenuDias dias={dias} actual={di} onElegir={(d) => (cerrar(), onMover(di, hi, d))} />}
                        </Popover>
                        <Accion texto="Cambiar hora o tipo">
                          <IconButton variant="ghost" size="sm" etiqueta={`Editar ${h.nombre} del ${dia.titulo}`} icono={<PencilSimple size={16} />} disabled={ocupado} onClick={() => onEditar(di, hi)} />
                        </Accion>
                        <Accion texto="Quitar del plan">
                          <IconButton variant="ghost" size="sm" etiqueta={`Quitar ${h.nombre} del ${dia.titulo}`} icono={<Trash size={16} />} disabled={ocupado} onClick={() => onQuitar(di, hi)} />
                        </Accion>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <Button size="sm" variant="ghost" icon={<Plus size={14} weight="bold" aria-hidden />} aria-label={`Añadir un entreno el ${dia.titulo}`} disabled={ocupado} onClick={() => onAñadir(di)}>
            Añadir
          </Button>
        </li>
      ))}
    </ol>
  )
}

/** «Mover a…»: un botón por día; el actual sale deshabilitado. */
function MenuDias({ dias, actual, onElegir }: { dias: DiaVista[]; actual: number; onElegir: (dia: number) => void }) {
  const primero = dias.findIndex((_, i) => i !== actual)
  return (
    <div className="w-52">
      <p className="t-meta mb-2 font-semibold">Mover a…</p>
      <ul className="flex flex-col gap-1">
        {dias.map((d, i) => (
          <li key={d.id}>
            <Button variant="ghost" size="sm" className="w-full !justify-start" disabled={i === actual} autoFocus={i === primero} onClick={() => onElegir(i)}>
              {d.titulo}
              <span className="t-meta tnum ml-auto">{i === actual ? 'Día actual' : d.subtitulo}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ======================= Añadir o editar un hueco ======================= */
export type HuecoForm = { routineId: number; time: string | null; note: string | null }
type RutinaOpcion = Pick<Routine, 'id' | 'name' | 'kind'>

export function HuecoModal({
  titulo,
  descripcion,
  rutinas,
  inicial,
  conNota,
  guardando,
  onGuardar,
  onCerrar,
  onCrearTipos
}: {
  titulo: string
  descripcion?: string
  rutinas: RutinaOpcion[]
  inicial?: HuecoForm
  conNota?: boolean
  guardando?: boolean
  onGuardar: (v: HuecoForm) => void
  onCerrar: () => void
  onCrearTipos: () => void
}) {
  const [rutina, setRutina] = useState(inicial ? String(inicial.routineId) : '')
  const [hora, setHora] = useState(inicial?.time ?? '')
  const [nota, setNota] = useState(inicial?.note ?? '')
  const [intentado, setIntentado] = useState(false)
  const primero = useRef<HTMLSelectElement>(null)
  const error = intentado && !rutina ? 'Elige un tipo de entreno.' : undefined
  const enviar = () => {
    setIntentado(true)
    if (!rutina) return
    onGuardar({ routineId: Number(rutina), time: hora || null, note: nota.trim() || null })
  }
  return (
    <Modal
      titulo={titulo}
      descripcion={descripcion}
      ancho="sm"
      inicial={primero}
      onCerrar={onCerrar}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={enviar} cargando={guardando} disabled={rutinas.length === 0}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          enviar()
        }}
      >
        {rutinas.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="t-label">Aún no tienes ningún tipo de entreno activo. Créalos primero (por ejemplo «Fuerza A» o «Natación») y vuelve aquí.</p>
            <Button size="sm" onClick={onCrearTipos}>
              Ir a Tipos de entreno
            </Button>
          </div>
        ) : (
          <>
            <Select ref={primero} label="Tipo de entreno" value={rutina} onChange={(e) => setRutina(e.target.value)} error={error}>
              <option value="">Elige uno…</option>
              {rutinas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {KIND_LABEL[r.kind]}
                </option>
              ))}
            </Select>
            <TextField label="Hora (opcional)" type="time" value={hora} onChange={(e) => setHora(e.target.value)} ayuda="Déjala vacía si no tienes hora fija." className="w-44" />
            {conNota && <TextField label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} autoComplete="off" />}
          </>
        )}
        {/* Intro envía el formulario aunque no haya botón de envío visible */}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/** Error que devuelve el proceso principal dentro de un formulario. Se pone a la vista aunque el formulario esté desplazado. */
export function ErrorDeServidor({ texto, children }: { texto: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [texto])
  return (
    <div ref={ref}>
      <Aviso tono="error">
        <div>{texto}</div>
        {children}
      </Aviso>
    </div>
  )
}
