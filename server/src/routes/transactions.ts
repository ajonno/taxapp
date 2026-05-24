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
// only utility endpoint that's exempt is /meta/options — the year/entity
// selector itself needs the full list of years that exist in the DB to
// render. Everything else (category-summary, receipts, receipts-zip)
// must respect the guest's scope.
const isMetaExempt = (path: string) => path === "/meta/options";
transactionsRouter.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (isMetaExempt(req.path)) return next();
  return enforceTaxYearScope(req, res, next);
});
transactionsRouter.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (isMetaExempt(req.path)) return next();
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

    // Build a parallel set of aggregations that only count transactions
    // which have at least one attachment. Used to drive the "Download
    // Receipts" button on the Dashboard.
    const attachedLookupStage = {
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
          { $limit: 1 },
        ],
        as: "_att",
      },
    };
    const onlyAttached = { $match: { _att: { $ne: [] } } };

    const attachedTotalPipeline = [
      { $match: match },
      attachedLookupStage,
      onlyAttached,
      {
        $group: {
          _id: "$taxCategory",
          attachedCount: { $sum: 1 },
        },
      },
    ];

    const attachedSubTypePipeline = [
      { $match: match },
      attachedLookupStage,
      onlyAttached,
      {
        $group: {
          _id: {
            taxCategory: "$taxCategory",
            subType: { $ifNull: ["$subType", ""] },
          },
          attachedCount: { $sum: 1 },
        },
      },
    ];

    const attachedDescriptionPipeline = [
      { $match: match },
      attachedLookupStage,
      onlyAttached,
      {
        $group: {
          _id: {
            taxCategory: "$taxCategory",
            description: { $ifNull: ["$description", ""] },
          },
          attachedCount: { $sum: 1 },
        },
      },
    ];

    const [
      results,
      subTypeResults,
      descriptionResults,
      attachedTotalResults,
      attachedSubTypeResults,
      attachedDescriptionResults,
    ] = await Promise.all([
      Transaction.aggregate(pipeline),
      Transaction.aggregate(subTypePipeline),
      Transaction.aggregate(descriptionPipeline),
      Transaction.aggregate(attachedTotalPipeline),
      Transaction.aggregate(attachedSubTypePipeline),
      Transaction.aggregate(attachedDescriptionPipeline),
    ]);

    const attachedByCategory = new Map<string, number>();
    attachedTotalResults.forEach(
      (r: { _id: string | null; attachedCount: number }) => {
        if (r._id) attachedByCategory.set(r._id, r.attachedCount);
      },
    );
    const attachedBySubType = new Map<string, number>();
    attachedSubTypeResults.forEach(
      (r: {
        _id: { taxCategory: string | null; subType: string };
        attachedCount: number;
      }) => {
        if (!r._id.taxCategory) return;
        attachedBySubType.set(
          `${r._id.taxCategory}::${r._id.subType || ""}`,
          r.attachedCount,
        );
      },
    );
    const attachedByDescription = new Map<string, number>();
    attachedDescriptionResults.forEach(
      (r: {
        _id: { taxCategory: string | null; description: string };
        attachedCount: number;
      }) => {
        if (!r._id.taxCategory) return;
        attachedByDescription.set(
          `${r._id.taxCategory}::${r._id.description || ""}`,
          r.attachedCount,
        );
      },
    );

    const subTypesByCategory = new Map<string, {
      subType: string
      total: number
      claimTotal: number
      count: number
      attachedCount: number
    }[]>()

    const descriptionsByCategory = new Map<string, {
      description: string
      total: number
      claimTotal: number
      count: number
      attachedCount: number
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
        attachedCount:
          attachedBySubType.get(`${r._id.taxCategory}::${r._id.subType || ""}`) || 0,
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
        attachedCount:
          attachedByDescription.get(
            `${r._id.taxCategory}::${r._id.description || ""}`,
          ) || 0,
      });
      descriptionsByCategory.set(r._id.taxCategory, rows);
    });

    res.json(
      results.map((r: { _id: string | null; total: number; claimTotal: number; count: number }) => ({
        taxCategory: r._id || null,
        total: r.total,
        claimTotal: r.claimTotal,
        count: r.count,
        attachedCount: r._id ? attachedByCategory.get(r._id) || 0 : 0,
        subTypes: r._id ? subTypesByCategory.get(r._id) || [] : [],
        descriptions: r._id ? descriptionsByCategory.get(r._id) || [] : [],
      }))
    );
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch category summary" });
  }
});

/**
 * GET /api/transactions/meta/receipts
 * Returns attachment metadata for every transaction matching the given
 * filter (same shape as the main transactions query but read-only and
 * limited to attached docs). Used by the Dashboard's "Download Receipts"
 * button so the browser can open each Drive URL.
 *
 * Query params: taxYear, entity, taxCategory, subType, description.
 *   - subType=_none → transactions whose subType is null/missing
 *   - description=Unspecified → same idea (description is null/missing)
 */
transactionsRouter.get("/meta/receipts", async (req, res) => {
  try {
    const match: Record<string, unknown> = { userId: userId(req) };
    if (req.query.taxYear) match.taxYear = Number(req.query.taxYear);
    if (req.query.entity) match.entity = req.query.entity;
    if (req.query.taxCategory) match.taxCategory = req.query.taxCategory;
    if (req.query.subType) {
      const v = String(req.query.subType);
      if (v === "_none" || v === "Unspecified") {
        match.$or = [{ subType: null }, { subType: { $exists: false } }];
      } else {
        match.subType = v;
      }
    }
    if (req.query.description) {
      const v = String(req.query.description);
      if (v === "Unspecified") {
        match.$or = [{ description: null }, { description: { $exists: false } }];
      } else {
        match.description = v;
      }
    }

    // Honor active exclusion filters so this stays consistent with the
    // dashboard summary numbers.
    const activeFilters = await Filter.find({
      userId: userId(req),
      active: true,
    });
    if (activeFilters.length > 0) {
      const exclusions = activeFilters.map((f) => {
        const cond: Record<string, unknown> = {
          description: { $regex: escapeRegex(f.pattern), $options: "i" },
        };
        if (f.source !== "all") cond.source = f.source;
        return cond;
      });
      match.$nor = exclusions;
    }

    const rows = await Transaction.aggregate([
      { $match: match },
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
            {
              $project: {
                _id: 1,
                originalName: 1,
                driveFileId: 1,
                driveWebViewLink: 1,
                filePath: 1,
              },
            },
          ],
          as: "attachments",
        },
      },
      { $match: { attachments: { $ne: [] } } },
      {
        $project: {
          _id: 1,
          date: 1,
          amount: 1,
          description: 1,
          attachments: 1,
        },
      },
    ]);

    // Flatten to a single list of { txId, originalName, driveFileId, driveWebViewLink }
    const out: Array<{
      txId: string;
      attachmentId: string;
      originalName: string;
      driveFileId?: string;
      driveWebViewLink?: string;
      filePath?: string;
    }> = [];
    type Att = {
      _id: { toString: () => string };
      originalName?: string;
      driveFileId?: string;
      driveWebViewLink?: string;
      filePath?: string;
    };
    type Tx = { _id: { toString: () => string }; attachments: Att[] };
    for (const r of rows as Tx[]) {
      for (const a of r.attachments || []) {
        out.push({
          txId: r._id.toString(),
          attachmentId: a._id.toString(),
          originalName: a.originalName || "attachment",
          driveFileId: a.driveFileId,
          driveWebViewLink: a.driveWebViewLink,
          filePath: a.filePath,
        });
      }
    }
    res.json({ count: out.length, attachments: out });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/transactions/meta/receipts-zip
 * Bundles every receipt matching the filter into one streaming ZIP.
 * Bypasses Chrome's multi-download warning entirely — the browser sees a
 * single download.
 *
 * Drive files are anyone-with-link viewable (the app auto-shares them on
 * attach), so the server can pull each one without any credentials —
 * just a plain GET to drive.google.com/uc?export=download&id=<id>.
 *
 * Same query params as /meta/receipts.
 */
transactionsRouter.get("/meta/receipts-zip", async (req, res) => {
  try {
    // Re-use the same filter logic as /meta/receipts.
    const match: Record<string, unknown> = { userId: userId(req) };
    if (req.query.taxYear) match.taxYear = Number(req.query.taxYear);
    if (req.query.entity) match.entity = req.query.entity;
    if (req.query.taxCategory) match.taxCategory = req.query.taxCategory;
    if (req.query.subType) {
      const v = String(req.query.subType);
      if (v === "_none" || v === "Unspecified") {
        match.$or = [{ subType: null }, { subType: { $exists: false } }];
      } else {
        match.subType = v;
      }
    }
    if (req.query.description) {
      const v = String(req.query.description);
      if (v === "Unspecified") {
        match.$or = [
          { description: null },
          { description: { $exists: false } },
        ];
      } else {
        match.description = v;
      }
    }
    const activeFilters = await Filter.find({
      userId: userId(req),
      active: true,
    });
    if (activeFilters.length > 0) {
      const exclusions = activeFilters.map((f) => {
        const cond: Record<string, unknown> = {
          description: { $regex: escapeRegex(f.pattern), $options: "i" },
        };
        if (f.source !== "all") cond.source = f.source;
        return cond;
      });
      match.$nor = exclusions;
    }

    const rows = await Transaction.aggregate([
      { $match: match },
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
            {
              $project: {
                originalName: 1,
                driveFileId: 1,
              },
            },
          ],
          as: "attachments",
        },
      },
      { $match: { attachments: { $ne: [] } } },
      { $project: { attachments: 1 } },
    ]);

    // Flatten to a unique list keyed by driveFileId (avoid duplicates if
    // the same file is attached to multiple tx).
    const seen = new Set<string>();
    const files: Array<{ driveFileId: string; name: string }> = [];
    type Att = { originalName?: string; driveFileId?: string };
    for (const r of rows as Array<{ attachments: Att[] }>) {
      for (const a of r.attachments || []) {
        if (!a.driveFileId) continue;
        if (seen.has(a.driveFileId)) continue;
        seen.add(a.driveFileId);
        files.push({ driveFileId: a.driveFileId, name: a.originalName || "attachment" });
      }
    }

    if (files.length === 0) {
      res.status(404).json({ error: "No Drive-backed receipts to download" });
      return;
    }

    // Stream the ZIP straight out to the client as files arrive from Drive.
    // Why streaming: a 100+ file ZIP can take 30-60s end-to-end, which both
    //   (a) trips nginx's upstream read timeout, and
    //   (b) needs us to hold every Drive buffer in memory at once.
    // Streaming sends the response headers immediately (so the browser shows
    // the save dialog right away) then writes ZIP entries to the response
    // as each Drive fetch completes — connection stays alive, RSS stays low.
    const stamp = new Date().toISOString().slice(0, 10);
    const filterLabel =
      (req.query.subType as string) ||
      (req.query.description as string) ||
      (req.query.taxCategory as string) ||
      "receipts";
    const safeLabel = filterLabel
      .replace(/[^a-z0-9_-]+/gi, "_")
      .slice(0, 60);

    // archiver v8 is pure ESM and exports `ZipArchive` as a named class —
    // there is no default export, so `import archiver from "archiver"` and
    // `require("archiver")` both return objects rather than a factory.
    // Use the named class directly.
    interface ArchiveInstance {
      pipe: (dest: NodeJS.WritableStream) => unknown;
      append: (data: Buffer, opts: { name: string }) => unknown;
      finalize: () => Promise<void>;
      on: (event: string, cb: (err: Error) => void) => unknown;
    }
    type ZipArchiveCtor = new (opts?: {
      zlib?: { level?: number };
      store?: boolean;
    }) => ArchiveInstance;
    const archiverMod = (await import("archiver")) as unknown as {
      ZipArchive: ZipArchiveCtor;
    };
    const ZipArchive = archiverMod.ZipArchive;

    // Track filename collisions inside the zip.
    const usedNames = new Set<string>();
    function uniqueName(name: string) {
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let n = 2;
      while (usedNames.has(`${base} (${n})${ext}`)) n++;
      const out = `${base} (${n})${ext}`;
      usedNames.add(out);
      return out;
    }

    // Send headers FIRST so the browser opens the save dialog and nginx
    // commits to streaming the response (headers already on the wire).
    // X-Accel-Buffering: no tells nginx not to buffer — pass bytes through
    // as soon as we write them.
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Receipts_${safeLabel}_${stamp}.zip"`,
    );
    res.setHeader("X-Accel-Buffering", "no");

    // store: true → no compression. Receipts are already-compressed PDFs/JPEGs,
    // so compressing again wastes CPU for ~0% gain.
    const archive = new ZipArchive({ store: true });
    archive.on("error", (err: Error) => {
      console.error("archiver error:", err);
      try { res.end(); } catch { /* already closed */ }
    });
    archive.pipe(res);

    // Fetch files in parallel batches and append each as it arrives. The
    // archive stream forwards every appended entry straight to the client.
    const CONCURRENCY = 20;
    async function fetchOne(f: { driveFileId: string; name: string }) {
      const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(f.driveFileId)}&confirm=t`;
      try {
        const r = await fetch(url, { redirect: "follow" });
        if (!r.ok) {
          console.warn(`Skip ${f.driveFileId}: HTTP ${r.status}`);
          return null;
        }
        const buf = Buffer.from(await r.arrayBuffer());
        return { name: f.name, buf };
      } catch (err) {
        console.warn(`Skip ${f.driveFileId}:`, (err as Error).message);
        return null;
      }
    }
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(fetchOne));
      for (const r of results) {
        if (!r) continue;
        archive.append(r.buf, { name: uniqueName(r.name) });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("receipts-zip failed", err);
    try {
      res.status(500).json({ error: (err as Error).message });
    } catch {
      /* already streamed */
    }
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

/**
 * Update a single transaction's expensePercent. Unlike category / entity,
 * this is intentionally per-row only — does NOT cascade to other tx with
 * the same description.
 */
transactionsRouter.patch("/:id/expense-percent", async (req, res) => {
  try {
    const uid = userId(req);
    const { expensePercent } = req.body as { expensePercent: unknown };
    const value =
      expensePercent === null || expensePercent === ""
        ? null
        : Number(expensePercent);
    if (value !== null && (isNaN(value) || value < 0 || value > 100)) {
      res
        .status(400)
        .json({ error: "expensePercent must be a number between 0 and 100" });
      return;
    }
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: uid },
      { $set: { expensePercent: value } },
      { new: true, runValidators: true },
    );
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(transaction);
  } catch {
    res.status(500).json({ error: "Failed to update expense percent" });
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
