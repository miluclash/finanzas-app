import { X } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Button, Field, Input, Segmented, Select } from '../ui/basics'

/** Diálogo de ejemplo: así se verán los formularios modales. */
export function NuevoMovimiento({ onCerrar }: { onCerrar: () => void }) {
  const [tipo, setTipo] = useState<'gasto' | 'ingreso' | 'transferencia'>('gasto')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation" data-module="finanzas">
      <div className="fade-in absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={onCerrar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nm-titulo"
        className="pop-in relative w-[480px] max-w-[92vw] rounded-[var(--radius-xl)] border border-line-strong bg-overlay p-6 shadow-[var(--shadow-3)]"
        onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="nm-titulo" className="t-heading">
            Nuevo movimiento
          </h2>
          <Button variant="ghost" size="sm" aria-label="Cerrar" onClick={onCerrar} icon={<X size={16} />} />
        </div>
        <Segmented
          label="Tipo de movimiento"
          value={tipo}
          onChange={setTipo}
          opciones={[
            { id: 'gasto', texto: 'Gasto' },
            { id: 'ingreso', texto: 'Ingreso' },
            { id: 'transferencia', texto: 'Transferencia' }
          ]}
        />
        <div className="mt-5 flex flex-col gap-4">
          <Field label="Importe">
            {(id) => (
              <div className="relative">
                <Input id={id} ref={ref} inputMode="decimal" placeholder="0,00" className="num-stat !h-12 pr-10 text-[1.5rem]" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-3">€</span>
              </div>
            )}
          </Field>
          <Field label="Concepto">{(id) => <Input id={id} placeholder="Por ejemplo, compra semanal" />}</Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoría">
              {(id) => (
                <Select id={id} defaultValue="">
                  <option value="" disabled>
                    Elige una
                  </option>
                  <option>Alimentación</option>
                  <option>Transporte</option>
                  <option>Ocio y restaurantes</option>
                </Select>
              )}
            </Field>
            <Field label="Cuenta">
              {(id) => (
                <Select id={id}>
                  <option>Cuenta corriente</option>
                  <option>Tarjeta</option>
                  <option>Efectivo</option>
                </Select>
              )}
            </Field>
          </div>
          <Field label="Fecha">{(id) => <Input id={id} type="date" defaultValue="2026-11-19" />}</Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={onCerrar}>
            Guardar movimiento
          </Button>
        </div>
      </div>
    </div>
  )
}
