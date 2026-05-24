import { useEffect, useState } from 'react'
import { searchDriveByName, makeFileAnyoneViewable } from '../auth/drivePicker'

interface MigratorProps {
  /** When true, render as a compact banner that hides itself when there are 0 legacy attachments. */
  banner?: boolean
}

interface LegacyAttachment {
  _id: string
  originalName: string
  size: number
  filePath?: string
  parentType: string
}

interface RowResult {
  attachmentId: string
  originalName: string
  status: 'pending' | 'searching' | 'matched' | 'no-match' | 'converted' | 'error'
  matches?: { id: string; name: string; mimeType: string; webViewLink?: string; size?: number }[]
  error?: string
}

function AttachmentMigrator({ banner = false }: MigratorProps) {
  const [legacy, setLegacy] = useState<LegacyAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState(!banner)
  const [results, setResults] = useState<Record<string, RowResult>>({})

  useEffect(() => {
    fetch('/api/attachments/legacy')
      .then((r) => r.json())
      .then((data) => setLegacy(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  async function migrateOne(a: LegacyAttachment): Promise<RowResult> {
    const update = (patch: Partial<RowResult>) => {
      setResults((r) => ({
        ...r,
        [a._id]: { ...(r[a._id] ?? { attachmentId: a._id, originalName: a.originalName, status: 'pending' }), ...patch },
      }))
    }
    update({ status: 'searching' })
    try {
      const matches = await searchDriveByName(a.originalName)
      if (matches.length === 0) {
        update({ status: 'no-match' })
        return { attachmentId: a._id, originalName: a.originalName, status: 'no-match' }
      }
      // If one clear match, auto-convert. If multiple, leave for the user to decide.
      if (matches.length === 1) {
        const m = matches[0]
        // Make the file anyone-with-link viewable so guests can open it via
        // the same Drive URL the owner sees.
        try { await makeFileAnyoneViewable(m.id) } catch { /* best-effort */ }
        const res = await fetch(`/api/attachments/${a._id}/to-drive`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driveFileId: m.id,
            driveWebViewLink: m.webViewLink,
            driveMimeType: m.mimeType,
            driveSize: m.size,
          }),
        })
        if (!res.ok) {
          const err = await res.text()
          update({ status: 'error', error: err.slice(0, 100) })
          return { attachmentId: a._id, originalName: a.originalName, status: 'error', error: err }
        }
        update({ status: 'converted', matches })
        return { attachmentId: a._id, originalName: a.originalName, status: 'converted', matches }
      }
      update({ status: 'matched', matches })
      return { attachmentId: a._id, originalName: a.originalName, status: 'matched', matches }
    } catch (err) {
      update({ status: 'error', error: (err as Error).message })
      return { attachmentId: a._id, originalName: a.originalName, status: 'error', error: (err as Error).message }
    }
  }

  async function migrateAll() {
    setRunning(true)
    try {
      for (const a of legacy) {
        if (results[a._id]?.status === 'converted') continue
        await migrateOne(a)
      }
    } finally {
      setRunning(false)
    }
  }

  async function chooseMatch(attachmentId: string, m: NonNullable<RowResult['matches']>[number]) {
    try { await makeFileAnyoneViewable(m.id) } catch { /* best-effort */ }
    const res = await fetch(`/api/attachments/${attachmentId}/to-drive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driveFileId: m.id,
        driveWebViewLink: m.webViewLink,
        driveMimeType: m.mimeType,
        driveSize: m.size,
      }),
    })
    if (res.ok) {
      setResults((r) => ({
        ...r,
        [attachmentId]: { ...r[attachmentId], status: 'converted' },
      }))
    }
  }

  if (loading) {
    return banner ? null : <p>Loading legacy attachments…</p>
  }
  // Count remaining (not converted) legacy items
  const remainingCount = legacy.filter((a) => results[a._id]?.status !== 'converted').length
  if (remainingCount === 0 && banner) return null
  if (legacy.length === 0) {
    return <p style={{ color: '#9a9ab0' }}>No legacy attachments — everything is already on Drive.</p>
  }

  const summary = {
    total: legacy.length,
    converted: Object.values(results).filter((r) => r.status === 'converted').length,
    noMatch: Object.values(results).filter((r) => r.status === 'no-match').length,
    needChoice: Object.values(results).filter((r) => r.status === 'matched').length,
    error: Object.values(results).filter((r) => r.status === 'error').length,
  }

  const containerStyle: React.CSSProperties = banner
    ? {
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        background: 'rgba(240, 136, 62, 0.08)',
        border: '1px solid rgba(240, 136, 62, 0.3)',
        borderRadius: 6,
      }
    : { marginTop: '1rem' }

  return (
    <div style={containerStyle}>
      {banner && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span style={{ color: '#f0883e', fontSize: '0.85rem' }}>
            {remainingCount} legacy local-path attachment{remainingCount !== 1 ? 's' : ''} not yet on Drive
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(240, 136, 62, 0.4)',
              borderRadius: 4,
              color: '#f0883e',
              fontSize: '0.75rem',
              padding: '0.2rem 0.5rem',
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Hide' : 'Migrate to Drive'}
          </button>
        </div>
      )}

      {expanded && <>
      <button
        onClick={migrateAll}
        disabled={running}
        style={{
          marginTop: banner ? '0.75rem' : 0,
          padding: '0.5rem 1rem',
          background: 'rgba(46, 160, 67, 0.18)',
          border: '1px solid rgba(46, 160, 67, 0.45)',
          borderRadius: 6,
          color: '#6ee07a',
          fontSize: '0.9rem',
          cursor: running ? 'wait' : 'pointer',
        }}
      >
        {running ? `Migrating…` : `Search Drive for ${remainingCount} files`}
      </button>
      <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#9a9ab0' }}>
        Converted: {summary.converted} · No match: {summary.noMatch} · Multiple matches (needs your pick): {summary.needChoice} · Errors: {summary.error}
      </p>

      <ul style={{ marginTop: '1rem', listStyle: 'none', padding: 0, maxHeight: banner ? 300 : undefined, overflowY: banner ? 'auto' : undefined }}>
        {legacy.map((a) => {
          const r = results[a._id]
          const status = r?.status ?? 'pending'
          const color: Record<typeof status, string> = {
            pending: '#9a9ab0',
            searching: '#8ab4f8',
            'no-match': '#f0883e',
            matched: '#e3b341',
            converted: '#6ee07a',
            error: '#f85149',
          }
          return (
            <li key={a._id} style={{ padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: color[status], fontSize: '0.75rem', textTransform: 'uppercase', marginRight: '0.5rem' }}>{status}</span>
              <span>{a.originalName}</span>
              {r?.error && <span style={{ marginLeft: '0.5rem', color: '#f85149', fontSize: '0.8rem' }}>{r.error}</span>}
              {status === 'matched' && r?.matches && (
                <div style={{ marginTop: '0.3rem', marginLeft: '1rem' }}>
                  {r.matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => chooseMatch(a._id, m)}
                      style={{ display: 'block', marginTop: 4, padding: '0.2rem 0.5rem', fontSize: '0.8rem', background: 'rgba(100,150,255,0.1)', border: '1px solid rgba(100,150,255,0.2)', borderRadius: 4, color: '#8ab4f8', cursor: 'pointer' }}
                    >
                      Use: {m.name} ({m.mimeType})
                    </button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      </>}
    </div>
  )
}

export default AttachmentMigrator
