import express from "express";
import { AuthEvent } from "../models/AuthEvent.js";
import { requireOwner } from "../auth/middleware.js";

export const authEventsRouter = express.Router();

/**
 * POST /api/auth-events
 * Record a sign-in or sign-out from the client.
 *
 * Any authenticated user (owner or guest) can record their OWN event.
 * The userId/email come from the verified Firebase token — NOT the body —
 * so a guest can never log an event as someone else.
 */
authEventsRouter.post("/", async (req, res) => {
  try {
    const u = req.user!;
    const { eventType, provider, displayName } = req.body as {
      eventType?: string;
      provider?: string;
      displayName?: string;
    };
    if (eventType !== "login" && eventType !== "logout") {
      res.status(400).json({ error: "eventType must be 'login' or 'logout'" });
      return;
    }
    // Best-effort IP. Behind nginx we trust x-forwarded-for; otherwise
    // fall back to the socket address. Trim to a single IP if a chain.
    const fwd = (req.headers["x-forwarded-for"] as string) || "";
    const ipAddress = (fwd.split(",")[0] || req.ip || "").trim();
    const userAgent = (req.headers["user-agent"] as string) || "";

    await AuthEvent.create({
      userId: u.actorUid,
      email: u.email || "",
      eventType,
      displayName: displayName || "",
      provider: provider || "",
      ipAddress,
      userAgent,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Failed to record auth event:", err);
    res.status(500).json({ error: "Failed to record event" });
  }
});

/**
 * GET /api/auth-events
 * Admin-only list of recent sign-ins/sign-outs.
 *
 * Query params:
 *   - limit (default 100, max 500)
 *   - email (optional filter by email)
 *
 * Returns newest events first.
 */
authEventsRouter.get("/", requireOwner, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const filter: Record<string, unknown> = {};
    if (req.query.email) {
      filter.email = String(req.query.email).toLowerCase();
    }
    const events = await AuthEvent.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(events);
  } catch (err) {
    console.error("Failed to list auth events:", err);
    res.status(500).json({ error: "Failed to list events" });
  }
});
