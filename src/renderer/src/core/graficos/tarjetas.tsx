// Registro de tarjetas fijas de los paneles. Cada módulo declara las suyas en
// `modules/<módulo>/tarjetas.tsx` (id, título, tamaños, en qué paneles se pueden usar y componente)
// y la raíz de composición (`App.tsx`) las junta en un `TarjetasProvider`: el núcleo no importa
// ningún módulo.
import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react'
import type { CardSize, DashboardId, FixedCardMeta } from '@shared/core/metrics-types'

/** Lo que recibe el componente de una tarjeta fija. */
export interface FixedCardProps {
  /** Tamaño actual de la tarjeta en la cuadrícula (uno de los que declara en `sizes`). */
  size: CardSize
  /** El panel está en modo "Editar panel" (la tarjeta puede simplificarse o desactivar enlaces). */
  editando: boolean
}

export type FixedCardDef = FixedCardMeta & { Component: ComponentType<FixedCardProps> }

const TarjetasCtx = createContext<readonly FixedCardDef[]>([])

/** Publica el registro de tarjetas fijas (lo monta `App.tsx` con las de todos los módulos). */
export function TarjetasProvider({ tarjetas, children }: { tarjetas: readonly FixedCardDef[]; children: ReactNode }) {
  const valor = useMemo(() => {
    const vistas = new Set<string>()
    const out: FixedCardDef[] = []
    for (const t of tarjetas) {
      if (vistas.has(t.id)) {
        console.warn(`Tarjeta fija repetida: «${t.id}». Se usa la primera.`)
        continue
      }
      if (!t.sizes.includes(t.defaultSize)) console.warn(`La tarjeta «${t.id}» no admite su propio tamaño por defecto (${t.defaultSize}).`)
      vistas.add(t.id)
      out.push(t)
    }
    return out
  }, [tarjetas])
  return <TarjetasCtx.Provider value={valor}>{children}</TarjetasCtx.Provider>
}

/** Todas las tarjetas fijas registradas. */
export function useTarjetas(): readonly FixedCardDef[] {
  return useContext(TarjetasCtx)
}

/** Tarjetas fijas que se pueden usar en un panel, en el orden del registro. */
export function tarjetasDePanel(tarjetas: readonly FixedCardDef[], panel: DashboardId): FixedCardDef[] {
  return tarjetas.filter((t) => t.panels.includes(panel))
}
