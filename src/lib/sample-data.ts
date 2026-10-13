import { centsToEuros, eurosToCents, type Cents } from "./money";
import { addDaysToIso, isoFromDate, type TimelineEvent } from "./timeline";
import type { ExpenseCategory } from "./categories";

/**
 * A single event on the cash-flow timeline (an incoming payment or an outgoing
 * bill). All sample data in this file is illustrative and clearly labelled as
 * demo data in the UI.
 */
export interface CashFlowEvent {
  id: string;
  /** Short human label, e.g. "Rent" or "Salary". */
  label: string;
  /** Money leaving the account (bills) — always negative when it is an expense. */
  amount: Cents;
  /** Days from "today" until the event occurs. Non-negative integers. */
  daysFromNow: number;
  kind: "income" | "expense" | "payday";
  /** Whether the amount is certain or an estimate that may still change. */
  confidence: "confirmed" | "estimated";
  /** Expense category (illustrative demo values; ignored for income/payday). */
  category?: ExpenseCategory;
}

/** The editable snapshot values (kept as euro amounts for display convenience). */
export interface SnapshotValues {
  currentBalance: number;
  expectedIncome: number;
  upcomingExpenses: number;
  emergencyReserve: number;
  purchasePrice: number;
}

/** Next payday, expressed as days from today (used across snapshot + timeline). */
export const NEXT_PAYDAY_IN_DAYS = 12;

/**
 * Demo timeline: upcoming income, known expenses and the next payday. The
 * `daysFromNow` offsets keep the sample fresh no matter when the app is opened;
 * `demoTimelineEvents()` converts them into concrete dates for the projection.
 */
export const DEMO_TIMELINE: CashFlowEvent[] = [
  { id: "rent", label: "Rent", amount: -eurosToCents(720), daysFromNow: 3, kind: "expense", confidence: "confirmed", category: "housing" },
  { id: "utilities", label: "Electricity & water", amount: -eurosToCents(145.4), daysFromNow: 6, kind: "expense", confidence: "estimated", category: "utilities" },
  { id: "freelance", label: "Freelance invoice", amount: eurosToCents(620), daysFromNow: 8, kind: "income", confidence: "estimated" },
  { id: "insurance", label: "Insurance", amount: -eurosToCents(100), daysFromNow: 9, kind: "expense", confidence: "confirmed", category: "health" },
  { id: "payday", label: "Payday", amount: eurosToCents(2450), daysFromNow: NEXT_PAYDAY_IN_DAYS, kind: "payday", confidence: "confirmed" },
];

/**
 * Convert the relative demo timeline into absolute, dated events for a given
 * "today". Payer-facing calculation code never sees `daysFromNow` — only real
 * ISO dates.
 */
export function demoTimelineEvents(today: Date): TimelineEvent[] {
  const base = isoFromDate(today);
  return DEMO_TIMELINE.map((event) => ({
    id: event.id,
    description: event.label,
    amount: event.amount,
    date: addDaysToIso(base, event.daysFromNow),
    kind: event.kind,
    confidence: event.confidence,
    category: event.category,
  }));
}

/**
 * The sum of upcoming expenses before the next payday, derived from the demo
 * timeline so the two sections can never drift out of sync. This is also the
 * exact figure fed into the affordability calculator, which guarantees the
 * timeline and the calculator count each bill exactly once.
 */
export const DEMO_UPCOMING_EXPENSES: Cents = DEMO_TIMELINE.filter(
  (event) => event.kind === "expense" && event.daysFromNow < NEXT_PAYDAY_IN_DAYS,
).reduce((total, event) => total + Math.abs(event.amount), 0);

/**
 * Expected income strictly before the next payday, derived the same way.
 * The payday transfer itself is not counted here — it *is* the boundary.
 */
export const DEMO_EXPECTED_INCOME: Cents = DEMO_TIMELINE.filter(
  (event) => event.kind === "income" && event.daysFromNow < NEXT_PAYDAY_IN_DAYS,
).reduce((total, event) => total + event.amount, 0);

/**
 * Illustrative demo dataset. Every number here is fictional and is surfaced in
 * the UI behind an explicit "demo data" notice. Income and expense totals are
 * derived from `DEMO_TIMELINE` above, so the snapshot, the calculator and the
 * timeline always agree.
 *
 * Note: `purchasePrice` is deliberately *not* a timeline event — it is a
 * hypothetical purchase under consideration, not a scheduled payment.
 */
export const DEMO_SNAPSHOT: SnapshotValues = {
  currentBalance: 1840.5,
  expectedIncome: centsToEuros(DEMO_EXPECTED_INCOME),
  upcomingExpenses: centsToEuros(DEMO_UPCOMING_EXPENSES),
  emergencyReserve: 500,
  purchasePrice: 349.99,
};
