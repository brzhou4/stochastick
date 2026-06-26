// Drawdown analysis from a price (or cumulative-value) series.

export interface DrawdownResult {
  series: number[]; // drawdown at each point (<= 0)
  maxDrawdown: number; // most negative value
  averageDrawdown: number; // mean of the drawdown series
}

export function drawdownSeries(prices: number[]): number[] {
  const out: number[] = [];
  let peak = -Infinity;
  for (const p of prices) {
    if (p > peak) peak = p;
    if (peak > 0) {
      out.push(p / peak - 1);
    } else {
      out.push(0);
    }
  }
  return out;
}

export function computeDrawdown(prices: number[]): DrawdownResult {
  const series = drawdownSeries(prices);
  if (series.length === 0) {
    return { series, maxDrawdown: 0, averageDrawdown: 0 };
  }
  let maxDrawdown = 0;
  let sum = 0;
  for (const d of series) {
    if (d < maxDrawdown) maxDrawdown = d;
    sum += d;
  }
  return {
    series,
    maxDrawdown,
    averageDrawdown: sum / series.length,
  };
}

// Calmar = annualized return / |max drawdown|.
export function calmarRatio(annualReturn: number, maxDrawdown: number): number {
  const dd = Math.abs(maxDrawdown);
  if (dd === 0) return 0;
  return annualReturn / dd;
}
