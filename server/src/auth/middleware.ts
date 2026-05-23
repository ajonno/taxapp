import type { Request, Response, NextFunction } from "express";
import { admin } from "./firebaseAdmin.js";

// Augment Express Request to include user info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
      };
    }
  }
}

// Comma-separated list of allowed Google account emails.
// If empty/unset, all valid Firebase users are allowed (development mode).
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Require a valid Firebase ID token in the Authorization header.
 * On success, attaches req.user = { uid, email }.
 * On failure, responds 401.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.headers.authorization || "";
    const match = auth.match(/^Bearer (.+)$/);
    if (!match) {
      res.status(401).json({ error: "Missing Authorization header" });
      return;
    }
    const idToken = match[1];

    const decoded = await admin.auth().verifyIdToken(idToken);

    // Email allowlist check (if configured)
    if (ALLOWED_EMAILS.length > 0) {
      const email = (decoded.email || "").toLowerCase();
      if (!email || !ALLOWED_EMAILS.includes(email)) {
        console.warn(`Rejected sign-in from non-allowlisted email: ${email}`);
        res.status(403).json({ error: "This account is not authorized" });
        return;
      }
    }

    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err) {
    console.error("Auth verification failed:", (err as Error).message);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Helper to get current user's UID with a runtime check.
 * Use inside route handlers after requireAuth.
 */
export function userId(req: Request): string {
  if (!req.user?.uid) {
    throw new Error("userId() called before requireAuth - this is a bug");
  }
  return req.user.uid;
}
