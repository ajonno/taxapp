import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

function FullPageMessage({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      color: '#9a9ab0',
      padding: 24,
      textAlign: 'center',
    }}>
      <h2 style={{ color: '#e0e0ea', margin: 0 }}>{title}</h2>
      {body && <p style={{ maxWidth: 460, margin: 0 }}>{body}</p>}
      {action}
    </div>
  )
}

function ProtectedShell() {
  const { user, loading, me, meStatus, signOutUser } = useAuth()
  if (loading) {
    return <FullPageMessage title="Loading…" />
  }
  if (!user) return <Login />

  if (meStatus === 'loading' || meStatus === 'idle') {
    return <FullPageMessage title="Signing you in…" />
  }

  if (meStatus === 'denied') {
    return (
      <FullPageMessage
        title="Access denied"
        body={`${user.email} isn't authorised to use this app. Ask the owner to grant access.`}
        action={
          <button className="btn-primary" onClick={() => signOutUser()}>
            Sign out
          </button>
        }
      />
    )
  }

  if (meStatus === 'error' || !me) {
    return (
      <FullPageMessage
        title="Couldn't load your profile"
        body="There was a problem reaching the server. Please try again."
        action={
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        }
      />
    )
  }

  // Owner-only routes are redirected to / for guests.
  const ownerOnly = (el: React.ReactElement) =>
    me.role === 'owner' ? el : <Navigate to="/" replace />

  return (
    <TaxYearProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/income" element={<Income />} />
          <Route path="/cgt" element={<CGTAssets />} />
          <Route path="/import" element={ownerOnly(<Import />)} />
          <Route path="/filters" element={ownerOnly(<Filters />)} />
          <Route path="/bulk-attach" element={ownerOnly(<BulkAttach />)} />
          <Route path="/settings" element={ownerOnly(<Settings />)} />
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
