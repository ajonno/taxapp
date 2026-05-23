import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Import from './pages/Import'
import Filters from './pages/Filters'
import Settings from './pages/Settings'
import CGTAssets from './pages/CGTAssets'
import Income from './pages/Income'
import Login from './pages/Login'
import BulkAttach from './pages/BulkAttach'
import { TaxYearProvider } from './context/TaxYearContext'
import { AuthProvider, useAuth } from './auth/AuthContext'
import './App.css'

function ProtectedShell() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9ab0' }}>
        Loading...
      </div>
    )
  }
  if (!user) return <Login />
  return (
    <TaxYearProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/income" element={<Income />} />
          <Route path="/cgt" element={<CGTAssets />} />
          <Route path="/import" element={<Import />} />
          <Route path="/filters" element={<Filters />} />
          <Route path="/bulk-attach" element={<BulkAttach />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </TaxYearProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProtectedShell />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
