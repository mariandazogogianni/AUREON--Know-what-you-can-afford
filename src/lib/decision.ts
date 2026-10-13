import {
  type AffordabilityResult,
  type AffordabilityStatus,
} from "@/lib/finance";
import { formatCents, formatCentsSigned } from "@/lib/money";

export interface StatusPresentation {
  status: AffordabilityStatus;
  /** Headline shown to the user, e.g. "Within your limit". */
  title: string;
  /** One-line, plain-language explanation of the outcome. */
  explanation: string;
  /** Tailwind classes for the headline / accent colouring. */
  accentText: string;
  /** Tailwind classes for the tinted container background + border. */
  container: string;
  /** Tailwind classes for the round status icon chip. */
  iconWrap: string;
  /** Lucide icon name to render for this status. */
  icon: "check" | "alert" | "x";
}

/**
 * Build the full, human explanation for a result. Kept out of JSX so the copy
 * and the arithmetic stay testable and consistent.
 */
export function describeResult(result: AffordabilityResult): StatusPresentation {
  const remaining = formatCents(Math.abs(result.remainingAfterPurchase));

  switch (result.status) {
    case "within":
      return {
        status: "within",
        title: "Within your limit",
        explanation: `This purchase fits inside your safe spending limit and would leave about ${remaining} spare after your emergency reserve is protected.`,
        accentText: "text-success",
        container:
          "border-success/30 bg-success/10",
        iconWrap: "bg-success/20 text-success",
        icon: "check",
      };
    case "caution":
      return {
        status: "caution",
        title: "Caution",
        explanation:
          result.projectedFunds <= 0
            ? "Your expected income doesn't fully cover your upcoming bills before payday, so there's little room for this purchase right now. Double-check your figures before deciding."
            : `This purchase would leave less than ${formatCents(result.cautionBuffer)} spare — not much cushion for an unexpected cost. Consider a smaller amount or waiting until after payday.`,
        accentText: "text-warning",
        container: "border-warning/30 bg-warning/10",
        iconWrap: "bg-warning/20 text-warning",
        icon: "alert",
      };
    case "above":
    default:
      return {
        status: "above",
        title: "Above your limit",
        explanation: `This purchase exceeds your safe spending limit by ${remaining}. Buying it now would eat into your emergency reserve or push you over before payday.`,
        accentText: "text-danger",
        container: "border-danger/30 bg-danger/10",
        iconWrap: "bg-danger/20 text-danger",
        icon: "x",
      };
  }
}

export interface CalculationRow {
  id: string;
  label: string;
  /** The formula, rendered in a muted mono-ish style. */
  formula: string;
  value: string;
  /** Whether the value should be emphasised (final rows). */
  emphasis?: boolean;
  tone?: "default" | "positive" | "negative" | "accent";
}

/** Produce the transparent, step-by-step breakdown of the calculation. */
export function buildCalculationRows(
  result: AffordabilityResult,
): CalculationRow[] {
  return [
    {
      id: "projected",
      label: "Projected funds",
      formula: "balance + income − bills",
      value: formatCents(result.projectedFunds),
    },
    {
      id: "limit",
      label: "Safe spending limit",
      formula: "projected − reserve",
      value: formatCents(result.safeSpendingLimit),
    },
    {
      id: "purchase",
      label: "Purchase price",
      formula: "the item you're considering",
      value: formatCents(result.purchasePrice),
      tone: "default",
    },
    {
      id: "remaining",
      label: "Remaining after purchase",
      formula: "limit − purchase",
      value: formatCentsSigned(result.remainingAfterPurchase),
      emphasis: true,
      tone:
        result.remainingAfterPurchase < 0
          ? "negative"
          : result.remainingAfterPurchase === 0
            ? "default"
            : "positive",
    },
  ];
}
