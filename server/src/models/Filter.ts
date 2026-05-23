import mongoose, { Schema, Document } from "mongoose";

export interface IFilter extends Document {
  userId: string;
  pattern: string;
  source: string;
  reason: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FilterSchema = new Schema<IFilter>(
  {
    userId: { type: String, required: true, index: true },
    pattern: { type: String, required: true },
    source: { type: String, default: "all" },
    reason: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FilterSchema.index({ userId: 1, pattern: 1, source: 1 }, { unique: true });

export const Filter = mongoose.model<IFilter>("Filter", FilterSchema);
