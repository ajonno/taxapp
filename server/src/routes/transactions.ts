import { Router } from "express";
import type { Request } from "express";
import { Transaction } from "../models/Transaction.js";
import { Filter } from "../models/Filter.js";
import { SubType } from "../models/SubType.js";
import { autoAssignCategory } from "../parsers/autoCategory.js";
import {
  userId,
  requireOwner,
  enforceTaxYearScope,
  enforceEntityScope,
} from "../auth/middleware.js";

export const transactionsRouter = Router();

// Guests get read-only access. Any non-GET method requires owner role.
transactionsRouter.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  return requireOwner(req, res, next);
});

// On reads, restrict guests to their allowed tax years + entities. The
// /meta/* utility endpoints don't filter by tax year (the year selector
// needs the full list of years that exist in the DB), so skip them.
transactionsRouter.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/meta")) return next();
  return enforceTaxYearScope(req, res, next);
});
transactionsRouter.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/meta")) return next();
  return enforceEntityScope(req, res, next);
});

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function claimTotalExpression() {
  return {
    $multiply: [
      "$amount",
      { $divide: [{ $ifNull: ["$expensePercent", 100] }, 100] },
    ],
  };
}

// Shared filter builder used by GET, bulk delete, and bulk expense-percent
async function buildFilter(req: Request) {
  const query = req.query as Record<string, unknown>;
  const filter: Record<string, unknown> = { userId: userId(req) };
  if (query.taxYear) filter.taxYear = Number(query.taxYear);
  if (query.type) {
    const types = (query.type as string).split(",");
    filter.type = types.length === 1 ? types[0] : { $in: types };
  }
  if (query.source) filter.source = query.source;
  if (query.subType) {
    const subTypes = (query.subType as string).split(",");
    // "_none" is a magic value used by the Dashboard's "Unspecified" sub-row
    // click-through to find transactions whose subType is null/missing.
    if (subTypes.length === 1 && subTypes[0] === "_none") {
      filter.$and = ([] as Record<string, unknown>[]).concat(
        (filter.$and as Record<string, unknown>[]) || [],
        [{ $or: [{ subType: null }, { subType: { $exists: false } }] }],
      );
    } else {
      filter.subType = subTypes.length === 1 ? subTypes[0] : { $in: subTypes };
    }
  }
  if (query.search) {
    filter.description = { $regex: query.search, $options: "i" };
  }
  if (query.followUp === "true") filter.followUp = true;
  if (query.entity) filter.entity = query.entity;
  if (query.taxCategory === "_none") {
    filter.$or = [{ taxCategory: null }, { taxCategory: { $exists: false } }];
  } else if (query.taxCategory) {
    filter.taxCategory = query.taxCategory;
  }

  if (query.filtered !== "off") {
    const activeFilters = await Filter.find({ userId: userId(req), active: true });
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

  return filter;
}

// Get transactions with filters and pagination
transactionsRouter.get("/", async (req, res) => {
  try {
    const filter = await buildFilter(req);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [transactions, total, totalAmountAgg, typeCounts, totalNetAgg] = await Promise.all([
      Transaction.aggregate([
        { $match: filter },
        { $sort: { date: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "attachments",
            let: { txId: { $toString: "$_id" } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$parentId", "$$txId"] },
                      { $eq: ["$parentType", "transaction"] },
                    ],
                  },
                },
              },
              { $count: "count" },
            ],
            as: "_attachmentMeta",
          },
        },
        {
          $addFields: {
            attachmentCount: {
              $ifNull: [{ $arrayElemAt: ["$_attachmentMeta.count", 0] }, 0],
            },
          },
        },
        { $unset: "_attachmentMeta" },
      ]),
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
      Transaction.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalNet: {
              $sum: {
                $cond: [
                  { $ne: ["$expensePercent", null] },
                  { $multiply: ["$amount", { $divide: ["$expensePercent", 100] }] },
                  "$amount",
                ],
              },
            },
          },
        },
      ]),
    ]);

    const totalAmount = totalAmountAgg[0]?.totalAmount ?? 0;
    const totalNetAmount = totalNetAgg[0]?.totalNet ?? totalAmount;

    res.json({
      transactions,
      totalAmount,
      totalNetAmount,
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

// Download filtered transactions as CSV (no pagination)
transactionsRouter.get("/export/csv", async (req, res) => {
  try {
    const filter = await buildFilter(req);
    const transactions = await Transaction.find(filter).sort({ date: -1 }).lean();

    const headers = ["Date", "Type", "Sub Type", "Source", "Description", "Amount", "Expense %", "Net", "Tax Category", "Entity"];
    const rows = transactions.map((t) => {
      const pct = t.expensePercent ?? 100;
      const net = t.amount * pct / 100;
      return [
        new Date(t.date).toLocaleDateString("en-AU"),
        t.type,
        t.subType || "",
        t.source,
        `"${(t.description || "").replace(/"/g, '""')}"`,
        t.amount.toFixed(2),
        String(pct),
        net.toFixed(2),
        t.taxCategory || "",
        t.entity || "",
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="transactions.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: "Failed to export transactions" });
  }
});

// Summary by tax category (for dashboard)
transactionsRouter.get("/meta/category-summary", async (req, res) => {
  try {
    const match: Record<string, unknown> = { userId: userId(req) };
    if (req.query.taxYear) match.taxYear = Number(req.query.taxYear);
    if (req.query.entity) match.entity = req.query.entity;

    // Apply exclusion filters (same as transactions list)
    const activeFilters = await Filter.find({ userId: userId(req), active: true });
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
          claimTotal: {
            $sum: claimTotalExpression(),
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 as 1 } },
    ];

    const subTypePipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            taxCategory: "$taxCategory",
            subType: { $ifNull: ["$subType", ""] },
          },
          total: { $sum: "$amount" },
          claimTotal: {
            $sum: claimTotalExpression(),
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.taxCategory": 1 as 1, claimTotal: 1 as 1, total: 1 as 1 } },
    ];

    const descriptionPipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            taxCategory: "$taxCategory",
            description: { $ifNull: ["$description", ""] },
          },
          total: { $sum: "$amount" },
          claimTotal: {
            $sum: claimTotalExpression(),
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.taxCategory": 1 as 1, claimTotal: 1 as 1, total: 1 as 1 } },
    ];

    const [results, subTypeResults, descriptionResults] = await Promise.all([
      Transaction.aggregate(pipeline),
      Transaction.aggregate(subTypePipeline),
      Transaction.aggregate(descriptionPipeline),
    ]);

    const subTypesByCategory = new Map<string, {
      subType: string
      total: number
      claimTotal: number
      count: number
    }[]>()

    const descriptionsByCategory = new Map<string, {
      description: string
      total: number
      claimTotal: number
      count: number
    }[]>()

    subTypeResults.forEach((r: {
      _id: { taxCategory: string | null; subType: string };
      total: number;
      claimTotal: number;
      count: number;
    }) => {
      if (!r._id.taxCategory) return;
      const rows = subTypesByCategory.get(r._id.taxCategory) || [];
      rows.push({
        subType: r._id.subType || "Unspecified",
        total: r.total,
        claimTotal: r.claimTotal,
        count: r.count,
      });
      subTypesByCategory.set(r._id.taxCategory, rows);
    });

    descriptionResults.forEach((r: {
      _id: { taxCategory: string | null; description: string };
      total: number;
      claimTotal: number;
      count: number;
    }) => {
      if (!r._id.taxCategory) return;
      const rows = descriptionsByCategory.get(r._id.taxCategory) || [];
      rows.push({
        description: r._id.description || "Unspecified",
        total: r.total,
        claimTotal: r.claimTotal,
        count: r.count,
      });
      descriptionsByCategory.set(r._id.taxCategory, rows);
    });

    res.json(
      results.map((r: { _id: string | null; total: number; claimTotal: number; count: number }) => ({
        taxCategory: r._id || null,
        total: r.total,
        claimTotal: r.claimTotal,
        count: r.count,
        subTypes: r._id ? subTypesByCategory.get(r._id) || [] : [],
        descriptions: r._id ? descriptionsByCategory.get(r._id) || [] : [],
      }))
    );
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch category summary" });
  }
});

// Get distinct values for filter dropdowns
transactionsRouter.get("/meta/options", async (req, res) => {
  try {
    const uid = userId(req);
    const [sources, types, taxYears, subTypes, savedSubTypes] = await Promise.all([
      Transaction.distinct("source", { userId: uid }),
      Transaction.distinct("type", { userId: uid }),
      Transaction.distinct("taxYear", { userId: uid }),
      Transaction.distinct("subType", { userId: uid }),
      SubType.distinct("label", { userId: uid }),
    ]);

    const mergedSubTypes = Array.from(
      new Set(
        [...(subTypes as string[]), ...(savedSubTypes as string[])]
          .filter(Boolean)
          .map((value) => value.trim())
      )
    ).sort((a, b) => a.localeCompare(b));

    res.json({
      sources: sources.sort(),
      types: types.sort(),
      subTypes: mergedSubTypes,
      taxYears: (taxYears as number[]).sort((a, b) => b - a),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch options" });
  }
});

// Get a single transaction
transactionsRouter.get("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: userId(req) });
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
    const transaction = await Transaction.create({ ...req.body, userId: userId(req) });
    res.status(201).json(transaction);
  } catch (error) {
    res.status(400).json({ error: "Failed to create transaction" });
  }
});

// Set tax category (applies to all transactions with same description)
transactionsRouter.patch("/:id/category", async (req, res) => {
  try {
    const uid = userId(req);
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: uid });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    const { taxCategory } = req.body;
    const value = taxCategory || null;
    await Transaction.updateMany(
      { userId: uid, description: transaction.description },
      { $set: { taxCategory: value } }
    );
    transaction.taxCategory = value;
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: "Failed to set tax category" });
  }
});

// Update description on a single transaction
transactionsRouter.patch("/:id/description", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: userId(req) });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    const description = String(req.body.description ?? "").trim();
    if (!description) {
      res.status(400).json({ error: "description is required" });
      return;
    }

    transaction.description = description;
    await transaction.save();
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: "Failed to update description" });
  }
});

// Set sub-type on a single transaction
transactionsRouter.patch("/:id/subtype", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: userId(req) });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    const subTypeValue = typeof req.body.subType === "string"
      ? req.body.subType.trim()
      : "";

    if (subTypeValue) transaction.subType = subTypeValue;
    else transaction.subType = undefined;

    await transaction.save();
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: "Failed to set sub-type" });
  }
});

// Auto-assign tax categories to all unassigned transactions
transactionsRouter.post("/meta/auto-categorise", async (req, res) => {
  try {
    const uid = userId(req);
    const unassigned = await Transaction.find({
      userId: uid,
      $or: [{ taxCategory: null }, { taxCategory: { $exists: false } }],
    });
    let updated = 0;
    for (const t of unassigned) {
      const cat = autoAssignCategory(t.type, t.description, t.amount);
      if (cat) {
        await Transaction.updateMany(
          { userId: uid, description: t.description, $or: [{ taxCategory: null }, { taxCategory: { $exists: false } }] },
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
    const uid = userId(req);
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: uid });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    const { entity } = req.body;
    const value = entity || null;
    await Transaction.updateMany(
      { userId: uid, source: transaction.source, description: transaction.description },
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
      { userId: userId(req), source, $or: [{ entity: null }, { entity: { $exists: false } }] },
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
    const uid = userId(req);
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: uid });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    const newValue = !transaction.followUp;
    await Transaction.updateMany(
      { userId: uid, description: transaction.description },
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
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: userId(req) },
      req.body,
      { new: true, runValidators: true }
    );
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
transactionsRouter.post("/meta/backfill-subtype", async (req, res) => {
  try {
    const txns = await Transaction.find({
      userId: userId(req),
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

// Bulk set expense percent on transactions matching current filters
transactionsRouter.patch("/bulk/expense-percent", async (req, res) => {
  try {
    const filter = await buildFilter(req);
    const { expensePercent } = req.body;
    const value = expensePercent === null || expensePercent === "" ? null : Number(expensePercent);
    if (value !== null && (isNaN(value) || value < 0 || value > 100)) {
      res.status(400).json({ error: "expensePercent must be between 0 and 100" });
      return;
    }
    const result = await Transaction.updateMany(filter, { $set: { expensePercent: value } });
    res.json({ updated: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to set expense percent" });
  }
});

// Bulk delete transactions matching filters
transactionsRouter.delete("/bulk", async (req, res) => {
  try {
    const filter = await buildFilter(req);

    const result = await Transaction.deleteMany(filter);
    res.json({ deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to bulk delete transactions" });
  }
});

// Delete a transaction
transactionsRouter.delete("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({ _id: req.params.id, userId: userId(req) });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json({ message: "Transaction deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});
