// Request validation for the stress-test mission. Returns a typed request or a
// list of user-facing field errors.

import type { StressTestRequest, Horizon, RiskStyle } from "./types";

const HORIZONS: Horizon[] = ["1 Week", "1 Month", "1 Quarter", "1 Year"];
const RISK_STYLES: RiskStyle[] = [
  "Momentum",
  "Mean Reversion",
  "Volatility",
  "Event Driven",
  "Long-Term Fundamental",
];

const TICKER_RE = /^[A-Za-z.\-]{1,8}$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value?: StressTestRequest;
}

export function validateRequest(body: unknown): ValidationResult {
  const errors: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;

  const ticker = typeof b.ticker === "string" ? b.ticker.trim().toUpperCase() : "";
  const benchmark =
    typeof b.benchmark === "string" && b.benchmark.trim()
      ? b.benchmark.trim().toUpperCase()
      : "SPY";
  const thesis = typeof b.thesis === "string" ? b.thesis.trim() : "";
  const horizon = b.horizon as Horizon;
  const riskStyle = b.riskStyle as RiskStyle;

  if (!ticker) {
    errors.push("Ticker is required.");
  } else if (!TICKER_RE.test(ticker)) {
    errors.push("Ticker must be 1-8 letters (e.g. NVDA).");
  }

  if (!TICKER_RE.test(benchmark)) {
    errors.push("Benchmark must be a valid symbol (e.g. SPY).");
  }

  if (!thesis) {
    errors.push("Thesis is required.");
  } else if (thesis.length < 12) {
    errors.push("Thesis should be at least a sentence describing your view.");
  } else if (thesis.length > 2000) {
    errors.push("Thesis is too long (max 2000 characters).");
  }

  if (!HORIZONS.includes(horizon)) {
    errors.push(`Horizon must be one of: ${HORIZONS.join(", ")}.`);
  }

  if (!RISK_STYLES.includes(riskStyle)) {
    errors.push(`Risk style must be one of: ${RISK_STYLES.join(", ")}.`);
  }

  if (ticker && benchmark && ticker === benchmark) {
    errors.push("Ticker and benchmark must be different symbols.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    value: { ticker, benchmark, thesis, horizon, riskStyle },
  };
}
