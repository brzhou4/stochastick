import { describe, it, expect } from "vitest";
import {
  logReturns,
  simpleReturns,
  cumulativeReturn,
  annualizedReturn,
  standardDeviation,
  mean,
} from "@/lib/quant/returns";
import {
  annualizedVolatility,
  downsideDeviation,
  sharpeRatio,
  sortinoRatio,
  valueAtRisk95,
  expectedShortfall95,
  percentile,
  skewness,
  kurtosis,
} from "@/lib/quant/risk";
import { computeDrawdown, calmarRatio } from "@/lib/quant/drawdown";
import {
  beta,
  correlation,
  alpha,
  trackingError,
  informationRatio,
  treynorRatio,
} from "@/lib/quant/regression";
import {
  estimateGbmParams,
  simulateGbm,
  probabilityOutperform,
  seedFor,
  HORIZON_DAYS,
} from "@/lib/quant/simulations";
import { scoreLabel, computeQuantSupportScore } from "@/lib/quant/scoring";
import { fallbackPrices } from "@/lib/market/fallback";
import type { Metrics, Simulations, VolatilityRegime } from "@/lib/quant/types";

const approx = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

describe("returns", () => {
  it("computes log returns", () => {
    const r = logReturns([100, 110, 121]);
    expect(r.length).toBe(2);
    expect(approx(r[0], Math.log(1.1), 1e-12)).toBe(true);
    expect(approx(r[1], Math.log(1.1), 1e-12)).toBe(true);
  });

  it("computes simple returns", () => {
    const r = simpleReturns([100, 150]);
    expect(approx(r[0], 0.5)).toBe(true);
  });

  it("computes cumulative return", () => {
    expect(approx(cumulativeReturn([100, 200]), 1.0)).toBe(true);
    expect(approx(cumulativeReturn([100, 90]), -0.1, 1e-12)).toBe(true);
  });

  it("annualizes return geometrically", () => {
    // constant daily log return r -> annualized = exp(r*252) - 1
    const prices = [100];
    for (let i = 0; i < 252; i++) prices.push(prices[i] * Math.exp(0.001));
    const ann = annualizedReturn(logReturns(prices));
    expect(approx(ann, Math.exp(0.001 * 252) - 1, 1e-9)).toBe(true);
  });
});

describe("volatility & risk", () => {
  it("annualized volatility scales daily std by sqrt(252)", () => {
    const rets = [0.01, -0.01, 0.02, -0.02, 0.0];
    expect(approx(annualizedVolatility(rets), standardDeviation(rets) * Math.sqrt(252))).toBe(true);
  });

  it("downside deviation ignores upside", () => {
    const allPositive = [0.01, 0.02, 0.03];
    expect(downsideDeviation(allPositive)).toBe(0);
    const withDownside = [-0.02, 0.01, -0.03];
    expect(downsideDeviation(withDownside)).toBeGreaterThan(0);
  });

  it("sharpe ratio is positive when return exceeds risk-free", () => {
    expect(sharpeRatio(0.2, 0.1, 0.045)).toBeGreaterThan(0);
    expect(sharpeRatio(0.0, 0.1, 0.045)).toBeLessThan(0);
    expect(sharpeRatio(0.2, 0, 0.045)).toBe(0);
  });

  it("sortino ratio uses downside deviation", () => {
    expect(sortinoRatio(0.2, 0.1, 0.045)).toBeCloseTo((0.2 - 0.045) / 0.1, 10);
    expect(sortinoRatio(0.2, 0, 0.045)).toBe(0);
  });

  it("percentile interpolates", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it("historical VaR and ES capture the left tail", () => {
    const rets = [-0.1, -0.08, -0.05, -0.02, 0, 0.01, 0.02, 0.03, 0.04, 0.05];
    const v = valueAtRisk95(rets);
    const es = expectedShortfall95(rets);
    expect(v).toBeLessThan(0);
    expect(es).toBeLessThanOrEqual(v);
  });

  it("skewness and kurtosis are ~0 for symmetric-ish data", () => {
    const sym = [-2, -1, 0, 1, 2];
    expect(Math.abs(skewness(sym))).toBeLessThan(1e-9);
    expect(Number.isFinite(kurtosis(sym))).toBe(true);
  });
});

describe("drawdown", () => {
  it("computes max drawdown", () => {
    const dd = computeDrawdown([100, 120, 90, 130]);
    expect(approx(dd.maxDrawdown, 90 / 120 - 1, 1e-12)).toBe(true);
    expect(dd.averageDrawdown).toBeLessThanOrEqual(0);
  });

  it("calmar ratio divides return by abs drawdown", () => {
    expect(approx(calmarRatio(0.25, -0.25), 1.0, 1e-12)).toBe(true);
    expect(calmarRatio(0.25, 0)).toBe(0);
  });
});

describe("benchmark regression", () => {
  const a = [0.01, -0.02, 0.015, -0.005, 0.02, -0.01];
  it("beta and correlation of identical series are 1", () => {
    expect(approx(beta(a, a), 1, 1e-9)).toBe(true);
    expect(approx(correlation(a, a), 1, 1e-9)).toBe(true);
  });

  it("alpha of an asset identical to benchmark is ~0", () => {
    const annR = annualizedReturn(a);
    expect(approx(alpha(annR, annR, 1, 0.045), 0, 1e-9)).toBe(true);
  });

  it("tracking error and information ratio are 0 for identical series", () => {
    expect(trackingError(a, a)).toBe(0);
    expect(informationRatio(0.2, 0.1, 0)).toBe(0);
  });

  it("treynor ratio divides excess return by beta", () => {
    expect(approx(treynorRatio(0.2, 2, 0.0), 0.1, 1e-12)).toBe(true);
    expect(treynorRatio(0.2, 0, 0.045)).toBe(0);
  });
});

describe("GBM simulation", () => {
  const prices = fallbackPrices("NVDA");
  const logRets = logReturns(prices.map((p) => p.close));
  const params = estimateGbmParams(
    prices.map((p) => p.close),
    logRets,
  );

  it("produces the requested number of paths with ordered percentiles", () => {
    const res = simulateGbm(params, HORIZON_DAYS["1 Quarter"], 10000, seedFor("test"));
    expect(res.paths).toBe(10000);
    expect(res.endingReturns.length).toBe(10000);
    expect(res.percentile5).toBeLessThan(res.percentile50);
    expect(res.percentile50).toBeLessThan(res.percentile95);
    expect(res.probabilityPositive).toBeGreaterThanOrEqual(0);
    expect(res.probabilityPositive).toBeLessThanOrEqual(1);
  });

  it("is deterministic for a fixed seed", () => {
    const a = simulateGbm(params, 21, 2000, seedFor("repeat"));
    const b = simulateGbm(params, 21, 2000, seedFor("repeat"));
    expect(a.expectedReturn).toBe(b.expectedReturn);
    expect(a.percentile50).toBe(b.percentile50);
  });

  it("probabilityOutperform stays within [0,1]", () => {
    const p = probabilityOutperform([0.1, -0.1, 0.2], [0.05, 0.0, 0.1]);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
    expect(p).toBeCloseTo(2 / 3, 10);
  });
});

describe("quant support score", () => {
  it("maps score thresholds to labels", () => {
    expect(scoreLabel(90)).toBe("Supported");
    expect(scoreLabel(60)).toBe("Mixed");
    expect(scoreLabel(40)).toBe("Weak");
    expect(scoreLabel(10)).toBe("Contradicted");
  });

  it("score is bounded 0-100 and breakdown sums to score", () => {
    const metrics = {
      sharpeRatio: 1.2,
      sortinoRatio: 1.5,
      alphaVsBenchmark: 0.1,
      informationRatio: 0.6,
      excessReturn: 0.08,
      maxDrawdown: -0.2,
    } as Metrics;
    const simulations = { probabilityOutperformBenchmark: 0.62 } as Simulations;
    const regime = {
      label: "Normal Volatility",
      recentRealizedVolatility: 0.3,
      longRunRealizedVolatility: 0.32,
      explanation: "",
    } as VolatilityRegime;
    const result = computeQuantSupportScore(metrics, simulations, regime);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    const sum = result.breakdown.reduce((a, b) => a + b.contribution, 0);
    expect(Math.abs(sum - result.score)).toBeLessThan(0.2);
  });
});

describe("fallback market data", () => {
  it("returns deterministic ~2y series for supported tickers", () => {
    const a = fallbackPrices("NVDA");
    const b = fallbackPrices("NVDA");
    expect(a.length).toBe(504);
    expect(a[0].close).toBe(b[0].close);
    expect(a[a.length - 1].close).toBe(b[b.length - 1].close);
    for (const bar of a) expect(bar.close).toBeGreaterThan(0);
  });

  it("differs across tickers", () => {
    const nvda = fallbackPrices("NVDA");
    const spy = fallbackPrices("SPY");
    expect(nvda[nvda.length - 1].close).not.toBe(spy[spy.length - 1].close);
  });
});
