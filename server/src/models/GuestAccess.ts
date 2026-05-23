import mongoose from "mongoose";

/**
 * Lets the app owner grant another Google account read-only access to a
 * specific set of tax years. The guest sees the owner's data (queries are
 * scoped to ownerId on the server), but only for the tax years listed in
 * `taxYearsAllowed`, and cannot write.
 */
const guestAccessSchema = new mongoose.Schema(
  {
    // The owner's Firebase UID — the account whose data this guest can see.
    ownerId: { type: String, required: true, index: true },

    // The guest's Google email (lower-cased before save / compare).
    email: { type: String, required: true, lowercase: true, trim: true },

    // List of tax-year end-years the guest may view, e.g. [2025, 2026].
    // Empty array = no access (use `active: false` to disable instead).
    taxYearsAllowed: { type: [Number], default: [] },

    // List of entity keys the guest may view, e.g. ["personal", "aamsco"].
    // Empty array is treated as "no entities granted" (effectively no access).
    entitiesAllowed: { type: [String], default: [] },

    // Soft toggle the owner can flip without deleting the record.
    active: { type: Boolean, default: true },

    // Optional human note ("My accountant", "Tax agent", etc.).
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// Each owner can grant access to a given email exactly once.
guestAccessSchema.index({ ownerId: 1, email: 1 }, { unique: true });

export const GuestAccess = mongoose.model("GuestAccess", guestAccessSchema);
