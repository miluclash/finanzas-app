import { ArrowRight, ArrowsLeftRight, CaretDown, ChatText, MagnifyingGlass, Plus, Warning, X } from '@phosphor-icons/react'
import { useState } from 'react'
import { filtroMovimientos, movimientos, type Movimiento } from '../../datos-ficticios'
import { cx, eur, fecha } from '../lib'
import { Button, Chip, Importe, Input, PageHeader, Select } from '../ui/basics'

export function Movimientos() {
  const [vista, setVista] = useState<'todos' | 'revision'>('todos')
  const [abierta, setAbierta] = useState<string | null>('m3')
  const [conFiltros, setConFiltros] = useState(true)
  const lista = vista === 'revision' ? movimientos.filter((m) => m.estado === 'PENDING_REVIEW') : movimientos
  const pendientes = movimientos.filter((m) => m.estado === 'PENDING_REVIEW').length

  return (
    <div data-module="finanzas">
      <PageHeader
        titulo="Movimientos"
        texto="El libro de movimientos es la fuente de todas las cifras. Pulsa uno para ver el detalle."
        acciones={
          <>
            <Button kbd="T" icon={<ArrowsLeftRight size={16} />}>
              Transferencia
            </Button>
            <Button variant="primary" kbd="N" icon={<Plus size={16} weight="bold" />}>
              Nuevo movimiento
            </Button>
          </>
        }
      />

      <div className="tabs mb-4" role="tablist" aria-label="Vista">
        <button role="tab" aria-selected={vista === 'todos'} onClick={() => setVista('todos')}>
          Todos
        </button>
        <button role="tab" aria-selected={vista === 'revision'} onClick={() => setVista('revision')}>
          Por revisar <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-warn-soft px-1 text-[10.5px] font-[650] text-warn">{pendientes}</span>
        </button>
      </div>

      {/* Una sola fila de filtros encima de todo lo que acotan */}
      <div className="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Filtros">
        <div className="relative w-[170px] shrink-0">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input placeholder="Buscar…" className="pl-9" aria-label="Buscar" />
        </div>
        <Select aria-label="Mes" defaultValue="2026-11" className="w-[164px]">
          <option value="">Todos los meses</option>
          <option value="2026-11">Noviembre 2026</option>
          <option>Octubre 2026</option>
        </Select>
        <Select aria-label="Cuenta" className="w-[152px]">
          <option>Cuenta: todas</option>
          <option>Cuenta corriente</option>
          <option>Tarjeta</option>
        </Select>
        <Select aria-label="Categoría" className="w-[162px]">
          <option>Categoría: todas</option>
          <option>Alimentación</option>
        </Select>
        <Select aria-label="Tipo" className="w-[128px]">
          <option>Tipo: todos</option>
          <option>Gasto</option>
          <option>Ingreso</option>
        </Select>
        <Select aria-label="Estado" className="w-[142px]">
          <option>Sin anulados</option>
          <option>Pendientes</option>
        </Select>
        {conFiltros && (
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => setConFiltros(false)}>
            Quitar filtros
          </Button>
        )}
      </div>

      {/* Totales del filtro */}
      <div className="mb-3 flex items-center justify-between gap-6 text-[length:var(--fs-small)]">
        <span className="text-ink-3">
          Mostrando {lista.length} de {vista === 'revision' ? pendientes : filtroMovimientos.total}
        </span>
        <dl className="flex items-center gap-6">
          {[
            ['Ingresos', filtroMovimientos.ingresosCents, true],
            ['Gastos', filtroMovimientos.gastosCents, false],
            ['Neto', filtroMovimientos.netoCents, true]
          ].map(([n, v, signo]) => (
            <div key={n as string} className="flex items-baseline gap-2">
              <dt className="text-ink-3">{n as string}</dt>
              <dd className={cx('tnum text-[length:var(--fs-body)] font-[650]', n === 'Neto' ? 'text-pos' : 'text-ink')}>{eur(v as number, { sign: signo as boolean })}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card !p-0 overflow-hidden">
        <table className="tabla">
          <thead>
            <tr>
              <th style={{ width: 92 }}>Fecha</th>
              <th>Concepto</th>
              <th style={{ width: 190 }}>Categoría</th>
              <th style={{ width: 190 }}>Cuenta</th>
              <th style={{ width: 120, textAlign: 'right' }}>Importe</th>
              <th style={{ width: 128 }}>
                <span className="sr-only">Estado</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.map((m) => (
              <Fila key={m.id} m={m} abierta={abierta === m.id} onToggle={() => setAbierta(abierta === m.id ? null : m.id)} />
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-3">
          <span className="t-small text-ink-3">Los importes de gasto van en negativo; los ingresos, en verde.</span>
          <Button size="sm">Cargar más movimientos</Button>
        </div>
      </div>
    </div>
  )
}

function Fila({ m, abierta, onToggle }: { m: Movimiento; abierta: boolean; onToggle: () => void }) {
  const pendiente = m.estado === 'PENDING_REVIEW'
  const transf = m.etiqueta === 'transferencia'
  return (
    <>
      <tr className={cx('fila', abierta && 'abierta')}>
        <td className="tnum text-ink-2">{fecha(m.fecha)}</td>
        <td>
          <button type="button" aria-expanded={abierta} aria-controls={`det-${m.id}`} onClick={onToggle} className="flex w-full items-center gap-2.5 text-left">
            <CaretDown size={13} className={cx('shrink-0 text-ink-3 transition-transform duration-[var(--dur-base)]', !abierta && '-rotate-90')} aria-hidden />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate font-[540]">{m.concepto}</span>
                {m.etiqueta && !transf && <Chip tono={m.etiqueta === 'reembolso' ? 'accent' : undefined}>{m.etiqueta}</Chip>}
                {m.nota && <ChatText size={14} className="shrink-0 text-ink-3" aria-label="Tiene nota" />}
              </span>
              {m.comercio && <span className="t-small block truncate text-ink-3">{m.comercio}</span>}
            </span>
          </button>
        </td>
        <td className={transf ? 'text-ink-3' : 'text-ink-2'}>{transf ? 'Transferencia' : m.categoria}</td>
        <td className="text-ink-2">{m.cuenta}</td>
        <td style={{ textAlign: 'right' }}>
          <Importe cents={m.cents} className="font-[620]" />
        </td>
        <td style={{ textAlign: 'right' }}>
          {pendiente && (
            <Chip tono="warn" icon={<Warning size={13} weight="fill" />}>
              Pendiente
            </Chip>
          )}
        </td>
      </tr>
      {abierta && (
        <tr className="abierta">
          <td />
          <td colSpan={5} id={`det-${m.id}`} style={{ height: 'auto', paddingBottom: 18, paddingTop: 4 }} className="fade-in">
            <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-x-8 gap-y-3 rounded-[var(--radius-md)] border border-line bg-surface-1 p-4 text-[length:var(--fs-small)]">
              <Dato t="Categoría" v={m.subcategoria ? `${m.categoria} › ${m.subcategoria}` : m.categoria} />
              <Dato t="Cuenta" v={m.cuenta} />
              <Dato t="Estado" v={pendiente ? 'Pendiente de revisar' : 'Confirmado'} />
              <Dato t="Comercio" v={m.comercio ?? '—'} />
              <Dato t="Importe" v={eur(m.cents, { sign: true })} />
              <Dato t="Nota" v={m.nota ?? 'Sin nota'} />
              <div className="col-span-3 mt-1 flex items-center gap-2 border-t border-line pt-3">
                <Button size="sm" variant="secondary">
                  Editar
                </Button>
                <Button size="sm" variant="ghost">
                  {pendiente ? 'Confirmar' : 'Marcar pendiente'}
                </Button>
                <Button size="sm" variant="danger" className="ml-auto">
                  Anular
                </Button>
                <a href="#/movimientos" className="t-small flex items-center gap-1 text-accent-text hover:underline">
                  Ver movimientos de la categoría <ArrowRight size={12} />
                </a>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
const Dato = ({ t, v }: { t: string; v: string }) => (
  <div>
    <dt className="text-ink-3">{t}</dt>
    <dd className="mt-0.5 text-ink">{v}</dd>
  </div>
)
