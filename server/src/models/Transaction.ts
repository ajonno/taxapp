import mongoose, { Schema, Document } from "mongoose";

export const TRANSACTION_TYPES = [
  "trading",
  "dividend-trading",
  "dividend-bank",
  "fee-trading",
  "fee-bank",
  "cash-transfer-trading",
  "cash-transfer-bank",
  "adjustment-trading",
  "adjustment-bank",
  "bank",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export type Source = string;

export interface ITransaction extends Document {
  // Common
  type: TransactionType;
  source: Source;
  sourceReference: string;
  date: Date;
  taxYear: number;
  amount: number;
  currency: string;
  originalAmount: number;
  exchangeRate: number | null;
  description: string;

  // Import tracking
  importedAt: Date;
  sourceFile: string;
  rawData: Record<string, unknown>;

  // Trade
  symbol?: string;
  marketName?: string;
  side?: "buy" | "sell";
  quantity?: number;
  price?: number;
  priceCurrency?: string;
  grossAmount?: number;
  commission?: number;

  // Bank
  bankAccount?: string;
  narrative?: string;
  bankCategory?: string;
  balance?: number;

  // Fee
  feeType?: string;
  relatedReference?: string;

  // Cash transfer
  direction?: "in" | "out";

  // Adjustment
  adjustmentType?: string;

  // Sub-type (original transaction type from source, e.g. Buy/Sell/Dividend from IBKR)
  subType?: string;

  // Flags
  followUp?: boolean;

  // Tax classification
  taxCategory?: string;
  entity?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    // Common
    type: { type: String, enum: TRANSACTION_TYPES, required: true, index: true },
    source: { type: String, required: true, index: true },
    sourceReference: { type: String },
    date: { type: Date, required: true, index: true },
    taxYear: { type: Number, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "AUD" },
    originalAmount: { type: Number },
    exchangeRate: { type: Number, default: null },
    description: { type: String, required: true },

    // Import tracking
    importedAt: { type: Date },
    sourceFile: { type: String },
    rawData: { type: Schema.Types.Mixed },

    // Trade
    symbol: { type: String, index: true },
    marketName: { type: String },
    side: { type: String, enum: ["buy", "sell"] },
    quantity: { type: Number },
    price: { type: Number },
    priceCurrency: { type: String },
    grossAmount: { type: Number },
    commission: { type: Number },

    // Bank
    bankAccount: { type: String },
    narrative: { type: String },
    bankCategory: { type: String },
    balance: { type: Number },

    // Fee
    feeType: { type: String },
    relatedReference: { type: String },

    // Cash transfer
    direction: { type: String, enum: ["in", "out"] },

    // Adjustment
    adjustmentType: { type: String },

    // Sub-type
    subType: { type: String, index: true },

    // Flags
    followUp: { type: Boolean, default: false },

    // Tax classification
    taxCategory: { type: String, index: true },
    entity: { type: String, index: true },
  },
  { timestamps: true }
);

// Compound index for common queries
TransactionSchema.index({ taxYear: 1, type: 1 });
TransactionSchema.index({ taxYear: 1, source: 1 });
// Deduplication: prevent re-importing the same record
TransactionSchema.index({ source: 1, sourceReference: 1 }, { unique: true, sparse: true });

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);
