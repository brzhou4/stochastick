# ThesisBreak

**An autonomous quant research worker that stress-tests an investment thesis before the market does.**

Built for *Agents for Hire* — Workflow & Operations Agents track. You assign the work, the AI performs the work, you review the completed work. This is not a chatbot for stocks; it is a single, focused quantitative research analyst you hire for one job: **the Investment Thesis Stress-Test Mission.**

Give it a ticker, a benchmark, a thesis, a horizon, and a risk style. It tries to *prove the thesis wrong* using quantitative evidence and returns an institutional-style research memo: real computed metrics, a 10,000-path stochastic simulation, risk analysis, evidence for and against, and a verdict.

## Quick start

```bash
npm install
cp .env.example .env   # optional — configure RISK_FREE_RATE / GMI_* if you have them
npm run dev            # http://localhost:3000
```

Other scripts:

```bash
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm test            # vitest (quant engine + API integration)
```

## How it works

```
app/page.tsx ──▶ POST /api/stress-test ──▶ lib/quant/analyze.ts
                                              ├─ lib/market/data.ts   (Yahoo live → deterministic fallback)
                                              ├─ lib/quant/returns.ts, risk.ts, drawdown.ts, regression.ts
                                              ├─ lib/quant/simulations.ts  (seeded GBM, ≥10k paths)
                                              ├─ lib/quant/scoring.ts      (transparent weighted score)
                                              ├─ lib/quant/report.ts       (deterministic evidence + memo)
                                              └─ lib/llm/gmi.ts            (optional phrasing only)
```

- **Math never lives in React.** Every metric is computed in `/lib/quant/*` from daily price data.
- **Deterministic everywhere.** Simulations and fallback data use seeded PRNGs, so the demo and tests are stable.
- **Data is honest.** Live data comes from `yahoo-finance2`. If it fails, the worker uses clearly-labelled deterministic fallback data for NVDA, TSLA, AAPL, MSFT, AMD, SPY (`dataStatus: "fallback"`). It never passes fake data off as live.
- **The LLM only writes prose.** If `GMI_API_KEY` / `GMI_BASE_URL` / `GMI_MODEL` are set, a GMI-compatible endpoint re-phrases the memo summary (with a hard timeout and forbidden-word guard). It never touches the numbers or the verdict. With no env vars, the deterministic memo is used.

## What it computes

Log/simple returns, cumulative & annualized return, annualized volatility, downside deviation, Sharpe, Sortino, Calmar, Treynor, max & average drawdown, beta, correlation, CAPM alpha, tracking error, information ratio, historical 95% VaR & Expected Shortfall, skewness, excess kurtosis, a 20d-vs-252d volatility-regime classification, and a **Geometric Brownian Motion** forward simulation (≥10,000 seeded paths) for both the ticker and the benchmark to estimate the probability of outperformance.

The **Quant Support Score (0–100)** is a fixed, fully transparent weighted formula over those metrics — *not* a model confidence number. Each factor's weight, contribution, and explanation are returned in the response.

## Compliance

Research output only. **Not financial advice.** No trade execution. Historical performance does not guarantee future results; simulations are model-conditioned and uncertain. ThesisBreak reasons only from price-based metrics and simulations — it does not read SEC filings, earnings, news, or analyst reports, and never issues buy / sell / hold recommendations.
