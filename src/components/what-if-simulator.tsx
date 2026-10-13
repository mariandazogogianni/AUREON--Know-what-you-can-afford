"use client";

import {
  FlaskConical,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";

import { formatCents, formatCentsSigned, type Cents } from "@/lib/money";
import { describeResult } from "@/lib/decision";
import type { WhatIfResult } from "@/lib/what-if";
import type { UseWhatIf } from "@/hooks/use-what-if";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/currency-input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Section — the What-If Simulator (Milestone 4).
 *
 * A clearly-labelled sandbox for exploring a hypothetical purchase and an
 * optional recurring monthly savings commitment. Nothing here touches the saved
 * financial data: it only reads the current position and layers a scenario on
 * top. Every figure is framed as a projection, never a guarantee.
 */

export interface WhatIfSimulatorProps {
  simulator: UseWhatIf;
  /** The configured emergency reserve (for the reserve-impact readout). */
  emergencyReserve: Cents;
}

const statusTone: Record<
  WhatIfResult["affordability"]["status"],
  { chip: string; text: string; label: string }
> = {
  within: {
    chip: "bg-success/15 text-success",
    text: "text-success",
    label: "Within your limit",
  },
  caution: {
    chip: "bg-warning/15 text-warning",
    text: "text-warning",
    label: "Caution",
  },
  above: {
    chip: "bg-danger/15 text-danger",
    text: "text-danger",
    label: "Above your limit",
  },
};

export function WhatIfSimulator({
  simulator,
  emergencyReserve,
}: WhatIfSimulatorProps) {
  const { result, purchaseRaw, savingsRaw, purchaseError, savingsError, reset } =
    simulator;

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-accent/15 text-accent"
              aria-hidden="true"
            >
              <FlaskConical className="size-4.5" />
            </span>
            <div>
              <CardTitle>What if?</CardTitle>
              <CardDescription>
                Explore a hypothetical purchase without changing your saved
                data. Nothing here is written to this browser.
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset} type="button">
            <RotateCcw className="size-3.5" />
            Reset scenario
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CurrencyInput
            label="Hypothetical purchase"
            hint="A one-off amount you're considering spending."
            value={purchaseRaw}
            error={purchaseError}
            onChange={simulator.setPurchase}
          />
          <CurrencyInput
            label="Monthly savings (optional)"
            hint="A recurring amount you'd commit to saving each month."
            value={savingsRaw}
            error={savingsError}
            onChange={simulator.setSavings}
          />
        </div>

        {result ? (
          <ScenarioResult result={result} emergencyReserve={emergencyReserve} />
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Enter a valid purchase amount to see the projected impact.
          </p>
        )}

        <Assumptions result={result} />
      </CardContent>
    </Card>
  );
}

function ScenarioResult({
  result,
  emergencyReserve,
}: {
  result: WhatIfResult;
  emergencyReserve: Cents;
}) {
  const { affordability, projectedBalanceBeforePayday } = result;
  const presentation = describeResult(affordability);
  const tone = statusTone[affordability.status];

  const reserveAfter = projectedBalanceBeforePayday - emergencyReserve;
  const reserveHeld = reserveAfter >= 0;

  const tiles = [
    {
      id: "remaining",
      label: "Projected balance before payday",
      value: formatCentsSigned(projectedBalanceBeforePayday),
      caption: "After this hypothetical purchase",
      tone: projectedBalanceBeforePayday < 0 ? "text-danger" : "text-foreground",
    },
    {
      id: "reserve",
      label: "Effect on your reserve",
      value: formatCentsSigned(reserveAfter),
      caption: reserveHeld
        ? "Reserve stays intact in this scenario"
        : "This scenario would dip into your reserve",
      tone: reserveHeld ? "text-success" : "text-warning",
    },
    {
      id: "protected",
      label: "Protected (reserve + savings)",
      value: formatCents(result.protectedAmount),
      caption:
        result.monthlySavings > 0
          ? "Includes your monthly savings commitment"
          : "Reserve only — no savings commitment",
      tone: "text-foreground",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Decision banner — reuses the shared affordability wording */}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-start gap-3.5 rounded-md border p-4",
          presentation.container,
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full",
            presentation.iconWrap,
          )}
          aria-hidden="true"
        >
          {result.createsCashFlowWarning ? (
            <TriangleAlert className="size-5" />
          ) : (
            <ShieldCheck className="size-5" />
          )}
        </span>
        <div className="min-w-0 space-y-1">
          <p className={cn("text-lg font-semibold", presentation.accentText)}>
            {tone.label}
          </p>
          <p className="text-sm leading-relaxed text-foreground/85">
            {presentation.explanation}
          </p>
        </div>
      </div>

      {/* Cash-flow warning / reserve status before payday */}
      {result.createsCashFlowWarning ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm text-foreground/90"
        >
          <TrendingDown className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p>
            <span className="font-semibold text-danger">Cash-flow warning.</span>{" "}
            In this scenario your balance would drop below zero before payday
            {result.lowestBeforePayday.date
              ? ` — lowest around ${formatCents(
                  Math.abs(result.lowestBeforePayday.balance),
                )} in the red.`
              : "."}
          </p>
        </div>
      ) : result.dipsIntoConfiguredReserve ? (
        <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-foreground/90">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            <span className="font-semibold text-warning">Reserve at risk.</span>{" "}
            Your balance would dip below your configured reserve before payday,
            though it stays above zero.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-md border border-success/30 bg-success/10 px-3.5 py-3 text-sm text-foreground/90">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <p>
            <span className="font-semibold text-success">
              No cash-flow warning.
            </span>{" "}
            Your balance stays above zero and clear of your reserve until payday
            in this scenario.
          </p>
        </div>
      )}

      {/* Key figures */}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.id}
            className="rounded-md border border-border/60 bg-background/40 p-3.5"
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tile.label}
            </dt>
            <dd
              className={cn(
                "mt-0.5 text-lg font-semibold tabular-nums",
                tile.tone,
              )}
            >
              {tile.value}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tile.caption}
            </p>
          </div>
        ))}
      </dl>

      {affordability.status !== "above" && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Safe spending limit {formatCents(affordability.safeSpendingLimit)}
          </Badge>
          <Badge variant="outline">
            Comfort buffer {formatCents(affordability.cautionBuffer)}
          </Badge>
        </div>
      )}
    </div>
  );
}


function Assumptions({ result }: { result: WhatIfResult | null }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border/60 bg-background/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold text-foreground/80">
          Assumptions &amp; limitations.
        </span>{" "}
        This is a projection, not a guarantee. It assumes the purchase happens
        today and that any monthly savings commitment is money set aside and no
        longer spendable. It relies on the same figures as your saved timeline,
        so a missing bill, a changed amount or late income will shift the real
        outcome.{" "}
        {result?.projection.usesEstimates &&
          "Your timeline includes estimated amounts that may still change. "}
        {result && !result.projection.hasReserve &&
          "No emergency reserve is configured, so reserve protection is switched off. "}
        Scenarios are never saved — your real data is untouched.
      </p>
    </div>
  );
}

