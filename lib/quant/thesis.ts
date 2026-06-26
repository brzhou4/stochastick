// Thesis interpretation and verdict orientation.
//
// The Quant Support Score measures BULLISH / long evidence (is the stock likely
// to rise and outperform?). A thesis, however, can claim many things, so the
// verdict must measure support for what the thesis ACTUALLY says. We handle two
// kinds of claim:
//
//   1. THRESHOLD claims ("price greater than $250", "above $0", "falls to $100",
//      "goes to zero"). We parse the comparator + price and compute the model
//      probability the terminal price satisfies it (lognormal / GBM). The thesis
//      score is that probability. This makes "price > $0" ≈ 100% (Supported) and
//      "price -> $0" ≈ 0% (Contradicted) fall out of the SAME mechanism.
//
//   2. DIRECTIONAL claims ("X outperforms / declines / underperforms Y"). We
//      detect stance from wording and orient the long-evidence score:
//      bullish -> score, bearish -> 100 - score.
//
// Everything is deterministic and reproducible.

import { mean, standardDeviation } from "./returns";
import type { ThesisStance, ThesisDirection } from "./types";

// ---- Normal CDF (Abramowitz–Stegun erf) ------------------------------------

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// ---- Word-based directional detection (fallback for non-threshold theses) --

const BEARISH: RegExp[] = [
  /\bfall(s|ing|en)?\b/, /\bdrop(s|ping|ped)?\b/, /\bdeclin(e|es|ing|ed)\b/, /\bcrash(es|ing|ed)?\b/,
  /\bcollapse/, /\bplunge/, /\bplummet/, /\bsink(s|ing)?\b/, /\btank(s|ing)?\b/, /\btumble/,
  /\bunderperform/, /\blag(s|ging)?\b/, /\bbear(ish)?\b/, /\bdownside\b/, /\bsell.?off\b/,
  /\bshort\b/, /\blose(s)?\b/, /\bloss(es)?\b/, /\bweaken/, /\bdeteriorate/, /\bhalve\b/,
  /\bcrater/, /\bdump/, /\bgo(es)? down\b/, /\bdownturn\b/, /\bslump/, /\bnose.?dive\b/,
];

const BULLISH: RegExp[] = [
  /\bris(e|es|en|ing)\b/, /\bgrow(s|ing|th)?\b/, /\boutperform/, /\boutpace/, /\bbeat(s|ing)?\b/,
  /\bsurge/, /\brally/, /\bgain(s|ing)?\b/, /\bclimb/, /\bsoar/, /\bmoon\b/, /\bbull(ish)?\b/,
  /\bupside\b/, /\bappreciate/, /\bincrease/, /\bdouble/, /\btriple/, /\bhigher\b/,
  /\ball.?time high\b/, /\bstrong(er)?\b/, /\brun.?up\b/, /\bgo(es)? up\b/, /\bbreak ?out\b/,
  /\bpositive\b/, /\bup(side|trend)?\b/,
];

// Word-level "total loss" concept (no numeric threshold): worthless, bankrupt,
// or "to/at/become zero". "zero growth" etc. is excluded by requiring a price verb.
const EXTREME_PHRASE =
  /\b(worthless|bankrupt(cy)?|goes? bust|lose everything|wiped? out|100\s?%?\s?(loss|down))\b|\b(to|at|reach(?:es)?|become[s]?|worth|hits?|drops? to|falls? to|go(?:es)? to)\s+zero\b/;
const NEGATION = /\b(not|never|no longer|won'?t|will not|cannot|can'?t|doesn'?t|won ?t|without|avoid)\b/;

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) if (re.test(text)) n++;
  return n;
}

export interface ThesisDetection {
  stance: ThesisStance;
  extremeClaim: boolean;
  bullishHits: number;
  bearishHits: number;
}

// Word-based stance detection used when there is no explicit price threshold.
export function detectThesis(thesis: string): ThesisDetection {
  const text = ` ${thesis.toLowerCase()} `;
  const negated = NEGATION.test(text);
  // "won't go bankrupt" / "will not collapse" reads bullish, not extreme.
  const extremeClaim = EXTREME_PHRASE.test(text) && !negated;

  let bullishHits = countMatches(text, BULLISH);
  let bearishHits = countMatches(text, BEARISH);

  // A negated bearish thesis ("will not fall / won't decline") flips bullish.
  if (negated && bearishHits > 0 && bullishHits === 0) {
    bullishHits += bearishHits;
    bearishHits = 0;
  }

  let stance: ThesisStance;
  if (extremeClaim) stance = "bearish";
  else if (bearishHits > bullishHits) stance = "bearish";
  else if (bullishHits > bearishHits) stance = "bullish";
  else stance = "neutral";

  return { stance, extremeClaim, bullishHits, bearishHits };
}

// ---- Threshold-claim parsing -----------------------------------------------

interface ThresholdClaim {
  type: "above" | "below" | "reach";
  value: number;
}

// Matches a price after a comparator, tolerating "$250", "250$", "1,000".
const ABOVE_RE =
  /(?:greater than|more than|larger than|higher than|at least|no less than|above|over|exceeds?|surpass(?:es)?|north of|stays? above|remains? above|holds? above|tops?)\s*\$?\s*([\d,]+(?:\.\d+)?)/;
const BELOW_RE =
  /(?:less than|lower than|smaller than|no more than|at most|below|under(?:neath)?|beneath|south of|stays? below|drops? below|falls? below|dips? below)\s*\$?\s*([\d,]+(?:\.\d+)?)/;
const REACH_RE =
  /(?:reach(?:es)?|hits?|becomes?|go(?:es)? to|gets? to|rise(?:s)? to|climb(?:s)? to|fall(?:s)? to|drops? to|down to|up to|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*\$?/;

function parseThreshold(thesis: string): ThresholdClaim | null {
  const text = thesis.toLowerCase().replace(/,(?=\d)/g, ""); // strip thousands commas
  const a = ABOVE_RE.exec(text);
  if (a) return { type: "above", value: Number(a[1].replace(/,/g, "")) };
  const b = BELOW_RE.exec(text);
  if (b) return { type: "below", value: Number(b[1].replace(/,/g, "")) };
  const r = REACH_RE.exec(text);
  if (r) return { type: "reach", value: Number(r[1].replace(/,/g, "")) };
  return null;
}

// ---- Probabilities under a lognormal (GBM) terminal distribution -----------

interface Lognormal {
  muH: number; // mean of terminal log return
  sigmaH: number; // std of terminal log return
}

function terminalParams(logRets: number[], horizonDays: number): Lognormal {
  return {
    muH: mean(logRets) * horizonDays,
    sigmaH: standardDeviation(logRets) * Math.sqrt(horizonDays),
  };
}

// P(terminal price > K).
function probAbove(startPrice: number, ln: Lognormal, K: number): number {
  if (K <= 0) return 1; // a positive-price stock is always > 0
  if (ln.sigmaH <= 0) return startPrice > K ? 1 : 0;
  const z = (Math.log(K / startPrice) - ln.muH) / ln.sigmaH;
  return 1 - normCdf(z);
}

// P(terminal price < K).
function probBelow(startPrice: number, ln: Lognormal, K: number): number {
  if (K <= 0) return 0; // lognormal price never reaches 0 or below
  return 1 - probAbove(startPrice, ln, K);
}

// "goes to zero / near-total loss" — P(price loses >= (1 - threshold) of value).
export function ruinProbability(
  logRets: number[],
  horizonDays: number,
  threshold = 0.05,
): number {
  const ln = terminalParams(logRets, horizonDays);
  if (ln.sigmaH <= 0) return 0;
  const z = (Math.log(threshold) - ln.muH) / ln.sigmaH;
  return Math.max(0, Math.min(1, normCdf(z)));
}

// ---- Public entry point ----------------------------------------------------

const NEAR_ZERO_FRACTION = 0.1; // a target below 10% of current price ≈ "to zero"

export function interpretThesis(
  thesis: string,
  startPrice: number,
  logRets: number[],
  horizonDays: number,
  bullishScore: number,
  ticker: string,
  benchmark: string,
): ThesisDirection {
  const ln = terminalParams(logRets, horizonDays);
  const claim = parseThreshold(thesis);

  // 1. Explicit threshold claim → probability the price condition holds.
  if (claim) {
    let comparator: "above" | "below";
    let probability: number;

    if (claim.type === "above") {
      comparator = "above";
      probability = probAbove(startPrice, ln, claim.value);
    } else if (claim.type === "below") {
      comparator = "below";
      probability = probBelow(startPrice, ln, claim.value);
    } else {
      // "reach $X": treat as moving up to X if above current, else down to X.
      if (claim.value >= startPrice) {
        comparator = "above";
        probability = probAbove(startPrice, ln, claim.value);
      } else {
        comparator = "below";
        probability = probBelow(startPrice, ln, claim.value);
      }
    }

    const extremeClaim = comparator === "below" && claim.value <= NEAR_ZERO_FRACTION * startPrice;
    const stance: ThesisStance = comparator === "above" ? "bullish" : "bearish";
    const thesisScore = Math.max(0, Math.min(100, probability * 100));

    const target =
      claim.value <= 0
        ? "$0"
        : `$${claim.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    const note = extremeClaim
      ? `Thesis implies ${ticker} falls to ≈${target} (a near-total loss). The model assigns ≈${thesisScore.toFixed(1)}% probability to that over the horizon.`
      : `Threshold claim: P(${ticker} ${comparator} ${target} at horizon) ≈ ${thesisScore.toFixed(1)}% under the model. ${
          claim.value <= 0 && comparator === "above"
            ? "A positive share price is essentially certain, so the claim is strongly supported."
            : ""
        }`.trim();

    return { stance, extremeClaim, thesisScore: Number(thesisScore.toFixed(1)), note };
  }

  // 2a. "Survival" claim — a negated total-loss thesis ("won't go bankrupt",
  // "will not go to zero"). Support = probability the stock does NOT lose ~all
  // value, which is essentially certain → strongly supported.
  const lower = ` ${thesis.toLowerCase()} `;
  if (EXTREME_PHRASE.test(lower) && NEGATION.test(lower)) {
    const survival = (1 - ruinProbability(logRets, horizonDays)) * 100;
    return {
      stance: "bullish",
      extremeClaim: false,
      thesisScore: Number(Math.max(0, Math.min(100, survival)).toFixed(1)),
      note: `Survival thesis: the model puts ≈${survival.toFixed(1)}% probability on ${ticker} avoiding a near-total loss over the horizon, so the claim is strongly supported.`,
    };
  }

  // 2b. No threshold → directional word detection, oriented against long evidence.
  const detection = detectThesis(thesis);
  let thesisScore = bullishScore;
  let note: string;

  if (detection.extremeClaim) {
    const pRuin = ruinProbability(logRets, horizonDays);
    thesisScore = pRuin * 100;
    note = `Thesis implies ${ticker} becomes worthless. The model assigns ≈${thesisScore.toFixed(1)}% probability to a 95%+ loss, so the evidence contradicts it.`;
  } else if (detection.stance === "bearish") {
    thesisScore = 100 - bullishScore;
    note = `Bearish thesis: strong long-side evidence (${bullishScore.toFixed(0)}/100) counts against it.`;
  } else if (detection.stance === "neutral") {
    note = `Direction unclear; scored as a relative-performance thesis (${ticker} vs ${benchmark}).`;
  } else {
    note = `Bullish thesis: evidence assessed for ${ticker} upside / outperformance.`;
  }

  return {
    stance: detection.extremeClaim ? "bearish" : detection.stance,
    extremeClaim: detection.extremeClaim,
    thesisScore: Number(Math.max(0, Math.min(100, thesisScore)).toFixed(1)),
    note,
  };
}
