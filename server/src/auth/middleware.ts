import type { Request, Response, NextFunction } from "express";
import { admin } from "./firebaseAdmin.js";
import { GuestAccess } from "../models/GuestAccess.js";

// Augment Express Request to include user info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        // For owners: the owner's own UID.
        // For guests: the OWNER's UID, so all data queries hit the owner's data.
        uid: string;
        // Always the signed-in user's own email.
        email?: string;
        // Always the signed-in user's own UID, even when scoped to an owner.
        // Use this when you need to identify the actual logged-in person (audit
        // logs, etc.), not when querying owner-scoped data.
        actorUid: string;
        // "owner" if the email is on ALLOWED_EMAILS; "guest" if it matches an
        // active GuestAccess record.
        role: "owner" | "guest";
        // For guests only: the list of tax years they may view. Owners have
        // unrestricted access (undefined = no restriction).
        allowedTaxYears?: number[];
        // For guests only: the list of entity keys they may view.
        allowedEntities?: string[];
      };
    }
  }
}

// Comma-separated list of owner Google account emails (full admin access).
const OWNER_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Verify the Firebase ID token in the Authorization header and resolve the
 * caller's role:
 *  - Email on the OWNER_EMAILS allowlist → role "owner", uid = own UID.
 *  - Email matches an active GuestAccess record → role "guest", uid =
 *    OWNER's UID (so queries hit the owner's data), allowedTaxYears set.
 *  - Otherwise → 403.
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
    const email = (decoded.email || "").toLowerCase();
    if (!email) {
      res.status(403).json({ error: "Token has no email claim" });
      return;
    }

    // Owner path — full access.
    if (OWNER_EMAILS.includes(email)) {
      req.user = {
        uid: decoded.uid,
        actorUid: decoded.uid,
        email: decoded.email,
        role: "owner",
      };
      next();
      return;
    }

    // Guest path — look up GuestAccess by email.
    const guest = await GuestAccess.findOne({ email, active: true }).lean();
    if (!guest) {
      console.warn(`Rejected sign-in from non-allowlisted email: ${email}`);
      res.status(403).json({ error: "This account is not authorized" });
      return;
    }

    req.user = {
      // Critical: scope queries to the OWNER's data, not the guest's own UID.
      uid: guest.ownerId,
      actorUid: decoded.uid,
      email: decoded.email,
      role: "guest",
      allowedTaxYears: guest.taxYearsAllowed || [],
      allowedEntities: guest.entitiesAllowed || [],
    };
    next();
  } catch (err) {
    console.error("Auth verification failed:", (err as Error).message);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Get current user's effective UID (for guests, this is the owner's UID).
 * Use inside route handlers after requireAuth for any owner-scoped query.
 */
export function userId(req: Request): string {
  if (!req.user?.uid) {
    throw new Error("userId() called before requireAuth - this is a bug");
  }
  return req.user.uid;
}

/**
 * Block guests from a route. Returns 403 if the caller is not an owner.
 * Apply to all mutation endpoints (POST/PATCH/PUT/DELETE) and to settings-level
 * endpoints (guest management, sources/entities CRUD, etc.).
 */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "owner") {
    res.status(403).json({ error: "Forbidden: this action requires owner access" });
    return;
  }
  next();
}

/**
 * For guests, ensure the taxYear they are asking about is in their allowed
 * list. Owners pass through unchanged.
 *
 * Reads `req.query.taxYear`. If not provided, guests get 400 (they must always
 * scope to a specific year). Owners with no taxYear see all data.
 */
export function enforceTaxYearScope(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.user?.role !== "guest") {
    next();
    return;
  }
  const yearStr = req.query.taxYear as string | undefined;
  if (!yearStr) {
    res.status(400).json({ error: "Guests must specify a taxYear query param" });
    return;
  }
  const year = Number(yearStr);
  const allowed = req.user.allowedTaxYears || [];
  if (!allowed.includes(year)) {
    res
      .status(403)
      .json({ error: `Tax year ${year} is not in your granted access` });
    return;
  }
  next();
}

/**
 * For guests, ensure the entity query param is in their allowed list. If
 * the guest didn't specify entity (i.e. "All entities"), the server
 * substitutes a server-side restriction so they only ever see their allowed
 * entities (via req.query.entity being set when there's exactly one allowed,
 * or via a special $in filter that route handlers should respect).
 *
 * For simplicity and safety, this middleware rejects unscoped requests from
 * guests with multiple allowed entities — the frontend should always send
 * `entity` for guests when they have more than one allowed.
 *
 * Owners pass through unchanged.
 */
export function enforceEntityScope(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.user?.role !== "guest") {
    next();
    return;
  }
  const allowed = req.user.allowedEntities || [];
  if (allowed.length === 0) {
    res
      .status(403)
      .json({ error: "No entities granted to this guest" });
    return;
  }
  const entity = req.query.entity as string | undefined;
  if (!entity) {
    // No entity specified — if the guest has exactly one allowed, auto-apply
    // it so they don't have to remember to pass it. If they have several,
    // require an explicit choice.
    if (allowed.length === 1) {
      req.query.entity = allowed[0];
      next();
      return;
    }
    res.status(400).json({
      error: "Guests with multiple allowed entities must specify ?entity=",
    });
    return;
  }
  if (!allowed.includes(entity)) {
    res
      .status(403)
      .json({ error: `Entity '${entity}' is not in your granted access` });
    return;
  }
  next();
}
