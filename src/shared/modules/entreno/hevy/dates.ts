/**
 * Fechas de Hevy. Hora local sin zona (Madrid), guardada como ISO local `YYYY-MM-DDTHH:mm`.
 * Entrada aceptada: `d MMM yyyy, HH:mm` (meses en inglés o español, con o sin punto),
 * `dd/MM/yyyy, HH:mm` (día primero) e ISO con T o espacio (segundos opcionales, se descartan).
 * Salida de Hevy: siempre el inglés visto en el archivo real (`5 Nov 2026, 07:05`).
 */

/** ISO local `YYYY-MM-DDTHH:mm`. */
export type IsoLocalDateTime = string

const EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MONTHS: Record<string, number> = {}
function reg(names: string[], month: number): void {
  for (const n of names) MONTHS[n] = month
}
reg(['jan', 'january', 'ene', 'enero'], 1)
reg(['feb', 'february', 'febrero'], 2)
reg(['mar', 'march', 'marzo'], 3)
reg(['apr', 'april', 'abr', 'abril'], 4)
reg(['may', 'mayo'], 5)
reg(['jun', 'june', 'junio'], 6)
reg(['jul', 'july', 'julio'], 7)
reg(['aug', 'august', 'ago', 'agosto'], 8)
reg(['sep', 'sept', 'september', 'septiembre', 'setiembre'], 9)
reg(['oct', 'october', 'octubre'], 10)
reg(['nov', 'november', 'noviembre'], 11)
reg(['dec', 'december', 'dic', 'diciembre'], 12)

const p2 = (n: number): string => String(n).padStart(2, '0')

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

function build(y: number, mo: number, d: number, h: number, mi: number): IsoLocalDateTime | null {
  if (!(y >= 1900 && y <= 2200)) return null
  if (!(mo >= 1 && mo <= 12)) return null
  if (!(d >= 1 && d <= daysInMonth(y, mo))) return null
  if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59)) return null
  return `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}`
}

/** Devuelve el ISO local o null si el texto no se entiende. */
export function parseHevyDate(text: string): IsoLocalDateTime | null {
  const s = text.trim()
  let m = /^(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]+)\.?,?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (m) {
    const month = MONTHS[m[2].toLowerCase()]
    if (!month) return null
    return build(+m[3], month, +m[1], +m[4], +m[5])
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (m) return build(+m[3], +m[2], +m[1], +m[4], +m[5])
  m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s)
  if (m) return build(+m[1], +m[2], +m[3], +m[4], +m[5])
  return null
}

/** ISO local → formato Hevy (`5 Nov 2026, 07:05`). Lanza si el ISO no es válido. */
export function formatHevyDate(iso: IsoLocalDateTime): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso)
  if (!m) throw new Error('Fecha ISO local no válida')
  return `${+m[3]} ${EN[+m[2] - 1]} ${m[1]}, ${m[4]}:${m[5]}`
}

/** Date → ISO local usando los campos locales (o UTC, que es como ExcelJS entrega las celdas de fecha). */
export function dateToIsoLocal(d: Date, utc = false): IsoLocalDateTime {
  const y = utc ? d.getUTCFullYear() : d.getFullYear()
  const mo = (utc ? d.getUTCMonth() : d.getMonth()) + 1
  const day = utc ? d.getUTCDate() : d.getDate()
  const h = utc ? d.getUTCHours() : d.getHours()
  const mi = utc ? d.getUTCMinutes() : d.getMinutes()
  return `${y}-${p2(mo)}-${p2(day)}T${p2(h)}:${p2(mi)}`
}
