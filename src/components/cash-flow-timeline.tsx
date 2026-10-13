"use client";

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck2,
  CalendarClock,
  PiggyBank,
  TrendingDown,
} from "lucide-react";

import { formatCents } from "@/lib/money";
import {
  diffIsoDays,
  isIsoDate,
  type CashFlowProjection,
  type TimelineEventKind,
} from "@/lib/timeline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CashFlowTimelineProps {
  projection: CashFlowProjection;
  /** ISO date used as "today" for relative day labels. */
  today: string;
}

function relativeDay(today: string, date: string): string {
  if (!isIsoDate(date)) return date;
  const days = diffIsoDays(today, date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${-days} days ago`;
  return `In ${days} days`;
}

/** Short, human date, e.g. "24 Oct". */
function shortDate(date: string): string {
  if (!isIsoDate(date)) return date;
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const kindMeta: Record<
  TimelineEventKind,
  { icon: typeof ArrowDownLeft; chip: string; amountClass: string }
> = {
  income: {
    icon: ArrowDownLeft,
    chip: "bg-success/15 text-success",
    amountClass: "text-success",
  },
  payday: {
    icon: CalendarCheck2,
    chip: "bg-accent/15 text-accent",
    amountClass: "text-accent",
  },
  expense: {
    icon: ArrowUpRight,
    chip: "bg-danger/15 text-danger",
    amountClass: "text-danger",
  },
};

/** Section D — the Money Timeline: a transparent, chronological forecast. */
export function CashFlowTimeline({ projection, today }: CashFlowTimelineProps) {
  const { entries, nextPaydayDate, lowestBeforePayday, hasReserve, reserve } =
    projection;
  const lowIsCritical = lowestBeforePayday.balance < 0;
  const lowIsBelowReserve = hasReserve && lowestBeforePayday.balance < reserve;

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <CardTitle>Money timeline</CardTitle>
        <CardDescription>
          Every known payment in order, with your projected balance after each
          one — so you can see whether your money lasts until payday.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SummaryStrip
          nextPaydayDate={nextPaydayDate}
          today={today}
          lowest={lowestBeforePayday}
          hasReserve={hasReserve}
          reserve={reserve}
          lowIsCritical={lowIsCritical}
          lowIsBelowReserve={lowIsBelowReserve}
        />

        {entries.length === 0 ? (
          <EmptyTimeline />
        ) : (
          <ol
            className="relative space-y-1"
            aria-label="Upcoming payments in chronological order"
          >
            {entries.map((entry, index) => {
              const meta = kindMeta[entry.event.kind];
              const Icon = meta.icon;
              const isLast = index === entries.length - 1;

              return (
                <li
                  key={entry.event.id}
                  className={cn(
                    "relative flex gap-4 rounded-md pb-4 pl-1 last:pb-0",
                    entry.isBelowZero && "bg-danger/5",
                    !entry.isBelowZero && entry.isBelowReserve && "bg-warning/5",
                  )}
                >
                  {/* Connecting rail */}
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[15px] top-8 h-full w-px bg-border"
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-background",
                      meta.chip,
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-0.5">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium text-foreground/95">
                        {entry.event.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relativeDay(today, entry.event.date)}
                        {" · "}
                        {shortDate(entry.event.date)}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {entry.event.confidence === "estimated" && (
                          <Badge
                            variant="outline"
                            className="gap-1 text-[10px] font-medium text-warning"
                          >
                            <span
                              className="size-1 rounded-full bg-warning"
                              aria-hidden="true"
                            />
                            Estimate
                          </Badge>
                        )}
                        {entry.isBelowZero && (
                          <Badge
                            variant="danger"
                            className="gap-1 text-[10px] font-medium"
                          >
                            <AlertTriangle className="size-3" aria-hidden="true" />
                            Below zero
                          </Badge>
                        )}
                        {!entry.isBelowZero && entry.isBelowReserve && (
                          <Badge
                            variant="warning"
                            className="gap-1 text-[10px] font-medium"
                          >
                            <PiggyBank className="size-3" aria-hidden="true" />
                            Into your reserve
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 space-y-0.5 text-right">
                      <span
                        className={cn(
                          "block text-sm font-semibold tabular-nums",
                          meta.amountClass,
                        )}
                      >
                        {entry.event.amount < 0 ? "−" : "+"}
                        {formatCents(Math.abs(entry.event.amount))}
                      </span>
                      <span
                        className={cn(
                          "block text-xs tabular-nums",
                          entry.isBelowZero
                            ? "font-medium text-danger"
                            : entry.isBelowReserve
                              ? "font-medium text-warning"
                              : "text-muted-foreground",
                        )}
                      >
                        {formatCents(entry.runningBalance)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <AssumptionsNotice projection={projection} />
      </CardContent>
    </Card>
  );

interface SummaryStripProps {
  nextPaydayDate: string | null;
  today: string;
  lowest: { balance: number; date: string };
  hasReserve: boolean;
  reserve: number;
  lowIsCritical: boolean;
  lowIsBelowReserve: boolean;
}

function SummaryStrip({
  nextPaydayDate,
  today,
  lowest,
  hasReserve,
  reserve,
  lowIsCritical,
  lowIsBelowReserve,
}: SummaryStripProps) {
  const tiles = [
    {
      id: "payday",
      icon: CalendarClock,
      label: "Next payday",
      value: nextPaydayDate ? shortDate(nextPaydayDate) : "Not scheduled",
      caption: nextPaydayDate
        ? relativeDay(today, nextPaydayDate)
        : "Add a payday event to bound the forecast",
      tone: "text-accent",
      iconWrap: "bg-accent/15 text-accent",
    },
    {
      id: "lowest",
      icon: TrendingDown,
      label: "Lowest balance before payday",
      value: formatCents(lowest.balance),
      caption: lowest.date
        ? `Around ${shortDate(lowest.date)}`
        : "No payments scheduled",
      tone: lowIsCritical
        ? "text-danger"
        : lowIsBelowReserve
          ? "text-warning"
          : "text-foreground",
      iconWrap: lowIsCritical
        ? "bg-danger/15 text-danger"
        : lowIsBelowReserve
          ? "bg-warning/15 text-warning"
          : "bg-success/15 text-success",
    },
    {
      id: "reserve",
      icon: PiggyBank,
      label: "Emergency reserve",
      value: hasReserve ? formatCents(reserve) : "Not set",
      caption: !hasReserve
        ? "No reserve configured — nothing protected yet"
        : lowIsCritical || lowIsBelowReserve
          ? "Your balance dips into this before payday"
          : "Stays untouched until payday",
      tone: !hasReserve
        ? "text-muted-foreground"
        : lowIsCritical || lowIsBelowReserve
          ? "text-warning"
          : "text-foreground",
      iconWrap: !hasReserve
        ? "bg-secondary text-foreground/60"
        : lowIsCritical || lowIsBelowReserve
          ? "bg-warning/15 text-warning"
          : "bg-success/15 text-success",
    },
  ];

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.id}
            className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-3.5"
          >
            <span
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md",
                tile.iconWrap,
              )}
              aria-hidden="true"
            >
              <Icon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </dt>
              <dd
                className={cn(
                  "mt-0.5 truncate text-lg font-semibold tabular-nums",
                  tile.tone,
                )}
              >
                {tile.value}
              </dd>
              <p className="mt-0.5 text-xs text-muted-foreground">{tile.caption}</p>
            </div>
          </div>
        );
      })}
    </dl>
  );
}

function AssumptionsNotice({ projection }: { projection: CashFlowProjection }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border/60 bg-background/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        This forecast only includes the payments listed above, and it is only as
        accurate as the data behind it — a missing bill, a changed amount or
        late income will throw the real balance off.{" "}
        {!projection.hasReserve &&
          "No emergency reserve is configured, so reserve warnings are switched off. "}
        {projection.usesEstimates &&
          "Amounts marked “Estimate” may still change. "}
        Treat this as a planning aid, not a guarantee.
      </p>
    </div>
  );
}

function EmptyTimeline() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-10 text-center">
      <CalendarClock className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground/90">
        No payments scheduled
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Once income and bills are added, your projected balance will appear here
        in chronological order.
      </p>
    </div>
  );
}

}
