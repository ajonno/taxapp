import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTaxYear } from '../context/TaxYearContext'
import { useAuth } from '../auth/AuthContext'
import './Layout.css'

function formatTaxYear(year: number) {
  return `FY ${year - 1}-${String(year).slice(2)}`
}

function Layout() {
  const { taxYear, setTaxYear, taxYears, entity, setEntity, entities } = useTaxYear()
  const { user, signOutUser, canEdit, me } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isGuest = me?.role === 'guest'

  function handleNavClick() {
    setSidebarOpen(false)
  }

  return (
    <div className="layout">
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
        <span /><span /><span />
      </button>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h2>Tax App</h2>
          <select
            className="global-year-select"
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
          >
            {/* Guests must always be scoped to a specific year. */}
            {!isGuest && <option value="">All years</option>}
            {taxYears
              .filter((y) =>
                !isGuest || (me?.allowedTaxYears || []).includes(y),
              )
              .map((y) => (
                <option key={y} value={y}>
                  {formatTaxYear(y)}
                </option>
              ))}
          </select>
          <select
            className="global-year-select"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            <option value="">All entities</option>
            {entities.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" onClick={handleNavClick}>Dashboard</NavLink>
          <NavLink to="/transactions" onClick={handleNavClick}>Transaction Data</NavLink>
          <NavLink to="/income" onClick={handleNavClick}>Income</NavLink>
          <NavLink to="/cgt" onClick={handleNavClick}>CGT Assets</NavLink>
          {canEdit && (
            <>
              <NavLink to="/import" onClick={handleNavClick}>Import</NavLink>
              <NavLink to="/filters" onClick={handleNavClick}>Filters</NavLink>
              <NavLink to="/bulk-attach" onClick={handleNavClick}>Bulk Attach</NavLink>
              <NavLink to="/settings" onClick={handleNavClick}>Settings</NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            {user?.displayName || user?.email}
            {isGuest && <span className="sidebar-role-badge"> guest</span>}
          </div>
          <button className="sidebar-signout" onClick={() => signOutUser()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
