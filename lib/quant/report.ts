// Deterministic, rule-based report generation: evidence for/against, assumption
// checks, methodology notes, and the verdict summary. Everything here is derived
// from computed metrics first; the LLM (if configured) only re-phrases the memo
// and never changes the numbers or the verdict.

import type {
  Metrics,
  Simulations,
  VolatilityRegime,
  VerdictLabel,
  AssumptionCheck,
  StressTestRequest,
} from "./types";

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function buildEvidence(
  metrics: Metrics,
  simulations: Simulations,
  regime: VolatilityRegime,
): { evidenceFor: string[]; evidenceAgainst: string[] } {
  const evidenceFor: string[] = [];
  const evidenceAgainst: string[] = [];

  // Alpha
  if (metrics.alphaVsBenchmark > 0) {
    evidenceFor.push(
      `Positive annualized alpha of ${pct(metrics.alphaVsBenchmark)} versus the benchmark after adjusting for beta.`,
    );
  } else {
    evidenceAgainst.push(
      `Negative annualized alpha of ${pct(metrics.alphaVsBenchmark)} — historically the asset has not added beta-adjusted value over the benchmark.`,
    );
  }

  // Information ratio
  if (metrics.informationRatio > 0) {
    evidenceFor.push(
      `Positive information ratio of ${metrics.informationRatio.toFixed(2)}, indicating active return earned per unit of tracking error.`,
    );
  } else {
    evidenceAgainst.push(
      `Negative information ratio of ${metrics.informationRatio.toFixed(2)} — active deviations from the benchmark have not been rewarded.`,
    );
  }

  // Sharpe
  if (metrics.sharpeRatio >= 1) {
    evidenceFor.push(
      `Sharpe ratio of ${metrics.sharpeRatio.toFixed(2)} (>= 1.0) reflects a healthy risk-adjusted return profile.`,
    );
  } else if (metrics.sharpeRatio < 0) {
    evidenceAgainst.push(
      `Negative Sharpe ratio of ${metrics.sharpeRatio.toFixed(2)} — risk-adjusted return has trailed the risk-free rate.`,
    );
  }

  // Probability of outperformance
  if (simulations.probabilityOutperformBenchmark > 0.55) {
    evidenceFor.push(
      `Simulated probability of outperforming the benchmark over the horizon is ${pct(simulations.probabilityOutperformBenchmark)} (> 55%).`,
    );
  } else if (simulations.probabilityOutperformBenchmark < 0.45) {
    evidenceAgainst.push(
      `Simulated probability of outperforming the benchmark is only ${pct(simulations.probabilityOutperformBenchmark)} (< 45%).`,
    );
  }

  // Volatility regime
  if (regime.label === "Crisis Volatility" || regime.label === "High Volatility") {
    evidenceAgainst.push(
      `Volatility regime is ${regime.label.toLowerCase()}: recent realized volatility (${pct(regime.recentRealizedVolatility)}) is elevated versus its long-run level (${pct(regime.longRunRealizedVolatility)}).`,
    );
  } else {
    evidenceFor.push(
      `Volatility regime is ${regime.label.toLowerCase()}, not crisis-level: recent realized volatility (${pct(regime.recentRealizedVolatility)}) is contained relative to the long-run level (${pct(regime.longRunRealizedVolatility)}).`,
    );
  }

  // Drawdown vs return
  const annual = metrics.annualizedReturn;
  const dd = Math.abs(metrics.maxDrawdown);
  if (dd > 0.4) {
    evidenceAgainst.push(
      `Maximum drawdown of ${pct(metrics.maxDrawdown)} is severe and could test conviction during stress periods.`,
    );
  } else if (annual > 0 && dd > 0 && annual / dd >= 0.5) {
    evidenceFor.push(
      `Drawdown of ${pct(metrics.maxDrawdown)} is manageable relative to an annualized return of ${pct(annual)} (Calmar ${metrics.calmarRatio.toFixed(2)}).`,
    );
  }

  // Monte Carlo asymmetry: compare upside (p95) vs downside (p5) magnitude.
  const upside = Math.abs(simulations.percentile95 - simulations.percentile50);
  const downside = Math.abs(simulations.percentile50 - simulations.percentile5);
  if (downside > upside * 1.25) {
    evidenceAgainst.push(
      `The simulated return distribution is left-skewed: modeled downside (5th pct ${pct(simulations.percentile5)}) is meaningfully larger than upside (95th pct ${pct(simulations.percentile95)}).`,
    );
  } else if (upside > downside * 1.1) {
    evidenceFor.push(
      `The simulated return distribution is favorably skewed: modeled upside (95th pct ${pct(simulations.percentile95)}) exceeds downside (5th pct ${pct(simulations.percentile5)}).`,
    );
  }

  // Excess return / momentum
  if (metrics.excessReturn > 0) {
    evidenceFor.push(
      `Annualized return of ${pct(metrics.annualizedReturn)} exceeds the benchmark's ${pct(metrics.benchmarkAnnualizedReturn)} (excess ${pct(metrics.excessReturn)}).`,
    );
  } else {
    evidenceAgainst.push(
      `Annualized return of ${pct(metrics.annualizedReturn)} trails the benchmark's ${pct(metrics.benchmarkAnnualizedReturn)} (excess ${pct(metrics.excessReturn)}).`,
    );
  }

  return { evidenceFor, evidenceAgainst };
}

export function buildAssumptionChecks(
  metrics: Metrics,
  regime: VolatilityRegime,
  observationCount: number,
): AssumptionCheck[] {
  const checks: AssumptionCheck[] = [];

  checks.push({
    assumption: "Sufficient price history for stable estimation",
    status: observationCount >= 252 ? "Pass" : observationCount >= 60 ? "Warning" : "Fail",
    explanation:
      observationCount >= 252
        ? `${observationCount} daily observations available — sufficient for stable annualized estimates.`
        : `Only ${observationCount} daily observations available; estimates are noisier than a full year of data.`,
  });

  checks.push({
    assumption: "Returns are approximately normally distributed (GBM premise)",
    status:
      Math.abs(metrics.skewness) < 0.5 && Math.abs(metrics.kurtosis) < 3
        ? "Pass"
        : Math.abs(metrics.kurtosis) >= 6 || Math.abs(metrics.skewness) >= 1
          ? "Fail"
          : "Warning",
    explanation: `Skewness ${metrics.skewness.toFixed(2)}, excess kurtosis ${metrics.kurtosis.toFixed(2)}. Fat tails mean GBM can understate extreme moves.`,
  });

  checks.push({
    assumption: "Beta to benchmark is meaningful (return co-movement exists)",
    status:
      Math.abs(metrics.correlationToBenchmark) >= 0.4
        ? "Pass"
        : Math.abs(metrics.correlationToBenchmark) >= 0.2
          ? "Warning"
          : "Fail",
    explanation: `Correlation to benchmark is ${metrics.correlationToBenchmark.toFixed(2)} (beta ${metrics.betaToBenchmark.toFixed(2)}). Low correlation weakens benchmark-relative inference.`,
  });

  checks.push({
    assumption: "Volatility regime is stable enough to project forward",
    status:
      regime.label === "Normal Volatility" || regime.label === "Low Volatility"
        ? "Pass"
        : regime.label === "High Volatility"
          ? "Warning"
          : "Fail",
    explanation: `Regime is ${regime.label.toLowerCase()}; forward simulations assume the estimated volatility persists.`,
  });

  return checks;
}

export function buildMethodology(req: StressTestRequest, dataPoints: number): string[] {
  return [
    `Pulled up to 2 years of daily adjusted-close prices for ${req.ticker} and ${req.benchmark} (${dataPoints} aligned observations used).`,
    "Computed daily log returns; annualized using 252 trading days. Cumulative return and historical VaR/ES use simple returns.",
    "Risk-adjusted ratios (Sharpe, Sortino, Calmar, Treynor, Information) use a configurable annual risk-free rate.",
    "Beta, correlation, CAPM alpha, tracking error and information ratio computed against the benchmark's aligned return series.",
    "Volatility regime classifies 20-day realized volatility relative to 252-day realized volatility.",
    "Forward distribution simulated with Geometric Brownian Motion (>= 10,000 deterministic-seeded paths) over the selected horizon; the benchmark is simulated identically to estimate outperformance probability.",
    "Quant Support Score is a fixed weighted formula over the metrics above — it is not a model confidence or an opinion.",
    `Risk style "${req.riskStyle}" and horizon "${req.horizon}" frame interpretation only; the math is identical across styles.`,
  ];
}

export function verdictSummary(
  req: StressTestRequest,
  label: VerdictLabel,
  metrics: Metrics,
  simulations: Simulations,
  regime: VolatilityRegime,
  score: number,
): string {
  const directional =
    metrics.excessReturn > 0 && simulations.probabilityOutperformBenchmark > 0.5
      ? "the historical and simulated evidence leans in favor of the thesis"
      : metrics.excessReturn < 0 && simulations.probabilityOutperformBenchmark < 0.5
        ? "the historical and simulated evidence leans against the thesis"
        : "the evidence is genuinely mixed";

  const riskClause =
    regime.label === "Crisis Volatility" || regime.label === "High Volatility"
      ? ` The thesis remains exposed to ${regime.label.toLowerCase()} and left-tail risk (modeled 5th-percentile return of ${pct(simulations.percentile5)}).`
      : ` Tail risk is contained for now, with a modeled 5th-percentile return of ${pct(simulations.percentile5)}.`;

  const strength =
    label === "Supported"
      ? "The risk-adjusted profile is strong enough to treat the directional conclusion as well-grounded, though not certain."
      : label === "Mixed"
        ? "The risk-adjusted profile is not strong enough to treat the conclusion as definitive."
        : label === "Weak"
          ? "The supporting evidence is thin and the conclusion should be treated with caution."
          : "The quantitative evidence largely contradicts the stated thesis.";

  return `On a Quant Support Score of ${score.toFixed(0)}/100 (${label}), ${directional} that ${req.ticker} will perform as described versus ${req.benchmark} over ${req.horizon.toLowerCase()}.${riskClause} ${strength}`;
}
