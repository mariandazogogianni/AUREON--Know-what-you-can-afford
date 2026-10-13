import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DemoDataNoticeProps {
  className?: string;
  /** Slightly stronger styling for the prominent top-of-page variant. */
  prominent?: boolean;
}

/**
 * Small, dismissible-looking notice that makes clear every figure shown is
 * illustrative demo data and not a real account.
 */
export function DemoDataNotice({ className, prominent = false }: DemoDataNoticeProps) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-accent/25 bg-accent/10 px-3.5 py-2.5 text-sm text-foreground/90",
        prominent && "px-4 py-3",
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      <p className="leading-relaxed">
        <span className="font-semibold text-accent">Demo data.</span>{" "}
        All balances, income, bills and dates below are illustrative samples, not
        a real account. AUREON never connects to your bank in this preview.
      </p>
    </div>
  );
}
