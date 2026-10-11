// Tabla ordenable y legible, con selección opcional.
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { cx } from './ui'

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
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left">
            {onSelect && (
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todo"
                  className="size-4 accent-[var(--accent)]"
                  checked={allSelected}
                  onChange={(e) => onSelect(e.target.checked ? new Set(rows.map(rowKey)) : new Set())}
                />
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={cx(
                    'whitespace-nowrap px-3 py-2 font-medium text-ink-2',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center'
                  )}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      className={cx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}
                      onClick={() =>
                        setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }))
                      }
                    >
                      {c.header}
                      {active && (sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
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
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx(
                  'border-b border-line last:border-b-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-2',
                  selected?.has(k) && 'bg-accent-soft',
                  rowClassName?.(r)
                )}
              >
                {onSelect && (
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar fila"
                      className="size-4 accent-[var(--accent)]"
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
                  <td
                    key={c.key}
                    className={cx(
                      dense ? 'px-3 py-1.5' : 'px-3 py-2',
                      'align-middle',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.className
                    )}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {footer && <tfoot className="border-t border-line-strong bg-surface-2">{footer}</tfoot>}
      </table>
    </div>
  )
}
