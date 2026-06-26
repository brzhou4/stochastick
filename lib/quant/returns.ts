// Return calculations. Daily log returns are the default basis for the engine;
// metrics that genuinely require simple returns (e.g. cumulative return,
// historical VaR) say so explicitly.

export const TRADING_DAYS_PER_YEAR = 252;

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// Sample standard deviation (n - 1 denominator). Falls back to population for n <= 1.
export function standardDeviation(values: number[]): number {
  const n = values.length;
  if (n <= 1) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) {
    const d = v - m;
    acc += d * d;
  }
  return Math.sqrt(acc / (n - 1));
}

export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const cur = prices[i];
    if (prev > 0 && cur > 0) {
      out.push(Math.log(cur / prev));
    }
  }
  return out;
}

export function simpleReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev > 0) {
      out.push(prices[i] / prev - 1);
    }
  }
  return out;
}

// Total return over the full window, using first and last price (simple return).
export function cumulativeReturn(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (first <= 0) return 0;
  return last / first - 1;
}

// Geometrically annualized return derived from mean daily log return.
export function annualizedReturn(logRets: number[]): number {
  if (logRets.length === 0) return 0;
  const annualLog = mean(logRets) * TRADING_DAYS_PER_YEAR;
  return Math.exp(annualLog) - 1;
}
