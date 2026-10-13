"use client";

import * as React from "react";
import { Euro } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  /** Accessible label text. */
  label: string;
  /** Optional helper text shown under the field. */
  hint?: string;
  /** Current raw string value. */
  value: string;
  /** Validation error message; when present the field renders in an error state. */
  error?: string;
  onChange: (next: string) => void;
}

/**
 * An accessible, euro-denominated currency field. Keeps the raw string in the
 * parent so parsing/validation stays in one place; this component only handles
 * presentation and a11y wiring.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ id, label, hint, value, error, onChange, className, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className="space-y-1.5">
        <Label htmlFor={inputId} className="text-foreground/90">
          {label}
        </Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <Euro className="size-4" />
          </span>
          <Input
            ref={ref}
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn("pl-9 tabular-nums", className)}
            {...props}
          />
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="text-xs font-medium text-destructive">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
