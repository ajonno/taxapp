/**
 * Auto-assign ATO tax category based on transaction type and description.
 * Returns the category code (e.g. "I12", "D9") or undefined if no match.
 */
export function autoAssignCategory(
  type: string,
  description: string,
  amount: number
): string | undefined {
  const desc = description.toLowerCase();

  // Trading → Capital gains
  if (type === "trading") return "I12";

  // Dividends → I10B
  if (type === "dividend-trading" || type === "dividend-bank") return "I10B";

  // Trading/brokerage fees → Cost of managing tax affairs
  if (type === "fee-trading") return "D10";

  // Adjustments on trading accounts → Capital gains
  if (type === "adjustment-trading") return "I12";

  // Cash transfers are internal movements, no tax category
  if (type === "cash-transfer-trading" || type === "cash-transfer-bank") return undefined;

  // Bank fees → Cost of managing tax affairs
  if (type === "fee-bank") return "D10";

  // Bank adjustments — skip
  if (type === "adjustment-bank") return undefined;

  // Bank transactions — try to classify by description
  if (type === "bank") {
    // Interest
    if (desc.includes("interest")) return "I10A";

    // Salary / wages
    if (
      desc.includes("salary") ||
      desc.includes("wages") ||
      desc.includes("payroll") ||
      desc.includes("pay from")
    )
      return "I1";

    // Donations
    if (
      desc.includes("donation") ||
      desc.includes("donate") ||
      desc.includes("charitable") ||
      desc.includes("red cross") ||
      desc.includes("salvation army") ||
      desc.includes("getup") ||
      desc.includes("world vision") ||
      desc.includes("unicef") ||
      desc.includes("oxfam") ||
      desc.includes("médecins") ||
      desc.includes("doctors without")
    )
      return "D9";

    // Government payments
    if (
      desc.includes("centrelink") ||
      desc.includes("services australia") ||
      desc.includes("govt") ||
      desc.includes("government")
    )
      return "I5";

    // Work-related expenses keywords
    if (desc.includes("uber") && desc.includes("trip")) return "D2";
    if (desc.includes("education") || desc.includes("course") || desc.includes("udemy") || desc.includes("training"))
      return "D4";

    // If it's income (positive) but unclassified
    if (amount > 0) return "I17";
  }

  return undefined;
}
