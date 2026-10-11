import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { TxEditorProvider } from './components/TxEditor'
import { ConfirmHost, ErrorBox, Loading, Toaster } from './components/ui'
import { useApi } from './lib/api'
import { AccountsPage } from './pages/Accounts'
import { BudgetsPage } from './pages/Budgets'
import { DashboardPage } from './pages/Dashboard'
import { ForecastPage } from './pages/Forecast'
import { GoalsPage } from './pages/Goals'
import { InvestmentsPage } from './pages/Investments'
import { NetWorthPage } from './pages/NetWorth'
import { RecurringPage } from './pages/Recurring'
import { SettingsPage } from './pages/Settings'
import { TransactionsPage } from './pages/Transactions'
import { WelcomePage } from './pages/Welcome'

export function App() {
  const info = useApi('app.info', [])
  if (info.isLoading) return <Loading text="Abriendo tus datos…" />
  if (info.error) return <div className="p-8"><ErrorBox error={info.error} /></div>
  return (
    <TxEditorProvider>
      {info.data?.isEmpty ? (
        <WelcomePage />
      ) : (
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/movimientos" element={<TransactionsPage />} />
            <Route path="/cuentas" element={<AccountsPage />} />
            <Route path="/presupuestos" element={<BudgetsPage />} />
            <Route path="/recurrentes" element={<RecurringPage />} />
            <Route path="/objetivos" element={<GoalsPage />} />
            <Route path="/patrimonio" element={<NetWorthPage />} />
            <Route path="/prevision" element={<ForecastPage />} />
            <Route path="/inversiones" element={<InvestmentsPage />} />
            <Route path="/ajustes" element={<SettingsPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Routes>
        </Layout>
      )}
      <ConfirmHost />
      <Toaster />
    </TxEditorProvider>
  )
}
