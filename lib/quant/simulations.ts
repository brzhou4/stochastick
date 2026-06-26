// Geometric Brownian Motion forward simulation.
//
// Model: dS = mu * S * dt + sigma * S * dW
// In discrete log space (daily steps, dt = 1):
//   log S_{t+1} = log S_t + (mu - 0.5 * sigma^2) + sigma * Z,  Z ~ N(0, 1)
//
// We estimate mu as the arithmetic mean of daily SIMPLE returns (the drift of
// the price process) and sigma as the std of daily LOG returns. Random draws are
// produced by a deterministic seeded generator so demo + tests are reproducible.

import { gaussianGenerator, hashStringToSeed } from "./rng";
import { mean, standardDeviation, simpleReturns } from "./returns";
import { percentile } from "./risk";

export const HORIZON_DAYS: Record<string, number> = {
  "1 Week": 5,
  "1 Month": 21,
  "1 Quarter": 63,
  "1 Year": 252,
};

export interface GbmParams {
  mu: number; // daily drift (arithmetic mean of simple returns)
  sigma: number; // daily volatility (std of log returns)
  startPrice: number;
}

export interface GbmResult {
  paths: number;
  horizonDays: number;
  endingPrices: number[];
  endingReturns: number[];
  expectedReturn: number;
  percentile1: number;
  percentile5: number;
  percentile50: number;
  percentile95: number;
  probabilityPositive: number;
}

// Estimate GBM parameters from a price series.
export function estimateGbmParams(
  prices: number[],
  logRets: number[],
): GbmParams {
  const simple = simpleReturns(prices);
  return {
    mu: mean(simple),
    sigma: standardDeviation(logRets),
    startPrice: prices.length > 0 ? prices[prices.length - 1] : 100,
  };
}

// Simulate terminal prices via stepwise GBM in log space.
export function simulateGbm(
  params: GbmParams,
  horizonDays: number,
  numPaths: number,
  seed: number,
): GbmResult {
  const nextGaussian = gaussianGenerator(seed);
  const { mu, sigma, startPrice } = params;
  const drift = mu - 0.5 * sigma * sigma; // per-day log drift
  const logStart = Math.log(startPrice > 0 ? startPrice : 1);

  const endingPrices = new Array<number>(numPaths);
  const endingReturns = new Array<number>(numPaths);
  let positive = 0;

  for (let p = 0; p < numPaths; p++) {
    let logS = logStart;
    for (let d = 0; d < horizonDays; d++) {
      logS += drift + sigma * nextGaussian();
    }
    const price = Math.exp(logS);
    endingPrices[p] = price;
    const ret = price / startPrice - 1;
    endingReturns[p] = ret;
    if (ret > 0) positive++;
  }

  return {
    paths: numPaths,
    horizonDays,
    endingPrices,
    endingReturns,
    expectedReturn: mean(endingReturns),
    percentile1: percentile(endingReturns, 1),
    percentile5: percentile(endingReturns, 5),
    percentile50: percentile(endingReturns, 50),
    percentile95: percentile(endingReturns, 95),
    probabilityPositive: positive / numPaths,
  };
}

// Estimate the probability the asset's simulated return beats the benchmark's,
// pairing independent draws path-by-path.
export function probabilityOutperform(
  assetReturns: number[],
  benchReturns: number[],
): number {
  const n = Math.min(assetReturns.length, benchReturns.length);
  if (n === 0) return 0;
  let wins = 0;
  for (let i = 0; i < n; i++) {
    if (assetReturns[i] > benchReturns[i]) wins++;
  }
  return wins / n;
}

export function seedFor(label: string): number {
  return hashStringToSeed(`thesisbreak::${label}`);
}
