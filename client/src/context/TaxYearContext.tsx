import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface TaxYearContextType {
  taxYear: string // '' = all, or '2025', '2026', etc.
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
  const [taxYear, setTaxYear] = useState(() => {
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
