// Base de datos INVENTADA para el test dorado sintético. Nada de esto son datos reales.
// Los servicios reales generan ids secuenciales (CAT001, TX0001…); solo `s.now()` depende del reloj, y aquí se fija.
import { saveAccount as raw_saveAccount, reconcile as raw_reconcile, saveCategory as raw_saveCategory, saveGroup as raw_saveGroup, saveSubcategory as raw_saveSubcategory, updateSettings as raw_updateSettings } from '../../src/main/services/catalog'
import { saveBlock as raw_saveBlock, saveInstrument as raw_saveInstrument, saveOp as raw_saveOp, savePrice as raw_savePrice } from '../../src/main/services/investments'
import { copyBudgets as raw_copyBudgets, saveAllocation as raw_saveAllocation, saveGoal as raw_saveGoal, saveRecurring as raw_saveRecurring, saveScenario as raw_saveScenario, setBudget as raw_setBudget } from '../../src/main/services/planning'
import type { AppState } from '../../src/main/services/state'
import { dismissDuplicate as raw_dismissDuplicate, saveTransaction as raw_saveTransaction, saveTransfer as raw_saveTransfer } from '../../src/main/services/transactions'
import { DEFAULT_PLAN } from '../../src/shared/domain/investmentPlan'
import type { AccountInput, TxInput } from '../../src/shared/schemas'
import { cat } from '../helpers'

const day = (ym: string, d: number) => `${ym}-${String(d).padStart(2, '0')}`

// Reloj por PASO del montaje (no por llamada): cada operación del constructor avanza el paso, y cualquier número
// de llamadas a s.now() dentro del mismo paso devuelve el mismo instante. Así, si un servicio llama una vez más
// a s.now(), los createdAt/updatedAt no se desplazan. Los pasos son crecientes (el orden de las operaciones usa created_at).
let step = 0
function fixClock(s: AppState): void {
  step = 0
  s.now = () => new Date(Date.UTC(2026, 0, 1, 12, 0, 0) + step * 1000).toISOString()
}

export function buildSyntheticApp(s: AppState): void {
  fixClock(s)
  // Cada llamada de montaje avanza el paso antes de ejecutarse
  const stepped =
    <A extends unknown[], R>(f: (s: AppState, ...a: A) => R) =>
    (_s: AppState, ...a: A): R => {
      step++
      return f(s, ...a)
    }
  const saveAccount = stepped(raw_saveAccount)
  const reconcile = stepped(raw_reconcile)
  const saveCategory = stepped(raw_saveCategory)
  const saveGroup = stepped(raw_saveGroup)
  const saveSubcategory = stepped(raw_saveSubcategory)
  const updateSettings = stepped(raw_updateSettings)
  const saveBlock = stepped(raw_saveBlock)
  const saveInstrument = stepped(raw_saveInstrument)
  const saveOp = stepped(raw_saveOp)
  const savePrice = stepped(raw_savePrice)
  const copyBudgets = stepped(raw_copyBudgets)
  const saveAllocation = stepped(raw_saveAllocation)
  const saveGoal = stepped(raw_saveGoal)
  const saveRecurring = stepped(raw_saveRecurring)
  const saveScenario = stepped(raw_saveScenario)
  const setBudget = stepped(raw_setBudget)
  const dismissDuplicate = stepped(raw_dismissDuplicate)
  const saveTransaction = stepped(raw_saveTransaction)
  const saveTransfer = stepped(raw_saveTransfer)
  s.todayOverride = '2026-11-25'

  updateSettings(s, { trackingStart: '2026-07-01', minLiquidityCents: 150000, emergencyMonths: 3, duplicateWindowDays: 3 })

  // ----- Catálogo propio -----
  const grpExtra = saveGroup(s, { name: 'Grupo Ficticio', kind: 'EXPENSE', sortOrder: 9 })
  const catMascota = saveCategory(s, { name: 'Mascota Ficticia', groupId: grpExtra.id, defaultNature: 'VARIABLE' })
  const subVet = saveSubcategory(s, { categoryId: catMascota.id, name: 'Veterinario Ficticio' })

  // ----- Cuentas -----
  const acc = (a: Partial<AccountInput> & { name: string }) =>
    saveAccount(s, {
      type: 'CHECKING',
      openingBalanceCents: 0,
      openingDate: '2026-06-01',
      active: true,
      includeNetWorth: true,
      includeLiquidity: false,
      ...a
    })
  const corr = acc({ name: 'Corriente Ficticia', institution: 'Banco Ficticio', openingBalanceCents: 250000, includeLiquidity: true })
  const efec = acc({ name: 'Efectivo Ficticio', type: 'CASH', openingBalanceCents: 15000, includeLiquidity: true })
  const huchaVac = acc({ name: 'Hucha Vacaciones Ficticia', type: 'SAVINGS', openingBalanceCents: 50000 })
  const huchaEmg = acc({ name: 'Hucha Emergencias Ficticia', type: 'SAVINGS', openingBalanceCents: 120000 })
  const bro = acc({ name: 'Broker Ficticio', type: 'INVESTMENT', openingDate: '2026-07-01', initialContributionsCents: 30000 })
  const cripto = acc({ name: 'Cripto Ficticia', type: 'CRYPTO', openingBalanceCents: 20000 })
  const tarjeta = acc({ name: 'Tarjeta Ficticia', type: 'LIABILITY', openingBalanceCents: -20000 })
  const vieja = acc({ name: 'Cuenta Cerrada Ficticia', openingBalanceCents: 1000, active: false, includeNetWorth: false })

  // ----- Recurrentes -----
  const rec = (r: Parameters<typeof saveRecurring>[1]) => saveRecurring(s, r).id
  const rNomina = rec({ concept: 'Nómina Ficticia', kind: 'INCOME', amountCents: 180000, frequency: 'MONTHLY', startDate: '2026-06-28', categoryId: cat(s, 'Nómina'), accountId: corr.id })
  const rAlquiler = rec({ concept: 'Alquiler Ficticio', kind: 'EXPENSE', amountCents: 65000, frequency: 'MONTHLY', startDate: '2026-07-01', categoryId: cat(s, 'Vivienda'), accountId: corr.id, essential: true })
  const rSuscr = rec({ concept: 'Suscripción Ficticia', kind: 'EXPENSE', amountCents: 1299, frequency: 'MONTHLY', startDate: '2026-07-05', categoryId: cat(s, 'Suscripciones'), accountId: corr.id })
  const rGym = rec({ concept: 'Gimnasio Ficticio', kind: 'EXPENSE', amountCents: 3500, frequency: 'MONTHLY', startDate: '2026-07-10', categoryId: cat(s, 'Gimnasio'), accountId: corr.id, minCents: 3000, maxCents: 4000 })
  const rSeguro = rec({ concept: 'Seguro Ficticio', kind: 'EXPENSE', amountCents: 48000, frequency: 'YEARLY', startDate: '2026-09-12', categoryId: cat(s, 'Seguros'), accountId: corr.id, essential: true })
  const rHucha = rec({ concept: 'Ahorro Hucha Ficticio', kind: 'TRANSFER', amountCents: 10000, frequency: 'MONTHLY', startDate: '2026-07-15', accountId: corr.id, toAccountId: huchaVac.id })
  rec({ concept: 'Pago Único Ficticio', kind: 'EXPENSE', amountCents: 25000, frequency: 'ONE_OFF', startDate: '2026-12-05', categoryId: cat(s, 'Otros gastos'), accountId: corr.id })
  rec({ concept: 'Bus Semanal Ficticio', kind: 'EXPENSE', amountCents: 1500, frequency: 'WEEKLY', startDate: '2026-10-05', endDate: '2026-12-31', categoryId: cat(s, 'Transporte'), accountId: efec.id })
  rec({ concept: 'Recurrente Inactivo Ficticio', kind: 'EXPENSE', amountCents: 999, frequency: 'MONTHLY', startDate: '2026-07-01', categoryId: cat(s, 'Comunicaciones'), accountId: corr.id, active: false })
  rec({ concept: 'Médico Trimestral Ficticio', kind: 'EXPENSE', amountCents: 12000, frequency: 'QUARTERLY', startDate: '2026-07-20', categoryId: cat(s, 'Salud'), accountId: corr.id })
  rec({ concept: 'Recurrente Terminado Ficticio', kind: 'EXPENSE', amountCents: 500, frequency: 'MONTHLY', startDate: '2026-06-01', endDate: '2026-08-31', categoryId: cat(s, 'Libros'), accountId: corr.id })

  // ----- Objetivos -----
  const gVac = saveGoal(s, { name: 'Vacaciones Ficticias', type: 'PLANNED', priority: 'MEDIUM', targetCents: 100000, deadline: '2027-03-01', linkedAccountId: huchaVac.id, plannedMonthlyCents: 10000 })
  const gFondo = saveGoal(s, { name: 'Fondo Ficticio', type: 'REQUIRED', priority: 'HIGH', targetCents: 300000, plannedMonthlyCents: 20000 })
  const gPortatil = saveGoal(s, { name: 'Portátil Ficticio', type: 'OPTIONAL', priority: 'LOW', targetCents: 90000, deadline: '2026-09-30' })
  saveGoal(s, { name: 'Coche Ficticio', type: 'LONG_TERM', priority: 'LOW', targetCents: 800000, deadline: '2030-01-01', status: 'PAUSED' })
  const gCurso = saveGoal(s, { name: 'Curso Ficticio', type: 'PLANNED', priority: 'MEDIUM', targetCents: 20000, status: 'COMPLETED' })
  saveGoal(s, { name: 'Sin Meta Ficticia', type: 'OPTIONAL', priority: 'LOW' })
  const gEmg = saveGoal(s, { name: 'Emergencias Ficticias', type: 'REQUIRED', priority: 'HIGH', targetCents: 500000, deadline: '2027-06-30', linkedAccountId: huchaEmg.id })
  void gEmg
  saveAllocation(s, { goalId: gFondo.id, date: '2026-09-20', amountCents: 20000, accountId: corr.id })
  saveAllocation(s, { goalId: gFondo.id, date: '2026-10-20', amountCents: 15000, accountId: huchaEmg.id })
  saveAllocation(s, { goalId: gFondo.id, date: '2026-12-20', amountCents: 5000, accountId: corr.id }) // futura
  saveAllocation(s, { goalId: gPortatil.id, date: '2026-08-10', amountCents: 30000, accountId: corr.id })
  saveAllocation(s, { goalId: gCurso.id, date: '2026-07-20', amountCents: 20000, accountId: corr.id })

  // ----- Movimientos -----
  const t = (accountId: string, date: string, description: string, amountCents: number, catName: string | null, extra: Partial<TxInput> = {}) =>
    saveTransaction(s, {
      accountId,
      date,
      description,
      amountCents,
      type: amountCents >= 0 ? 'INCOME' : 'EXPENSE',
      categoryId: catName ? cat(s, catName) : null,
      ...extra
    })

  t(corr.id, '2026-05-20', 'Compra anterior a la apertura', -2000, 'Ropa') // antes de la apertura: no cuenta
  const months = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']
  const groceries = [[4520, 6310], [5240, 6685], [6015, 5530], [22000, 20000], [5800, 6120]]
  let septShoes: { id: string } | null = null
  months.forEach((ym, i) => {
    if (i < 4) t(corr.id, day(ym, 28), 'Nómina Ficticia', 180000, 'Nómina', { recurringId: rNomina })
    t(corr.id, day(ym, 1), 'Alquiler Ficticio', -65000, 'Vivienda', { recurringId: rAlquiler })
    // en octubre se cobra 9 días tarde y en septiembre sin enlazar a la regla (emparejado por parecido)
    t(corr.id, day(ym, i === 3 ? 14 : 5), 'Suscripción Ficticia', -1299, 'Suscripciones', i === 2 ? {} : { recurringId: rSuscr })
    if (i === 1 || i === 3) t(corr.id, day(ym, 10), 'Gimnasio Ficticio', i === 1 ? -4500 : -3500, 'Gimnasio', { recurringId: rGym })
    groceries[i].forEach((c, j) => t(i === 2 && j === 1 ? efec.id : corr.id, day(ym, 3 + j * 11), `Súper Ficticio ${j + 1}`, -c, 'Alimentación'))
    t(corr.id, day(ym, 8), 'Transporte Ficticio', -(2000 + i * 350), 'Transporte')
    t(corr.id, day(ym, 12), 'Cena Ficticia', -(5000 + i * 1500), 'Salir fuera', { merchant: 'Restaurante Ficticio' })
    if (i === 3) t(corr.id, day(ym, 19), 'Cena Ficticia 2', -9000, 'Salir fuera')
    if (i === 0 || i === 3) t(corr.id, day(ym, 21), 'Ocio Ficticio', -(1800 + i * 200), 'Entretenimiento')
    if (i === 1) t(corr.id, day(ym, 14), 'Ropa Ficticia', -18000, 'Ropa', { nature: 'EXTRAORDINARY', notes: 'Compra única ficticia' })
    if (i === 2) septShoes = t(corr.id, day(ym, 22), 'Zapatos Ficticios', -9000, 'Ropa')
  })
  t(corr.id, '2026-09-12', 'Seguro Ficticio', -48000, 'Seguros', { recurringId: rSeguro })
  t(huchaEmg.id, '2026-09-30', 'Intereses Ficticios', 312, 'Intereses')
  t(huchaEmg.id, '2026-10-31', 'Intereses Ficticios', 298, 'Intereses')
  t(corr.id, '2026-10-20', 'Devolución zapatos', 2500, 'Ropa', { type: 'REFUND', linkedTxId: septShoes!.id })
  t(corr.id, '2026-10-21', 'Devolución sin enlace', 700, 'Libros', { type: 'REFUND' })
  t(corr.id, '2026-09-30', 'Ajuste Ficticio', 500, null, { type: 'ADJUSTMENT' })
  t(corr.id, '2026-11-14', 'Pienso Ficticio', -3200, 'Mascota Ficticia', { newSubcategoryName: 'Veterinario Ficticio' })
  void subVet
  t(corr.id, '2026-10-26', 'Pienso Ficticio', -2800, 'Mascota Ficticia', { subcategoryId: subVet.id })
  t(corr.id, '2026-09-18', 'Portátil Ficticio', -12000, 'Entretenimiento', { goalId: gPortatil.id })
  t(efec.id, '2026-08-05', 'Mercado Ficticio', -1200, 'Alimentación')
  t(corr.id, '2026-10-30', 'Prácticas Ficticias', 35000, 'Prácticas')
  t(tarjeta.id, '2026-10-17', 'Compra con tarjeta', -4000, 'Ropa')
  t(tarjeta.id, '2026-11-12', 'Compra con tarjeta 2', -6500, 'Entretenimiento')
  t(vieja.id, '2026-07-01', 'Movimiento cuenta cerrada', -500, 'Otros gastos')
  t(cripto.id, '2026-09-01', 'Comisión cripto', -150, 'Comisiones bancarias')
  // pendientes, anulados y duplicados
  t(corr.id, '2026-11-22', 'Compra pendiente ficticia', -2300, 'Ropa', { status: 'PENDING_REVIEW' })
  t(corr.id, '2026-10-09', 'Compra anulada ficticia', -9900, 'Ropa', { status: 'CANCELLED' })
  t(corr.id, '2026-10-14', 'Café Ficticio', -350, 'Alimentación')
  t(corr.id, '2026-10-14', 'Café Ficticio', -350, 'Alimentación')
  t(corr.id, '2026-11-20', 'Menú del día Ficticio', -1250, 'Salir fuera')
  t(corr.id, '2026-11-21', 'Menú del día Ficticio', -1250, 'Salir fuera')
  const tx1 = t(corr.id, '2026-09-15', 'Taxi Ficticio', -1800, 'Transporte')
  const tx2 = t(corr.id, '2026-09-15', 'Taxi Ficticio', -1800, 'Transporte')
  dismissDuplicate(s, tx1.id, tx2.id) // duplicado descartado por el usuario

  // ----- Traspasos -----
  const tr = (from: string, to: string, cents: number, date: string, extra: Partial<Parameters<typeof saveTransfer>[1]> = {}) =>
    saveTransfer(s, { date, fromAccountId: from, toAccountId: to, amountCents: cents, description: 'Traspaso Ficticio', ...extra })
  for (const ym of ['2026-07', '2026-08', '2026-09', '2026-10']) tr(corr.id, huchaVac.id, 10000, day(ym, 15), { recurringId: rHucha })
  tr(corr.id, efec.id, 5000, '2026-08-02')
  tr(corr.id, tarjeta.id, 20000, '2026-10-05')
  tr(corr.id, bro.id, 40000, '2026-07-02')
  tr(corr.id, bro.id, 30000, '2026-08-02')
  tr(corr.id, bro.id, 30000, '2026-09-02')
  tr(corr.id, bro.id, 30000, '2026-10-02')
  tr(corr.id, bro.id, 20000, '2026-11-02')
  tr(huchaEmg.id, corr.id, 8000, '2026-10-25', { goalId: gFondo.id })
  tr(corr.id, cripto.id, 3000, '2026-09-10')
  tr(corr.id, huchaVac.id, 5000, '2026-11-10', { status: 'PENDING_REVIEW' })

  // ----- Presupuestos -----
  setBudget(s, { month: '2026-07', categoryId: cat(s, 'Alimentación'), amountCents: 30000 })
  setBudget(s, { month: '2026-07', categoryId: cat(s, 'Salir fuera'), amountCents: 20000 })
  setBudget(s, { month: '2026-07', categoryId: cat(s, 'Transporte'), amountCents: 10000 })
  setBudget(s, { month: '2026-07', categoryId: cat(s, 'Entretenimiento'), amountCents: 4000, alertPct: 60 })
  setBudget(s, { month: '2026-07', categoryId: cat(s, 'Vivienda'), amountCents: 65000 })
  setBudget(s, { month: '2026-07', categoryId: cat(s, 'Ropa'), amountCents: 5000 })
  setBudget(s, { month: '2026-07', categoryId: cat(s, 'Libros'), amountCents: 3000 })
  setBudget(s, { month: '2026-07', categoryId: cat(s, 'Nómina'), amountCents: 180000 })
  copyBudgets(s, '2026-07', '2026-08')
  copyBudgets(s, '2026-08', '2026-09')
  copyBudgets(s, '2026-09', '2026-10')
  copyBudgets(s, '2026-10', '2026-11')
  setBudget(s, { month: '2026-11', categoryId: cat(s, 'Salir fuera'), amountCents: 15000 })
  setBudget(s, { month: '2026-11', categoryId: cat(s, 'Libros'), amountCents: null })
  setBudget(s, { month: '2026-11', categoryId: cat(s, 'Mascota Ficticia'), amountCents: 10000 })

  // ----- Escenarios -----
  saveScenario(s, { id: 'SCN002', name: 'Conservador', incomeFactor: '0.9', expenseFactor: '1.15', variableMonthlyCents: 30000 })

  // ----- Inversiones -----
  const bCore = saveBlock(s, { name: 'Núcleo Ficticio', targetPct: '70', maxPct: null })
  const bSat = saveBlock(s, { name: 'Satélites Ficticios', targetPct: '20', maxPct: '30', sortOrder: 2 })
  const bOro = saveBlock(s, { name: 'Oro Ficticio', targetPct: '10', maxPct: null, sortOrder: 3 })
  const iW = saveInstrument(s, { name: 'ETF Mundo Ficticio', ticker: 'MUNF', isin: 'ie00ficticio1', assetClass: 'ETF', blockId: bCore.id, accountId: bro.id, region: 'Global' })
  const iA = saveInstrument(s, { name: 'Acción Ficticia A', ticker: 'ACFA', assetClass: 'STOCK', blockId: bSat.id, maxWeightPct: '10', accountId: bro.id, sector: 'Tecnología' })
  const iB = saveInstrument(s, { name: 'Acción Ficticia B', assetClass: 'STOCK', blockId: bSat.id, accountId: bro.id })
  const iO = saveInstrument(s, { name: 'Oro Ficticio', assetClass: 'METAL', blockId: bOro.id, accountId: bro.id })
  const iF = saveInstrument(s, { name: 'Fondo Ficticio', assetClass: 'FUND', accountId: bro.id })
  saveInstrument(s, { name: 'Cripto Ficticia Inactiva', assetClass: 'CRYPTO', accountId: cripto.id, active: false })
  const op = (o: Parameters<typeof saveOp>[1]) => saveOp(s, o)
  const B = bro.id
  op({ date: '2026-05-10', accountId: B, instrumentId: iW.id, type: 'BUY', quantity: '1.5', price: '100', feeCents: 100 }) // previa a la apertura
  op({ date: '2026-07-02', accountId: B, instrumentId: iW.id, type: 'BUY', quantity: '2', price: '102.5' })
  op({ date: '2026-07-02', accountId: B, instrumentId: iA.id, type: 'BUY', quantity: '1', price: '250', feeCents: 100 })
  op({ date: '2026-08-03', accountId: B, instrumentId: iW.id, type: 'BUY', quantity: '1.2345', price: '105.12' })
  op({ date: '2026-08-03', accountId: B, instrumentId: iO.id, type: 'BUY', quantity: '0.5', price: '180' })
  op({ date: '2026-08-20', accountId: B, instrumentId: iA.id, type: 'SELL', quantity: '0.4', price: '280', feeCents: 100, taxCents: 150 })
  op({ date: '2026-09-02', accountId: B, instrumentId: iW.id, type: 'BUY', quantity: '0.8', price: '99' })
  op({ date: '2026-09-05', accountId: B, instrumentId: iB.id, type: 'BUY', quantity: '2', price: '100' })
  op({ date: '2026-09-15', accountId: B, instrumentId: iA.id, type: 'DIVIDEND', amountCents: 81, taxCents: 24 })
  op({ date: '2026-09-16', accountId: B, instrumentId: null, type: 'INTEREST', amountCents: 150 })
  op({ date: '2026-09-18', accountId: B, instrumentId: null, type: 'FEE', amountCents: 100 })
  op({ date: '2026-10-02', accountId: B, instrumentId: iW.id, type: 'BUY', quantity: '1', price: '108' })
  op({ date: '2026-10-05', accountId: B, instrumentId: iB.id, type: 'SPLIT', splitRatio: '4' })
  op({ date: '2026-10-12', accountId: B, instrumentId: iB.id, type: 'SELL', quantity: '4', price: '20', feeCents: 100 })
  op({ date: '2026-10-20', accountId: B, instrumentId: iA.id, type: 'BUY', quantity: '0.3', price: '260', affectsCash: false })
  op({ date: '2026-11-02', accountId: B, instrumentId: iW.id, type: 'BUY', quantity: '0.5', price: '110', feeCents: 100 })
  op({ date: '2026-11-10', accountId: B, instrumentId: iF.id, type: 'BUY', quantity: '3', price: '12.5' })
  for (const [inst, date, price] of [
    [iW, '2026-07-01', '101'], [iW, '2026-08-01', '104'], [iW, '2026-09-01', '98.5'], [iW, '2026-10-01', '107'], [iW, '2026-11-20', '111.25'],
    [iA, '2026-07-31', '255'], [iA, '2026-09-30', '270'], [iA, '2026-11-15', '240'],
    [iB, '2026-09-30', '98'], [iB, '2026-10-31', '22'],
    [iO, '2026-08-31', '185'], [iO, '2026-11-01', '190.5'],
    [iF, '2026-11-10', '12.6']
  ] as const)
    savePrice(s, { instrumentId: inst.id, date, price })

  updateSettings(s, {
    investmentPlan: {
      ...DEFAULT_PLAN,
      enabled: true,
      startDate: '2026-07-02',
      endDate: '2027-06-30',
      monthlyCents: 30000,
      executionDay: 2,
      coreBlockId: bCore.id,
      satelliteBlockId: bSat.id,
      maxSatellites: 2,
      brokerAccountId: bro.id,
      cushionAccountId: huchaEmg.id,
      cushionCents: 100000,
      firstReviewDate: '2026-12-01',
      reviewEveryMonths: 3,
      theses: { [iA.id]: { text: 'Tesis ficticia para la acción A', reviewDate: '2026-12-15' } }
    }
  })

  // ----- Conciliaciones -----
  reconcile(s, { accountId: corr.id, date: '2026-09-30', bankBalanceCents: 312345, notes: 'Conciliación ficticia' })
  reconcile(s, { accountId: corr.id, date: '2026-10-31', bankBalanceCents: 275000 })
  reconcile(s, { accountId: efec.id, date: '2026-08-31', bankBalanceCents: 12000 })
  reconcile(s, { accountId: bro.id, date: '2026-10-31', bankBalanceCents: 99999 })
  reconcile(s, { accountId: huchaVac.id, date: '2026-11-20', bankBalanceCents: 90000 })
}
