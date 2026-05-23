import mongoose, { Schema, Document } from "mongoose";

export interface IEntity extends Document {
  userId: string;
  key: string;
  label: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EntitySchema = new Schema<IEntity>(
  {
    userId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    label: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

EntitySchema.index({ userId: 1, key: 1 }, { unique: true });

export const Entity = mongoose.model<IEntity>("Entity", EntitySchema);
