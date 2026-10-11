// Dinero realmente disponible para gastar hoy.
// disponible = liquidez − reservas de objetivos en cuentas líquidas − cargos recurrentes pendientes este mes
import { formatDate, monthEnd, monthOf } from '../dates'
import { accountRole, type Ctx } from './ctx'
import { goalProgress } from './goals'
import { liquidityAt } from './ledger'
import { pendingOccurrences, signedAmount } from './recurring'

export interface AvailableLine {
  label: string
  amountCents: number
  ref?: { kind: 'goal' | 'recurring' | 'account'; id: string }
}

export interface AvailableCash {
  liquidityCents: number
  reservationsCents: number
  pendingCents: number
  availableCents: number
  belowMinimum: boolean
  lines: AvailableLine[]
}

export function availableCash(ctx: Ctx): AvailableCash {
  const today = ctx.today
  const lines: AvailableLine[] = []
  const liquidity = liquidityAt(ctx, today)
  let reservations = 0
  for (const g of ctx.goals) {
    if (g.status !== 'ACTIVE') continue
    const p = goalProgress(ctx, g)
    if (p.reservedFromAvailableCents > 0) {
      reservations += p.reservedFromAvailableCents
      lines.push({ label: `Reservado: ${g.name}`, amountCents: -p.reservedFromAvailableCents, ref: { kind: 'goal', id: g.id } })
    }
  }
  let pending = 0
  const end = monthEnd(monthOf(today))
  const monthStartDate = `${monthOf(today)}-01`
  for (const r of ctx.recurring) {
    if (!r.active || r.kind === 'INCOME') continue
    const from = ctx.accountById.get(r.accountId)
    if (!from || accountRole(from) !== 'LIQUID') continue
    if (r.kind === 'TRANSFER') {
      const to = r.toAccountId ? ctx.accountById.get(r.toAccountId) : undefined
      if (to && accountRole(to) === 'LIQUID') continue
    }
    const dates = pendingOccurrences(ctx, r, monthStartDate, end)
    for (const d of dates) {
      const amt = signedAmount(r)
      pending += -amt
      lines.push({ label: `${r.concept} (${formatDate(d)})`, amountCents: amt, ref: { kind: 'recurring', id: r.id } })
    }
  }
  const available = liquidity - reservations - pending
  return {
    liquidityCents: liquidity,
    reservationsCents: reservations,
    pendingCents: pending,
    availableCents: available,
    belowMinimum: available < ctx.settings.minLiquidityCents,
    lines
  }
}
