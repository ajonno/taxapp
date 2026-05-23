import mongoose, { Schema, Document } from "mongoose";

export interface ISource extends Document {
  userId: string;
  key: string;
  label: string;
  type: "bank" | "broker";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SourceSchema = new Schema<ISource>(
  {
    userId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ["bank", "broker"], required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SourceSchema.index({ userId: 1, key: 1 }, { unique: true });

export const Source = mongoose.model<ISource>("Source", SourceSchema);
