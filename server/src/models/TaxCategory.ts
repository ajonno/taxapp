import mongoose, { Schema, Document } from "mongoose";

export interface ITaxCategory extends Document {
  code: string;
  name: string;
  type: "income" | "deduction";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TaxCategorySchema = new Schema<ITaxCategory>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, enum: ["income", "deduction"], required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const TaxCategory = mongoose.model<ITaxCategory>(
  "TaxCategory",
  TaxCategorySchema
);
