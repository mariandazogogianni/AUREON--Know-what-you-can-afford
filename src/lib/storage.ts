"use client";

import {
  coerceFinancialData,
  defaultFinancialData,
  type FinancialData,
} from "./financial-data";

/**
 * Browser local-storage persistence for the user's financial data.
 *
 * Safety measures (this is the "persist user data safely" requirement):
 * - Every read is wrapped so a missing/blocked/disabled `localStorage`
 *   (private mode, SSR, quota errors) degrades gracefully to defaults instead
 *   of throwing and taking the page down.
 * - Persisted JSON is treated as untrusted: it is parsed defensively and passed
 *   through `coerceFinancialData`, which validates the schema version and every
 *   field. Anything corrupt or from an incompatible version is discarded and the
 *   defaults are used, so a bad payload can never poison the calculations.
 * - Writes are likewise guarded, so a full quota fails silently rather than
 *   breaking the interaction that triggered it.
 */

/** The single key under which the dataset is stored. */
export const STORAGE_KEY = "aureon.financial-data.v1";

/** True when a usable `localStorage` is available in this environment. */
function storageAvailable(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const probe = "__aureon_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the dataset from local storage, falling back to `defaultFinancialData()`
 * when nothing valid is stored (first visit) or the stored value is corrupt.
 * Safe to call during SSR — it simply returns the defaults.
 */
export function loadFinancialData(today?: Date): FinancialData {
  const fallback = defaultFinancialData(today);
  if (!storageAvailable()) return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;

    const parsed: unknown = JSON.parse(raw);
    const coerced = coerceFinancialData(parsed);
    return coerced ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persist the dataset. Returns `true` on success, `false` when storage is
 * unavailable or the write failed (e.g. quota exceeded) — callers may surface a
 * subtle warning but must never treat a failed write as fatal.
 */
export function saveFinancialData(data: FinancialData): boolean {
  if (!storageAvailable()) return false;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Remove any stored dataset (used by "reset to demo"). */
export function clearFinancialData(): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore — nothing sensible to do if clearing fails */
  }
}
