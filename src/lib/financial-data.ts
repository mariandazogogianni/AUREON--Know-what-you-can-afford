import { eurosToCents, type Cents } from "./money";
import {
  validateTimelineInput,
  isIsoDate,
  type TimelineEvent,
  type TimelineEventKind,
  type EventConfidence,
} from "./timeline";
import { normalizeCategory, type ExpenseCategory } from "./categories";
import { DEMO_SNAPSHOT, demoTimelineEvents } from "./sample-data";

/**
 * The interactive "Money Manager" data model (Milestone 3).
 *
 * This module is the single source of truth for everything the user can edit:
 * the list of dated income/expense/payday events and the three scalar settings
 * that are *not* events (current balance, emergency reserve and the purchase
 * price under consideration).
 *
 * Design principles — deliberately mirroring the existing pure engines:
 * - All money is integer cents (see `./money`); all dates are ISO strings.
 * - A `FinancialEvent` **is** a `TimelineEvent`, so events feed straight into
 *   `computeCashFlowProjection` and `validateTimelineInput` with no adapters.
 * - Every operation is a pure function returning a brand-new `FinancialData`
 *   object (never mutates its input), which keeps React state updates trivial
 *   and makes the whole layer unit-testable without a DOM.
 * - Expected income and upcoming expenses are **derived from the events**, never
 *   entered separately. This is what prevents double-counting: the timeline and
 *   the affordability calculator both read the same event list, so every bill is
 *   counted exactly once.
 */

/**
 * A dated income, expense or payday event.
 *
 * Extends the timeline `TimelineEvent` with an **optional** `category`. Because
 * the field is optional and additive, a `FinancialEvent` is still structurally a
 * `TimelineEvent`, so the timeline engine, the affordability calculator and the
 * What-If Simulator all keep working with no changes. The category only ever
 * applies to `expense` events (see `./spending`); income and payday never carry
 * one. Events loaded from older stored data may omit it — they are migrated to
 * the default category on read (see `coerceFinancialData`).
 */
export interface FinancialEvent extends TimelineEvent {
  /** Expense category. Present for expenses; meaningless for income/payday. */
  category?: ExpenseCategory;
}

/** The scalar, non-event settings (all integer cents). */
export interface FinancialSettings {
  /** Money in the account right now. Also used as the timeline opening balance. */
  currentBalance: Cents;
  /** Buffer that must be preserved at all times. */
  emergencyReserve: Cents;
  /** Price of the purchase under consideration (a hypothetical, not an event). */
  purchasePrice: Cents;
}

/** The complete, persistable user dataset. */
export interface FinancialData {
  /** Schema version, so future migrations can detect older payloads. */
  version: number;
  events: FinancialEvent[];
  settings: FinancialSettings;
}

/** Current on-disk schema version for persisted data. */
export const FINANCIAL_DATA_VERSION = 2;

/**
 * Schema versions this build knows how to read. Version 1 predates expense
 * categories; when we read a v1 payload we migrate it forward (see
 * `coerceFinancialData`) rather than discarding the user's data. Any version not
 * listed here is treated as incompatible and ignored.
 */
export const SUPPORTED_FINANCIAL_DATA_VERSIONS: readonly number[] = [1, 2];

/**
 * The values a user submits when creating an event. The amount is captured as a
 * positive magnitude; `addEvent` applies the correct sign for the chosen kind so
 * expenses are stored negative and income/payday positive — matching the rules
 * enforced by `validateTimelineInput`.
 */
export interface EventDraft {
  description: string;
  /** Positive magnitude in cents (the sign is applied from `kind`). */
  amount: Cents;
  /** ISO calendar date (`YYYY-MM-DD`). */
  date: string;
  kind: TimelineEventKind;
  confidence: EventConfidence;
  /**
   * Expense category. Only meaningful when `kind` is `expense`; ignored for
   * income/payday. When omitted for an expense, the default category is used.
   */
  category?: ExpenseCategory;
}

let idCounter = 0;

/**
 * Generate a stable, unique event id. Uses a monotonic counter plus a timestamp
 * and random suffix so ids stay unique within a session and across reloads even
 * if two events are created in the same millisecond.
 */
export function newEventId(): string {
  idCounter += 1;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ev-${time}-${idCounter}-${rand}`;
}

/** Apply the correct sign to a positive magnitude for the given event kind. */
export function signedAmount(kind: TimelineEventKind, magnitude: Cents): Cents {
  const abs = Math.abs(magnitude);
  return kind === "expense" ? -abs : abs;
}

/**
 * Resolve the category to store for an event. Categories only apply to
 * expenses; income and payday events never carry one. An expense with no
 * category (or an unrecognised value) falls back to the default category, so
 * the stored data is always complete and the spending breakdown never has to
 * guess.
 */
export function resolveEventCategory(
  kind: TimelineEventKind,
  category: ExpenseCategory | undefined,
): ExpenseCategory | undefined {
  if (kind !== "expense") return undefined;
  return normalizeCategory(category);
}

/**
 * The default dataset, seeded from the demo sample so a first-time visitor sees
 * the familiar illustrative figures — which they can then edit, extend and have
 * persisted. `today` is used to turn the relative demo offsets into real dates.
 */
export function defaultFinancialData(today: Date = new Date()): FinancialData {
  return {
    version: FINANCIAL_DATA_VERSION,
    events: demoTimelineEvents(today),
    settings: {
      currentBalance: eurosToCents(DEMO_SNAPSHOT.currentBalance),
      emergencyReserve: eurosToCents(DEMO_SNAPSHOT.emergencyReserve),
      purchasePrice: eurosToCents(DEMO_SNAPSHOT.purchasePrice),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Pure operations (all return a new FinancialData)                           */
/* -------------------------------------------------------------------------- */

/** Append a new event built from a draft. */
export function addEvent(data: FinancialData, draft: EventDraft): FinancialData {
  const event: FinancialEvent = {
    id: newEventId(),
    description: draft.description.trim(),
    amount: signedAmount(draft.kind, draft.amount),
    date: draft.date,
    kind: draft.kind,
    confidence: draft.confidence,
    category: resolveEventCategory(draft.kind, draft.category),
  };
  return { ...data, events: [...data.events, event] };
}

/** Replace the editable fields of an existing event (its id is immutable). */
export function updateEvent(
  data: FinancialData,
  id: string,
  patch: Partial<Omit<FinancialEvent, "id">>,
): FinancialData {
  return {
    ...data,
    events: data.events.map((event) =>
      event.id === id ? { ...event, ...patch, id: event.id } : event,
    ),
  };
}

/** Remove an event by id. */
export function removeEvent(data: FinancialData, id: string): FinancialData {
  return { ...data, events: data.events.filter((event) => event.id !== id) };
}

/** Merge a partial settings update into the dataset. */
export function updateSettings(
  data: FinancialData,
  patch: Partial<FinancialSettings>,
): FinancialData {
  return { ...data, settings: { ...data.settings, ...patch } };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/** Result of validating the whole dataset — mirrors `TimelineValidation`. */
export type FinancialDataValidation =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Validate the entire dataset: the events (delegated to the timeline engine so
 * the rules live in exactly one place) plus the scalar settings. Used both by
 * the storage layer (to reject corrupt persisted data) and by tests.
 */
export function validateFinancialData(
  data: FinancialData,
): FinancialDataValidation {
  const errors: string[] = [];

  for (const [name, value] of Object.entries(data.settings)) {
    if (!Number.isInteger(value)) {
      errors.push(`Setting "${name}" must be a whole number of cents.`);
    } else if (value < 0) {
      errors.push(`Setting "${name}" cannot be negative.`);
    }
  }

  const timeline = validateTimelineInput({
    openingBalance: data.settings.currentBalance,
    reserve: data.settings.emergencyReserve,
    events: data.events,
  });
  if (!timeline.ok) errors.push(...timeline.errors);

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/* -------------------------------------------------------------------------- */
/* Safe coercion (for untrusted persisted JSON)                               */
/* -------------------------------------------------------------------------- */

function isKind(value: unknown): value is TimelineEventKind {
  return value === "income" || value === "expense" || value === "payday";
}

function isConfidence(value: unknown): value is EventConfidence {
  return value === "confirmed" || value === "estimated";
}

function coerceCents(value: unknown): Cents | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function coerceEvent(value: unknown): FinancialEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (typeof e.id !== "string" || e.id.trim() === "") return null;
  if (typeof e.description !== "string" || e.description.trim() === "") return null;
  if (typeof e.amount !== "number" || !Number.isInteger(e.amount) || e.amount === 0) {
    return null;
  }
  if (typeof e.date !== "string" || !isIsoDate(e.date)) return null;
  if (!isKind(e.kind) || !isConfidence(e.confidence)) return null;
  return {
    id: e.id,
    description: e.description,
    amount: e.amount,
    date: e.date,
    kind: e.kind,
    confidence: e.confidence,
    // Categories apply to expenses only. A missing or invalid category (e.g.
    // from legacy v1 data) is migrated to the default; income/payday never
    // carry one. This preserves every valid field while filling the new one.
    category: resolveEventCategory(e.kind, e.category as ExpenseCategory | undefined),
  };
}

/**
 * Attempt to interpret arbitrary parsed JSON as a valid `FinancialData`.
 * Returns `null` for anything that is not a complete, valid dataset (wrong
 * version, malformed events, non-integer settings, …) so the caller can fall
 * back to defaults instead of crashing on corrupt input.
 */
export function coerceFinancialData(input: unknown): FinancialData | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;

  // Accept any supported version and migrate forward. A v1 payload (which has
  // no categories) is read as-is and its events are given the default category
  // by `coerceEvent`, then stamped with the current version — so existing user
  // data is preserved, never discarded. Unknown/future versions are rejected.
  if (!SUPPORTED_FINANCIAL_DATA_VERSIONS.includes(obj.version as number)) {
    return null;
  }

  const settings = obj.settings as Record<string, unknown> | undefined;
  if (typeof settings !== "object" || settings === null) return null;

  const currentBalance = coerceCents(settings.currentBalance);
  const emergencyReserve = coerceCents(settings.emergencyReserve);
  const purchasePrice = coerceCents(settings.purchasePrice);
  if (
    currentBalance === null ||
    emergencyReserve === null ||
    purchasePrice === null
  ) {
    return null;
  }

  if (!Array.isArray(obj.events)) return null;
  const events: FinancialEvent[] = [];
  const seenIds = new Set<string>();
  for (const raw of obj.events) {
    const event = coerceEvent(raw);
    // Skip anything malformed rather than rejecting the whole dataset, but
    // never keep two events with the same id (that would break the timeline).
    if (event === null || seenIds.has(event.id)) continue;
    seenIds.add(event.id);
    events.push(event);
  }

  const data: FinancialData = {
    version: FINANCIAL_DATA_VERSION,
    events,
    settings: { currentBalance, emergencyReserve, purchasePrice },
  };

  return validateFinancialData(data).ok ? data : null;
}

