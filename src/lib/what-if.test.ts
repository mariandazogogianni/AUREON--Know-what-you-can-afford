import { describe, expect, it } from "vitest";
import {
  computeWhatIfScenario,
  parseWhatIfAmount,
  type WhatIfBaseline,
} from "@/lib/what-if";
import { eurosToCents, type Cents } from "@/lib/money";
import { addDaysToIso, computeCashFlowProjection } from "@/lib/timeline";
import { demoTimelineEvents } from "@/lib/sample-data";

/**
 * Tests for the What-If Simulator engine (Milestone 4).
 *
 * Covers: projected calculations, invalid/edge inputs, reserve thresholds,
 * cash-flow warnings, and — crucially — the guarantee that a scenario never
 * mutates the saved financial data it is layered on top of.
 */

const FIXED_TODAY = new Date(2026, 2, 8); // 8 March 2026 local
const TODAY_ISO = "2026-03-08";

/** A simple, fully-controlled baseline (no dependency on the demo dataset). */
function baseline(overrides: Partial<WhatIfBaseline> = {}): WhatIfBaseline {
  return {
    currentBalance: eurosToCents(1000),
    emergencyReserve: eurosToCents(200),
    expectedIncome: eurosToCents(0),
    upcomingExpenses: eurosToCents(0),
    events: [],
    today: TODAY_ISO,
    ...overrides,
  };
}

/** Convenience wrapper matching the component's call shape. */
function run(
  base: WhatIfBaseline,
  purchase: number,
  monthlySavings = 0,
) {
  return computeWhatIfScenario({
    ...base,
    purchase: eurosToCents(purchase),
    monthlySavings: eurosToCents(monthlySavings),
  });
}

describe("parseWhatIfAmount", () => {
  it("treats an empty field as a valid zero", () => {
    expect(parseWhatIfAmount("")).toEqual({ value: 0 });
    expect(parseWhatIfAmount("   ")).toEqual({ value: 0 });
  });

  it("parses valid euro amounts", () => {
    expect(parseWhatIfAmount("0").value).toBe(0);
    expect(parseWhatIfAmount("99.99").value).toBe(9999);
    expect(parseWhatIfAmount("1 234,56").value).toBe(123456);
  });

  it("returns an error for invalid values (never throws)", () => {
    expect(parseWhatIfAmount("abc").error).toBeTruthy();
    expect(parseWhatIfAmount("-50").error).toMatch(/negative/i);
    // Bad thousands grouping is rejected rather than guessed.
    expect(parseWhatIfAmount("12,34,56").error).toBeTruthy();
    expect(parseWhatIfAmount(".").error).toBeTruthy();
    // Value falls back to 0 so the UI has a safe number to work with.
    expect(parseWhatIfAmount("abc").value).toBe(0);
  });
});

describe("computeWhatIfScenario — core calculation", () => {
  it("subtracts the purchase from projected funds", () => {
    const result = run(baseline(), 300);
    // 1000 balance + 0 income − 0 bills = 1000 projected funds; −300 purchase.
    expect(result.affordability.projectedFunds).toBe(eurosToCents(1000));
    expect(result.projectedBalanceBeforePayday).toBe(eurosToCents(700));
    expect(result.purchaseAmount).toBe(eurosToCents(300));
  });

  it("accounts for existing income and expenses in the baseline", () => {
    const base = baseline({
      expectedIncome: eurosToCents(500),
      upcomingExpenses: eurosToCents(200),
    });
    const result = run(base, 100);
    // 1000 + 500 − 200 = 1300 projected; −100 purchase = 1200.
    expect(result.affordability.projectedFunds).toBe(eurosToCents(1300));
    expect(result.projectedBalanceBeforePayday).toBe(eurosToCents(1200));
  });

  it("treats a monthly savings commitment as extra protection", () => {
    const base = baseline({ emergencyReserve: eurosToCents(200) });
    const withoutSavings = run(base, 100, 0);
    const withSavings = run(base, 100, 300);

    // Protected amount grows by the savings commitment.
    expect(withoutSavings.protectedAmount).toBe(eurosToCents(200));
    expect(withSavings.protectedAmount).toBe(eurosToCents(500));

    // Safe spending limit shrinks accordingly (reserve + savings protected).
    expect(withSavings.affordability.safeSpendingLimit).toBe(
      withoutSavings.affordability.safeSpendingLimit - eurosToCents(300),
    );

    // The projected balance is unaffected by the savings commitment itself
    // (it protects money rather than spending it before payday).
    expect(withSavings.projectedBalanceBeforePayday).toBe(
      withoutSavings.projectedBalanceBeforePayday,
    );
  });

  it("reuses the affordability engine's status for the decision", () => {
    // A purchase far beyond the safe limit is flagged 'above'.
    const big = run(baseline({ emergencyReserve: eurosToCents(900) }), 500);
    expect(big.affordability.status).toBe("above");

    // A modest purchase with headroom is 'within'.
    const small = run(baseline(), 100);
    expect(small.affordability.status).toBe("within");
  });
});

describe("computeWhatIfScenario — reserve thresholds", () => {
  it("does not flag a reserve breach when the balance stays above the reserve", () => {
    const base = baseline({
      currentBalance: eurosToCents(1000),
      emergencyReserve: eurosToCents(200),
    });
    const result = run(base, 100); // leaves 900 — well above reserve
    expect(result.dipsIntoConfiguredReserve).toBe(false);
    expect(result.createsCashFlowWarning).toBe(false);
  });

  it("flags a reserve dip when the purchase eats into the reserve", () => {
    const base = baseline({
      currentBalance: eurosToCents(1000),
      emergencyReserve: eurosToCents(200),
    });
    // Spend 900 of 1000 → 100 left, below the 200 reserve but above zero.
    const result = run(base, 900);
    expect(result.projectedBalanceBeforePayday).toBe(eurosToCents(100));
    expect(result.createsCashFlowWarning).toBe(false);
    expect(result.dipsIntoConfiguredReserve).toBe(true);
  });

  it("never flags a reserve breach when no reserve is configured", () => {
    const base = baseline({ emergencyReserve: eurosToCents(0) });
    const result = run(base, 500);
    expect(result.dipsIntoConfiguredReserve).toBe(false);
  });
});

describe("computeWhatIfScenario — cash-flow warnings", () => {
  it("does not warn for a comfortable purchase", () => {
    const result = run(baseline({ currentBalance: eurosToCents(2000) }), 300);
    expect(result.createsCashFlowWarning).toBe(false);
    expect(result.lowestBeforePayday.balance).toBeGreaterThan(0);
  });

  it("warns when the purchase drives the balance below zero before payday", () => {
    const result = run(baseline({ currentBalance: eurosToCents(300) }), 500);
    expect(result.projectedBalanceBeforePayday).toBe(eurosToCents(-200));
    expect(result.createsCashFlowWarning).toBe(true);
    expect(result.lowestBeforePayday.balance).toBeLessThan(0);
  });

  it("considers upcoming bills when judging the before-payday low point", () => {
    // Balance 400, a 300 bill before payday, then a 200 purchase today.
    const base = baseline({
      currentBalance: eurosToCents(400),
      upcomingExpenses: eurosToCents(300),
      events: [
        {
          id: "bill",
          description: "Bill",
          amount: -eurosToCents(300),
          date: addDaysToIso(TODAY_ISO, 2),
          kind: "expense",
          confidence: "confirmed",
        },
      ],
    });
    const result = run(base, 200);
    // 400 − 200 (purchase) − 300 (bill) = −100 → below zero.
    expect(result.createsCashFlowWarning).toBe(true);
  });

  it("keeps the pre-payday projection consistent with the injected purchase", () => {
    // Mirror the orchestrator: derive income/expenses from the SAME events, so
    // the baseline totals and the projection describe one set of money.
    const events = demoTimelineEvents(FIXED_TODAY);
    const baseProjection = computeCashFlowProjection({
      openingBalance: eurosToCents(1000),
      reserve: 0,
      events,
    });
    const base = baseline({
      currentBalance: eurosToCents(1000),
      events,
      expectedIncome: baseProjection.totalIncomeBeforePayday,
      upcomingExpenses: baseProjection.totalExpensesBeforePayday,
    });

    const result = run(base, 250);
    // With today before the next payday, the projected balance before payday
    // equals the projection's closing balance before payday — the purchase is
    // counted exactly once, as a same-day expense.
    expect(result.projectedBalanceBeforePayday).toBe(
      result.projection.closingBalanceBeforePayday,
    );
  });
});

describe("computeWhatIfScenario — edge cases", () => {
  it("treats a zero purchase as a no-op scenario", () => {
    const result = run(baseline(), 0);
    expect(result.purchaseAmount).toBe(0);
    expect(result.projectedBalanceBeforePayday).toBe(
      result.affordability.projectedFunds,
    );
    // No purchase event is injected, so the projection matches the baseline.
    expect(result.projection.entries).toHaveLength(0);
  });

  it("clamps negative inputs to zero instead of producing nonsense", () => {
    const result = computeWhatIfScenario({
      ...baseline(),
      purchase: -eurosToCents(100) as Cents,
      monthlySavings: -eurosToCents(50) as Cents,
    });
    expect(result.purchaseAmount).toBe(0);
    expect(result.monthlySavings).toBe(0);
    expect(result.protectedAmount).toBe(baseline().emergencyReserve);
  });

  it("never throws on a fully empty baseline", () => {
    const empty = baseline({
      currentBalance: 0,
      emergencyReserve: 0,
      expectedIncome: 0,
      upcomingExpenses: 0,
      events: [],
    });
    expect(() => run(empty, 0)).not.toThrow();
  });
});



describe("computeWhatIfScenario — isolation from saved data", () => {
  it("does not mutate the saved events array", () => {
    const events = demoTimelineEvents(FIXED_TODAY);
    const snapshot = JSON.parse(JSON.stringify(events)); // deep copy for comparison
    const base = baseline({ events });

    run(base, 500);
    run(base, 500, 300);

    // The saved events array is byte-for-byte unchanged.
    expect(events).toEqual(snapshot);
    expect(events.length).toBe(snapshot.length);
  });

  it("injects the hypothetical purchase only into its own projection", () => {
    const events = demoTimelineEvents(FIXED_TODAY);
    const base = baseline({ events });

    const withPurchase = run(base, 500);
    const withoutPurchase = run(base, 0);

    // The scenario projection has exactly one more entry (the purchase)…
    expect(withPurchase.projection.entries.length).toBe(
      withoutPurchase.projection.entries.length + 1,
    );
    // …but the original events array is untouched.
    expect(events.length).toBe(withoutPurchase.projection.entries.length);

    // The injected purchase is identifiable and negative (money out).
    const injected = withPurchase.projection.entries.find(
      (entry) => entry.event.id === "__whatif_purchase__",
    );
    expect(injected).toBeDefined();
    expect(injected!.event.amount).toBe(-eurosToCents(500));
  });

  it("returns a fresh events array from the projection, not the input", () => {
    const events = demoTimelineEvents(FIXED_TODAY);
    const result = run(baseline({ events }), 100);
    // The projection's ordered entries are derived from a copy; mutating the
    // result can never reach back into the caller's array.
    expect(result.projection.entries).not.toBe(events);
  });

  it("is a pure function — identical inputs yield identical outputs", () => {
    const base = baseline({
      events: demoTimelineEvents(FIXED_TODAY),
      expectedIncome: eurosToCents(100),
      upcomingExpenses: eurosToCents(50),
    });
    const a = run(base, 275, 40);
    const b = run(base, 275, 40);
    expect(a).toEqual(b);
  });
});
