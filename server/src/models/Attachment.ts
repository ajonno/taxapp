import mongoose, { Schema, Document } from "mongoose";

export const PARENT_TYPES = ["cgt-asset", "transaction", "income"] as const;
export type ParentType = (typeof PARENT_TYPES)[number];

export interface IAttachment extends Document {
  userId: string;
  parentId: string;
  parentType: ParentType;
  originalName: string;
  mimeType: string;
  size: number;
  // Either filePath (legacy local files) or driveFileId (Google Drive) is set.
  filePath?: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>(
  {
    userId: { type: String, required: true, index: true },
    parentId: { type: String, required: true, index: true },
    parentType: { type: String, enum: PARENT_TYPES, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    // Legacy local file path (kept for old records, no longer required)
    filePath: { type: String },
    // Google Drive backed attachment
    driveFileId: { type: String, index: true },
    driveWebViewLink: { type: String },
  },
  { timestamps: true }
);

AttachmentSchema.index({ userId: 1, parentId: 1, parentType: 1 });

export const Attachment = mongoose.model<IAttachment>("Attachment", AttachmentSchema);
