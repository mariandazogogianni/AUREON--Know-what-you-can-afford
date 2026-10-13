import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  STORAGE_KEY,
  clearFinancialData,
  loadFinancialData,
  saveFinancialData,
} from "@/lib/storage";
import {
  FINANCIAL_DATA_VERSION,
  addEvent,
  defaultFinancialData,
  validateFinancialData,
  type FinancialData,
  type EventDraft,
} from "@/lib/financial-data";
import { eurosToCents } from "@/lib/money";

/**
 * A tiny in-memory localStorage stand-in. The storage module guards all access
 * behind `typeof window` + a capability probe, so installing this on
 * `globalThis` is enough to exercise the real code paths in a node environment.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const FIXED_TODAY = new Date(2026, 2, 8);

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe("saveFinancialData / loadFinancialData", () => {
  it("round-trips a dataset through local storage", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    expect(saveFinancialData(data)).toBe(true);
    expect(loadFinancialData(FIXED_TODAY)).toEqual(data);
  });

  it("returns defaults when nothing is stored yet", () => {
    const loaded = loadFinancialData(FIXED_TODAY);
    expect(validateFinancialData(loaded)).toEqual({ ok: true });
    expect(loaded.events.length).toBe(
      defaultFinancialData(FIXED_TODAY).events.length,
    );
  });

  it("falls back to defaults when stored JSON is corrupt", () => {
    window.localStorage.setItem(STORAGE_KEY, "{ this is not json ");
    const loaded = loadFinancialData(FIXED_TODAY);
    expect(validateFinancialData(loaded)).toEqual({ ok: true });
  });

  it("falls back to defaults when the stored version is incompatible", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...data, version: FINANCIAL_DATA_VERSION + 99 }),
    );
    const loaded = loadFinancialData(FIXED_TODAY);
    // Defaults are used, not the stale payload.
    expect(loaded.settings).toEqual(
      defaultFinancialData(FIXED_TODAY).settings,
    );
  });

  it("persists edits so a later load reflects them", () => {
    const data = defaultFinancialData(FIXED_TODAY);
    const draft: EventDraft = {
      description: "Concert",
      amount: eurosToCents(60),
      date: "2026-03-16",
      kind: "expense",
      confidence: "estimated",
    };
    const edited = addEvent(data, draft);
    saveFinancialData(edited);
    const reloaded = loadFinancialData(FIXED_TODAY);
    expect(reloaded.events.some((e) => e.description === "Concert")).toBe(true);
  });
});

describe("clearFinancialData", () => {
  it("removes the stored dataset so the next load is default", () => {
    saveFinancialData(defaultFinancialData(FIXED_TODAY));
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    clearFinancialData();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("resilience", () => {
  it("saveFinancialData returns false (not throws) when the quota is exceeded", () => {
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(saveFinancialData(defaultFinancialData(FIXED_TODAY))).toBe(false);
  });

  it("loadFinancialData survives a storage that always throws", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const loaded = loadFinancialData(FIXED_TODAY);
    expect(validateFinancialData(loaded)).toEqual({ ok: true });
  });

  it("degrades to defaults during SSR (no window)", () => {
    delete (globalThis as { window?: unknown }).window;
    const loaded = loadFinancialData(FIXED_TODAY);
    expect(validateFinancialData(loaded)).toEqual({ ok: true });
    // Saving is a safe no-op that reports failure.
    expect(saveFinancialData(loaded as FinancialData)).toBe(false);
  });
});
