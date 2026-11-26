// Fusión de un panel guardado con su diseño por defecto (`mergeDashboard`).
import { describe, expect, it } from 'vitest'
import { chartCardId, defaultCards, mergeDashboard } from '../../src/shared/core/charts'
import type { DashboardCard, DashboardDefault } from '../../src/shared/core/metrics-types'

const DEF: DashboardDefault = {
  dashboardId: 'finanzas',
  cards: [
    { ref: 'saldo', size: 'm' },
    { ref: 'gastos', size: 'l' },
    { ref: 'detalle', size: 'full' }
  ]
}
const FIJAS = ['saldo', 'gastos', 'detalle', 'extra']
const fija = (ref: string, over: Partial<DashboardCard> = {}): DashboardCard => ({ id: `fixed:${ref}`, type: 'fixed', ref, size: 'm', hidden: false, ...over })
const graf = (ref: string, over: Partial<DashboardCard> = {}): DashboardCard => ({ id: `chart:${ref}`, type: 'chart', ref, size: 'l', hidden: false, ...over })

describe('mergeDashboard', () => {
  it('sin fila guardada: el diseño por defecto, visible', () => {
    expect(mergeDashboard(null, DEF, FIJAS, [])).toEqual(defaultCards(DEF))
    expect(defaultCards(DEF)[0]).toEqual({ id: 'fixed:saldo', type: 'fixed', ref: 'saldo', size: 'm', hidden: false })
  })

  it('fijas nuevas del diseño por defecto: al final y visibles; el orden y lo oculto se respetan', () => {
    const saved = [graf('7'), fija('gastos', { hidden: true, size: 's' }), fija('saldo')]
    expect(mergeDashboard(saved, DEF, new Set(FIJAS), new Set(['7']))).toEqual([
      graf('7'),
      fija('gastos', { hidden: true, size: 's' }),
      fija('saldo'),
      { id: 'fixed:detalle', type: 'fixed', ref: 'detalle', size: 'full', hidden: false }
    ])
  })

  it('fijas con id desconocido y gráficos con referencia muerta: fuera', () => {
    const saved = [fija('borrada'), graf('7'), graf('8'), fija('saldo'), fija('gastos'), fija('detalle')]
    expect(mergeDashboard(saved, DEF, FIJAS, ['8']).map((c) => c.id)).toEqual(['chart:8', 'fixed:saldo', 'fixed:gastos', 'fixed:detalle'])
  })

  it('una fija conocida que no está en el diseño por defecto se queda', () => {
    const saved = [fija('extra'), fija('saldo'), fija('gastos'), fija('detalle')]
    expect(mergeDashboard(saved, DEF, FIJAS, []).map((c) => c.ref)).toEqual(['extra', 'saldo', 'gastos', 'detalle'])
  })

  it('ids únicos: repetidos fuera, una fija no se repite y la añadida no choca', () => {
    const saved = [graf('7'), graf('7', { size: 's' }), fija('saldo'), fija('saldo', { id: 'otra' }), { ...graf('9'), id: 'fixed:gastos' }]
    const r = mergeDashboard(saved, DEF, FIJAS, ['7', '9'])
    expect(r.map((c) => [c.id, c.ref])).toEqual([
      ['chart:7', '7'],
      ['fixed:saldo', 'saldo'],
      ['fixed:gastos', '9'],
      ['fixed:gastos:2', 'gastos'],
      ['fixed:detalle', 'detalle']
    ])
    expect(new Set(r.map((c) => c.id)).size).toBe(r.length)
  })

  it('las fijas nunca desaparecen: si no están, vuelven', () => {
    expect(mergeDashboard([], DEF, FIJAS, []).map((c) => c.ref)).toEqual(['saldo', 'gastos', 'detalle'])
  })

  it('chartCardId no choca con los ids que ya hay', () => {
    expect(chartCardId(5, [])).toBe('chart:5')
    expect(chartCardId(5, ['chart:5', 'chart:5:2'])).toBe('chart:5:3')
  })
})
