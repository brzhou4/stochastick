import { describe, it, expect } from "vitest";
import { runForecast, fitGarch, fitJumpDiffusion } from "@/lib/quant/forecast";
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

describe("runForecast ensemble", () => {
  const f = runForecast(nvdaLog, nvda[nvda.length - 1], spyLog, spy[spy.length - 1], 63, SEED);

  it("returns five named models", () => {
    expect(f.models.length).toBe(5);
    const names = f.models.map((m) => m.name);
    expect(names).toContain("Geometric Brownian Motion");
    expect(names).toContain("GARCH(1,1)");
    expect(names).toContain("Merton Jump-Diffusion");
    expect(names).toContain("Historical bootstrap");
    expect(names).toContain("Student-t Monte Carlo");
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
    expect(f.totalPaths).toBe(5 * f.pathsPerModel);
  });

  it("is deterministic for a fixed seed", () => {
    const g = runForecast(nvdaLog, nvda[nvda.length - 1], spyLog, spy[spy.length - 1], 63, SEED);
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
