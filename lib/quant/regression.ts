// Benchmark-relative statistics: beta, correlation, CAPM alpha, tracking error,
// information ratio and Treynor ratio. All inputs are aligned daily log-return
// arrays of equal length.

import { TRADING_DAYS_PER_YEAR, mean, standardDeviation } from "./returns";

export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n <= 1) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (a[i] - ma) * (b[i] - mb);
  }
  return acc / (n - 1);
}

export function beta(assetRets: number[], benchRets: number[]): number {
  const varBench = Math.pow(standardDeviation(benchRets), 2);
  if (varBench === 0) return 0;
  return covariance(assetRets, benchRets) / varBench;
}

export function correlation(a: number[], b: number[]): number {
  const sa = standardDeviation(a);
  const sb = standardDeviation(b);
  if (sa === 0 || sb === 0) return 0;
  return covariance(a, b) / (sa * sb);
}

// Annualized CAPM alpha: (Ra - Rf) - beta * (Rb - Rf), using annualized returns.
export function alpha(
  assetAnnualReturn: number,
  benchAnnualReturn: number,
  betaValue: number,
  riskFreeRate: number,
): number {
  return (
    assetAnnualReturn -
    riskFreeRate -
    betaValue * (benchAnnualReturn - riskFreeRate)
  );
}

// Annualized tracking error: std of (asset - benchmark) daily return differences.
export function trackingError(assetRets: number[], benchRets: number[]): number {
  const n = Math.min(assetRets.length, benchRets.length);
  const diffs: number[] = [];
  for (let i = 0; i < n; i++) {
    diffs.push(assetRets[i] - benchRets[i]);
  }
  return standardDeviation(diffs) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// Information ratio: active annualized return / tracking error.
export function informationRatio(
  assetAnnualReturn: number,
  benchAnnualReturn: number,
  trackingErr: number,
): number {
  if (trackingErr === 0) return 0;
  return (assetAnnualReturn - benchAnnualReturn) / trackingErr;
}

// Treynor ratio: (annualized return - risk free) / beta.
export function treynorRatio(
  annualReturn: number,
  betaValue: number,
  riskFreeRate: number,
): number {
  if (betaValue === 0) return 0;
  return (annualReturn - riskFreeRate) / betaValue;
}
