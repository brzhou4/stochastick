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
  ThesisAnalysis,
  ThesisDirection,
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

// Deterministic thesis analysis: decompose the implied thesis into testable,
// price-based claims and assess each from the metrics. Used as the fallback when
// no LLM is configured (and as the schema the LLM is asked to fill).
export function buildThesisAnalysis(
  req: StressTestRequest,
  metrics: Metrics,
  simulations: Simulations,
  regime: VolatilityRegime,
  direction: ThesisDirection,
  verdictSummaryText: string,
): ThesisAnalysis {
  const claims: ThesisAnalysis["claims"] = [];

  if (direction.extremeClaim) {
    // The thesis claims a near-total loss / "goes to zero".
    claims.push({
      claim: `${req.ticker} suffers a near-total loss over ${req.horizon.toLowerCase()}.`,
      assessment: "Unsupported",
      rationale: `The model assigns a vanishingly small probability to a 95%+ loss; even the simulated tail (1st-percentile) ending price is ${pct(simulations.percentile1)} return, nowhere near zero.`,
    });
  } else if (direction.stance === "bearish") {
    // The thesis is that the stock falls / underperforms.
    const stockIsWeak =
      metrics.excessReturn < 0 && simulations.probabilityOutperformBenchmark < 0.5;
    claims.push({
      claim: `${req.ticker} declines or underperforms ${req.benchmark} over ${req.horizon.toLowerCase()} (as the thesis claims).`,
      assessment: stockIsWeak
        ? "Supported"
        : metrics.excessReturn > 0 && simulations.probabilityOutperformBenchmark > 0.5
          ? "Unsupported"
          : "Inconclusive",
      rationale: `Annualized excess return ${pct(metrics.excessReturn)} vs benchmark; simulated outperformance probability ${pct(simulations.probabilityOutperformBenchmark)} (a bearish thesis needs these to be weak).`,
    });
  } else {
    const outperforms =
      metrics.excessReturn > 0 && simulations.probabilityOutperformBenchmark > 0.5;
    claims.push({
      claim: `${req.ticker} outperforms ${req.benchmark} over ${req.horizon.toLowerCase()}.`,
      assessment: outperforms
        ? "Supported"
        : metrics.excessReturn < 0 && simulations.probabilityOutperformBenchmark < 0.5
          ? "Unsupported"
          : "Inconclusive",
      rationale: `Annualized excess return ${pct(metrics.excessReturn)} vs benchmark; simulated outperformance probability ${pct(simulations.probabilityOutperformBenchmark)}.`,
    });
  }

  // Direction-agnostic facts about the stock's risk profile.
  claims.push({
    claim: "The stock's returns adequately compensate for the risk taken.",
    assessment:
      metrics.sharpeRatio >= 1
        ? "Supported"
        : metrics.sharpeRatio < 0
          ? "Unsupported"
          : "Inconclusive",
    rationale: `Sharpe ${metrics.sharpeRatio.toFixed(2)}, Sortino ${metrics.sortinoRatio.toFixed(2)}, alpha ${pct(metrics.alphaVsBenchmark)}.`,
  });

  claims.push({
    claim: "Downside and tail risk are contained over the horizon.",
    assessment:
      Math.abs(metrics.maxDrawdown) < 0.3 &&
      regime.label !== "Crisis Volatility" &&
      regime.label !== "High Volatility"
        ? "Supported"
        : Math.abs(metrics.maxDrawdown) > 0.45 || regime.label === "Crisis Volatility"
          ? "Unsupported"
          : "Inconclusive",
    rationale: `Max drawdown ${pct(metrics.maxDrawdown)}, ${regime.label.toLowerCase()}, 95% VaR ${pct(metrics.valueAtRisk95)}.`,
  });

  return {
    claims,
    verdictRationale: verdictSummaryText,
    source: "deterministic",
  };
}

export function verdictSummary(
  req: StressTestRequest,
  label: VerdictLabel,
  metrics: Metrics,
  simulations: Simulations,
  regime: VolatilityRegime,
  direction: ThesisDirection,
): string {
  const stanceClause =
    direction.extremeClaim
      ? `The thesis implies a near-total loss in ${req.ticker}, an outcome the models assign essentially no probability over ${req.horizon.toLowerCase()}.`
      : direction.stance === "bearish"
        ? `Read as a bearish thesis (${req.ticker} declines or underperforms ${req.benchmark}), it requires weak quantitative evidence.`
        : direction.stance === "neutral"
          ? `Read as a relative-performance thesis (${req.ticker} versus ${req.benchmark}), the directional read is:`
          : `As a bullish thesis (${req.ticker} outperforms ${req.benchmark}), the directional read is:`;

  const bullishEvidence =
    metrics.excessReturn > 0 && simulations.probabilityOutperformBenchmark > 0.5
      ? "the historical and simulated evidence is bullish on the stock"
      : metrics.excessReturn < 0 && simulations.probabilityOutperformBenchmark < 0.5
        ? "the historical and simulated evidence is bearish on the stock"
        : "the stock's evidence is genuinely mixed";

  const riskClause =
    regime.label === "Crisis Volatility" || regime.label === "High Volatility"
      ? ` Tail risk is elevated (${regime.label.toLowerCase()}; modeled 5th-percentile return ${pct(simulations.percentile5)}).`
      : ` Tail risk is contained for now (modeled 5th-percentile return ${pct(simulations.percentile5)}).`;

  const strength =
    label === "Supported"
      ? "The evidence is strong enough to treat the thesis as well-grounded, though not certain."
      : label === "Mixed"
        ? "The evidence is not strong enough to treat the thesis as definitive."
        : label === "Weak"
          ? "The supporting evidence for the thesis is thin and it should be treated with caution."
          : "The quantitative evidence largely contradicts the thesis as stated.";

  return `On a thesis-support score of ${direction.thesisScore.toFixed(0)}/100 (${label}), ${stanceClause} ${bullishEvidence}.${riskClause} ${strength}`;
}
