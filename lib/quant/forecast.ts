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

// ---- Linear algebra (small, dense) -----------------------------------------

// Gaussian elimination with partial pivoting. Solves A x = b.
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    if (Math.abs(d) < 1e-12) continue;
    for (let j = col; j <= n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r !== col) {
        const f = M[r][col];
        for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
      }
    }
  }
  return M.map((row) => row[n]);
}

// Ridge-regularized ordinary least squares: returns coefficients for X (n×k) ~ y.
function ols(X: number[][], y: number[]): number[] {
  const k = X[0].length;
  const n = X.length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    for (let a = 0; a < k; a++) {
      Xty[a] += xi[a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += xi[a] * xi[b];
    }
  }
  for (let a = 0; a < k; a++) XtX[a][a] += 1e-6; // ridge for numerical stability
  return solveLinear(XtX, Xty);
}

// ---- ARIMA (Box–Jenkins), modelled as ARMA(p,q) on log returns -------------

interface ArmaFit {
  c: number;
  phi: number[];
  theta: number[];
  sigma: number;
  initR: number[];
  initE: number[];
}

// Two-stage Hannan–Rissanen: (1) a long AR to estimate innovations, then
// (2) regress returns on their own lags AND the lagged innovations.
export function fitArma(r: number[], p = 2, q = 1): ArmaFit {
  const n = r.length;
  const L = Math.min(15, Math.max(5, Math.floor(n / 5)));

  // Stage 1: AR(L) to recover residuals (innovation proxies).
  const X1: number[][] = [];
  const y1: number[] = [];
  for (let t = L; t < n; t++) {
    const row = [1];
    for (let i = 1; i <= L; i++) row.push(r[t - i]);
    X1.push(row);
    y1.push(r[t]);
  }
  const c1 = ols(X1, y1);
  const e = new Array(n).fill(0);
  for (let t = L; t < n; t++) {
    let pred = c1[0];
    for (let i = 1; i <= L; i++) pred += c1[i] * r[t - i];
    e[t] = r[t] - pred;
  }

  // Stage 2: ARMA regression on r lags + e lags.
  const start = L + Math.max(p, q);
  const X2: number[][] = [];
  const y2: number[] = [];
  for (let t = start; t < n; t++) {
    const row = [1];
    for (let i = 1; i <= p; i++) row.push(r[t - i]);
    for (let j = 1; j <= q; j++) row.push(e[t - j]);
    X2.push(row);
    y2.push(r[t]);
  }
  const c2 = ols(X2, y2);
  const c = c2[0];
  const phi = c2.slice(1, 1 + p);
  const theta = c2.slice(1 + p, 1 + p + q);

  const res: number[] = [];
  for (let t = start; t < n; t++) {
    let pred = c;
    for (let i = 1; i <= p; i++) pred += phi[i - 1] * r[t - i];
    for (let j = 1; j <= q; j++) pred += theta[j - 1] * e[t - j];
    res.push(r[t] - pred);
  }
  const sigma = standardDeviation(res) || standardDeviation(r);

  return { c, phi, theta, sigma, initR: r.slice(n - p), initE: e.slice(n - q) };
}

function simulateArma(fit: ArmaFit, H: number, N: number, seed: number): number[] {
  const { normal } = makeRng(seed);
  const p = fit.phi.length;
  const q = fit.theta.length;
  const out = new Array<number>(N);
  for (let path = 0; path < N; path++) {
    const rh = [...fit.initR];
    const eh = [...fit.initE];
    let logsum = 0;
    for (let d = 0; d < H; d++) {
      let m = fit.c;
      for (let i = 0; i < p; i++) m += fit.phi[i] * rh[rh.length - 1 - i];
      for (let j = 0; j < q; j++) m += fit.theta[j] * eh[eh.length - 1 - j];
      const inn = fit.sigma * normal();
      const rt = m + inn;
      logsum += rt;
      rh.push(rt);
      if (rh.length > p) rh.shift();
      eh.push(inn);
      if (eh.length > q) eh.shift();
    }
    out[path] = Math.exp(logsum) - 1;
  }
  return out;
}

// ---- Machine learning: a small MLP trained by gradient descent -------------

interface MlpFit {
  W1: number[][];
  b1: number[];
  W2: number[];
  b2: number;
  k: number;
  h: number;
  fMean: number;
  fStd: number;
  residStd: number;
  initWindow: number[];
}

// One hidden layer (tanh), trained full-batch with backpropagation on lagged
// standardized returns predicting the next return.
export function trainMlp(r: number[], seed: number): MlpFit {
  const k = 5;
  const h = 8;
  const n = r.length;
  const fMean = mean(r);
  const fStd = standardDeviation(r) || 1;

  const Xs: number[][] = [];
  const ys: number[] = [];
  for (let t = k; t < n; t++) {
    const row: number[] = [];
    for (let i = 1; i <= k; i++) row.push((r[t - i] - fMean) / fStd);
    Xs.push(row);
    ys.push((r[t] - fMean) / fStd);
  }

  const u = mulberry32(seed);
  const randn = () => {
    const u1 = u() || 1e-12;
    const u2 = u();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const W1 = Array.from({ length: h }, () => Array.from({ length: k }, () => randn() * 0.3));
  const b1 = new Array(h).fill(0);
  const W2 = Array.from({ length: h }, () => randn() * 0.3);
  let b2 = 0;

  const m = Xs.length;
  const lr = 0.05;
  const epochs = 250;
  for (let ep = 0; ep < epochs; ep++) {
    const gW1 = Array.from({ length: h }, () => new Array(k).fill(0));
    const gb1 = new Array(h).fill(0);
    const gW2 = new Array(h).fill(0);
    let gb2 = 0;
    for (let s = 0; s < m; s++) {
      const x = Xs[s];
      const a1 = new Array(h);
      let yhat = b2;
      for (let j = 0; j < h; j++) {
        let z = b1[j];
        for (let i = 0; i < k; i++) z += W1[j][i] * x[i];
        a1[j] = Math.tanh(z);
        yhat += W2[j] * a1[j];
      }
      const dy = yhat - ys[s];
      gb2 += dy;
      for (let j = 0; j < h; j++) {
        gW2[j] += dy * a1[j];
        const dz = dy * W2[j] * (1 - a1[j] * a1[j]);
        gb1[j] += dz;
        for (let i = 0; i < k; i++) gW1[j][i] += dz * x[i];
      }
    }
    const scale = lr / m;
    b2 -= scale * gb2;
    for (let j = 0; j < h; j++) {
      W2[j] -= scale * gW2[j];
      b1[j] -= scale * gb1[j];
      for (let i = 0; i < k; i++) W1[j][i] -= scale * gW1[j][i];
    }
  }

  // Training residual std (standardized units) drives forecast noise.
  let ss = 0;
  for (let s = 0; s < m; s++) {
    const x = Xs[s];
    let yhat = b2;
    for (let j = 0; j < h; j++) {
      let z = b1[j];
      for (let i = 0; i < k; i++) z += W1[j][i] * x[i];
      yhat += W2[j] * Math.tanh(z);
    }
    const d = yhat - ys[s];
    ss += d * d;
  }
  const residStd = Math.sqrt(ss / Math.max(1, m));

  return { W1, b1, W2, b2, k, h, fMean, fStd, residStd, initWindow: r.slice(n - k) };
}

function simulateMlp(fit: MlpFit, H: number, N: number, seed: number): number[] {
  const { normal } = makeRng(seed);
  const out = new Array<number>(N);
  for (let path = 0; path < N; path++) {
    const win = [...fit.initWindow];
    let logsum = 0;
    for (let d = 0; d < H; d++) {
      const x: number[] = [];
      for (let i = 1; i <= fit.k; i++) x.push((win[win.length - i] - fit.fMean) / fit.fStd);
      let yStd = fit.b2;
      for (let j = 0; j < fit.h; j++) {
        let z = fit.b1[j];
        for (let i = 0; i < fit.k; i++) z += fit.W1[j][i] * x[i];
        yStd += fit.W2[j] * Math.tanh(z);
      }
      yStd += fit.residStd * normal();
      yStd = Math.max(-5, Math.min(5, yStd));
      // De-standardize and clamp the daily return so the recursion can't explode.
      const rt = Math.max(-0.4, Math.min(0.4, fit.fMean + yStd * fit.fStd));
      logsum += rt;
      win.push(rt);
      if (win.length > fit.k) win.shift();
    }
    out[path] = Math.exp(logsum) - 1;
  }
  return out;
}

// ---- Stochastic calculus: Ornstein–Uhlenbeck / Vasicek mean reversion ------

interface OuFit {
  slope: number;
  intercept: number;
  b: number; // AR(1) coefficient of detrended log price
  sigma: number;
  lastResidual: number;
  n: number;
  logLast: number;
}

// Detrend log price with a linear trend, then fit the OU mean-reversion of the
// residual via its AR(1) representation (exact discretization of dX=θ(μ−X)dt+σdW).
export function fitOu(closes: number[]): OuFit {
  const logP = closes.map((c) => Math.log(c));
  const n = logP.length;
  let st = 0;
  let stt = 0;
  let sy = 0;
  let sty = 0;
  for (let t = 0; t < n; t++) {
    st += t;
    stt += t * t;
    sy += logP[t];
    sty += t * logP[t];
  }
  const denom = n * stt - st * st || 1;
  const slope = (n * sty - st * sy) / denom;
  const intercept = (sy - slope * st) / n;

  const x: number[] = [];
  for (let t = 0; t < n; t++) x.push(logP[t] - (intercept + slope * t));

  let num = 0;
  let den = 0;
  for (let t = 1; t < n; t++) {
    num += x[t] * x[t - 1];
    den += x[t - 1] * x[t - 1];
  }
  let b = den > 0 ? num / den : 0;
  b = Math.max(-0.999, Math.min(0.999, b));
  const res: number[] = [];
  for (let t = 1; t < n; t++) res.push(x[t] - b * x[t - 1]);
  const sigma = standardDeviation(res);

  return { slope, intercept, b, sigma, lastResidual: x[n - 1], n, logLast: logP[n - 1] };
}

function simulateOu(fit: OuFit, H: number, N: number, seed: number): number[] {
  const { normal } = makeRng(seed);
  const out = new Array<number>(N);
  for (let path = 0; path < N; path++) {
    let xres = fit.lastResidual;
    for (let d = 0; d < H; d++) xres = fit.b * xres + fit.sigma * normal();
    const T = fit.n - 1 + H;
    const logPT = fit.intercept + fit.slope * T + xres;
    out[path] = Math.exp(logPT - fit.logLast) - 1;
  }
  return out;
}

// Run every model and return per-model terminal returns plus pooled ensemble.
function runModels(
  logRets: number[],
  closes: number[],
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
  const arma = fitArma(logRets);
  const mlp = trainMlp(logRets, seedBase + 101);
  const ou = fitOu(closes);
  const baseVol = annualizedVol(logRets);
  const garchVolForecast = Math.sqrt(garch.lastVar * TRADING_DAYS_PER_YEAR);
  const armaVol = arma.sigma * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const mlpVol = mlp.residStd * mlp.fStd * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const ouVol = ou.sigma * Math.sqrt(TRADING_DAYS_PER_YEAR);

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
    {
      meta: {
        name: "ARIMA (ARMA on returns)",
        author: "Box & Jenkins",
        kind: "Time-series (autoregressive)",
        description: `ARMA(2,1) on log returns fit by Hannan–Rissanen; captures return autocorrelation.`,
        annualizedVolForecast: armaVol,
      },
      returns: simulateArma(arma, H, N, seedBase + 83),
    },
    {
      meta: {
        name: "Neural network (MLP)",
        author: "Backprop (Rumelhart et al.)",
        kind: "Machine learning",
        description: `5-lag → 8-unit tanh MLP trained by gradient descent on historical returns.`,
        annualizedVolForecast: mlpVol,
      },
      returns: simulateMlp(mlp, H, N, seedBase + 97),
    },
    {
      meta: {
        name: "Ornstein–Uhlenbeck (Vasicek)",
        author: "Uhlenbeck–Ornstein",
        kind: "Mean-reverting SDE (Itô)",
        description: `Mean-reverting SDE dX=θ(μ−X)dt+σdW on detrended log price (reversion ${(ou.b).toFixed(2)}).`,
        annualizedVolForecast: ouVol,
      },
      returns: simulateOu(ou, H, N, seedBase + 109),
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
  tickerCloses: number[],
  benchLog: number[],
  benchCloses: number[],
  horizonDays: number,
  seedBase: number,
  pathsPerModel = 3500,
): ForwardForecast {
  const tickerStart = tickerCloses[tickerCloses.length - 1];
  const benchStart = benchCloses[benchCloses.length - 1];
  const ticker = runModels(tickerLog, tickerCloses, tickerStart, horizonDays, pathsPerModel, seedBase);
  const bench = runModels(benchLog, benchCloses, benchStart, horizonDays, pathsPerModel, seedBase + 5000);

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
