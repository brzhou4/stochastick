"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Crosshair, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Horizon, RiskStyle, StressTestRequest } from "@/lib/quant/types";

const HORIZONS: Horizon[] = ["1 Week", "1 Month", "1 Quarter", "1 Year"];
const RISK_STYLES: RiskStyle[] = [
  "Momentum",
  "Mean Reversion",
  "Volatility",
  "Event Driven",
  "Long-Term Fundamental",
];

const EXAMPLE_THESIS =
  "NVIDIA will outperform SPY over the next quarter because AI infrastructure demand remains strong.";

const DIRECTION_RE =
  /\b(outperform|underperform|rise|fall|increase|decrease|grow|drop|beat|exceed|go above|go below|go to|reach|hit|climb|decline|surge|crash|rally|gain|lose|soar|plunge|above|below|higher|lower)\b/i;

const RATIONALE_RE =
  /\b(because|since|as |due to|given|driven by|on the back of|following|amid|thanks to|supported by|underpinned by|catalyzed|backed by|in light of|reflecting|stemming from|on strong|on weak|as a result)\b/i;

function thesisHint(thesis: string, ticker: string, horizon: Horizon): string | null {
  const t = thesis.trim();
  if (t.length < 12) return null;
  const hasDirection = DIRECTION_RE.test(t);
  if (!hasDirection) {
    return (
      `No directional claim detected. ` +
      `Try: "${ticker || "TICKER"} will outperform SPY over the next ${horizon.toLowerCase()} ` +
      `because [your reason]."`
    );
  }
  if (RATIONALE_RE.test(t)) return null; // has both direction + rationale — fine
  return (
    `Tip: adding a rationale (e.g. "because...") makes the stress-test more precise ` +
    `and helps the LLM assess whether the catalyst is supported by the data.`
  );
}

interface MissionFormProps {
  onLaunch: (req: StressTestRequest) => void;
  disabled?: boolean;
}

function fieldClass(invalid?: boolean) {
  return cn(
    "w-full rounded-xl bg-black/40 border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30",
    invalid ? "border-rose-500/60" : "border-white/10",
  );
}

export function MissionForm({ onLaunch, disabled }: MissionFormProps) {
  const [ticker, setTicker] = useState("NVDA");
  const [benchmark, setBenchmark] = useState("SPY");
  const [thesis, setThesis] = useState(EXAMPLE_THESIS);
  const [horizon, setHorizon] = useState<Horizon>("1 Quarter");
  const [riskStyle, setRiskStyle] = useState<RiskStyle>("Momentum");
  const [errors, setErrors] = useState<string[]>([]);
  const [thesisTouched, setThesisTouched] = useState(false);

  const hint = thesisTouched ? thesisHint(thesis, ticker, horizon) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: string[] = [];
    if (!ticker.trim()) next.push("Ticker is required.");
    if (!thesis.trim() || thesis.trim().length < 12)
      next.push("Describe your thesis in at least a sentence.");
    if (benchmark.trim().toUpperCase() === ticker.trim().toUpperCase())
      next.push("Ticker and benchmark must differ.");
    setErrors(next);
    if (next.length > 0) return;

    onLaunch({
      ticker: ticker.trim().toUpperCase(),
      benchmark: (benchmark.trim() || "SPY").toUpperCase(),
      thesis: thesis.trim(),
      horizon,
      riskStyle,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="glass relative overflow-hidden rounded-lg p-7 sm:p-9"
    >
      <div className="mb-7 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
          <Crosshair className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">New Research Mission</h2>
          <p className="text-sm text-muted-foreground">
            Assign the work. The quant worker stress-tests your thesis.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Ticker
            </label>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="NVDA"
              maxLength={8}
              className={cn(fieldClass(), "tabular uppercase")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Benchmark
            </label>
            <input
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value.toUpperCase())}
              placeholder="SPY"
              maxLength={8}
              className={cn(fieldClass(), "tabular uppercase")}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Investment Thesis
          </label>
          <textarea
            value={thesis}
            onChange={(e) => { setThesis(e.target.value); setThesisTouched(true); }}
            onBlur={() => setThesisTouched(true)}
            rows={3}
            placeholder={EXAMPLE_THESIS}
            className={cn(fieldClass(), "resize-none leading-relaxed")}
          />
          {hint ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-xs text-amber-200/90">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              {hint}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Horizon
            </label>
            <div className="grid grid-cols-2 gap-2">
              {HORIZONS.map((h) => (
                <button
                  type="button"
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm transition-all",
                    horizon === h
                      ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 bg-black/30 text-muted-foreground hover:border-white/20",
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Risk Style
            </label>
            <select
              value={riskStyle}
              onChange={(e) => setRiskStyle(e.target.value as RiskStyle)}
              className={cn(fieldClass(), "h-[calc(100%-0px)] cursor-pointer appearance-none")}
            >
              {RISK_STYLES.map((r) => (
                <option key={r} value={r} className="bg-[#0f1115]">
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errors.length > 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <ul className="space-y-0.5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button type="submit" size="lg" disabled={disabled} className="w-full">
          Begin Stress Test
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </motion.div>
  );
}
