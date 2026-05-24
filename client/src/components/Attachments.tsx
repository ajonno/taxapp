import { useEffect, useState } from 'react'
import { pickDriveFile, makeFileAnyoneViewable } from '../auth/drivePicker'
import { useAuth } from '../auth/AuthContext'
import './Attachments.css'

interface Attachment {
  _id: string
  originalName: string
  size: number
  createdAt: string
  filePath?: string
  driveFileId?: string
  driveWebViewLink?: string
}

interface Props {
  parentId: string
  parentType: 'cgt-asset' | 'transaction' | 'income'
  onCountChange?: (count: number) => void
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentHref(a: Attachment): string {
  if (a.driveWebViewLink) return a.driveWebViewLink
  if (a.driveFileId) return `https://drive.google.com/file/d/${a.driveFileId}/view`
  return `/api/attachments/${a._id}/view`
}

function Attachments({ parentId, parentType, onCountChange }: Props) {
  const { canEdit } = useAuth()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, parentType])

  async function fetchAttachments() {
    try {
      const params = new URLSearchParams({ parentId, parentType })
      const res = await fetch(`/api/attachments?${params}`)
      const data = await res.json()
      setAttachments(data)
      onCountChange?.(data.length)
    } catch (err) {
      console.error('Failed to fetch attachments:', err)
    }
  }

  async function handlePickFromDrive() {
    setError(null)
    setPicking(true)
    try {
      const picked = await pickDriveFile()
      if (!picked) return

      // Make the file anyone-with-link viewable so all authorised guests
      // see it through the same Drive URL the owner sees. Best-effort —
      // don't block saving if Drive's permissions API errors out.
      try {
        await makeFileAnyoneViewable(picked.id)
      } catch (e) {
        console.warn('Could not auto-share new attachment:', e)
      }

      const res = await fetch('/api/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId,
          parentType,
          driveFileId: picked.id,
          driveFileName: picked.name,
          driveMimeType: picked.mimeType,
          driveSize: picked.sizeBytes,
          driveWebViewLink: picked.url,
        }),
      })
      if (res.ok) {
        await fetchAttachments()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to save attachment')
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to pick file')
    } finally {
      setPicking(false)
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
                href={attachmentHref(a)}
                className="attachment-name"
                target="_blank"
                rel="noopener noreferrer"
                title={a.driveFileId ? 'Open in Google Drive' : a.filePath ? 'Local file (only viewable on your Mac)' : undefined}
              >
                {a.driveFileId ? '☁ ' : a.filePath ? '⚠ ' : ''}
                {a.originalName}
              </a>
              <span className="attachment-size">{formatSize(a.size)}</span>
              {canEdit && (
                <button
                  className="btn-remove"
                  onClick={() => handleDelete(a._id)}
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <button
          className="btn-attach btn-attach-drive"
          onClick={handlePickFromDrive}
          disabled={picking}
        >
          {picking ? 'Opening Drive…' : '+ Attach from Drive'}
        </button>
      )}

      {error && <div className="attachments-error">{error}</div>}
    </div>
  )
}

export default Attachments
