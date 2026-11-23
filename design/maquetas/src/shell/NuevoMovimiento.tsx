import { ArrowRight, CheckCircle, Info } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib'
import { Button, DatePicker, Select, SegmentedControl, TextField } from '../ui/controls'
import { Modal, StatusBadge, useToast } from '../ui/feedback'

type Tipo = 'gasto' | 'ingreso' | 'transferencia'
const CUENTAS = ['Cuenta corriente', 'Tarjeta', 'Ahorro', 'Efectivo']

/** Nuevo movimiento. Orden: importe, concepto, categoría y cuenta, fecha, acciones.
 *  Foco inicial en el importe; Enter guarda, Esc cancela; estados de error, guardando y hecho; el foco vuelve al cerrar. */
export function NuevoMovimiento({ onCerrar, demo }: { onCerrar: () => void; demo?: string }) {
  const [tipo, setTipo] = useState<Tipo>(demo === 'ingreso' || demo === 'transferencia' ? demo : 'gasto')
  const [importe, setImporte] = useState(demo === 'guardando' || demo === 'hecho' ? '41,27' : '')
  const [concepto, setConcepto] = useState(demo === 'guardando' || demo === 'hecho' ? 'Compra semanal' : '')
  const [categoria, setCategoria] = useState('')
  const [cuenta, setCuenta] = useState('Cuenta corriente')
  const [origen, setOrigen] = useState('Cuenta corriente')
  const [destino, setDestino] = useState(demo === 'transferencia' ? 'Ahorro' : 'Ahorro')
  const [fecha, setFecha] = useState('2026-11-19')
  const [errores, setErrores] = useState<Record<string, string>>(demo === 'error' ? { importe: 'Escribe un importe mayor que cero.', concepto: 'Escribe un concepto.' } : {})
  const [fase, setFase] = useState<'edicion' | 'guardando' | 'hecho'>(demo === 'guardando' ? 'guardando' : demo === 'hecho' ? 'hecho' : 'edicion')
  const importeRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const transf = tipo === 'transferencia'

  useEffect(() => {
    if (fase !== 'hecho' || demo) return
    const t = window.setTimeout(() => (toast({ tono: 'success', texto: transf ? 'Transferencia guardada' : 'Movimiento guardado' }), onCerrar()), 900)
    return () => window.clearTimeout(t)
  }, [fase, demo, toast, onCerrar, transf])

  const guardar = (e?: React.FormEvent) => {
    e?.preventDefault()
    const err: Record<string, string> = {}
    const n = Number(importe.replace(/\./g, '').replace(',', '.'))
    if (!importe.trim() || !(n > 0)) err.importe = 'Escribe un importe mayor que cero.'
    if (transf && origen === destino) err.destino = 'El destino tiene que ser distinto del origen.'
    if (!transf && !concepto.trim()) err.concepto = 'Escribe un concepto.'
    setErrores(err)
    if (Object.keys(err).length) {
      window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    setFase('guardando')
    window.setTimeout(() => setFase('hecho'), 900)
  }
  const ocupado = fase !== 'edicion'

  return (
    <Modal
      titulo={transf ? 'Nueva transferencia' : tipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto'}
      descripcion="Los campos con error se marcan al guardar."
      inicial={importeRef}
      onCerrar={onCerrar}
      pie={
        fase === 'hecho' ? (
          <StatusBadge tono="success">{transf ? 'Transferencia guardada' : 'Movimiento guardado'}</StatusBadge>
        ) : (
          <>
            <Button variant="ghost" onClick={onCerrar} disabled={fase === 'guardando'}>
              Cancelar
            </Button>
            <Button variant="accent" type="submit" form="nm-form" cargando={fase === 'guardando'}>
              {fase === 'guardando' ? 'Guardando…' : transf ? 'Guardar transferencia' : 'Guardar movimiento'}
            </Button>
          </>
        )
      }
    >
      <form id="nm-form" onSubmit={guardar} noValidate>
        <fieldset disabled={ocupado} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <SegmentedControl
            label="Tipo de movimiento"
            value={tipo}
            onChange={(t) => (setTipo(t), setErrores({}))}
            opciones={[
              { id: 'gasto', texto: 'Gasto' },
              { id: 'ingreso', texto: 'Ingreso' },
              { id: 'transferencia', texto: 'Transferencia' }
            ]}
          />
          {transf && (
            <p className="t-label flex items-center gap-2">
              <Info size={16} aria-hidden /> Una transferencia mueve dinero entre tus cuentas y no cuenta como gasto.
            </p>
          )}
          <TextField ref={importeRef} label={transf ? 'Importe a traspasar' : 'Importe'} inputMode="decimal" placeholder="0,00" unidad="€" value={importe} onChange={(e) => setImporte(e.target.value)} error={errores.importe} tamano="lg" />
          {transf ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
              <Select label="Desde (origen)" value={origen} onChange={(e) => setOrigen(e.target.value)}>
                {CUENTAS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <ArrowRight size={20} className="mt-10 text-ink-3" aria-hidden />
              <Select label="Hasta (destino)" value={destino} onChange={(e) => setDestino(e.target.value)} error={errores.destino}>
                {CUENTAS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
          ) : (
            <>
              <TextField label="Concepto" placeholder="Por ejemplo, compra semanal" value={concepto} onChange={(e) => setConcepto(e.target.value)} error={errores.concepto} />
              <div className={cx('grid grid-cols-2 gap-4')}>
                <Select label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="">Sin categoría</option>
                  <option>Alimentación</option>
                  <option>Transporte</option>
                  <option>Ocio y restaurantes</option>
                </Select>
                <Select label="Cuenta" value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                  {CUENTAS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </div>
            </>
          )}
          <DatePicker label="Fecha" value={fecha} onChange={setFecha} />
        </fieldset>
        {fase === 'hecho' && (
          <p className="t-label mt-4 flex items-center gap-2" role="status">
            <CheckCircle size={16} weight="fill" className="text-success" aria-hidden /> Listo. Se cierra solo.
          </p>
        )}
      </form>
    </Modal>
  )
}
