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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

export function VerdictBadge({ label }: { label: VerdictLabel }) {
  return (
    <Badge className={cn("text-sm px-3 py-1.5 font-semibold", VERDICT_STYLES[label])}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
      </span>
      {label}
    </Badge>
  );
}

export { VERDICT_STYLES };
