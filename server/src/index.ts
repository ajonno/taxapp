import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { transactionsRouter } from "./routes/transactions.js";
import { importRouter } from "./routes/import.js";
import { filtersRouter } from "./routes/filters.js";
import { taxCategoriesRouter } from "./routes/taxCategories.js";
import { sourcesRouter } from "./routes/sources.js";
import { entitiesRouter } from "./routes/entities.js";
import { cgtAssetsRouter } from "./routes/cgtAssets.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { incomeRouter } from "./routes/income.js";
import { reportsRouter } from "./routes/reports.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.use("/api/transactions", transactionsRouter);
app.use("/api/import", importRouter);
app.use("/api/filters", filtersRouter);
app.use("/api/tax-categories", taxCategoriesRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/entities", entitiesRouter);
app.use("/api/cgt-assets", cgtAssetsRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/income", incomeRouter);
app.use("/api/reports", reportsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
