import { Router } from "express";
import { Filter } from "../models/Filter.js";
import { userId, requireOwner } from "../auth/middleware.js";

export const filtersRouter = Router();

// Filters management is an owner-only admin feature. Note that the server
// still applies active filters when answering /api/transactions queries for
// guests — they just can't view or edit the filter list.
filtersRouter.use(requireOwner);

filtersRouter.get("/", async (req, res) => {
  try {
    const filters = await Filter.find({ userId: userId(req) }).sort({ reason: 1, pattern: 1 });
    res.json(filters);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch filters" });
  }
});

filtersRouter.post("/", async (req, res) => {
  try {
    const filter = await Filter.create({ ...req.body, userId: userId(req) });
    res.status(201).json(filter);
  } catch (error) {
    res.status(400).json({ error: "Failed to create filter" });
  }
});

filtersRouter.put("/:id", async (req, res) => {
  try {
    const filter = await Filter.findOneAndUpdate(
      { _id: req.params.id, userId: userId(req) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!filter) {
      res.status(404).json({ error: "Filter not found" });
      return;
    }
    res.json(filter);
  } catch (error) {
    res.status(400).json({ error: "Failed to update filter" });
  }
});

filtersRouter.delete("/:id", async (req, res) => {
  try {
    const filter = await Filter.findOneAndDelete({ _id: req.params.id, userId: userId(req) });
    if (!filter) {
      res.status(404).json({ error: "Filter not found" });
      return;
    }
    res.json({ message: "Filter deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete filter" });
  }
});
