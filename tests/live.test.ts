import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPriceSeries, __resetMarketDataCache } from "@/lib/market/data";

beforeEach(() => __resetMarketDataCache());

// Unit test of the live-parsing path with a mocked Yahoo response — runs every
// time, no network needed. Proves getPriceSeries returns status "live" and maps
// the v8 chart JSON correctly.
describe("getPriceSeries (mocked live)", () => {
  it("runs the cookie+crumb flow and parses chart JSON into live bars", async () => {
    const base = Math.floor(Date.UTC(2025, 0, 2) / 1000);
    const day = 86400;
    const n = 60;
    const timestamp = Array.from({ length: n }, (_, i) => base + i * day);
    const adjclose = Array.from({ length: n }, (_, i) => 100 + i);

    // Simulate Yahoo rejecting the anonymous chart (429), then succeeding once a
    // crumb is supplied — exercising the anonymous-first → auth-retry flow.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("getcrumb")) {
        return { ok: true, status: 200, text: async () => "ABCD1234crumb" } as unknown as Response;
      }
      if (url.includes("/v8/finance/chart/")) {
        if (!url.includes("crumb=ABCD1234crumb")) {
          // Anonymous request is rejected.
          return { ok: false, status: 429, text: async () => "Too Many Requests" } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            chart: { result: [{ timestamp, indicators: { adjclose: [{ adjclose }], quote: [{ close: adjclose }] } }] },
          }),
        } as unknown as Response;
      }
      // Cookie-issuing page.
      return {
        ok: true,
        status: 200,
        headers: { getSetCookie: () => ["A3=token; Path=/; Domain=.yahoo.com"] },
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await getPriceSeries("NVDA");
    expect(res.status).toBe("live");
    expect(res.source).toBe("Yahoo Finance");
    expect(res.bars.length).toBe(n);
    expect(res.bars[0].close).toBe(100);
    expect(res.bars[n - 1].close).toBe(100 + n - 1);

    vi.unstubAllGlobals();
  });
});

describe("getPriceSeries (Twelve Data, keyed)", () => {
  it("uses Twelve Data first when TWELVE_DATA_API_KEY is set", async () => {
    const n = 60;
    // Twelve Data returns newest-first; build descending dates with close = index.
    const values = Array.from({ length: n }, (_, i) => ({
      datetime: `2025-03-${String(((n - i) % 28) + 1).padStart(2, "0")}`,
      close: String(200 + (n - 1 - i)),
    }));

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("api.twelvedata.com");
      expect(url).toContain("apikey=test-key");
      return { ok: true, status: 200, json: async () => ({ status: "ok", values }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");

    const res = await getPriceSeries("NVDA");
    expect(res.status).toBe("live");
    expect(res.source).toBe("Twelve Data");
    expect(res.bars.length).toBe(n);
    // Oldest-first after reversing: first close should be the smallest (200).
    expect(res.bars[0].close).toBe(200);
    expect(res.bars[n - 1].close).toBe(200 + n - 1);

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});

// Real-network smoke test. Skipped unless LIVE_TEST=1 so normal CI/offline runs
// stay deterministic. Run with: LIVE_TEST=1 npx vitest run tests/live.test.ts
describe.skipIf(process.env.LIVE_TEST !== "1")("getPriceSeries (real network)", () => {
  it("fetches live daily closes for NVDA", async () => {
    const res = await getPriceSeries("NVDA");
    expect(res.status).toBe("live");
    expect(res.bars.length).toBeGreaterThan(200);
    const last = res.bars[res.bars.length - 1];
    expect(last.close).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`LIVE NVDA: ${res.bars.length} bars, last ${last.date} = $${last.close.toFixed(2)}`);
  }, 20000);
});
