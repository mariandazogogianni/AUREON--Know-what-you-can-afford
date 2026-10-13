"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";

import type { AffordabilityResult } from "@/lib/finance";
import { buildCalculationRows, describeResult } from "@/lib/decision";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const statusIcon = {
  check: CheckCircle2,
  alert: AlertTriangle,
  x: XCircle,
} as const;

const valueToneClass = {
  default: "text-foreground",
  positive: "text-success",
  negative: "text-danger",
  accent: "text-accent",
} as const;

export interface DecisionResultProps {
  /** The computed result, or `null` when inputs are still invalid. */
  result: AffordabilityResult | null;
  /** Whether the current inputs are all valid. */
  isValid: boolean;
}

/** Section C — the transparent decision outcome + calculation breakdown. */
export function DecisionResult({ result, isValid }: DecisionResultProps) {
  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <CardTitle>Can you afford it?</CardTitle>
        <CardDescription>
          A transparent look at the maths behind the answer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isValid || !result ? (
          <EmptyState />
        ) : (
          <>
            <StatusBanner result={result} />
            <CalculationTable result={result} />
            <Disclaimer />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBanner({ result }: { result: AffordabilityResult }) {
  const presentation = describeResult(result);
  const Icon = statusIcon[presentation.icon];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3.5 rounded-md border p-4 ${presentation.container}`}
    >
      <span
        className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ${presentation.iconWrap}`}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className={`text-lg font-semibold ${presentation.accentText}`}>
          {presentation.title}
        </p>
        <p className="text-sm leading-relaxed text-foreground/85">
          {presentation.explanation}
        </p>
      </div>
    </div>
  );
}

function CalculationTable({ result }: { result: AffordabilityResult }) {
  const rows = buildCalculationRows(result);

  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Step-by-step affordability calculation
        </caption>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border/50 last:border-b-0 even:bg-background/30"
            >
              <th
                scope="row"
                className="px-4 py-2.5 text-left font-medium align-top"
              >
                <span className="block text-foreground/90">{row.label}</span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  {row.formula}
                </span>
              </th>
              <td className="whitespace-nowrap px-4 py-2.5 text-right align-top">
                <span
                  className={`font-semibold tabular-nums ${
                    row.emphasis ? "text-base" : ""
                  } ${valueToneClass[row.tone ?? "default"]}`}
                >
                  {row.value}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border/60 bg-background/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p>
        This is an estimate, not a guarantee of financial safety. The result
        depends entirely on the accuracy and completeness of the figures you
        entered — if a bill is missing or income is delayed, the answer can
        change. Use it as a guide, not advice.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-10 text-center">
      <AlertTriangle className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground/90">
        Enter valid amounts to see your result
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Fix the highlighted fields above — amounts must be zero or more — and
        your affordability answer will appear here.
      </p>
    </div>
  );
}
