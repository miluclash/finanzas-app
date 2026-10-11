// Importación del CSV de transacciones de Trade Republic ("Transaction_export").
// Cada fila lleva un transaction_id: se guarda en las notas como [TR:id] y así reimportar un
// export más nuevo solo añade lo que falta.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Decimal from 'decimal.js'
import type { AssetClass, InvestmentOp } from '@shared/types'
import { saveAccount } from './catalog'
import { saveInstrument, saveOp } from './investments'
import { UserError, type AppState } from './state'
import { saveTransfer } from './transactions'

export type TrKind = 'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL' | 'DIVIDEND' | 'INTEREST' | 'FEE'

export interface TrRow {
  id: string
  date: string
  kind: TrKind
  isin: string | null
  name: string | null
  assetClass: AssetClass | null
  quantity: string | null
  price: string | null
  /** importe en céntimos, siempre positivo (bruto: antes de comisión e impuestos) */
  amountCents: number
  feeCents: number
  taxCents: number
  description: string
}

export interface TrPreviewRow extends TrRow {
  duplicate: boolean
}

export interface TrPreview {
  token: string
  fileName: string
  rows: TrPreviewRow[]
  skipped: Array<{ line: number; reason: string }>
  newInstruments: Array<{ isin: string; name: string; assetClass: AssetClass }>
  totals: { depositsCents: number; depositFeesCents: number; buysCents: number; incomeCents: number; cashCents: number }
  holdings: Array<{ isin: string; name: string; quantity: string }>
  firstDate: string | null
}

export interface TrApplyOptions {
  /** cuenta del bróker existente; null = crear "Trade Republic" */
  brokerAccountId: string | null
  /** cuenta desde la que se recarga (Santander) */
  sourceAccountId: string
}

const KIND_LABEL: Record<TrKind, string> = {
  DEPOSIT: 'Recarga',
  WITHDRAWAL: 'Retirada',
  BUY: 'Compra',
  SELL: 'Venta',
  DIVIDEND: 'Dividendo',
  INTEREST: 'Intereses',
  FEE: 'Comisión'
}
export { KIND_LABEL as TR_KIND_LABEL }

/** CSV con comillas dobles (RFC 4180). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let q = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"'
          i++
        } else q = false
      } else field += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some((x) => x !== '')) rows.push(row)
  }
  return rows
}

const toCents = (v: string): number => (v.trim() ? new Decimal(v.trim()).abs().mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() : 0)
const cleanDec = (v: string): string | null => (v.trim() ? new Decimal(v.trim()).abs().toString() : null)

/** Nombre legible del activo a partir de la descripción ("Buy trade ISIN Nombre, quantity: x"). */
function nameFrom(description: string, isin: string, fallback: string): string {
  const m = description.match(new RegExp(`${isin}\\s+(.+?),\\s*quantity`, 'i'))
  let n = (m?.[1] ?? '').trim()
  n = n.replace(/^.*? - /, '') // "Xtrackers (IE) Plc - Xtrackers MSCI World…" -> "Xtrackers MSCI World…"
  n = n.replace(/\s{2,}.*$/, '') // "NVIDIA CORP.      DL-,001" -> "NVIDIA CORP."
  if (!n || n.length < 3) n = fallback
  return n
}

export function parseTradeRepublic(text: string): { rows: TrRow[]; skipped: TrPreview['skipped'] } {
  const raw = parseCsv(text)
  if (!raw.length) throw new UserError('El archivo está vacío.')
  const head = raw[0].map((h) => h.trim().toLowerCase())
  const need = ['date', 'type', 'amount', 'transaction_id']
  for (const n of need)
    if (!head.includes(n)) throw new UserError('No parece un export de Trade Republic: falta la columna "' + n + '".')
  const col = (r: string[], n: string) => r[head.indexOf(n)] ?? ''
  const rows: TrRow[] = []
  const skipped: TrPreview['skipped'] = []
  raw.slice(1).forEach((r, i) => {
    const line = i + 2
    const type = col(r, 'type').trim().toUpperCase()
    const date = col(r, 'date').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return skipped.push({ line, reason: `fecha no válida "${date}"` })
    const currency = col(r, 'currency').trim().toUpperCase()
    if (currency && currency !== 'EUR') return skipped.push({ line, reason: `moneda ${currency} (solo se importan importes en EUR)` })
    const isin = col(r, 'symbol').trim().toUpperCase() || null
    const description = col(r, 'description').trim()
    const base = {
      id: col(r, 'transaction_id').trim() || `${col(r, 'datetime')}|${type}|${col(r, 'amount')}`,
      date,
      isin,
      name: null as string | null,
      assetClass: null as AssetClass | null,
      quantity: null as string | null,
      price: null as string | null,
      amountCents: toCents(col(r, 'amount')),
      feeCents: toCents(col(r, 'fee')),
      taxCents: toCents(col(r, 'tax')),
      description
    }
    const ac = col(r, 'asset_class').trim().toUpperCase()
    const assetClass: AssetClass = ac === 'STOCK' ? 'STOCK' : ac === 'FUND' ? 'ETF' : ac === 'BOND' ? 'BOND' : ac === 'CRYPTO' ? 'CRYPTO' : 'OTHER'
    switch (type) {
      case 'CUSTOMER_INPAYMENT':
        rows.push({ ...base, isin: null, kind: 'DEPOSIT' })
        break
      case 'CUSTOMER_OUTPAYMENT':
      case 'CUSTOMER_WITHDRAWAL':
      case 'PAYOUT':
        rows.push({ ...base, isin: null, kind: 'WITHDRAWAL' })
        break
      case 'BUY':
      case 'SELL': {
        if (!isin) return skipped.push({ line, reason: 'compra/venta sin ISIN' })
        const quantity = cleanDec(col(r, 'shares'))
        const price = cleanDec(col(r, 'price'))
        if (!quantity || !price) return skipped.push({ line, reason: 'compra/venta sin unidades o precio' })
        rows.push({
          ...base,
          kind: type,
          quantity,
          price,
          assetClass,
          name: nameFrom(description, isin, col(r, 'name').trim() || isin)
        })
        break
      }
      case 'DIVIDEND':
        rows.push({ ...base, kind: 'DIVIDEND', assetClass, name: col(r, 'name').trim() || isin })
        break
      case 'INTEREST_PAYMENT':
      case 'INTEREST':
        rows.push({ ...base, isin: null, kind: 'INTEREST' })
        break
      case 'FEE':
        rows.push({ ...base, isin: null, kind: 'FEE' })
        break
      default:
        skipped.push({ line, reason: `tipo "${type}" no soportado todavía` })
    }
  })
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { rows, skipped }
}

const marker = (id: string) => `[TR:${id}]`

function existingMarkers(s: AppState): Set<string> {
  const out = new Set<string>()
  for (const t of ['transactions', 'investment_ops']) {
    for (const r of s.db.all<{ notes: string }>(`SELECT notes FROM ${t} WHERE notes LIKE '%[TR:%'`))
      for (const m of r.notes.matchAll(/\[TR:([^\]]+)\]/g)) out.add(m[1])
  }
  return out
}

/** Efectivo que mueve cada fila dentro del bróker (en céntimos, con signo). */
function cashDelta(r: TrRow): number {
  switch (r.kind) {
    case 'DEPOSIT':
      return r.amountCents - r.feeCents
    case 'WITHDRAWAL':
      return -r.amountCents - r.feeCents
    case 'BUY':
      return -r.amountCents - r.feeCents
    case 'SELL':
      return r.amountCents - r.feeCents - r.taxCents
    case 'DIVIDEND':
    case 'INTEREST':
      return r.amountCents - r.taxCents
    case 'FEE':
      return -r.amountCents
  }
}

const pending = new Map<string, { rows: TrRow[]; fileName: string }>()

export function previewTradeRepublicText(s: AppState, text: string, fileName: string): TrPreview {
  const { rows, skipped } = parseTradeRepublic(text)
  const seen = existingMarkers(s)
  const ctx = s.ctx()
  const known = new Set(ctx.instruments.map((i) => i.isin).filter(Boolean))
  const newInstruments: TrPreview['newInstruments'] = []
  const qty = new Map<string, { name: string; q: Decimal }>()
  let deposits = 0
  let depositFees = 0
  let buys = 0
  let income = 0
  let cash = 0
  for (const r of rows) {
    cash += cashDelta(r)
    if (r.kind === 'DEPOSIT') {
      deposits += r.amountCents
      depositFees += r.feeCents
    }
    if (r.kind === 'BUY') buys += r.amountCents
    if (r.kind === 'DIVIDEND' || r.kind === 'INTEREST') income += r.amountCents - r.taxCents
    if ((r.kind === 'BUY' || r.kind === 'SELL') && r.isin) {
      if (!known.has(r.isin) && !newInstruments.some((n) => n.isin === r.isin))
        newInstruments.push({ isin: r.isin, name: r.name ?? r.isin, assetClass: r.assetClass ?? 'OTHER' })
      const h = qty.get(r.isin) ?? { name: r.name ?? r.isin, q: new Decimal(0) }
      h.q = r.kind === 'BUY' ? h.q.plus(r.quantity!) : h.q.minus(r.quantity!)
      qty.set(r.isin, h)
    }
  }
  const token = randomUUID()
  pending.clear()
  pending.set(token, { rows, fileName })
  return {
    token,
    fileName,
    rows: rows.map((r) => ({ ...r, duplicate: seen.has(r.id) })),
    skipped,
    newInstruments,
    totals: { depositsCents: deposits, depositFeesCents: depositFees, buysCents: buys, incomeCents: income, cashCents: cash },
    holdings: [...qty.entries()].map(([isin, h]) => ({ isin, name: h.name, quantity: h.q.toString() })),
    firstDate: rows[0]?.date ?? null
  }
}

export function previewTradeRepublic(s: AppState, filePath: string): TrPreview {
  return previewTradeRepublicText(s, fs.readFileSync(filePath, 'utf8'), path.basename(filePath))
}

export function applyTradeRepublic(s: AppState, token: string, opts: TrApplyOptions): { created: number; skippedDuplicates: number; brokerAccountId: string } {
  const p = pending.get(token)
  if (!p) throw new UserError('La vista previa ha caducado. Vuelve a elegir el archivo.')
  const ctx = s.ctx()
  const source = ctx.accountById.get(opts.sourceAccountId)
  if (!source) throw new UserError('Elige la cuenta desde la que recargas Trade Republic.')
  if (!ctx.settings.investmentFeeCategoryId || !ctx.settings.investmentIncomeCategoryId)
    throw new UserError('Configura en Ajustes las categorías para comisiones y rendimientos de inversión antes de importar.')
  const seen = existingMarkers(s)
  const rows = p.rows.filter((r) => !seen.has(r.id))
  const skippedDuplicates = p.rows.length - rows.length

  return s.db.tx(() => {
    // 1. Cuenta del bróker
    let brokerId = opts.brokerAccountId
    if (!brokerId) {
      // Lo anterior a que empieces a registrar la cuenta de origen se resume en el saldo inicial
      const first = p.rows[0]?.date ?? s.today()
      const opening = source.openingDate > first ? source.openingDate : first
      const before = p.rows.filter((r) => r.date < opening)
      const openingCash = before.reduce((t, r) => t + cashDelta(r), 0)
      const contributed = before.reduce((t, r) => t + (r.kind === 'DEPOSIT' ? r.amountCents : r.kind === 'WITHDRAWAL' ? -r.amountCents : 0), 0)
      brokerId = saveAccount(s, {
        name: 'Trade Republic',
        institution: 'Trade Republic',
        type: 'INVESTMENT',
        currency: 'EUR',
        openingBalanceCents: openingCash,
        openingDate: opening,
        active: true,
        includeNetWorth: true,
        includeLiquidity: false,
        initialContributionsCents: contributed,
        notes: 'Creada al importar el CSV de Trade Republic.'
      }).id
    }
    // dentro de la transacción la caché no se invalida sola
    s.invalidate()
    const broker = s.ctx().accountById.get(brokerId)
    if (!broker) throw new UserError('La cuenta del bróker no existe.')

    // 2. Activos (por ISIN)
    const byIsin = new Map(s.ctx().instruments.filter((i) => i.isin).map((i) => [i.isin!, i.id]))
    for (const r of rows) {
      if (!r.isin || byIsin.has(r.isin) || (r.kind !== 'BUY' && r.kind !== 'SELL')) continue
      const inst = saveInstrument(s, {
        name: r.name ?? r.isin,
        isin: r.isin,
        assetClass: r.assetClass ?? 'OTHER',
        currency: 'EUR',
        accountId: brokerId,
        active: true
      })
      byIsin.set(r.isin, inst.id)
    }
    s.invalidate()

    // 3. Filas
    let created = 0
    for (const r of rows) {
      const tag = marker(r.id)
      const instrumentId = r.isin ? (byIsin.get(r.isin) ?? null) : null
      const op = (o: Partial<InvestmentOp> & { type: InvestmentOp['type'] }, note = '') =>
        saveOp(s, {
          date: r.date,
          accountId: brokerId!,
          instrumentId: o.instrumentId ?? null,
          type: o.type,
          quantity: o.quantity ?? null,
          price: o.price ?? null,
          amountCents: o.amountCents ?? null,
          feeCents: o.feeCents ?? 0,
          taxCents: o.taxCents ?? 0,
          affectsCash: true,
          notes: `${note}${note ? ' ' : ''}${tag}`
        })
      switch (r.kind) {
        case 'DEPOSIT':
        case 'WITHDRAWAL': {
          // Antes de la apertura del bróker ya está dentro de su saldo inicial
          if (r.date < broker.openingDate) {
            created++
            continue
          }
          const dep = r.kind === 'DEPOSIT'
          saveTransfer(s, {
            date: r.date,
            fromAccountId: dep ? source.id : brokerId,
            toAccountId: dep ? brokerId : source.id,
            amountCents: r.amountCents,
            description: dep ? 'Recarga Trade Republic' : 'Retirada Trade Republic',
            source: 'Trade Republic',
            notes: tag
          })
          if (r.feeCents > 0) op({ type: 'FEE', amountCents: r.feeCents }, dep ? 'Comisión de la recarga con tarjeta.' : 'Comisión de la retirada.')
          break
        }
        case 'BUY':
        case 'SELL':
          op({ type: r.kind, instrumentId, quantity: r.quantity, price: r.price, feeCents: r.feeCents, taxCents: r.taxCents })
          break
        case 'DIVIDEND':
          op({ type: 'DIVIDEND', instrumentId, amountCents: r.amountCents, taxCents: r.taxCents })
          break
        case 'INTEREST':
          op({ type: 'INTEREST', amountCents: r.amountCents, taxCents: r.taxCents })
          break
        case 'FEE':
          op({ type: 'FEE', amountCents: r.amountCents })
          break
      }
      created++
    }
    pending.delete(token)
    return { created, skippedDuplicates, brokerAccountId: brokerId }
  })
}

/** para la descripción en la vista previa */
export function trRowLabel(r: TrRow): string {
  return `${KIND_LABEL[r.kind]}${r.name ? ` ${r.name}` : ''}`
}
