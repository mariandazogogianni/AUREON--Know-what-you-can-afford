"use client";

import { useCallback, useMemo, useState } from "react";

import {
  computeWhatIfScenario,
  parseWhatIfAmount,
  type WhatIfBaseline,
  type WhatIfResult,
} from "@/lib/what-if";

/**
 * "What-If Simulator" state hook (Milestone 4).
 *
 * Owns ONLY the two hypothetical input strings and a reset. It deliberately
 * does **not** import `useFinancialData`, local storage, or any finance-data
 * setter — it receives a read-only `baseline` and can never write to the saved
 * dataset. This structural separation is the guarantee that simulations stay
 * completely separate from the user's real financial events.
 *
 * All arithmetic is delegated to the pure `computeWhatIfScenario` engine, so
 * this hook contains no financial logic of its own.
 */

export interface UseWhatIf {
  /** Raw string for the hypothetical purchase input. */
  purchaseRaw: string;
  /** Raw string for the optional monthly-savings input. */
  savingsRaw: string;
  /** Validation error for the purchase input, if any. */
  purchaseError?: string;
  /** Validation error for the savings input, if any. */
  savingsError?: string;
  /** True when both hypothetical inputs are valid. */
  isValid: boolean;
  /** Update the hypothetical purchase input. */
  setPurchase: (next: string) => void;
  /** Update the monthly-savings input. */
  setSavings: (next: string) => void;
  /** Reset both hypothetical inputs to their defaults. */
  reset: () => void;
  /** The computed scenario, or `null` while an input is invalid. */
  result: WhatIfResult | null;
}

/** Default (empty) hypothetical inputs — a clean slate. */
const DEFAULT_PURCHASE = "";
const DEFAULT_SAVINGS = "";

export function useWhatIf(baseline: WhatIfBaseline): UseWhatIf {
  const [purchaseRaw, setPurchaseRaw] = useState(DEFAULT_PURCHASE);
  const [savingsRaw, setSavingsRaw] = useState(DEFAULT_SAVINGS);

  const setPurchase = useCallback((next: string) => setPurchaseRaw(next), []);
  const setSavings = useCallback((next: string) => setSavingsRaw(next), []);

  const reset = useCallback(() => {
    setPurchaseRaw(DEFAULT_PURCHASE);
    setSavingsRaw(DEFAULT_SAVINGS);
  }, []);

  const purchase = useMemo(() => parseWhatIfAmount(purchaseRaw), [purchaseRaw]);
  const savings = useMemo(() => parseWhatIfAmount(savingsRaw), [savingsRaw]);

  const isValid = purchase.error === undefined && savings.error === undefined;

  const result = useMemo<WhatIfResult | null>(() => {
    if (!isValid) return null;
    return computeWhatIfScenario({
      ...baseline,
      purchase: purchase.value,
      monthlySavings: savings.value,
    });
  }, [baseline, isValid, purchase.value, savings.value]);

  return {
    purchaseRaw,
    savingsRaw,
    purchaseError: purchase.error,
    savingsError: savings.error,
    isValid,
    setPurchase,
    setSavings,
    reset,
    result,
  };
}
