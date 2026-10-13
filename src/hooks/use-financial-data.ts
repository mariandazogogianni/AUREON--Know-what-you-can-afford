"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseEuroInput, formatCentsValue, type Cents } from "@/lib/money";
import {
  computeAffordability,
  type AffordabilityResult,
} from "@/lib/finance";
import {
  computeCashFlowProjection,
  isoFromDate,
  type CashFlowProjection,
} from "@/lib/timeline";
import {
  addEvent as addEventOp,
  updateEvent as updateEventOp,
  removeEvent as removeEventOp,
  updateSettings as updateSettingsOp,
  signedAmount,
  resolveEventCategory,
  defaultFinancialData,
  type FinancialData,
  type FinancialEvent,
  type FinancialSettings,
  type EventDraft,
} from "@/lib/financial-data";
import { loadFinancialData, saveFinancialData } from "@/lib/storage";

/**
 * The interactive "Money Manager" orchestrator (Milestone 3).
 *
 * This hook is the single source of truth for the whole dashboard. It:
 * - owns the `FinancialData` (events + the three scalar settings);
 * - loads it once from local storage after mount and persists on every change;
 * - **derives** expected income and upcoming expenses from the event list
 *   (via the timeline projection), so the timeline and the affordability
 *   calculator can never count the same bill twice;
 * - recalculates the Money Timeline projection and the purchase-affordability
 *   result on every change, transparently, from the pure `@/lib` engines.
 *
 * It contains no financial arithmetic of its own — every number comes from the
 * tested pure functions in `@/lib`.
 */

/** The three scalar settings the user edits directly (income/expenses are events). */
export type EditableSetting = keyof FinancialSettings;

export const EDITABLE_SETTINGS: readonly EditableSetting[] = [
  "currentBalance",
  "emergencyReserve",
  "purchasePrice",
];

export type RawSettings = Record<EditableSetting, string>;

/** Human labels for the editable settings, shared with the calculator UI. */
export const SETTING_LABELS: Record<EditableSetting, string> = {
  currentBalance: "Current balance",
  emergencyReserve: "Emergency reserve",
  purchasePrice: "Purchase price",
};

export interface UseFinancialData {
  /** ISO date captured once per mount, used as "today" across the UI. */
  today: string;
  /** True once the initial load from local storage has completed. */
  hydrated: boolean;

  /** All events (income, expense, payday), in insertion order. */
  events: FinancialEvent[];
  /** The current scalar settings (integer cents). */
  settings: FinancialSettings;

  /** Raw string values for the editable settings, for controlled inputs. */
  values: RawSettings;
  /** Per-setting validation messages (only present when invalid). */
  errors: Partial<Record<EditableSetting, string>>;
  /** Update one editable setting from a raw input string. */
  setSettingValue: (field: EditableSetting, next: string) => void;

  /** Add a new event built from a draft. */
  addEvent: (draft: EventDraft) => void;
  /** Replace an existing event's editable fields (id stays fixed). */
  editEvent: (id: string, draft: EventDraft) => void;
  /** Delete an event by id. */
  deleteEvent: (id: string) => void;
  /** Restore the demo dataset and persist it. */
  reset: () => void;

  /** The Money Timeline projection, recomputed on every change. */
  projection: CashFlowProjection;
  /** Expected income strictly before payday (derived from events). */
  expectedIncome: Cents;
  /** Upcoming expenses strictly before payday (derived from events). */
  upcomingExpenses: Cents;
  /** ISO date of the next payday, or `null` when none is scheduled. */
  nextPaydayDate: string | null;

  /** The affordability result, or `null` while a setting input is invalid. */
  affordability: AffordabilityResult | null;
  /** True when all editable settings currently hold valid amounts. */
  affordabilityValid: boolean;
}

function settingsToRaw(settings: FinancialSettings): RawSettings {
  return {
    currentBalance: formatCentsValue(settings.currentBalance),
    emergencyReserve: formatCentsValue(settings.emergencyReserve),
    purchasePrice: formatCentsValue(settings.purchasePrice),
  };
}

/** Turn a draft (positive magnitude + kind) into storable event fields. */
function draftToFields(draft: EventDraft): Omit<FinancialEvent, "id"> {
  return {
    description: draft.description.trim(),
    amount: signedAmount(draft.kind, draft.amount),
    date: draft.date,
    kind: draft.kind,
    confidence: draft.confidence,
    category: resolveEventCategory(draft.kind, draft.category),
  };
}

export function useFinancialData(): UseFinancialData {
  const [data, setData] = useState<FinancialData>(() => defaultFinancialData());
  const [values, setValues] = useState<RawSettings>(() =>
    settingsToRaw(defaultFinancialData().settings),
  );
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  // "Today" is captured once per mount so every relative date stays consistent.
  const today = useMemo(() => isoFromDate(new Date()), []);

  // Load persisted data once, after mount, to keep the server/client first
  // render identical and to avoid touching storage during SSR.
  useEffect(() => {
    const loaded = loadFinancialData();
    setData(loaded);
    setValues(settingsToRaw(loaded.settings));
    hydratedRef.current = true;
    setHydrated(true);
  }, []);

  // Persist on every change — but only after the initial load, so we never
  // clobber stored data with the defaults before we have read them.
  useEffect(() => {
    if (hydratedRef.current) saveFinancialData(data);
  }, [data]);

  const setSettingValue = useCallback(
    (field: EditableSetting, next: string) => {
      setValues((prev) => ({ ...prev, [field]: next }));
      const outcome = parseEuroInput(next);
      // Only update the stored cents when the input parses; invalid input is
      // surfaced as an error but never corrupts the calculation.
      if (outcome.ok) {
        setData((prev) => updateSettingsOp(prev, { [field]: outcome.cents }));
      }
    },
    [],
  );

  const { cents, errors } = useMemo(() => {
    const cents: Partial<Record<EditableSetting, Cents>> = {};
    const errors: Partial<Record<EditableSetting, string>> = {};
    for (const field of EDITABLE_SETTINGS) {
      const outcome = parseEuroInput(values[field]);
      if (outcome.ok) cents[field] = outcome.cents;
      else errors[field] = outcome.error;
    }
    return { cents, errors };
  }, [values]);

  const addEvent = useCallback((draft: EventDraft) => {
    setData((prev) => addEventOp(prev, draft));
  }, []);

  const editEvent = useCallback((id: string, draft: EventDraft) => {
    setData((prev) => updateEventOp(prev, id, draftToFields(draft)));
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setData((prev) => removeEventOp(prev, id));
  }, []);

  const reset = useCallback(() => {
    const fresh = defaultFinancialData();
    setData(fresh);
    setValues(settingsToRaw(fresh.settings));
  }, []);

  // The Money Timeline projection — recomputed whenever money or events change.
  const projection = useMemo(
    () =>
      computeCashFlowProjection({
        openingBalance: data.settings.currentBalance,
        reserve: data.settings.emergencyReserve,
        events: data.events,
      }),
    [data.settings.currentBalance, data.settings.emergencyReserve, data.events],
  );

  // Income and expenses are derived from the same events the timeline shows.
  const expectedIncome = projection.totalIncomeBeforePayday;
  const upcomingExpenses = projection.totalExpensesBeforePayday;
  const nextPaydayDate = projection.nextPaydayDate;

  const affordabilityValid = EDITABLE_SETTINGS.every(
    (field) => cents[field] !== undefined,
  );

  const affordability = useMemo<AffordabilityResult | null>(() => {
    if (
      cents.currentBalance === undefined ||
      cents.emergencyReserve === undefined ||
      cents.purchasePrice === undefined
    ) {
      return null;
    }
    return computeAffordability({
      currentBalance: cents.currentBalance,
      expectedIncome,
      upcomingExpenses,
      emergencyReserve: cents.emergencyReserve,
      purchasePrice: cents.purchasePrice,
    });
  }, [
    cents.currentBalance,
    cents.emergencyReserve,
    cents.purchasePrice,
    expectedIncome,
    upcomingExpenses,
  ]);

  return {
    today,
    hydrated,
    events: data.events,
    settings: data.settings,
    values,
    errors,
    setSettingValue,
    addEvent,
    editEvent,
    deleteEvent,
    reset,
    projection,
    expectedIncome,
    upcomingExpenses,
    nextPaydayDate,
    affordability,
    affordabilityValid,
  };
}

