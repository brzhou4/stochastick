// Optional LLM analysis via any OpenAI-compatible chat-completions endpoint
// (configured through the GMI_* env vars; e.g. OpenRouter).
//
// The LLM INTERPRETS and WRITES — it decomposes the user's thesis into testable
// claims, assesses each against the provided quantitative evidence, writes the
// memo prose, and explains the verdict. It never computes metrics and never
// changes the verdict LABEL, which stays formula-driven and reproducible. If the
// env vars are missing or the call fails, a deterministic analysis is used.

import type {
  Metrics,
  Simulations,
  VolatilityRegime,
  VerdictLabel,
  StressTestRequest,
  LlmStatus,
  ThesisAnalysis,
  ThesisClaim,
  ClaimAssessment,
  ForwardForecast,
  ThesisDirection,
} from "../quant/types";

const SYSTEM_PROMPT =
  "You are writing as a quantitative research analyst. You may only reason from the provided quantitative metrics, simulation outputs, forecast ensemble, and user thesis. Do not claim to have read SEC filings, earnings transcripts, news, analyst reports, insider transactions, or external documents. Do not provide buy/sell/hold recommendations. Do not invent facts. Explain uncertainty clearly. When a thesis claim depends on information not contained in the price-based metrics (e.g. product demand, sentiment, fundamentals), mark it Inconclusive and say price data cannot verify it.";

const FORBIDDEN = [
  "buy",
  "sell",
  "hold",
  "guaranteed",
  "sure thing",
  "risk-free",
  "definitely",
];

const ASSESSMENTS: ClaimAssessment[] = ["Supported", "Unsupported", "Inconclusive"];

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getLlmConfig(): LlmConfig | null {
  const apiKey = process.env.GMI_API_KEY;
  const baseUrl = process.env.GMI_BASE_URL;
  const model = process.env.GMI_MODEL;
  if (apiKey && baseUrl && model) {
    return { apiKey, baseUrl, model };
  }
  return null;
}

// Reject output that slips a forbidden recommendation word in, so we fall back.
function isClean(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  return !FORBIDDEN.some((w) => lower.includes(` ${w} `) || lower.includes(`${w}.`));
}

function buildUserPrompt(
  req: StressTestRequest,
  metrics: Metrics,
  simulations: Simulations,
  regime: VolatilityRegime,
  forecast: ForwardForecast,
  verdict: VerdictLabel,
  direction: ThesisDirection,
): string {
  const facts = {
    ticker: req.ticker,
    benchmark: req.benchmark,
    horizon: req.horizon,
    riskStyle: req.riskStyle,
    thesis: req.thesis,
    thesisStance: direction.stance,
    thesisImpliesNearTotalLoss: direction.extremeClaim,
    verdictLabel: verdict,
    thesisSupportScore: direction.thesisScore,
    metrics,
    volatilityRegime: regime,
    monteCarlo: {
      expectedReturn: simulations.expectedReturn,
      percentile5: simulations.percentile5,
      percentile50: simulations.percentile50,
      percentile95: simulations.percentile95,
      probabilityPositive: simulations.probabilityPositive,
      probabilityOutperformBenchmark: simulations.probabilityOutperformBenchmark,
    },
    forecastEnsemble: {
      models: forecast.models.map((m) => ({ name: m.name, expectedReturn: m.expectedReturn })),
      expectedReturn: forecast.expectedReturn,
      lowPrice: forecast.lowPrice,
      highPrice: forecast.highPrice,
      probabilityOutperformBenchmark: forecast.probabilityOutperformBenchmark,
      modelAgreement: forecast.modelAgreement,
    },
  };

  return [
    "Analyze the investment thesis below against the quantitative evidence.",
    `The thesis stance is "${direction.stance}"${direction.extremeClaim ? " and claims a near-total loss (price to ~zero)" : ""}. Assess support for what the thesis ACTUALLY claims — e.g. a bearish thesis is SUPPORTED by weak/declining evidence and CONTRADICTED by strong bullish evidence.`,
    `The verdict label "${verdict}" is FIXED by a formula — do not change it; explain why the evidence is consistent with it for THIS thesis direction.`,
    "Decompose the thesis into 2 to 4 specific, testable claims. Assess each ONLY from the price-based evidence provided.",
    "Allowed assessments: Supported, Unsupported, Inconclusive. Never write buy, sell, or hold.",
    "",
    `Thesis: ${req.thesis}`,
    "",
    "Quantitative facts (JSON):",
    JSON.stringify(facts, null, 2),
    "",
    "Respond with ONLY a JSON object of this exact shape:",
    `{
  "summary": "3-4 sentence institutional memo paragraph",
  "claims": [
    { "claim": "a specific claim from the thesis", "assessment": "Supported|Unsupported|Inconclusive", "rationale": "one sentence grounded in the metrics above" }
  ],
  "verdictRationale": "1-2 sentences on why the evidence is consistent with the ${verdict} verdict"
}`,
  ].join("\n");
}

function sanitizeClaims(raw: unknown): ThesisClaim[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const claims: ThesisClaim[] = [];
  for (const item of raw.slice(0, 5)) {
    const obj = item as Record<string, unknown>;
    const claim = typeof obj.claim === "string" ? obj.claim.trim() : "";
    const rationale = typeof obj.rationale === "string" ? obj.rationale.trim() : "";
    const assessment = ASSESSMENTS.includes(obj.assessment as ClaimAssessment)
      ? (obj.assessment as ClaimAssessment)
      : "Inconclusive";
    if (!claim || !rationale) continue;
    if (!isClean(claim) || !isClean(rationale)) return null;
    claims.push({ claim, assessment, rationale });
  }
  return claims.length > 0 ? claims : null;
}

export interface ThesisAnalysisResult {
  summary: string;
  analysis: ThesisAnalysis;
  status: LlmStatus;
}

// Calls the configured LLM with a hard timeout and asks for a structured thesis
// analysis. On any failure / timeout / invalid output, returns the deterministic
// fallback unchanged.
export async function analyzeThesis(
  req: StressTestRequest,
  metrics: Metrics,
  simulations: Simulations,
  regime: VolatilityRegime,
  forecast: ForwardForecast,
  verdict: VerdictLabel,
  direction: ThesisDirection,
  deterministicSummary: string,
  fallback: ThesisAnalysis,
  timeoutMs = 9000,
): Promise<ThesisAnalysisResult> {
  const config = getLlmConfig();
  if (!config) {
    return { summary: deterministicSummary, analysis: fallback, status: "missing_env" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        // Optional OpenRouter attribution headers (ignored by other providers).
        "HTTP-Referer": "https://github.com/brzhou4/thesisbreak",
        "X-Title": "Stochastick",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt(req, metrics, simulations, regime, forecast, verdict, direction),
          },
        ],
      }),
    });

    if (!res.ok) {
      return { summary: deterministicSummary, analysis: fallback, status: "error" };
    }

    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) {
      return { summary: deterministicSummary, analysis: fallback, status: "error" };
    }

    let parsed: Record<string, unknown>;
    try {
      // Be tolerant of stray prose around the JSON object.
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text);
    } catch {
      return { summary: deterministicSummary, analysis: fallback, status: "error" };
    }

    const claims = sanitizeClaims(parsed.claims);
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim() && isClean(parsed.summary)
        ? parsed.summary.trim()
        : deterministicSummary;
    const verdictRationale =
      typeof parsed.verdictRationale === "string" &&
      parsed.verdictRationale.trim() &&
      isClean(parsed.verdictRationale)
        ? parsed.verdictRationale.trim()
        : fallback.verdictRationale;

    if (!claims) {
      // Salvage the prose even if the claim list was unusable.
      return {
        summary,
        analysis: { ...fallback, verdictRationale },
        status: "used",
      };
    }

    return {
      summary,
      analysis: { claims, verdictRationale, source: "llm" },
      status: "used",
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      summary: deterministicSummary,
      analysis: fallback,
      status: aborted ? "skipped_timeout" : "error",
    };
  } finally {
    clearTimeout(timer);
  }
}

export { SYSTEM_PROMPT };
