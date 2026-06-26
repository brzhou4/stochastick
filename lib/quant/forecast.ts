// Multi-model forward forecasting engine.
//
// We do NOT predict a single future price — markets are not deterministic. We
// estimate the DISTRIBUTION of forward outcomes using several established models
// from quantitative finance, each capturing a different empirical fact, then
// pool them into an ensemble (a standard way to be robust to any one model being
// wrong). Every path is deterministically seeded for reproducibility.
//
// Models implemented:
//   1. Geometric Brownian Motion — Black–Scholes–Merton (Nobel 1997). Lognormal
//      baseline; assumes constant volatility and normal shocks.
//   2. Student-t Monte Carlo — fat-tailed innovations (W.S. "Student" Gosset).
//      Degrees of freedom calibrated to the sample excess kurtosis, so extreme
//      moves are more likely than under GBM.
//   3. GARCH(1,1) — Engle (Nobel 2003) & Bollerslev. Volatility clusters and
//      mean-reverts; the forecast starts from the CURRENT conditional variance.
//   4. Merton Jump-Diffusion — Robert Merton (Nobel 1997). Adds Poisson jumps
//      to model crashes/gaps that diffusions miss.
//   5. Historical (i.i.d.) bootstrap — Efron. Resamples ACTUAL historical daily
//      returns, making zero distributional assumptions.

import { mean, standardDeviation } from "./returns";
import { percentile } from "./risk";
import { mulberry32 } from "./rng";

const TRADING_DAYS_PER_YEAR = 252;

export interface ModelForecast {
  name: string;
  author: string;
  kind: string;
  description: string;
  expectedReturn: number;
  medianReturn: number;
  percentile5: number;
  percentile95: number;
  probabilityPositive: number;
  expectedPrice: number;
  annualizedVolForecast: number;
}

export interface ForwardForecast {
  horizonDays: number;
  pathsPerModel: number;
  totalPaths: number;
  startPrice: number;
  models: ModelForecast[];
  expectedReturn: number;
  medianReturn: number;
  percentile5: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  percentile95: number;
  probabilityPositive: number;
  probabilityOutperformBenchmark: number;
  expectedPrice: number;
  lowPrice: number;
  highPrice: number;
  modelAgreement: number; // 0-1: how tightly the models agree on direction
  disclaimer: string;
}

// ---- Random variate helpers (deterministic) --------------------------------

function makeRng(seed: number) {
  const u = mulberry32(seed);
  let spare: number | null = null;
  const normal = (): number => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u1 = u();
    const u2 = u();
    if (u1 < 1e-12) u1 = 1e-12;
    const mag = Math.sqrt(-2 * Math.log(u1));
    spare = mag * Math.sin(2 * Math.PI * u2);
    return mag * Math.cos(2 * Math.PI * u2);
  };
  // Marsaglia–Tsang gamma sampler (shape k>0, scale=1).
  const gamma = (k: number): number => {
    if (k < 1) {
      const c = gamma(k + 1);
      return c * Math.pow(u() || 1e-12, 1 / k);
    }
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let x = normal();
      let v = 1 + c * x;
      if (v <= 0) continue;
      v = v * v * v;
      const uu = u();
      if (uu < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(uu) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  // Standardized Student-t with `df` degrees of freedom (unit variance).
  const studentT = (df: number): number => {
    const chi2 = 2 * gamma(df / 2); // chi-square(df)
    const t = normal() / Math.sqrt(chi2 / df);
    return t * Math.sqrt((df - 2) / df); // rescale to unit variance
  };
  return { uniform: u, normal, gamma, studentT };
}

function summarizeReturns(returns: number[]): {
  expectedReturn: number;
  medianReturn: number;
  percentile5: number;
  percentile95: number;
  probabilityPositive: number;
} {
  let pos = 0;
  for (const r of returns) if (r > 0) pos++;
  return {
    expectedReturn: mean(returns),
    medianReturn: percentile(returns, 50),
    percentile5: percentile(returns, 5),
    percentile95: percentile(returns, 95),
    probabilityPositive: pos / returns.length,
  };
}

// ---- Models: each returns an array of terminal SIMPLE returns ---------------

function simulateGbm(logRets: number[], H: number, N: number, seed: number): number[] {
  const m = mean(logRets);
  const s = standardDeviation(logRets);
  const { normal } = makeRng(seed);
  const out = new Array<number>(N);
  for (let p = 0; p < N; p++) {
    let lr = 0;
    for (let d = 0; d < H; d++) lr += m + s * normal();
    out[p] = Math.exp(lr) - 1;
  }
  return out;
}

function simulateStudentT(
  logRets: number[],
  H: number,
  N: number,
  seed: number,
  df: number,
): number[] {
  const m = mean(logRets);
  const s = standardDeviation(logRets);
  const { studentT } = makeRng(seed);
  const out = new Array<number>(N);
  for (let p = 0; p < N; p++) {
    let lr = 0;
    for (let d = 0; d < H; d++) lr += m + s * studentT(df);
    out[p] = Math.exp(lr) - 1;
  }
  return out;
}

interface GarchFit {
  omega: number;
  alpha: number;
  beta: number;
  lastVar: number;
  uncondVar: number;
  mean: number;
}

// Lightweight GARCH(1,1) fit via a coarse grid maximum-likelihood search with
// variance targeting (omega pinned to the unconditional variance).
export function fitGarch(logRets: number[]): GarchFit {
  const m = mean(logRets);
  const eps = logRets.map((x) => x - m);
  const uncondVar = Math.max(1e-10, Math.pow(standardDeviation(logRets), 2));

  const alphas = [0.02, 0.04, 0.06, 0.08, 0.12, 0.16, 0.2];
  const betas = [0.7, 0.78, 0.84, 0.88, 0.92, 0.95, 0.97];
  let best = { alpha: 0.06, beta: 0.9, ll: -Infinity, omega: uncondVar * 0.04 };

  for (const alpha of alphas) {
    for (const beta of betas) {
      if (alpha + beta >= 0.999) continue;
      const omega = uncondVar * (1 - alpha - beta);
      let s2 = uncondVar;
      let ll = 0;
      for (let t = 0; t < eps.length; t++) {
        if (t > 0) s2 = omega + alpha * eps[t - 1] * eps[t - 1] + beta * s2;
        ll += -0.5 * (Math.log(s2) + (eps[t] * eps[t]) / s2);
      }
      if (ll > best.ll) best = { alpha, beta, ll, omega };
    }
  }

  // Roll the fitted recursion to the latest conditional variance (current regime).
  let s2 = uncondVar;
  for (let t = 1; t < eps.length; t++) {
    s2 = best.omega + best.alpha * eps[t - 1] * eps[t - 1] + best.beta * s2;
  }
  return {
    omega: best.omega,
    alpha: best.alpha,
    beta: best.beta,
    lastVar: s2,
    uncondVar,
    mean: m,
  };
}

function simulateGarch(fit: GarchFit, H: number, N: number, seed: number): number[] {
  const { normal } = makeRng(seed);
  const out = new Array<number>(N);
  for (let p = 0; p < N; p++) {
    let s2 = fit.lastVar;
    let lr = 0;
    for (let d = 0; d < H; d++) {
      const eps = Math.sqrt(s2) * normal();
      lr += fit.mean + eps;
      s2 = fit.omega + fit.alpha * eps * eps + fit.beta * s2;
    }
    out[p] = Math.exp(lr) - 1;
  }
  return out;
}

interface JumpFit {
  driftAdj: number;
  sigmaDiff: number;
  lambda: number;
  jumpMean: number;
  jumpStd: number;
}

// Calibrate a Merton jump-diffusion: returns beyond 3 sigma are treated as jumps.
export function fitJumpDiffusion(logRets: number[]): JumpFit {
  const m = mean(logRets);
  const s = standardDeviation(logRets);
  const jumps: number[] = [];
  const diffusion: number[] = [];
  for (const r of logRets) {
    if (Math.abs(r - m) > 3 * s) jumps.push(r);
    else diffusion.push(r);
  }
  const lambda = logRets.length > 0 ? jumps.length / logRets.length : 0;
  const jumpMean = jumps.length > 0 ? mean(jumps) : 0;
  const jumpStd = jumps.length > 1 ? standardDeviation(jumps) : s;
  const sigmaDiff = diffusion.length > 1 ? standardDeviation(diffusion) : s;
  // Compensate drift so the model's mean daily return stays at m.
  const driftAdj = m - lambda * jumpMean;
  return { driftAdj, sigmaDiff, lambda, jumpMean, jumpStd };
}

function simulateJumpDiffusion(fit: JumpFit, H: number, N: number, seed: number): number[] {
  const { normal, uniform } = makeRng(seed);
  const out = new Array<number>(N);
  for (let p = 0; p < N; p++) {
    let lr = 0;
    for (let d = 0; d < H; d++) {
      lr += fit.driftAdj + fit.sigmaDiff * normal();
      if (uniform() < fit.lambda) lr += fit.jumpMean + fit.jumpStd * normal();
    }
    out[p] = Math.exp(lr) - 1;
  }
  return out;
}

function simulateBootstrap(logRets: number[], H: number, N: number, seed: number): number[] {
  const { uniform } = makeRng(seed);
  const n = logRets.length;
  const out = new Array<number>(N);
  for (let p = 0; p < N; p++) {
    let lr = 0;
    for (let d = 0; d < H; d++) {
      lr += logRets[Math.floor(uniform() * n) % n];
    }
    out[p] = Math.exp(lr) - 1;
  }
  return out;
}

function annualizedVol(logRets: number[]): number {
  return standardDeviation(logRets) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// Run every model and return per-model terminal returns plus pooled ensemble.
function runModels(
  logRets: number[],
  startPrice: number,
  H: number,
  N: number,
  seedBase: number,
): { models: ModelForecast[]; pooled: number[]; garchVol: number } {
  const df = (() => {
    // Excess kurtosis k relates to t df by k = 6/(df-4); invert and clamp.
    const k = excessKurtosis(logRets);
    if (k <= 0.1) return 30;
    return Math.min(30, Math.max(5, 6 / k + 4));
  })();
  const garch = fitGarch(logRets);
  const jump = fitJumpDiffusion(logRets);
  const baseVol = annualizedVol(logRets);
  const garchVolForecast = Math.sqrt(garch.lastVar * TRADING_DAYS_PER_YEAR);

  const specs: Array<{ meta: Omit<ModelForecast, keyof ReturnType<typeof summarizeReturns> | "expectedPrice">; returns: number[] }> = [
    {
      meta: {
        name: "Geometric Brownian Motion",
        author: "Black–Scholes–Merton",
        kind: "Lognormal diffusion",
        description: "Lognormal baseline with constant volatility and normal shocks.",
        annualizedVolForecast: baseVol,
      },
      returns: simulateGbm(logRets, H, N, seedBase + 11),
    },
    {
      meta: {
        name: "Student-t Monte Carlo",
        author: "Gosset ('Student')",
        kind: "Fat-tailed diffusion",
        description: `Fat-tailed shocks; degrees of freedom calibrated to sample kurtosis (df≈${df.toFixed(1)}).`,
        annualizedVolForecast: baseVol,
      },
      returns: simulateStudentT(logRets, H, N, seedBase + 23, df),
    },
    {
      meta: {
        name: "GARCH(1,1)",
        author: "Engle & Bollerslev",
        kind: "Stochastic volatility",
        description: `Volatility clusters and mean-reverts; forecast starts from current conditional vol (${(garchVolForecast * 100).toFixed(1)}% annualized).`,
        annualizedVolForecast: garchVolForecast,
      },
      returns: simulateGarch(garch, H, N, seedBase + 37),
    },
    {
      meta: {
        name: "Merton Jump-Diffusion",
        author: "Robert Merton",
        kind: "Jump diffusion",
        description: `Adds Poisson jumps for crashes/gaps (≈${(jump.lambda * 252).toFixed(1)} jumps/yr).`,
        annualizedVolForecast: baseVol,
      },
      returns: simulateJumpDiffusion(jump, H, N, seedBase + 51),
    },
    {
      meta: {
        name: "Historical bootstrap",
        author: "Efron",
        kind: "Non-parametric resampling",
        description: "Resamples actual historical daily returns — no distribution assumed.",
        annualizedVolForecast: baseVol,
      },
      returns: simulateBootstrap(logRets, H, N, seedBase + 67),
    },
  ];

  const pooled: number[] = [];
  const models: ModelForecast[] = specs.map((spec) => {
    for (const r of spec.returns) pooled.push(r);
    const stats = summarizeReturns(spec.returns);
    return {
      ...spec.meta,
      ...stats,
      expectedPrice: startPrice * (1 + stats.expectedReturn),
    };
  });

  return { models, pooled, garchVol: garchVolForecast };
}

function excessKurtosis(values: number[]): number {
  const n = values.length;
  if (n < 4) return 0;
  const m = mean(values);
  const sd = standardDeviation(values);
  if (sd === 0) return 0;
  let acc = 0;
  for (const v of values) acc += Math.pow((v - m) / sd, 4);
  return acc / n - 3;
}

// Public entry point: ensemble forecast for the ticker, plus probability it beats
// the benchmark (benchmark simulated with the identical model suite).
export function runForecast(
  tickerLog: number[],
  tickerStart: number,
  benchLog: number[],
  benchStart: number,
  horizonDays: number,
  seedBase: number,
  pathsPerModel = 4000,
): ForwardForecast {
  const ticker = runModels(tickerLog, tickerStart, horizonDays, pathsPerModel, seedBase);
  const bench = runModels(benchLog, benchStart, horizonDays, pathsPerModel, seedBase + 5000);

  const pooled = ticker.pooled;
  // Probability ticker outperforms benchmark: pair pooled draws index-wise.
  const pairCount = Math.min(pooled.length, bench.pooled.length);
  let wins = 0;
  for (let i = 0; i < pairCount; i++) if (pooled[i] > bench.pooled[i]) wins++;
  const probabilityOutperformBenchmark = pairCount > 0 ? wins / pairCount : 0;

  const stats = summarizeReturns(pooled);
  // Model agreement: share of models whose median return shares the ensemble's sign.
  const ensembleSign = Math.sign(stats.medianReturn) || 1;
  const agree =
    ticker.models.filter((m) => Math.sign(m.medianReturn) === ensembleSign).length /
    ticker.models.length;

  return {
    horizonDays,
    pathsPerModel,
    totalPaths: pooled.length,
    startPrice: tickerStart,
    models: ticker.models,
    expectedReturn: stats.expectedReturn,
    medianReturn: stats.medianReturn,
    percentile5: percentile(pooled, 5),
    percentile25: percentile(pooled, 25),
    percentile50: percentile(pooled, 50),
    percentile75: percentile(pooled, 75),
    percentile95: percentile(pooled, 95),
    probabilityPositive: stats.probabilityPositive,
    probabilityOutperformBenchmark,
    expectedPrice: tickerStart * (1 + stats.expectedReturn),
    lowPrice: tickerStart * (1 + percentile(pooled, 5)),
    highPrice: tickerStart * (1 + percentile(pooled, 95)),
    modelAgreement: agree,
    disclaimer:
      "Forecasts describe a distribution of model-conditioned outcomes, not a prediction of the actual future price. Uncertainty is large and the models can all be wrong together. Not financial advice.",
  };
}
