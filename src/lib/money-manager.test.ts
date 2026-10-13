import { describe, expect, it } from "vitest";
import {
  addEvent,
  defaultFinancialData,
  removeEvent,
  updateEvent,
  updateSettings,
  type EventDraft,
} from "@/lib/financial-data";
import { computeCashFlowProjection } from "@/lib/timeline";
import { computeAffordability } from "@/lib/finance";
import { eurosToCents } from "@/lib/money";

/**
 * Integration tests for the Money Manager (Milestone 3).
 *
 * These tie the pure engines together the way the orchestrator hook does, to
 * prove the two headline guarantees that only emerge once the pieces are wired:
 *
 *  1. Recalculation: adding, editing or deleting an event moves BOTH the Money
 *     Timeline projection AND the affordability result, from the same source.
 *  2. No double-counting: the income/expenses the affordability calculator uses
 *     are exactly the timeline's pre-payday totals, derived from one event list.
 */

const FIXED_TODAY = new Date(2026, 2, 8);

function expenseDraft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    description: "New bill",
    amount: eurosToCents(80),
    date: "2026-03-11",
    kind: "expense",
    confidence: "confirmed",
    ...overrides,
  };
}

/** Mirror of what the orchestrator feeds the affordability engine. */
function view(data: ReturnType<typeof defaultFinancialData>) {
  const projection = computeCashFlowProjection({
    openingBalance: data.settings.currentBalance,
    reserve: data.settings.emergencyReserve,
    events: data.events,
  });
  const result = computeAffordability({
    currentBalance: data.settings.currentBalance,
    expectedIncome: projection.totalIncomeBeforePayday,
    upcomingExpenses: projection.totalExpensesBeforePayday,
    emergencyReserve: data.settings.emergencyReserve,
    purchasePrice: data.settings.purchasePrice,
  });
  return {
    projection,
    result,
    upcomingExpenses: projection.totalExpensesBeforePayday,
    expectedIncome: projection.totalIncomeBeforePayday,
  };
}

describe("Money Manager integration", () => {
  it("feeding events into affordability uses the timeline totals exactly once", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const { projection, result } = view(data);
    // The income/expenses baked into the affordability result are precisely the
    // projection's pre-payday totals — no second, independent copy of the money.
    expect(result.projectedFunds).toBe(
      data.settings.currentBalance +
        projection.totalIncomeBeforePayday -
        projection.totalExpensesBeforePayday,
    );
  });

  it("adding an expense lowers projected funds by exactly that amount", () => {
    const before = view(defaultFinancialData(FIXED_TODAY));

    const withBill = addEvent(
      defaultFinancialData(FIXED_TODAY),
      expenseDraft({ amount: eurosToCents(50) }),
    );
    const after = view(withBill);

    expect(after.upcomingExpenses).toBe(before.upcomingExpenses + eurosToCents(50));
    expect(after.result.projectedFunds).toBe(
      before.result.projectedFunds - eurosToCents(50),
    );
    expect(after.result.safeSpendingLimit).toBe(
      before.result.safeSpendingLimit - eurosToCents(50),
    );
  });

  it("adding income raises projected funds by exactly that amount", () => {
    const before = view(defaultFinancialData(FIXED_TODAY));

    const withIncome = addEvent(
      defaultFinancialData(FIXED_TODAY),
      expenseDraft({ description: "Side gig", amount: eurosToCents(120), kind: "income" }),
    );
    const after = view(withIncome);

    expect(after.expectedIncome).toBe(before.expectedIncome + eurosToCents(120));
    expect(after.result.projectedFunds).toBe(
      before.result.projectedFunds + eurosToCents(120),
    );
  });

  it("editing an event's amount is reflected exactly once (not added on top)", () => {
    const base = defaultFinancialData(FIXED_TODAY);
    const target = base.events.find((e) => e.kind === "expense")!;
    const before = view(base);

    // A stored expense keeps a negative amount (the app applies the sign via
    // `signedAmount` on edit), so we edit it to a new negative magnitude.
    const edited = updateEvent(base, target.id, { amount: -eurosToCents(200) });
    const after = view(edited);

    // The old expense magnitude is replaced, not summed with the new one.
    const delta = after.upcomingExpenses - before.upcomingExpenses;
    expect(delta).toBe(eurosToCents(200) - Math.abs(target.amount));
    // And the event count is unchanged — an edit is not an add.
    expect(edited.events.length).toBe(base.events.length);
  });

  it("deleting an event removes its effect from both views", () => {
    const base = defaultFinancialData(FIXED_TODAY);
    const target = base.events.find((e) => e.kind === "expense")!;
    const before = view(base);

    const removed = removeEvent(base, target.id);
    const after = view(removed);

    expect(after.upcomingExpenses).toBe(
      before.upcomingExpenses - Math.abs(target.amount),
    );
    expect(removed.events.some((e) => e.id === target.id)).toBe(false);
  });

  it("changing the emergency reserve does not touch the event-derived totals", () => {
    const base = defaultFinancialData(FIXED_TODAY);
    const before = view(base);

    const tuned = updateSettings(base, { emergencyReserve: eurosToCents(900) });
    const after = view(tuned);

    // Reserve only shifts the safe limit, never the income/expense subtotals.
    expect(after.upcomingExpenses).toBe(before.upcomingExpenses);
    expect(after.expectedIncome).toBe(before.expectedIncome);
    expect(after.result.projectedFunds).toBe(before.result.projectedFunds);
    expect(after.result.safeSpendingLimit).toBe(
      before.result.safeSpendingLimit - eurosToCents(400),
    );
  });

  it("a purchase that overshoots is flagged 'above' once enough bills are added", () => {
    const base = defaultFinancialData(FIXED_TODAY);
    expect(view(base).result.status).not.toBe("above");

    // Pile on a large expense so the purchase no longer fits the safe limit.
    const strained = addEvent(base, expenseDraft({ amount: eurosToCents(1500) }));
    expect(view(strained).result.status).toBe("above");
  });
});
