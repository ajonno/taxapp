import { Router } from "express";
import { Income } from "../models/Income.js";
import { userId } from "../auth/middleware.js";

export const incomeRouter = Router();

incomeRouter.get("/", async (req, res) => {
  try {
    const { taxYear, entity } = req.query;
    const filter: Record<string, unknown> = { userId: userId(req) };
    if (taxYear) filter.taxYear = Number(taxYear);
    if (entity) filter.entity = String(entity);

    const items = await Income.find(filter).sort({ date: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch income" });
  }
});

incomeRouter.get("/summary", async (req, res) => {
  try {
    const { taxYear, entity } = req.query;
    const filter: Record<string, unknown> = { userId: userId(req) };
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

incomeRouter.get("/:id", async (req, res) => {
  try {
    const item = await Income.findOne({ _id: req.params.id, userId: userId(req) });
    if (!item) {
      res.status(404).json({ error: "Income entry not found" });
      return;
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch income entry" });
  }
});

incomeRouter.post("/", async (req, res) => {
  try {
    const item = await Income.create({ ...req.body, userId: userId(req) });
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: "Failed to create income entry" });
  }
});

incomeRouter.put("/:id", async (req, res) => {
  try {
    const item = await Income.findOneAndUpdate(
      { _id: req.params.id, userId: userId(req) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!item) {
      res.status(404).json({ error: "Income entry not found" });
      return;
    }
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: "Failed to update income entry" });
  }
});

incomeRouter.delete("/:id", async (req, res) => {
  try {
    const item = await Income.findOneAndDelete({ _id: req.params.id, userId: userId(req) });
    if (!item) {
      res.status(404).json({ error: "Income entry not found" });
      return;
    }
    res.json({ message: "Income entry deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete income entry" });
  }
});
