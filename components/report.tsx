"use client";

import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  Info,
  Layers,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, VerdictBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BentoCard } from "@/components/bento-card";
import { NormalizedChart } from "@/components/charts/normalized-chart";
import { DrawdownChart } from "@/components/charts/drawdown-chart";
import { cn, formatNumber, formatPercent, formatPrice, formatTime } from "@/lib/utils";
import type { StressTestResponse } from "@/lib/quant/types";

const LLM_LABEL: Record<string, string> = {
  used: "Memo phrased by LLM",
  missing_env: "Deterministic memo (no LLM configured)",
  skipped_timeout: "Deterministic memo (LLM timed out)",
  error: "Deterministic memo (LLM unavailable)",
};

export function Report({
  data,
  onReset,
}: {
  data: StressTestResponse;
  onReset: () => void;
}) {
  const m = data.metrics;
  const s = data.simulations;
  const pt = data.priceSummary.ticker;
  const pb = data.priceSummary.benchmark;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Mission header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="tabular text-3xl font-bold tracking-tight">{data.ticker}</h1>
                <span className="tabular text-2xl font-semibold text-emerald-300">
                  {formatPrice(pt.lastClose)}
                </span>
                <span className="text-muted-foreground">vs</span>
                <span className="tabular text-xl text-muted-foreground">
                  {data.benchmark} {formatPrice(pb.lastClose)}
                </span>
                <VerdictBadge label={data.verdict.label} />
              </div>
              <div className="tabular flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {data.ticker} close on {pt.lastDate}:{" "}
                  <span className="text-foreground/80">{formatPrice(pt.lastClose)}</span>
                </span>
                <span>
                  2y range{" "}
                  <span className="text-foreground/80">
                    {formatPrice(pt.periodLow)}–{formatPrice(pt.periodHigh)}
                  </span>
                </span>
                <span>
                  period return{" "}
                  <span className={pt.periodReturn >= 0 ? "text-emerald-300" : "text-rose-300"}>
                    {formatPercent(pt.periodReturn)}
                  </span>
                </span>
              </div>
              <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                <span className="text-foreground/80">Thesis: </span>“{data.thesis}”
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge className="border-white/10 bg-white/5">{data.horizon}</Badge>
                <Badge className="border-white/10 bg-white/5">{data.riskStyle}</Badge>
                <Badge
                  className={cn(
                    "border-white/10",
                    data.dataStatus === "live"
                      ? "bg-emerald-400/10 text-emerald-300"
                      : "bg-amber-400/10 text-amber-300",
                  )}
                >
                  <Database className="h-3 w-3" />
                  {data.dataStatus === "live" ? "Live market data" : "Fallback data"}
                </Badge>
                <Badge className="border-white/10 bg-white/5">
                  <Sparkles className="h-3 w-3" />
                  {LLM_LABEL[data.llmStatus] ?? data.llmStatus}
                </Badge>
                <span className="tabular">Generated {formatTime(data.generatedAt)}</span>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={onReset}>
              <ArrowLeft className="h-4 w-4" />
              New mission
            </Button>
          </div>

          {data.dataStatus === "fallback" ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Demo fallback data used because live market data was unavailable.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Verdict summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-300" />
            Verdict — {data.verdict.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-pretty text-[15px] leading-relaxed text-foreground/90">
            {data.verdict.summary}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Research output only — not financial advice. No buy/sell/hold recommendation is implied.
          </p>
        </CardContent>
      </Card>

      {/* Bento grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <BentoCard
          className="col-span-2 lg:col-span-2 lg:row-span-2"
          title="Quant Support Score"
          value={`${data.quantSupportScore.score.toFixed(0)}/100`}
          subtitle={data.quantSupportScore.label + " — formula-based, not AI confidence"}
          colors={["#34d399", "#0ea5e9", "#10b981"]}
          delay={0.02}
          footer={
            <div className="space-y-1.5">
              {data.quantSupportScore.breakdown.slice(0, 4).map((b) => (
                <div key={b.factor} className="flex items-center justify-between gap-2">
                  <span className="truncate text-white/60">{b.factor}</span>
                  <span className="tabular text-white/80">
                    +{b.contribution.toFixed(1)}/{b.weight}
                  </span>
                </div>
              ))}
            </div>
          }
        />
        <BentoCard
          title="Sharpe Ratio"
          value={formatNumber(m.sharpeRatio)}
          subtitle={`Sortino ${formatNumber(m.sortinoRatio)}`}
          colors={["#6366f1", "#0ea5e9", "#8b5cf6"]}
          delay={0.06}
        />
        <BentoCard
          title="Max Drawdown"
          value={formatPercent(m.maxDrawdown)}
          subtitle={`Calmar ${formatNumber(m.calmarRatio)}`}
          colors={["#f43f5e", "#fb7185", "#e11d48"]}
          delay={0.1}
        />
        <BentoCard
          title="P(Outperform Benchmark)"
          value={formatPercent(s.probabilityOutperformBenchmark)}
          subtitle={`P(positive) ${formatPercent(s.probabilityPositive)}`}
          colors={["#22d3ee", "#0ea5e9", "#2dd4bf"]}
          delay={0.14}
        />
        <BentoCard
          title="Volatility Regime"
          value={data.volatilityRegime.label.replace(" Volatility", "")}
          subtitle={`${formatPercent(data.volatilityRegime.recentRealizedVolatility)} recent annualized`}
          colors={["#f59e0b", "#fbbf24", "#f97316"]}
          delay={0.18}
        />
        <BentoCard
          className="col-span-2 lg:col-span-4"
          title="Verdict"
          value={data.verdict.label}
          subtitle={`Annualized return ${formatPercent(m.annualizedReturn)} vs benchmark ${formatPercent(m.benchmarkAnnualizedReturn)} (excess ${formatPercent(m.excessReturn)})`}
          colors={
            data.verdict.label === "Supported"
              ? ["#34d399", "#10b981", "#059669"]
              : data.verdict.label === "Mixed"
                ? ["#f59e0b", "#fbbf24", "#d97706"]
                : ["#f43f5e", "#fb7185", "#e11d48"]
          }
          delay={0.22}
        />
      </div>

      {/* Quant Support Score breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-emerald-300" />
            Quant Support Score — transparent breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.quantSupportScore.breakdown.map((b) => (
            <div key={b.factor} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground/85">{b.factor}</span>
                <span className="tabular text-muted-foreground">
                  {b.contribution.toFixed(1)} / {b.weight} pts
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-400"
                  style={{ width: `${(b.contribution / b.weight) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{b.explanation}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Metrics table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-300" />
            Quant metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            <Metric label="Cumulative return" value={formatPercent(m.cumulativeReturn)} />
            <Metric label="Annualized return" value={formatPercent(m.annualizedReturn)} />
            <Metric label="Benchmark ann. return" value={formatPercent(m.benchmarkAnnualizedReturn)} />
            <Metric label="Excess return" value={formatPercent(m.excessReturn)} />
            <Metric label="Annualized volatility" value={formatPercent(m.annualizedVolatility)} />
            <Metric label="Downside deviation" value={formatPercent(m.downsideDeviation)} />
            <Metric label="Sharpe ratio" value={formatNumber(m.sharpeRatio)} />
            <Metric label="Sortino ratio" value={formatNumber(m.sortinoRatio)} />
            <Metric label="Calmar ratio" value={formatNumber(m.calmarRatio)} />
            <Metric label="Treynor ratio" value={formatNumber(m.treynorRatio)} />
            <Metric label="Max drawdown" value={formatPercent(m.maxDrawdown)} />
            <Metric label="Average drawdown" value={formatPercent(m.averageDrawdown)} />
            <Metric label="Beta to benchmark" value={formatNumber(m.betaToBenchmark)} />
            <Metric label="Correlation" value={formatNumber(m.correlationToBenchmark)} />
            <Metric label="Alpha vs benchmark" value={formatPercent(m.alphaVsBenchmark)} />
            <Metric label="Tracking error" value={formatPercent(m.trackingError)} />
            <Metric label="Information ratio" value={formatNumber(m.informationRatio)} />
            <Metric label="95% Value at Risk (1d)" value={formatPercent(m.valueAtRisk95)} />
            <Metric label="95% Expected Shortfall" value={formatPercent(m.expectedShortfall95)} />
            <Metric label="Skewness" value={formatNumber(m.skewness)} />
            <Metric label="Excess kurtosis" value={formatNumber(m.kurtosis)} />
          </div>
        </CardContent>
      </Card>

      {/* Simulation scenarios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-300" />
            Stochastic simulation — {s.model} ({s.paths.toLocaleString()} paths)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Scenario
              label="Tail risk (1st pct)"
              ret={s.percentile1}
              price={s.tailRiskEndingPrice}
              tone="danger"
            />
            <Scenario
              label="Bear (5th pct)"
              ret={s.percentile5}
              price={s.bearCaseEndingPrice}
              tone="warn"
            />
            <Scenario
              label="Base (median)"
              ret={s.percentile50}
              price={s.baseCaseEndingPrice}
              tone="neutral"
            />
            <Scenario
              label="Bull (95th pct)"
              ret={s.percentile95}
              price={s.bullCaseEndingPrice}
              tone="good"
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Metric label="Expected return" value={formatPercent(s.expectedReturn)} />
            <Metric label="P(positive)" value={formatPercent(s.probabilityPositive)} />
            <Metric label="P(beat benchmark)" value={formatPercent(s.probabilityOutperformBenchmark)} />
          </div>
        </CardContent>
      </Card>

      {/* Forward predictions — multi-model ensemble */}
      <ForecastSection data={data} />

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Normalized price vs benchmark (start = 100)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Both indexed to 100 at the window start for comparison — hover any point for the real
              dollar close.
            </p>
          </CardHeader>
          <CardContent>
            <NormalizedChart
              data={data.normalizedSeries}
              ticker={data.ticker}
              benchmark={data.benchmark}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-rose-400" />
              {data.ticker} drawdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DrawdownChart data={data.drawdownSeries} />
          </CardContent>
        </Card>
      </div>

      {/* Evidence */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EvidenceCard
          title="Evidence for the thesis"
          icon={<ThumbsUp className="h-4 w-4 text-emerald-300" />}
          items={data.evidenceFor}
          tone="for"
          empty="No supporting evidence met the quantitative thresholds."
        />
        <EvidenceCard
          title="Evidence against the thesis"
          icon={<ThumbsDown className="h-4 w-4 text-rose-300" />}
          items={data.evidenceAgainst}
          tone="against"
          empty="No contradicting evidence met the quantitative thresholds."
        />
      </div>

      {/* Assumption checks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            Assumption checks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.assumptionChecks.map((c) => (
            <div key={c.assumption} className="flex items-start gap-3">
              {c.status === "Pass" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : c.status === "Warning" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              )}
              <div>
                <p className="text-sm text-foreground/85">
                  {c.assumption}{" "}
                  <span
                    className={cn(
                      "ml-1 text-xs",
                      c.status === "Pass"
                        ? "text-emerald-400"
                        : c.status === "Warning"
                          ? "text-amber-400"
                          : "text-rose-400",
                    )}
                  >
                    [{c.status}]
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{c.explanation}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Warnings */}
      {data.warnings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm text-amber-200/90">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                  {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Methodology */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-sky-300" />
            Methodology
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground">
            {data.methodology.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="tabular text-emerald-400/70">{String(i + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Compliance footer */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-2 font-medium text-foreground/70">Compliance</p>
        <p>
          Research output only. Not financial advice. No trade execution. Historical performance does
          not guarantee future results. Simulations are model-conditioned and uncertain. ThesisBreak
          reasons only from computed price-based metrics and stochastic simulations — it does not read
          SEC filings, earnings transcripts, news, or analyst reports, and never issues buy, sell, or
          hold recommendations.
        </p>
      </div>
    </motion.div>
  );
}

function ForecastSection({ data }: { data: StressTestResponse }) {
  const f = data.forecast;
  // Map the 5th–95th percentile band onto a 0-100% bar; place median + expected.
  const lo = f.percentile5;
  const hi = f.percentile95;
  const span = hi - lo || 1;
  const posOf = (x: number) => Math.max(0, Math.min(100, ((x - lo) / span) * 100));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-emerald-300" />
          Forward predictions — {f.models.length}-model ensemble
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {f.totalPaths.toLocaleString()} simulated paths over {data.horizon.toLowerCase()} ·
          probability-weighted distribution, not a single price target.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Ensemble headline */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <BentoLikeStat
            label="Expected price"
            value={formatPrice(f.expectedPrice)}
            sub={`from ${formatPrice(f.startPrice)} (${formatPercent(f.expectedReturn)})`}
            accent="emerald"
          />
          <BentoLikeStat
            label="90% range"
            value={`${formatPrice(f.lowPrice)} – ${formatPrice(f.highPrice)}`}
            sub={`${formatPercent(f.percentile5)} to ${formatPercent(f.percentile95)}`}
            accent="slate"
          />
          <BentoLikeStat
            label="P(positive)"
            value={formatPercent(f.probabilityPositive)}
            sub={`median ${formatPercent(f.medianReturn)}`}
            accent="sky"
          />
          <BentoLikeStat
            label="P(beat benchmark)"
            value={formatPercent(f.probabilityOutperformBenchmark)}
            sub={`model agreement ${formatPercent(f.modelAgreement)}`}
            accent="amber"
          />
        </div>

        {/* Distribution band */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Bear · {formatPercent(f.percentile5)}</span>
            <span>Ensemble forward return distribution</span>
            <span>Bull · {formatPercent(f.percentile95)}</span>
          </div>
          <div className="relative h-3 w-full rounded-full bg-gradient-to-r from-rose-500/40 via-white/10 to-emerald-500/40">
            <Marker pos={posOf(f.percentile25)} label="25th" />
            <Marker pos={posOf(f.percentile50)} label="median" strong />
            <Marker pos={posOf(f.percentile75)} label="75th" />
          </div>
          <div className="mt-6 flex justify-between text-[11px] text-muted-foreground">
            <span className="tabular">{formatPrice(f.lowPrice)}</span>
            <span className="tabular">{formatPrice(f.expectedPrice)} expected</span>
            <span className="tabular">{formatPrice(f.highPrice)}</span>
          </div>
        </div>

        {/* Per-model table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Model</th>
                <th className="py-2 pr-3 font-medium">Pedigree</th>
                <th className="py-2 pr-3 text-right font-medium">Exp. return</th>
                <th className="py-2 pr-3 text-right font-medium">Vol forecast</th>
                <th className="py-2 text-right font-medium">P(up)</th>
              </tr>
            </thead>
            <tbody>
              {f.models.map((m) => (
                <tr key={m.name} className="border-b border-white/5">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-foreground/90">{m.name}</div>
                    <div className="text-xs text-muted-foreground">{m.kind}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{m.author}</td>
                  <td
                    className={cn(
                      "tabular py-2 pr-3 text-right",
                      m.expectedReturn >= 0 ? "text-emerald-300" : "text-rose-300",
                    )}
                  >
                    {formatPercent(m.expectedReturn)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-muted-foreground">
                    {formatPercent(m.annualizedVolForecast)}
                  </td>
                  <td className="tabular py-2 text-right text-muted-foreground">
                    {formatPercent(m.probabilityPositive)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-muted-foreground">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
          {f.disclaimer}
        </div>
      </CardContent>
    </Card>
  );
}

function Marker({ pos, label, strong }: { pos: number; label: string; strong?: boolean }) {
  return (
    <div className="absolute -top-0.5 flex flex-col items-center" style={{ left: `${pos}%` }}>
      <div
        className={cn(
          "h-4 w-0.5 -translate-x-1/2 rounded",
          strong ? "bg-emerald-300" : "bg-white/50",
        )}
      />
      <span
        className={cn(
          "mt-1 -translate-x-1/2 whitespace-nowrap text-[10px]",
          strong ? "text-emerald-300" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function BentoLikeStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "emerald" | "slate" | "sky" | "amber";
}) {
  const ring = {
    emerald: "border-emerald-400/25",
    slate: "border-white/10",
    sky: "border-sky-400/25",
    amber: "border-amber-400/25",
  }[accent];
  return (
    <div className={cn("rounded-xl border bg-white/[0.03] p-4", ring)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-base font-medium text-foreground">{value}</p>
    </div>
  );
}

function Scenario({
  label,
  ret,
  price,
  tone,
}: {
  label: string;
  ret: number;
  price: number;
  tone: "danger" | "warn" | "neutral" | "good";
}) {
  const toneClass = {
    danger: "border-rose-500/30 bg-rose-500/5",
    warn: "border-amber-500/30 bg-amber-500/5",
    neutral: "border-white/10 bg-white/[0.03]",
    good: "border-emerald-500/30 bg-emerald-500/5",
  }[tone];
  return (
    <div className={cn("rounded-xl border p-4", toneClass)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold">{formatPercent(ret)}</p>
      <p className="tabular text-xs text-muted-foreground">→ {formatPrice(price)}</p>
    </div>
  );
}

function EvidenceCard({
  title,
  icon,
  items,
  tone,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  tone: "for" | "against";
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-foreground/85">
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    tone === "for" ? "bg-emerald-400" : "bg-rose-400",
                  )}
                />
                {item}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
