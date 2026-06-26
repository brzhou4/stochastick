// Orchestrates a full stress-test mission: fetch data -> compute metrics ->
// classify regime -> simulate -> score -> build evidence -> phrase memo.
// All math is deterministic; only the optional memo prose may come from an LLM.

import { getPriceSeries, alignSeries } from "../market/data";
import { phraseSummary } from "../llm/gmi";
import {
  TRADING_DAYS_PER_YEAR,
  logReturns,
  simpleReturns,
  cumulativeReturn,
  annualizedReturn,
  standardDeviation,
} from "./returns";
import {
  annualizedVolatility,
  downsideDeviation,
  sharpeRatio,
  sortinoRatio,
  valueAtRisk95,
  expectedShortfall95,
  skewness,
  kurtosis,
} from "./risk";
import { computeDrawdown, calmarRatio } from "./drawdown";
import {
  beta,
  correlation,
  alpha,
  trackingError,
  informationRatio,
  treynorRatio,
} from "./regression";
import {
  estimateGbmParams,
  simulateGbm,
  probabilityOutperform,
  seedFor,
  HORIZON_DAYS,
} from "./simulations";
import { runForecast } from "./forecast";
import { computeQuantSupportScore, verdictFromScore } from "./scoring";
import {
  buildEvidence,
  buildAssumptionChecks,
  buildMethodology,
  verdictSummary,
} from "./report";
import type {
  StressTestRequest,
  StressTestResponse,
  Metrics,
  VolatilityRegime,
  VolatilityRegimeLabel,
  Simulations,
  TimelineEvent,
  NormalizedPoint,
  DrawdownPoint,
  PriceSummary,
  InstrumentPriceSummary,
  ForwardForecast,
} from "./types";

const NUM_PATHS = 10000;
const RECENT_WINDOW = 20;

function getRiskFreeRate(): number {
  const raw = process.env.RISK_FREE_RATE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0.045;
}

function classifyRegime(
  tickerLog: number[],
): VolatilityRegime {
  const recentSlice = tickerLog.slice(-RECENT_WINDOW);
  const recent =
    standardDeviation(recentSlice) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const longRun = annualizedVolatility(tickerLog);
  const ratio = longRun > 0 ? recent / longRun : 1;

  let label: VolatilityRegimeLabel;
  if (ratio < 0.75) label = "Low Volatility";
  else if (ratio <= 1.25) label = "Normal Volatility";
  else if (ratio <= 2.0) label = "High Volatility";
  else label = "Crisis Volatility";

  return {
    label,
    recentRealizedVolatility: recent,
    longRunRealizedVolatility: longRun,
    explanation: `20-day realized volatility is ${(recent * 100).toFixed(1)}% annualized versus a long-run ${(longRun * 100).toFixed(1)}% (ratio ${ratio.toFixed(2)}). Ratios below 0.75 are low, 0.75-1.25 normal, 1.25-2.0 high, and above 2.0 crisis.`,
  };
}

function missionId(req: StressTestRequest): string {
  const stamp = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `mission_${req.ticker.toLowerCase()}_${stamp}${rand}`;
}

export async function runStressTest(
  req: StressTestRequest,
): Promise<StressTestResponse> {
  const warnings: string[] = [];
  const riskFree = getRiskFreeRate();

  // 1. Market data (live or deterministic fallback).
  const [tickerSeries, benchSeries] = await Promise.all([
    getPriceSeries(req.ticker),
    getPriceSeries(req.benchmark),
  ]);
  if (tickerSeries.warning) warnings.push(tickerSeries.warning);
  if (benchSeries.warning) warnings.push(benchSeries.warning);

  const dataStatus =
    tickerSeries.status === "live" && benchSeries.status === "live"
      ? "live"
      : "fallback";

  // 2. Align on common dates.
  const { dates, aCloses: tickerCloses, bCloses: benchCloses } = alignSeries(
    tickerSeries.bars,
    benchSeries.bars,
  );

  if (dates.length < 30) {
    throw Object.assign(
      new Error("Insufficient overlapping price history to run a stress test."),
      { statusCode: 422 },
    );
  }

  // 3. Returns.
  const tickerLog = logReturns(tickerCloses);
  const benchLog = logReturns(benchCloses);
  const tickerSimple = simpleReturns(tickerCloses);

  // 4. Core metrics.
  const annReturn = annualizedReturn(tickerLog);
  const benchAnnReturn = annualizedReturn(benchLog);
  const annVol = annualizedVolatility(tickerLog);
  const dDev = downsideDeviation(tickerLog);
  const drawdown = computeDrawdown(tickerCloses);
  const betaVal = beta(tickerLog, benchLog);
  const corr = correlation(tickerLog, benchLog);
  const alphaVal = alpha(annReturn, benchAnnReturn, betaVal, riskFree);
  const te = trackingError(tickerLog, benchLog);

  const metrics: Metrics = {
    cumulativeReturn: cumulativeReturn(tickerCloses),
    annualizedReturn: annReturn,
    benchmarkAnnualizedReturn: benchAnnReturn,
    excessReturn: annReturn - benchAnnReturn,
    annualizedVolatility: annVol,
    downsideDeviation: dDev,
    sharpeRatio: sharpeRatio(annReturn, annVol, riskFree),
    sortinoRatio: sortinoRatio(annReturn, dDev, riskFree),
    calmarRatio: calmarRatio(annReturn, drawdown.maxDrawdown),
    treynorRatio: treynorRatio(annReturn, betaVal, riskFree),
    maxDrawdown: drawdown.maxDrawdown,
    averageDrawdown: drawdown.averageDrawdown,
    betaToBenchmark: betaVal,
    correlationToBenchmark: corr,
    alphaVsBenchmark: alphaVal,
    trackingError: te,
    informationRatio: informationRatio(annReturn, benchAnnReturn, te),
    valueAtRisk95: valueAtRisk95(tickerSimple),
    expectedShortfall95: expectedShortfall95(tickerSimple),
    skewness: skewness(tickerLog),
    kurtosis: kurtosis(tickerLog),
  };

  // 5. Volatility regime.
  const regime = classifyRegime(tickerLog);

  // 6. Stochastic simulation (GBM) for ticker and benchmark.
  const horizonDays = HORIZON_DAYS[req.horizon] ?? 63;
  const tickerParams = estimateGbmParams(tickerCloses, tickerLog);
  const benchParams = estimateGbmParams(benchCloses, benchLog);

  const tickerSim = simulateGbm(
    tickerParams,
    horizonDays,
    NUM_PATHS,
    seedFor(`${req.ticker}|${req.horizon}|ticker`),
  );
  const benchSim = simulateGbm(
    benchParams,
    horizonDays,
    NUM_PATHS,
    seedFor(`${req.benchmark}|${req.horizon}|bench`),
  );
  const probOutperform = probabilityOutperform(
    tickerSim.endingReturns,
    benchSim.endingReturns,
  );

  const simulations: Simulations = {
    model: "Geometric Brownian Motion",
    paths: NUM_PATHS,
    expectedReturn: tickerSim.expectedReturn,
    percentile1: tickerSim.percentile1 ?? 0,
    percentile5: tickerSim.percentile5,
    percentile50: tickerSim.percentile50,
    percentile95: tickerSim.percentile95,
    probabilityPositive: tickerSim.probabilityPositive,
    probabilityOutperformBenchmark: probOutperform,
    baseCaseEndingPrice: round2(tickerParams.startPrice * (1 + tickerSim.percentile50)),
    bearCaseEndingPrice: round2(tickerParams.startPrice * (1 + tickerSim.percentile5)),
    bullCaseEndingPrice: round2(tickerParams.startPrice * (1 + tickerSim.percentile95)),
    tailRiskEndingPrice: round2(tickerParams.startPrice * (1 + tickerSim.percentile1)),
  };

  // 6b. Multi-model ensemble forecast (GBM, Student-t, GARCH, jump-diffusion,
  // bootstrap) over the same horizon.
  const forecastRaw = runForecast(
    tickerLog,
    tickerCloses,
    benchLog,
    benchCloses,
    horizonDays,
    seedFor(`${req.ticker}|${req.horizon}|forecast`) >>> 0,
  );
  const forecast = roundForecast(forecastRaw);

  // 7. Quant Support Score (transparent weighted formula).
  const quantSupportScore = computeQuantSupportScore(metrics, simulations, regime);
  const verdictLabel = verdictFromScore(quantSupportScore.score);

  // 8. Deterministic evidence + checks + methodology.
  const { evidenceFor, evidenceAgainst } = buildEvidence(metrics, simulations, regime);
  const assumptionChecks = buildAssumptionChecks(metrics, regime, dates.length);
  const methodology = buildMethodology(req, dates.length);

  // 9. Verdict summary (deterministic, optionally re-phrased by the LLM).
  const deterministicSummary = verdictSummary(
    req,
    verdictLabel,
    metrics,
    simulations,
    regime,
    quantSupportScore.score,
  );
  const { summary, status: llmStatus } = await phraseSummary(
    req,
    metrics,
    simulations,
    regime,
    verdictLabel,
    quantSupportScore.score,
    deterministicSummary,
  );

  // 10. Series for charts + actual-price summary (so users can verify the data).
  const normalizedSeries = buildNormalizedSeries(dates, tickerCloses, benchCloses);
  const priceSummary: PriceSummary = {
    ticker: summarizePrices(req.ticker, dates, tickerCloses),
    benchmark: summarizePrices(req.benchmark, dates, benchCloses),
  };
  const drawdownSeries: DrawdownPoint[] = dates.map((date, i) => ({
    date,
    drawdown: round4(drawdown.series[i] ?? 0),
  }));

  const generatedAt = new Date().toISOString();
  const timeline = buildTimeline(req, generatedAt);

  if (regime.label === "Crisis Volatility") {
    warnings.push(
      "Crisis-level volatility detected: GBM simulation assumes constant volatility and will understate tail outcomes.",
    );
  }
  if (Math.abs(metrics.kurtosis) >= 6) {
    warnings.push(
      "Heavy-tailed return distribution: extreme moves are more likely than the Gaussian GBM model implies.",
    );
  }

  return {
    missionId: missionId(req),
    ticker: req.ticker,
    benchmark: req.benchmark,
    thesis: req.thesis,
    horizon: req.horizon,
    riskStyle: req.riskStyle,
    dataStatus,
    llmStatus,
    verdict: {
      label: verdictLabel,
      summary,
      notFinancialAdvice: true,
    },
    metrics: roundMetrics(metrics),
    volatilityRegime: {
      ...regime,
      recentRealizedVolatility: round4(regime.recentRealizedVolatility),
      longRunRealizedVolatility: round4(regime.longRunRealizedVolatility),
    },
    simulations: roundSimulations(simulations),
    forecast,
    priceSummary,
    quantSupportScore,
    evidenceFor,
    evidenceAgainst,
    assumptionChecks,
    timeline,
    normalizedSeries,
    drawdownSeries,
    methodology,
    warnings: Array.from(new Set(warnings)),
    generatedAt,
  };
}

function buildNormalizedSeries(
  dates: string[],
  tickerCloses: number[],
  benchCloses: number[],
): NormalizedPoint[] {
  const t0 = tickerCloses[0];
  const b0 = benchCloses[0];
  return dates.map((date, i) => ({
    date,
    ticker: round2((tickerCloses[i] / t0) * 100),
    benchmark: round2((benchCloses[i] / b0) * 100),
    tickerClose: round2(tickerCloses[i]),
    benchmarkClose: round2(benchCloses[i]),
  }));
}

function summarizePrices(
  symbol: string,
  dates: string[],
  closes: number[],
): InstrumentPriceSummary {
  const last = closes[closes.length - 1];
  const start = closes[0];
  return {
    symbol,
    lastClose: round2(last),
    lastDate: dates[dates.length - 1],
    startClose: round2(start),
    startDate: dates[0],
    periodHigh: round2(Math.max(...closes)),
    periodLow: round2(Math.min(...closes)),
    periodReturn: round4(last / start - 1),
  };
}

function buildTimeline(req: StressTestRequest, generatedAt: string): TimelineEvent[] {
  const base = new Date(generatedAt).getTime();
  const steps: Array<[string, string]> = [
    ["Mission created", `Stress-test mission opened for ${req.ticker} vs ${req.benchmark}.`],
    ["Market data acquired", "Daily adjusted closes fetched and cleaned."],
    ["Returns computed", "Log and simple returns derived; annualized at 252 trading days."],
    ["Risk profiled", "Volatility, drawdowns, tail risk and risk-adjusted ratios measured."],
    ["Benchmark regression", "Beta, correlation, alpha and information ratio estimated."],
    ["Simulations run", `${NUM_PATHS.toLocaleString()} GBM paths simulated over ${req.horizon.toLowerCase()}.`],
    ["Verdict generated", "Quant Support Score computed and memo written."],
  ];
  return steps.map(([label, description], i) => ({
    date: new Date(base - (steps.length - 1 - i) * 1200).toISOString(),
    label,
    description,
  }));
}

function round2(x: number): number {
  return Number(x.toFixed(2));
}
function round4(x: number): number {
  return Number(x.toFixed(4));
}
function roundMetrics(m: Metrics): Metrics {
  const out = {} as Metrics;
  (Object.keys(m) as (keyof Metrics)[]).forEach((k) => {
    out[k] = round4(m[k]);
  });
  return out;
}
function roundForecast(f: ForwardForecast): ForwardForecast {
  return {
    ...f,
    startPrice: round2(f.startPrice),
    expectedReturn: round4(f.expectedReturn),
    medianReturn: round4(f.medianReturn),
    percentile5: round4(f.percentile5),
    percentile25: round4(f.percentile25),
    percentile50: round4(f.percentile50),
    percentile75: round4(f.percentile75),
    percentile95: round4(f.percentile95),
    probabilityPositive: round4(f.probabilityPositive),
    probabilityOutperformBenchmark: round4(f.probabilityOutperformBenchmark),
    expectedPrice: round2(f.expectedPrice),
    lowPrice: round2(f.lowPrice),
    highPrice: round2(f.highPrice),
    modelAgreement: round4(f.modelAgreement),
    models: f.models.map((m) => ({
      ...m,
      expectedReturn: round4(m.expectedReturn),
      medianReturn: round4(m.medianReturn),
      percentile5: round4(m.percentile5),
      percentile95: round4(m.percentile95),
      probabilityPositive: round4(m.probabilityPositive),
      expectedPrice: round2(m.expectedPrice),
      annualizedVolForecast: round4(m.annualizedVolForecast),
    })),
  };
}

function roundSimulations(s: Simulations): Simulations {
  return {
    ...s,
    expectedReturn: round4(s.expectedReturn),
    percentile1: round4(s.percentile1),
    percentile5: round4(s.percentile5),
    percentile50: round4(s.percentile50),
    percentile95: round4(s.percentile95),
    probabilityPositive: round4(s.probabilityPositive),
    probabilityOutperformBenchmark: round4(s.probabilityOutperformBenchmark),
  };
}
