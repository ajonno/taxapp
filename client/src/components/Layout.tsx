import { NavLink, Outlet } from 'react-router-dom'
import { useTaxYear } from '../context/TaxYearContext'
import './Layout.css'

function formatTaxYear(year: number) {
  return `FY ${year - 1}-${String(year).slice(2)}`
}

function Layout() {
  const { taxYear, setTaxYear, taxYears, entity, setEntity, entities } = useTaxYear()

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Tax App</h2>
          <select
            className="global-year-select"
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
          >
            <option value="">All years</option>
            {taxYears.map((y) => (
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
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/transactions">Transaction Data</NavLink>
          <NavLink to="/income">Income</NavLink>
          <NavLink to="/cgt">CGT Assets</NavLink>
          <NavLink to="/import">Import</NavLink>
          <NavLink to="/filters">Filters</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
