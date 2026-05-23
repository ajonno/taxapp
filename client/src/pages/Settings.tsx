import { useEffect, useState } from 'react'
import './Settings.css'

interface Entity {
  _id: string
  key: string
  label: string
  active: boolean
}

interface Source {
  _id: string
  key: string
  label: string
  type: 'bank' | 'broker'
  active: boolean
}

interface SubType {
  _id: string
  label: string
  active: boolean
}

function Settings() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [subTypes, setSubTypes] = useState<SubType[]>([])
  const [loading, setLoading] = useState(true)
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newSourceKey, setNewSourceKey] = useState('')
  const [newSourceLabel, setNewSourceLabel] = useState('')
  const [newSourceType, setNewSourceType] = useState<'bank' | 'broker'>('bank')
  const [newSubTypeLabel, setNewSubTypeLabel] = useState('')

  useEffect(() => {
    Promise.all([fetchEntities(), fetchSources(), fetchSubTypes()]).finally(() => setLoading(false))
  }, [])

  async function fetchEntities() {
    try {
      const res = await fetch('/api/entities')
      const data = await res.json()
      setEntities(data)
    } catch (err) {
      console.error('Failed to fetch entities:', err)
    }
  }

  async function fetchSources() {
    try {
      const res = await fetch('/api/sources')
      const data = await res.json()
      setSources(data)
    } catch (err) {
      console.error('Failed to fetch sources:', err)
    }
  }

  async function fetchSubTypes() {
    try {
      const res = await fetch('/api/sub-types')
      const data = await res.json()
      setSubTypes(data)
    } catch (err) {
      console.error('Failed to fetch sub-types:', err)
    }
  }

  async function addEntity() {
    if (!newKey.trim() || !newLabel.trim()) return
    try {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKey.trim().toLowerCase().replace(/\s+/g, '-'),
          label: newLabel.trim(),
        }),
      })
      if (res.ok) {
        setNewKey('')
        setNewLabel('')
        fetchEntities()
      }
    } catch (err) {
      console.error('Failed to add entity:', err)
    }
  }

  async function deleteEntity(id: string) {
    try {
      await fetch(`/api/entities/${id}`, { method: 'DELETE' })
      fetchEntities()
    } catch (err) {
      console.error('Failed to delete entity:', err)
    }
  }

  async function addSource() {
    if (!newSourceKey.trim() || !newSourceLabel.trim()) return
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newSourceKey.trim().toLowerCase().replace(/\s+/g, '-'),
          label: newSourceLabel.trim(),
          type: newSourceType,
        }),
      })
      if (res.ok) {
        setNewSourceKey('')
        setNewSourceLabel('')
        setNewSourceType('bank')
        fetchSources()
      }
    } catch (err) {
      console.error('Failed to add source:', err)
    }
  }

  async function deleteSource(id: string) {
    try {
      await fetch(`/api/sources/${id}`, { method: 'DELETE' })
      fetchSources()
    } catch (err) {
      console.error('Failed to delete source:', err)
    }
  }

  async function addSubType() {
    if (!newSubTypeLabel.trim()) return
    try {
      const res = await fetch('/api/sub-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newSubTypeLabel.trim(),
        }),
      })

      if (res.ok) {
        setNewSubTypeLabel('')
        fetchSubTypes()
      }
    } catch (err) {
      console.error('Failed to add sub-type:', err)
    }
  }

  async function deleteSubType(id: string) {
    try {
      await fetch(`/api/sub-types/${id}`, { method: 'DELETE' })
      fetchSubTypes()
    } catch (err) {
      console.error('Failed to delete sub-type:', err)
    }
  }

  if (loading) return <p>Loading...</p>

  return (
    <div>
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Entities</h2>
        <p className="settings-desc">
          Entities represent who the transaction belongs to (e.g. Personal, a company).
          These appear as options in the Import page and as a filter on Transactions.
        </p>

        <div className="entity-list">
          {entities.map((e) => (
            <div key={e._id} className="entity-item">
              <div className="entity-info">
                <span className="entity-label">{e.label}</span>
                <span className="entity-key">{e.key}</span>
              </div>
              <button
                className="btn-delete"
                onClick={() => deleteEntity(e._id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {entities.length === 0 && (
          <p className="empty-state">No entities yet. Add one below.</p>
        )}

        <div className="add-entity-form">
          <input
            type="text"
            placeholder="Key (e.g. personal)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="input-key"
          />
          <input
            type="text"
            placeholder="Label (e.g. Personal)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="input-label"
          />
          <button
            onClick={addEntity}
            disabled={!newKey.trim() || !newLabel.trim()}
            className="btn-primary"
          >
            Add
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Sources</h2>
        <p className="settings-desc">
          Sources represent where transaction data comes from (e.g. Westpac, IG Markets).
          These appear in the Import page and as filter options on Transactions.
        </p>

        <div className="entity-list">
          {sources.map((s) => (
            <div key={s._id} className="entity-item">
              <div className="entity-info">
                <span className="entity-label">{s.label}</span>
                <span className="entity-key">{s.key}</span>
                <span className="source-type-badge">{s.type}</span>
              </div>
              <button
                className="btn-delete"
                onClick={() => deleteSource(s._id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {sources.length === 0 && (
          <p className="empty-state">No sources yet. Add one below.</p>
        )}

        <div className="add-entity-form">
          <input
            type="text"
            placeholder="Key (e.g. macquarie)"
            value={newSourceKey}
            onChange={(e) => setNewSourceKey(e.target.value)}
            className="input-key"
          />
          <input
            type="text"
            placeholder="Label (e.g. Macquarie Bank)"
            value={newSourceLabel}
            onChange={(e) => setNewSourceLabel(e.target.value)}
            className="input-label"
          />
          <select
            value={newSourceType}
            onChange={(e) => setNewSourceType(e.target.value as 'bank' | 'broker')}
            className="input-type"
          >
            <option value="bank">Bank</option>
            <option value="broker">Broker</option>
          </select>
          <button
            onClick={addSource}
            disabled={!newSourceKey.trim() || !newSourceLabel.trim()}
            className="btn-primary"
          >
            Add
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Sub-types</h2>
        <p className="settings-desc">
          Saved sub-types appear in the Transactions filter and in the per-row sub-type dropdown.
        </p>

        <div className="entity-list">
          {subTypes.map((subType) => (
            <div key={subType._id} className="entity-item">
              <div className="entity-info">
                <span className="entity-label">{subType.label}</span>
              </div>
              <button
                className="btn-delete"
                onClick={() => deleteSubType(subType._id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {subTypes.length === 0 && (
          <p className="empty-state">No sub-types yet. Add one below.</p>
        )}

        <div className="add-entity-form">
          <input
            type="text"
            placeholder="Label (e.g. Buy)"
            value={newSubTypeLabel}
            onChange={(e) => setNewSubTypeLabel(e.target.value)}
            className="input-label"
          />
          <button
            onClick={addSubType}
            disabled={!newSubTypeLabel.trim()}
            className="btn-primary"
          >
            Add
          </button>
        </div>
      </section>
    </div>
  )
}

export default Settings
