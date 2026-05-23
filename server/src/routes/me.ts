import express from "express";

export const meRouter = express.Router();

/**
 * GET /api/me
 * Returns information about the currently authenticated user. The frontend
 * calls this once on app boot to decide what to show in the UI (nav items,
 * write buttons, tax-year selector contents, etc.).
 */
meRouter.get("/", (req, res) => {
  const u = req.user!;
  res.json({
    email: u.email,
    role: u.role,
    actorUid: u.actorUid,
    // Only meaningful for guests; for owners we return undefined to signal
    // "no restriction".
    allowedTaxYears: u.role === "guest" ? u.allowedTaxYears || [] : undefined,
    allowedEntities: u.role === "guest" ? u.allowedEntities || [] : undefined,
  });
});
