import mongoose, { Schema, Document } from "mongoose";

export const ASSET_TYPES = ["property", "shares", "crypto", "other"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface ICostItem {
  label: string;
  amount: number;
}

export interface ICGTAsset extends Document {
  userId: string;
  description: string;
  assetType: AssetType;
  entity: string;
  taxYear: number;

  // Acquisition
  acquisitionDate: Date;
  acquisitionPrice: number;
  costBaseItems: ICostItem[];

  // Disposal
  disposalDate: Date;
  disposalPrice: number;
  disposalCostItems: ICostItem[];

  notes: string;

  // Virtuals
  totalCostBase: number;
  totalDisposalCosts: number;
  netProceeds: number;
  capitalGainLoss: number;
  heldOverOneYear: boolean;
  discountApplicable: boolean;
  netCapitalGain: number;

  createdAt: Date;
  updatedAt: Date;
}

const CostItemSchema = new Schema<ICostItem>(
  {
    label: { type: String, required: true },
    amount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const CGTAssetSchema = new Schema<ICGTAsset>(
  {
    userId: { type: String, required: true, index: true },
    description: { type: String, required: true },
    assetType: { type: String, enum: ASSET_TYPES, required: true },
    entity: { type: String, required: true, index: true },
    taxYear: { type: Number, required: true, index: true },

    acquisitionDate: { type: Date, required: true },
    acquisitionPrice: { type: Number, required: true },
    costBaseItems: { type: [CostItemSchema], default: [] },

    disposalDate: { type: Date, required: true },
    disposalPrice: { type: Number, required: true },
    disposalCostItems: { type: [CostItemSchema], default: [] },

    notes: { type: String, default: "" },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

CGTAssetSchema.virtual("totalCostBase").get(function () {
  const itemsTotal = (this.costBaseItems || []).reduce(
    (sum: number, item: ICostItem) => sum + item.amount,
    0
  );
  return this.acquisitionPrice + itemsTotal;
});

CGTAssetSchema.virtual("totalDisposalCosts").get(function () {
  return (this.disposalCostItems || []).reduce(
    (sum: number, item: ICostItem) => sum + item.amount,
    0
  );
});

CGTAssetSchema.virtual("netProceeds").get(function (this: ICGTAsset) {
  return this.disposalPrice - this.totalDisposalCosts;
});

CGTAssetSchema.virtual("capitalGainLoss").get(function (this: ICGTAsset) {
  return this.netProceeds - this.totalCostBase;
});

CGTAssetSchema.virtual("heldOverOneYear").get(function () {
  if (!this.acquisitionDate || !this.disposalDate) return false;
  const msInYear = 365.25 * 24 * 60 * 60 * 1000;
  return this.disposalDate.getTime() - this.acquisitionDate.getTime() > msInYear;
});

CGTAssetSchema.virtual("discountApplicable").get(function (this: ICGTAsset) {
  return this.heldOverOneYear && this.entity === "personal" && this.capitalGainLoss > 0;
});

CGTAssetSchema.virtual("netCapitalGain").get(function (this: ICGTAsset) {
  const gainLoss = this.capitalGainLoss;
  if (gainLoss <= 0) return gainLoss;
  if (this.discountApplicable) return gainLoss * 0.5;
  return gainLoss;
});

CGTAssetSchema.index({ userId: 1, taxYear: 1, entity: 1 });

export const CGTAsset = mongoose.model<ICGTAsset>("CGTAsset", CGTAssetSchema);
