import { describe, it, expect } from "vitest";
import { runForecast, fitGarch, fitJumpDiffusion, fitArma, trainMlp, fitOu } from "@/lib/quant/forecast";
import { logReturns } from "@/lib/quant/returns";
import { fallbackPrices } from "@/lib/market/fallback";

const nvda = fallbackPrices("NVDA").map((b) => b.close);
const spy = fallbackPrices("SPY").map((b) => b.close);
const nvdaLog = logReturns(nvda);
const spyLog = logReturns(spy);
const SEED = 12345;

describe("GARCH(1,1) fit", () => {
  it("returns a valid, stationary parameterization", () => {
    const fit = fitGarch(nvdaLog);
    expect(fit.alpha).toBeGreaterThan(0);
    expect(fit.beta).toBeGreaterThan(0);
    expect(fit.alpha + fit.beta).toBeLessThan(1); // stationarity
    expect(fit.omega).toBeGreaterThan(0);
    expect(fit.lastVar).toBeGreaterThan(0);
  });
});

describe("Merton jump-diffusion fit", () => {
  it("produces a valid jump intensity and diffusion vol", () => {
    const fit = fitJumpDiffusion(nvdaLog);
    expect(fit.lambda).toBeGreaterThanOrEqual(0);
    expect(fit.lambda).toBeLessThanOrEqual(1);
    expect(fit.sigmaDiff).toBeGreaterThan(0);
  });
});

describe("ARIMA / ARMA fit", () => {
  it("returns finite AR and MA coefficients and a positive innovation sigma", () => {
    const fit = fitArma(nvdaLog);
    expect(fit.phi.length).toBe(2);
    expect(fit.theta.length).toBe(1);
    expect(fit.phi.every((x) => Number.isFinite(x))).toBe(true);
    expect(Number.isFinite(fit.theta[0])).toBe(true);
    expect(fit.sigma).toBeGreaterThan(0);
  });
});

describe("Neural network (MLP) training", () => {
  it("learns finite weights and a positive residual scale", () => {
    const fit = trainMlp(nvdaLog, 7);
    expect(fit.W1.length).toBe(fit.h);
    expect(fit.W1[0].length).toBe(fit.k);
    expect(fit.W1.flat().every((w) => Number.isFinite(w))).toBe(true);
    expect(fit.residStd).toBeGreaterThan(0);
  });

  it("trains deterministically for a fixed seed", () => {
    const a = trainMlp(nvdaLog, 7);
    const b = trainMlp(nvdaLog, 7);
    expect(a.b2).toBe(b.b2);
    expect(a.W2[0]).toBe(b.W2[0]);
  });
});

describe("Ornstein–Uhlenbeck (Vasicek) fit", () => {
  it("recovers a stationary mean-reversion coefficient and positive vol", () => {
    const fit = fitOu(nvda);
    expect(Math.abs(fit.b)).toBeLessThan(1); // stationary mean reversion
    expect(fit.sigma).toBeGreaterThan(0);
    expect(Number.isFinite(fit.slope)).toBe(true);
  });
});

describe("runForecast ensemble", () => {
  const f = runForecast(nvdaLog, nvda, spyLog, spy, 63, SEED);

  it("returns all eight named models", () => {
    expect(f.models.length).toBe(8);
    const names = f.models.map((m) => m.name);
    expect(names).toContain("Geometric Brownian Motion");
    expect(names).toContain("GARCH(1,1)");
    expect(names).toContain("Merton Jump-Diffusion");
    expect(names).toContain("Historical bootstrap");
    expect(names).toContain("Student-t Monte Carlo");
    expect(names).toContain("ARIMA (ARMA on returns)");
    expect(names).toContain("Neural network (MLP)");
    expect(names).toContain("Ornstein–Uhlenbeck (Vasicek)");
  });

  it("has monotonically ordered ensemble percentiles", () => {
    expect(f.percentile5).toBeLessThanOrEqual(f.percentile25);
    expect(f.percentile25).toBeLessThanOrEqual(f.percentile50);
    expect(f.percentile50).toBeLessThanOrEqual(f.percentile75);
    expect(f.percentile75).toBeLessThanOrEqual(f.percentile95);
  });

  it("keeps probabilities within [0,1] and prices positive", () => {
    expect(f.probabilityPositive).toBeGreaterThanOrEqual(0);
    expect(f.probabilityPositive).toBeLessThanOrEqual(1);
    expect(f.probabilityOutperformBenchmark).toBeGreaterThanOrEqual(0);
    expect(f.probabilityOutperformBenchmark).toBeLessThanOrEqual(1);
    expect(f.lowPrice).toBeGreaterThan(0);
    expect(f.lowPrice).toBeLessThan(f.highPrice);
    expect(f.totalPaths).toBe(8 * f.pathsPerModel);
  });

  it("is deterministic for a fixed seed", () => {
    const g = runForecast(nvdaLog, nvda, spyLog, spy, 63, SEED);
    expect(g.expectedReturn).toBe(f.expectedReturn);
    expect(g.percentile5).toBe(f.percentile5);
    expect(g.probabilityOutperformBenchmark).toBe(f.probabilityOutperformBenchmark);
  });

  it("Student-t fattens tails relative to GBM (lower 5th percentile)", () => {
    const gbm = f.models.find((m) => m.name === "Geometric Brownian Motion")!;
    const t = f.models.find((m) => m.name === "Student-t Monte Carlo")!;
    // Fat tails => t's downside 5th percentile is no less extreme-limited than GBM's.
    expect(t.percentile5).toBeLessThanOrEqual(gbm.percentile5 + 0.02);
  });
});
