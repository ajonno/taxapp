import express from "express";
import { GuestAccess } from "../models/GuestAccess.js";
import { requireOwner, userId } from "../auth/middleware.js";

export const guestsRouter = express.Router();

// All routes in here are owner-only.
guestsRouter.use(requireOwner);

/** GET /api/guests — list all guest-access records for this owner */
guestsRouter.get("/", async (req, res) => {
  try {
    const guests = await GuestAccess.find({ ownerId: userId(req) }).sort({
      createdAt: -1,
    });
    res.json(guests);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/guests — add a guest */
guestsRouter.post("/", async (req, res) => {
  try {
    const {
      email,
      taxYearsAllowed = [],
      entitiesAllowed = [],
      note = "",
      active = true,
      shareAttachments = false,
    } = req.body;
    if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      res.status(400).json({ error: "Valid email required" });
      return;
    }
    if (!Array.isArray(taxYearsAllowed) || !taxYearsAllowed.every((y) => Number.isInteger(y))) {
      res.status(400).json({ error: "taxYearsAllowed must be an array of integers" });
      return;
    }
    if (
      !Array.isArray(entitiesAllowed) ||
      !entitiesAllowed.every((e) => typeof e === "string")
    ) {
      res.status(400).json({ error: "entitiesAllowed must be an array of strings" });
      return;
    }
    const guest = await GuestAccess.create({
      ownerId: userId(req),
      email: email.trim().toLowerCase(),
      taxYearsAllowed,
      entitiesAllowed,
      note,
      active,
      shareAttachments: Boolean(shareAttachments),
    });
    res.status(201).json(guest);
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    if (e.code === 11000) {
      res.status(409).json({ error: "A guest with this email already exists" });
      return;
    }
    res.status(500).json({ error: e.message });
  }
});

/** PATCH /api/guests/:id — update a guest (years, note, active) */
guestsRouter.patch("/:id", async (req, res) => {
  try {
    const allowed: Record<string, unknown> = {};
    if ("taxYearsAllowed" in req.body) {
      if (
        !Array.isArray(req.body.taxYearsAllowed) ||
        !req.body.taxYearsAllowed.every((y: unknown) => Number.isInteger(y))
      ) {
        res
          .status(400)
          .json({ error: "taxYearsAllowed must be an array of integers" });
        return;
      }
      allowed.taxYearsAllowed = req.body.taxYearsAllowed;
    }
    if ("entitiesAllowed" in req.body) {
      if (
        !Array.isArray(req.body.entitiesAllowed) ||
        !req.body.entitiesAllowed.every((e: unknown) => typeof e === "string")
      ) {
        res
          .status(400)
          .json({ error: "entitiesAllowed must be an array of strings" });
        return;
      }
      allowed.entitiesAllowed = req.body.entitiesAllowed;
    }
    if ("note" in req.body) allowed.note = String(req.body.note);
    if ("active" in req.body) allowed.active = Boolean(req.body.active);
    if ("shareAttachments" in req.body)
      allowed.shareAttachments = Boolean(req.body.shareAttachments);

    const guest = await GuestAccess.findOneAndUpdate(
      { _id: req.params.id, ownerId: userId(req) },
      { $set: allowed },
      { new: true }
    );
    if (!guest) {
      res.status(404).json({ error: "Guest not found" });
      return;
    }
    res.json(guest);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** DELETE /api/guests/:id */
guestsRouter.delete("/:id", async (req, res) => {
  try {
    const result = await GuestAccess.deleteOne({
      _id: req.params.id,
      ownerId: userId(req),
    });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: "Guest not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
