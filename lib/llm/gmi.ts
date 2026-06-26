// Optional LLM phrasing via a GMI-compatible chat-completions endpoint.
//
// The LLM is used ONLY to interpret and re-phrase the verdict summary. It never
// touches the math, the metrics, or the verdict label. If the GMI env vars are
// missing the caller uses the deterministic rule-based summary instead.

import type {
  Metrics,
  Simulations,
  VolatilityRegime,
  VerdictLabel,
  StressTestRequest,
} from "../quant/types";
import type { LlmStatus } from "../quant/types";

const SYSTEM_PROMPT =
  "You are writing as a quantitative research analyst. You may only reason from the provided quantitative metrics, simulation outputs, and user thesis. Do not claim to have read SEC filings, earnings transcripts, news, analyst reports, insider transactions, or external documents. Do not provide buy/sell/hold recommendations. Do not invent facts. Explain uncertainty clearly.";

const FORBIDDEN = [
  "buy",
  "sell",
  "hold",
  "guaranteed",
  "sure thing",
  "risk-free",
  "definitely",
];

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

// Reject any output that slips a forbidden recommendation word in, so the
// deterministic memo is used instead.
function isClean(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  return !FORBIDDEN.some((w) => lower.includes(` ${w} `) || lower.includes(`${w}.`));
}

function buildUserPrompt(
  req: StressTestRequest,
  metrics: Metrics,
  simulations: Simulations,
  regime: VolatilityRegime,
  verdict: VerdictLabel,
  score: number,
  deterministicSummary: string,
): string {
  const facts = {
    ticker: req.ticker,
    benchmark: req.benchmark,
    horizon: req.horizon,
    riskStyle: req.riskStyle,
    thesis: req.thesis,
    verdictLabel: verdict,
    quantSupportScore: score,
    metrics,
    volatilityRegime: regime,
    simulations: {
      expectedReturn: simulations.expectedReturn,
      percentile5: simulations.percentile5,
      percentile50: simulations.percentile50,
      percentile95: simulations.percentile95,
      probabilityPositive: simulations.probabilityPositive,
      probabilityOutperformBenchmark: simulations.probabilityOutperformBenchmark,
    },
  };
  return [
    "Write a concise 3-4 sentence institutional research memo summary that stress-tests the thesis below.",
    "Use ONLY these quantitative facts. The verdict label is fixed; do not change it.",
    `Allowed verdict vocabulary: Supported, Mixed, Weak, Contradicted. Never write buy, sell, or hold.`,
    "",
    `Thesis: ${req.thesis}`,
    "",
    "Quantitative facts (JSON):",
    JSON.stringify(facts, null, 2),
    "",
    "Reference deterministic summary (you may improve the prose, keep the meaning):",
    deterministicSummary,
  ].join("\n");
}

// Calls the GMI endpoint with a hard timeout. Returns the phrased summary plus
// status. On any failure / timeout / unclean output, returns the fallback.
export async function phraseSummary(
  req: StressTestRequest,
  metrics: Metrics,
  simulations: Simulations,
  regime: VolatilityRegime,
  verdict: VerdictLabel,
  score: number,
  deterministicSummary: string,
  timeoutMs = 8000,
): Promise<{ summary: string; status: LlmStatus }> {
  const config = getLlmConfig();
  if (!config) {
    return { summary: deterministicSummary, status: "missing_env" };
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
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt(
              req,
              metrics,
              simulations,
              regime,
              verdict,
              score,
              deterministicSummary,
            ),
          },
        ],
      }),
    });

    if (!res.ok) {
      return { summary: deterministicSummary, status: "error" };
    }
    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (text && text.trim().length > 0 && isClean(text)) {
      return { summary: text.trim(), status: "used" };
    }
    return { summary: deterministicSummary, status: "error" };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      summary: deterministicSummary,
      status: aborted ? "skipped_timeout" : "error",
    };
  } finally {
    clearTimeout(timer);
  }
}

export { SYSTEM_PROMPT };
