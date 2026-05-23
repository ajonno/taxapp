import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "./Login.css";

function Login() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError((err as Error).message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Tax App</h1>
        <p className="login-tagline">Sign in to access your tax records.</p>
        <button
          className="login-google-btn"
          onClick={handleSignIn}
          disabled={busy}
        >
          {busy ? "Signing in..." : "Continue with Google"}
        </button>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}

export default Login;
