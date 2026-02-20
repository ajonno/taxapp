import { useEffect, useState } from 'react'
import './Filters.css'

interface Filter {
  _id: string
  pattern: string
  source: string
  reason: string
  active: boolean
}

function Filters() {
  const [filters, setFilters] = useState<Filter[]>([])
  const [loading, setLoading] = useState(true)

  // New filter form
  const [newPattern, setNewPattern] = useState('')
  const [newSource, setNewSource] = useState('westpac')
  const [newReason, setNewReason] = useState('')

  useEffect(() => {
    fetchFilters()
  }, [])

  async function fetchFilters() {
    try {
      const res = await fetch('/api/filters')
      const data = await res.json()
      setFilters(data)
    } catch (err) {
      console.error('Failed to fetch filters:', err)
    } finally {
      setLoading(false)
    }
  }

  async function addFilter() {
    if (!newPattern.trim()) return
    try {
      const res = await fetch('/api/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern: newPattern.trim(),
          source: newSource,
          reason: newReason.trim(),
        }),
      })
      if (res.ok) {
        setNewPattern('')
        setNewReason('')
        fetchFilters()
      }
    } catch (err) {
      console.error('Failed to add filter:', err)
    }
  }

  async function toggleFilter(id: string, active: boolean) {
    try {
      await fetch(`/api/filters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      })
      fetchFilters()
    } catch (err) {
      console.error('Failed to toggle filter:', err)
    }
  }

  async function deleteFilter(id: string) {
    try {
      await fetch(`/api/filters/${id}`, { method: 'DELETE' })
      fetchFilters()
    } catch (err) {
      console.error('Failed to delete filter:', err)
    }
  }

  // Group filters by reason
  const grouped = filters.reduce<Record<string, Filter[]>>((acc, f) => {
    const key = f.reason || 'Uncategorised'
    if (!acc[key]) acc[key] = []
    acc[key].push(f)
    return acc
  }, {})

  if (loading) return <p>Loading...</p>

  return (
    <div>
      <h1>Filters</h1>

      <section className="settings-section">
        <p className="settings-desc">
          Transactions matching these patterns will be hidden from the
          Transactions view when filters are enabled. Only applies to the
          specified source.
        </p>

        <div className="add-filter-form">
          <input
            type="text"
            placeholder="Pattern (e.g. WOOLWORTHS)"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            className="input-pattern"
          />
          <select
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
          >
            <option value="all">All sources</option>
            <option value="westpac">Westpac</option>
            <option value="ig">IG</option>
            <option value="interactive-brokers">Interactive Brokers</option>
          </select>
          <input
            type="text"
            placeholder="Reason (e.g. Personal - groceries)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            className="input-reason"
          />
          <button onClick={addFilter} className="btn-primary">
            Add
          </button>
        </div>

        <div className="filter-list">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([reason, items]) => (
              <div key={reason} className="filter-group">
                <h3 className="filter-group-title">{reason}</h3>
                {items.map((f) => (
                  <div
                    key={f._id}
                    className={`filter-item ${!f.active ? 'filter-inactive' : ''}`}
                  >
                    <label className="filter-toggle">
                      <input
                        type="checkbox"
                        checked={f.active}
                        onChange={() => toggleFilter(f._id, f.active)}
                      />
                      <span className="filter-pattern">{f.pattern}</span>
                      <span className="filter-source">{f.source}</span>
                    </label>
                    <button
                      className="btn-delete"
                      onClick={() => deleteFilter(f._id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </div>

        {filters.length === 0 && (
          <p className="empty-state">No filters yet. Add one above.</p>
        )}
      </section>
    </div>
  )
}

export default Filters
