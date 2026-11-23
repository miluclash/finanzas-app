// Formato en español de España. Las maquetas solo muestran: la app real recibe las cifras ya calculadas.
const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' })
const eurFmt0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' })
const numFmt = new Intl.NumberFormat('es-ES', { useGrouping: 'always' })
const num1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const num2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pctFmt = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 })
const pct1Fmt = new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const eur = (cents: number, o: { sign?: boolean; sinDecimales?: boolean } = {}) => {
  const v = cents / 100
  const s = (o.sinDecimales ? eurFmt0 : eurFmt).format(Math.abs(v))
  if (cents < 0) return '−' + s
  return o.sign && cents > 0 ? '+' + s : s
}
export const eurDe = (euros: number, sinDecimales = true) => (sinDecimales ? eurFmt0 : eurFmt).format(euros)
export const n = (v: number) => numFmt.format(v)
export const n1 = (v: number) => num1.format(v)
export const n2 = (v: number) => num2.format(v)
export const pct = (v: number) => pctFmt.format(v)
export const pct1 = (v: number) => pct1Fmt.format(v)

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const fecha = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MES[m - 1]}`
}
export const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ')
export const eurPlano = (cents: number) => eur(cents, { sinDecimales: true })

/* Contraste WCAG 2 entre dos colores #rrggbb (se usa en la hoja del sistema para mostrar los contrastes reales) */
const lin = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
const lum = (h: string) => {
  const [r, g, b] = lin(h)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
