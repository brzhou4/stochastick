"use client";

import { motion } from "framer-motion";
import { AnimatedGradient } from "@/components/ui/animated-gradient-with-svg";
import { cn } from "@/lib/utils";

interface BentoCardProps {
  title: string;
  value: string;
  subtitle?: string;
  colors: string[];
  delay?: number;
  className?: string;
  footer?: React.ReactNode;
}

export function BentoCard({
  title,
  value,
  subtitle,
  colors,
  delay = 0,
  className,
  footer,
}: BentoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 p-5",
        className,
      )}
    >
      <AnimatedGradient colors={colors} speed={0.08} blur="medium" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-white/60">
          {title}
        </p>
        <div className="mt-3">
          <p className="tabular text-3xl font-semibold text-white">{value}</p>
          {subtitle ? (
            <p className="mt-1 text-sm text-white/65">{subtitle}</p>
          ) : null}
        </div>
        {footer ? <div className="mt-3 text-xs text-white/60">{footer}</div> : null}
      </div>
    </motion.div>
  );
}
