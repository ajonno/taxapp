import { createHash } from "crypto";

export function getTaxYear(date: Date): number {
  // AU financial year: Jul 1 – Jun 30
  // March 2025 → taxYear 2025 (FY2024-25)
  // August 2025 → taxYear 2026 (FY2025-26)
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear();
}

export function hashRef(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

export function parseAmount(raw: string): number {
  // Strip currency prefixes (A$, $, etc.), commas, quotes, whitespace
  const cleaned = raw.replace(/[A$,"'\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function parseDateDMY(raw: string): Date {
  // DD/MM/YYYY or DD/MM/YY
  const parts = raw.trim().split("/");
  if (parts.length !== 3) throw new Error(`Invalid date: ${raw}`);
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day);
}
