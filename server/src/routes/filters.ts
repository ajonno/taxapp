import { Router } from "express";
import { Filter } from "../models/Filter.js";

export const filtersRouter = Router();

// Get all filters
filtersRouter.get("/", async (_req, res) => {
  try {
    const filters = await Filter.find().sort({ reason: 1, pattern: 1 });
    res.json(filters);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch filters" });
  }
});

// Create a filter
filtersRouter.post("/", async (req, res) => {
  try {
    const filter = await Filter.create(req.body);
    res.status(201).json(filter);
  } catch (error) {
    res.status(400).json({ error: "Failed to create filter" });
  }
});

// Update a filter
filtersRouter.put("/:id", async (req, res) => {
  try {
    const filter = await Filter.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!filter) {
      res.status(404).json({ error: "Filter not found" });
      return;
    }
    res.json(filter);
  } catch (error) {
    res.status(400).json({ error: "Failed to update filter" });
  }
});

// Delete a filter
filtersRouter.delete("/:id", async (req, res) => {
  try {
    const filter = await Filter.findByIdAndDelete(req.params.id);
    if (!filter) {
      res.status(404).json({ error: "Filter not found" });
      return;
    }
    res.json({ message: "Filter deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete filter" });
  }
});
