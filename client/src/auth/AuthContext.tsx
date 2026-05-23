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
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Role + tax-year scope for the signed-in user. null until first /api/me call. */
  me: MeResponse | null;
  /** Convenience: whether the signed-in user can write. */
  canEdit: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  /** Refetch /api/me (e.g. after the owner just edited their own guest list). */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);

  // Wait for the initial Firebase auth state.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      // Reset role info on sign-out.
      if (!firebaseUser) setMe(null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Fetch /api/me once we have a user.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          // 403 here means the email is signed in to Firebase but not
          // authorised against the backend. Surface as me=null so the UI can
          // show an unauthorised state.
          if (!cancelled) setMe(null);
          return;
        }
        const data: MeResponse = await res.json();
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) setMe(null);
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
      canEdit: me?.role === "owner",
      signInWithGoogle: async () => {
        await signInWithPopup(auth, googleProvider);
      },
      signOutUser: async () => {
        await signOut(auth);
        setMe(null);
      },
      getIdToken: async () => {
        if (!auth.currentUser) return null;
        return auth.currentUser.getIdToken();
      },
      refreshMe: async () => {
        try {
          const res = await fetch("/api/me");
          if (res.ok) setMe(await res.json());
        } catch {
          /* ignore */
        }
      },
    }),
    [user, loading, me]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
