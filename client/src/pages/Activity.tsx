import { useEffect, useState } from 'react'
import './Activity.css'

interface AuthEvent {
  _id: string
  userId: string
  email: string
  eventType: 'login' | 'logout'
  displayName?: string
  provider?: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
}

/** Compact browser/OS extraction from a User-Agent string. */
function summariseUA(ua: string): string {
  if (!ua) return ''
  // Pull a browser hint.
  let browser = ''
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'
  // OS hint.
  let os = ''
  if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/(iPhone|iPad)/.test(ua)) os = 'iOS'
  else if (/Linux/.test(ua)) os = 'Linux'
  return [browser, os].filter(Boolean).join(' · ')
}

function formatProvider(p?: string): string {
  if (!p) return ''
  if (p === 'google.com') return 'Google'
  if (p === 'password') return 'Email/password'
  return p
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function Activity() {
  const [events, setEvents] = useState<AuthEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [emailFilter, setEmailFilter] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (emailFilter.trim()) params.set('email', emailFilter.trim())
      const res = await fetch(`/api/auth-events?${params}`)
      if (!res.ok) {
        if (res.status === 403) {
          setError("You don't have permission to view this page.")
        } else {
          setError(`Failed to load (HTTP ${res.status}).`)
        }
        setEvents([])
        return
      }
      setEvents(await res.json())
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <h1>Activity</h1>
      <p className="activity-subtitle">
        Recent sign-in and sign-out events. Most recent first.
      </p>

      <div className="activity-controls">
        <input
          type="text"
          className="activity-filter"
          placeholder="Filter by email…"
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load()
          }}
        />
        <button className="btn-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error && <div className="activity-error">{error}</div>}

      {loading ? (
        <p className="activity-empty">Loading…</p>
      ) : events.length === 0 ? (
        <p className="activity-empty">No events recorded yet.</p>
      ) : (
        <div className="activity-card">
          <table className="activity-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Email</th>
                <th>Name</th>
                <th>Sign-in via</th>
                <th>IP</th>
                <th>Device</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e._id}>
                  <td className="when-cell">{formatWhen(e.createdAt)}</td>
                  <td>
                    <span
                      className={
                        e.eventType === 'login'
                          ? 'badge badge-login'
                          : 'badge badge-logout'
                      }
                    >
                      {e.eventType}
                    </span>
                  </td>
                  <td className="email-cell">{e.email}</td>
                  <td>{e.displayName || '—'}</td>
                  <td>{formatProvider(e.provider) || '—'}</td>
                  <td className="ip-cell">{e.ipAddress || '—'}</td>
                  <td className="ua-cell" title={e.userAgent}>
                    {summariseUA(e.userAgent || '') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Activity
