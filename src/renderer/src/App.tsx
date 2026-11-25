import { useCallback, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorState, LoadingState, Toaster } from './core/ui'
import { SettingsPage } from './core/ajustes/Settings'
import { Inicio } from './core/inicio/Inicio'
import { AppShell } from './core/shell/AppShell'
import { leerRuta, moduloDe, RUTAS_ANTIGUAS, rutaFinanzas } from './core/shell/nav'
import { useCambiarTema, useThemeSync } from './core/shell/theme'
import { UpdateFooter } from './core/shell/UpdateFooter'
import { useApi } from './lib/api'
import { EjerciciosPage } from './modules/entreno/Ejercicios'
import { EntrenoPage } from './modules/entreno/Entreno'
import { ImportarHevyProvider, useImportarHevy } from './modules/entreno/ImportarHevy'
import { SesionDetallePage } from './modules/entreno/SesionDetalle'
import { SesionEditorPage } from './modules/entreno/SesionEditor'
import { SesionesPage } from './modules/entreno/Sesiones'
import { AccountsPage } from './modules/finanzas/Accounts'
import { BudgetsPage } from './modules/finanzas/Budgets'
import { TxEditorProvider, useTxEditor } from './modules/finanzas/components/TxEditor'
import { DashboardPage } from './modules/finanzas/Dashboard'
import { ForecastPage } from './modules/finanzas/Forecast'
import { GoalsPage } from './modules/finanzas/Goals'
import { InvestmentsPage } from './modules/finanzas/Investments'
import { NetWorthPage } from './modules/finanzas/NetWorth'
import { RecurringPage } from './modules/finanzas/Recurring'
import { TransactionsPage } from './modules/finanzas/Transactions'
import { WelcomePage } from './modules/finanzas/Welcome'

/** Rutas de la versión anterior (/movimientos, /cuentas…): llevan a la nueva, con sus parámetros. */
function RedirigirAntigua() {
  const { pathname, search } = useLocation()
  return <Navigate to={rutaFinanzas(pathname) + search} replace />
}

/** Une el shell (core) con lo que viene de Finanzas: contador de revisión, editor de movimientos, actualizador y tema. */
function ShellConectado({ version }: { version: string }) {
  const { openNew, openTransfer } = useTxEditor()
  const importarHevy = useImportarHevy().abrir
  const review = useApi('finanzas:tx.reviewQueue', [])
  const porRevisar = (review.data?.pending.length ?? 0) + (review.data?.issues.length ?? 0) + (review.data?.duplicates.length ?? 0)
  const cambiarTema = useCambiarTema()
  const { pathname } = useLocation()
  const ruta = leerRuta(pathname)
  const acciones = { nuevoMovimiento: () => openNew(), transferencia: () => openTransfer(), cambiarTema, importarHevy }
  const pie = useCallback((plegada: boolean) => <UpdateFooter plegada={plegada} version={version} />, [version])
  return (
    <AppShell ruta={ruta} porRevisar={porRevisar} acciones={acciones} pie={pie}>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/finanzas" element={<DashboardPage />} />
        <Route path="/finanzas/movimientos" element={<TransactionsPage />} />
        <Route path="/finanzas/cuentas" element={<AccountsPage />} />
        <Route path="/finanzas/presupuestos" element={<BudgetsPage />} />
        <Route path="/finanzas/recurrentes" element={<RecurringPage />} />
        <Route path="/finanzas/objetivos" element={<GoalsPage />} />
        <Route path="/finanzas/patrimonio" element={<NetWorthPage />} />
        <Route path="/finanzas/prevision" element={<ForecastPage />} />
        <Route path="/finanzas/inversiones" element={<InvestmentsPage />} />
        <Route path="/entreno" element={<EntrenoPage />} />
        <Route path="/entreno/sesiones" element={<SesionesPage />} />
        <Route path="/entreno/sesiones/nueva" element={<SesionEditorPage />} />
        <Route path="/entreno/sesiones/:id" element={<SesionDetallePage />} />
        <Route path="/entreno/sesiones/:id/editar" element={<SesionEditorPage />} />
        <Route path="/entreno/ejercicios" element={<EjerciciosPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        {RUTAS_ANTIGUAS.map((r) => (
          <Route key={r} path={`/${r}`} element={<RedirigirAntigua />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

/** Los avisos y la confirmación cuelgan de la raíz: heredan la identidad del módulo de la ruta. */
function ModuloActual({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div data-module={moduloDe(leerRuta(pathname))} className="contents">
      {children}
    </div>
  )
}

export function App() {
  // El tema sigue a settings.theme en todas las pantallas: carga, error, bienvenida (base vacía) y la app
  useThemeSync()
  const info = useApi('core:app.info', [])
  if (info.isLoading)
    return (
      <div className="p-8">
        <LoadingState filas={2} etiqueta="Abriendo tus datos" />
      </div>
    )
  if (info.error)
    return (
      <div className="p-8">
        <ErrorState titulo="No se han podido abrir tus datos" texto={info.error.message} />
      </div>
    )
  return (
    <TxEditorProvider>
      <ImportarHevyProvider>
        {info.data?.isEmpty ? <WelcomePage /> : <ShellConectado version={info.data?.version ?? ''} />}
        <ModuloActual>
          <Toaster />
        </ModuloActual>
      </ImportarHevyProvider>
    </TxEditorProvider>
  )
}
