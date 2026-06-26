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

const MIN_BARS = 40; // minimum observations to trust live data
const FETCH_TIMEOUT_MS = 7000; // fall back rather than hang if a source is slow
const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface YahooChartResult {
  timestamp?: number[];
  indicators?: {
    adjclose?: Array<{ adjclose?: (number | null)[] }>;
    quote?: Array<{ close?: (number | null)[] }>;
  };
}

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      ...init,
      headers: { "User-Agent": UA, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

// Parse Yahoo's v8 chart JSON into clean daily adjusted-close bars.
function parseChart(result: YahooChartResult | undefined): PriceBar[] {
  const ts = result?.timestamp ?? [];
  const adj = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  const close = result?.indicators?.quote?.[0]?.close ?? [];
  const bars: PriceBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const value = adj[i] ?? close[i]; // prefer adjusted close
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      bars.push({
        date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
        close: value,
      });
    }
  }
  return bars;
}

// Yahoo gates its API behind a session cookie + "crumb" token; anonymous
// requests get HTTP 429. We fetch the cookie/crumb once and cache it for the
// life of the process, refreshing only when a request is rejected.
let cachedAuth: { cookie: string; crumb: string } | null = null;

async function getYahooAuth(force = false): Promise<{ cookie: string; crumb: string } | null> {
  if (cachedAuth && !force) return cachedAuth;
  try {
    // 1. Obtain a session cookie.
    let cookie = "";
    for (const u of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
      const res = await timedFetch(u, {
        headers: { Accept: "text/html" },
        redirect: "manual",
      });
      const setCookies =
        typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
      if (cookie) break;
    }
    if (!cookie) return null;

    // 2. Exchange it for a crumb.
    const crumbRes = await timedFetch(
      "https://query1.finance.yahoo.com/v1/test/getcrumb",
      { headers: { Cookie: cookie, Accept: "text/plain" } },
    );
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length > 64) return null; // a real crumb is short

    cachedAuth = { cookie, crumb };
    return cachedAuth;
  } catch {
    return null;
  }
}

// Request the chart endpoint once for a given host and optional auth.
async function requestChart(
  host: string,
  symbol: string,
  auth: { cookie: string; crumb: string } | null,
): Promise<{ bars: PriceBar[] | null; status: number }> {
  const crumbParam = auth?.crumb ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
  const query = `range=2y&interval=1d&includeAdjustedClose=true&events=div%2Csplit${crumbParam}`;
  const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
  const res = await timedFetch(url, {
    headers: {
      Accept: "application/json",
      ...(auth?.cookie ? { Cookie: auth.cookie } : {}),
    },
  });
  if (!res.ok) return { bars: null, status: res.status };
  const json = await res.json();
  const bars = parseChart(json?.chart?.result?.[0]);
  return { bars: bars.length >= MIN_BARS ? bars : null, status: res.status };
}

// Primary live source: Yahoo Finance v8 chart endpoint.
// Strategy: try the cheap ANONYMOUS request first (it frequently succeeds and
// avoids spending rate-limit budget). Only if Yahoo rejects it (401/429) do we
// perform the cookie + crumb handshake and retry.
async function fetchYahoo(symbol: string): Promise<PriceBar[] | null> {
  // 1. Anonymous attempt (reuse a cached crumb if we already have one).
  for (const host of HOSTS) {
    try {
      const { bars, status } = await requestChart(host, symbol, cachedAuth);
      if (bars) return bars;
      if (status !== 401 && status !== 429) continue; // genuine miss, try next host
      cachedAuth = null;
      break; // rejected -> go authenticate
    } catch {
      // network error on this host, try the next
    }
  }

  // 2. Authenticated attempt with a fresh cookie + crumb.
  const auth = await getYahooAuth(true);
  if (!auth) return null;
  for (const host of HOSTS) {
    try {
      const { bars } = await requestChart(host, symbol, auth);
      if (bars) return bars;
    } catch {
      // try the next host
    }
  }
  return null;
}

// Preferred live source: Twelve Data (free tier, ~800 calls/day). Authenticates
// per API key, so it is immune to the per-IP rate-limiting that blocks the
// anonymous Yahoo/Stooq endpoints on shared/corporate/VPN networks. Active only
// when TWELVE_DATA_API_KEY is set.
async function fetchTwelveData(symbol: string): Promise<PriceBar[] | null> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return null;
  try {
    const url =
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
      `&interval=1day&outputsize=520&apikey=${encodeURIComponent(key)}`;
    const res = await timedFetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.status !== "ok" || !Array.isArray(json?.values)) return null; // error payloads carry status:"error"
    const bars: PriceBar[] = [];
    for (const v of json.values) {
      const date = typeof v?.datetime === "string" ? v.datetime.slice(0, 10) : "";
      const close = Number(v?.close);
      if (date && Number.isFinite(close) && close > 0) bars.push({ date, close });
    }
    bars.reverse(); // Twelve Data returns newest-first; we want oldest-first
    return bars.length >= MIN_BARS ? bars : null;
  } catch {
    return null;
  }
}

// Secondary live source: Stooq daily CSV (free, no key). US tickers use the
// ".us" suffix. Returns close prices (Stooq daily is already split-adjusted).
async function fetchStooq(symbol: string): Promise<PriceBar[] | null> {
  try {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}.us&i=d`;
    const res = await timedFetch(url, { headers: { Accept: "text/csv" } });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.startsWith("Date")) return null; // anti-bot/HTML page
    const bars: PriceBar[] = [];
    for (const line of text.trim().split("\n").slice(1)) {
      const cols = line.split(",");
      const date = cols[0];
      const close = Number(cols[4]);
      if (date && Number.isFinite(close) && close > 0) bars.push({ date, close });
    }
    // Keep ~2 years of trailing data to match the Yahoo lookback.
    const trimmed = bars.slice(-520);
    return trimmed.length >= MIN_BARS ? trimmed : null;
  } catch {
    return null;
  }
}

// Try each live source in order; return the first that yields enough data.
// Twelve Data (keyed) goes first because it is the only source that survives
// shared/corporate/VPN egress IPs.
async function fetchLive(symbol: string): Promise<{ bars: PriceBar[]; source: string } | null> {
  const twelve = await fetchTwelveData(symbol);
  if (twelve) return { bars: twelve, source: "Twelve Data" };
  const yahoo = await fetchYahoo(symbol);
  if (yahoo) return { bars: yahoo, source: "Yahoo Finance" };
  const stooq = await fetchStooq(symbol);
  if (stooq) return { bars: stooq, source: "Stooq" };
  return null;
}

// In-memory cache of successfully-fetched LIVE series, keyed by symbol. This is
// what makes "any ticker" work on a rate-limited free API tier: the benchmark
// (e.g. SPY) is fetched once and reused across every mission, and re-running a
// ticker within the TTL costs zero API credits. Fallbacks are never cached, so a
// rate-limited symbol retries live on the next attempt.
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const liveCache = new Map<string, { bars: PriceBar[]; source: string; at: number }>();

// Test-only: reset the live cache (and Yahoo auth) so cases don't bleed.
export function __resetMarketDataCache(): void {
  liveCache.clear();
  cachedAuth = null;
}

export async function getPriceSeries(symbol: string): Promise<PriceSeriesResult> {
  const upper = symbol.toUpperCase();

  const cached = liveCache.get(upper);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { bars: cached.bars, status: "live", source: `${cached.source} (cached)` };
  }

  const live = await fetchLive(upper);
  if (live) {
    liveCache.set(upper, { bars: live.bars, source: live.source, at: Date.now() });
    return { bars: live.bars, status: "live", source: live.source };
  }

  // Live fetch failed for every source. The most common cause on the free tier
  // is the provider's per-minute rate limit; the data is still real on retry.
  const rateLimitNote =
    "Live market data was temporarily unavailable (often a free-tier per-minute rate limit). " +
    "Wait a few seconds and retry, or add/upgrade TWELVE_DATA_API_KEY. Showing labelled demo data.";

  if (isSupportedTicker(upper)) {
    return {
      bars: fallbackPrices(upper),
      status: "fallback",
      source: "Deterministic demo data",
      warning: rateLimitNote,
    };
  }

  // Symbol outside the demo set with no live data: still return deterministic
  // data so the worker can complete, but clearly flag it as fallback.
  return {
    bars: fallbackPrices(upper),
    status: "fallback",
    source: "Deterministic demo data",
    warning: `Live market data for ${upper} was temporarily unavailable (often a free-tier per-minute rate limit). Wait a few seconds and retry. Showing labelled demo data.`,
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
