"use client";

import { useCallback, useMemo, useState } from "react";

import {
  availablePeriods,
  computeSpendingSummary,
  monthKeyOf,
  type MonthKey,
  type PeriodOption,
  type SpendingSummary,
} from "@/lib/spending";
import type { FinancialEvent } from "@/lib/financial-data";

/**
 * Spending Intelligence state hook (Milestone 5).
 *
 * Owns only the selected period and derives the breakdown from the saved events
 * on every change. Like the What-If Simulator it is read-only with respect to
 * the financial data: it receives events, never mutates them, and never writes
 * to storage. All arithmetic lives in the pure `@/lib/spending` engine.
 */

export interface UseSpendingIntelligence {
  /** Periods the user can choose from (newest first). */
  periods: PeriodOption[];
  /** The currently selected period key. */
  selectedPeriod: MonthKey;
  /** Change the selected period. */
  selectPeriod: (period: MonthKey) => void;
  /** The computed breakdown for the selected period. */
  summary: SpendingSummary;
}

export function useSpendingIntelligence(
  events: readonly FinancialEvent[],
  today: string,
): UseSpendingIntelligence {
  // Default to the current calendar month.
  const [selectedPeriod, setSelectedPeriod] = useState<MonthKey>(() =>
    monthKeyOf(today),
  );

  const periods = useMemo(() => availablePeriods(events, today), [events, today]);

  const summary = useMemo(
    () => computeSpendingSummary(events, selectedPeriod),
    [events, selectedPeriod],
  );

  const selectPeriod = useCallback((period: MonthKey) => {
    setSelectedPeriod(period);
  }, []);

  return { periods, selectedPeriod, selectPeriod, summary };
}
