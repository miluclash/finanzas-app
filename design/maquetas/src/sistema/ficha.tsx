import { CheckCircle, XCircle } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { contraste, cx } from '../lib'

/** Re-renderiza cuando cambia data-theme, para releer los valores de los tokens */
export function useTemaAttr() {
  const [t, setT] = useState(document.documentElement.dataset.theme)
  useEffect(() => {
    const o = new MutationObserver(() => setT(document.documentElement.dataset.theme))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => o.disconnect()
  }, [])
  return t
}

export function Bloque({ id, titulo, texto, children }: { id: string; titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-24" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="t-section">
        {titulo}
      </h2>
      {texto && <p className="t-label mt-2 max-w-3xl">{texto}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}

/** Ficha de un componente: qué es, cuándo se usa, cómo se maneja con teclado, variantes y un ejemplo correcto y otro incorrecto */
export function Ficha({ nombre, uso, teclado, children, bien, mal, id }: { nombre: string; uso: string; teclado: string; children: ReactNode; bien?: { nodo: ReactNode; texto: string }; mal?: { nodo: ReactNode; texto: string }; id?: string }) {
  return (
    <article id={id ?? nombre.toLowerCase()} className="card mb-6 scroll-mt-24" aria-labelledby={`f-${nombre}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`f-${nombre}`} className="t-card-title" style={{ fontSize: 'var(--fs-section)' }}>
          {nombre}
        </h3>
      </div>
      <dl className="auto-grid-wide mb-6">
        <div>
          <dt className="t-meta font-semibold">Cuándo se usa</dt>
          <dd className="t-label mt-1">{uso}</dd>
        </div>
        <div>
          <dt className="t-meta font-semibold">Con teclado</dt>
          <dd className="t-label mt-1">{teclado}</dd>
        </div>
      </dl>
      <div className="mb-6">{children}</div>
      {(bien || mal) && (
        <div className="auto-grid-wide border-t border-line pt-6">
          {bien && (
            <figure>
              <div className="r-card border border-success p-4">{bien.nodo}</div>
              <figcaption className="t-label mt-2 flex items-start gap-2">
                <CheckCircle size={18} weight="fill" className="mt-px shrink-0 text-success" aria-hidden />
                <span>
                  <b className="font-semibold text-ink">Correcto.</b> {bien.texto}
                </span>
              </figcaption>
            </figure>
          )}
          {mal && (
            <figure>
              <div className="r-card border border-error p-4">{mal.nodo}</div>
              <figcaption className="t-label mt-2 flex items-start gap-2">
                <XCircle size={18} weight="fill" className="mt-px shrink-0 text-error" aria-hidden />
                <span>
                  <b className="font-semibold text-ink">Incorrecto.</b> {mal.texto}
                </span>
              </figcaption>
            </figure>
          )}
        </div>
      )}
    </article>
  )
}

export const Etiqueta = ({ children }: { children: ReactNode }) => <div className="t-meta mb-2 font-semibold">{children}</div>

/** Muestra de color: lee el valor real del token en el ámbito donde está */
export function Sw({ v, texto }: { v: string; texto?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hex, setHex] = useState('')
  const tema = useTemaAttr()
  useLayoutEffect(() => {
    if (ref.current) setHex(getComputedStyle(ref.current).getPropertyValue('--' + v).trim())
  })
  return (
    <div ref={ref} className="flex min-w-0 flex-col gap-2" data-t={tema}>
      <div className="h-12 r-control border border-line-strong" style={{ background: `var(--${v})` }} />
      <div className="min-w-0">
        <div className="t-label truncate font-semibold text-ink">{texto ?? v}</div>
        <div className="t-meta tnum uppercase">{hex.startsWith('var') ? '= ' + hex.slice(6, -1) : hex}</div>
      </div>
    </div>
  )
}
export const FilaSw = ({ titulo, children, min = '8rem' }: { titulo: string; children: ReactNode; min?: string }) => (
  <div>
    <Etiqueta>{titulo}</Etiqueta>
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))` }}>
      {children}
    </div>
  </div>
)

/** Tabla de contrastes reales, medidos con los valores de los tokens en el ámbito actual */
export function TablaContrastes({ pares, titulo }: { pares: [string, string, number, string][]; titulo: string }) {
  const ref = useRef<HTMLTableElement>(null)
  const [filas, setFilas] = useState<{ a: string; b: string; r: number; min: number; d: string }[]>([])
  const tema = useTemaAttr()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const cs = getComputedStyle(el)
    const val = (k: string) => cs.getPropertyValue('--' + k).trim()
    setFilas(pares.map(([a, b, min, d]) => ({ a, b, min, d, r: contraste(val(a), val(b)) })))
  }, [pares, tema])
  return (
    <table ref={ref} className="w-full t-label tnum" data-t={tema}>
      <caption className="sr-only">{titulo}</caption>
      <thead>
        <tr className="text-left text-ink-2">
          <th className="py-2 pr-4 font-semibold">Par</th>
          <th className="py-2 pr-4 font-semibold">Para qué</th>
          <th className="py-2 pr-4 text-right font-semibold">Contraste</th>
          <th className="py-2 pr-4 text-right font-semibold">Mínimo</th>
          <th className="py-2 font-semibold">Resultado</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.a + f.b} className="border-t border-line">
            <td className="py-2 pr-4 text-ink">
              {f.a} sobre {f.b}
            </td>
            <td className="py-2 pr-4 text-ink-2">{f.d}</td>
            <td className="py-2 pr-4 text-right text-ink">{f.r.toFixed(2).replace('.', ',')}:1</td>
            <td className="py-2 pr-4 text-right text-ink-2">{String(f.min).replace('.', ',')}:1</td>
            <td className={cx('py-2 font-semibold', f.r >= f.min ? 'text-success' : 'text-error')}>{f.r >= f.min ? 'Cumple AA' : 'No cumple'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
