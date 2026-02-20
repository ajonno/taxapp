import { useState, useRef, useEffect } from 'react'
import './Import.css'

interface ImportResult {
  total: number
  inserted: number
  duplicates: number
  learned: number
  errors: string[]
}

function Import() {
  const [sourceOptions, setSourceOptions] = useState<{ value: string; label: string }[]>([])
  const [entityOptions, setEntityOptions] = useState<{ value: string; label: string }[]>([])
  const [source, setSource] = useState('')
  const [entity, setEntity] = useState('')

  useEffect(() => {
    fetch('/api/sources')
      .then((res) => res.json())
      .then((data) => setSourceOptions(data.map((s: { key: string; label: string }) => ({ value: s.key, label: s.label }))))
      .catch((err) => console.error('Failed to fetch sources:', err))
    fetch('/api/entities')
      .then((res) => res.json())
      .then((data) => setEntityOptions(data.map((e: { key: string; label: string }) => ({ value: e.key, label: e.label }))))
      .catch((err) => console.error('Failed to fetch entities:', err))
  }, [])
  const [accountLabel, setAccountLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped && dropped.name.endsWith('.csv')) {
      setFile(dropped)
      setResult(null)
      setError('')
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setResult(null)
      setError('')
    }
  }

  async function handleImport() {
    if (!file || !source || !entity) return

    setImporting(true)
    setResult(null)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('source', source)
    formData.append('entity', entity)
    if (accountLabel.trim()) {
      formData.append('accountLabel', accountLabel.trim())
    }

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Import failed')
        return
      }
      const data: ImportResult = await res.json()
      setResult(data)
    } catch {
      setError('Failed to connect to server')
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setFile(null)
    setResult(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div>
      <h1>Import</h1>

      <div className="import-form">
        <div className="form-group">
          <label htmlFor="source">Source</label>
          <select
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">Select source...</option>
            {sourceOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="entity">Entity</label>
          <select
            id="entity"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            <option value="">Select entity...</option>
            {entityOptions.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="accountLabel">Account label (optional)</label>
          <input
            id="accountLabel"
            type="text"
            value={accountLabel}
            onChange={(e) => setAccountLabel(e.target.value)}
            placeholder="e.g. Westpac Everyday, IBKR Main"
          />
        </div>

        <div
          className={`drop-zone ${file ? 'has-file' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? (
            <div className="file-info">
              <span className="file-name">{file.name}</span>
              <span className="file-size">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
          ) : (
            <p>Drag and drop a CSV file here, or click to select</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            hidden
          />
        </div>

        <div className="import-actions">
          <button
            onClick={handleImport}
            disabled={!file || !source || !entity || importing}
            className="btn-primary"
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
          {file && (
            <button onClick={reset} className="btn-secondary">
              Clear
            </button>
          )}
        </div>
      </div>

      {error && <div className="import-error">{error}</div>}

      {result && (
        <div className="import-result">
          <h3>Import Complete</h3>
          <div className="result-stats">
            <div className="stat">
              <span className="stat-value">{result.total}</span>
              <span className="stat-label">Total rows</span>
            </div>
            <div className="stat">
              <span className="stat-value">{result.inserted}</span>
              <span className="stat-label">Imported</span>
            </div>
            <div className="stat">
              <span className="stat-value">{result.duplicates}</span>
              <span className="stat-label">Skipped (duplicates)</span>
            </div>
            <div className="stat">
              <span className="stat-value">{result.learned}</span>
              <span className="stat-label">Auto-categorised (learned)</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="result-errors">
              <h4>Errors:</h4>
              <ul>
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Import
