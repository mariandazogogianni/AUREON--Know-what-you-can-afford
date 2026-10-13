"use client";

import { PieChart as PieChartIcon, TrendingDown, TrendingUp } from "lucide-react";

import { formatCents, formatCentsSigned } from "@/lib/money";
import {
  CATEGORY_TONES,
  normalizeCategory,
} from "@/lib/categories";
import { formatPercentage, type SpendingSummary } from "@/lib/spending";
import type { UseSpendingIntelligence } from "@/hooks/use-spending-intelligence";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Section — Spending Intelligence (Milestone 5).
 *
 * Shows where the money goes for a chosen period: total spend, a per-category
 * breakdown with percentages, a visual bar for each category, and factual
 * observations. Every figure is framed as derived from the user's own recorded
 * expenses — never as a guarantee — and comparisons are only shown when there is
 * a real prior month to compare against.
 */

export interface SpendingIntelligenceProps {
  intelligence: UseSpendingIntelligence;
}

export function SpendingIntelligence({
  intelligence,
}: SpendingIntelligenceProps) {
  const { periods, selectedPeriod, selectPeriod, summary } = intelligence;

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary"
              aria-hidden="true"
            >
              <PieChartIcon className="size-4.5" />
            </span>
            <div>
              <CardTitle>Spending intelligence</CardTitle>
              <CardDescription>
                Where your money goes, based only on the expenses you&apos;ve
                recorded.
              </CardDescription>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="spending-period"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Period
            </label>
            <select
              id="spending-period"
              value={selectedPeriod}
              onChange={(e) => selectPeriod(e.target.value)}
              className={cn(
                "h-9 rounded-md border border-input bg-background/60 px-3 text-sm shadow-sm",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {periods.map((period) => (
                <option key={period.key} value={period.key}>
                  {period.label}
                  {period.key === selectedPeriod ? "" : period.hasExpenses ? "" : " (no expenses)"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <TotalHeader summary={summary} />
        {summary.expenseCount === 0 ? (
          <EmptyPeriod label={summary.periodLabel} />
        ) : (
          <CategoryBreakdown summary={summary} />
        )}
        <Comparison summary={summary} />
        <Observations summary={summary} />
        <Assumptions />
      </CardContent>
    </Card>
  );
}

function TotalHeader({ summary }: { summary: SpendingSummary }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-4 py-3.5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Total expenses · {summary.periodLabel}
        </p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
          {formatCents(summary.totalExpenses)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {summary.expenseCount === 0
          ? "No expenses recorded"
          : `${summary.expenseCount} ${
              summary.expenseCount === 1 ? "expense" : "expenses"
            } across ${summary.slices.length} ${
              summary.slices.length === 1 ? "category" : "categories"
            }`}
      </p>
    </div>
  );
}

function EmptyPeriod({ label }: { label: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      No expenses are recorded for {label}. Add an expense in the section above
      and it will appear here, broken down by category.
    </p>
  );
}

function CategoryBreakdown({ summary }: { summary: SpendingSummary }) {
  const maxAmount = summary.slices.reduce(
    (max, slice) => Math.max(max, slice.amount),
    0,
  );

  return (
    <ul className="space-y-3" aria-label={`Expenses by category for ${summary.periodLabel}`}>
      {summary.slices.map((slice) => {
        const tone = CATEGORY_TONES[normalizeCategory(slice.category)];
        // Bar width is relative to the largest category so differences show.
        const width = maxAmount > 0 ? (slice.amount / maxAmount) * 100 : 0;
        return (
          <li key={slice.category} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn("size-2.5 shrink-0 rounded-full", tone.bar)}
                  aria-hidden="true"
                />
                <span className="truncate font-medium text-foreground/90">
                  {slice.label}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  ({slice.count})
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="font-semibold text-foreground">
                  {formatCents(slice.amount)}
                </span>
                <span className={cn("text-xs font-medium", tone.text)}>
                  {formatPercentage(slice.percentage)}
                </span>
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-secondary/60"
              role="presentation"
            >
              <div
                className={cn("h-full rounded-full", tone.bar)}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}


function Comparison({ summary }: { summary: SpendingSummary }) {
  if (!summary.comparisonAvailable || summary.changeVsPrevious === null) {
    return (
      <p className="rounded-md border border-border/60 bg-background/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
        Not enough history to compare with {summary.previousPeriodLabel} yet.
        Once both months have recorded expenses, AUREON will show how your total
        changed — it won&apos;t guess a trend from a single month.
      </p>
    );
  }

  const change = summary.changeVsPrevious;
  const isUp = change > 0;
  const isDown = change < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-3.5 py-3">
      <p className="text-sm text-foreground/85">
        vs {summary.previousPeriodLabel}{" "}
        <span className="text-muted-foreground">
          ({formatCents(summary.previousTotalExpenses)})
        </span>
      </p>
      <span
        className={cn(
          "flex items-center gap-1.5 text-sm font-semibold tabular-nums",
          isUp ? "text-danger" : isDown ? "text-success" : "text-muted-foreground",
        )}
      >
        {Icon && <Icon className="size-4" aria-hidden="true" />}
        {change === 0 ? "No change" : formatCentsSigned(change)}
      </span>
    </div>
  );
}

function Observations({ summary }: { summary: SpendingSummary }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Observations
      </p>
      <ul className="space-y-1.5">
        {summary.observations.map((note, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-sm leading-relaxed text-foreground/85"
          >
            <span
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
              aria-hidden="true"
            />
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Assumptions() {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border/60 bg-background/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
      <TrendingDown className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold text-foreground/80">
          How to read this.
        </span>{" "}
        These totals come only from the expenses you&apos;ve entered, grouped by
        the category you chose. Income and payday are never counted here. This is
        a record of what you&apos;ve logged — not a prediction or a guarantee — so
        a missing or mis-categorised expense will change the breakdown. Categorise
        each expense when you add or edit it for the most accurate picture.
      </p>
    </div>
  );
}

