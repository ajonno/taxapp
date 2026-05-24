import { useState } from 'react'
import { getDriveAccessToken, clearCachedDriveToken } from '../auth/driveAuth'
import { makeFileAnyoneViewable } from '../auth/drivePicker'
import './BulkAttach.css'

interface Tx {
  _id: string
  date: string
  amount: number
  description: string
  taxCategory?: string
}

interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: number
  webViewLink?: string
  parsedDate?: Date
}

interface Row {
  tx: Tx
  candidate?: DriveFile
  candidates?: DriveFile[]
  status: 'pending' | 'no-match' | 'matched' | 'attached' | 'error'
  daysOff?: number
  error?: string
}

function parseDateFromFilename(name: string): Date | undefined {
  const m = name.match(/(\d{4})[-_/](\d{2})[-_/](\d{2})/)
  if (!m) return undefined
  return new Date(`${m[1]}-${m[2]}-${m[3]}`)
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

async function driveListByPrefix(prefix: string, retried = false): Promise<DriveFile[]> {
  const token = await getDriveAccessToken()
  const safe = prefix.replace(/'/g, "\\'")
  const q = `name contains '${safe}' and mimeType = 'application/pdf' and trashed = false`
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,size,webViewLink),nextPageToken',
    pageSize: '100',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if ((res.status === 401 || res.status === 403) && !retried) {
    clearCachedDriveToken()
    return driveListByPrefix(prefix, true)
  }
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`)
  const data = await res.json()
  const files = (data.files || []) as DriveFile[]
  for (const f of files) f.parsedDate = parseDateFromFilename(f.name)
  return files
}

function BulkAttach() {
  const [search, setSearch] = useState('3tsoftwarelabs')
  const [filenameHint, setFilenameHint] = useState('Studio3T')
  const [tolerance, setTolerance] = useState(5)
  const [rows, setRows] = useState<Row[]>([])
  const [scanning, setScanning] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [filesFound, setFilesFound] = useState(0)

  async function fetchUnattachedTxs(): Promise<Tx[]> {
    const wanted: Tx[] = []
    let page = 1
    while (true) {
      const params = new URLSearchParams({
        taxYear: '2025',
        entity: 'personal',
        taxCategory: 'D5',
        search,
        limit: '200',
        page: String(page),
        // Bypass exclusion filters so previously-ignored vendors still surface here.
        filtered: 'off',
      })
      const res = await fetch(`/api/transactions?${params}`)
      const data = await res.json()
      const txs: Tx[] = data.transactions || []
      wanted.push(...txs)
      if (txs.length < 200) break
      page += 1
    }
    const out: Tx[] = []
    for (const tx of wanted) {
      const at = await fetch(`/api/attachments?parentId=${tx._id}&parentType=transaction`).then(r => r.json())
      if (Array.isArray(at) && at.length === 0) out.push(tx)
    }
    return out
  }

  async function scan() {
    setScanning(true)
    setRows([])
    setFilesFound(0)
    try {
      const [txs, files] = await Promise.all([
        fetchUnattachedTxs(),
        driveListByPrefix(filenameHint),
      ])
      setFilesFound(files.length)

      // Greedy nearest-date matching. Each file used at most once.
      const used = new Set<string>()
      const newRows: Row[] = txs.map((tx) => {
        const txDate = new Date(tx.date)
        // Score every unused file by abs day diff
        const scored = files
          .filter((f) => !used.has(f.id) && f.parsedDate)
          .map((f) => ({ f, days: Math.abs(daysBetween(f.parsedDate!, txDate)) }))
          .sort((a, b) => a.days - b.days)

        const top = scored[0]
        if (!top || top.days > tolerance) {
          return { tx, status: 'no-match' }
        }
        used.add(top.f.id)
        return {
          tx,
          candidate: top.f,
          candidates: scored.slice(0, 3).map((s) => s.f),
          status: 'matched',
          daysOff: top.days,
        }
      })
      setRows(newRows)
    } catch (err) {
      console.error(err)
      alert(`Scan failed: ${(err as Error).message}`)
    } finally {
      setScanning(false)
    }
  }

  async function attachAll() {
    setAttaching(true)
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row.status !== 'matched' || !row.candidate) continue
        const f = row.candidate

        // Make the file anyone-with-link viewable so authorised guests can
        // open it through the same Drive URL. Best-effort — don't block the
        // attachment save if Drive permissions API errors out.
        try {
          await makeFileAnyoneViewable(f.id)
        } catch (e) {
          console.warn('Could not auto-share Drive file', f.id, e)
        }

        const res = await fetch('/api/attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentId: row.tx._id,
            parentType: 'transaction',
            driveFileId: f.id,
            driveFileName: f.name,
            driveMimeType: f.mimeType,
            driveSize: f.size,
            driveWebViewLink: f.webViewLink,
          }),
        })
        const status: Row['status'] = res.ok ? 'attached' : 'error'
        setRows((r) => r.map((x, idx) => (idx === i ? { ...x, status, error: res.ok ? undefined : `HTTP ${res.status}` } : x)))
      }
    } finally {
      setAttaching(false)
    }
  }

  function clearMatch(i: number) {
    setRows((r) => r.map((x, idx) => idx === i ? { ...x, status: 'no-match', candidate: undefined, daysOff: undefined } : x))
  }

  const matchedCount = rows.filter((r) => r.status === 'matched').length
  const attachedCount = rows.filter((r) => r.status === 'attached').length
  const noMatchCount = rows.filter((r) => r.status === 'no-match').length
  const errorCount = rows.filter((r) => r.status === 'error').length

  return (
    <div className="bulk-attach">
      <h1>Bulk Attach Receipts</h1>
      <p className="bulk-attach-desc">
        Find unattached transactions matching a vendor keyword, then pair them with PDF receipts
        from your Drive by matching the date in each filename to the transaction date (within the
        tolerance window).
      </p>

      <div className="bulk-form">
        <input
          className="input-search"
          type="text"
          placeholder="Description contains (e.g. github)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="input-prefix"
          type="text"
          placeholder="Filename contains (e.g. GitHub)"
          value={filenameHint}
          onChange={(e) => setFilenameHint(e.target.value)}
        />
        <div className="with-suffix">
          <input
            className="input-offset"
            type="number"
            min={0}
            max={60}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
            title="Allow this many days between tx date and receipt date"
          />
          <span className="suffix">± days</span>
        </div>
        <button className="bulk-btn" onClick={scan} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="bulk-summary">
            <span className="bulk-summary-stats">
              <strong>{rows.length}</strong> tx · <strong>{filesFound}</strong> files in Drive ·
              {' '}matched <strong>{matchedCount}</strong> ·
              {' '}no match <strong>{noMatchCount}</strong> ·
              {' '}attached <strong>{attachedCount}</strong>
              {errorCount > 0 && <> · errors <strong>{errorCount}</strong></>}
            </span>
            <button
              className="bulk-btn bulk-btn-primary"
              onClick={attachAll}
              disabled={attaching || matchedCount === 0}
            >
              {attaching ? 'Attaching…' : `Attach ${matchedCount} matched`}
            </button>
          </div>

          <div className="bulk-table-wrap">
            <table className="bulk-table">
              <thead>
                <tr>
                  <th>Tx date</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th>Matched file</th>
                  <th>Δ days</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.tx.date.slice(0, 10)}</td>
                    <td className="col-amount">${Math.abs(r.tx.amount).toFixed(2)}</td>
                    <td className="col-desc" title={r.tx.description}>{r.tx.description}</td>
                    <td className="col-mono">{r.candidate?.name ?? '—'}</td>
                    <td className="col-amount">{r.daysOff != null ? r.daysOff : '—'}</td>
                    <td>
                      <span className={`bulk-status bulk-status-${r.status}`}>{r.status}</span>
                      {r.error && <span className="bulk-error-msg">{r.error}</span>}
                    </td>
                    <td>
                      {r.status === 'matched' && (
                        <button className="bulk-link-btn" onClick={() => clearMatch(i)} title="Don't attach this one">
                          skip
                        </button>
                      )}
                      {r.candidate?.webViewLink && (
                        <a className="bulk-link-btn" href={r.candidate.webViewLink} target="_blank" rel="noopener noreferrer">
                          open
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default BulkAttach
