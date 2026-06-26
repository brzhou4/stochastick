"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Creating research mission",
  "Fetching market data",
  "Cleaning price series",
  "Computing log returns",
  "Measuring volatility regime",
  "Calculating drawdowns",
  "Estimating alpha and beta versus benchmark",
  "Computing Sharpe, Sortino, Calmar, Treynor, and Information Ratio",
  "Running stochastic simulations",
  "Comparing ticker versus benchmark outcomes",
  "Building evidence for and against the thesis",
  "Writing research memo",
];

interface LogEntry {
  time: string;
  text: string;
}

function now(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface MissionProgressProps {
  ticker: string;
  benchmark: string;
  ready: boolean; // backend result has arrived
  errored: boolean;
  onFinished: () => void;
}

export function MissionProgress({
  ticker,
  benchmark,
  ready,
  errored,
  onFinished,
}: MissionProgressProps) {
  const [current, setCurrent] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  // Advance through the visible steps on a timer; the final step waits for the
  // backend to actually finish before completing.
  useEffect(() => {
    setLog([{ time: now(), text: `Creating mission — ${ticker} vs ${benchmark}` }]);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i < STEPS.length - 1) {
        setCurrent(i);
        setLog((prev) => [...prev, { time: now(), text: STEPS[i] }]);
      } else {
        // Hold on the last step until the backend result is ready.
        if (readyRef.current) {
          setCurrent(STEPS.length);
          setLog((prev) => [...prev, { time: now(), text: "Generating verdict" }]);
          clearInterval(id);
          setTimeout(onFinished, 450);
        }
      }
    }, 520);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the backend finishes after the animation has parked on the last step.
  useEffect(() => {
    if (ready && current >= STEPS.length - 1) {
      setCurrent(STEPS.length);
      setLog((prev) => [...prev, { time: now(), text: "Generating verdict" }]);
      const t = setTimeout(onFinished, 450);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 gap-5 lg:grid-cols-5"
    >
      <div className="glass rounded-lg p-7 lg:col-span-3">
        <div className="mb-6 flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Mission in progress</h2>
            <p className="text-sm text-muted-foreground">
              Autonomous quant worker is stress-testing your thesis.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {STEPS.map((step, idx) => {
            const state =
              idx < current || (errored ? false : current >= STEPS.length)
                ? "done"
                : idx === current
                  ? "active"
                  : "pending";
            const done = idx < current || current >= STEPS.length;
            return (
              <div
                key={step}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  state === "active" && "bg-white/5",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                    done
                      ? "border-emerald-400/50 bg-emerald-400/20 text-emerald-300"
                      : state === "active"
                        ? "border-emerald-400/50 text-emerald-300"
                        : "border-white/15 text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3" />
                  ) : state === "active" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span
                  className={cn(
                    done
                      ? "text-foreground"
                      : state === "active"
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass rounded-lg p-6 lg:col-span-2">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Terminal className="h-4 w-4" />
          Mission log
        </div>
        <div className="tabular space-y-1.5 text-xs">
          {log.map((entry, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-3"
            >
              <span className="text-emerald-400/70">{entry.time}</span>
              <span className="text-muted-foreground">{entry.text}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
