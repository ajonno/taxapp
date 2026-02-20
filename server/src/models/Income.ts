import mongoose, { Schema, Document } from "mongoose";

export const INCOME_TYPES = [
  "salary",
  "rental",
  "interest",
  "dividend",
  "business",
  "foreign",
  "other",
] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

export interface IIncome extends Document {
  description: string;
  incomeType: IncomeType;
  amount: number;
  entity: string;
  taxYear: number;
  date: Date;
  payer: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const IncomeSchema = new Schema<IIncome>(
  {
    description: { type: String, required: true },
    incomeType: { type: String, enum: INCOME_TYPES, required: true },
    amount: { type: Number, required: true },
    entity: { type: String, required: true, index: true },
    taxYear: { type: Number, required: true, index: true },
    date: { type: Date, required: true },
    payer: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

IncomeSchema.index({ taxYear: 1, entity: 1 });

export const Income = mongoose.model<IIncome>("Income", IncomeSchema);
