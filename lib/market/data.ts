// Market data fetcher. Tries live Yahoo Finance daily adjusted closes; on any
// failure (network, rate limit, unknown symbol, too little data) it falls back
// to deterministic demo data and reports that fact via `status`. It NEVER labels
// fallback data as live.

import type { PriceBar, DataStatus } from "../quant/types";
import { fallbackPrices, isSupportedTicker } from "./fallback";

export interface PriceSeriesResult {
  bars: PriceBar[];
  status: DataStatus;
  source: string;
  warning?: string;
}

const LOOKBACK_DAYS = 365 * 2; // 2 years
const MIN_BARS = 40; // minimum observations to trust live data

function twoYearsAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS);
  return d;
}

// Fetch live daily adjusted closes from yahoo-finance2. Returns null on failure.
async function fetchLive(symbol: string): Promise<PriceBar[] | null> {
  try {
    // Dynamically imported so the dependency stays server-only and a missing
    // module never breaks the build/tests.
    const mod = await import("yahoo-finance2");
    const yf = (mod as any).default ?? mod;

    const result = await yf.chart(symbol, {
      period1: twoYearsAgo(),
      interval: "1d",
    });

    const quotes: any[] = result?.quotes ?? [];
    const bars: PriceBar[] = [];
    for (const q of quotes) {
      const close = q.adjclose ?? q.close;
      if (q?.date && typeof close === "number" && Number.isFinite(close) && close > 0) {
        const date =
          q.date instanceof Date ? q.date.toISOString().slice(0, 10) : String(q.date).slice(0, 10);
        bars.push({ date, close });
      }
    }
    if (bars.length < MIN_BARS) return null;
    return bars;
  } catch {
    return null;
  }
}

export async function getPriceSeries(symbol: string): Promise<PriceSeriesResult> {
  const upper = symbol.toUpperCase();
  const live = await fetchLive(upper);
  if (live) {
    return { bars: live, status: "live", source: "Yahoo Finance" };
  }

  if (isSupportedTicker(upper)) {
    return {
      bars: fallbackPrices(upper),
      status: "fallback",
      source: "Deterministic demo data",
      warning: "Demo fallback data used because live market data was unavailable.",
    };
  }

  // Unsupported symbol with no live data: still return deterministic data so the
  // worker can complete, but clearly flag it as fallback.
  return {
    bars: fallbackPrices(upper),
    status: "fallback",
    source: "Deterministic demo data",
    warning: `Live market data for ${upper} was unavailable and ${upper} is outside the demo set; generated demo data used.`,
  };
}

// Align two price series on their common trading dates (inner join), preserving
// chronological order. Returns aligned closes plus the shared date list.
export function alignSeries(
  a: PriceBar[],
  b: PriceBar[],
): { dates: string[]; aCloses: number[]; bCloses: number[] } {
  const bMap = new Map<string, number>();
  for (const bar of b) bMap.set(bar.date, bar.close);

  const dates: string[] = [];
  const aCloses: number[] = [];
  const bCloses: number[] = [];
  for (const bar of a) {
    const bClose = bMap.get(bar.date);
    if (bClose !== undefined) {
      dates.push(bar.date);
      aCloses.push(bar.close);
      bCloses.push(bClose);
    }
  }
  return { dates, aCloses, bCloses };
}
