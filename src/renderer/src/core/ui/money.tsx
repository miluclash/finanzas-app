import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { formatNumber, parseEurToCents } from '@shared/money'
import { TextField } from './controls'

type MoneyFieldProps = {
  label: string
  /** Importe en céntimos */
  value: number | null
  onChange: (cents: number | null) => void
  /** Con valor negativo permitido (saldos, ajustes) */
  permitirNegativo?: boolean
  ayuda?: string
  error?: string
  tamano?: 'sm' | 'md' | 'lg'
  className?: string
  ocultarEtiqueta?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size' | 'type'>

/** Importe en euros con formato español: el usuario escribe «1.234,56» y el valor sube en céntimos. Cifras tabulares y a la derecha */
export const MoneyField = forwardRef<HTMLInputElement, MoneyFieldProps>(function MoneyField({ label, value, onChange, permitirNegativo = false, ayuda, error, tamano, className, ocultarEtiqueta, onBlur, placeholder = '0,00', ...rest }, ref) {
  const [texto, setTexto] = useState(value === null ? '' : formatNumber(value))
  const [invalido, setInvalido] = useState(false)
  const ultimo = useRef<number | null>(value)
  // Si el valor cambia desde fuera (otro campo, una sugerencia), el texto lo sigue
  useEffect(() => {
    if (value !== ultimo.current) {
      setTexto(value === null ? '' : formatNumber(value))
      ultimo.current = value
    }
  }, [value])
  return (
    <TextField
      ref={ref}
      label={label}
      ayuda={ayuda}
      error={error ?? (invalido ? 'Escribe un importe válido, por ejemplo 12,50.' : undefined)}
      tamano={tamano}
      ocultarEtiqueta={ocultarEtiqueta}
      unidad="€"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      className={className ? `${className} [&_input]:tabular-nums [&_input]:text-right` : '[&_input]:tabular-nums [&_input]:text-right'}
      value={texto}
      onChange={(e) => {
        const t = e.target.value
        setTexto(t)
        let c = parseEurToCents(t)
        if (c !== null && !permitirNegativo) c = Math.abs(c)
        setInvalido(t.trim() !== '' && c === null)
        ultimo.current = c
        onChange(c)
      }}
      onBlur={(e) => {
        if (ultimo.current !== null) setTexto(formatNumber(ultimo.current))
        onBlur?.(e)
      }}
      {...rest}
    />
  )
})
