import { useMemo } from 'react'
import { useApi } from './api'

/** Catálogo (cuentas, categorías…) con búsquedas por id. */
export function useCatalog() {
  const q = useApi('catalog.get', [], { staleTime: 30_000 })
  const maps = useMemo(() => {
    const d = q.data
    return {
      account: new Map(d?.accounts.map((a) => [a.id, a]) ?? []),
      category: new Map(d?.categories.map((c) => [c.id, c]) ?? []),
      group: new Map(d?.groups.map((g) => [g.id, g]) ?? []),
      subcategory: new Map(d?.subcategories.map((s) => [s.id, s]) ?? []),
      goal: new Map(d?.goals.map((g) => [g.id, g]) ?? []),
      rule: new Map(d?.recurring.map((r) => [r.id, r]) ?? []),
      instrument: new Map(d?.instruments.map((i) => [i.id, i]) ?? []),
      block: new Map(d?.blocks.map((b) => [b.id, b]) ?? [])
    }
  }, [q.data])
  const d = q.data
  return {
    ...q,
    cat: d,
    maps,
    accountName: (id: string | null | undefined) => (id ? maps.account.get(id)?.name ?? id : '—'),
    categoryName: (id: string | null | undefined) => (id ? maps.category.get(id)?.name ?? id : 'Sin categoría'),
    groupName: (id: string) => (id === '__none' ? 'Sin categoría' : maps.group.get(id)?.name ?? id),
    categoryKind: (id: string | null | undefined) => {
      if (!id) return null
      const c = maps.category.get(id)
      return c ? maps.group.get(c.groupId)?.kind ?? null : null
    }
  }
}

export type CatalogHook = ReturnType<typeof useCatalog>
