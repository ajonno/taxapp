import { Router } from "express";
import { Entity } from "../models/Entity.js";
import { userId } from "../auth/middleware.js";

export const entitiesRouter = Router();

const SEED_ENTITIES = [
  { key: "personal", label: "Personal" },
];

// Seed entities for the current user (idempotent)
entitiesRouter.post("/seed", async (req, res) => {
  try {
    const uid = userId(req);
    let inserted = 0;
    for (const e of SEED_ENTITIES) {
      const exists = await Entity.findOne({ userId: uid, key: e.key });
      if (!exists) {
        await Entity.create({ ...e, userId: uid });
        inserted++;
      }
    }
    res.json({ inserted, total: SEED_ENTITIES.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to seed entities" });
  }
});

// Get all entities for the user
entitiesRouter.get("/", async (req, res) => {
  try {
    const entities = await Entity.find({ userId: userId(req), active: true }).sort({ label: 1 });
    res.json(entities);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch entities" });
  }
});

// Create an entity
entitiesRouter.post("/", async (req, res) => {
  try {
    const entity = await Entity.create({ ...req.body, userId: userId(req) });
    res.status(201).json(entity);
  } catch (error) {
    res.status(400).json({ error: "Failed to create entity" });
  }
});

// Update an entity
entitiesRouter.put("/:id", async (req, res) => {
  try {
    const entity = await Entity.findOneAndUpdate(
      { _id: req.params.id, userId: userId(req) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }
    res.json(entity);
  } catch (error) {
    res.status(400).json({ error: "Failed to update entity" });
  }
});

// Delete an entity
entitiesRouter.delete("/:id", async (req, res) => {
  try {
    const entity = await Entity.findOneAndDelete({ _id: req.params.id, userId: userId(req) });
    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }
    res.json({ message: "Entity deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete entity" });
  }
});
