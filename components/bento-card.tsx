"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Accent = "neutral" | "positive" | "warning" | "negative" | "blue";

interface BentoCardProps {
  title: string;
  value: string;
  subtitle?: string;
  /** Kept for backwards-compat; mapped to a restrained accent rule. */
  colors?: string[];
  accent?: Accent;
  delay?: number;
  className?: string;
  footer?: React.ReactNode;
}

const ACCENT_RULE: Record<Accent, string> = {
  neutral: "bg-white/15",
  positive: "bg-emerald-400/70",
  warning: "bg-amber-400/70",
  negative: "bg-rose-400/70",
  blue: "bg-sky-400/70",
};

// Infer a sober accent from the legacy `colors` prop so callers don't change.
function inferAccent(colors?: string[], explicit?: Accent): Accent {
  if (explicit) return explicit;
  const first = (colors?.[0] ?? "").toLowerCase();
  if (first.includes("f43f5e") || first.includes("e11d48")) return "negative";
  if (first.includes("f59e0b") || first.includes("fbbf24")) return "warning";
  if (first.includes("22d3ee") || first.includes("0ea5e9") || first.includes("6366f1"))
    return "blue";
  if (first.includes("34d399") || first.includes("10b981")) return "positive";
  return "neutral";
}

export function BentoCard({
  title,
  value,
  subtitle,
  colors,
  accent,
  delay = 0,
  className,
  footer,
}: BentoCardProps) {
  const a = inferAccent(colors, accent);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      className={cn(
        "panel relative overflow-hidden rounded-lg p-4",
        className,
      )}
    >
      {/* thin accent rule along the top edge */}
      <div className={cn("absolute inset-x-0 top-0 h-px", ACCENT_RULE[a])} />
      <div className="flex h-full flex-col justify-between gap-3">
        <p className="label">{title}</p>
        <div>
          <p className="tabular text-2xl font-medium text-foreground">{value}</p>
          {subtitle ? (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {footer ? <div className="mt-1 text-xs text-muted-foreground">{footer}</div> : null}
      </div>
    </motion.div>
  );
}
