// Volatility, risk-adjusted ratios, tail risk and distribution shape.

import {
  TRADING_DAYS_PER_YEAR,
  mean,
  standardDeviation,
} from "./returns";

export function annualizedVolatility(logRets: number[]): number {
  return standardDeviation(logRets) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// Annualized downside deviation versus a minimum-acceptable daily return (MAR).
// Default MAR is 0 (preserve capital). Uses the full-sample denominator, which
// is the conventional Sortino definition.
export function downsideDeviation(logRets: number[], dailyMar = 0): number {
  if (logRets.length === 0) return 0;
  let acc = 0;
  for (const r of logRets) {
    const shortfall = Math.min(0, r - dailyMar);
    acc += shortfall * shortfall;
  }
  const dailyDownside = Math.sqrt(acc / logRets.length);
  return dailyDownside * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// Sharpe = (annualized return - risk free) / annualized volatility.
export function sharpeRatio(
  annualReturn: number,
  annualVol: number,
  riskFreeRate: number,
): number {
  if (annualVol === 0) return 0;
  return (annualReturn - riskFreeRate) / annualVol;
}

// Sortino = (annualized return - risk free) / annualized downside deviation.
export function sortinoRatio(
  annualReturn: number,
  annualDownside: number,
  riskFreeRate: number,
): number {
  if (annualDownside === 0) return 0;
  return (annualReturn - riskFreeRate) / annualDownside;
}

// Returns the value at the given percentile (0-100) of a numeric array using
// linear interpolation between closest ranks.
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

// Historical 95% Value at Risk on simple daily returns. Returned as the (negative)
// return at the 5th percentile of the loss distribution.
export function valueAtRisk95(simpleRets: number[]): number {
  if (simpleRets.length === 0) return 0;
  return percentile(simpleRets, 5);
}

// Historical 95% Expected Shortfall (a.k.a. CVaR): mean of returns at or below
// the 5th-percentile threshold.
export function expectedShortfall95(simpleRets: number[]): number {
  if (simpleRets.length === 0) return 0;
  const threshold = valueAtRisk95(simpleRets);
  const tail = simpleRets.filter((r) => r <= threshold);
  if (tail.length === 0) return threshold;
  return mean(tail);
}

// Sample skewness (Fisher-Pearson).
export function skewness(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const sd = standardDeviation(values);
  if (sd === 0) return 0;
  let acc = 0;
  for (const v of values) {
    acc += Math.pow((v - m) / sd, 3);
  }
  return (n / ((n - 1) * (n - 2))) * acc;
}

// Sample excess kurtosis (0 for a normal distribution).
export function kurtosis(values: number[]): number {
  const n = values.length;
  if (n < 4) return 0;
  const m = mean(values);
  const sd = standardDeviation(values);
  if (sd === 0) return 0;
  let acc = 0;
  for (const v of values) {
    acc += Math.pow((v - m) / sd, 4);
  }
  const term1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
  const term2 = (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  return term1 * acc - term2;
}
