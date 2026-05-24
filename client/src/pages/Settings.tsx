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

function GuestPasswordControl({ guest }: { guest: { _id: string; email: string } }) {
  const [open, setOpen] = useState(false)
  const [pwd, setPwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function save() {
    setMsg(null)
    if (pwd.length < 8) {
      setMsg('Password must be at least 8 characters')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/guests/${guest._id}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(body.error || `HTTP ${res.status}`)
      } else {
        setMsg(`Password set. ${guest.email} can sign in with email/password now.`)
        setPwd('')
      }
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        className="login-link-btn"
        style={{ marginTop: 6, alignSelf: 'flex-start' }}
        type="button"
        onClick={() => setOpen(true)}
      >
        Set/reset password
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          placeholder="New password (8+ chars)"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="input-label"
          autoComplete="new-password"
          style={{ minWidth: 220, fontFamily: 'monospace' }}
        />
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          className="btn-secondary"
          onClick={() => {
            setOpen(false)
            setPwd('')
            setMsg(null)
          }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
      {msg && (
        <span className="entity-key" style={{ color: msg.startsWith('Password set') ? '#aeefb6' : '#ff8a80' }}>
          {msg}
        </span>
      )}
    </div>
  )
}

interface Guest {
  _id: string
  email: string
  taxYearsAllowed: number[]
  entitiesAllowed: string[]
  active: boolean
  shareAttachments?: boolean
  note: string
  createdAt: string
}

function formatTaxYear(year: number) {
  return `FY ${year - 1}-${String(year).slice(2)}`
}

function GuestAccessSection({
  taxYears,
  entities,
}: {
  taxYears: number[]
  entities: Entity[]
}) {
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newYears, setNewYears] = useState<number[]>([])
  const [newEntities, setNewEntities] = useState<string[]>([])
  const [newNote, setNewNote] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  // (Per-guest share state was removed in favour of a single global
  // "anyone with link" button — see ShareAttachmentsSection below.)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    try {
      const res = await fetch('/api/guests')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setGuests(await res.json())
    } catch (err) {
      console.error('Failed to fetch guests:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleNewYear(y: number) {
    setNewYears((prev) => (prev.includes(y) ? prev.filter((v) => v !== y) : [...prev, y]))
  }
  function toggleNewEntity(k: string) {
    setNewEntities((prev) => (prev.includes(k) ? prev.filter((v) => v !== k) : [...prev, k]))
  }

  async function addGuest() {
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail.trim())) {
      setError('Please enter a valid email address')
      return
    }
    if (newYears.length === 0) {
      setError('Select at least one tax year')
      return
    }
    if (newEntities.length === 0) {
      setError('Select at least one entity')
      return
    }
    if (newPassword && newPassword.length < 8) {
      setError('Password must be at least 8 characters (leave blank for Google login)')
      return
    }
    try {
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          taxYearsAllowed: newYears,
          entitiesAllowed: newEntities,
          note: newNote.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const created = (await res.json()) as { _id: string }

      // If the owner supplied a password, provision the Firebase Auth user
      // immediately so the guest can sign in without needing a Google account.
      if (newPassword) {
        const pwRes = await fetch(`/api/guests/${created._id}/set-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPassword }),
        })
        if (!pwRes.ok) {
          const body = await pwRes.json().catch(() => ({}))
          setError(`Guest added, but setting password failed: ${body.error || pwRes.status}`)
        }
      }

      setNewEmail('')
      setNewYears([])
      setNewEntities([])
      setNewNote('')
      setNewPassword('')
      void refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function toggleActive(g: Guest) {
    try {
      await fetch(`/api/guests/${g._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !g.active }),
      })
      void refresh()
    } catch (err) {
      console.error('Failed to toggle guest:', err)
    }
  }

  async function toggleYearOnGuest(g: Guest, y: number) {
    const next = g.taxYearsAllowed.includes(y)
      ? g.taxYearsAllowed.filter((v) => v !== y)
      : [...g.taxYearsAllowed, y]
    try {
      await fetch(`/api/guests/${g._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxYearsAllowed: next }),
      })
      void refresh()
    } catch (err) {
      console.error('Failed to update guest years:', err)
    }
  }

  // (Per-guest sharing function removed — see ShareAttachmentsSection.)

  async function toggleEntityOnGuest(g: Guest, k: string) {
    const current = g.entitiesAllowed || []
    const next = current.includes(k)
      ? current.filter((v) => v !== k)
      : [...current, k]
    try {
      await fetch(`/api/guests/${g._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entitiesAllowed: next }),
      })
      void refresh()
    } catch (err) {
      console.error('Failed to update guest entities:', err)
    }
  }

  async function deleteGuest(id: string) {
    if (!confirm('Remove this guest? They will no longer be able to sign in.')) return
    try {
      await fetch(`/api/guests/${id}`, { method: 'DELETE' })
      void refresh()
    } catch (err) {
      console.error('Failed to delete guest:', err)
    }
  }

  if (loading) return <p>Loading guests...</p>

  return (
    <section className="settings-section">
      <h2>Guest Access</h2>
      <p className="settings-desc">
        Grant other people read-only access to specific tax years. Leave the
        password field blank if they have a Google account with that email; set
        a password if they don't (they'll sign in with email + password
        instead). Guests can view Dashboard, Transactions, Income, CGT, and the
        PDF report — but cannot import, edit, filter, or change settings.
      </p>

      <div className="entity-list">
        {guests.map((g) => (
          <div key={g._id} className="entity-item guest-item">
            <div className="entity-info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <span className="entity-label">{g.email}</span>
              {g.note && <span className="entity-key">{g.note}</span>}
              <div className="guest-year-row">
                {taxYears.length === 0 && <span className="entity-key">No years available</span>}
                {taxYears.map((y) => {
                  const on = g.taxYearsAllowed.includes(y)
                  return (
                    <label key={y} className={`guest-year-chip ${on ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleYearOnGuest(g, y)}
                      />
                      {formatTaxYear(y)}
                    </label>
                  )
                })}
              </div>
              <div className="guest-year-row">
                {entities.length === 0 && <span className="entity-key">No entities available</span>}
                {entities.map((ent) => {
                  const on = (g.entitiesAllowed || []).includes(ent.key)
                  return (
                    <label key={ent.key} className={`guest-year-chip ${on ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleEntityOnGuest(g, ent.key)}
                      />
                      {ent.label}
                    </label>
                  )
                })}
              </div>
              <GuestPasswordControl guest={g} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-secondary" onClick={() => toggleActive(g)}>
                {g.active ? 'Disable' : 'Enable'}
              </button>
              <button className="btn-delete" onClick={() => deleteGuest(g._id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {guests.length === 0 && <p className="empty-state">No guests yet. Add one below.</p>}

      <div className="add-entity-form" style={{ flexWrap: 'wrap' }}>
        <input
          type="email"
          placeholder="Email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="input-label"
          style={{ minWidth: 220 }}
        />
        <input
          type="text"
          placeholder="Password (optional — for non-Google users)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          className="input-label"
          style={{ minWidth: 280, fontFamily: 'monospace' }}
        />
        <input
          type="text"
          placeholder="Note (optional, e.g. accountant)"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="input-label"
          style={{ minWidth: 220 }}
        />
        <div className="guest-year-row" style={{ flexBasis: '100%' }}>
          <span className="entity-key" style={{ marginRight: 6 }}>Years:</span>
          {taxYears.map((y) => {
            const on = newYears.includes(y)
            return (
              <label key={y} className={`guest-year-chip ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleNewYear(y)}
                />
                {formatTaxYear(y)}
              </label>
            )
          })}
        </div>
        <div className="guest-year-row" style={{ flexBasis: '100%' }}>
          <span className="entity-key" style={{ marginRight: 6 }}>Entities:</span>
          {entities.map((ent) => {
            const on = newEntities.includes(ent.key)
            return (
              <label key={ent.key} className={`guest-year-chip ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleNewEntity(ent.key)}
                />
                {ent.label}
              </label>
            )
          })}
        </div>
        <button
          onClick={addGuest}
          disabled={!newEmail.trim() || newYears.length === 0 || newEntities.length === 0}
          className="btn-primary"
        >
          Grant Access
        </button>
      </div>
      {error && <p className="settings-error">{error}</p>}
    </section>
  )
}

function Settings() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [subTypes, setSubTypes] = useState<SubType[]>([])
  const [taxYears, setTaxYears] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newSourceKey, setNewSourceKey] = useState('')
  const [newSourceLabel, setNewSourceLabel] = useState('')
  const [newSourceType, setNewSourceType] = useState<'bank' | 'broker'>('bank')
  const [newSubTypeLabel, setNewSubTypeLabel] = useState('')

  useEffect(() => {
    Promise.all([fetchEntities(), fetchSources(), fetchSubTypes(), fetchTaxYears()]).finally(() => setLoading(false))
  }, [])

  async function fetchTaxYears() {
    try {
      const res = await fetch('/api/transactions/meta/options')
      const data = await res.json()
      setTaxYears(data.taxYears || [])
    } catch (err) {
      console.error('Failed to fetch tax years:', err)
    }
  }

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

      <GuestAccessSection taxYears={taxYears} entities={entities} />
    </div>
  )
}

export default Settings
