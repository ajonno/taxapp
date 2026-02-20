import mongoose, { Schema, Document } from "mongoose";

export interface IEntity extends Document {
  key: string;
  label: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EntitySchema = new Schema<IEntity>(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Entity = mongoose.model<IEntity>("Entity", EntitySchema);
