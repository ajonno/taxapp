import mongoose, { Schema, Document } from "mongoose";

export interface ISubType extends Document {
  userId: string;
  label: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubTypeSchema = new Schema<ISubType>(
  {
    userId: { type: String, required: true, index: true },
    label: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SubTypeSchema.index({ userId: 1, label: 1 }, { unique: true });

export const SubType = mongoose.model<ISubType>("SubType", SubTypeSchema);
