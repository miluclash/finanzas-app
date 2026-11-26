// Campo «Objetivo» del constructor: lo que escribe Michael ↔ el valor en la unidad de la métrica.
// El dinero se escribe en euros (se guarda en céntimos con `parseEurToCents`) y los porcentajes en %
// (se guardan como proporción 0–1). Los números aceptan coma o punto decimal, como el resto de la app.
import { parseEurToCents } from '../../money'
import type { MetricUnit } from '../metrics-types'

/**
 * Número escrito a mano: «82,5», «82.5», «1.234,5», «1,234.5», «-3». Con solo puntos, un único
 * punto seguido de exactamente tres cifras se lee como miles («1.500» = 1500), igual que el dinero;
 * si no, como decimal. null si no es un número.
 */
export function parseNumeroEs(input: string): number | null {
  let s = input.trim().replace(/\s/g, '')
  if (!s) return null
  let signo = 1
  if (s.startsWith('-') || s.startsWith('−')) {
    signo = -1
    s = s.slice(1)
  } else if (s.startsWith('+')) s = s.slice(1)
  if (!/^[0-9.,]+$/.test(s)) return null
  const coma = s.includes(',')
  const punto = s.includes('.')
  let norm: string
  if (coma && punto) norm = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (coma) {
    if ((s.match(/,/g) ?? []).length > 1) return null
    norm = s.replace(',', '.')
  } else if (punto) {
    const p = s.split('.')
    if (p.length > 2) {
      if (!p.slice(1).every((x) => x.length === 3)) return null
      norm = p.join('')
    } else norm = p[1].length === 3 && p[0].length > 0 && p[0] !== '0' ? p.join('') : s
  } else norm = s
  if (!/^\d+(\.\d+)?$/.test(norm)) return null
  return signo * Number(norm)
}

/** Texto del campo → objetivo en la unidad de la métrica (null si está vacío o no es un número). */
export function entradaAObjetivo(txt: string, unit?: MetricUnit): number | null {
  if (!txt.trim()) return null
  if (unit === 'eur_cents') return parseEurToCents(txt)
  const n = parseNumeroEs(txt)
  if (n === null) return null
  return unit === 'pct' ? n / 100 : n
}

/** Objetivo guardado → texto del campo (con coma decimal). */
export function objetivoAEntrada(v: number, unit?: MetricUnit): string {
  const x = unit === 'eur_cents' ? v / 100 : unit === 'pct' ? v * 100 : v
  return String(Math.round(x * 100) / 100).replace('.', ',')
}
