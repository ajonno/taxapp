import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Import from './pages/Import'
import Filters from './pages/Filters'
import Settings from './pages/Settings'
import CGTAssets from './pages/CGTAssets'
import Income from './pages/Income'
import { TaxYearProvider } from './context/TaxYearContext'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <TaxYearProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/income" element={<Income />} />
          <Route path="/cgt" element={<CGTAssets />} />
          <Route path="/import" element={<Import />} />
          <Route path="/filters" element={<Filters />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      </TaxYearProvider>
    </BrowserRouter>
  )
}

export default App
