import { Router } from "express";
import PDFDocument from "pdfkit";
import { Transaction } from "../models/Transaction.js";
import { Filter } from "../models/Filter.js";
import { TaxCategory } from "../models/TaxCategory.js";
import { Income } from "../models/Income.js";
import { CGTAsset } from "../models/CGTAsset.js";
import { Entity } from "../models/Entity.js";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fmt(amount: number) {
  const abs = Math.abs(amount).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-AU");
}

export const reportsRouter = Router();

reportsRouter.get("/tax-summary", async (req, res) => {
  try {
    const taxYear = req.query.taxYear ? Number(req.query.taxYear) : null;
    const entityKey = req.query.entity ? String(req.query.entity) : null;

    // Gather all data in parallel
    const txFilter: Record<string, unknown> = {};
    if (taxYear) txFilter.taxYear = taxYear;
    if (entityKey) txFilter.entity = entityKey;

    // Exclusion filters for transactions
    const activeFilters = await Filter.find({ active: true });
    if (activeFilters.length > 0) {
      const exclusions = activeFilters.map((f) => {
        const condition: Record<string, unknown> = {
          description: { $regex: escapeRegex(f.pattern), $options: "i" },
        };
        if (f.source !== "all") condition.source = f.source;
        return condition;
      });
      txFilter.$nor = exclusions;
    }

    const [categorySummary, taxCategories, incomeEntries, cgtAssets, entities] =
      await Promise.all([
        Transaction.aggregate([
          { $match: txFilter },
          { $group: { _id: "$taxCategory", total: { $sum: "$amount" }, count: { $sum: 1 } } },
          { $sort: { _id: 1 as 1 } },
        ]),
        TaxCategory.find({ active: true }).sort({ type: 1, code: 1 }),
        Income.find(taxYear || entityKey ? { ...(taxYear && { taxYear }), ...(entityKey && { entity: entityKey }) } : {}),
        CGTAsset.find(taxYear || entityKey ? { ...(taxYear && { taxYear }), ...(entityKey && { entity: entityKey }) } : {}),
        Entity.find().sort({ key: 1 }),
      ]);

    const entityLabel = entityKey
      ? entities.find((e) => e.key === entityKey)?.label || entityKey
      : "All entities";
    const yearLabel = taxYear ? `FY ${taxYear - 1}-${taxYear}` : "All years";

    // Build lookup maps
    const catMap = new Map(taxCategories.map((c) => [c.code, c]));
    const summaryMap = new Map(
      categorySummary.map((r: { _id: string | null; total: number; count: number }) => [
        r._id,
        { total: r.total, count: r.count },
      ])
    );

    const incomeCategories = taxCategories.filter((c) => c.type === "income");
    const deductionCategories = taxCategories.filter((c) => c.type === "deduction");

    const incomeRows = incomeCategories
      .map((c) => ({ code: c.code, name: c.name, ...(summaryMap.get(c.code) || { total: 0, count: 0 }) }))
      .filter((r) => r.count > 0);

    const deductionRows = deductionCategories
      .map((c) => ({ code: c.code, name: c.name, ...(summaryMap.get(c.code) || { total: 0, count: 0 }) }))
      .filter((r) => r.count > 0);

    // CGT computations
    let cgtTotalGains = 0;
    let cgtTotalLosses = 0;
    let cgtTotalNet = 0;
    for (const a of cgtAssets) {
      const gl = a.capitalGainLoss;
      if (gl > 0) cgtTotalGains += gl;
      else cgtTotalLosses += gl;
      cgtTotalNet += a.netCapitalGain;
    }

    // ---- Build PDF ----
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Tax_Summary_${yearLabel.replace(/\s/g, "_")}.pdf"`
    );
    doc.pipe(res);

    // Title
    doc.fontSize(20).text("Tax Summary Report", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#666").text(`${yearLabel}  •  ${entityLabel}`, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(9).text(`Generated ${new Date().toLocaleDateString("en-AU")}`, { align: "center" });
    doc.moveDown(1.5);

    const leftCol = 50;
    const rightCol = 420;
    const tableWidth = 500;

    // Helper: section heading
    function heading(text: string) {
      doc.moveDown(0.5);
      doc.fontSize(14).fillColor("#222").text(text);
      doc.moveDown(0.3);
      doc
        .moveTo(leftCol, doc.y)
        .lineTo(leftCol + tableWidth, doc.y)
        .strokeColor("#ccc")
        .stroke();
      doc.moveDown(0.3);
    }

    // Helper: table row
    function row(label: string, value: string, bold = false) {
      doc.fontSize(10).fillColor(bold ? "#111" : "#333");
      if (bold) doc.font("Helvetica-Bold");
      else doc.font("Helvetica");
      const y = doc.y;
      doc.text(label, leftCol, y, { width: 350 });
      doc.text(value, rightCol, y, { width: 100, align: "right" });
      doc.moveDown(0.15);
    }

    // Helper: sub-row (indented)
    function subRow(label: string, value: string) {
      doc.fontSize(9).fillColor("#555").font("Helvetica");
      const y = doc.y;
      doc.text(label, leftCol + 15, y, { width: 335 });
      doc.text(value, rightCol, y, { width: 100, align: "right" });
      doc.moveDown(0.1);
    }

    // ---- INCOME ----
    heading("Income");

    let totalIncome = 0;

    if (incomeRows.length > 0) {
      for (const r of incomeRows) {
        row(`${r.code}  ${r.name}`, fmt(r.total));
        totalIncome += r.total;
      }
    }

    if (incomeEntries.length > 0) {
      for (const e of incomeEntries) {
        row(e.description, fmt(e.amount));
        totalIncome += e.amount;
      }
    }

    if (cgtTotalNet > 0) {
      row("Net capital gain (see below)", fmt(cgtTotalNet));
      totalIncome += cgtTotalNet;
    }

    doc.moveDown(0.2);
    doc
      .moveTo(leftCol, doc.y)
      .lineTo(leftCol + tableWidth, doc.y)
      .strokeColor("#aaa")
      .stroke();
    doc.moveDown(0.2);
    row("Total Income", fmt(totalIncome), true);

    // ---- DEDUCTIONS ----
    heading("Deductions");

    let totalDeductions = 0;

    if (deductionRows.length > 0) {
      for (const r of deductionRows) {
        row(`${r.code}  ${r.name}`, fmt(Math.abs(r.total)));
        totalDeductions += r.total;
      }
    } else {
      doc.fontSize(10).fillColor("#999").text("No deductions", leftCol);
    }

    doc.moveDown(0.2);
    doc
      .moveTo(leftCol, doc.y)
      .lineTo(leftCol + tableWidth, doc.y)
      .strokeColor("#aaa")
      .stroke();
    doc.moveDown(0.2);
    row("Total Deductions", fmt(Math.abs(totalDeductions)), true);

    // ---- NET ----
    doc.moveDown(0.5);
    row("Taxable Income (Income − Deductions)", fmt(totalIncome + totalDeductions), true);

    // ---- CAPITAL GAINS ----
    if (cgtAssets.length > 0) {
      heading("Capital Gains Tax (CGT) Events");

      for (const a of cgtAssets) {
        doc.moveDown(0.3);
        doc.fontSize(11).fillColor("#222").font("Helvetica-Bold").text(a.description);
        doc.moveDown(0.15);
        doc.font("Helvetica");

        subRow("Asset type", a.assetType);
        subRow("Entity", a.entity);
        subRow("Acquisition date", fmtDate(a.acquisitionDate));
        subRow("Purchase price", fmt(a.acquisitionPrice));

        if (a.costBaseItems && a.costBaseItems.length > 0) {
          for (const ci of a.costBaseItems) {
            subRow(`  ${ci.label}`, fmt(ci.amount));
          }
        }
        subRow("Total cost base", fmt(a.totalCostBase));

        doc.moveDown(0.1);
        subRow("Disposal date", fmtDate(a.disposalDate));
        subRow("Sale price", fmt(a.disposalPrice));

        if (a.disposalCostItems && a.disposalCostItems.length > 0) {
          for (const ci of a.disposalCostItems) {
            subRow(`  ${ci.label}`, fmt(ci.amount));
          }
        }
        subRow("Net proceeds", fmt(a.netProceeds));

        doc.moveDown(0.1);
        row("Capital gain/loss", fmt(a.capitalGainLoss));
        if (a.discountApplicable) {
          subRow("50% CGT discount applied", "Yes");
        }
        row("Net capital gain", fmt(a.netCapitalGain));

        if (a.notes) {
          doc.moveDown(0.1);
          doc.fontSize(9).fillColor("#666").font("Helvetica-Oblique").text(`Notes: ${a.notes}`, leftCol + 15);
          doc.font("Helvetica");
        }

        doc.moveDown(0.2);
        doc
          .moveTo(leftCol + 15, doc.y)
          .lineTo(leftCol + tableWidth, doc.y)
          .strokeColor("#ddd")
          .stroke();
      }

      doc.moveDown(0.3);
      row("Total capital gains", fmt(cgtTotalGains));
      row("Total capital losses", fmt(cgtTotalLosses));
      row("Total net capital gain (after discount)", fmt(cgtTotalNet), true);
    }

    doc.end();
  } catch (error) {
    console.error("Report generation failed:", error);
    res.status(500).json({ error: "Failed to generate report" });
  }
});
