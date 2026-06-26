import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/stress-test/route";
import { validateRequest } from "@/lib/quant/validate";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/stress-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("validateRequest", () => {
  it("rejects missing ticker and thesis", () => {
    const r = validateRequest({ horizon: "1 Quarter", riskStyle: "Momentum" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Ticker/i);
    expect(r.errors.join(" ")).toMatch(/Thesis/i);
  });

  it("defaults benchmark to SPY", () => {
    const r = validateRequest({
      ticker: "NVDA",
      thesis: "NVIDIA will outperform over the quarter on AI demand.",
      horizon: "1 Quarter",
      riskStyle: "Momentum",
    });
    expect(r.ok).toBe(true);
    expect(r.value?.benchmark).toBe("SPY");
  });
});

describe("POST /api/stress-test", () => {
  it("returns a structured stress-test report (NVDA vs SPY)", async () => {
    const res = await POST(
      makeRequest({
        ticker: "NVDA",
        benchmark: "SPY",
        thesis:
          "NVIDIA will outperform SPY over the next quarter because AI infrastructure demand remains strong.",
        horizon: "1 Quarter",
        riskStyle: "Momentum",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.ticker).toBe("NVDA");
    expect(json.benchmark).toBe("SPY");
    expect(["live", "fallback"]).toContain(json.dataStatus);
    expect(["Supported", "Mixed", "Weak", "Contradicted"]).toContain(json.verdict.label);
    expect(json.verdict.notFinancialAdvice).toBe(true);

    // Metrics present and numeric.
    expect(typeof json.metrics.sharpeRatio).toBe("number");
    expect(typeof json.metrics.maxDrawdown).toBe("number");
    expect(typeof json.metrics.alphaVsBenchmark).toBe("number");

    // Simulations: at least 10k paths, ordered percentiles.
    expect(json.simulations.paths).toBeGreaterThanOrEqual(10000);
    expect(json.simulations.percentile5).toBeLessThanOrEqual(json.simulations.percentile50);
    expect(json.simulations.percentile50).toBeLessThanOrEqual(json.simulations.percentile95);
    expect(json.simulations.probabilityOutperformBenchmark).toBeGreaterThanOrEqual(0);
    expect(json.simulations.probabilityOutperformBenchmark).toBeLessThanOrEqual(1);

    // Multi-model forecast present and well-formed.
    expect(json.forecast.models.length).toBe(5);
    expect(json.forecast.percentile5).toBeLessThanOrEqual(json.forecast.percentile50);
    expect(json.forecast.percentile50).toBeLessThanOrEqual(json.forecast.percentile95);
    expect(json.forecast.probabilityOutperformBenchmark).toBeGreaterThanOrEqual(0);
    expect(json.forecast.probabilityOutperformBenchmark).toBeLessThanOrEqual(1);
    expect(json.forecast.expectedPrice).toBeGreaterThan(0);

    // Score bounded.
    expect(json.quantSupportScore.score).toBeGreaterThanOrEqual(0);
    expect(json.quantSupportScore.score).toBeLessThanOrEqual(100);
    expect(json.quantSupportScore.breakdown.length).toBeGreaterThan(0);

    // Series for charts.
    expect(json.normalizedSeries.length).toBeGreaterThan(30);
    expect(json.drawdownSeries.length).toBeGreaterThan(30);

    // No buy/sell/hold language in the verdict summary.
    expect(json.verdict.summary.toLowerCase()).not.toMatch(/\b(buy|sell|hold|guaranteed|risk-free)\b/);
  }, 30000);

  it("rejects an invalid request with 400 and field errors", async () => {
    const res = await POST(makeRequest({ ticker: "", thesis: "" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Array.isArray(json.details)).toBe(true);
  });
});
