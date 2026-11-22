import { CaretDown, CaretRight, FunnelSimple, X } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { formatEur } from '@shared/money'
import { cx } from './cx'
import { Button } from './controls'
import { Count, Tag } from './feedback'

/* ======================= Cifras ======================= */
/** Importe grande: euros a tamaño completo y céntimos más pequeños y apagados */
export function CifraEur({ cents, signo }: { cents: number; signo?: boolean }) {
  const t = formatEur(cents, { sign: signo })
  const i = t.lastIndexOf(',')
  return (
    <span className="kpi-num">
      {t.slice(0, i)}
      <span className="unit-cents">{t.slice(i)}</span>
    </span>
  )
}
/** Cifra con unidad separada por peso y tamaño */
export function CifraUnidad({ valor, unidad }: { valor: string; unidad: string }) {
  return (
    <span className="kpi-num">
      {valor}
      <span className="unit">{unidad}</span>
    </span>
  )
}
/** Importe en listas y tablas: tabular y a la derecha. El signo manda: «+» en ingresos y «−» en gastos; el verde solo refuerza */
export function Importe({ cents, className }: { cents: number; className?: string }) {
  return <span className={cx('tnum', cents > 0 ? 'font-semibold text-success' : 'text-ink', className)}>{formatEur(cents, { sign: true })}</span>
}

/* ======================= PageHeader ======================= */
export function PageHeader({ titulo, texto, acciones, className }: { titulo: string; texto?: ReactNode; acciones?: ReactNode; className?: string }) {
  return (
    <header className={cx('mb-8 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="t-page">{titulo}</h1>
        {texto && <p className="t-label mt-2">{texto}</p>}
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  )
}

/* ======================= Card y KpiCard ======================= */
export function Card({ titulo, subtitulo, icono, accion, children, className, hero, flush, as: Tag2 = 'section', etiqueta }: { titulo?: string; subtitulo?: string; icono?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string; hero?: boolean; flush?: boolean; as?: 'section' | 'div' | 'article'; etiqueta?: string }) {
  return (
    <Tag2 className={cx('card', hero && 'card-hero', flush && 'card-flush', className)} aria-label={etiqueta ?? titulo}>
      {(titulo || accion) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="t-card-title flex shrink-0 items-center gap-2" style={hero ? { color: 'var(--hero-ink)' } : undefined}>
              {icono}
              {titulo}
            </h2>
            {subtitulo && (
              <span className="t-meta truncate" style={hero ? { color: 'var(--hero-ink-2)' } : undefined}>
                {subtitulo}
              </span>
            )}
          </div>
          {accion}
        </div>
      )}
      {children}
    </Tag2>
  )
}

/** KpiCard: una cifra con contexto (respecto a qué) y estado con icono y texto */
export function KpiCard({
  titulo,
  subtitulo,
  icono,
  valor,
  contexto,
  estado,
  accion,
  protagonista,
  hero,
  children,
  className
}: {
  titulo: string
  subtitulo?: string
  icono?: ReactNode
  valor: ReactNode
  contexto?: ReactNode
  estado?: ReactNode
  accion?: ReactNode
  protagonista?: boolean
  hero?: boolean
  children?: ReactNode
  className?: string
}) {
  return (
    <Card titulo={titulo} subtitulo={subtitulo} icono={icono} accion={accion} hero={hero} className={cx('flex flex-col', className)}>
      <div className={protagonista ? 't-kpi-hero' : 't-kpi'}>{valor}</div>
      {contexto && (
        <div className="t-label mt-2" style={hero ? { color: 'var(--hero-ink-2)' } : undefined}>
          {contexto}
        </div>
      )}
      {estado && <div className="mt-3">{estado}</div>}
      {children}
    </Card>
  )
}

/** Fila de lista de definición: concepto a la izquierda, cifra a la derecha */
export function FilaDato({ etiqueta, valor, fuerte, className }: { etiqueta: ReactNode; valor: ReactNode; fuerte?: boolean; className?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4', className)}>
      <dt className="t-label">{etiqueta}</dt>
      <dd className={cx('tnum', fuerte ? 't-strong text-ink' : 'text-ink-2')}>{valor}</dd>
    </div>
  )
}

/* ======================= Accordion ======================= */
export type AccItem = { id: string; titulo: string; icono: ReactNode; resumen: ReactNode; contenido: ReactNode }
/** Acordeón: abierto o cerrado se ve por fondo, indicador y chevron; todo el encabezado es zona de clic */
export function Accordion({ items, abiertas, onToggle }: { items: AccItem[]; abiertas: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="divide-line">
      {items.map((s) => {
        const abierta = abiertas.has(s.id)
        return (
          <div key={s.id}>
            <h3>
              <button type="button" className="accordion-trigger" aria-expanded={abierta} aria-controls={`acc-${s.id}`} onClick={() => onToggle(s.id)}>
                <span className="text-ink-2">{s.icono}</span>
                <span className="t-body font-semibold">{s.titulo}</span>
                <span className="t-meta tnum ml-auto truncate">{abierta ? 'Abierto' : s.resumen}</span>
                <CaretDown size={16} className={cx('shrink-0 text-ink-2 transition-transform duration-[var(--dur-base)]', abierta && 'rotate-180')} aria-hidden />
              </button>
            </h3>
            {abierta && (
              <div id={`acc-${s.id}`} role="region" aria-label={s.titulo} className="fade-in px-6 pb-6 pt-4">
                {s.contenido}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ======================= FilterBar ======================= */
export type Pastilla = { id: string; texto: string }
/** FilterBar: barra principal, botón Filtros con contador, panel avanzado y pastillas de filtros activos con «Limpiar» */
export function FilterBar({ principal, contador, abierto, onAlternar, avanzados, pastillas, onQuitar, onLimpiar }: { principal: ReactNode; contador: number; abierto: boolean; onAlternar: () => void; avanzados: ReactNode; pastillas: Pastilla[]; onQuitar: (id: string) => void; onLimpiar: () => void }) {
  return (
    <div role="search" aria-label="Filtros" className="mb-4">
      <div className="flex flex-wrap items-end gap-3">
        {principal}
        <Button variant="secondary" aria-expanded={abierto} aria-controls="filtros-avanzados" onClick={onAlternar} icon={<FunnelSimple size={16} />}>
          Filtros
          {contador > 0 && <Count label={`${contador} filtros activos`}>{contador}</Count>}
        </Button>
      </div>
      {abierto && (
        <div id="filtros-avanzados" className="fade-in mt-3 r-card border border-line bg-card p-4">
          {avanzados}
        </div>
      )}
      {pastillas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filtros activos">
          {pastillas.map((p) => (
            <Tag key={p.id}>
              {p.texto}
              <button type="button" aria-label={`Quitar filtro: ${p.texto}`} onClick={() => onQuitar(p.id)} className="grid place-items-center text-ink-3 hover:text-ink">
                <X size={14} weight="bold" aria-hidden />
              </button>
            </Tag>
          ))}
          <Button variant="ghost" size="sm" onClick={onLimpiar}>
            Limpiar
          </Button>
        </div>
      )}
    </div>
  )
}

/* ======================= DataTable ======================= */
export type Columna<T> = { id: string; cabecera: ReactNode; ancho?: string; alinear?: 'right'; celda: (f: T) => ReactNode }
/** DataTable: cifras a la derecha, conceptos a la izquierda; fila abierta integrada por tono; densidad compacta, normal o cómoda */
export function DataTable<T>({ columnas, filas, id, abierta, onAlternar, detalle, densidad, nombreFila, titulo, forzarHover }: { columnas: Columna<T>[]; filas: T[]; id: (f: T) => string; abierta: string | null; onAlternar: (id: string) => void; detalle: (f: T) => ReactNode; densidad: 'compact' | 'normal' | 'comfortable'; nombreFila: (f: T) => string; titulo: string; forzarHover?: string }) {
  return (
    <table className="table" data-density={densidad} aria-label={titulo}>
      <thead>
        <tr>
          <th style={{ width: 'var(--space-12)' }}>
            <span className="sr-only">Abrir detalle</span>
          </th>
          {columnas.map((c) => (
            <th key={c.id} style={{ width: c.ancho, textAlign: c.alinear }} scope="col">
              {c.cabecera}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.flatMap((f) => {
          const k = id(f)
          const open = abierta === k
          return [
            <tr key={k} className={cx('row', forzarHover === k && 'is-hover')} data-open={open}>
              <td>
                <button type="button" className="grid size-8 place-items-center r-control text-ink-2 hover:bg-interactive" aria-expanded={open} aria-controls={`det-${k}`} aria-label={`${open ? 'Cerrar' : 'Abrir'} detalle: ${nombreFila(f)}`} onClick={() => onAlternar(k)}>
                  {open ? <CaretDown size={16} aria-hidden /> : <CaretRight size={16} aria-hidden />}
                </button>
              </td>
              {columnas.map((c) => (
                <td key={c.id} style={{ textAlign: c.alinear }}>
                  {c.celda(f)}
                </td>
              ))}
            </tr>,
            open && (
              <tr key={`${k}-d`} className="row-detail">
                <td />
                <td colSpan={columnas.length} id={`det-${k}`} className="fade-in">
                  {detalle(f)}
                </td>
              </tr>
            )
          ]
        })}
      </tbody>
    </table>
  )
}
