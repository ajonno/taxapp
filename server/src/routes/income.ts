import { Router } from "express";
import { Income } from "../models/Income.js";

export const incomeRouter = Router();

// List income entries
incomeRouter.get("/", async (req, res) => {
  try {
    const { taxYear, entity } = req.query;
    const filter: Record<string, unknown> = {};
    if (taxYear) filter.taxYear = Number(taxYear);
    if (entity) filter.entity = String(entity);

    const items = await Income.find(filter).sort({ date: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch income" });
  }
});

// Summary
incomeRouter.get("/summary", async (req, res) => {
  try {
    const { taxYear, entity } = req.query;
    const filter: Record<string, unknown> = {};
    if (taxYear) filter.taxYear = Number(taxYear);
    if (entity) filter.entity = String(entity);

    const items = await Income.find(filter);
    const byType: Record<string, number> = {};
    let total = 0;

    for (const item of items) {
      byType[item.incomeType] = (byType[item.incomeType] || 0) + item.amount;
      total += item.amount;
    }

    res.json({ byType, total });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch income summary" });
  }
});

// Get single
incomeRouter.get("/:id", async (req, res) => {
  try {
    const item = await Income.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Income entry not found" });
      return;
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch income entry" });
  }
});

// Create
incomeRouter.post("/", async (req, res) => {
  try {
    const item = await Income.create(req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: "Failed to create income entry" });
  }
});

// Update
incomeRouter.put("/:id", async (req, res) => {
  try {
    const item = await Income.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) {
      res.status(404).json({ error: "Income entry not found" });
      return;
    }
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: "Failed to update income entry" });
  }
});

// Delete
incomeRouter.delete("/:id", async (req, res) => {
  try {
    const item = await Income.findByIdAndDelete(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Income entry not found" });
      return;
    }
    res.json({ message: "Income entry deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete income entry" });
  }
});
