import { auth } from "../firebase";

/**
 * Patch window.fetch so that any /api/* request automatically gets the
 * current user's Firebase ID token as an Authorization Bearer header.
 *
 * Also rewrites relative /api URLs to the configured backend origin when
 * one is set (so the same code runs against localhost in dev and
 * https://taxapp.134.199.174.129.nip.io in production).
 *
 * Call once at app boot, before any component issues a fetch.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "";

export function installAuthFetch() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    let url: string;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else url = input.url;

    // Only intercept /api/* requests
    const isApi = url.startsWith("/api/") || url.startsWith("/api?");
    if (!isApi) {
      return originalFetch(input as RequestInfo, init);
    }

    // Rewrite to backend base if configured
    const targetUrl = API_BASE ? `${API_BASE}${url}` : url;

    // Attach ID token if signed in
    const headers = new Headers(init.headers || {});
    if (auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        headers.set("Authorization", `Bearer ${token}`);
      } catch {
        // fall through unauthenticated
      }
    }

    return originalFetch(targetUrl, { ...init, headers });
  };
}
