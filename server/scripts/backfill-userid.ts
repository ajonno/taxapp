/**
 * One-time backfill script: assigns a userId to all existing documents
 * that don't have one. Use this after first sign-in to claim all your
 * legacy data.
 *
 * Usage:
 *   cd server
 *   npx tsx scripts/backfill-userid.ts <FIREBASE_UID>
 */
import mongoose from "mongoose";
import { Transaction } from "../src/models/Transaction.js";
import { CGTAsset } from "../src/models/CGTAsset.js";
import { Income } from "../src/models/Income.js";
import { Filter } from "../src/models/Filter.js";
import { Attachment } from "../src/models/Attachment.js";
import { Entity } from "../src/models/Entity.js";
import { Source } from "../src/models/Source.js";
import { SubType } from "../src/models/SubType.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/taxapp";

async function main() {
  const uid = process.argv[2];
  if (!uid) {
    console.error("Usage: npx tsx scripts/backfill-userid.ts <FIREBASE_UID>");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to ${MONGODB_URI}`);

  const collections = [
    { name: "Transaction", model: Transaction },
    { name: "CGTAsset", model: CGTAsset },
    { name: "Income", model: Income },
    { name: "Filter", model: Filter },
    { name: "Attachment", model: Attachment },
    { name: "Entity", model: Entity },
    { name: "Source", model: Source },
    { name: "SubType", model: SubType },
  ];

  for (const { name, model } of collections) {
    const result = await model.updateMany(
      { $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }] },
      { $set: { userId: uid } }
    );
    console.log(`${name}: backfilled ${result.modifiedCount} document(s)`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
