import { ITransaction, TransactionType } from "../models/Transaction.js";
import { getTaxYear, parseAmount } from "./utils.js";

interface IGRow {
  TextDate: string;
  Summary: string;
  MarketName: string;
  Period: string;
  ProfitAndLoss: string;
  "Transaction type": string;
  Reference: string;
  "Open level": string;
  "Close level": string;
  Size: string;
  Currency: string;
  "PL Amount": string;
  "Cash transaction": string;
  DateUtc: string;
  OpenDateUtc: string;
  CurrencyIsoCode: string;
}

function classifyIG(row: IGRow): TransactionType {
  const summary = (row.Summary || "").toLowerCase();
  const market = (row.MarketName || "").toLowerCase();

  if (
    market.includes("fee") ||
    summary.includes("fee") ||
    summary.includes("commission") ||
    market.includes("gst") ||
    market.includes("commission")
  )
    return "fee-trading";
  if (summary.includes("dividend")) return "dividend-trading";
  if (summary.includes("cash in") || summary.includes("cash out"))
    return "cash-transfer-trading";
  if (summary === "client consideration") return "trading";
  // Withdrawals/deposits that aren't cash transfers
  if (row["Transaction type"] === "WITH" || row["Transaction type"] === "DEPO")
    return "cash-transfer-trading";
  return "trading";
}

function extractSymbolFromMarket(marketName: string): string | undefined {
  // Try to extract a clean instrument name (before "(All Sessions)" etc.)
  const match = marketName.match(/^(.+?)(?:\s*\()/);
  return match ? match[1].trim() : marketName.trim() || undefined;
}

function parseSide(
  row: IGRow
): "buy" | "sell" | undefined {
  const amount = parseAmount(row["PL Amount"]);
  const summary = (row.Summary || "").toLowerCase();
  if (summary !== "client consideration") return undefined;
  // For client consideration: negative = buy, positive = sell
  return amount < 0 ? "buy" : "sell";
}

export function parseIGRow(
  row: IGRow,
  sourceFile: string
): Partial<ITransaction> {
  const date = row.DateUtc ? new Date(row.DateUtc) : new Date();
  const amount = parseAmount(row["PL Amount"]);
  const type = classifyIG(row);
  const side = parseSide(row);

  const direction =
    type === "cash-transfer-trading"
      ? amount >= 0
        ? "in"
        : "out"
      : undefined;

  // Parse quantity from Size field
  const sizeRaw = row.Size?.trim();
  const quantity =
    sizeRaw && sizeRaw !== "-" && sizeRaw !== "0"
      ? Math.abs(parseFloat(sizeRaw))
      : undefined;

  const feeType =
    type === "fee-trading"
      ? row.MarketName?.replace(/Converted at.*$/, "").trim()
      : undefined;

  return {
    type,
    source: "ig",
    sourceReference: row.Reference?.trim(),
    date,
    taxYear: getTaxYear(date),
    amount,
    currency: row.CurrencyIsoCode?.trim() || "AUD",
    originalAmount: amount,
    exchangeRate: null,
    description: [row.Summary, row.MarketName].filter(Boolean).join(" - ").trim(),
    marketName: extractSymbolFromMarket(row.MarketName || ""),
    side,
    quantity,
    direction,
    feeType,
    importedAt: new Date(),
    sourceFile,
    rawData: { ...row },
  };
}
