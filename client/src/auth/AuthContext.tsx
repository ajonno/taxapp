import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
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
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meStatus, setMeStatus] = useState<MeStatus>("idle");

  // Wait for the initial Firebase auth state.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      // Reset role info on sign-out.
      if (!firebaseUser) {
        setMe(null);
        setMeStatus("idle");
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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
      signOutUser: async () => {
        await signOut(auth);
        setMe(null);
        setMeStatus("idle");
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
