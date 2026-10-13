import { describe, expect, it } from "vitest";
import {
  addDaysToIso,
  computeCashFlowProjection,
  diffIsoDays,
  isIsoDate,
  isoFromDate,
  sortTimelineEvents,
  validateTimelineInput,
  type TimelineEvent,
  type TimelineInput,
} from "@/lib/timeline";
import {
  DEMO_SNAPSHOT,
  DEMO_TIMELINE,
  DEMO_UPCOMING_EXPENSES,
  DEMO_EXPECTED_INCOME,
  demoTimelineEvents,
  NEXT_PAYDAY_IN_DAYS,
} from "@/lib/sample-data";
import { eurosToCents } from "@/lib/money";

/** euro -> cents */
const e = (euros: number) => Math.round(euros * 100);

/** Build a valid event with sensible defaults. */
function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "ev-1",
    description: "Test event",
    amount: -e(100),
    date: "2026-03-10",
    kind: "expense",
    confidence: "confirmed",
    ...overrides,
  };
}

function input(overrides: Partial<TimelineInput> = {}): TimelineInput {
  return {
    openingBalance: e(1000),
    reserve: 0,
    events: [],
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Date helpers                                                               */
/* -------------------------------------------------------------------------- */

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-03-10")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects malformed or impossible dates", () => {
    expect(isIsoDate("not-a-date")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false); // Feb 30 doesn't exist
    expect(isIsoDate("2025-02-29")).toBe(false); // not a leap year
    expect(isIsoDate("2026-13-01")).toBe(false); // month 13
    expect(isIsoDate("2026-3-10")).toBe(false); // needs zero padding
    expect(isIsoDate("")).toBe(false);
  });
});

describe("isoFromDate / addDaysToIso / diffIsoDays", () => {
  it("formats a Date using its local calendar fields", () => {
    const date = new Date(2026, 2, 10); // 10 March 2026 local
    expect(isoFromDate(date)).toBe("2026-03-10");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysToIso("2026-03-28", 5)).toBe("2026-04-02");
    expect(addDaysToIso("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDaysToIso("2026-01-01", 0)).toBe("2026-01-01");
  });

  it("round-trips with diffIsoDays", () => {
    const base = "2026-03-10";
    expect(diffIsoDays(base, addDaysToIso(base, 12))).toBe(12);
    expect(diffIsoDays(addDaysToIso(base, 12), base)).toBe(-12);
    expect(diffIsoDays(base, base)).toBe(0);
  });

  it("diffs correctly across a DST boundary", () => {
    // Europe switches to summer time on 29 March 2026.
    expect(diffIsoDays("2026-03-28", "2026-03-30")).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

describe("validateTimelineInput", () => {
  it("accepts a fully valid input", () => {
    expect(
      validateTimelineInput(
        input({
          events: [
            event(),
            event({ id: "ev-2", kind: "income", amount: e(500) }),
            event({ id: "ev-3", kind: "payday", amount: e(2000), date: "2026-03-20" }),
          ],
        }),
      ),
    ).toEqual({ ok: true });
  });

  it("accepts a negative opening balance (overdraft is a real state)", () => {
    expect(validateTimelineInput(input({ openingBalance: -e(50) }))).toEqual({
      ok: true,
    });
  });

  it("rejects a non-integer opening balance", () => {
    const res = validateTimelineInput(input({ openingBalance: 10.5 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/whole number of cents/i);
  });

  it("rejects a negative or fractional reserve", () => {
    expect(validateTimelineInput(input({ reserve: -1 })).ok).toBe(false);
    expect(validateTimelineInput(input({ reserve: 1.5 })).ok).toBe(false);
  });

  it("collects every problem instead of stopping at the first", () => {
    const res = validateTimelineInput(
      input({
        events: [
          event({ id: "", description: "", amount: 0, date: "2026-99-01" }),
        ],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects duplicate ids", () => {
    const res = validateTimelineInput(
      input({ events: [event(), event({ description: "Other" })] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/duplicate id/i);
  });

  it("rejects an expense with a positive amount", () => {
    const res = validateTimelineInput(
      input({ events: [event({ amount: e(100) })] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/expense amounts must be negative/i);
  });

  it("rejects income with a negative amount", () => {
    const res = validateTimelineInput(
      input({ events: [event({ kind: "income", amount: -e(100) })] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/income\/payday amounts must be positive/i);
  });

  it("rejects fractional-cent and zero amounts", () => {
    expect(
      validateTimelineInput(input({ events: [event({ amount: 10.5 })] })).ok,
    ).toBe(false);
    expect(
      validateTimelineInput(input({ events: [event({ amount: 0 })] })).ok,
    ).toBe(false);
  });

  it("rejects invalid calendar dates", () => {
    const res = validateTimelineInput(
      input({ events: [event({ date: "2026-02-30" })] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/not a valid calendar date/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Deterministic ordering                                                     */
/* -------------------------------------------------------------------------- */

describe("sortTimelineEvents", () => {
  it("orders by date first", () => {
    const sorted = sortTimelineEvents([
      event({ id: "c", date: "2026-03-20" }),
      event({ id: "a", date: "2026-03-05" }),
      event({ id: "b", date: "2026-03-12" }),
    ]);
    expect(sorted.map((ev) => ev.id)).toEqual(["a", "b", "c"]);
  });

  it("applies expenses before inflows on the same date (conservative)", () => {
    const sorted = sortTimelineEvents([
      event({ id: "in", kind: "income", amount: e(500), date: "2026-03-10" }),
      event({ id: "ex", kind: "expense", amount: -e(100), date: "2026-03-10" }),
    ]);
    expect(sorted.map((ev) => ev.id)).toEqual(["ex", "in"]);
  });

  it("breaks remaining ties by id, so output is fully deterministic", () => {
    const a = event({ id: "aaa", kind: "income", amount: e(1), date: "2026-03-10" });
    const b = event({ id: "bbb", kind: "income", amount: e(2), date: "2026-03-10" });
    expect(sortTimelineEvents([b, a]).map((ev) => ev.id)).toEqual(["aaa", "bbb"]);
    expect(sortTimelineEvents([a, b]).map((ev) => ev.id)).toEqual(["aaa", "bbb"]);
  });

  it("does not mutate its input", () => {
    const events = [
      event({ id: "z", date: "2026-03-20" }),
      event({ id: "a", date: "2026-03-05" }),
    ];
    const copy = [...events];
    sortTimelineEvents(events);
    expect(events).toEqual(copy);
  });
});

/* -------------------------------------------------------------------------- */
/* Projection — core behaviour                                                */
/* -------------------------------------------------------------------------- */

describe("computeCashFlowProjection", () => {
  it("returns the opening balance untouched when there are no events", () => {
    const result = computeCashFlowProjection(input());
    expect(result.entries).toHaveLength(0);
    expect(result.closingBalance).toBe(e(1000));
    expect(result.lowestBeforePayday.balance).toBe(e(1000));
    expect(result.nextPaydayDate).toBeNull();
  });

  it("computes a running balance across multiple chronological events", () => {
    const result = computeCashFlowProjection(
      input({
        openingBalance: e(1000),
        events: [
          event({ id: "a", amount: -e(300), date: "2026-03-10" }),
          event({ id: "b", amount: -e(200), date: "2026-03-12" }),
          event({ id: "c", kind: "income", amount: e(500), date: "2026-03-14" }),
        ],
      }),
    );

    expect(result.entries.map((entry) => entry.runningBalance)).toEqual([
      e(700),
      e(500),
      e(1000),
    ]);
    expect(result.closingBalance).toBe(e(1000));
  });

  it("orders events chronologically regardless of input order", () => {
    const events = [
      event({ id: "late", amount: -e(100), date: "2026-03-20" }),
      event({ id: "early", amount: -e(100), date: "2026-03-05" }),
    ];
    const result = computeCashFlowProjection(input({ events }));
    expect(result.entries.map((entry) => entry.event.id)).toEqual([
      "early",
      "late",
    ]);
  });

  it("produces identical output for shuffled input (same-date determinism)", () => {
    const events = [
      event({ id: "b", kind: "income", amount: e(50), date: "2026-03-11" }),
      event({ id: "a", amount: -e(50), date: "2026-03-11" }),
      event({ id: "c", amount: -e(10), date: "2026-03-11" }),
    ];
    const forward = computeCashFlowProjection(input({ events }));
    const backward = computeCashFlowProjection(
      input({ events: [...events].reverse() }),
    );
    expect(forward.entries).toEqual(backward.entries);
    // Outflows first: 1000 - 50 - 10 + 50 = 990 either way.
    expect(forward.closingBalance).toBe(e(990));
    expect(forward.entries.map((entry) => entry.event.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("flags the dates where the balance drops below zero", () => {
    const result = computeCashFlowProjection(
      input({
        openingBalance: e(300),
        events: [
          event({ id: "ok", amount: -e(100), date: "2026-03-10" }),
          event({ id: "tooMuch", amount: -e(400), date: "2026-03-12" }),
          event({ id: "later", amount: -e(10), date: "2026-03-14" }),
        ],
      }),
    );

    expect(result.lowestBeforePayday).toEqual({
      balance: -e(210),
      date: "2026-03-14",
    });
    expect(result.entries.map((entry) => entry.isBelowZero)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("treats a zero opening balance with no events as the floor", () => {
    const result = computeCashFlowProjection(input({ openingBalance: 0 }));
    expect(result.lowestBeforePayday.balance).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it("marks estimates that fall inside the window", () => {
    const result = computeCashFlowProjection(
      input({
        events: [event({ id: "a", confidence: "estimated", date: "2026-03-10" })],
      }),
    );
    expect(result.usesEstimates).toBe(true);
  });

  it("ignores estimates that only occur after payday", () => {
    const result = computeCashFlowProjection(
      input({
        events: [
          event({ id: "a", confidence: "estimated", date: "2026-03-25" }),
          event({ id: "payday", kind: "payday", amount: e(100), date: "2026-03-20" }),
        ],
      }),
    );
    expect(result.usesEstimates).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* Projection — reserve thresholds                                            */
/* -------------------------------------------------------------------------- */

describe("computeCashFlowProjection — reserve thresholds", () => {
  it("flags balances that dip below the reserve but stay above zero", () => {
    const result = computeCashFlowProjection(
      input({
        openingBalance: e(1000),
        reserve: e(500),
        events: [
          event({ id: "a", amount: -e(400), date: "2026-03-10" }), // 600 left — above reserve
          event({ id: "b", amount: -e(200), date: "2026-03-12" }), // 400 left — into reserve
        ],
      }),
    );

    expect(result.entries.map((entry) => entry.isBelowReserve)).toEqual([
      false,
      true,
    ]);
    expect(result.entries.map((entry) => entry.isBelowZero)).toEqual([
      false,
      false,
    ]);
    expect(result.lowestBeforePayday.balance).toBe(e(400));
  });

  it("also flags the below-zero state when both thresholds are crossed", () => {
    const result = computeCashFlowProjection(
      input({
        openingBalance: e(400),
        reserve: e(200),
        events: [event({ id: "a", amount: -e(500), date: "2026-03-10" })],
      }),
    );
    expect(result.entries[0].isBelowZero).toBe(true);
    expect(result.entries[0].isBelowReserve).toBe(true);
  });

  it("suppresses reserve warnings when no reserve is configured", () => {
    const result = computeCashFlowProjection(
      input({
        openingBalance: e(300),
        reserve: 0,
        events: [event({ id: "a", amount: -e(100), date: "2026-03-10" })],
      }),
    );
    expect(result.hasReserve).toBe(false);
    expect(result.entries[0].isBelowReserve).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Projection — payday window                                                 */
/* -------------------------------------------------------------------------- */

describe("computeCashFlowProjection — payday window", () => {
  const payday = event({
    id: "payday",
    kind: "payday",
    amount: e(2000),
    date: "2026-03-20",
  });

  it("records the next payday date", () => {
    const result = computeCashFlowProjection(input({ events: [payday] }));
    expect(result.nextPaydayDate).toBe("2026-03-20");
  });

  it("excludes events on or after payday from the pre-payday window", () => {
    const result = computeCashFlowProjection(
      input({
        openingBalance: e(500),
        events: [
          event({ id: "pre", amount: -e(400), date: "2026-03-10" }),
          event({ id: "onPayday", amount: -e(900), date: "2026-03-20" }),
          event({ id: "after", amount: -e(5000), date: "2026-03-25" }),
          payday,
        ],
      }),
    );

    expect(result.closingBalanceBeforePayday).toBe(e(100));
    expect(result.lowestBeforePayday).toEqual({
      balance: e(100),
      date: "2026-03-10",
    });
    // Payday and later events still show up with running balances.
    expect(result.entries).toHaveLength(4);
    expect(result.closingBalance).toBe(e(100) + e(2000) - e(900) - e(5000));
  });

  it("sums income and expenses in the window separately", () => {
    const result = computeCashFlowProjection(
      input({
        events: [
          event({ id: "ex", amount: -e(300), date: "2026-03-10" }),
          event({ id: "in", kind: "income", amount: e(120), date: "2026-03-12" }),
          event({ id: "ex2", amount: -e(50), date: "2026-03-15" }),
          payday,
        ],
      }),
    );
    expect(result.totalIncomeBeforePayday).toBe(e(120));
    expect(result.totalExpensesBeforePayday).toBe(e(350));
  });

  it("uses the earliest payday as the boundary when several exist", () => {
    const result = computeCashFlowProjection(
      input({
        events: [
          payday,
          event({ id: "laterPayday", kind: "payday", amount: e(2000), date: "2026-04-20" }),
        ],
      }),
    );
    expect(result.nextPaydayDate).toBe("2026-03-20");
  });

  it("treats the whole list as the window when no payday is scheduled", () => {
    const result = computeCashFlowProjection(
      input({
        openingBalance: e(100),
        events: [event({ id: "a", amount: -e(500), date: "2026-03-10" })],
      }),
    );
    expect(result.nextPaydayDate).toBeNull();
    expect(result.lowestBeforePayday.balance).toBe(-e(400));
    expect(result.totalExpensesBeforePayday).toBe(e(500));
  });
});


/* -------------------------------------------------------------------------- */
/* Demo data consistency — the anti-double-counting guarantees                */
/* -------------------------------------------------------------------------- */

describe("demo data consistency", () => {
  const fixedToday = new Date(2026, 2, 8); // 8 March 2026 local

  it("derives DEMO_UPCOMING_EXPENSES from the timeline events", () => {
    const fromEvents = DEMO_TIMELINE.filter(
      (ev) => ev.kind === "expense" && ev.daysFromNow < NEXT_PAYDAY_IN_DAYS,
    ).reduce((total, ev) => total + Math.abs(ev.amount), 0);
    expect(DEMO_UPCOMING_EXPENSES).toBe(fromEvents);
  });

  it("derives DEMO_EXPECTED_INCOME from the timeline events", () => {
    const fromEvents = DEMO_TIMELINE.filter(
      (ev) => ev.kind === "income" && ev.daysFromNow < NEXT_PAYDAY_IN_DAYS,
    ).reduce((total, ev) => total + ev.amount, 0);
    expect(DEMO_EXPECTED_INCOME).toBe(fromEvents);
  });

  it("keeps the snapshot totals consistent with the timeline", () => {
    // The calculator consumes the snapshot numbers; the timeline consumes the
    // events. They must describe the same money, counted once.
    expect(eurosToCents(DEMO_SNAPSHOT.upcomingExpenses)).toBe(DEMO_UPCOMING_EXPENSES);
    expect(eurosToCents(DEMO_SNAPSHOT.expectedIncome)).toBe(DEMO_EXPECTED_INCOME);
  });

  it("produces dated events that validate cleanly", () => {
    const res = validateTimelineInput({
      openingBalance: eurosToCents(DEMO_SNAPSHOT.currentBalance),
      reserve: eurosToCents(DEMO_SNAPSHOT.emergencyReserve),
      events: demoTimelineEvents(fixedToday),
    });
    expect(res).toEqual({ ok: true });
  });

  it("maps relative day offsets onto real dates", () => {
    const events = demoTimelineEvents(fixedToday);
    const rent = events.find((ev) => ev.id === "rent");
    expect(rent?.date).toBe("2026-03-11"); // 8 Mar + 3 days
    const paydayEvent = events.find((ev) => ev.kind === "payday");
    expect(paydayEvent?.date).toBe(addDaysToIso("2026-03-08", NEXT_PAYDAY_IN_DAYS));
  });

  it("projects the demo timeline without dipping into the reserve", () => {
    const projection = computeCashFlowProjection({
      openingBalance: eurosToCents(DEMO_SNAPSHOT.currentBalance),
      reserve: eurosToCents(DEMO_SNAPSHOT.emergencyReserve),
      events: demoTimelineEvents(fixedToday),
    });

    expect(projection.hasReserve).toBe(true);
    expect(projection.nextPaydayDate).not.toBeNull();
    expect(projection.lowestBeforePayday.balance).toBeGreaterThan(0);
    expect(projection.lowestBeforePayday.balance).toBeGreaterThanOrEqual(
      eurosToCents(DEMO_SNAPSHOT.emergencyReserve),
    );
    expect(projection.entries.some((entry) => entry.isBelowZero)).toBe(false);
    expect(projection.entries.some((entry) => entry.isBelowReserve)).toBe(false);
  });

  it("pre-payday totals in the projection match the calculator inputs exactly", () => {
    // This is the double-count guard: the timeline's window totals must equal
    // the figures the affordability calculator is fed, so every bill is
    // counted exactly once across both features.
    const projection = computeCashFlowProjection({
      openingBalance: eurosToCents(DEMO_SNAPSHOT.currentBalance),
      reserve: eurosToCents(DEMO_SNAPSHOT.emergencyReserve),
      events: demoTimelineEvents(fixedToday),
    });

    expect(projection.totalExpensesBeforePayday).toBe(DEMO_UPCOMING_EXPENSES);
    expect(projection.totalIncomeBeforePayday).toBe(DEMO_EXPECTED_INCOME);
  });
});

