import { Router } from "express";
import path from "path";
import fs from "fs";
import { Attachment } from "../models/Attachment.js";

export const attachmentsRouter = Router();

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.document",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

// Browse filesystem shortcuts
attachmentsRouter.get("/browse/shortcuts", (_req, res) => {
  try {
    const home = process.env.HOME || "/";
    const shortcuts: { label: string; path: string }[] = [
      { label: "Home", path: home },
    ];

    const cloudStorage = path.join(home, "Library", "CloudStorage");
    if (fs.existsSync(cloudStorage)) {
      const entries = fs.readdirSync(cloudStorage, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("GoogleDrive-")) {
          const email = entry.name.replace("GoogleDrive-", "");
          shortcuts.push({
            label: `Drive (${email})`,
            path: path.join(cloudStorage, entry.name),
          });
        }
      }
    }

    const desktop = path.join(home, "Desktop");
    const documents = path.join(home, "Documents");
    const downloads = path.join(home, "Downloads");
    if (fs.existsSync(desktop)) shortcuts.push({ label: "Desktop", path: desktop });
    if (fs.existsSync(documents)) shortcuts.push({ label: "Documents", path: documents });
    if (fs.existsSync(downloads)) shortcuts.push({ label: "Downloads", path: downloads });

    res.json(shortcuts);
  } catch (error) {
    res.status(500).json({ error: "Failed to get shortcuts" });
  }
});

// Browse filesystem directory
attachmentsRouter.get("/browse", (req, res) => {
  try {
    const dir = String(req.query.dir || path.resolve(process.env.HOME || "/"));
    const absDir = path.resolve(dir);

    if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
      res.status(400).json({ error: "Directory not found" });
      return;
    }

    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    const dirs: string[] = [];
    const files: { name: string; size: number }[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      try {
        if (entry.isDirectory()) {
          dirs.push(entry.name);
        } else if (entry.isFile()) {
          const stats = fs.statSync(path.join(absDir, entry.name));
          files.push({ name: entry.name, size: stats.size });
        }
      } catch {
        // skip entries we can't read
      }
    }

    dirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    res.json({
      path: absDir,
      parent: path.dirname(absDir) !== absDir ? path.dirname(absDir) : null,
      dirs,
      files,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to browse directory" });
  }
});

// List attachments for a parent record
attachmentsRouter.get("/", async (req, res) => {
  try {
    const { parentId, parentType } = req.query;
    if (!parentId || !parentType) {
      res.status(400).json({ error: "parentId and parentType are required" });
      return;
    }
    const attachments = await Attachment.find({
      parentId: String(parentId),
      parentType: String(parentType),
    }).sort({ createdAt: -1 });
    res.json(attachments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch attachments" });
  }
});

// Attach a file by path (no copying)
attachmentsRouter.post("/", async (req, res) => {
  try {
    const { parentId, parentType, filePath: linkedPath } = req.body;

    if (!parentId || !parentType || !linkedPath) {
      res.status(400).json({ error: "parentId, parentType, and filePath are required" });
      return;
    }

    const absPath = path.resolve(linkedPath);
    if (!fs.existsSync(absPath)) {
      res.status(400).json({ error: "File not found at the specified path" });
      return;
    }

    const stats = fs.statSync(absPath);
    const ext = path.extname(absPath).toLowerCase();

    const attachment = await Attachment.create({
      parentId,
      parentType,
      originalName: path.basename(absPath),
      mimeType: MIME_MAP[ext] || "application/octet-stream",
      size: stats.size,
      filePath: absPath,
    });

    res.status(201).json(attachment);
  } catch (error) {
    res.status(400).json({ error: "Failed to attach file" });
  }
});

// View an attachment inline (browser preview)
attachmentsRouter.get("/:id/view", async (req, res) => {
  try {
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    if (!fs.existsSync(attachment.filePath)) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${attachment.originalName}"`);
    res.sendFile(attachment.filePath);
  } catch (error) {
    res.status(500).json({ error: "Failed to view attachment" });
  }
});

// Delete an attachment (removes reference only, not the file)
attachmentsRouter.delete("/:id", async (req, res) => {
  try {
    const attachment = await Attachment.findByIdAndDelete(req.params.id);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    res.json({ message: "Attachment removed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});
