import { ArrowsLeftRight, ChatText, MagnifyingGlass, Plus, Warning } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { filtroMovimientos, movimientos, type Movimiento } from '../../datos-ficticios'
import { eur, fecha } from '../lib'
import { Button, Checkbox, SegmentedControl, Select, TextField } from '../ui/controls'
import { ConfirmDialog, Tag, useToast } from '../ui/feedback'
import { DataTable, FilterBar, Importe, PageHeader, type Columna } from '../ui/layout'

const params = new URLSearchParams(location.search)
type Densidad = 'compact' | 'normal' | 'comfortable'

export function Movimientos() {
  const [vista, setVista] = useState<'todos' | 'revision'>('todos')
  const [abierta, setAbierta] = useState<string | null>('m3')
  const [densidad, setDensidad] = useState<Densidad>('normal')
  const [busqueda, setBusqueda] = useState('')
  const [periodo, setPeriodo] = useState('2026-11')
  const [estado, setEstado] = useState('')
  const [avanzados, setAvanzados] = useState(params.get('filtros') === '1')
  const [cuenta, setCuenta] = useState(params.get('filtros') === '1' ? 'Tarjeta' : '')
  const [categoria, setCategoria] = useState('')
  const [tipo, setTipo] = useState(params.get('filtros') === '1' ? 'gasto' : '')
  const [anulados, setAnulados] = useState(false)
  const [anulando, setAnulando] = useState<string | null>(params.get('anular') === '1' ? 'm3' : null)
  const [anuladosIds, setAnuladosIds] = useState<Set<string>>(new Set())
  const toast = useToast()

  const pastillas = [
    cuenta && { id: 'cuenta', texto: `Cuenta: ${cuenta}` },
    categoria && { id: 'categoria', texto: `Categoría: ${categoria}` },
    tipo && { id: 'tipo', texto: `Tipo: ${tipo === 'gasto' ? 'gastos' : 'ingresos'}` },
    estado && { id: 'estado', texto: `Estado: ${estado === 'PENDING_REVIEW' ? 'pendientes' : 'confirmados'}` },
    anulados && { id: 'anulados', texto: 'Incluye anulados' }
  ].filter(Boolean) as { id: string; texto: string }[]
  const limpiar = () => (setCuenta(''), setCategoria(''), setTipo(''), setEstado(''), setAnulados(false))
  const quitar = (id: string) => (({ cuenta: () => setCuenta(''), categoria: () => setCategoria(''), tipo: () => setTipo(''), estado: () => setEstado(''), anulados: () => setAnulados(false) }) as Record<string, () => void>)[id]?.()

  const filas = useMemo(
    () =>
      movimientos.filter((m) => {
        if (vista === 'revision' && m.estado !== 'PENDING_REVIEW') return false
        if (cuenta && !m.cuenta.includes(cuenta)) return false
        if (categoria && m.categoria !== categoria) return false
        if (tipo === 'gasto' && m.cents >= 0) return false
        if (tipo === 'ingreso' && m.cents <= 0) return false
        if (estado && m.estado !== estado) return false
        if (!anulados && anuladosIds.has(m.id)) return false
        if (busqueda && !`${m.concepto} ${m.comercio ?? ''} ${m.nota ?? ''}`.toLowerCase().includes(busqueda.toLowerCase())) return false
        return true
      }),
    [vista, cuenta, categoria, tipo, estado, anulados, busqueda, anuladosIds]
  )
  const filtrado = pastillas.length > 0 || busqueda !== '' || vista === 'revision'
  const ingresos = filtrado ? filas.filter((m) => m.cents > 0).reduce((a, m) => a + m.cents, 0) : filtroMovimientos.ingresosCents
  const gastos = filtrado ? filas.filter((m) => m.cents < 0).reduce((a, m) => a + m.cents, 0) : filtroMovimientos.gastosCents
  const total = filtrado ? filas.length : filtroMovimientos.total
  const pendientes = movimientos.filter((m) => m.estado === 'PENDING_REVIEW').length
  const aAnular = movimientos.find((m) => m.id === anulando)

  const columnas: Columna<Movimiento>[] = [
    { id: 'fecha', cabecera: 'Fecha', ancho: '6rem', celda: (m) => <span className="tnum text-ink-2">{fecha(m.fecha)}</span> },
    {
      id: 'concepto',
      cabecera: 'Concepto',
      celda: (m) => (
        <div className="min-w-0 py-1">
          <div className="flex items-center gap-2">
            <span className={anuladosIds.has(m.id) ? 'truncate text-ink-3 line-through' : 'truncate font-medium'}>{m.concepto}</span>
            {m.etiqueta && m.etiqueta !== 'transferencia' && <Tag icono={m.etiqueta === 'posible duplicado' ? <Warning size={12} weight="fill" aria-hidden /> : undefined} tono={m.etiqueta === 'posible duplicado' ? 'warning' : undefined}>{m.etiqueta}</Tag>}
            {m.nota && <ChatText size={16} className="shrink-0 text-ink-3" aria-label="Tiene nota" />}
          </div>
          {m.comercio && <div className="t-meta truncate">{m.comercio}</div>}
        </div>
      )
    },
    { id: 'categoria', cabecera: 'Categoría', ancho: '13rem', celda: (m) => <span className={m.etiqueta === 'transferencia' ? 'text-ink-3' : 'text-ink-2'}>{m.etiqueta === 'transferencia' ? 'Transferencia' : m.categoria}</span> },
    { id: 'cuenta', cabecera: 'Cuenta', ancho: '12rem', celda: (m) => <span className="text-ink-2">{m.cuenta}</span> },
    { id: 'importe', cabecera: 'Importe', ancho: '8rem', alinear: 'right', celda: (m) => <Importe cents={m.cents} className="font-medium" /> },
    {
      id: 'estado',
      cabecera: <span className="sr-only">Estado</span>,
      ancho: '9rem',
      alinear: 'right',
      celda: (m) => (anuladosIds.has(m.id) ? <Tag>Anulado</Tag> : m.estado === 'PENDING_REVIEW' ? <Tag tono="warning" icono={<Warning size={12} weight="fill" aria-hidden />}>Pendiente</Tag> : null)
    }
  ]

  return (
    <div data-module="finanzas">
      <PageHeader
        titulo="Movimientos"
        texto="El libro de movimientos es la fuente de todas las cifras. Abre uno para ver el detalle."
        acciones={
          <>
            <Button kbd="T" icon={<ArrowsLeftRight size={16} />} onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 't' }))}>
              Transferencia
            </Button>
            <Button variant="primary" kbd="N" icon={<Plus size={16} weight="bold" />} onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))}>
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
          Por revisar <span className="count count-warning">{pendientes}</span>
        </button>
      </div>

      <FilterBar
        principal={
          <>
            <TextField className="w-72" label="Buscar" ocultarEtiqueta placeholder="Buscar concepto o nota" icono={<MagnifyingGlass size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <Select className="w-44" label="Periodo" ocultarEtiqueta value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              <option value="">Todos los meses</option>
              <option value="2026-11">Noviembre 2026</option>
              <option value="2026-10">Octubre 2026</option>
            </Select>
            <Select className="w-44" label="Estado" ocultarEtiqueta value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Cualquier estado</option>
              <option value="CONFIRMED">Confirmados</option>
              <option value="PENDING_REVIEW">Pendientes</option>
            </Select>
          </>
        }
        contador={pastillas.length}
        abierto={avanzados}
        onAlternar={() => setAvanzados((v) => !v)}
        avanzados={
          <div className="auto-grid-wide items-end">
            <Select label="Cuenta" value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
              <option value="">Todas las cuentas</option>
              <option>Cuenta corriente</option>
              <option>Tarjeta</option>
              <option>Efectivo</option>
            </Select>
            <Select label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas las categorías</option>
              <option>Alimentación</option>
              <option>Ocio y restaurantes</option>
              <option>Suscripciones</option>
              <option>Transporte</option>
            </Select>
            <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Gastos e ingresos</option>
              <option value="gasto">Solo gastos</option>
              <option value="ingreso">Solo ingresos</option>
            </Select>
            <div className="pb-2">
              <Checkbox checked={anulados} onChange={setAnulados} label="Incluir anulados" />
            </div>
          </div>
        }
        pastillas={pastillas}
        onQuitar={quitar}
        onLimpiar={limpiar}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <p className="t-label">
          Mostrando {filas.length} de {total} movimientos{periodo === '2026-11' ? ' de noviembre 2026' : ''}
        </p>
        <div className="flex flex-wrap items-center gap-6">
          <dl className="flex items-baseline gap-6">
            {[
              ['Ingresos', ingresos, true],
              ['Gastos', gastos, false],
              ['Neto', ingresos + gastos, true]
            ].map(([t, v, s]) => (
              <div key={t as string} className="flex items-baseline gap-2">
                <dt className="t-label">{t as string}</dt>
                <dd className="tnum t-body font-semibold">{eur(v as number, { sign: s as boolean })}</dd>
              </div>
            ))}
          </dl>
          <SegmentedControl label="Densidad de la tabla" tamano="sm" value={densidad} onChange={setDensidad} opciones={[{ id: 'compact', texto: 'Compacta' }, { id: 'normal', texto: 'Normal' }, { id: 'comfortable', texto: 'Cómoda' }]} />
        </div>
      </div>

      <div className="card card-flush">
        <div className="overflow-x-auto">
          <DataTable
            titulo="Movimientos"
            columnas={columnas}
            filas={filas}
            id={(m) => m.id}
            abierta={abierta}
            onAlternar={(id) => setAbierta(abierta === id ? null : id)}
            densidad={densidad}
            nombreFila={(m) => `${m.concepto}, ${eur(m.cents)}`}
            detalle={(m) => (
              <div>
                <dl className="auto-grid-wide t-label">
                  {[
                    ['Categoría', m.subcategoria ? `${m.categoria} › ${m.subcategoria}` : m.categoria],
                    ['Cuenta', m.cuenta],
                    ['Estado', anuladosIds.has(m.id) ? 'Anulado' : m.estado === 'PENDING_REVIEW' ? 'Pendiente de revisar' : 'Confirmado'],
                    ['Comercio', m.comercio ?? '—'],
                    ['Importe', eur(m.cents, { sign: true })],
                    ['Nota', m.nota ?? 'Sin nota']
                  ].map(([t, v]) => (
                    <div key={t}>
                      <dt className="t-meta">{t}</dt>
                      <dd className="t-body mt-1 text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary">
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost">
                    {m.estado === 'PENDING_REVIEW' ? 'Confirmar' : 'Marcar pendiente'}
                  </Button>
                  <Button size="sm" variant="danger" className="ml-auto" onClick={() => setAnulando(m.id)} disabled={anuladosIds.has(m.id)}>
                    Anular
                  </Button>
                </div>
              </div>
            )}
          />
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="t-meta">Los gastos llevan «−»; los ingresos, «+».</span>
          <Button size="sm">Cargar más movimientos</Button>
        </div>
      </div>

      {aAnular && (
        <ConfirmDialog
          titulo="¿Anular este movimiento?"
          texto={`«${aAnular.concepto}» (${eur(aAnular.cents, { sign: true })}) dejará de contar en tus cifras, pero se conserva en el historial.`}
          confirmar="Anular movimiento"
          onCancelar={() => setAnulando(null)}
          onConfirmar={() => {
            setAnuladosIds((s) => new Set(s).add(aAnular.id))
            setAnulando(null)
            toast({ tono: 'success', texto: 'Movimiento anulado' })
          }}
        />
      )}
    </div>
  )
}
