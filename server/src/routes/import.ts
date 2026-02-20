import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { Transaction, type ITransaction, type Source } from "../models/Transaction.js";
import { parseWestpacRow } from "../parsers/westpac.js";
import { parseIGRow } from "../parsers/ig.js";
import { parseIBKRRow } from "../parsers/ibkr.js";
import { autoAssignCategory } from "../parsers/autoCategory.js";

const upload = multer({ storage: multer.memoryStorage() });

export const importRouter = Router();

importRouter.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const source = req.body.source as Source;

    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    if (!source) {
      res.status(400).json({ error: "Source is required" });
      return;
    }

    const entity = req.body.entity as string | undefined;
    const csvContent = file.buffer.toString("utf-8");
    const sourceFile = file.originalname;

    let transactions: Partial<ITransaction>[];

    switch (source) {
      case "westpac":
        transactions = parseWestpac(csvContent, sourceFile);
        break;
      case "ig":
        transactions = parseIG(csvContent, sourceFile);
        break;
      case "interactive-brokers":
        transactions = parseIBKR(csvContent, sourceFile);
        break;
      default:
        res.status(400).json({ error: `Unknown source: ${source}` });
        return;
    }

    // Stamp entity on all transactions
    if (entity) {
      for (const t of transactions) {
        t.entity = entity;
      }
    }

    // Auto-assign tax categories
    for (const t of transactions) {
      if (!t.taxCategory && t.type && t.description != null && t.amount != null) {
        t.taxCategory = autoAssignCategory(t.type as string, t.description as string, t.amount as number);
      }
    }

    // Bulk insert, skipping duplicates
    let inserted = 0;
    let duplicates = 0;
    const errors: string[] = [];

    try {
      const result = await Transaction.insertMany(transactions, {
        ordered: false,
      });
      inserted = result.length;
      duplicates = transactions.length - inserted;
    } catch (err: unknown) {
      // insertMany with ordered:false throws on duplicate key errors
      // but still inserts the non-duplicate documents
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: number }).code === 11000
      ) {
        const bulkErr = err as { insertedDocs?: unknown[] };
        inserted = bulkErr.insertedDocs?.length ?? 0;
        duplicates = transactions.length - inserted;
      } else {
        throw err;
      }
    }

    // Learn from past assignments: find uncategorised transactions whose
    // description matches a previously categorised transaction, and apply
    // the same category.
    let learned = 0;
    const uncategorised = await Transaction.find({
      $or: [{ taxCategory: null }, { taxCategory: { $exists: false } }],
    }).distinct("description");

    for (const desc of uncategorised) {
      const example = await Transaction.findOne({
        description: desc,
        taxCategory: { $ne: null, $exists: true },
      });
      if (example?.taxCategory) {
        const result = await Transaction.updateMany(
          {
            description: desc,
            $or: [{ taxCategory: null }, { taxCategory: { $exists: false } }],
          },
          { $set: { taxCategory: example.taxCategory } }
        );
        learned += result.modifiedCount;
      }
    }

    res.json({
      total: transactions.length,
      inserted,
      duplicates,
      learned,
      errors,
    });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ error: "Failed to import CSV" });
  }
});

function parseWestpac(
  csvContent: string,
  sourceFile: string
): Partial<ITransaction>[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return (records as Record<string, string>[]).map((row) =>
    parseWestpacRow(row as any, sourceFile)
  );
}

function parseIG(
  csvContent: string,
  sourceFile: string
): Partial<ITransaction>[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return (records as Record<string, string>[]).map((row) =>
    parseIGRow(row as any, sourceFile)
  );
}

function parseIBKR(
  csvContent: string,
  sourceFile: string
): Partial<ITransaction>[] {
  // IBKR CSV has metadata rows before the actual data.
  // Filter to only "Transaction History,Data,..." rows.
  const lines = csvContent.split("\n");
  const headerLine = lines.find((l) =>
    l.startsWith("Transaction History,Header,")
  );
  const dataLines = lines.filter((l) =>
    l.startsWith("Transaction History,Data,")
  );

  if (!headerLine || dataLines.length === 0) {
    return [];
  }

  // Strip the "Transaction History,Header," prefix to get actual column names
  const headerCols = headerLine.replace("Transaction History,Header,", "");
  const csvForParsing = [headerCols, ...dataLines.map((l) =>
    l.replace("Transaction History,Data,", "")
  )].join("\n");

  const records = parse(csvForParsing, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return (records as Record<string, string>[]).map((row) =>
    parseIBKRRow(row as any, sourceFile)
  );
}
