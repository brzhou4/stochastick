"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlertCircle, BarChart3, ShieldCheck } from "lucide-react";
import { AnimatedGradient } from "@/components/ui/animated-gradient-with-svg";
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
      {/* Ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-50">
        <AnimatedGradient colors={["#0d3b2e", "#0b2540", "#1a103d"]} speed={0.05} blur="heavy" />
      </div>
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-emerald-500/5 to-transparent" />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Brand bar */}
        <div className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Stochas<span className="text-emerald-400">tick</span>
            </span>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">
            Autonomous Quant Research Worker
          </span>
        </div>

        {phase === "idle" ? (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Agents for Hire · Workflow &amp; Operations
              </div>
              <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                Stress-test an investment thesis{" "}
                <span className="bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
                  before the market does.
                </span>
              </h1>
              <p className="mt-5 max-w-lg text-pretty text-[15px] leading-relaxed text-muted-foreground">
                Stochastick is an autonomous quant research worker you hire for one job: testing your
                thesis against price behavior, volatility, benchmark-relative performance, tail risk,
                and stochastic forward simulations. You assign the work — it tries to prove your thesis
                wrong and returns an institutional-style research memo in seconds.
              </p>
              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Feature icon={<BarChart3 className="h-4 w-4" />} text="20+ computed quant metrics" />
                <Feature icon={<Activity className="h-4 w-4" />} text="8-model forecast ensemble" />
                <Feature icon={<ShieldCheck className="h-4 w-4" />} text="Transparent support score" />
              </div>

              {/* Hireable-worker value prop — the "Agents for Hire" pitch. */}
              <div className="mt-6 flex flex-wrap items-stretch gap-3">
                <ValueStat label="Replaces" value="~3 hrs of analyst work" />
                <ValueStat label="Human cost / thesis" value="$150–450" />
                <ValueStat label="Stochastick" value="~8 seconds" accent />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Hire it on AgentBox · runs on GMI Cloud · no login, no paid data feed required.
              </p>
            </motion.div>

            <div className="lg:pl-4">
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
              <div className="glass flex items-center justify-between gap-4 rounded-2xl border border-rose-500/30 p-5">
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

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-muted-foreground">
      <span className="text-emerald-300">{icon}</span>
      {text}
    </div>
  );
}

function ValueStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "flex-1 rounded-xl border px-4 py-3 " +
        (accent
          ? "border-emerald-400/30 bg-emerald-400/10"
          : "border-white/10 bg-white/[0.03]")
      }
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={"mt-1 text-sm font-semibold " + (accent ? "text-emerald-300" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}
