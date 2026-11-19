import { ArrowClockwise, Plus, Tray, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button, Checkbox, DatePicker, IconButton, SegmentedControl, Select, Switch, TextField, type BtnVariant } from '../ui/controls'
import { ConfirmDialog, Count, EmptyState, ErrorState, LoadingState, Modal, Popover, StatusBadge, Tag, Toast, Tooltip, useToast } from '../ui/feedback'
import { Bloque, Etiqueta, Ficha } from './ficha'

const VARIANTES: [BtnVariant, string][] = [
  ['primary', 'Primario'],
  ['accent', 'Acento'],
  ['secondary', 'Secundario'],
  ['ghost', 'Fantasma'],
  ['danger', 'Peligro']
]
const ESTADOS: [string, 'hover' | 'active' | 'focus' | undefined, boolean, boolean][] = [
  ['Normal', undefined, false, false],
  ['Hover', 'hover', false, false],
  ['Pulsado', 'active', false, false],
  ['Foco', 'focus', false, false],
  ['Deshabilitado', undefined, true, false],
  ['Cargando', undefined, false, true]
]

export function Componentes() {
  const [seg, setSeg] = useState<'semana' | 'mes' | 'bloque'>('mes')
  const [sw, setSw] = useState(true)
  const [chk, setChk] = useState(true)
  const [fecha, setFecha] = useState('2026-11-19')
  const [modal, setModal] = useState(false)
  const [conf, setConf] = useState(false)
  const toast = useToast()

  return (
    <>
      <Bloque id="botones" titulo="Botones" texto="Cinco variantes, tres tamaños y siete estados. El botón principal sigue la regla de Fundamentos.">
        <Ficha
          nombre="Button"
          id="button"
          uso="Primario para la acción principal de la vista (una sola); acento para confirmar en un diálogo; secundario para acciones habituales; fantasma en barras de herramientas; peligro para acciones destructivas."
          teclado="Tab llega al botón; Intro o Espacio lo activan. El anillo de foco se ve sobre cualquier superficie. Un botón deshabilitado sale del orden de foco."
          bien={{ nodo: <div className="flex gap-2"><Button>Cancelar</Button><Button variant="primary">Guardar</Button></div>, texto: 'Un primario y el resto secundarios; el verbo dice qué ocurre.' }}
          mal={{ nodo: <div className="flex gap-2"><Button variant="primary">Aceptar</Button><Button variant="primary">Guardar</Button></div>, texto: 'Dos primarios compiten y «Aceptar» no dice qué hace.' }}
        >
          <div className="overflow-x-auto">
            <table className="t-label w-full">
              <caption className="sr-only">Estados de cada variante de botón</caption>
              <thead>
                <tr className="text-left text-ink-2">
                  <th className="py-2 pr-4 font-semibold">Variante</th>
                  {ESTADOS.map(([n]) => (
                    <th key={n} className="py-2 pr-4 font-semibold">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VARIANTES.map(([v, n]) => (
                  <tr key={v} className="border-t border-line">
                    <th scope="row" className="py-3 pr-4 text-left font-medium text-ink">
                      {n}
                    </th>
                    {ESTADOS.map(([e, forzar, off, carga]) => (
                      <td key={e} className="py-3 pr-4">
                        <Button variant={v} estado={forzar} disabled={off} cargando={carga} size="sm">
                          {carga ? 'Guardando' : n}
                        </Button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Etiqueta>Tamaños: 32, 40 y 48 px</Etiqueta>
            <Button size="sm">Pequeño</Button>
            <Button>Normal</Button>
            <Button size="lg">Grande</Button>
            <Button variant="primary" icon={<Plus size={16} weight="bold" />} kbd="N">
              Con icono y atajo
            </Button>
          </div>
        </Ficha>

        <Ficha
          nombre="IconButton"
          id="iconbutton"
          uso="Acciones conocidas que no necesitan texto (cerrar, plegar, editar). Siempre con nombre accesible y, si no es evidente, con tooltip."
          teclado="Igual que un botón. El nombre accesible se lee en voz alta; el tooltip aparece con el foco."
          bien={{ nodo: <Tooltip texto="Editar categoría"><IconButton variant="ghost" etiqueta="Editar categoría" icono={<Plus size={16} />} /></Tooltip>, texto: 'Nombre accesible y tooltip.' }}
          mal={{ nodo: <button className="btn btn-ghost btn-icon" type="button"><Trash size={16} /></button>, texto: 'Sin nombre accesible: un lector de pantalla solo dice «botón».' }}
        >
          <div className="flex flex-wrap gap-3">
            {ESTADOS.map(([n, forzar, off]) => (
              <div key={n} className="flex flex-col items-center gap-2">
                <IconButton variant="secondary" etiqueta={n} estado={forzar} disabled={off} icono={<Plus size={16} />} />
                <span className="t-meta">{n}</span>
              </div>
            ))}
          </div>
        </Ficha>
      </Bloque>

      <Bloque id="campos" titulo="Campos y selección" texto="Borde de 3:1 contra la superficie, foco de alto contraste y los mensajes de error con icono y texto.">
        <Ficha
          nombre="TextField"
          id="textfield"
          uso="Texto o número de una línea. La etiqueta va siempre visible, la unidad dentro del campo y la ayuda o el error debajo."
          teclado="Tab entra y sale. Intro envía el formulario. El error se anuncia y el foco va al primer campo con error."
          bien={{ nodo: <TextField label="Mínimo de liquidez" unidad="€" defaultValue="1.500,00" ayuda="Por debajo, el panel te avisa." className="[&_input]:text-right" />, texto: 'Etiqueta, unidad y ayuda.' }}
          mal={{ nodo: <input className="input" placeholder="Mínimo de liquidez (en euros)" aria-label="Mínimo" />, texto: 'La etiqueta es el placeholder y desaparece al escribir.' }}
        >
          <div className="auto-grid-wide">
            <TextField label="Normal" placeholder="Escribe aquí" />
            <TextField label="Hover" placeholder="Escribe aquí" estado="hover" />
            <TextField label="Foco" defaultValue="Con foco" estado="focus" />
            <TextField label="Error" defaultValue="45" unidad="días" error="Introduce un número entero entre 0 y 30." className="[&_input]:text-right" />
            <TextField label="Deshabilitado" value="EUR" disabled readOnly />
            <TextField label="Pequeño (32 px)" tamano="sm" placeholder="Compacto" />
          </div>
        </Ficha>

        <Ficha
          nombre="Select"
          id="select"
          uso="Elegir una opción de una lista corta y conocida. Para más de unas 15 opciones o para buscar, usa el buscador."
          teclado="Tab entra; flechas cambian de opción; Alt+↓ abre la lista; Esc la cierra."
          bien={{ nodo: <Select label="Cuenta" defaultValue="Tarjeta"><option>Cuenta corriente</option><option>Tarjeta</option></Select>, texto: 'Pocas opciones, etiqueta visible.' }}
          mal={{ nodo: <p className="t-label">Un desplegable con 80 categorías sin buscador.</p>, texto: 'Demasiadas opciones: hay que poder buscar.' }}
        >
          <div className="auto-grid-wide">
            <Select label="Normal"><option>Cuenta corriente</option><option>Tarjeta</option></Select>
            <Select label="Error" error="Elige una cuenta distinta de la de origen."><option>Cuenta corriente</option></Select>
          </div>
        </Ficha>

        <Ficha
          nombre="SegmentedControl"
          id="segmented"
          uso="Alternar entre 2 a 4 vistas o modos excluyentes que cambian lo que se ve (Gasto, Ingreso, Transferencia; Semana, Mes, Bloque)."
          teclado="Tab entra al grupo; las flechas cambian de opción y la seleccionan; Tab sale del grupo."
          bien={{ nodo: <SegmentedControl label="Periodo" value={seg} onChange={setSeg} opciones={[{ id: 'semana', texto: 'Semana' }, { id: 'mes', texto: 'Mes' }, { id: 'bloque', texto: 'Bloque' }]} />, texto: 'Pocas opciones, una siempre seleccionada.' }}
          mal={{ nodo: <p className="t-label">Un segmentado con 9 opciones o acciones que no son excluyentes.</p>, texto: 'Para acciones sueltas usa botones; para muchas opciones, un Select.' }}
        >
          <div className="flex flex-wrap items-center gap-6">
            <SegmentedControl label="Periodo" value={seg} onChange={setSeg} opciones={[{ id: 'semana', texto: 'Semana' }, { id: 'mes', texto: 'Mes' }, { id: 'bloque', texto: 'Bloque' }]} />
            <SegmentedControl label="Periodo (pequeño)" tamano="sm" value={seg} onChange={setSeg} opciones={[{ id: 'semana', texto: 'Semana' }, { id: 'mes', texto: 'Mes' }, { id: 'bloque', texto: 'Bloque', desactivada: true }]} />
            <Switch checked={sw} onChange={setSw} label="Avisar de duplicados" />
            <Checkbox checked={chk} onChange={setChk} label="Incluir anulados" />
          </div>
        </Ficha>

        <Ficha
          nombre="DatePicker"
          id="datepicker"
          uso="Elegir una fecha concreta. Muestra el formato dd/mm/aaaa y un calendario con semanas que empiezan en lunes."
          teclado="Intro abre el calendario; las flechas mueven el día; Intro elige; Esc cierra y el foco vuelve al campo."
          bien={{ nodo: <DatePicker label="Fecha" value={fecha} onChange={setFecha} />, texto: 'Formato español y calendario accesible.' }}
          mal={{ nodo: <p className="t-label">Un campo de texto libre «19-11-26».</p>, texto: 'Formato ambiguo y sin ayuda para elegir.' }}
        >
          <DatePicker label="Fecha del movimiento" value={fecha} onChange={setFecha} ayuda="Pulsa el campo para abrir el calendario." />
        </Ficha>
      </Bloque>

      <Bloque id="feedback" titulo="Estados, avisos y superposiciones" texto="Un estado nunca va solo con color: lleva icono y texto. Las superposiciones atrapan el foco y lo devuelven al cerrarse.">
        <Ficha
          nombre="StatusBadge"
          id="statusbadge"
          uso="Estado inline con icono y texto (éxito, aviso, error, información). Las etiquetas de clasificación (recurrente, reembolso, pendiente, posible duplicado) usan un único estilo: Tag."
          teclado="No es interactivo. El texto es lo que lee el lector de pantalla."
          bien={{ nodo: <StatusBadge tono="warning">2 movimientos por revisar</StatusBadge>, texto: 'Icono, texto y color suman.' }}
          mal={{ nodo: <span className="inline-block size-3 r-full bg-warning" aria-hidden />, texto: 'Un punto de color sin texto: no se entiende sin ver el color.' }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <StatusBadge tono="success">Por encima del mínimo</StatusBadge>
              <StatusBadge tono="warning">Proyección por debajo del objetivo</StatusBadge>
              <StatusBadge tono="error">No se pudo guardar</StatusBadge>
              <StatusBadge tono="info">Algo por delante del ritmo</StatusBadge>
              <StatusBadge tono="neutral">Sin cambios</StatusBadge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag>recurrente</Tag>
              <Tag tono="accent">reembolso</Tag>
              <Tag tono="warning">pendiente</Tag>
              <Tag tono="warning">posible duplicado</Tag>
              <Count tono="warning" label="2 por revisar">2</Count>
            </div>
          </div>
        </Ficha>

        <Ficha
          nombre="Tooltip"
          id="tooltip"
          uso="Nombra un icono o completa un texto truncado. No guarda información imprescindible ni acciones."
          teclado="Aparece al enfocar con Tab, no solo al pasar el ratón; Esc lo cierra; el elemento queda descrito con aria-describedby."
          bien={{ nodo: <Tooltip texto="Plegar barra (Ctrl B)" abierto lado="bottom"><IconButton variant="ghost" etiqueta="Plegar la barra lateral" icono={<Plus size={16} />} /></Tooltip>, texto: 'Nombra el icono y enseña el atajo.' }}
          mal={{ nodo: <p className="t-label">Un tooltip con un párrafo y un botón dentro.</p>, texto: 'Desaparece al mover el ratón: usa un Popover o un Modal.' }}
        >
          <div className="flex gap-8 pb-8 pt-2">
            <Tooltip texto="Nuevo movimiento (N)" abierto lado="bottom">
              <IconButton variant="primary" etiqueta="Nuevo movimiento" icono={<Plus size={16} weight="bold" />} />
            </Tooltip>
          </div>
        </Ficha>

        <Ficha
          nombre="Popover"
          id="popover"
          uso="Un panel pequeño anclado a un botón con controles (el calendario, los filtros de una columna)."
          teclado="Intro abre; Tab recorre su contenido; Esc cierra y el foco vuelve al botón; el clic fuera también cierra."
          bien={{ nodo: <p className="t-label">El calendario del DatePicker.</p>, texto: 'Contenido breve, ligado a un botón.' }}
          mal={{ nodo: <p className="t-label">Un formulario de diez campos en un popover.</p>, texto: 'Para formularios largos usa un Modal.' }}
        >
          <Popover etiqueta="Ejemplo" boton={({ abierto, alternar }) => <Button data-popover-trigger aria-expanded={abierto} onClick={alternar}>Abrir popover</Button>}>
            {(cerrar) => (
              <div className="flex w-64 flex-col gap-3">
                <p className="t-label">Contenido anclado al botón.</p>
                <Button size="sm" onClick={cerrar}>Cerrar</Button>
              </div>
            )}
          </Popover>
        </Ficha>

        <Ficha
          nombre="Modal"
          id="modal"
          uso="Una tarea que necesita atención completa (nuevo movimiento) o una confirmación de algo delicado (anular, restaurar)."
          teclado="El foco entra al primer campo; Tab y Mayús+Tab no salen del diálogo; Esc lo cierra; al cerrar, el foco vuelve al botón que lo abrió."
          bien={{ nodo: <p className="t-label">«¿Anular este movimiento?» con «Cancelar» enfocado y «Anular movimiento» en rojo.</p>, texto: 'Pregunta clara y botones con verbo; el destructivo no recibe el foco inicial.' }}
          mal={{ nodo: <p className="t-label">«¿Seguro?» con «Sí» y «No».</p>, texto: 'No dice qué pasa y los botones no tienen verbo.' }}
        >
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setModal(true)}>Abrir modal</Button>
            <Button variant="danger" onClick={() => setConf(true)}>Abrir confirmación</Button>
          </div>
          {modal && (
            <Modal titulo="Modal de ejemplo" descripcion="Prueba Tab, Mayús+Tab y Esc." onCerrar={() => setModal(false)} pie={<Button variant="accent" onClick={() => setModal(false)}>Hecho</Button>}>
              <TextField label="Campo de ejemplo" placeholder="El foco empieza aquí" />
            </Modal>
          )}
          {conf && <ConfirmDialog titulo="¿Anular este movimiento?" texto="Dejará de contar en tus cifras, pero se conserva en el historial." confirmar="Anular movimiento" onCancelar={() => setConf(false)} onConfirmar={() => setConf(false)} />}
        </Ficha>

        <Ficha
          nombre="Toast"
          id="toast"
          uso="Confirma algo ya hecho («Movimiento guardado»). Se va solo a los 5 segundos y no pide nada."
          teclado="Se anuncia con aria-live sin quitar el foco. Se puede cerrar con su botón."
          bien={{ nodo: <Toast tono="success">Movimiento guardado</Toast>, texto: 'Confirma sin interrumpir.' }}
          mal={{ nodo: <p className="t-label">Un toast con «¿Quieres deshacer?» que desaparece en 5 s.</p>, texto: 'Si pide una decisión, usa un Modal.' }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Toast tono="success">Movimiento guardado</Toast>
            <Toast tono="error" onCerrar={() => {}}>No se pudo guardar</Toast>
            <Button onClick={() => toast({ tono: 'success', texto: 'Ajustes guardados' })}>Lanzar un toast</Button>
          </div>
        </Ficha>

        <Ficha
          nombre="EmptyState, LoadingState y ErrorState"
          id="estados"
          uso="Vacío cuando aún no hay datos; carga mientras llegan (esqueleto con la forma de lo que viene); error cuando algo falla, con una salida."
          teclado="El estado de carga avisa con role=status; el error con role=alert. El botón de reintento es el primer elemento enfocable."
          bien={{ nodo: <EmptyState compacto icono={<Tray size={20} />} titulo="Aún no hay movimientos" texto="Añade el primero con N." />, texto: 'Dice qué falta y cómo seguir.' }}
          mal={{ nodo: <p className="t-label">Un espacio en blanco o «No hay datos».</p>, texto: 'No explica nada ni ofrece salida.' }}
        >
          <div className="auto-grid-wide">
            <div className="r-card border border-line p-4">
              <Etiqueta>Vacío</Etiqueta>
              <EmptyState icono={<Tray size={24} weight="duotone" />} titulo="Aún no hay movimientos" texto="Añade el primero con N o importa tu Excel." accion={<Button variant="accent" size="sm" icon={<Plus size={14} weight="bold" />}>Nuevo movimiento</Button>} />
            </div>
            <div className="r-card border border-line p-4">
              <Etiqueta>Cargando</Etiqueta>
              <LoadingState filas={4} />
            </div>
            <div className="r-card border border-line p-4">
              <Etiqueta>Error</Etiqueta>
              <ErrorState titulo="No se han podido leer los datos" texto="La base está bloqueada por otro programa. Ciérralo e inténtalo de nuevo." accion={<Button size="sm" icon={<ArrowClockwise size={14} />}>Reintentar</Button>} />
            </div>
          </div>
        </Ficha>
      </Bloque>
    </>
  )
}
