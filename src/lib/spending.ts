import type { Cents } from "./money";
import { formatCents } from "./money";
import {
  CATEGORY_LABELS,
  normalizeCategory,
  type ExpenseCategory,
} from "./categories";
import type { FinancialEvent } from "./financial-data";

/**
 * Spending Intelligence engine (Milestone 5).
 *
 * Turns the user's expense events into a trustworthy breakdown: total spend for
 * a period, a per-category total, each category's share of the whole, and a few
 * observations derived strictly from the numbers. It is pure and contains no
 * financial arithmetic of its own beyond summing integer cents — the money
 * utilities in `./money` and the ISO-date helpers in `./timeline` do the work.
 *
 * Trust rules baked into this module:
 * - Only `expense` events are counted. Income and payday are always excluded.
 * - Every category's percentage is `amount / total * 100`, so the parts always
 *   reconcile to the whole (within rounding). Percentages are exposed as exact
 *   numbers and only rounded for display.
 * - Observations are facts about the data (largest category, count, whether one
 *   category dominates). No trends or habits are invented: if there is no
 *   comparable prior period, the comparison is reported as unavailable rather
 *   than fabricated.
 */

/** A calendar month identifier, `YYYY-MM`. */
export type MonthKey = string;

/** One row of the category breakdown. */
export interface CategorySlice {
  category: ExpenseCategory;
  label: string;
  /** Total spend in this category for the period (positive cents). */
  amount: Cents;
  /** Number of expense events in this category. */
  count: number;
  /** Share of total spend, 0–100 (exact, unrounded). */
  percentage: number;
}

/** A period the user can select. */
export interface PeriodOption {
  key: MonthKey;
  label: string;
  /** Whether any expense falls in this period. */
  hasExpenses: boolean;
}

/** The full, transparent result for one selected period. */
export interface SpendingSummary {
  /** The selected period. */
  period: MonthKey;
  periodLabel: string;
  /** Total expenses for the period (positive cents; 0 when none). */
  totalExpenses: Cents;
  /** Number of expense events in the period. */
  expenseCount: number;
  /** Per-category totals, sorted high → low. Empty when there are no expenses. */
  slices: CategorySlice[];
  /** The previous calendar month, for comparison. */
  previousPeriod: MonthKey;
  previousPeriodLabel: string;
  /** Total expenses in the previous period (positive cents). */
  previousTotalExpenses: Cents;
  /**
   * True when both the current and previous periods have expenses, so a
   * month-over-month comparison is meaningful. False otherwise — the UI must
   * then explain that there is not enough history rather than show a trend.
   */
  comparisonAvailable: boolean;
  /**
   * Change vs the previous period in cents (`total − previousTotal`). Only
   * meaningful when `comparisonAvailable`; otherwise it is `null`.
   */
  changeVsPrevious: Cents | null;
  /** Factual observations derived strictly from the data (never habits). */
  observations: string[];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Extract the `YYYY-MM` key from an ISO date. */
export function monthKeyOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7);
}

/** Parse a `YYYY-MM` key into its numeric year and (1-based) month. */
function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

/** A human label for a month key, e.g. "March 2026". */
export function formatMonthLabel(key: MonthKey): string {
  const { year, month } = parseMonthKey(key);
  const name = MONTH_NAMES[month - 1] ?? "Unknown";
  return `${name} ${year}`;
}

/** Shift a month key by a (possibly negative) number of months. */
export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  // month is 1-based; convert to a 0-based absolute month index for arithmetic.
  const absolute = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(absolute / 12);
  const newMonth = (absolute % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

/** The set of month keys that actually contain expense events, newest first. */
export function availablePeriods(
  events: readonly FinancialEvent[],
  today: string,
): PeriodOption[] {
  const currentKey = monthKeyOf(today);
  const monthsWithExpenses = new Set<MonthKey>();
  for (const event of events) {
    if (event.kind === "expense") monthsWithExpenses.add(monthKeyOf(event.date));
  }

  // Always offer the current and previous month (the common choices), plus any
  // other month that has expenses, newest first.
  const keys = new Set<MonthKey>([currentKey, shiftMonth(currentKey, -1)]);
  for (const key of monthsWithExpenses) keys.add(key);

  return [...keys]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((key) => ({
      key,
      label: formatMonthLabel(key),
      hasExpenses: monthsWithExpenses.has(key),
    }));
}

/**
 * Compute the full spending breakdown for a period. Pure: it never mutates the
 * events and never touches storage.
 *
 * @param events      All saved events (income/payday are ignored).
 * @param period      The `YYYY-MM` period to summarise.
 */
export function computeSpendingSummary(
  events: readonly FinancialEvent[],
  period: MonthKey,
): SpendingSummary {
  const previousPeriod = shiftMonth(period, -1);

  const current = summarizeMonth(events, period);
  const previous = summarizeMonth(events, previousPeriod);

  const totalExpenses = current.total;
  const slices = buildSlices(current.byCategory, totalExpenses);

  const comparisonAvailable =
    current.count > 0 && previous.count > 0;
  const changeVsPrevious = comparisonAvailable
    ? totalExpenses - previous.total
    : null;

  const summary: SpendingSummary = {
    period,
    periodLabel: formatMonthLabel(period),
    totalExpenses,
    expenseCount: current.count,
    slices,
    previousPeriod,
    previousPeriodLabel: formatMonthLabel(previousPeriod),
    previousTotalExpenses: previous.total,
    comparisonAvailable,
    changeVsPrevious,
    observations: [],
  };

  summary.observations = buildObservations(summary);
  return summary;
}

interface MonthAggregate {
  total: Cents;
  count: number;
  byCategory: Map<ExpenseCategory, { amount: Cents; count: number }>;
}

/** Sum the expenses in one month into per-category buckets. */
function summarizeMonth(
  events: readonly FinancialEvent[],
  period: MonthKey,
): MonthAggregate {
  const byCategory = new Map<ExpenseCategory, { amount: Cents; count: number }>();
  let total = 0;
  let count = 0;

  for (const event of events) {
    // Only expenses count toward spending; income and payday are excluded.
    if (event.kind !== "expense") continue;
    if (monthKeyOf(event.date) !== period) continue;

    const magnitude = Math.abs(event.amount);
    const category = normalizeCategory(event.category);
    const bucket = byCategory.get(category) ?? { amount: 0, count: 0 };
    bucket.amount += magnitude;
    bucket.count += 1;
    byCategory.set(category, bucket);

    total += magnitude;
    count += 1;
  }

  return { total, count, byCategory };
}

/** Turn category buckets into display-ready slices, sorted high → low. */
function buildSlices(
  byCategory: Map<ExpenseCategory, { amount: Cents; count: number }>,
  total: Cents,
): CategorySlice[] {
  return [...byCategory.entries()]
    .map(([category, { amount, count }]) => ({
      category,
      label: CATEGORY_LABELS[category],
      amount,
      count,
      // Guard against divide-by-zero: with no spend there are no slices anyway.
      percentage: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) =>
      b.amount !== a.amount ? b.amount - a.amount : a.label.localeCompare(b.label),
    );
}

/**
 * Produce factual observations strictly from the data. These are descriptions
 * of what the numbers show for this period — never claims about habits, and
 * never a trend unless a real prior period exists.
 */
function buildObservations(summary: SpendingSummary): string[] {
  const notes: string[] = [];

  if (summary.expenseCount === 0) {
    notes.push(
      `No expenses are recorded for ${summary.periodLabel}, so there is nothing to break down yet.`,
    );
    return notes;
  }

  const top = summary.slices[0];
  notes.push(
    `Your largest category is ${top.label} at ${formatCents(top.amount)}, ` +
      `${formatPercentage(top.percentage)} of your ${formatCents(summary.totalExpenses)} total.`,
  );

  // A single category accounting for the majority is a factual, useful signal.
  if (top.percentage >= 50) {
    notes.push(
      `${top.label} alone makes up more than half of your spending this period.`,
    );
  }

  notes.push(
    `You have ${summary.expenseCount} ${
      summary.expenseCount === 1 ? "expense" : "expenses"
    } across ${summary.slices.length} ${
      summary.slices.length === 1 ? "category" : "categories"
    }.`,
  );

  // Only state a month-over-month change when a real prior period exists.
  if (summary.comparisonAvailable && summary.changeVsPrevious !== null) {
    const change = summary.changeVsPrevious;
    if (change === 0) {
      notes.push(
        `Your total is unchanged from ${summary.previousPeriodLabel}.`,
      );
    } else if (change > 0) {
      notes.push(
        `You spent ${formatCents(change)} more than in ${summary.previousPeriodLabel}.`,
      );
    } else {
      notes.push(
        `You spent ${formatCents(Math.abs(change))} less than in ${summary.previousPeriodLabel}.`,
      );
    }
  } else {
    notes.push(
      `There isn't enough history to compare with ${summary.previousPeriodLabel} — add more expenses over time to see month-over-month changes.`,
    );
  }

  return notes;
}

/** Format a 0–100 percentage for display, trimming needless decimals. */
export function formatPercentage(percentage: number): string {
  const rounded = Math.round(percentage * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

