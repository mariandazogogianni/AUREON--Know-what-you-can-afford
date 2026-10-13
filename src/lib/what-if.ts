import type { Cents } from "./money";
import { parseEuroInput } from "./money";
import {
  computeAffordability,
  type AffordabilityResult,
} from "./finance";
import {
  computeCashFlowProjection,
  type CashFlowProjection,
  type TimelineEvent,
  type TimelineLowest,
} from "./timeline";

/**
 * "What-If Simulator" engine (Milestone 4).
 *
 * Lets a user explore a hypothetical purchase (and an optional recurring
 * monthly savings commitment) on top of their *current* saved position,
 * without changing anything that is stored.
 *
 * Design principles:
 * - Pure and side-effect free. It never mutates its inputs: the hypothetical
 *   purchase is injected into a **copy** of the event list, so the caller's
 *   saved `events` array is left exactly as it was. (Asserted by tests.)
 * - It reuses the existing pure engines rather than re-implementing any money
 *   maths: `computeAffordability` for the purchase decision and
 *   `computeCashFlowProjection` for the before-payday cash-flow warning.
 * - All money is integer cents; all dates are ISO strings (see `./money`,
 *   `./timeline`).
 *
 * How the two inputs are modelled (and stated to the user as assumptions):
 * - The **purchase** is a one-off outflow treated as happening today, so it is
 *   injected as a same-day expense and therefore shows up in the pre-payday
 *   cash-flow projection.
 * - The **monthly savings** is a recurring commitment. Money you commit to save
 *   is money you can no longer spend freely, so it is treated as *additional
 *   protection* alongside the emergency reserve when judging the purchase. It is
 *   deliberately NOT injected into the pre-payday cash-flow projection, because
 *   payday falls within the same month and a recurring monthly saving has not
 *   yet occurred by then — this keeps the "before payday" figure honest.
 */

/** The read-only baseline the scenario is layered on top of (from saved data). */
export interface WhatIfBaseline {
  /** Money in the account right now. */
  currentBalance: Cents;
  /** Configured emergency reserve. */
  emergencyReserve: Cents;
  /** Expected income strictly before payday (derived from saved events). */
  expectedIncome: Cents;
  /** Upcoming expenses strictly before payday (derived from saved events). */
  upcomingExpenses: Cents;
  /** The saved events — read-only; never mutated by the engine. */
  events: readonly TimelineEvent[];
  /** ISO date used as "today" for the injected hypothetical purchase. */
  today: string;
}

/** The hypothetical inputs (both non-negative integer cents). */
export interface WhatIfInput extends WhatIfBaseline {
  /** Hypothetical one-off purchase amount (>= 0). */
  purchase: Cents;
  /** Hypothetical recurring monthly savings amount (>= 0). */
  monthlySavings: Cents;
}

/** The full, transparent result of a what-if scenario. */
export interface WhatIfResult {
  /** Echo of the hypothetical purchase amount. */
  purchaseAmount: Cents;
  /** Echo of the hypothetical monthly savings amount. */
  monthlySavings: Cents;
  /** Amount protected by the reserve + the monthly savings commitment. */
  protectedAmount: Cents;
  /** The purchase decision, reusing the affordability engine. */
  affordability: AffordabilityResult;
  /** The cash-flow projection with the hypothetical purchase injected. */
  projection: CashFlowProjection;
  /**
   * Projected account balance right before payday, after the hypothetical
   * purchase. Equals `projectedFunds − purchase`, i.e. balance + income −
   * bills − purchase. (Equals the projection's `closingBalanceBeforePayday`
   * whenever today is before the next payday — asserted by tests.)
   */
  projectedBalanceBeforePayday: Cents;
  /** True when the scenario drives the balance below zero before payday. */
  createsCashFlowWarning: boolean;
  /** True when the scenario dips below the *configured* reserve before payday. */
  dipsIntoConfiguredReserve: boolean;
  /** The lowest projected balance before payday, and when it occurs. */
  lowestBeforePayday: TimelineLowest;
}

/** Reserved id for the injected hypothetical purchase event. */
const WHATIF_PURCHASE_ID = "__whatif_purchase__";

/** Clamp to a non-negative integer number of cents. */
function nonNegativeCents(value: Cents): Cents {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * Parse an optional what-if amount. An empty field is a valid "zero" (the user
 * simply hasn't entered anything); anything else must parse as a non-negative
 * euro amount. Returns a structured error for invalid input so the UI can show
 * a precise message. Kept pure so validation is unit-testable without React.
 */
export function parseWhatIfAmount(raw: string): { value: Cents; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: 0 };
  const outcome = parseEuroInput(raw);
  if (outcome.ok) return { value: outcome.cents };
  return { value: 0, error: outcome.error };
}

/**
 * Compute the projected impact of a hypothetical scenario. Pure: it does not
 * mutate `input.events` (it spreads them into a fresh array first).
 */
export function computeWhatIfScenario(input: WhatIfInput): WhatIfResult {
  const purchase = nonNegativeCents(input.purchase);
  const monthlySavings = nonNegativeCents(input.monthlySavings);

  // 1. Purchase decision — reuse the affordability engine. The monthly savings
  //    commitment is treated as extra protected money on top of the reserve.
  const affordability = computeAffordability({
    currentBalance: input.currentBalance,
    expectedIncome: input.expectedIncome,
    upcomingExpenses: input.upcomingExpenses,
    emergencyReserve: input.emergencyReserve + monthlySavings,
    purchasePrice: purchase,
  });

  // 2. Cash-flow projection — inject the purchase as a same-day expense into a
  //    COPY of the events. The saved events array is never touched.
  const scenarioEvents: TimelineEvent[] = [...input.events];
  if (purchase > 0) {
    scenarioEvents.push({
      id: WHATIF_PURCHASE_ID,
      description: "What-if purchase",
      amount: -purchase,
      date: input.today,
      kind: "expense",
      confidence: "confirmed",
    });
  }

  const projection = computeCashFlowProjection({
    openingBalance: input.currentBalance,
    reserve: input.emergencyReserve,
    events: scenarioEvents,
  });

  const lowest = projection.lowestBeforePayday;
  const createsCashFlowWarning = lowest.balance < 0;
  const dipsIntoConfiguredReserve =
    projection.hasReserve && lowest.balance < projection.reserve;

  return {
    purchaseAmount: purchase,
    monthlySavings,
    protectedAmount: input.emergencyReserve + monthlySavings,
    affordability,
    projection,
    // Always reflects the purchase, independent of payday timing.
    projectedBalanceBeforePayday: affordability.projectedFunds - purchase,
    createsCashFlowWarning,
    dipsIntoConfiguredReserve,
    lowestBeforePayday: lowest,
  };
}

