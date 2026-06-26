import * as React from "react";
import { cn } from "@/lib/utils";
import type { VerdictLabel } from "@/lib/quant/types";

const VERDICT_STYLES: Record<VerdictLabel, string> = {
  Supported: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
  Mixed: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  Weak: "bg-orange-400/15 text-orange-300 border-orange-400/30",
  Contradicted: "bg-rose-400/15 text-rose-300 border-rose-400/30",
};

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

export function VerdictBadge({ label }: { label: VerdictLabel }) {
  return (
    <Badge className={cn("rounded-md px-2.5 py-1 text-sm font-medium", VERDICT_STYLES[label])}>
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}

export { VERDICT_STYLES };
