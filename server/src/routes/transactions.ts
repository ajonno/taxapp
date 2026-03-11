import { Router } from "express";
import { Transaction } from "../models/Transaction.js";
import { Filter } from "../models/Filter.js";
import { autoAssignCategory } from "../parsers/autoCategory.js";

export const transactionsRouter = Router();

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Get transactions with filters and pagination
transactionsRouter.get("/", async (req, res) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.taxYear) {
      filter.taxYear = Number(req.query.taxYear);
    }
    if (req.query.type) {
      const types = (req.query.type as string).split(",");
      filter.type = types.length === 1 ? types[0] : { $in: types };
    }
    if (req.query.source) {
      filter.source = req.query.source;
    }
    if (req.query.subType) {
      const subTypes = (req.query.subType as string).split(",");
      filter.subType = subTypes.length === 1 ? subTypes[0] : { $in: subTypes };
    }
    if (req.query.search) {
      filter.description = { $regex: req.query.search, $options: "i" };
    }
    if (req.query.followUp === "true") {
      filter.followUp = true;
    }
    if (req.query.entity) {
      filter.entity = req.query.entity;
    }
    if (req.query.taxCategory === "_none") {
      filter.$or = [{ taxCategory: null }, { taxCategory: { $exists: false } }];
    } else if (req.query.taxCategory) {
      filter.taxCategory = req.query.taxCategory;
    }

    // Apply exclusion filters unless ?filtered=off
    if (req.query.filtered !== "off") {
      const activeFilters = await Filter.find({ active: true });
      if (activeFilters.length > 0) {
        const exclusions = activeFilters.map((f) => {
          const condition: Record<string, unknown> = {
            description: { $regex: escapeRegex(f.pattern), $options: "i" },
          };
          if (f.source !== "all") {
            condition.source = f.source;
          }
          return condition;
        });
        filter.$nor = exclusions;
      }
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [transactions, total, totalAmountAgg, typeCounts] = await Promise.all([
      Transaction.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter),
      Transaction.aggregate([
        { $match: filter },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        { $match: filter },
        { $group: { _id: "$type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const totalAmount = totalAmountAgg[0]?.totalAmount ?? 0;

    res.json({
      transactions,
      totalAmount,
      typeCounts: typeCounts.map((t: { _id: string; count: number }) => ({
        type: t._id,
        count: t.count,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Summary by tax category (for dashboard)
transactionsRouter.get("/meta/category-summary", async (req, res) => {
  try {
    const match: Record<string, unknown> = {};
    if (req.query.taxYear) match.taxYear = Number(req.query.taxYear);
    if (req.query.entity) match.entity = req.query.entity;

    // Apply exclusion filters (same as transactions list)
    const activeFilters = await Filter.find({ active: true });
    if (activeFilters.length > 0) {
      const exclusions = activeFilters.map((f) => {
        const condition: Record<string, unknown> = {
          description: { $regex: escapeRegex(f.pattern), $options: "i" },
        };
        if (f.source !== "all") {
          condition.source = f.source;
        }
        return condition;
      });
      match.$nor = exclusions;
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: "$taxCategory",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 as 1 } },
    ];

    const results = await Transaction.aggregate(pipeline);
    res.json(
      results.map((r: { _id: string | null; total: number; count: number }) => ({
        taxCategory: r._id || null,
        total: r.total,
        count: r.count,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch category summary" });
  }
});

// Get distinct values for filter dropdowns
transactionsRouter.get("/meta/options", async (_req, res) => {
  try {
    const [sources, types, taxYears, subTypes] = await Promise.all([
      Transaction.distinct("source"),
      Transaction.distinct("type"),
      Transaction.distinct("taxYear"),
      Transaction.distinct("subType"),
    ]);
    res.json({
      sources: sources.sort(),
      types: types.sort(),
      subTypes: subTypes.filter(Boolean).sort(),
      taxYears: (taxYears as number[]).sort((a, b) => b - a),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch options" });
  }
});

// Get a single transaction
transactionsRouter.get("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transaction" });
  }
});

// Create a transaction
transactionsRouter.post("/", async (req, res) => {
  try {
    const transaction = await Transaction.create(req.body);
    res.status(201).json(transaction);
  } catch (error) {
    res.status(400).json({ error: "Failed to create transaction" });
  }
});

// Set tax category (applies to all transactions with same description)
transactionsRouter.patch("/:id/category", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    const { taxCategory } = req.body;
    const value = taxCategory || null;
    await Transaction.updateMany(
      { description: transaction.description },
      { $set: { taxCategory: value } }
    );
    transaction.taxCategory = value;
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: "Failed to set tax category" });
  }
});

// Auto-assign tax categories to all unassigned transactions
transactionsRouter.post("/meta/auto-categorise", async (_req, res) => {
  try {
    const unassigned = await Transaction.find({
      $or: [{ taxCategory: null }, { taxCategory: { $exists: false } }],
    });
    let updated = 0;
    for (const t of unassigned) {
      const cat = autoAssignCategory(t.type, t.description, t.amount);
      if (cat) {
        await Transaction.updateMany(
          { description: t.description, $or: [{ taxCategory: null }, { taxCategory: { $exists: false } }] },
          { $set: { taxCategory: cat } }
        );
        updated++;
      }
    }
    res.json({ processed: unassigned.length, updated });
  } catch (error) {
    res.status(500).json({ error: "Failed to auto-categorise" });
  }
});

// Set entity on a transaction (and all with same source + description)
transactionsRouter.patch("/:id/entity", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    const { entity } = req.body;
    const value = entity || null;
    await Transaction.updateMany(
      { source: transaction.source, description: transaction.description },
      { $set: { entity: value } }
    );
    transaction.entity = value;
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: "Failed to set entity" });
  }
});

// Bulk set entity by source
transactionsRouter.post("/meta/bulk-entity", async (req, res) => {
  try {
    const { source, entity } = req.body;
    if (!source || !entity) {
      res.status(400).json({ error: "source and entity are required" });
      return;
    }
    const result = await Transaction.updateMany(
      { source, $or: [{ entity: null }, { entity: { $exists: false } }] },
      { $set: { entity } }
    );
    res.json({ updated: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to bulk set entity" });
  }
});

// Toggle follow-up flag (applies to all transactions with same description)
transactionsRouter.patch("/:id/followup", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    const newValue = !transaction.followUp;
    await Transaction.updateMany(
      { description: transaction.description },
      { $set: { followUp: newValue } }
    );
    transaction.followUp = newValue;
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle follow-up" });
  }
});

// Update a transaction
transactionsRouter.put("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(transaction);
  } catch (error) {
    res.status(400).json({ error: "Failed to update transaction" });
  }
});

// Backfill subType from rawData for existing transactions
transactionsRouter.post("/meta/backfill-subtype", async (_req, res) => {
  try {
    const txns = await Transaction.find({
      subType: { $exists: false },
      "rawData.Transaction Type": { $exists: true },
    });
    let updated = 0;
    for (const t of txns) {
      const raw = t.rawData as Record<string, string> | undefined;
      const val = raw?.["Transaction Type"]?.trim();
      if (val) {
        t.subType = val;
        await t.save();
        updated++;
      }
    }
    res.json({ processed: txns.length, updated });
  } catch (error) {
    res.status(500).json({ error: "Failed to backfill subType" });
  }
});

// Bulk delete transactions matching filters
transactionsRouter.delete("/bulk", async (req, res) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.taxYear) filter.taxYear = Number(req.query.taxYear);
    if (req.query.type) {
      const types = (req.query.type as string).split(",");
      filter.type = types.length === 1 ? types[0] : { $in: types };
    }
    if (req.query.subType) {
      const subTypes = (req.query.subType as string).split(",");
      filter.subType = subTypes.length === 1 ? subTypes[0] : { $in: subTypes };
    }
    if (req.query.source) filter.source = req.query.source;
    if (req.query.search) {
      filter.description = { $regex: req.query.search, $options: "i" };
    }
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.followUp === "true") filter.followUp = true;
    if (req.query.taxCategory === "_none") {
      filter.$or = [{ taxCategory: null }, { taxCategory: { $exists: false } }];
    } else if (req.query.taxCategory) {
      filter.taxCategory = req.query.taxCategory;
    }

    // Apply exclusion filters unless ?filtered=off
    if (req.query.filtered !== "off") {
      const activeFilters = await Filter.find({ active: true });
      if (activeFilters.length > 0) {
        const exclusions = activeFilters.map((f) => {
          const condition: Record<string, unknown> = {
            description: { $regex: escapeRegex(f.pattern), $options: "i" },
          };
          if (f.source !== "all") condition.source = f.source;
          return condition;
        });
        filter.$nor = exclusions;
      }
    }

    const result = await Transaction.deleteMany(filter);
    res.json({ deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to bulk delete transactions" });
  }
});

// Delete a transaction
transactionsRouter.delete("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndDelete(req.params.id);
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json({ message: "Transaction deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});
