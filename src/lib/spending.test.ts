import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  DEFAULT_EXPENSE_CATEGORY,
  EXPENSE_CATEGORIES,
  isExpenseCategory,
  normalizeCategory,
} from "@/lib/categories";
import {
  availablePeriods,
  computeSpendingSummary,
  formatMonthLabel,
  formatPercentage,
  monthKeyOf,
  shiftMonth,
} from "@/lib/spending";
import { eurosToCents } from "@/lib/money";
import type { FinancialEvent } from "@/lib/financial-data";

/**
 * Tests for the Spending Intelligence engine (Milestone 5): the category
 * taxonomy, period helpers, category totals, percentages, date boundaries,
 * empty periods, observations, and the exclusion of income/payday.
 */

const e = (euros: number) => eurosToCents(euros);

function expense(
  overrides: Partial<FinancialEvent> = {},
): FinancialEvent {
  return {
    id: "e1",
    description: "Expense",
    amount: -e(100),
    date: "2026-03-10",
    kind: "expense",
    confidence: "confirmed",
    category: "other",
    ...overrides,
  };
}

describe("category taxonomy", () => {
  it("exposes the nine required categories", () => {
    expect([...EXPENSE_CATEGORIES]).toEqual([
      "housing",
      "groceries",
      "utilities",
      "transportation",
      "health",
      "shopping",
      "entertainment",
      "subscriptions",
      "other",
    ]);
  });

  it("has a human label for every category", () => {
    for (const category of EXPENSE_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("recognises valid categories and rejects junk", () => {
    expect(isExpenseCategory("housing")).toBe(true);
    expect(isExpenseCategory("nonsense")).toBe(false);
    expect(isExpenseCategory(undefined)).toBe(false);
    expect(isExpenseCategory("")).toBe(false);
  });

  it("normalises missing/invalid categories to the default", () => {
    expect(normalizeCategory(undefined)).toBe(DEFAULT_EXPENSE_CATEGORY);
    expect(normalizeCategory("bogus")).toBe(DEFAULT_EXPENSE_CATEGORY);
    expect(normalizeCategory("groceries")).toBe("groceries");
  });
});

describe("period helpers", () => {
  it("extracts and formats month keys", () => {
    expect(monthKeyOf("2026-03-10")).toBe("2026-03");
    expect(formatMonthLabel("2026-03")).toBe("March 2026");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-03", -1)).toBe("2026-02");
  });

  it("formats percentages, trimming needless decimals", () => {
    expect(formatPercentage(50)).toBe("50%");
    expect(formatPercentage(33.333)).toBe("33.3%");
    expect(formatPercentage(0)).toBe("0%");
  });
});

describe("computeSpendingSummary — totals and categories", () => {
  it("sums only expenses in the selected month", () => {
    const events: FinancialEvent[] = [
      expense({ id: "a", amount: -e(200), date: "2026-03-01", category: "housing" }),
      expense({ id: "b", amount: -e(100), date: "2026-03-15", category: "groceries" }),
    ];
    const summary = computeSpendingSummary(events, "2026-03");
    expect(summary.totalExpenses).toBe(e(300));
    expect(summary.expenseCount).toBe(2);
    expect(summary.slices).toHaveLength(2);
  });

  it("excludes income and payday from expense totals", () => {
    const events: FinancialEvent[] = [
      expense({ id: "a", amount: -e(200), date: "2026-03-01", category: "housing" }),
      { ...expense({ id: "b" }), kind: "income", amount: e(5000), date: "2026-03-05", category: undefined },
      { ...expense({ id: "c" }), kind: "payday", amount: e(2450), date: "2026-03-20", category: undefined },
    ];
    const summary = computeSpendingSummary(events, "2026-03");
    expect(summary.totalExpenses).toBe(e(200));
    expect(summary.expenseCount).toBe(1);
    expect(summary.slices.map((s) => s.category)).toEqual(["housing"]);
  });

  it("groups expenses by category and sorts high to low", () => {
    const events: FinancialEvent[] = [
      expense({ id: "a", amount: -e(50), date: "2026-03-02", category: "groceries" }),
      expense({ id: "b", amount: -e(300), date: "2026-03-03", category: "housing" }),
      expense({ id: "c", amount: -e(100), date: "2026-03-04", category: "groceries" }),
    ];
    const summary = computeSpendingSummary(events, "2026-03");
    // housing 300, groceries 150
    expect(summary.slices[0]).toMatchObject({ category: "housing", amount: e(300), count: 1 });
    expect(summary.slices[1]).toMatchObject({ category: "groceries", amount: e(150), count: 2 });
    expect(summary.totalExpenses).toBe(e(450));
  });

  it("percentages are exact and reconcile to 100%", () => {
    const events: FinancialEvent[] = [
      expense({ id: "a", amount: -e(300), date: "2026-03-01", category: "housing" }),
      expense({ id: "b", amount: -e(100), date: "2026-03-02", category: "groceries" }),
    ];
    const summary = computeSpendingSummary(events, "2026-03");
    const housing = summary.slices.find((s) => s.category === "housing")!;
    const groceries = summary.slices.find((s) => s.category === "groceries")!;
    expect(housing.percentage).toBeCloseTo(75, 5);
    expect(groceries.percentage).toBeCloseTo(25, 5);
    const sum = summary.slices.reduce((total, s) => total + s.percentage, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it("treats a missing/invalid category as the default", () => {
    const events: FinancialEvent[] = [
      expense({ id: "a", amount: -e(100), date: "2026-03-01", category: undefined }),
      expense({ id: "b", amount: -e(50), date: "2026-03-02", category: "bogus" as never }),
    ];
    const summary = computeSpendingSummary(events, "2026-03");
    expect(summary.slices).toHaveLength(1);
    expect(summary.slices[0].category).toBe("other");
    expect(summary.slices[0].amount).toBe(e(150));
    expect(summary.slices[0].count).toBe(2);
  });
});



describe("computeSpendingSummary — date boundaries", () => {
  it("only counts expenses whose date falls in the selected month", () => {
    const events: FinancialEvent[] = [
      expense({ id: "a", amount: -e(100), date: "2026-02-28", category: "housing" }),
      expense({ id: "b", amount: -e(200), date: "2026-03-01", category: "housing" }),
      expense({ id: "c", amount: -e(300), date: "2026-03-31", category: "housing" }),
      expense({ id: "d", amount: -e(400), date: "2026-04-01", category: "housing" }),
    ];
    const summary = computeSpendingSummary(events, "2026-03");
    expect(summary.totalExpenses).toBe(e(500)); // March 1 + March 31 only
    expect(summary.expenseCount).toBe(2);
  });

  it("counts an expense on the last day of the month", () => {
    const events = [expense({ id: "a", amount: -e(100), date: "2026-02-28", category: "housing" })];
    expect(computeSpendingSummary(events, "2026-02").totalExpenses).toBe(e(100));
  });
});

describe("computeSpendingSummary — empty periods and zero spend", () => {
  it("returns a clean, empty summary when there are no expenses at all", () => {
    const summary = computeSpendingSummary([], "2026-03");
    expect(summary.totalExpenses).toBe(0);
    expect(summary.expenseCount).toBe(0);
    expect(summary.slices).toEqual([]);
    expect(summary.comparisonAvailable).toBe(false);
    expect(summary.changeVsPrevious).toBeNull();
    expect(summary.observations.join(" ")).toMatch(/no expenses are recorded/i);
  });

  it("returns an empty summary for a month with no expenses", () => {
    const events = [expense({ id: "a", amount: -e(100), date: "2026-01-10", category: "housing" })];
    const summary = computeSpendingSummary(events, "2026-03");
    expect(summary.totalExpenses).toBe(0);
    expect(summary.slices).toEqual([]);
    expect(summary.comparisonAvailable).toBe(false);
  });

  it("never divides by zero when producing percentages", () => {
    const summary = computeSpendingSummary([], "2026-03");
    for (const slice of summary.slices) {
      expect(Number.isFinite(slice.percentage)).toBe(true);
    }
  });
});

describe("computeSpendingSummary — month-over-month comparison", () => {
  it("reports no comparison when the previous month has no expenses", () => {
    const events = [expense({ id: "a", amount: -e(100), date: "2026-03-10", category: "housing" })];
    const summary = computeSpendingSummary(events, "2026-03");
    expect(summary.comparisonAvailable).toBe(false);
    expect(summary.changeVsPrevious).toBeNull();
    expect(summary.observations.join(" ")).toMatch(/isn't enough history/i);
  });

  it("computes the change when both months have expenses", () => {
    const events: FinancialEvent[] = [
      expense({ id: "a", amount: -e(300), date: "2026-03-10", category: "housing" }),
      expense({ id: "b", amount: -e(200), date: "2026-02-10", category: "housing" }),
    ];
    const summary = computeSpendingSummary(events, "2026-03");
    expect(summary.comparisonAvailable).toBe(true);
    expect(summary.changeVsPrevious).toBe(e(100)); // 100 more than February
    expect(summary.observations.join(" ")).toMatch(/more than in February 2026/i);
  });

  it("reports a decrease and no-change correctly", () => {
    const down: FinancialEvent[] = [
      expense({ id: "a", amount: -e(100), date: "2026-03-10", category: "housing" }),
      expense({ id: "b", amount: -e(250), date: "2026-02-10", category: "housing" }),
    ];
    expect(computeSpendingSummary(down, "2026-03").observations.join(" ")).toMatch(
      /less than in February 2026/i,
    );

    const flat: FinancialEvent[] = [
      expense({ id: "a", amount: -e(200), date: "2026-03-10", category: "housing" }),
      expense({ id: "b", amount: -e(200), date: "2026-02-10", category: "housing" }),
    ];
    expect(computeSpendingSummary(flat, "2026-03").observations.join(" ")).toMatch(
      /unchanged from February 2026/i,
    );
  });
});

describe("computeSpendingSummary — observations", () => {
  it("names the largest category and flags a majority category", () => {
    const events: FinancialEvent[] = [
      expense({ id: "a", amount: -e(800), date: "2026-03-01", category: "housing" }),
      expense({ id: "b", amount: -e(100), date: "2026-03-02", category: "groceries" }),
    ];
    const notes = computeSpendingSummary(events, "2026-03").observations.join(" ");
    expect(notes).toMatch(/largest category is Housing/i);
    expect(notes).toMatch(/more than half of your spending/i);
  });

  it("uses singular grammar for a single expense", () => {
    const events = [expense({ id: "a", amount: -e(100), date: "2026-03-01", category: "housing" })];
    const notes = computeSpendingSummary(events, "2026-03").observations.join(" ");
    expect(notes).toMatch(/1 expense across 1 category/i);
  });
});

describe("availablePeriods", () => {
  it("offers current and previous month plus any month with expenses", () => {
    const events: FinancialEvent[] = [
      expense({ id: "a", amount: -e(100), date: "2026-01-10", category: "housing" }),
    ];
    const periods = availablePeriods(events, "2026-03-08");
    const keys = periods.map((p) => p.key);
    expect(keys).toContain("2026-03"); // current
    expect(keys).toContain("2026-02"); // previous
    expect(keys).toContain("2026-01"); // has expenses
    expect(keys[0]).toBe("2026-03"); // newest first
  });

  it("marks whether each period has expenses", () => {
    const events = [expense({ id: "a", amount: -e(100), date: "2026-03-10", category: "housing" })];
    const periods = availablePeriods(events, "2026-03-08");
    const march = periods.find((p) => p.key === "2026-03")!;
    const feb = periods.find((p) => p.key === "2026-02")!;
    expect(march.hasExpenses).toBe(true);
    expect(feb.hasExpenses).toBe(false);
  });
});
