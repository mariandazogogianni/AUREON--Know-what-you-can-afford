import type { Cents } from "./money";

/**
 * The three possible outcomes of the affordability decision.
 *
 * - `within`  — the purchase fits comfortably within the safe spending limit.
 * - `caution` — the purchase fits, but leaves little room for the unexpected.
 * - `above`   — the purchase exceeds the safe spending limit.
 */
export type AffordabilityStatus = "within" | "caution" | "above";

/** Raw, already-validated monetary inputs (all values in integer cents). */
export interface AffordabilityInput {
  /** Money currently available in the bank. */
  currentBalance: Cents;
  /** Income expected to arrive before the next payday. */
  expectedIncome: Cents;
  /** Bills and essential expenses due before the next payday. */
  upcomingExpenses: Cents;
  /** User-defined buffer that must be preserved at all times. */
  emergencyReserve: Cents;
  /** Price of the purchase being considered. */
  purchasePrice: Cents;
}

/** The full, transparent result of an affordability calculation. */
export interface AffordabilityResult {
  /** currentBalance + expectedIncome − upcomingExpenses */
  projectedFunds: Cents;
  /** projectedFunds − emergencyReserve */
  safeSpendingLimit: Cents;
  /** safeSpendingLimit − purchasePrice */
  remainingAfterPurchase: Cents;
  /** Echo of the purchase price, for convenient rendering. */
  purchasePrice: Cents;
  /** The decision bucket. */
  status: AffordabilityStatus;
  /**
   * The size of the "comfort buffer" used to distinguish `within` from
   * `caution`. Equal to `safeSpendingLimit * CAUTION_RATIO`.
   */
  cautionBuffer: Cents;
}

/**
 * Fraction of the safe spending limit that must remain after a purchase for
 * the decision to be `within` rather than `caution`. 10% is a deliberately
 * modest, explainable buffer — enough to absorb a small unexpected cost.
 */
export const CAUTION_RATIO = 0.1;

/**
 * Compute the affordability decision from validated cent amounts.
 *
 * Formulas (see spec):
 *   projected funds      = current balance + expected income − upcoming expenses
 *   safe spending limit  = projected funds − emergency reserve
 *   remaining (post-buy) = safe spending limit − purchase price
 *
 * Decision rules:
 *   - `above`  when remaining < 0 (the purchase exceeds the safe limit).
 *   - `caution` when the purchase fits but leaves a buffer smaller than
 *     `cautionBuffer`, OR when projected funds are already at/below zero so the
 *     overall situation is fragile regardless of the purchase.
 *   - `within` otherwise.
 *
 * This function is pure and never throws; it assumes inputs have already been
 * validated as finite, non-negative integers.
 */
export function computeAffordability(input: AffordabilityInput): AffordabilityResult {
  const projectedFunds =
    input.currentBalance + input.expectedIncome - input.upcomingExpenses;

  const safeSpendingLimit = projectedFunds - input.emergencyReserve;

  const remainingAfterPurchase = safeSpendingLimit - input.purchasePrice;

  const cautionBuffer = Math.round(safeSpendingLimit * CAUTION_RATIO);

  const status = decideStatus({
    purchasePrice: input.purchasePrice,
    remainingAfterPurchase,
    projectedFunds,
    safeSpendingLimit,
    cautionBuffer,
  });

  return {
    projectedFunds,
    safeSpendingLimit,
    remainingAfterPurchase,
    purchasePrice: input.purchasePrice,
    status,
    cautionBuffer,
  };
}

interface DecideInput {
  purchasePrice: Cents;
  remainingAfterPurchase: Cents;
  projectedFunds: Cents;
  safeSpendingLimit: Cents;
  cautionBuffer: Cents;
}

function decideStatus(input: DecideInput): AffordabilityStatus {
  const { purchasePrice, remainingAfterPurchase, projectedFunds, cautionBuffer } =
    input;

  // An actual purchase that overshoots the safe limit cannot be made without
  // eating into the reserve — it is above the configured limit. A zero-price
  // "purchase" is never "above your limit"; there is nothing being bought.
  if (purchasePrice > 0 && remainingAfterPurchase < 0) {
    return "above";
  }

  // Projected funds are already exhausted before any purchase. The situation is
  // fragile and warrants a closer look even if the price itself is zero.
  if (projectedFunds <= 0) {
    return "caution";
  }

  // The purchase fits, but only just — little room left for surprises.
  if (remainingAfterPurchase < cautionBuffer) {
    return "caution";
  }

  return "within";
}
