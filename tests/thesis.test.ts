import { describe, it, expect } from "vitest";
import { detectThesis, interpretThesis, ruinProbability } from "@/lib/quant/thesis";
import { logReturns } from "@/lib/quant/returns";
import { fallbackPrices } from "@/lib/market/fallback";

const nvdaCloses = fallbackPrices("NVDA").map((b) => b.close);
const nvdaLog = logReturns(nvdaCloses);
const start = nvdaCloses[nvdaCloses.length - 1];
const H = 63; // one quarter

function interpret(thesis: string, bullishScore = 60) {
  return interpretThesis(thesis, start, nvdaLog, H, bullishScore, "NVDA", "SPY");
}

describe("detectThesis (word-based)", () => {
  it("classifies bullish / bearish wording", () => {
    expect(detectThesis("NVDA will rise and outperform SPY").stance).toBe("bullish");
    expect(detectThesis("NVDA will fall and underperform SPY").stance).toBe("bearish");
  });
  it("treats negated bearish as bullish", () => {
    expect(detectThesis("NVDA will not collapse or go bankrupt").extremeClaim).toBe(false);
  });
  it("flags worthless/bankrupt as extreme", () => {
    expect(detectThesis("the shares become worthless").extremeClaim).toBe(true);
  });
});

describe("interpretThesis — survival claims", () => {
  it("'will not go bankrupt' is strongly supported", () => {
    const r = interpret("NVDA will not go bankrupt this quarter");
    expect(r.stance).toBe("bullish");
    expect(r.thesisScore).toBeGreaterThan(95);
  });
  it("'won't go to zero' is strongly supported", () => {
    const r = interpret("NVDA won't go to zero");
    expect(r.thesisScore).toBeGreaterThan(95);
  });
});

describe("interpretThesis — threshold claims", () => {
  it("'price greater than $0' is ~100% supported (the reported bug)", () => {
    const r = interpret("NVIDIA will have a stock price greater than $0 by end of quarter");
    expect(r.stance).toBe("bullish");
    expect(r.extremeClaim).toBe(false);
    expect(r.thesisScore).toBeGreaterThan(95); // Supported
  });

  it("'price greater than 0$' (dollar after) also parses", () => {
    const r = interpret("NVIDIA stock price will be greater than 0$ by quarter end");
    expect(r.thesisScore).toBeGreaterThan(95);
  });

  it("'goes to $0' is contradicted (~0%)", () => {
    const r = interpret("NVDA will fall to $0 this quarter");
    expect(r.extremeClaim).toBe(true);
    expect(r.thesisScore).toBeLessThan(5);
  });

  it("'above a far-out target' is a low probability", () => {
    const r = interpret(`NVDA will be above $${(start * 3).toFixed(0)} by quarter end`);
    expect(r.thesisScore).toBeLessThan(50);
  });

  it("'below current price' is a coin-flip-ish probability", () => {
    const r = interpret(`NVDA will trade below $${(start * 0.9).toFixed(0)}`);
    expect(r.stance).toBe("bearish");
    expect(r.thesisScore).toBeGreaterThan(10);
    expect(r.thesisScore).toBeLessThan(90);
  });
});

describe("interpretThesis — directional claims", () => {
  it("passes the bullish score through", () => {
    const r = interpret("NVDA will outperform SPY", 70);
    expect(r.thesisScore).toBeCloseTo(70, 5);
  });
  it("inverts for a bearish thesis", () => {
    const r = interpret("NVDA will underperform SPY", 70);
    expect(r.thesisScore).toBeCloseTo(30, 5);
  });
});

describe("ruinProbability", () => {
  it("is essentially zero over a quarter", () => {
    expect(ruinProbability(nvdaLog, H)).toBeLessThan(0.02);
  });
});
