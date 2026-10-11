// Esquemas de entrada (validados en la interfaz y otra vez en el proceso principal).
import { z } from 'zod'
import { isISODate } from './dates'
import {
  ACCOUNT_TYPES,
  ASSET_CLASSES,
  COST_METHODS,
  FREQUENCIES,
  GOAL_STATUSES,
  GOAL_TYPES,
  GROUP_KINDS,
  INVESTMENT_OP_TYPES,
  NATURES,
  PRIORITIES,
  RECURRING_KINDS,
  TX_STATUSES,
  TX_TYPES
} from './types'

const isoDate = z.string().refine(isISODate, 'Fecha no válida')
const optDate = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isISODate(v), 'Fecha no válida')
const optText = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null))
const optId = optText
const cents = z.number().int('Importe no válido')
const optCents = z.number().int().nullable().optional().transform((v) => (v === undefined ? null : v))
const decimalStr = z
  .string()
  .transform((v) => v.trim().replace(',', '.'))
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), 'Número no válido')
const optDecimal = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim().replace(',', '.') : null))
  .refine((v) => v === null || /^-?\d+(\.\d+)?$/.test(v), 'Número no válido')
const name = z.string().trim().min(1, 'Obligatorio').max(200)

export const AccountInput = z.object({
  id: optId,
  name,
  institution: optText,
  type: z.enum(ACCOUNT_TYPES),
  currency: z.string().trim().min(3).max(3).default('EUR'),
  openingBalanceCents: cents,
  openingDate: isoDate,
  active: z.boolean(),
  includeNetWorth: z.boolean(),
  includeLiquidity: z.boolean(),
  initialContributionsCents: cents.default(0),
  notes: optText,
  sortOrder: z.number().int().default(0)
})
export type AccountInput = z.input<typeof AccountInput>

export const ReconcileInput = z.object({
  accountId: z.string(),
  date: isoDate,
  bankBalanceCents: cents,
  notes: optText
})
export type ReconcileInput = z.input<typeof ReconcileInput>

export const TxInput = z.object({
  id: optId,
  date: isoDate,
  accountId: z.string().min(1, 'Elige una cuenta'),
  description: name,
  amountCents: cents,
  currency: z.string().default('EUR'),
  type: z.enum(TX_TYPES).refine((t) => t !== 'TRANSFER', 'Las transferencias se crean desde su propio formulario'),
  categoryId: optId,
  subcategoryId: optId,
  /** Si se indica, se crea (o reutiliza) la subcategoría con este nombre. */
  newSubcategoryName: optText,
  merchant: optText,
  recurringId: optId,
  goalId: optId,
  linkedTxId: optId,
  status: z.enum(TX_STATUSES).default('CONFIRMED'),
  nature: z.enum(NATURES).nullable().optional().transform((v) => v ?? null),
  source: optText,
  notes: optText
})
export type TxInput = z.input<typeof TxInput>

export const TransferInput = z.object({
  transferId: optId,
  date: isoDate,
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amountCents: cents.refine((v) => v > 0, 'El importe debe ser positivo'),
  description: name,
  goalId: optId,
  recurringId: optId,
  status: z.enum(TX_STATUSES).default('CONFIRMED'),
  source: optText,
  notes: optText
})
export type TransferInput = z.input<typeof TransferInput>

export const TxFilter = z.object({
  search: z.string().optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  groupId: z.string().optional(),
  type: z.enum(TX_TYPES).optional(),
  types: z.array(z.enum(TX_TYPES)).optional(),
  status: z.enum(TX_STATUSES).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  month: z.string().optional(),
  goalId: z.string().optional(),
  recurringId: z.string().optional(),
  transferId: z.string().optional(),
  onlyIssues: z.boolean().optional(),
  includeCancelled: z.boolean().optional(),
  nature: z.enum(NATURES).optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
  sort: z.enum(['date', 'amount', 'description', 'account', 'category']).optional(),
  dir: z.enum(['asc', 'desc']).optional()
})
export type TxFilter = z.input<typeof TxFilter>

export const GroupInput = z.object({ id: optId, name, kind: z.enum(GROUP_KINDS), sortOrder: z.number().int().default(0) })
export type GroupInput = z.input<typeof GroupInput>

export const CategoryInput = z.object({
  id: optId,
  name,
  groupId: z.string().min(1, 'Elige un grupo'),
  defaultNature: z.enum(NATURES).default('VARIABLE'),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  notes: optText
})
export type CategoryInput = z.input<typeof CategoryInput>

export const SubcategoryInput = z.object({ id: optId, categoryId: z.string().min(1), name, active: z.boolean().default(true) })
export type SubcategoryInput = z.input<typeof SubcategoryInput>

export const RecurringInput = z
  .object({
    id: optId,
    concept: name,
    kind: z.enum(RECURRING_KINDS),
    amountCents: cents.refine((v) => v > 0, 'El importe debe ser positivo'),
    frequency: z.enum(FREQUENCIES),
    startDate: optDate,
    endDate: optDate,
    categoryId: optId,
    accountId: z.string().min(1, 'Elige una cuenta'),
    toAccountId: optId,
    essential: z.boolean().default(false),
    active: z.boolean().default(true),
    minCents: optCents,
    maxCents: optCents,
    notes: optText
  })
  .refine((r) => r.kind !== 'TRANSFER' || (r.toAccountId && r.toAccountId !== r.accountId), {
    message: 'Una transferencia necesita una cuenta de destino distinta',
    path: ['toAccountId']
  })
  .refine((r) => r.frequency !== 'ONE_OFF' || !!r.startDate, { message: 'Indica la fecha', path: ['startDate'] })
  .refine((r) => !r.endDate || !r.startDate || r.endDate >= r.startDate, {
    message: 'La fecha final es anterior a la inicial',
    path: ['endDate']
  })
export type RecurringInput = z.input<typeof RecurringInput>

export const GoalInput = z.object({
  id: optId,
  name,
  type: z.enum(GOAL_TYPES),
  priority: z.enum(PRIORITIES),
  targetCents: optCents,
  deadline: optDate,
  status: z.enum(GOAL_STATUSES).default('ACTIVE'),
  linkedAccountId: optId,
  plannedMonthlyCents: optCents,
  notes: optText,
  sortOrder: z.number().int().default(0)
})
export type GoalInput = z.input<typeof GoalInput>

export const AllocationInput = z.object({
  id: optId,
  goalId: z.string().min(1),
  date: isoDate,
  amountCents: cents.refine((v) => v !== 0, 'El importe no puede ser 0'),
  accountId: z.string().min(1, 'Elige la cuenta donde está el dinero'),
  notes: optText
})
export type AllocationInput = z.input<typeof AllocationInput>

export const BudgetSetInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  categoryId: z.string().min(1),
  amountCents: optCents,
  alertPct: z.number().int().min(1).max(100).nullable().optional()
})
export type BudgetSetInput = z.input<typeof BudgetSetInput>

export const ScenarioInput = z.object({
  id: optId,
  name,
  incomeFactor: decimalStr,
  expenseFactor: decimalStr,
  variableMonthlyCents: cents.refine((v) => v >= 0, 'No puede ser negativo'),
  notes: optText,
  sortOrder: z.number().int().default(0)
})
export type ScenarioInput = z.input<typeof ScenarioInput>

export const BlockInput = z.object({
  id: optId,
  name,
  targetPct: decimalStr,
  maxPct: optDecimal,
  notes: optText,
  sortOrder: z.number().int().default(0)
})
export type BlockInput = z.input<typeof BlockInput>

export const InstrumentInput = z.object({
  id: optId,
  name,
  ticker: optText,
  isin: optText,
  assetClass: z.enum(ASSET_CLASSES),
  currency: z.string().trim().min(3).max(3).default('EUR'),
  region: optText,
  sector: optText,
  blockId: optId,
  maxWeightPct: optDecimal,
  accountId: optId,
  active: z.boolean().default(true),
  notes: optText
})
export type InstrumentInput = z.input<typeof InstrumentInput>

export const OpInput = z
  .object({
    id: optId,
    date: isoDate,
    accountId: z.string().min(1, 'Elige la cuenta del bróker'),
    instrumentId: optId,
    type: z.enum(INVESTMENT_OP_TYPES),
    quantity: optDecimal,
    price: optDecimal,
    amountCents: optCents,
    feeCents: cents.default(0),
    taxCents: cents.default(0),
    splitRatio: optDecimal,
    affectsCash: z.boolean().default(true),
    notes: optText
  })
  .refine((o) => !['BUY', 'SELL', 'SPLIT'].includes(o.type) || !!o.instrumentId, {
    message: 'Elige el activo',
    path: ['instrumentId']
  })
  .refine((o) => !['BUY', 'SELL'].includes(o.type) || (!!o.quantity && Number(o.quantity) > 0), {
    message: 'Indica las unidades',
    path: ['quantity']
  })
  .refine((o) => !['BUY', 'SELL'].includes(o.type) || (!!o.price && Number(o.price) >= 0), {
    message: 'Indica el precio por unidad',
    path: ['price']
  })
  .refine((o) => o.type !== 'SPLIT' || (!!o.splitRatio && Number(o.splitRatio) > 0), {
    message: 'Indica la proporción del split',
    path: ['splitRatio']
  })
  .refine((o) => !['DIVIDEND', 'INTEREST', 'FEE'].includes(o.type) || (o.amountCents ?? 0) > 0, {
    message: 'Indica el importe',
    path: ['amountCents']
  })
  .refine((o) => o.feeCents >= 0 && o.taxCents >= 0, { message: 'Comisión e impuestos no pueden ser negativos', path: ['feeCents'] })
export type OpInput = z.input<typeof OpInput>

export const PriceInput = z.object({
  id: optId,
  instrumentId: z.string().min(1),
  date: isoDate,
  price: decimalStr.refine((v) => Number(v) >= 0, 'Precio no válido'),
  notes: optText
})
export type PriceInput = z.input<typeof PriceInput>

export const SettingsInput = z
  .object({
    trackingStart: isoDate,
    minLiquidityCents: cents,
    emergencyMonths: z.number().int().min(0).max(36),
    budgetAlertPct: z.number().int().min(1).max(100),
    duplicateWindowDays: z.number().int().min(0).max(30),
    costMethod: z.enum(COST_METHODS),
    theme: z.enum(['system', 'light', 'dark']),
    forecastScenarioId: z.string(),
    verifyStaleDays: z.number().int().min(1).max(365),
    concentrationAlertPct: z.number().min(1).max(100),
    investmentFeeCategoryId: z.string().nullable(),
    investmentIncomeCategoryId: z.string().nullable(),
    lastAccountId: z.string().nullable(),
    lastCategoryId: z.string().nullable()
  })
  .partial()
export type SettingsInput = z.input<typeof SettingsInput>

export function firstError(e: unknown): string {
  if (e instanceof z.ZodError) {
    const i = e.issues[0]
    return i ? `${i.message}${i.path.length ? ` (${i.path.join('.')})` : ''}` : 'Datos no válidos'
  }
  return e instanceof Error ? e.message : String(e)
}
