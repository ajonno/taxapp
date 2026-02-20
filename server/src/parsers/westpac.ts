import { ITransaction } from "../models/Transaction.js";
import { getTaxYear, hashRef, parseAmount, parseDateDMY } from "./utils.js";

interface WestpacRow {
  "Bank Account": string;
  Date: string;
  Narrative: string;
  "Debit Amount": string;
  "Credit Amount": string;
  Balance: string;
  Categories: string;
  Serial: string;
}

export function parseWestpacRow(
  row: WestpacRow,
  sourceFile: string
): Partial<ITransaction> {
  const date = parseDateDMY(row.Date);
  const debit = row["Debit Amount"] ? parseAmount(row["Debit Amount"]) : 0;
  const credit = row["Credit Amount"] ? parseAmount(row["Credit Amount"]) : 0;
  const amount = credit > 0 ? credit : -debit;

  const sourceReference = row.Serial?.trim()
    ? row.Serial.trim()
    : hashRef(row.Date, row.Narrative, row["Debit Amount"], row["Credit Amount"]);

  return {
    type: "bank",
    source: "westpac",
    sourceReference,
    date,
    taxYear: getTaxYear(date),
    amount,
    currency: "AUD",
    originalAmount: amount,
    exchangeRate: null,
    description: row.Narrative?.trim() || "",
    bankAccount: row["Bank Account"]?.trim(),
    narrative: row.Narrative?.trim(),
    bankCategory: row.Categories?.trim(),
    balance: row.Balance ? parseAmount(row.Balance) : undefined,
    importedAt: new Date(),
    sourceFile,
    rawData: { ...row },
  };
}
