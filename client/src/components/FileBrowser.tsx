import { useEffect, useState } from 'react'
import './FileBrowser.css'

interface BrowseResult {
  path: string
  parent: string | null
  dirs: string[]
  files: { name: string; size: number }[]
}

interface Shortcut {
  label: string
  path: string
}

interface Props {
  onSelect: (filePath: string) => void
  onCancel: () => void
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileBrowser({ onSelect, onCancel }: Props) {
  const [data, setData] = useState<BrowseResult | null>(null)
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchShortcuts()
    const lastDir = localStorage.getItem('taxapp-filebrowser-dir')
    browse(lastDir || undefined)
  }, [])

  async function fetchShortcuts() {
    try {
      const res = await fetch('/api/attachments/browse/shortcuts')
      const data = await res.json()
      setShortcuts(data)
    } catch (err) {
      console.error('Failed to fetch shortcuts:', err)
    }
  }

  async function browse(dir?: string) {
    setLoading(true)
    setSelected(null)
    try {
      const params = dir ? `?dir=${encodeURIComponent(dir)}` : ''
      const res = await fetch(`/api/attachments/browse${params}`)
      const result = await res.json()
      setData(result)
      localStorage.setItem('taxapp-filebrowser-dir', result.path)
    } catch (err) {
      console.error('Failed to browse:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleConfirm() {
    if (selected && data) {
      onSelect(`${data.path}/${selected}`)
    }
  }

  return (
    <div className="fb-overlay" onClick={onCancel}>
      <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fb-header">
          <span className="fb-title">Select a file</span>
          <button className="fb-close" onClick={onCancel}>x</button>
        </div>

        <div className="fb-body">
          {shortcuts.length > 0 && (
            <div className="fb-sidebar">
              {shortcuts.map((s) => (
                <button
                  key={s.path}
                  className={`fb-shortcut ${data?.path === s.path ? 'fb-shortcut-active' : ''}`}
                  onClick={() => browse(s.path)}
                  title={s.path}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div className="fb-main">
            <div className="fb-path">
              {data?.parent && (
                <button className="fb-up" onClick={() => browse(data.parent!)}>
                  ..
                </button>
              )}
              <span className="fb-current-path">{data?.path || '...'}</span>
            </div>

            <div className="fb-list">
              {loading && <div className="fb-loading">Loading...</div>}
              {!loading && data && (
                <>
                  {data.dirs.map((d) => (
                    <div
                      key={`d-${d}`}
                      className="fb-item fb-dir"
                      onDoubleClick={() => browse(`${data.path}/${d}`)}
                    >
                      <span className="fb-icon-dir" />
                      <span className="fb-name">{d}</span>
                    </div>
                  ))}
                  {data.files.map((f) => (
                    <div
                      key={`f-${f.name}`}
                      className={`fb-item fb-file ${selected === f.name ? 'fb-selected' : ''}`}
                      onClick={() => setSelected(f.name)}
                      onDoubleClick={() => {
                        setSelected(f.name)
                        onSelect(`${data.path}/${f.name}`)
                      }}
                    >
                      <span className="fb-icon-file" />
                      <span className="fb-name">{f.name}</span>
                      <span className="fb-size">{formatSize(f.size)}</span>
                    </div>
                  ))}
                  {data.dirs.length === 0 && data.files.length === 0 && (
                    <div className="fb-empty">Empty directory</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="fb-footer">
          <button className="fb-btn-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="fb-btn-select"
            onClick={handleConfirm}
            disabled={!selected}
          >
            Attach
          </button>
        </div>
      </div>
    </div>
  )
}

export default FileBrowser
