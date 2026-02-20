import { useEffect, useState } from 'react'
import FileBrowser from './FileBrowser'
import './Attachments.css'

interface Attachment {
  _id: string
  originalName: string
  size: number
  createdAt: string
}

interface Props {
  parentId: string
  parentType: 'cgt-asset' | 'transaction' | 'income'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Attachments({ parentId, parentType }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showBrowser, setShowBrowser] = useState(false)

  useEffect(() => {
    fetchAttachments()
  }, [parentId, parentType])

  async function fetchAttachments() {
    try {
      const params = new URLSearchParams({ parentId, parentType })
      const res = await fetch(`/api/attachments?${params}`)
      const data = await res.json()
      setAttachments(data)
    } catch (err) {
      console.error('Failed to fetch attachments:', err)
    }
  }

  async function handleSelect(filePath: string) {
    setShowBrowser(false)
    try {
      const res = await fetch('/api/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, parentType, filePath }),
      })
      if (res.ok) {
        fetchAttachments()
      }
    } catch (err) {
      console.error('Failed to attach file:', err)
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/attachments/${id}`, { method: 'DELETE' })
      fetchAttachments()
    } catch (err) {
      console.error('Failed to delete attachment:', err)
    }
  }

  return (
    <div className="attachments-section">
      <label className="attachments-label">Attachments</label>

      {attachments.length > 0 && (
        <div className="attachments-list">
          {attachments.map((a) => (
            <div key={a._id} className="attachment-item">
              <a
                href={`/api/attachments/${a._id}/view`}
                className="attachment-name"
                target="_blank"
                rel="noopener noreferrer"
              >
                {a.originalName}
              </a>
              <span className="attachment-size">{formatSize(a.size)}</span>
              <button
                className="btn-remove"
                onClick={() => handleDelete(a._id)}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="btn-attach" onClick={() => setShowBrowser(true)}>
        + Attach File
      </button>

      {showBrowser && (
        <FileBrowser
          onSelect={handleSelect}
          onCancel={() => setShowBrowser(false)}
        />
      )}
    </div>
  )
}

export default Attachments
