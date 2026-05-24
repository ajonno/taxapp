import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

export type Role = "owner" | "guest";

export interface MeResponse {
  email: string;
  role: Role;
  /** For guests only — list of taxYear end-years they're allowed to view. */
  allowedTaxYears?: number[];
  /** For guests only — list of entity keys they're allowed to view. */
  allowedEntities?: string[];
}

/**
 * Status of the most recent /api/me call.
 *  - "idle":     no user is signed in (nothing to fetch)
 *  - "loading":  user is signed in, /api/me request in flight
 *  - "ok":       /api/me returned successfully, `me` is populated
 *  - "denied":   /api/me returned 403 — the user is on Firebase but the
 *                backend doesn't recognise them (no guest record, or disabled)
 *  - "error":    network or other failure
 */
export type MeStatus = "idle" | "loading" | "ok" | "denied" | "error";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  me: MeResponse | null;
  meStatus: MeStatus;
  /** Convenience: whether the signed-in user can write. */
  canEdit: boolean;
  signInWithGoogle: () => Promise<void>;
  /**
   * Sign in with a Firebase email/password account. Used by guests without
   * a Google account; the owner provisions the Firebase user via Settings.
   */
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** Send a Firebase password-reset email. */
  resetPassword: (email: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Post a sign-in or sign-out event to the server's activity log.
 * Best-effort — never throws, never blocks the auth flow. The server
 * fills in IP / user-agent from the request headers.
 */
async function logAuthEvent(
  eventType: "login" | "logout",
  firebaseUser: User | null,
) {
  try {
    const provider =
      firebaseUser?.providerData?.[0]?.providerId || "";
    const displayName = firebaseUser?.displayName || "";
    await fetch("/api/auth-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, provider, displayName }),
    });
  } catch {
    /* swallow — auth flow must not depend on logging success */
  }
}

/**
 * Persist "we've already recorded a login for this UID" in localStorage
 * so that hard-refreshing the page does NOT record another phantom login.
 * The marker expires after 12 hours so coming back the next day still
 * registers as a fresh session.
 */
const LOGIN_MARKER_PREFIX = "auth-event-logged:";
const LOGIN_MARKER_TTL_MS = 12 * 60 * 60 * 1000;

function hasRecentLoginMarker(uid: string): boolean {
  try {
    const raw = localStorage.getItem(LOGIN_MARKER_PREFIX + uid);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < LOGIN_MARKER_TTL_MS;
  } catch {
    return false;
  }
}

function setLoginMarker(uid: string): void {
  try {
    localStorage.setItem(LOGIN_MARKER_PREFIX + uid, String(Date.now()));
  } catch {
    /* localStorage unavailable — degrade silently */
  }
}

function clearLoginMarker(uid: string): void {
  try {
    localStorage.removeItem(LOGIN_MARKER_PREFIX + uid);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meStatus, setMeStatus] = useState<MeStatus>("idle");
  // We only want to log a login the first time meStatus flips to "ok" for
  // a given Firebase user. Subsequent refreshes (e.g. via refreshMe) should
  // NOT generate additional login events.
  const lastLoggedLoginUid = useRef<string | null>(null);

  // Wait for the initial Firebase auth state.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      // Reset role info on sign-out.
      if (!firebaseUser) {
        setMe(null);
        setMeStatus("idle");
        lastLoggedLoginUid.current = null;
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // When the user becomes fully authenticated (Firebase + backend /me both
  // green) — log a login event. We deduplicate against:
  //   - lastLoggedLoginUid.current: in-memory guard against double-fires
  //     within a single AuthProvider lifecycle.
  //   - localStorage marker (12h TTL): survives hard-refreshes and new
  //     tabs so reloading the page doesn't record a phantom login event.
  // Markers are cleared on explicit sign-out, so the next sign-in IS logged.
  useEffect(() => {
    if (
      meStatus === "ok" &&
      user &&
      lastLoggedLoginUid.current !== user.uid &&
      !hasRecentLoginMarker(user.uid)
    ) {
      lastLoggedLoginUid.current = user.uid;
      setLoginMarker(user.uid);
      void logAuthEvent("login", user);
    } else if (meStatus === "ok" && user) {
      // Still remember it in-memory so the effect doesn't keep retrying.
      lastLoggedLoginUid.current = user.uid;
    }
  }, [meStatus, user]);

  // Fetch /api/me once we have a user.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setMeStatus("loading");
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (cancelled) return;
        if (res.status === 403) {
          setMe(null);
          setMeStatus("denied");
          return;
        }
        if (!res.ok) {
          setMe(null);
          setMeStatus("error");
          return;
        }
        const data: MeResponse = await res.json();
        setMe(data);
        setMeStatus("ok");
      } catch {
        if (!cancelled) {
          setMe(null);
          setMeStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      me,
      meStatus,
      canEdit: me?.role === "owner",
      signInWithGoogle: async () => {
        await signInWithPopup(auth, googleProvider);
      },
      signInWithEmail: async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      resetPassword: async (email: string) => {
        await sendPasswordResetEmail(auth, email);
      },
      signOutUser: async () => {
        // Post the logout event BEFORE signing out — the request needs the
        // current Firebase token to authenticate against /api/auth-events.
        await logAuthEvent("logout", auth.currentUser);
        // Clear the dedup marker so the next sign-in for this UID IS
        // recorded as a fresh login (otherwise the 12h TTL would suppress).
        if (auth.currentUser) {
          clearLoginMarker(auth.currentUser.uid);
        }
        await signOut(auth);
        setMe(null);
        setMeStatus("idle");
        lastLoggedLoginUid.current = null;
      },
      getIdToken: async () => {
        if (!auth.currentUser) return null;
        return auth.currentUser.getIdToken();
      },
      refreshMe: async () => {
        try {
          setMeStatus("loading");
          const res = await fetch("/api/me");
          if (res.status === 403) {
            setMe(null);
            setMeStatus("denied");
            return;
          }
          if (res.ok) {
            setMe(await res.json());
            setMeStatus("ok");
          } else {
            setMeStatus("error");
          }
        } catch {
          setMeStatus("error");
        }
      },
    }),
    [user, loading, me, meStatus]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
