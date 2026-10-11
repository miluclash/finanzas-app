// Utilidades monetarias. Los importes viajan siempre en céntimos enteros.

const eurFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always'
} as Intl.NumberFormatOptions)

const numFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always'
} as Intl.NumberFormatOptions)

const pctFormatter = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
})

/** 12345 -> "123,45 €" */
export function formatEur(cents: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—'
  if (Object.is(cents, -0)) cents = 0
  const s = eurFormatter.format(cents / 100)
  if (opts.sign && cents > 0) return '+' + s
  return s
}

/** 12345 -> "123,45" (sin símbolo) */
export function formatNumber(cents: number): string {
  return numFormatter.format((cents || 0) / 100)
}

/** 0.1234 -> "12,3 %" */
export function formatPct(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  return pctFormatter.format(ratio)
}

/**
 * Convierte texto introducido por el usuario a céntimos.
 * Acepta formato español ("1.234,56", "12,5") y también punto decimal ("12.50").
 * Si sólo hay puntos y el último grupo tiene exactamente 3 cifras, se interpretan como miles.
 * Devuelve null si no es un número válido.
 */
export function parseEurToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null
    return Math.round(input * 100)
  }
  let s = input.trim().replace(/\s|€/g, '')
  if (s === '') return null
  let negative = false
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (!/^[0-9.,]+$/.test(s)) return null
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  let normalized: string
  if (hasComma && hasDot) {
    // El último separador es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) normalized = s.replace(/\./g, '').replace(',', '.')
    else normalized = s.replace(/,/g, '')
  } else if (hasComma) {
    if ((s.match(/,/g) || []).length > 1) return null
    normalized = s.replace(',', '.')
  } else if (hasDot) {
    const parts = s.split('.')
    if (parts.length > 2) {
      // varios puntos: separadores de miles ("1.234.567")
      if (!parts.slice(1).every((p) => p.length === 3)) return null
      normalized = parts.join('')
    } else if (parts[1].length === 3 && parts[0].length > 0 && parts[0] !== '0') {
      // "1.234" -> 1234 (convención española de miles)
      normalized = parts.join('')
    } else {
      normalized = s
    }
  } else {
    normalized = s
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const [intPart, decPart = ''] = normalized.split('.')
  if (decPart.length > 2) {
    // redondeo half-up a céntimos sin pasar por float
    const cents = BigInt(intPart) * 100n + BigInt(decPart.slice(0, 2).padEnd(2, '0'))
    const roundUp = Number(decPart[2]) >= 5 ? 1n : 0n
    const total = Number(cents + roundUp)
    return negative ? -total : total
  }
  const total = Number(BigInt(intPart) * 100n + BigInt(decPart.padEnd(2, '0')))
  return negative ? -total : total
}

/** Convierte un número de Excel (float en euros) a céntimos con redondeo correcto. */
export function eurosToCents(value: number): number {
  return Math.round(Math.round(value * 1000) / 10)
}

export function sumCents(values: Array<number | null | undefined>): number {
  let t = 0
  for (const v of values) if (v) t += v
  return t
}

/** Reparte un importe en céntimos de forma proporcional sin perder céntimos. */
export function ratioOf(part: number, total: number): number | null {
  if (!total) return null
  return part / total
}
