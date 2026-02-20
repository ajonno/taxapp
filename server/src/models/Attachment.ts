import mongoose, { Schema, Document } from "mongoose";

export const PARENT_TYPES = ["cgt-asset", "transaction", "income"] as const;
export type ParentType = (typeof PARENT_TYPES)[number];

export interface IAttachment extends Document {
  parentId: string;
  parentType: ParentType;
  originalName: string;
  mimeType: string;
  size: number;
  filePath: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>(
  {
    parentId: { type: String, required: true, index: true },
    parentType: { type: String, enum: PARENT_TYPES, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    filePath: { type: String, required: true },
  },
  { timestamps: true }
);

AttachmentSchema.index({ parentId: 1, parentType: 1 });

export const Attachment = mongoose.model<IAttachment>("Attachment", AttachmentSchema);
