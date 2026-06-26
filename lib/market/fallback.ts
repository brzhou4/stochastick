// Deterministic fallback price data for the supported tickers. Used only when
// live market data is unavailable. Series are generated from a seeded GBM with
// ticker-specific drift/volatility so they are realistic, stable across runs,
// and clearly labelled as demo data by the caller (dataStatus = "fallback").

import { gaussianGenerator, hashStringToSeed } from "../quant/rng";
import type { PriceBar } from "../quant/types";

export const SUPPORTED_TICKERS = ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "SPY"];

interface AssetProfile {
  startPrice: number;
  annualDrift: number; // simple-return drift, annualized
  annualVol: number; // annualized volatility
}

// Characteristic, hand-tuned profiles so the demo behaves plausibly per ticker.
const PROFILES: Record<string, AssetProfile> = {
  NVDA: { startPrice: 45, annualDrift: 0.62, annualVol: 0.52 },
  TSLA: { startPrice: 240, annualDrift: 0.12, annualVol: 0.58 },
  AAPL: { startPrice: 150, annualDrift: 0.18, annualVol: 0.26 },
  MSFT: { startPrice: 250, annualDrift: 0.24, annualVol: 0.24 },
  AMD: { startPrice: 75, annualDrift: 0.28, annualVol: 0.46 },
  SPY: { startPrice: 400, annualDrift: 0.11, annualVol: 0.16 },
};

const DEFAULT_PROFILE: AssetProfile = {
  startPrice: 100,
  annualDrift: 0.08,
  annualVol: 0.3,
};

const TRADING_DAYS_PER_YEAR = 252;

// Fixed anchor date for deterministic series (keeps tests + demo stable).
const ANCHOR_END = new Date(Date.UTC(2025, 5, 20)); // 2025-06-20

// Generate `count` trailing business days ending at the anchor (inclusive),
// returned oldest-first as ISO yyyy-mm-dd strings.
function businessDaysEndingAt(end: Date, count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(end.getTime());
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

export function isSupportedTicker(symbol: string): boolean {
  return SUPPORTED_TICKERS.includes(symbol.toUpperCase());
}

// Returns ~2 years of deterministic daily bars for a symbol.
export function fallbackPrices(symbol: string, days = 504): PriceBar[] {
  const upper = symbol.toUpperCase();
  const profile = PROFILES[upper] ?? DEFAULT_PROFILE;
  const dates = businessDaysEndingAt(ANCHOR_END, days);

  const dailyDrift = profile.annualDrift / TRADING_DAYS_PER_YEAR;
  const dailyVol = profile.annualVol / Math.sqrt(TRADING_DAYS_PER_YEAR);
  const nextGaussian = gaussianGenerator(hashStringToSeed(`fallback::${upper}`));

  const bars: PriceBar[] = [];
  let logPrice = Math.log(profile.startPrice);
  const logDrift = dailyDrift - 0.5 * dailyVol * dailyVol;

  for (let i = 0; i < dates.length; i++) {
    if (i > 0) {
      logPrice += logDrift + dailyVol * nextGaussian();
    }
    bars.push({
      date: dates[i],
      close: Number(Math.exp(logPrice).toFixed(2)),
    });
  }
  return bars;
}
