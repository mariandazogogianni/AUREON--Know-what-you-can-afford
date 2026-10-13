"use client";

import * as React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { formatCents, type Cents } from "@/lib/money";
import { diffIsoDays, type TimelineEventKind } from "@/lib/timeline";
import type { EventDraft, FinancialEvent } from "@/lib/financial-data";
import { CATEGORY_LABELS, normalizeCategory } from "@/lib/categories";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventForm } from "@/components/event-form";
import { cn } from "@/lib/utils";

/**
 * Section — the interactive event manager (Milestone 3).
 *
 * Lets the user add, edit and delete income/expense/payday events. Every change
 * flows straight back into the orchestrator, which persists it and recomputes the
 * Money Timeline and affordability — so the rest of the dashboard stays in sync.
 */

export interface EventManagerProps {
  events: FinancialEvent[];
  today: string;
  onAdd: (draft: EventDraft) => void;
  onEdit: (id: string, draft: EventDraft) => void;
  onDelete: (id: string) => void;
}

const kindMeta: Record<
  TimelineEventKind,
  { icon: typeof ArrowDownLeft; chip: string; amountClass: string }
> = {
  income: { icon: ArrowDownLeft, chip: "bg-success/15 text-success", amountClass: "text-success" },
  payday: { icon: CalendarCheck2, chip: "bg-accent/15 text-accent", amountClass: "text-accent" },
  expense: { icon: ArrowUpRight, chip: "bg-danger/15 text-danger", amountClass: "text-danger" },
};

function relativeDay(today: string, date: string): string {
  const days = diffIsoDays(today, date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${-days} days ago`;
  return `In ${days} days`;
}

function shortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Convert a stored event into the draft shape the form edits. */
function toDraft(event: FinancialEvent): EventDraft {
  return {
    description: event.description,
    amount: Math.abs(event.amount),
    date: event.date,
    kind: event.kind,
    confidence: event.confidence,
    category: event.category,
  };
}

export function EventManager({
  events,
  today,
  onAdd,
  onEdit,
  onDelete,
}: EventManagerProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const editingEvent = events.find((e) => e.id === editingId) ?? null;

  function handleAdd(draft: EventDraft) {
    onAdd(draft);
    setAdding(false);
  }

  function handleEdit(draft: EventDraft) {
    if (editingId) onEdit(editingId, draft);
    setEditingId(null);
  }

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Income &amp; expenses</CardTitle>
            <CardDescription>
              Add, edit or remove the payments on your timeline. Everything
              recalculates instantly and is saved in this browser.
            </CardDescription>
          </div>
          {!adding && !editingEvent && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-3.5" />
              Add event
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {adding && (
          <div className="rounded-md border border-border/70 bg-background/40 p-4">
            <EventForm
              defaultDate={today}
              submitLabel="Add event"
              onSubmit={handleAdd}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}

        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No events yet. Add your first income or bill to see your money
            timeline come to life.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {events.map((event) => {
              const meta = kindMeta[event.kind];
              const Icon = meta.icon;
              const isEditing = event.id === editingId;

              if (isEditing) {
                return (
                  <li key={event.id} className="py-3">
                    <EventForm
                      initial={toDraft(event)}
                      defaultDate={today}
                      submitLabel="Save changes"
                      onSubmit={handleEdit}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                );
              }

              return (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        meta.chip,
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground/95">
                        {event.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relativeDay(today, event.date)} ·{" "}
                        {shortDate(event.date)}
                        {event.kind === "expense" &&
                          ` · ${CATEGORY_LABELS[normalizeCategory(event.category)]}`}
                        {event.confidence === "estimated" && " · estimate"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        "mr-2 text-sm font-semibold tabular-nums",
                        meta.amountClass,
                      )}
                    >
                      {event.amount < 0 ? "−" : "+"}
                      {formatCents(Math.abs(event.amount) as Cents)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={`Edit ${event.description}`}
                      onClick={() => {
                        setAdding(false);
                        setEditingId(event.id);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={`Delete ${event.description}`}
                      onClick={() => onDelete(event.id)}
                    >
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {events.length > 0 && !adding && !editingEvent && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {events.filter((e) => e.kind === "expense").length} expenses
            </Badge>
            <Badge variant="outline">
              {events.filter((e) => e.kind === "income").length} income
            </Badge>
            <Badge variant="outline">
              {events.filter((e) => e.kind === "payday").length} payday
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

