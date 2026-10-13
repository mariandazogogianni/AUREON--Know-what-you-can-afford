import type { Cents } from "./money";

/**
 * Expense categories (Milestone 5 — Spending Intelligence).
 *
 * A small, fixed taxonomy that applies to **expense** events only. Income and
 * payday events are never categorised. The list is intentionally short and
 * concrete so users can place every bill without guesswork, with `other` as the
 * catch-all and the default for events that predate categories.
 *
 * This module is pure data + tiny pure helpers; it contains no financial
 * arithmetic (totals and percentages live in `./spending`).
 */

/** The canonical expense-category slugs. */
export const EXPENSE_CATEGORIES = [
  "housing",
  "groceries",
  "utilities",
  "transportation",
  "health",
  "shopping",
  "entertainment",
  "subscriptions",
  "other",
] as const;

/** A single expense category. */
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** The category used for expenses that have none (legacy or unspecified). */
export const DEFAULT_EXPENSE_CATEGORY: ExpenseCategory = "other";

/** Human labels for each category, for selects and readouts. */
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  housing: "Housing",
  groceries: "Groceries",
  utilities: "Utilities",
  transportation: "Transportation",
  health: "Health",
  shopping: "Shopping",
  entertainment: "Entertainment",
  subscriptions: "Subscriptions",
  other: "Other",
};

/**
 * Per-category presentation, consistent with the AUREON design tokens
 * (see `globals.css` / `tailwind.config.ts`). `bar` colours the breakdown bar,
 * `chip`/`text` tint the label. Colours repeat across the nine categories on
 * purpose — the label and amount always disambiguate — but every category has a
 * stable, meaningful tone.
 */
export interface CategoryTone {
  bar: string;
  chip: string;
  text: string;
}

export const CATEGORY_TONES: Record<ExpenseCategory, CategoryTone> = {
  housing: { bar: "bg-accent", chip: "bg-accent/15 text-accent", text: "text-accent" },
  groceries: { bar: "bg-success", chip: "bg-success/15 text-success", text: "text-success" },
  utilities: { bar: "bg-primary", chip: "bg-primary/15 text-primary", text: "text-primary" },
  transportation: { bar: "bg-warning", chip: "bg-warning/15 text-warning", text: "text-warning" },
  health: { bar: "bg-danger", chip: "bg-danger/15 text-danger", text: "text-danger" },
  shopping: { bar: "bg-accent", chip: "bg-accent/15 text-accent", text: "text-accent" },
  entertainment: { bar: "bg-primary", chip: "bg-primary/15 text-primary", text: "text-primary" },
  subscriptions: { bar: "bg-success", chip: "bg-success/15 text-success", text: "text-success" },
  other: {
    bar: "bg-muted-foreground",
    chip: "bg-secondary text-muted-foreground",
    text: "text-muted-foreground",
  },
};

/** Type guard: is an arbitrary value one of the known categories? */
export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Normalise a possibly-missing or invalid category to a valid one. Anything
 * unrecognised (including `undefined`) becomes the default, so corrupt stored
 * data can never break the breakdown. Returns `undefined` untouched for the
 * caller to decide (the data layer only assigns categories to expenses).
 */
export function normalizeCategory(value: unknown): ExpenseCategory {
  return isExpenseCategory(value) ? value : DEFAULT_EXPENSE_CATEGORY;
}

/** Options for a category `<select>`, including a leading placeholder. */
export const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] =
  EXPENSE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

/** A ready-to-render label + amount pair (used by the breakdown UI). */
export interface CategoryDisplay {
  category: ExpenseCategory;
  label: string;
  amount: Cents;
  tone: CategoryTone;
  /** Pre-formatted amount, e.g. "1.234,56 €". */
  formatted: string;
}
