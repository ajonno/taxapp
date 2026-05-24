/**
 * Google Drive file picker — uses Google Identity Services (gis) for OAuth
 * and the Picker API for the file selection UI.
 *
 * Usage:
 *   const file = await pickDriveFile()
 *   if (file) { ...attach file.id, file.name, etc. }
 */

import { getDriveAccessToken, clearCachedDriveToken } from './driveAuth'

const API_KEY = import.meta.env.VITE_PUBLIC_GOOGLE_API_KEY as string
const APP_ID = import.meta.env.VITE_PUBLIC_GOOGLE_PROJECT_NUMBER as string

export interface PickedDriveFile {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  url: string
}

function waitForGlobal(name: 'google' | 'gapi', timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if ((window as unknown as Record<string, unknown>)[name]) return resolve()
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`${name} script never loaded`))
      }
      setTimeout(check, 50)
    }
    check()
  })
}

async function getAccessToken(): Promise<string> {
  return getDriveAccessToken()
}

async function loadPicker(): Promise<void> {
  await waitForGlobal('gapi')
  return new Promise<void>((resolve, reject) => {
    // @ts-expect-error gapi added by api.js script
    window.gapi.load('picker', { callback: resolve, onerror: reject })
  })
}

export interface DriveSearchResult {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
  size?: number
}

/** Escape a string for use inside a single-quoted Drive query value. */
function escapeForQuery(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function runDriveQuery(q: string, retried = false): Promise<DriveSearchResult[]> {
  const token = await getAccessToken()
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,size,webViewLink)',
    pageSize: '20',
    spaces: 'drive',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  // Token might have been revoked; clear cache and retry once
  if ((res.status === 401 || res.status === 403) && !retried) {
    clearCachedDriveToken()
    return runDriveQuery(q, true)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive search failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.files || []) as DriveSearchResult[]
}

/**
 * Make a Drive file viewable by anyone with the link (role=reader,
 * type=anyone). This is the simple, fast path: one Drive permission call
 * per file (no per-guest enumeration). The URL itself is a long Drive file
 * ID that's effectively unguessable, and the app only surfaces it to
 * authenticated, authorised users — so in practice access is still gated
 * by app login, without the slow per-user-per-file dance.
 *
 * Requires full drive scope (drive.file is insufficient for files added
 * via name search). Silently retries token refresh on 401/403.
 */
export async function makeFileAnyoneViewable(
  fileId: string,
  retried = false,
): Promise<{ ok: boolean; status: number }> {
  const token = await getAccessToken()
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
  )
  url.searchParams.set('sendNotificationEmail', 'false')
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })
  if ((res.status === 401 || res.status === 403) && !retried) {
    clearCachedDriveToken()
    return makeFileAnyoneViewable(fileId, true)
  }
  return { ok: res.ok, status: res.status }
}

/**
 * Grant a specific email address read-only permission on a Drive file.
 * Used by Settings → "Share attachments with this guest" to scope attachment
 * visibility per-guest rather than making files public-with-link.
 *
 * Drive will idempotently update the existing permission if one already
 * exists for the same address. We pass `sendNotificationEmail=false` so the
 * guest doesn't get a separate "X shared a file with you" email per file.
 *
 * Requires drive.file scope. Silently retries token refresh on 401/403.
 */
export async function shareFileWithEmail(
  fileId: string,
  email: string,
  retried = false,
): Promise<{ ok: boolean; status: number }> {
  const token = await getAccessToken()
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
  )
  url.searchParams.set('sendNotificationEmail', 'false')
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'user',
      emailAddress: email,
    }),
  })
  if ((res.status === 401 || res.status === 403) && !retried) {
    clearCachedDriveToken()
    return shareFileWithEmail(fileId, email, true)
  }
  return { ok: res.ok, status: res.status }
}

/**
 * Revoke a specific email address's permission on a Drive file. Used when
 * the owner unticks "Share attachments" for a guest.
 *
 * Drive requires us to first look up the permission ID for that email, then
 * DELETE it. Returns ok=true even if there was no existing permission to
 * remove (idempotent).
 */
export async function unshareFileFromEmail(
  fileId: string,
  email: string,
  retried = false,
): Promise<{ ok: boolean; status: number }> {
  const token = await getAccessToken()
  // List existing permissions with emailAddress field.
  const listUrl = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
  )
  listUrl.searchParams.set('fields', 'permissions(id,emailAddress,type)')
  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if ((listRes.status === 401 || listRes.status === 403) && !retried) {
    clearCachedDriveToken()
    return unshareFileFromEmail(fileId, email, true)
  }
  if (!listRes.ok) return { ok: false, status: listRes.status }
  const data = (await listRes.json()) as {
    permissions?: { id: string; emailAddress?: string; type: string }[]
  }
  const match = (data.permissions || []).find(
    (p) => p.type === 'user' && (p.emailAddress || '').toLowerCase() === email.toLowerCase(),
  )
  if (!match) return { ok: true, status: 200 } // already unshared
  const delRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${match.id}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  return { ok: delRes.ok, status: delRes.status }
}

/**
 * Search the user's Drive for files matching the given name.
 * Tries exact match first; falls back to "name contains" using the stem
 * (filename minus extension) — Drive can be finicky with special chars
 * in exact matches.
 * Requires drive.metadata.readonly scope.
 */
export async function searchDriveByName(name: string): Promise<DriveSearchResult[]> {
  // 1) exact match
  const exact = await runDriveQuery(`name = '${escapeForQuery(name)}' and trashed = false`)
  if (exact.length > 0) return exact

  // 2) fallback: contains on the stem
  const stem = name.replace(/\.[^.]+$/, '').trim()
  if (stem && stem !== name) {
    const fuzzy = await runDriveQuery(
      `name contains '${escapeForQuery(stem)}' and trashed = false`
    )
    // Prefer the closest matches (where the name fully contains the stem)
    return fuzzy
  }
  return []
}

export async function pickDriveFile(): Promise<PickedDriveFile | null> {
  const token = await getAccessToken()
  await loadPicker()

  return new Promise<PickedDriveFile | null>((resolve) => {
    // @ts-expect-error google.picker provided by Picker API
    const view = new window.google.picker.DocsView()
      .setIncludeFolders(true)
      .setMimeTypes('application/pdf,image/jpeg,image/png,image/gif,image/heic,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .setSelectFolderEnabled(false)

    // @ts-expect-error google.picker provided by Picker API
    const picker = new window.google.picker.PickerBuilder()
      // @ts-expect-error
      .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
      .setAppId(APP_ID)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .addView(view)
      .setCallback((data: { action: string; docs?: Array<Record<string, unknown>> }) => {
        // @ts-expect-error google.picker provided by Picker API
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs?.[0]
          if (!doc) {
            resolve(null)
            return
          }
          resolve({
            id: String(doc.id),
            name: String(doc.name),
            mimeType: String(doc.mimeType),
            sizeBytes: Number(doc.sizeBytes) || 0,
            url: String(doc.url || ''),
          })
        // @ts-expect-error google.picker provided by Picker API
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()

    picker.setVisible(true)
  })
}
