import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "./Login.css";

function Login() {
  const { signInWithGoogle, signInWithEmail, resetPassword } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleGoogleSignIn() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError((err as Error).message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError("Email and password required");
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      // Firebase error codes are like "auth/invalid-credential"
      if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password") {
        setError("Wrong email or password.");
      } else if (e.code === "auth/user-not-found") {
        setError("No account for this email. Ask the owner to provision one.");
      } else if (e.code === "auth/too-many-requests") {
        setError("Too many attempts. Try again in a minute.");
      } else {
        setError(e.message || "Sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setInfo(null);
    if (!email) {
      setError("Type your email above first, then click 'Forgot password'.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email.trim().toLowerCase());
      setInfo(
        `Password reset email sent to ${email}. Check your inbox (and spam folder).`,
      );
    } catch (err: unknown) {
      setError((err as Error).message || "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Tax App</h1>
        <p className="login-tagline">Sign in to access your tax records.</p>

        {mode === "choose" && (
          <>
            <button
              className="login-google-btn"
              onClick={handleGoogleSignIn}
              disabled={busy}
            >
              {busy ? "Signing in..." : "Continue with Google"}
            </button>
            <button
              className="login-secondary-btn"
              type="button"
              onClick={() => setMode("email")}
              disabled={busy}
            >
              Sign in with email & password
            </button>
          </>
        )}

        {mode === "email" && (
          <form onSubmit={handleEmailSignIn} className="login-email-form">
            <label className="login-field-label">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              disabled={busy}
              required
            />
            <label className="login-field-label">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              disabled={busy}
              required
            />
            <button className="login-google-btn" type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <div className="login-actions-row">
              <button
                className="login-link-btn"
                type="button"
                onClick={handleForgotPassword}
                disabled={busy}
              >
                Forgot password
              </button>
              <button
                className="login-link-btn"
                type="button"
                onClick={() => {
                  setMode("choose");
                  setError(null);
                  setInfo(null);
                }}
                disabled={busy}
              >
                Back
              </button>
            </div>
          </form>
        )}

        {error && <p className="login-error">{error}</p>}
        {info && <p className="login-info">{info}</p>}
      </div>
    </div>
  );
}

export default Login;
