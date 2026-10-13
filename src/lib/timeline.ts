import type { Cents } from "./money";

/**
 * Cash-flow projection ("Money Timeline") engine.
 *
 * Pure, cent-based calculation logic for forecasting the account balance from
 * now until the next payday. It deliberately contains no UI code: the
 * dashboard component only formats and renders what this module computes.
 *
 * Design decisions:
 * - All money is integer cents (see `./money`), all dates are ISO strings
 *   (`YYYY-MM-DD`), so comparisons are exact and locale-independent.
 * - Events on the same date are applied deterministically: outflows first,
 *   then inflows, then the payday marker, each group broken down by `id`.
 *   Outflows-first is the conservative reading — the projected "lowest
 *   balance" can never be flattered by optimistic ordering.
 * - The projection window runs up to the first `payday` event. Events dated
 *   on or after payday are still displayed (with running balances) but do not
 *   affect the "lowest balance before payday" figure.
 */

export type TimelineEventKind = "income" | "expense" | "payday";

/** Whether an amount is certain or an estimate the user should not fully trust. */
export type EventConfidence = "confirmed" | "estimated";

/** A single dated income, expense or payday event. */
export interface TimelineEvent {
  /** Stable identifier, unique within one projection. */
  id: string;
  /** Short human description, e.g. "Rent" or "Salary". */
  description: string;
  /** Signed cents: positive = money in, negative = money out. */
  amount: Cents;
  /** ISO calendar date (`YYYY-MM-DD`) on which the event occurs. */
  date: string;
  kind: TimelineEventKind;
  confidence: EventConfidence;
}

/** Everything needed to compute a projection. */
export interface TimelineInput {
  /** Money in the account right now. May be negative (overdraft). */
  openingBalance: Cents;
  /** User-configured reserve that should not be touched. `0` = not configured. */
  reserve: Cents;
  events: TimelineEvent[];
}

/** One event plus its cumulative effect on the balance. */
export interface TimelineProjectionEntry {
  event: TimelineEvent;
  /** Account balance immediately after this event is applied. */
  runningBalance: Cents;
  /** True when the running balance has dropped below zero. */
  isBelowZero: boolean;
  /** True when the running balance is under the configured reserve (not zero). */
  isBelowReserve: boolean;
  /** True for the payday event that closes the pre-payday window. */
  isPayday: boolean;
}

/** The lowest projected balance and when it occurs. */
export interface TimelineLowest {
  balance: Cents;
  /** ISO date of the low point (empty when no events apply). */
  date: string;
}

/** The full projection result, ready for rendering. */
export interface CashFlowProjection {
  openingBalance: Cents;
  reserve: Cents;
  /** False when no reserve is configured — reserve warnings must be suppressed. */
  hasReserve: boolean;
  /** ISO date of the first payday event, or `null` when none is scheduled. */
  nextPaydayDate: string | null;
  /** Every event, in deterministic order, with running balances. */
  entries: TimelineProjectionEntry[];
  /** Balance after the final event (or the opening balance when there are none). */
  closingBalance: Cents;
  /** Lowest balance reached strictly before the next payday. */
  lowestBeforePayday: TimelineLowest;
  /** Balance immediately before payday (opening balance when nothing happens). */
  closingBalanceBeforePayday: Cents;
  /** Sum of positive event amounts before payday (magnitude, never negative). */
  totalIncomeBeforePayday: Cents;
  /** Sum of expense magnitudes before payday (positive number). */
  totalExpensesBeforePayday: Cents;
  /** True when any event in the window is marked as an estimate. */
  usesEstimates: boolean;
}

/* -------------------------------------------------------------------------- */
/* Date helpers                                                               */
/* -------------------------------------------------------------------------- */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True when `value` is a syntactically valid ISO date that exists on the
 * calendar (rejects e.g. `2026-02-30`).
 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Convert a JS `Date` to an ISO date string using its *local* calendar fields
 * (the date the user actually sees), independent of timezone.
 */
export function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Add whole days to an ISO date using pure UTC arithmetic, so daylight-saving
 * transitions can never shift the result by an hour and flip the date.
 */
export function addDaysToIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day + days));
  return `${probe.getUTCFullYear()}-${pad2(probe.getUTCMonth() + 1)}-${pad2(probe.getUTCDate())}`;
}

/** Whole number of days from `from` to `to` (positive when `to` is later). */
export function diffIsoDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.round(ms / 86_400_000);
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/** Result of validating a projection input — mirrors `ParseResult` in money.ts. */
export type TimelineValidation = { ok: true } | { ok: false; errors: string[] };

/** Kinds whose amount must be positive (money in). */
const INFLOW_KINDS: readonly TimelineEventKind[] = ["income", "payday"];

/**
 * Validate a projection input, returning every problem found rather than
 * stopping at the first one, so the UI can show a complete picture.
 *
 * Rules:
 * - opening balance: any integer cent amount (an overdraft is a real state);
 * - reserve: integer, zero or more;
 * - events: unique non-empty ids, non-empty descriptions, integer non-zero
 *   amounts whose sign matches their kind, real ISO dates, known kind and
 *   confidence values.
 */
export function validateTimelineInput(input: TimelineInput): TimelineValidation {
  const errors: string[] = [];

  if (!Number.isInteger(input.openingBalance)) {
    errors.push("Opening balance must be a whole number of cents.");
  }
  if (!Number.isInteger(input.reserve) || input.reserve < 0) {
    errors.push("Reserve must be a whole number of cents and cannot be negative.");
  }
  if (!Array.isArray(input.events)) {
    errors.push("Events must be a list.");
    return { ok: false, errors };
  }

  const seenIds = new Set<string>();

  input.events.forEach((event, index) => {
    const where = `Event ${index + 1}`;

    if (typeof event.id !== "string" || event.id.trim() === "") {
      errors.push(`${where}: id is required.`);
    } else if (seenIds.has(event.id)) {
      errors.push(`${where}: duplicate id "${event.id}".`);
    } else {
      seenIds.add(event.id);
    }

    if (typeof event.description !== "string" || event.description.trim() === "") {
      errors.push(`${where}: description is required.`);
    }

    if (!Number.isInteger(event.amount)) {
      errors.push(`${where}: amount must be a whole number of cents.`);
    } else if (event.amount === 0) {
      errors.push(`${where}: amount cannot be zero.`);
    } else {
      const isInflow = INFLOW_KINDS.includes(event.kind);
      if (isInflow && event.amount < 0) {
        errors.push(`${where}: income/payday amounts must be positive.`);
      }
      if (!isInflow && event.amount > 0) {
        errors.push(`${where}: expense amounts must be negative.`);
      }
    }

    if (!isIsoDate(event.date)) {
      errors.push(`${where}: "${event.date}" is not a valid calendar date.`);
    }

    if (event.kind !== "income" && event.kind !== "expense" && event.kind !== "payday") {
      errors.push(`${where}: unknown kind "${event.kind}".`);
    }

    if (event.confidence !== "confirmed" && event.confidence !== "estimated") {
      errors.push(`${where}: unknown confidence "${event.confidence}".`);
    }
  });

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}


/* -------------------------------------------------------------------------- */
/* Projection                                                                 */
/* -------------------------------------------------------------------------- */

/** Lower rank is applied first on the same date (conservative: outflows first). */
function kindRank(kind: TimelineEventKind): number {
  switch (kind) {
    case "expense":
      return 0;
    case "income":
      return 1;
    case "payday":
      return 2;
  }
}

/**
 * Deterministic event order: date, then kind (expenses before inflows), then
 * id. The same input always produces the same output regardless of the order
 * events were supplied in.
 */
export function sortTimelineEvents(events: readonly TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const rank = kindRank(a.kind) - kindRank(b.kind);
    if (rank !== 0) return rank;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Compute the full cash-flow projection.
 *
 * This function is pure and does not throw; like `computeAffordability` it
 * expects input that has already passed `validateTimelineInput`. Callers must
 * not treat missing data as zero silently — the flags in the result
 * (`hasReserve`, `usesEstimates`, `nextPaydayDate === null`) exist so the UI
 * can state every assumption out loud.
 *
 * When no payday event is scheduled the whole list is treated as the window,
 * and `lowestBeforePayday` degrades to the lowest balance across all events.
 */
export function computeCashFlowProjection(input: TimelineInput): CashFlowProjection {
  const { openingBalance, reserve } = input;
  const hasReserve = reserve > 0;
  const ordered = sortTimelineEvents(input.events);

  const firstPayday = ordered.find((event) => event.kind === "payday");
  const nextPaydayDate = firstPayday ? firstPayday.date : null;

  let running = openingBalance;
  let lowestBalance = openingBalance;
  let lowestDate = "";
  let closingBalanceBeforePayday = openingBalance;
  let totalIncomeBeforePayday = 0;
  let totalExpensesBeforePayday = 0;
  let usesEstimates = false;

  const entries: TimelineProjectionEntry[] = ordered.map((event) => {
    running += event.amount;

    // Strictly before payday; when no payday exists every event counts.
    const beforePayday = nextPaydayDate === null || event.date < nextPaydayDate;

    if (beforePayday) {
      if (event.amount > 0) totalIncomeBeforePayday += event.amount;
      else totalExpensesBeforePayday += -event.amount;
      if (event.confidence === "estimated") usesEstimates = true;
      if (lowestDate === "" || running < lowestBalance) {
        lowestBalance = running;
        lowestDate = event.date;
      }
      closingBalanceBeforePayday = running;
    }

    return {
      event,
      runningBalance: running,
      isBelowZero: running < 0,
      isBelowReserve: hasReserve && running < reserve,
      isPayday: event.kind === "payday",
    };
  });

  return {
    openingBalance,
    reserve,
    hasReserve,
    nextPaydayDate,
    entries,
    closingBalance: running,
    lowestBeforePayday: { balance: lowestBalance, date: lowestDate },
    closingBalanceBeforePayday,
    totalIncomeBeforePayday,
    totalExpensesBeforePayday,
    usesEstimates,
  };
}

