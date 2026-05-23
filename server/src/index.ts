import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { initFirebaseAdmin } from "./auth/firebaseAdmin.js";
import { requireAuth } from "./auth/middleware.js";
import { transactionsRouter } from "./routes/transactions.js";
import { importRouter } from "./routes/import.js";
import { filtersRouter } from "./routes/filters.js";
import { taxCategoriesRouter } from "./routes/taxCategories.js";
import { sourcesRouter } from "./routes/sources.js";
import { entitiesRouter } from "./routes/entities.js";
import { subTypesRouter } from "./routes/subTypes.js";
import { cgtAssetsRouter } from "./routes/cgtAssets.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { incomeRouter } from "./routes/income.js";
import { reportsRouter } from "./routes/reports.js";
import { meRouter } from "./routes/me.js";
import { guestsRouter } from "./routes/guests.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Firebase Admin SDK
initFirebaseAdmin();

// CORS: allow local Vite dev server + deployed frontend
const allowedOrigins = (process.env.CORS_ORIGINS ||
  "http://localhost:5173").split(",").map((s) => s.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser (curl/server-to-server) and allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

// Health check is public (no auth)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// All other /api routes require a valid Firebase ID token
app.use("/api", requireAuth);

app.use("/api/transactions", transactionsRouter);
app.use("/api/import", importRouter);
app.use("/api/filters", filtersRouter);
app.use("/api/tax-categories", taxCategoriesRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/entities", entitiesRouter);
app.use("/api/sub-types", subTypesRouter);
app.use("/api/cgt-assets", cgtAssetsRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/income", incomeRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/me", meRouter);
app.use("/api/guests", guestsRouter);

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
