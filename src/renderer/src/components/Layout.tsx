import { UpdateFooter } from './UpdateFooter'
import {
  ArrowLeftRight,
  CalendarClock,
  Gauge,
  Landmark,
  LayoutDashboard,
  LineChart,
  Plus,
  Scale,
  Settings,
  Target,
  TrendingUp
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useApi } from '../lib/api'
import { useCatalog } from '../lib/catalog'
import { useTxEditor } from './TxEditor'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { to: '/cuentas', label: 'Cuentas', icon: Landmark },
  { to: '/presupuestos', label: 'Presupuestos y meses', icon: Gauge },
  { to: '/recurrentes', label: 'Recurrentes', icon: CalendarClock },
  { to: '/objetivos', label: 'Objetivos y huchas', icon: Target },
  { to: '/patrimonio', label: 'Patrimonio', icon: Scale },
  { to: '/prevision', label: 'Previsión', icon: TrendingUp },
  { to: '/inversiones', label: 'Inversiones', icon: LineChart },
  { to: '/ajustes', label: 'Ajustes y datos', icon: Settings }
]

export function useThemeSync() {
  const { cat } = useCatalog()
  const theme = cat?.settings.theme ?? 'system'
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    void window.finanzas?.setTheme(theme)
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export function Layout({ children }: { children: ReactNode }) {
  const { openNew, openTransfer } = useTxEditor()
  const review = useApi('tx.reviewQueue', [])
  const pending = (review.data?.pending.length ?? 0) + (review.data?.issues.length ?? 0) + (review.data?.duplicates.length ?? 0)
  useThemeSync()
  return (
    <div className="flex h-full">
      <aside className="flex w-[228px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="px-5 pb-3 pt-5">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">Finanzas</div>
          <div className="text-[12px] text-muted">Tus cuentas, en local</div>
        </div>
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          <button
            onClick={() => openNew()}
            className="flex h-9 items-center justify-between rounded-md bg-accent px-3 text-sm font-medium text-accent-ink hover:brightness-110"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="size-4" /> Nuevo movimiento
            </span>
            <kbd className="rounded bg-white/15 px-1.5 text-[11px]">N</kbd>
          </button>
          <button
            onClick={() => openTransfer()}
            className="flex h-8 items-center justify-between rounded-md px-3 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <span>Transferencia</span>
            <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">T</kbd>
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2" aria-label="Secciones">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13.5px]',
                  isActive ? 'bg-accent-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                )
              }
            >
              <n.icon className="size-4 shrink-0 opacity-80" />
              <span className="flex-1 truncate">{n.label}</span>
              {n.to === '/movimientos' && pending > 0 && (
                <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-medium text-warn" title="Movimientos por revisar">
                  {pending}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <UpdateFooter />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] px-8 py-6">{children}</div>
      </main>
    </div>
  )
}
