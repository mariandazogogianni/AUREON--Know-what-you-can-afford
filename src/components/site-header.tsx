import { Hexagon } from "lucide-react";

export interface SiteHeaderProps {
  /** Optional right-side slot for actions (e.g. a demo badge). */
  action?: React.ReactNode;
}

/** Top navigation bar with the AUREON wordmark and tagline. */
export function SiteHeader({ action }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <a href="#" className="flex items-center gap-2.5 rounded-md">
          <span
            className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-inset ring-primary/20"
            aria-hidden="true"
          >
            <Hexagon className="size-5" strokeWidth={2.25} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold tracking-[0.18em] text-foreground">
              AUREON
            </span>
            <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">
              Know what you can afford.
            </span>
          </span>
        </a>
        <div className="flex items-center gap-3">{action}</div>
      </div>
    </header>
  );
}
