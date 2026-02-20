import { Router } from "express";
import { TaxCategory } from "../models/TaxCategory.js";

export const taxCategoriesRouter = Router();

const SEED_CATEGORIES = [
  // ATO Income items
  { code: "I1", name: "Salary or wages", type: "income" },
  { code: "I2", name: "Allowances, earnings, tips, director's fees", type: "income" },
  { code: "I3", name: "Employer lump sum payments", type: "income" },
  { code: "I5", name: "Australian Government allowances and payments", type: "income" },
  { code: "I10A", name: "Interest income", type: "income" },
  { code: "I10B", name: "Dividends", type: "income" },
  { code: "I12", name: "Capital gains", type: "income" },
  { code: "I13", name: "Foreign source income", type: "income" },
  { code: "I14", name: "Rental income", type: "income" },
  { code: "I17", name: "Other income", type: "income" },

  // ATO Deduction items (D1–D10)
  { code: "D1", name: "Work-related car expenses", type: "deduction" },
  { code: "D2", name: "Work-related travel expenses", type: "deduction" },
  { code: "D3", name: "Work-related clothing, laundry and dry-cleaning", type: "deduction" },
  { code: "D4", name: "Work-related self-education expenses", type: "deduction" },
  { code: "D5", name: "Other work-related expenses", type: "deduction" },
  { code: "D6", name: "Low value pool deduction", type: "deduction" },
  { code: "D7", name: "Interest deductions", type: "deduction" },
  { code: "D8", name: "Dividend deductions", type: "deduction" },
  { code: "D9", name: "Gifts or donations", type: "deduction" },
  { code: "D10", name: "Cost of managing tax affairs", type: "deduction" },
];

// Seed categories (idempotent — skips existing codes)
taxCategoriesRouter.post("/seed", async (_req, res) => {
  try {
    let inserted = 0;
    for (const cat of SEED_CATEGORIES) {
      const exists = await TaxCategory.findOne({ code: cat.code });
      if (!exists) {
        await TaxCategory.create(cat);
        inserted++;
      }
    }
    res.json({ inserted, total: SEED_CATEGORIES.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to seed categories" });
  }
});

// Get all categories
taxCategoriesRouter.get("/", async (_req, res) => {
  try {
    const categories = await TaxCategory.find({ active: true }).sort({ type: 1, code: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Create a category
taxCategoriesRouter.post("/", async (req, res) => {
  try {
    const category = await TaxCategory.create(req.body);
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ error: "Failed to create category" });
  }
});

// Update a category
taxCategoriesRouter.put("/:id", async (req, res) => {
  try {
    const category = await TaxCategory.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(category);
  } catch (error) {
    res.status(400).json({ error: "Failed to update category" });
  }
});

// Delete a category
taxCategoriesRouter.delete("/:id", async (req, res) => {
  try {
    const category = await TaxCategory.findByIdAndDelete(req.params.id);
    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete category" });
  }
});
