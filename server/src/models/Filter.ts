import mongoose, { Schema, Document } from "mongoose";

export interface IFilter extends Document {
  pattern: string;
  source: string;
  reason: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FilterSchema = new Schema<IFilter>(
  {
    pattern: { type: String, required: true },
    source: { type: String, default: "all" },
    reason: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FilterSchema.index({ pattern: 1, source: 1 }, { unique: true });

export const Filter = mongoose.model<IFilter>("Filter", FilterSchema);
