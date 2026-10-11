// Avisos breves (éxito / error) sin dependencias.
type Kind = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  kind: Kind
  text: string
}

let items: ToastItem[] = []
let seq = 1
const listeners = new Set<(t: ToastItem[]) => void>()

function emit() {
  for (const l of listeners) l(items)
}

function push(kind: Kind, text: string) {
  const id = seq++
  items = [...items, { id, kind, text }]
  emit()
  setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500)
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

export function subscribe(fn: (t: ToastItem[]) => void): () => void {
  listeners.add(fn)
  fn(items)
  return () => listeners.delete(fn)
}

export const toast = {
  success: (t: string) => push('success', t),
  error: (t: string) => push('error', t),
  info: (t: string) => push('info', t)
}
