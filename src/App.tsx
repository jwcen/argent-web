import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { AppShell } from './components/layout/AppShell'
import { FullSpinner } from './components/ui/Spinner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Brokers from './pages/Brokers'
import Ask from './pages/Ask'

function Protected() {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  if (loading) return <FullSpinner />
  if (!user) return <Navigate to="/login" replace />
  // 对话页自行接管整屏高度（输入框吸底），不走常规的居中容器
  return (
    <AppShell flush={pathname.startsWith('/ask')}>
      <Outlet />
    </AppShell>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="brokers" element={<Brokers />} />
        {/* 资产已并入持仓页（?view=funds），旧链接 /assets 重定向过去 */}
        <Route path="assets" element={<Navigate to="/portfolio?view=funds" replace />} />
        <Route path="ask" element={<Ask />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
