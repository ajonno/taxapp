import { Router } from "express";
import { Source } from "../models/Source.js";
import { userId } from "../auth/middleware.js";

export const sourcesRouter = Router();

const SEED_SOURCES = [
  { key: "westpac", label: "Westpac", type: "bank" as const },
  { key: "ig", label: "IG Markets", type: "broker" as const },
  { key: "interactive-brokers", label: "Interactive Brokers", type: "broker" as const },
];

// Seed sources for the current user (idempotent)
sourcesRouter.post("/seed", async (req, res) => {
  try {
    const uid = userId(req);
    let inserted = 0;
    for (const s of SEED_SOURCES) {
      const exists = await Source.findOne({ userId: uid, key: s.key });
      if (!exists) {
        await Source.create({ ...s, userId: uid });
        inserted++;
      }
    }
    res.json({ inserted, total: SEED_SOURCES.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to seed sources" });
  }
});

sourcesRouter.get("/", async (req, res) => {
  try {
    const sources = await Source.find({ userId: userId(req), active: true }).sort({ type: 1, label: 1 });
    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sources" });
  }
});

sourcesRouter.post("/", async (req, res) => {
  try {
    const source = await Source.create({ ...req.body, userId: userId(req) });
    res.status(201).json(source);
  } catch (error) {
    res.status(400).json({ error: "Failed to create source" });
  }
});

sourcesRouter.put("/:id", async (req, res) => {
  try {
    const source = await Source.findOneAndUpdate(
      { _id: req.params.id, userId: userId(req) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }
    res.json(source);
  } catch (error) {
    res.status(400).json({ error: "Failed to update source" });
  }
});

sourcesRouter.delete("/:id", async (req, res) => {
  try {
    const source = await Source.findOneAndDelete({ _id: req.params.id, userId: userId(req) });
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }
    res.json({ message: "Source deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete source" });
  }
});
