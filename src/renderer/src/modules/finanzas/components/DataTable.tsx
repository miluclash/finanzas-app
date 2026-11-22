// Tabla ordenable con el estilo del sistema de diseño (clase table): cifras a la derecha, hover y foco visibles,
// selección opcional, fila navegable con teclado (Intro o Espacio) y densidad normal o compacta.
import { ArrowDown, ArrowUp } from '@phosphor-icons/react'
import { useMemo, useState, type ReactNode } from 'react'
import { cx } from '../../../core/ui'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sort?: (row: T) => string | number | null
  align?: 'left' | 'right' | 'center'
  width?: string
  className?: string
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  initialSort,
  selected,
  onSelect,
  footer,
  empty,
  dense,
  rowClassName,
  maxRows
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (r: T) => string
  onRowClick?: (r: T) => void
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  selected?: Set<string>
  onSelect?: (s: Set<string>) => void
  footer?: ReactNode
  empty?: ReactNode
  dense?: boolean
  rowClassName?: (r: T) => string | undefined
  maxRows?: number
}) {
  const [sort, setSort] = useState(initialSort ?? null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sort) return rows
    const f = col.sort
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = f(a)
      const vb = f(b)
      if (va === vb) return 0
      if (va === null) return 1
      if (vb === null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir
    })
  }, [rows, sort, columns])
  const shown = maxRows ? sorted.slice(0, maxRows) : sorted
  const allSelected = !!selected && rows.length > 0 && rows.every((r) => selected.has(rowKey(r)))
  if (rows.length === 0 && empty) return <>{empty}</>
  return (
    <div className="card card-flush overflow-x-auto">
      <table className="table" data-density={dense ? 'compact' : 'normal'}>
        <thead>
          <tr>
            {onSelect && (
              <th style={{ width: 'var(--space-10)' }}>
                <input type="checkbox" aria-label="Seleccionar todo" className="checkbox" checked={allSelected} onChange={(e) => onSelect(e.target.checked ? new Set(rows.map(rowKey)) : new Set())} />
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={{ width: c.width }}
                  className={cx('whitespace-nowrap', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sort ? (
                    <button type="button" className={cx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')} onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }))}>
                      {c.header}
                      {active && (sort!.dir === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />)}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const k = rowKey(r)
            return (
              <tr
                key={k}
                className={cx('row', onRowClick && 'cursor-pointer', selected?.has(k) && 'bg-accent-soft', rowClassName?.(r))}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? (e) => !(e.target as HTMLElement).closest('button, a, input, select, label') && onRowClick(r) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          onRowClick(r)
                        }
                      }
                    : undefined
                }
              >
                {onSelect && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar fila"
                      className="checkbox"
                      checked={selected!.has(k)}
                      onChange={(e) => {
                        const n = new Set(selected)
                        if (e.target.checked) n.add(k)
                        else n.delete(k)
                        onSelect(n)
                      }}
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={cx(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  )
}
