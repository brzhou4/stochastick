// Transparent, formula-based Quant Support Score (0-100).
//
// This is NOT an AI confidence number. Every point is traceable to a weighted,
// clamped mapping of a computed metric. Each factor returns a 0-1 sub-score; its
// contribution is sub-score * weight, and the total of all contributions is the
// score. Weights sum to 100.

import type { Metrics, Simulations, VolatilityRegime, ScoreFactor } from "./types";

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// Linear map of x in [lo, hi] -> [0, 1], clamped.
function ramp(x: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp01((x - lo) / (hi - lo));
}

interface FactorDef {
  factor: string;
  weight: number;
  support: (m: Metrics, s: Simulations, v: VolatilityRegime) => number;
  explain: (m: Metrics, s: Simulations, v: VolatilityRegime) => string;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

const FACTORS: FactorDef[] = [
  {
    factor: "Sharpe ratio support",
    weight: 15,
    support: (m) => ramp(m.sharpeRatio, -1, 2),
    explain: (m) =>
      `Sharpe ratio of ${m.sharpeRatio.toFixed(2)} (mapped across -1 to 2).`,
  },
  {
    factor: "Sortino ratio support",
    weight: 10,
    support: (m) => ramp(m.sortinoRatio, -1, 3),
    explain: (m) =>
      `Sortino ratio of ${m.sortinoRatio.toFixed(2)} rewards downside-adjusted return.`,
  },
  {
    factor: "Alpha vs benchmark",
    weight: 20,
    support: (m) => ramp(m.alphaVsBenchmark, -0.2, 0.2),
    explain: (m) =>
      `Annualized CAPM alpha of ${pct(m.alphaVsBenchmark)} versus the benchmark.`,
  },
  {
    factor: "Information ratio",
    weight: 15,
    support: (m) => ramp(m.informationRatio, -0.5, 1.0),
    explain: (m) =>
      `Information ratio of ${m.informationRatio.toFixed(2)} on active return per unit of tracking error.`,
  },
  {
    factor: "Probability of outperforming benchmark",
    weight: 20,
    support: (_m, s) => clamp01(s.probabilityOutperformBenchmark),
    explain: (_m, s) =>
      `Simulations put outperformance probability at ${pct(s.probabilityOutperformBenchmark)}.`,
  },
  {
    factor: "Max drawdown penalty",
    weight: 10,
    // Drawdown of 0 -> full support; -50% or worse -> zero support.
    support: (m) => clamp01(1 - Math.abs(m.maxDrawdown) / 0.5),
    explain: (m) =>
      `Maximum drawdown of ${pct(m.maxDrawdown)} penalizes capital-at-risk.`,
  },
  {
    factor: "Volatility regime penalty",
    weight: 5,
    support: (_m, _s, v) => {
      const ratio =
        v.longRunRealizedVolatility > 0
          ? v.recentRealizedVolatility / v.longRunRealizedVolatility
          : 1;
      // ratio <= 1 -> full support; ratio >= 2 (crisis) -> zero support.
      return clamp01(2 - ratio);
    },
    explain: (_m, _s, v) =>
      `Current regime is ${v.label.toLowerCase()} (recent vs long-run realized volatility).`,
  },
  {
    factor: "Momentum / excess return support",
    weight: 5,
    support: (m) => ramp(m.excessReturn, -0.2, 0.2),
    explain: (m) =>
      `Annualized excess return of ${pct(m.excessReturn)} over the benchmark.`,
  },
];

export function scoreLabel(score: number): string {
  if (score >= 75) return "Supported";
  if (score >= 50) return "Mixed";
  if (score >= 30) return "Weak";
  return "Contradicted";
}

export function computeQuantSupportScore(
  metrics: Metrics,
  simulations: Simulations,
  regime: VolatilityRegime,
): { score: number; label: string; breakdown: ScoreFactor[] } {
  const breakdown: ScoreFactor[] = FACTORS.map((f) => {
    const support = clamp01(f.support(metrics, simulations, regime));
    const contribution = support * f.weight;
    return {
      factor: f.factor,
      weight: f.weight,
      contribution: Number(contribution.toFixed(2)),
      explanation: f.explain(metrics, simulations, regime),
    };
  });

  const score = Number(
    breakdown.reduce((acc, b) => acc + b.contribution, 0).toFixed(1),
  );

  return { score, label: scoreLabel(score), breakdown };
}

// The verdict label uses the same thresholds as the score label.
export function verdictFromScore(score: number): "Supported" | "Mixed" | "Weak" | "Contradicted" {
  if (score >= 75) return "Supported";
  if (score >= 50) return "Mixed";
  if (score >= 30) return "Weak";
  return "Contradicted";
}
