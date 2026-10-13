"use client";

import { RotateCcw, Calculator as CalculatorIcon, Link2 } from "lucide-react";

import { formatCents, type Cents } from "@/lib/money";
import { SETTING_LABELS, type EditableSetting, type UseFinancialData } from "@/hooks/use-financial-data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/currency-input";
import { cn } from "@/lib/utils";

/**
 * Section B — the editable purchase-affordability calculator.
 *
 * Only the three scalar settings are editable here (balance, reserve, purchase
 * price). Expected income and upcoming expenses are **derived from the event
 * list** and shown read-only, so a bill can never be counted twice — once as an
 * event and once as a typed figure. Edit income/expenses in the event manager
 * and these update automatically.
 */

export interface AffordabilityCalculatorProps {
  finance: UseFinancialData;
}

const EDITABLE_FIELDS: {
  field: EditableSetting;
  hint: string;
}[] = [
  {
    field: "currentBalance",
    hint: "Money available in your account today.",
  },
  {
    field: "emergencyReserve",
    hint: "A buffer you want to keep untouched.",
  },
  {
    field: "purchasePrice",
    hint: "How much the item you're considering costs.",
  },
];

const DERIVED_FIELDS: {
  id: string;
  label: string;
  getValue: (finance: UseFinancialData) => Cents;
}[] = [
  {
    id: "expectedIncome",
    label: "Expected income before payday",
    getValue: (finance) => finance.expectedIncome,
  },
  {
    id: "upcomingExpenses",
    label: "Upcoming expenses before payday",
    getValue: (finance) => finance.upcomingExpenses,
  },
];

export function AffordabilityCalculator({ finance }: AffordabilityCalculatorProps) {
  const { values, errors, setSettingValue, reset } = finance;

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary"
              aria-hidden="true"
            >
              <CalculatorIcon className="size-4.5" />
            </span>
            <div>
              <CardTitle>Purchase affordability</CardTitle>
              <CardDescription>
                Adjust the figures to see what you can safely spend.
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset} type="button">
            <RotateCcw className="size-3.5" />
            Reset demo data
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {EDITABLE_FIELDS.map(({ field, hint }) => (
            <CurrencyInput
              key={field}
              label={SETTING_LABELS[field]}
              hint={hint}
              value={values[field]}
              error={errors[field]}
              onChange={(next) => setSettingValue(field, next)}
            />
          ))}

          {DERIVED_FIELDS.map(({ id, label, getValue }) => (
            <div key={id} className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium leading-none text-foreground/90">
                <Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {label}
              </span>
              <output
                className={cn(
                  "flex h-10 w-full items-center rounded-md border border-dashed border-border/70",
                  "bg-secondary/30 px-3 text-sm font-semibold tabular-nums text-foreground/90",
                )}
              >
                {formatCents(getValue(finance))}
              </output>
              <p className="text-xs text-muted-foreground">
                Derived from your events — edit them above.
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

