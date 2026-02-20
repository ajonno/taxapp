import { Router } from "express";
import { Source } from "../models/Source.js";

export const sourcesRouter = Router();

const SEED_SOURCES = [
  { key: "westpac", label: "Westpac", type: "bank" },
  { key: "ig", label: "IG Markets", type: "broker" },
  { key: "interactive-brokers", label: "Interactive Brokers", type: "broker" },
];

// Seed sources (idempotent)
sourcesRouter.post("/seed", async (_req, res) => {
  try {
    let inserted = 0;
    for (const s of SEED_SOURCES) {
      const exists = await Source.findOne({ key: s.key });
      if (!exists) {
        await Source.create(s);
        inserted++;
      }
    }
    res.json({ inserted, total: SEED_SOURCES.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to seed sources" });
  }
});

// Get all sources
sourcesRouter.get("/", async (_req, res) => {
  try {
    const sources = await Source.find({ active: true }).sort({ type: 1, label: 1 });
    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sources" });
  }
});

// Create a source
sourcesRouter.post("/", async (req, res) => {
  try {
    const source = await Source.create(req.body);
    res.status(201).json(source);
  } catch (error) {
    res.status(400).json({ error: "Failed to create source" });
  }
});

// Update a source
sourcesRouter.put("/:id", async (req, res) => {
  try {
    const source = await Source.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }
    res.json(source);
  } catch (error) {
    res.status(400).json({ error: "Failed to update source" });
  }
});

// Delete a source
sourcesRouter.delete("/:id", async (req, res) => {
  try {
    const source = await Source.findByIdAndDelete(req.params.id);
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }
    res.json({ message: "Source deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete source" });
  }
});
