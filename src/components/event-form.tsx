"use client";

import * as React from "react";
import { Plus, Save, X } from "lucide-react";

import { parseEuroInput, centsToEuros, type Cents } from "@/lib/money";
import { isIsoDate, type TimelineEventKind, type EventConfidence } from "@/lib/timeline";
import type { EventDraft } from "@/lib/financial-data";
import { CATEGORY_OPTIONS, type ExpenseCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The add/edit form for a single income, expense or payday event.
 *
 * It owns only its own transient draft state and validates on submit, then hands
 * a clean `EventDraft` (positive magnitude + kind) to the caller. All money
 * parsing and date validation is delegated to the pure helpers in `@/lib`, so
 * the rules stay in one place.
 */

export interface EventFormProps {
  /** When provided, the form edits this event; otherwise it adds a new one. */
  initial?: EventDraft;
  /** ISO date used to default a new event's date (today). */
  defaultDate: string;
  submitLabel?: string;
  onSubmit: (draft: EventDraft) => void;
  onCancel?: () => void;
}

interface DraftState {
  description: string;
  amount: string;
  date: string;
  kind: TimelineEventKind;
  confidence: EventConfidence;
  category: ExpenseCategory;
}

const KIND_OPTIONS: { value: TimelineEventKind; label: string }[] = [
  { value: "expense", label: "Expense (money out)" },
  { value: "income", label: "Income (money in)" },
  { value: "payday", label: "Payday" },
];

const CONFIDENCE_OPTIONS: { value: EventConfidence; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "estimated", label: "Estimate" },
];

const selectClass = cn(
  "flex h-10 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm shadow-sm",
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
);

function toDraftState(
  initial: EventDraft | undefined,
  defaultDate: string,
): DraftState {
  if (initial) {
    return {
      description: initial.description,
      // Show the magnitude as a plain euro amount (the kind carries the sign).
      amount: String(centsToEuros(Math.abs(initial.amount))),
      date: initial.date,
      kind: initial.kind,
      confidence: initial.confidence,
      // Only meaningful for expenses; fall back to the default otherwise.
      category: initial.category ?? "other",
    };
  }
  return {
    description: "",
    amount: "",
    date: defaultDate,
    kind: "expense",
    confidence: "confirmed",
    category: "other",
  };
}

interface FieldProps {
  label: string;
  id: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

function Field({ label, id, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-foreground/90">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function EventForm({
  initial,
  defaultDate,
  submitLabel,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const [draft, setDraft] = React.useState<DraftState>(() =>
    toDraftState(initial, defaultDate),
  );
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof DraftState, string>>
  >({});

  const isEditing = initial !== undefined;

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): EventDraft | null {
    const next: Partial<Record<keyof DraftState, string>> = {};

    if (draft.description.trim() === "") {
      next.description = "A short description is required.";
    }

    const parsed = parseEuroInput(draft.amount);
    let amount: Cents | null = null;
    if (!parsed.ok) {
      next.amount = parsed.error;
    } else if (parsed.cents <= 0) {
      next.amount = "Amount must be greater than zero.";
    } else {
      amount = parsed.cents;
    }

    if (!isIsoDate(draft.date)) {
      next.date = "Choose a valid date.";
    }

    setErrors(next);
    if (amount === null || Object.keys(next).length > 0) return null;

    return {
      description: draft.description,
      amount,
      date: draft.date,
      kind: draft.kind,
      confidence: draft.confidence,
      // The category is only meaningful for expenses; the data layer ignores it
      // for income/payday via `resolveEventCategory`.
      category: draft.category,
    };
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = validate();
    if (result) onSubmit(result);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Description" error={errors.description} id="event-description">
          <Input
            id="event-description"
            value={draft.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="e.g. Rent, Salary, Gym"
            autoComplete="off"
          />
        </Field>

        <Field label="Amount (€)" error={errors.amount} id="event-amount">
          <Input
            id="event-amount"
            type="text"
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => update("amount", e.target.value)}
            placeholder="0.00"
            autoComplete="off"
            className="tabular-nums"
          />
        </Field>

        <Field label="Date" error={errors.date} id="event-date">
          <Input
            id="event-date"
            type="date"
            value={draft.date}
            onChange={(e) => update("date", e.target.value)}
          />
        </Field>

        <Field label="Type" id="event-kind">
          <select
            id="event-kind"
            value={draft.kind}
            onChange={(e) => update("kind", e.target.value as TimelineEventKind)}
            className={selectClass}
          >
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        {draft.kind === "expense" && (
          <Field
            label="Category"
            id="event-category"
            hint="Used by Spending Intelligence to break down where your money goes."
          >
            <select
              id="event-category"
              value={draft.category}
              onChange={(e) =>
                update("category", e.target.value as ExpenseCategory)
              }
              className={selectClass}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Confidence" id="event-confidence" className="sm:col-span-2">
          <select
            id="event-confidence"
            value={draft.confidence}
            onChange={(e) =>
              update("confidence", e.target.value as EventConfidence)
            }
            className={selectClass}
          >
            {CONFIDENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          {isEditing ? (
            <Save className="size-3.5" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {submitLabel ?? (isEditing ? "Save changes" : "Add event")}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            <X className="size-3.5" />
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

