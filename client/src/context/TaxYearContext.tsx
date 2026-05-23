import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

interface TaxYearContextType {
  taxYear: string // '' = all (owner only), or '2025', '2026', etc.
  setTaxYear: (year: string) => void
  taxYears: number[]
  entity: string // '' = all, or 'personal', 'aamsco', etc.
  setEntity: (entity: string) => void
  entities: { key: string; label: string }[]
}

const TaxYearContext = createContext<TaxYearContextType>({
  taxYear: '',
  setTaxYear: () => {},
  taxYears: [],
  entity: '',
  setEntity: () => {},
  entities: [],
})

export function TaxYearProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  const isGuest = me?.role === 'guest'
  const allowedTaxYears = me?.allowedTaxYears || []

  const [taxYear, setTaxYearRaw] = useState(() => {
    return localStorage.getItem('taxapp-taxYear') || ''
  })
  const [taxYears, setTaxYears] = useState<number[]>([])
  const [entity, setEntity] = useState(() => {
    return localStorage.getItem('taxapp-entity') || ''
  })
  const [entities, setEntities] = useState<{ key: string; label: string }[]>([])

  useEffect(() => {
    fetch('/api/transactions/meta/options')
      .then((res) => res.json())
      .then((data) => setTaxYears(data.taxYears || []))
      .catch((err) => console.error('Failed to fetch tax years:', err))
    fetch('/api/entities')
      .then((res) => res.json())
      .then((data: { key: string; label: string }[]) => setEntities(data))
      .catch((err) => console.error('Failed to fetch entities:', err))
  }, [])

  // Whenever the role/allowed-years info changes, snap the selected year into
  // a valid range for guests. Guests can never view "All years", and any
  // previously-saved value outside their allowed list is replaced with their
  // most recent allowed year.
  useEffect(() => {
    if (!isGuest) return
    if (allowedTaxYears.length === 0) return
    const numeric = taxYear ? Number(taxYear) : NaN
    if (!taxYear || !allowedTaxYears.includes(numeric)) {
      const fallback = [...allowedTaxYears].sort((a, b) => b - a)[0]
      setTaxYearRaw(String(fallback))
    }
  }, [isGuest, allowedTaxYears, taxYear])

  // Wrap the setter so callers can't accidentally pass an out-of-scope year
  // for guests.
  const setTaxYear = (year: string) => {
    if (isGuest && allowedTaxYears.length > 0) {
      const n = Number(year)
      if (!year || !allowedTaxYears.includes(n)) {
        // Reject — keep the current valid one
        return
      }
    }
    setTaxYearRaw(year)
  }

  useEffect(() => {
    localStorage.setItem('taxapp-taxYear', taxYear)
  }, [taxYear])

  useEffect(() => {
    localStorage.setItem('taxapp-entity', entity)
  }, [entity])

  return (
    <TaxYearContext.Provider value={{ taxYear, setTaxYear, taxYears, entity, setEntity, entities }}>
      {children}
    </TaxYearContext.Provider>
  )
}

export function useTaxYear() {
  return useContext(TaxYearContext)
}
