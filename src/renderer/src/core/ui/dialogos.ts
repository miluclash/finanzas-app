/** Diálogos y capas abiertas: los atajos de teclado globales (Ctrl+K, Ctrl+B, N, T) no actúan debajo de ellas */
const MODAL = 'dialog[open], [role="dialog"][aria-modal="true"]'
/** Popover abierto (calendario, menús): no es modal, pero tiene el foco y los atajos de una tecla no deben dispararse */
const POPOVER = '[data-popover-panel]'

/** Hay un diálogo modal abierto: editor, confirmación, buscador de comandos o asistente superpuesto */
export function hayDialogoModal(): boolean {
  return !!document.querySelector(MODAL)
}
/** Hay un diálogo modal o un popover abierto */
export function hayCapaAbierta(): boolean {
  return !!document.querySelector(`${MODAL}, ${POPOVER}`)
}
