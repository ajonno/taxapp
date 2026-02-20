import { ITransaction, TransactionType } from "../models/Transaction.js";
import { getTaxYear, parseAmount } from "./utils.js";

// ---- Old CFD/Spread-bet format ----

interface IGCFDRow {
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

function classifyCFD(row: IGCFDRow): TransactionType {
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
  if (row["Transaction type"] === "WITH" || row["Transaction type"] === "DEPO")
    return "cash-transfer-trading";
  return "trading";
}

function extractSymbolFromMarket(marketName: string): string | undefined {
  const match = marketName.match(/^(.+?)(?:\s*\()/);
  return match ? match[1].trim() : marketName.trim() || undefined;
}

function parseSideCFD(row: IGCFDRow): "buy" | "sell" | undefined {
  const amount = parseAmount(row["PL Amount"]);
  const summary = (row.Summary || "").toLowerCase();
  if (summary !== "client consideration") return undefined;
  return amount < 0 ? "buy" : "sell";
}

export function parseIGCFDRow(
  row: IGCFDRow,
  sourceFile: string
): Partial<ITransaction> {
  const date = row.DateUtc ? new Date(row.DateUtc) : new Date();
  const amount = parseAmount(row["PL Amount"]);
  const type = classifyCFD(row);
  const side = parseSideCFD(row);

  const direction =
    type === "cash-transfer-trading"
      ? amount >= 0
        ? "in"
        : "out"
      : undefined;

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

// ---- Trade History (share dealing) format ----

interface IGTradeRow {
  TextDate: string;
  Time: string;
  Activity: string;
  Market: string;
  Direction: string;
  Quantity: string;
  Price: string;
  Currency: string;
  Consideration: string;
  Commission: string;
  Charges: string;
  "Cost/Proceeds": string;
  "Conversion rate": string;
  "Order type": string;
  "Venue ID": string;
  "Settled?": string;
  "Settlement date": string;
  "Order ID": string;
}

function classifyTrade(row: IGTradeRow): TransactionType {
  const activity = (row.Activity || "").toUpperCase();
  if (activity === "DIVIDEND") return "dividend-trading";
  if (activity === "FEE" || activity === "COMMISSION") return "fee-trading";
  if (activity === "TRANSFER" || activity === "DEPOSIT" || activity === "WITHDRAWAL")
    return "cash-transfer-trading";
  return "trading";
}

function parseDateDMY(raw: string): Date {
  // DD-MM-YYYY
  const parts = raw.trim().split("-");
  if (parts.length !== 3) return new Date();
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day);
}

export function parseIGTradeRow(
  row: IGTradeRow,
  sourceFile: string
): Partial<ITransaction> {
  const date = parseDateDMY(row.TextDate);
  const costProceeds = parseAmount(row["Cost/Proceeds"]);
  const consideration = parseAmount(row.Consideration);
  const commission = parseAmount(row.Commission);
  const charges = parseAmount(row.Charges);
  const conversionRate = parseFloat(row["Conversion rate"]) || null;
  const type = classifyTrade(row);

  const direction = (row.Direction || "").toUpperCase();
  const side: "buy" | "sell" | undefined =
    direction === "BUY" ? "buy" : direction === "SELL" ? "sell" : undefined;

  const subType = row.Direction?.trim() || row.Activity?.trim() || undefined;

  const quantityRaw = row.Quantity?.trim();
  const quantity = quantityRaw ? Math.abs(parseFloat(quantityRaw)) : undefined;

  const priceRaw = row.Price?.trim();
  const price = priceRaw ? parseFloat(priceRaw) : undefined;

  // For sells, cost/proceeds is positive (money in); for buys, negative (money out)
  const amount = costProceeds;

  return {
    type,
    subType,
    source: "ig",
    sourceReference: row["Order ID"]?.trim(),
    date,
    taxYear: getTaxYear(date),
    amount,
    currency: row.Currency?.trim() || "AUD",
    originalAmount: consideration,
    exchangeRate: conversionRate,
    description: row.Market?.trim() || "",
    marketName: row.Market?.trim() || undefined,
    symbol: row.Market?.trim() || undefined,
    side,
    quantity,
    price,
    priceCurrency: row.Currency?.trim() || undefined,
    grossAmount: consideration,
    commission: commission || undefined,
    importedAt: new Date(),
    sourceFile,
    rawData: { ...row },
  };
}

// ---- Format detection ----

/** Kept for backwards compatibility */
export const parseIGRow = parseIGCFDRow;

export function isTradeHistoryFormat(columns: string[]): boolean {
  return columns.includes("Activity") && columns.includes("Market") && columns.includes("Direction");
}
