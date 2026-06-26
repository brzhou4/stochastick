# Stochastick

**An autonomous quant research worker that stress-tests an investment thesis before the market does.**

Built for *Agents for Hire* — Workflow & Operations Agents track. You assign the work, the AI performs the work, you review the completed work. This is not a chatbot for stocks; it is a single, focused quantitative research analyst you hire for one job: **the Investment Thesis Stress-Test Mission.** It does in seconds what a junior analyst bills hours for.

**Marketplace-ready:** ships with a `Dockerfile` and Next.js standalone output for one-command deployment on AgentBox, and uses GMI Cloud's single-key, 200+-model API for its interpretation layer.

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

## Deploy (AgentBox / Docker)

```bash
docker build -t stochastick .
docker run -p 3000:3000 --env-file .env stochastick
```

The app builds to a Next.js **standalone** server (`output: "standalone"`), so the
image is small and has zero idle cost — list it on AgentBox and it's hireable the
moment you publish. No database, no login, no paid market-data dependency.

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
- **Data is honest.** Live data is fetched in priority order: **Twelve Data** (free keyed API, recommended), then **Yahoo Finance** (anonymous, with cookie+crumb fallback), then **Stooq** CSV. The anonymous sources get IP-rate-limited on shared/corporate/VPN networks, so set `TWELVE_DATA_API_KEY` (free, no card — https://twelvedata.com) for reliable live data. If every source fails, the worker uses clearly-labelled deterministic fallback data for NVDA, TSLA, AAPL, MSFT, AMD, SPY (`dataStatus: "fallback"`). It never passes fake data off as live.
- **The LLM interprets, the math decides.** If `GMI_API_KEY` / `GMI_BASE_URL` / `GMI_MODEL` are set (any OpenAI-compatible endpoint, e.g. OpenRouter), the LLM decomposes the thesis into testable claims, assesses each against the quantitative evidence (`Supported` / `Unsupported` / `Inconclusive` — it marks fundamentals it can't verify from price data as `Inconclusive`), writes the memo, and explains the verdict. It **never** computes a metric or changes the formula-driven verdict label, and a forbidden-word guard + hard timeout protect against bad output. With no env vars, a deterministic claim-by-claim analysis is used instead.

## What it computes

Log/simple returns, cumulative & annualized return, annualized volatility, downside deviation, Sharpe, Sortino, Calmar, Treynor, max & average drawdown, beta, correlation, CAPM alpha, tracking error, information ratio, historical 95% VaR & Expected Shortfall, skewness, excess kurtosis, a 20d-vs-252d volatility-regime classification, and a **Geometric Brownian Motion** forward simulation (≥10,000 seeded paths) for both the ticker and the benchmark to estimate the probability of outperformance.

The **Quant Support Score (0–100)** is a fixed, fully transparent weighted formula over those metrics — *not* a model confidence number. Each factor's weight, contribution, and explanation are returned in the response.

## Forward forecasting (multi-model ensemble)

Rather than predict a single price, ThesisBreak estimates the **distribution** of forward outcomes using eight established models spanning stochastic calculus, time-series econometrics and machine learning, then pools them into an ensemble (`lib/quant/forecast.ts`):

| Model | Family | Pedigree | Captures |
|---|---|---|---|
| Geometric Brownian Motion | Stochastic calculus (SDE) | Black–Scholes–Merton | Lognormal baseline, constant vol |
| Student-t Monte Carlo | Fat-tailed diffusion | Gosset ("Student") | Fat tails (df calibrated to sample kurtosis) |
| GARCH(1,1) | Stochastic volatility | Engle & Bollerslev | Vol clustering; starts from current conditional vol |
| Merton Jump-Diffusion | Jump SDE | Robert Merton | Poisson jumps for crashes/gaps |
| Ornstein–Uhlenbeck (Vasicek) | Mean-reverting SDE (Itô) | Uhlenbeck–Ornstein | Mean reversion of detrended log price |
| ARIMA / ARMA | Time-series | Box & Jenkins | Return autocorrelation (Hannan–Rissanen fit) |
| Neural network (MLP) | Machine learning | Backprop (Rumelhart et al.) | Nonlinear structure; trained by gradient descent |
| Historical bootstrap | Non-parametric | Efron | Real return distribution, no assumptions |

The ARIMA fit, GARCH MLE, OU calibration and the MLP's weights are all computed from the data; the neural net is a real 5-lag → 8-unit tanh network trained with backpropagation (pure TypeScript, no ML dependency). The ensemble reports expected/median price, a 5–95% range, P(positive), P(beat benchmark), and cross-model agreement — all deterministically seeded. These are **model-conditioned distributions, not predictions of the actual future price.**

## Compliance

Research output only. **Not financial advice.** No trade execution. Historical performance does not guarantee future results; simulations are model-conditioned and uncertain. ThesisBreak reasons only from price-based metrics and simulations — it does not read SEC filings, earnings, news, or analyst reports, and never issues buy / sell / hold recommendations.
