import { ITransaction, TransactionType } from "../models/Transaction.js";
import { getTaxYear, hashRef, parseAmount } from "./utils.js";

interface IBKRRow {
  Date: string;
  Account: string;
  Description: string;
  "Transaction Type": string;
  Symbol: string;
  Quantity: string;
  Price: string;
  "Price Currency": string;
  "Gross Amount ": string; // note trailing space in CSV header
  Commission: string;
  "Net Amount": string;
}

function classifyIBKR(row: IBKRRow): TransactionType {
  const txType = (row["Transaction Type"] || "").toLowerCase();
  if (txType === "buy" || txType === "sell") return "trading";
  if (txType === "adjustment") return "adjustment-trading";
  if (txType === "dividend") return "dividend-trading";
  return "trading";
}

export function parseIBKRRow(
  row: IBKRRow,
  sourceFile: string
): Partial<ITransaction> {
  const date = new Date(row.Date);
  const netAmount = parseAmount(row["Net Amount"]);
  const grossAmount = parseAmount(row["Gross Amount "] || "");
  const commission = parseAmount(row.Commission);
  const type = classifyIBKR(row);

  const symbol =
    row.Symbol?.trim() && row.Symbol.trim() !== "-"
      ? row.Symbol.trim()
      : undefined;
  const quantity =
    row.Quantity?.trim() && row.Quantity.trim() !== "-"
      ? Math.abs(parseFloat(row.Quantity))
      : undefined;
  const price =
    row.Price?.trim() && row.Price.trim() !== "-"
      ? parseFloat(row.Price)
      : undefined;
  const priceCurrency =
    row["Price Currency"]?.trim() && row["Price Currency"].trim() !== "-"
      ? row["Price Currency"].trim()
      : undefined;

  const txType = (row["Transaction Type"] || "").toLowerCase();
  const side =
    txType === "buy" ? "buy" : txType === "sell" ? "sell" : undefined;

  const adjustmentType =
    type === "adjustment-trading" ? row.Description?.trim() : undefined;

  const sourceReference = hashRef(
    row.Date,
    row.Symbol || "",
    row.Quantity || "",
    row["Net Amount"] || "",
    row.Commission || ""
  );

  return {
    type,
    source: "interactive-brokers",
    sourceReference,
    date,
    taxYear: getTaxYear(date),
    amount: netAmount,
    currency: priceCurrency || "AUD",
    originalAmount: netAmount,
    exchangeRate: null,
    description: row.Description?.trim() || "",
    symbol,
    marketName: row.Description?.trim(),
    side,
    quantity,
    price,
    priceCurrency,
    grossAmount: grossAmount || undefined,
    commission: commission || undefined,
    adjustmentType,
    importedAt: new Date(),
    sourceFile,
    rawData: { ...row },
  };
}
