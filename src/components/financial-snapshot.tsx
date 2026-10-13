"use client";

import {
  ArrowDownLeft,
  CalendarClock,
  PiggyBank,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { formatCents, eurosToCents, type Cents } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface SnapshotItem {
  id: string;
  label: string;
  /** Formatted, ready-to-display value. */
  display: string;
  caption: string;
  icon: "wallet" | "income" | "expenses" | "reserve" | "payday";
  tone?: "default" | "positive" | "negative" | "accent";
}

const iconMap = {
  wallet: Wallet,
  income: ArrowDownLeft,
  expenses: ReceiptText,
  reserve: PiggyBank,
  payday: CalendarClock,
} as const;

const toneClass: Record<NonNullable<SnapshotItem["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-success",
  negative: "text-danger",
  accent: "text-accent",
};

const iconWrapClass: Record<NonNullable<SnapshotItem["tone"]>, string> = {
  default: "bg-secondary text-foreground/80",
  positive: "bg-success/15 text-success",
  negative: "bg-danger/15 text-danger",
  accent: "bg-accent/15 text-accent",
};

export interface FinancialSnapshotProps {
  currentBalance: Cents;
  expectedIncome: Cents;
  upcomingExpenses: Cents;
  emergencyReserve: Cents;
  /** Human-readable next payday label, e.g. "in 12 days" or "28 Oct". */
  paydayLabel: string;
}

/** Section A — a read-only overview of the current financial position. */
export function FinancialSnapshot({
  currentBalance,
  expectedIncome,
  upcomingExpenses,
  emergencyReserve,
  paydayLabel,
}: FinancialSnapshotProps) {
  const items: SnapshotItem[] = [
    {
      id: "balance",
      label: "Available balance",
      display: formatCents(currentBalance),
      caption: "Money in your account right now",
      icon: "wallet",
      tone: "default",
    },
    {
      id: "income",
      label: "Expected income",
      display: formatCents(expectedIncome),
      caption: "Before your next payday",
      icon: "income",
      tone: "positive",
    },
    {
      id: "expenses",
      label: "Upcoming bills",
      display: formatCents(upcomingExpenses),
      caption: "Due before your next payday",
      icon: "expenses",
      tone: "negative",
    },
    {
      id: "reserve",
      label: "Emergency reserve",
      display: formatCents(emergencyReserve),
      caption: "Buffer you protect at all times",
      icon: "reserve",
      tone: "accent",
    },
    {
      id: "payday",
      label: "Next payday",
      display: paydayLabel,
      caption: "When your income resets",
      icon: "payday",
      tone: "default",
    },
  ];

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Financial snapshot</CardTitle>
            <CardDescription>
              Where you stand between now and your next payday.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = iconMap[item.icon];
            const tone = item.tone ?? "default";
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-3.5 transition-colors hover:border-border"
              >
                <span
                  className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md ${iconWrapClass[tone]}`}
                  aria-hidden="true"
                >
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd
                    className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${toneClass[tone]}`}
                  >
                    {item.display}
                  </dd>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.caption}</p>
                </div>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Convenience: turn a raw euro number into display cents for the snapshot. */
export function toSnapshotCents(euros: number): Cents {
  return eurosToCents(euros);
}
