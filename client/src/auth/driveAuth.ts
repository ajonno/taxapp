/**
 * Shared Google Drive OAuth token helper.
 * Persists the access token in localStorage so we don't re-prompt on every page load.
 */
const CLIENT_ID = import.meta.env.VITE_PUBLIC_GOOGLE_OAUTH_CLIENT_ID as string

// Full `drive` scope so the app can call permissions.create on any file the
// owner has attached — including ones surfaced via name search (Bulk
// Attach), not just files opened with Drive Picker. `drive.file` alone
// restricts API access to picker-opened or app-created files, which causes
// silent 403s when sharing files that came in via search.
export const DRIVE_SCOPES =
  'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.metadata.readonly'

const STORAGE_KEY = 'taxapp.drive.token'

interface CachedToken {
  accessToken: string
  expiresAt: number // epoch ms
  scopes: string
}

function loadCached(): CachedToken | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedToken
    if (!parsed?.accessToken || !parsed.expiresAt) return null
    if (Date.now() >= parsed.expiresAt) return null
    // Invalidate if the cached token was issued with narrower scopes than
    // we now require — e.g. after we widen DRIVE_SCOPES in code.
    if (parsed.scopes !== DRIVE_SCOPES) return null
    return parsed
  } catch {
    return null
  }
}

function saveCached(token: CachedToken) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(token))
  } catch {
    // ignore quota errors etc.
  }
}

export function clearCachedDriveToken() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

function waitForGoogleAccounts(timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).google?.accounts?.oauth2) return resolve()
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Google Identity Services script not loaded'))
      }
      setTimeout(check, 50)
    }
    check()
  })
}

/**
 * Get an OAuth access token covering DRIVE_SCOPES.
 * Returns the cached token if it's still valid; otherwise requests a fresh one
 * via GIS (typically silent if the user has previously granted consent).
 */
export async function getDriveAccessToken(): Promise<string> {
  const cached = loadCached()
  if (cached) return cached.accessToken

  await waitForGoogleAccounts()

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google
    const tc = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPES,
      callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'no token'))
          return
        }
        const expiresIn = resp.expires_in ?? 3600
        const token: CachedToken = {
          accessToken: resp.access_token,
          // expire 60s before actual expiry to be safe
          expiresAt: Date.now() + (expiresIn - 60) * 1000,
          scopes: DRIVE_SCOPES,
        }
        saveCached(token)
        resolve(resp.access_token)
      },
    })
    // Empty prompt = silent if previously consented, popup otherwise
    tc.requestAccessToken({ prompt: '' })
  })
}
