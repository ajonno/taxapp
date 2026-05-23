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
