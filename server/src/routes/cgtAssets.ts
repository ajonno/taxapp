import { Router } from "express";
import { CGTAsset } from "../models/CGTAsset.js";
import { userId } from "../auth/middleware.js";

export const cgtAssetsRouter = Router();

cgtAssetsRouter.get("/", async (req, res) => {
  try {
    const filter: Record<string, unknown> = { userId: userId(req) };
    if (req.query.taxYear) filter.taxYear = Number(req.query.taxYear);
    if (req.query.entity) filter.entity = req.query.entity;

    const assets = await CGTAsset.find(filter).sort({ disposalDate: -1 });
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch CGT assets" });
  }
});

cgtAssetsRouter.get("/summary", async (req, res) => {
  try {
    const filter: Record<string, unknown> = { userId: userId(req) };
    if (req.query.taxYear) filter.taxYear = Number(req.query.taxYear);
    if (req.query.entity) filter.entity = req.query.entity;

    const assets = await CGTAsset.find(filter);

    let totalGains = 0;
    let totalLosses = 0;
    let totalNetCapitalGain = 0;

    for (const asset of assets) {
      const gainLoss = asset.capitalGainLoss;
      if (gainLoss > 0) totalGains += gainLoss;
      else totalLosses += gainLoss;
      totalNetCapitalGain += asset.netCapitalGain;
    }

    res.json({ count: assets.length, totalGains, totalLosses, totalNetCapitalGain });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch CGT summary" });
  }
});

cgtAssetsRouter.get("/:id", async (req, res) => {
  try {
    const asset = await CGTAsset.findOne({ _id: req.params.id, userId: userId(req) });
    if (!asset) {
      res.status(404).json({ error: "CGT asset not found" });
      return;
    }
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch CGT asset" });
  }
});

cgtAssetsRouter.post("/", async (req, res) => {
  try {
    const asset = await CGTAsset.create({ ...req.body, userId: userId(req) });
    res.status(201).json(asset);
  } catch (error) {
    res.status(400).json({ error: "Failed to create CGT asset" });
  }
});

cgtAssetsRouter.put("/:id", async (req, res) => {
  try {
    const asset = await CGTAsset.findOneAndUpdate(
      { _id: req.params.id, userId: userId(req) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!asset) {
      res.status(404).json({ error: "CGT asset not found" });
      return;
    }
    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: "Failed to update CGT asset" });
  }
});

cgtAssetsRouter.delete("/:id", async (req, res) => {
  try {
    const asset = await CGTAsset.findOneAndDelete({ _id: req.params.id, userId: userId(req) });
    if (!asset) {
      res.status(404).json({ error: "CGT asset not found" });
      return;
    }
    res.json({ message: "CGT asset deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete CGT asset" });
  }
});
