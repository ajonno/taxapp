import mongoose, { Schema, Document } from "mongoose";

export interface ISource extends Document {
  key: string;
  label: string;
  type: "bank" | "broker";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SourceSchema = new Schema<ISource>(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    type: { type: String, enum: ["bank", "broker"], required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Source = mongoose.model<ISource>("Source", SourceSchema);
