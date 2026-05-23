import { Router } from "express";
import { SubType } from "../models/SubType.js";
import { userId } from "../auth/middleware.js";

export const subTypesRouter = Router();

subTypesRouter.get("/", async (req, res) => {
  try {
    const subTypes = await SubType.find({ userId: userId(req), active: true }).sort({ label: 1 });
    res.json(subTypes);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sub-types" });
  }
});

subTypesRouter.post("/", async (req, res) => {
  try {
    const uid = userId(req);
    const label = String(req.body.label ?? "").trim();
    if (!label) {
      res.status(400).json({ error: "label is required" });
      return;
    }
    const existing = await SubType.findOne({ userId: uid, label });
    if (existing) {
      res.status(409).json({ error: "Sub-type already exists" });
      return;
    }
    const subType = await SubType.create({ userId: uid, label });
    res.status(201).json(subType);
  } catch (error) {
    res.status(400).json({ error: "Failed to create sub-type" });
  }
});

subTypesRouter.delete("/:id", async (req, res) => {
  try {
    const subType = await SubType.findOneAndDelete({ _id: req.params.id, userId: userId(req) });
    if (!subType) {
      res.status(404).json({ error: "Sub-type not found" });
      return;
    }
    res.json({ message: "Sub-type deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete sub-type" });
  }
});
