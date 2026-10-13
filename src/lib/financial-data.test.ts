import { describe, expect, it, beforeEach } from "vitest";
import {
  FINANCIAL_DATA_VERSION,
  SUPPORTED_FINANCIAL_DATA_VERSIONS,
  addEvent,
  coerceFinancialData,
  defaultFinancialData,
  newEventId,
  removeEvent,
  resolveEventCategory,
  signedAmount,
  updateEvent,
  updateSettings,
  validateFinancialData,
  type FinancialData,
  type FinancialEvent,
  type EventDraft,
} from "@/lib/financial-data";
import { eurosToCents } from "@/lib/money";

const FIXED_TODAY = new Date(2026, 2, 8); // 8 March 2026 local

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    description: "Test event",
    amount: eurosToCents(100),
    date: "2026-03-15",
    kind: "expense",
    confidence: "confirmed",
    ...overrides,
  };
}

describe("defaultFinancialData", () => {
  it("produces a valid dataset", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    expect(data.version).toBe(FINANCIAL_DATA_VERSION);
    expect(validateFinancialData(data)).toEqual({ ok: true });
  });
});

describe("signedAmount", () => {
  it("stores expenses as negative and inflows as positive", () => {
    expect(signedAmount("expense", eurosToCents(50))).toBe(-5000);
    expect(signedAmount("income", eurosToCents(50))).toBe(5000);
    expect(signedAmount("payday", eurosToCents(50))).toBe(5000);
  });

  it("always takes the magnitude, even if given a negative", () => {
    expect(signedAmount("expense", -eurosToCents(50))).toBe(-5000);
  });
});

describe("newEventId", () => {
  it("returns unique, non-empty ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newEventId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });
});

describe("event operations", () => {
  let base: FinancialData;

  beforeEach(() => {
    base = defaultFinancialData(FIXED_TODAY);
  });

  it("addEvent appends without mutating the original", () => {
    const before = base.events.length;
    const next = addEvent(base, draft({ description: "Gym" }));
    expect(next.events.length).toBe(before + 1);
    expect(base.events.length).toBe(before); // original untouched
    expect(next).not.toBe(base);
    expect(next.events[next.events.length - 1].description).toBe("Gym");
  });

  it("addEvent applies the correct sign for the kind", () => {
    const expense = addEvent(base, draft({ kind: "expense" }));
    const income = addEvent(base, draft({ kind: "income" }));
    expect(expense.events.at(-1)!.amount).toBeLessThan(0);
    expect(income.events.at(-1)!.amount).toBeGreaterThan(0);
  });

  it("addEvent trims the description and assigns a unique id", () => {
    const next = addEvent(base, draft({ description: "  Coffee  " }));
    const added = next.events.at(-1)!;
    expect(added.description).toBe("Coffee");
    expect(added.id).not.toBe(base.events[0].id);
  });

  it("updateEvent replaces fields but keeps the id immutable", () => {
    const target = base.events[0];
    // The patch type omits `id`, but we deliberately try to override it to
    // prove the runtime guard ignores any attempt to change an event's id.
    const patch = {
      description: "Rent (revised)",
      amount: eurosToCents(750),
      id: "hacked",
    } as Partial<Omit<FinancialEvent, "id">>;
    const next = updateEvent(base, target.id, patch);
    const updated = next.events.find((e) => e.id === target.id)!;
    expect(updated.description).toBe("Rent (revised)");
    expect(updated.amount).toBe(eurosToCents(750));
    expect(updated.id).toBe(target.id); // id cannot be overwritten
    expect(base.events[0].description).toBe(target.description); // original kept
  });

  it("removeEvent deletes only the matching id", () => {
    const target = base.events[1];
    const next = removeEvent(base, target.id);
    expect(next.events.some((e) => e.id === target.id)).toBe(false);
    expect(next.events.length).toBe(base.events.length - 1);
    expect(base.events.some((e) => e.id === target.id)).toBe(true);
  });

  it("updateSettings merges partial settings", () => {
    const next = updateSettings(base, { purchasePrice: eurosToCents(99) });
    expect(next.settings.purchasePrice).toBe(eurosToCents(99));
    expect(next.settings.currentBalance).toBe(base.settings.currentBalance);
  });
});

describe("validateFinancialData", () => {
  it("accepts the default dataset", () => {
    expect(validateFinancialData(defaultFinancialData(FIXED_TODAY))).toEqual({
      ok: true,
    });
  });

  it("rejects a negative setting", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const bad = updateSettings(data, { emergencyReserve: -1 });
    const res = validateFinancialData(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/reserve.*negative/i);
  });

  it("rejects a non-integer setting", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const bad = updateSettings(data, { currentBalance: 10.5 });
    expect(validateFinancialData(bad).ok).toBe(false);
  });

  it("propagates timeline validation errors for bad events", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const bad: FinancialData = {
      ...data,
      events: [
        {
          id: "x",
          description: "Bad",
          amount: eurosToCents(10), // positive, but kind expense
          date: "2026-03-10",
          kind: "expense",
          confidence: "confirmed",
        },
      ],
    };
    const res = validateFinancialData(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/expense amounts must be negative/i);
  });
});

describe("coerceFinancialData", () => {
  it("accepts a valid serialized dataset (round-trips through JSON)", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const result = coerceFinancialData(JSON.parse(JSON.stringify(data)));
    expect(result).toEqual(data);
  });

  it("rejects a wrong schema version", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const stale = { ...data, version: FINANCIAL_DATA_VERSION + 1 };
    expect(coerceFinancialData(stale)).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(coerceFinancialData(null)).toBeNull();
    expect(coerceFinancialData("nope")).toBeNull();
    expect(coerceFinancialData(42)).toBeNull();
  });

  it("rejects non-integer / negative settings", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const bad = {
      ...data,
      settings: { ...data.settings, emergencyReserve: -100 },
    };
    expect(coerceFinancialData(bad)).toBeNull();
  });

  it("drops malformed events but keeps the valid ones", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const good = data.events[0];
    const payload = {
      ...data,
      events: [
        good,
        { id: "", description: "no id", amount: -1, date: "2026-03-10", kind: "expense", confidence: "confirmed" },
        { id: "bad-date", description: "x", amount: -1, date: "not-a-date", kind: "expense", confidence: "confirmed" },
        "just a string",
      ],
    };
    const result = coerceFinancialData(payload);
    expect(result).not.toBeNull();
    expect(result!.events).toEqual([good]);
  });

  it("removes duplicate-id events defensively", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const first = data.events[0];
    const dup = { ...first };
    const result = coerceFinancialData({ ...data, events: [first, dup] });
    expect(result!.events).toHaveLength(1);
  });
});

describe("expense categories — assignment", () => {
  it("stores a category on a new expense", () => {
    const base = defaultFinancialData(FIXED_TODAY);
    const next = addEvent(base, draft({ kind: "expense", category: "groceries" }));
    const added = next.events.at(-1)!;
    expect(added.category).toBe("groceries");
  });

  it("defaults an expense with no category to 'other'", () => {
    const base = defaultFinancialData(FIXED_TODAY);
    const next = addEvent(base, draft({ kind: "expense" }));
    expect(next.events.at(-1)!.category).toBe("other");
  });

  it("never stores a category on income or payday events", () => {
    const base = defaultFinancialData(FIXED_TODAY);
    const income = addEvent(base, draft({ kind: "income", category: "housing" }));
    const payday = addEvent(base, draft({ kind: "payday", category: "housing" }));
    expect(income.events.at(-1)!.category).toBeUndefined();
    expect(payday.events.at(-1)!.category).toBeUndefined();
  });

  it("resolveEventCategory only applies to expenses", () => {
    expect(resolveEventCategory("expense", "health")).toBe("health");
    expect(resolveEventCategory("expense", undefined)).toBe("other");
    expect(resolveEventCategory("income", "health")).toBeUndefined();
    expect(resolveEventCategory("payday", undefined)).toBeUndefined();
  });

  it("editing an expense's category preserves its id, amount, date and confidence", () => {
    const base = defaultFinancialData(FIXED_TODAY);
    const target = base.events.find((ev) => ev.kind === "expense")!;
    const next = updateEvent(base, target.id, { category: "entertainment" });
    const updated = next.events.find((ev) => ev.id === target.id)!;
    expect(updated.category).toBe("entertainment");
    expect(updated.id).toBe(target.id);
    expect(updated.amount).toBe(target.amount);
    expect(updated.date).toBe(target.date);
    expect(updated.confidence).toBe(target.confidence);
    expect(updated.description).toBe(target.description);
  });
});

describe("storage migration — v1 (no categories) to v2", () => {
  /** Build a realistic v1 payload: the old shape, with no `category` field. */
  function v1Payload() {
    return {
      version: 1,
      settings: {
        currentBalance: eurosToCents(1840.5),
        emergencyReserve: eurosToCents(500),
        purchasePrice: eurosToCents(349.99),
      },
      events: [
        {
          id: "rent",
          description: "Rent",
          amount: -eurosToCents(720),
          date: "2026-03-11",
          kind: "expense",
          confidence: "confirmed",
        },
        {
          id: "salary",
          description: "Salary",
          amount: eurosToCents(2450),
          date: "2026-03-20",
          kind: "payday",
          confidence: "confirmed",
        },
      ],
    };
  }

  it("accepts a v1 payload and stamps it as the current version", () => {
    const result = coerceFinancialData(v1Payload());
    expect(result).not.toBeNull();
    expect(result!.version).toBe(FINANCIAL_DATA_VERSION);
    expect(SUPPORTED_FINANCIAL_DATA_VERSIONS).toContain(1);
  });

  it("migrates v1 expenses to the default category without discarding data", () => {
    const payload = v1Payload();
    const result = coerceFinancialData(payload)!;
    const rent = result.events.find((ev) => ev.id === "rent")!;
    // Preserved fields…
    expect(rent.description).toBe("Rent");
    expect(rent.amount).toBe(-eurosToCents(720));
    expect(rent.date).toBe("2026-03-11");
    expect(rent.confidence).toBe("confirmed");
    // …plus the migrated category.
    expect(rent.category).toBe("other");
  });

  it("does not invent a category for v1 income/payday events", () => {
    const result = coerceFinancialData(v1Payload())!;
    const salary = result.events.find((ev) => ev.id === "salary")!;
    expect(salary.kind).toBe("payday");
    expect(salary.category).toBeUndefined();
  });

  it("migrated data validates cleanly", () => {
    const result = coerceFinancialData(v1Payload())!;
    expect(validateFinancialData(result)).toEqual({ ok: true });
  });

  it("still rejects genuinely unknown/future versions", () => {
    const stale = { ...v1Payload(), version: FINANCIAL_DATA_VERSION + 1 };
    expect(coerceFinancialData(stale)).toBeNull();
  });
});


