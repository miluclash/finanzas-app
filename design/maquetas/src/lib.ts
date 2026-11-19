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
