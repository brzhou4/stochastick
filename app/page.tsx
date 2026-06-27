"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Sigma } from "lucide-react";
import { MissionForm } from "@/components/mission-form";
import { MissionProgress } from "@/components/mission-progress";
import { Report } from "@/components/report";
import { Button } from "@/components/ui/button";
import type { StressTestRequest, StressTestResponse } from "@/lib/quant/types";

type Phase = "idle" | "running" | "report";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [request, setRequest] = useState<StressTestRequest | null>(null);
  const [result, setResult] = useState<StressTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  async function launch(req: StressTestRequest) {
    setRequest(req);
    setResult(null);
    setError(null);
    setErrored(false);
    setPhase("running");

    try {
      const res = await fetch("/api/stress-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const json = await res.json();
      if (!res.ok) {
        const detail =
          Array.isArray(json?.details) && json.details.length
            ? json.details.join(" ")
            : json?.error || "The research worker could not complete this mission.";
        setError(detail);
        setErrored(true);
        return;
      }
      setResult(json as StressTestResponse);
    } catch {
      setError("Could not reach the research worker. Please try again.");
      setErrored(true);
    }
  }

  function reset() {
    setPhase("idle");
    setResult(null);
    setRequest(null);
    setError(null);
    setErrored(false);
  }

  return (
    <main className="bg-grid relative min-h-screen">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Brand bar */}
        <div className="mb-14 flex items-center justify-between border-b pb-5">
          <div className="flex items-center gap-2.5">
            <div className="panel-2 flex h-8 w-8 items-center justify-center rounded-md text-emerald-400">
              <Sigma className="h-4 w-4" />
            </div>
            <span className="font-display text-[15px] font-semibold">
              Stochas<span className="text-emerald-400">tick</span>
            </span>
          </div>
          <span className="label hidden sm:block">Autonomous Quant Research Worker</span>
        </div>

        {phase === "idle" ? (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="space-y-4"
            >
              {/* Brief */}
              <div className="panel rounded-lg p-6">
                <p className="label mb-3">What it does</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Enter a ticker and an investment thesis. Stochastick fetches up to 2 years of
                  live price data, computes 20+ quant metrics, runs stochastic simulations, and
                  returns a scored verdict — <span className="text-foreground/80">Supported</span>,{" "}
                  <span className="text-foreground/80">Mixed</span>,{" "}
                  <span className="text-foreground/80">Weak</span>, or{" "}
                  <span className="text-foreground/80">Contradicted</span> — in roughly 8 seconds.
                </p>
              </div>

              {/* Methodology spec sheet */}
              <div className="panel rounded-lg p-6">
                <p className="label mb-4">Methodology</p>
                <div className="space-y-2.5">
                  <SpecRow label="Data" value="Daily adj. close · 4 live sources · 2y lookback" />
                  <SpecRow label="Returns" value="Log returns · 252-day annualized" />
                  <SpecRow
                    label="Risk metrics"
                    value="Sharpe · Sortino · Calmar · Treynor · IR · VaR95 · ES95 · β · α"
                  />
                  <SpecRow label="Regime" value="20-day vs 252-day realized vol ratio" />
                  <SpecRow label="Simulation" value="GBM · 10,000 deterministic-seeded paths" />
                  <SpecRow
                    label="Forecast"
                    value="8-model ensemble: GBM · Student-t · GARCH(1,1) · Jump-Diffusion · Bootstrap · ARIMA(2,1) · MLP · OU SDE"
                  />
                  <SpecRow label="Verdict" value="Weighted quant support score (0–100) · thesis-oriented" />
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <StatChip label="Quant metrics" value="20+" />
                <StatChip label="Forecast models" value="8" />
                <StatChip label="Est. runtime" value="~8 s" />
              </div>
            </motion.div>

            <div>
              <MissionForm onLaunch={launch} />
            </div>
          </div>
        ) : null}

        {phase === "running" && request ? (
          <div className="space-y-6">
            <MissionProgress
              ticker={request.ticker}
              benchmark={request.benchmark}
              ready={result !== null}
              errored={errored}
              onFinished={() => setPhase("report")}
            />
            {error ? (
              <div className="panel flex items-center justify-between gap-4 rounded-lg border-rose-500/30 p-5">
                <div className="flex items-start gap-3 text-sm text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
                <Button variant="secondary" size="sm" onClick={reset}>
                  Back to mission
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {phase === "report" && result ? <Report data={result} onReset={reset} /> : null}
      </div>
    </main>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="tabular text-foreground/75">{value}</span>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-lg px-4 py-3 text-center">
      <p className="tabular text-xl font-semibold text-emerald-400">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
