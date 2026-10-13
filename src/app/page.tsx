"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { DemoDataNotice } from "@/components/demo-data-notice";
import { FinancialSnapshot } from "@/components/financial-snapshot";
import { AffordabilityCalculator } from "@/components/affordability-calculator";
import { DecisionResult } from "@/components/decision-result";
import { CashFlowTimeline } from "@/components/cash-flow-timeline";
import { EventManager } from "@/components/event-manager";
import { WhatIfSimulator } from "@/components/what-if-simulator";
import { SpendingIntelligence } from "@/components/spending-intelligence";
import { useFinancialData } from "@/hooks/use-financial-data";
import { useWhatIf } from "@/hooks/use-what-if";
import { useSpendingIntelligence } from "@/hooks/use-spending-intelligence";
import { diffIsoDays } from "@/lib/timeline";

export default function DashboardPage() {
  const finance = useFinancialData();
  const { projection, today, nextPaydayDate } = finance;

  // The What-If Simulator reads the current position but never writes to it.
  // The baseline is a read-only view; the simulator owns only its own inputs.
  const whatIfBaseline = useMemo(
    () => ({
      currentBalance: finance.settings.currentBalance,
      emergencyReserve: finance.settings.emergencyReserve,
      expectedIncome: finance.expectedIncome,
      upcomingExpenses: finance.upcomingExpenses,
      events: finance.events,
      today,
    }),
    [
      finance.settings.currentBalance,
      finance.settings.emergencyReserve,
      finance.expectedIncome,
      finance.upcomingExpenses,
      finance.events,
      today,
    ],
  );
  const simulator = useWhatIf(whatIfBaseline);

  // Spending Intelligence reads the saved events and groups expenses by category
  // for a chosen period. Read-only — it never mutates or persists anything.
  const spending = useSpendingIntelligence(finance.events, today);

  // A short, human next-payday label derived from the projected payday date so
  // the snapshot and the timeline always agree.
  const paydayLabel = useMemo(() => {
    if (!nextPaydayDate) return "Not scheduled";
    const days = diffIsoDays(today, nextPaydayDate);
    const date = new Date(`${nextPaydayDate}T00:00:00Z`);
    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(date);
    return days >= 0 ? `${formatted} · in ${days} days` : formatted;
  }, [nextPaydayDate, today]);

  const snapshot = useMemo(
    () => ({
      currentBalance: finance.settings.currentBalance,
      expectedIncome: finance.expectedIncome,
      upcomingExpenses: finance.upcomingExpenses,
      emergencyReserve: finance.settings.emergencyReserve,
      paydayLabel,
    }),
    [finance.settings.currentBalance, finance.settings.emergencyReserve, finance.expectedIncome, finance.upcomingExpenses, paydayLabel],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        action={
          <Badge variant="accent" className="gap-1.5">
            <span
              className="size-1.5 rounded-full bg-accent"
              aria-hidden="true"
            />
            Saved in this browser
          </Badge>
        }
      />

      <main className="container flex-1 py-8 sm:py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Intro + prominent demo notice */}
          <section className="animate-fade-in-up space-y-4">
            <div className="space-y-2">
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                Can I afford this before payday?
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                See exactly how a purchase affects your money between now and
                your next payday — with your emergency reserve always protected.
                Add your income and bills below; everything stays saved on this
                device.
              </p>
            </div>
            <DemoDataNotice prominent />
          </section>

          {/* Decision result first — it answers the core question up front */}
          <DecisionResult
            result={finance.affordability}
            isValid={finance.affordabilityValid}
          />

          {/* Snapshot + calculator side by side on large screens */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <FinancialSnapshot {...snapshot} />
            <AffordabilityCalculator finance={finance} />
          </div>

          {/* Interactive event manager — add / edit / delete income & expenses */}
          <EventManager
            events={finance.events}
            today={today}
            onAdd={finance.addEvent}
            onEdit={finance.editEvent}
            onDelete={finance.deleteEvent}
          />

          {/* What-If Simulator — explore hypotheticals without touching saved data */}
          <WhatIfSimulator
            simulator={simulator}
            emergencyReserve={finance.settings.emergencyReserve}
          />

          {/* Spending Intelligence — where the money goes, by category */}
          <SpendingIntelligence intelligence={spending} />

          {/* Money timeline — the cash-flow forecast until payday */}
          <CashFlowTimeline projection={projection} today={today} />

          <footer className="pt-2 text-center text-xs text-muted-foreground">
            AUREON keeps your data in this browser only. It is decision support,
            not financial advice, and does not connect to any bank.
          </footer>
        </div>
      </main>
    </div>
  );
}

