// Shared types for the ThesisBreak quant engine and the /api/stress-test contract.
// These types are imported by both the backend route and the frontend report UI.

export type Horizon = "1 Week" | "1 Month" | "1 Quarter" | "1 Year";

export type RiskStyle =
  | "Momentum"
  | "Mean Reversion"
  | "Volatility"
  | "Event Driven"
  | "Long-Term Fundamental";

export type VerdictLabel = "Supported" | "Mixed" | "Weak" | "Contradicted";

export type VolatilityRegimeLabel =
  | "Low Volatility"
  | "Normal Volatility"
  | "High Volatility"
  | "Crisis Volatility";

export type DataStatus = "live" | "fallback";

export type LlmStatus = "used" | "missing_env" | "skipped_timeout" | "error";

export interface StressTestRequest {
  ticker: string;
  benchmark: string;
  thesis: string;
  horizon: Horizon;
  riskStyle: RiskStyle;
}

export interface Metrics {
  cumulativeReturn: number;
  annualizedReturn: number;
  benchmarkAnnualizedReturn: number;
  excessReturn: number;
  annualizedVolatility: number;
  downsideDeviation: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  treynorRatio: number;
  maxDrawdown: number;
  averageDrawdown: number;
  betaToBenchmark: number;
  correlationToBenchmark: number;
  alphaVsBenchmark: number;
  trackingError: number;
  informationRatio: number;
  valueAtRisk95: number;
  expectedShortfall95: number;
  skewness: number;
  kurtosis: number;
}

export interface VolatilityRegime {
  label: VolatilityRegimeLabel;
  recentRealizedVolatility: number;
  longRunRealizedVolatility: number;
  explanation: string;
}

export interface Simulations {
  model: "Geometric Brownian Motion";
  paths: number;
  expectedReturn: number;
  percentile1: number;
  percentile5: number;
  percentile50: number;
  percentile95: number;
  probabilityPositive: number;
  probabilityOutperformBenchmark: number;
  baseCaseEndingPrice: number;
  bearCaseEndingPrice: number;
  bullCaseEndingPrice: number;
  tailRiskEndingPrice: number;
}

export interface ScoreFactor {
  factor: string;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface QuantSupportScore {
  score: number;
  label: string;
  breakdown: ScoreFactor[];
}

export interface AssumptionCheck {
  assumption: string;
  status: "Pass" | "Warning" | "Fail";
  explanation: string;
}

export interface TimelineEvent {
  date: string;
  label: string;
  description: string;
}

export interface NormalizedPoint {
  date: string;
  ticker: number;
  benchmark: number;
}

export interface DrawdownPoint {
  date: string;
  drawdown: number;
}

export interface Verdict {
  label: VerdictLabel;
  summary: string;
  notFinancialAdvice: true;
}

export interface StressTestResponse {
  missionId: string;
  ticker: string;
  benchmark: string;
  thesis: string;
  horizon: Horizon;
  riskStyle: RiskStyle;
  dataStatus: DataStatus;
  llmStatus: LlmStatus;
  verdict: Verdict;
  metrics: Metrics;
  volatilityRegime: VolatilityRegime;
  simulations: Simulations;
  quantSupportScore: QuantSupportScore;
  evidenceFor: string[];
  evidenceAgainst: string[];
  assumptionChecks: AssumptionCheck[];
  timeline: TimelineEvent[];
  normalizedSeries: NormalizedPoint[];
  drawdownSeries: DrawdownPoint[];
  methodology: string[];
  warnings: string[];
  generatedAt: string;
}

export interface PriceBar {
  date: string; // ISO yyyy-mm-dd
  close: number; // adjusted close
}
