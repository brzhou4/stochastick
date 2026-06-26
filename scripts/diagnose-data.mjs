// Standalone market-data diagnostic. Run on YOUR machine:
//   node scripts/diagnose-data.mjs
// It prints exactly what each live data source returns so we can see why a
// stress test falls back to demo data. No dependencies, no app code needed.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function line(label, value) {
  console.log(label.padEnd(34), value);
}

console.log("\n=== ThesisBreak data diagnostic ===");
line("Node version:", process.version);
line("global fetch:", typeof fetch);

async function tryFetch(label, url, init) {
  try {
    const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init?.headers ?? {}) } });
    return res;
  } catch (e) {
    line(label + " ERROR:", `${e.name}: ${e.message}`);
    return null;
  }
}

// 1. Anonymous Yahoo chart (the simplest path)
console.log("\n[1] Yahoo chart, anonymous (no cookie/crumb)");
{
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=2y&interval=1d&includeAdjustedClose=true";
  const res = await tryFetch("  anon chart", url, { headers: { Accept: "application/json" } });
  if (res) {
    line("  HTTP status:", res.status);
    if (res.ok) {
      const j = await res.json();
      const pts = j?.chart?.result?.[0]?.timestamp?.length ?? 0;
      line("  data points:", pts);
      const adj = j?.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose;
      if (adj?.length) line("  last close:", "$" + adj[adj.length - 1].toFixed(2));
    } else {
      const body = await res.text();
      line("  body (first 120):", JSON.stringify(body.slice(0, 120)));
    }
  }
}

// 2. Cookie + crumb flow
console.log("\n[2] Yahoo cookie + crumb flow");
let cookie = "";
for (const u of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
  const res = await tryFetch("  cookie page", u, { headers: { Accept: "text/html" }, redirect: "manual" });
  if (!res) continue;
  const hasGetSetCookie = typeof res.headers.getSetCookie === "function";
  const sc = hasGetSetCookie ? res.headers.getSetCookie() : [];
  line(`  ${u}`, `HTTP ${res.status}, getSetCookie:${hasGetSetCookie}, cookies:${sc.length}`);
  cookie = sc.map((c) => c.split(";")[0]).join("; ");
  if (cookie) break;
}
line("  cookie obtained:", cookie ? cookie.slice(0, 40) + "…" : "(none)");
if (cookie) {
  const res = await tryFetch("  getcrumb", "https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { Cookie: cookie, Accept: "text/plain" },
  });
  if (res) {
    const crumb = (await res.text()).trim();
    line("  crumb HTTP:", res.status);
    line("  crumb value:", JSON.stringify(crumb.slice(0, 32)));
    if (res.ok && crumb && crumb.length <= 64) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=2y&interval=1d&includeAdjustedClose=true&crumb=${encodeURIComponent(crumb)}`;
      const c2 = await tryFetch("  chart+crumb", url, {
        headers: { Cookie: cookie, Accept: "application/json" },
      });
      if (c2) {
        line("  chart+crumb HTTP:", c2.status);
        if (c2.ok) {
          const j = await c2.json();
          line("  data points:", j?.chart?.result?.[0]?.timestamp?.length ?? 0);
        }
      }
    }
  }
}

// 3. Stooq CSV
console.log("\n[3] Stooq CSV");
{
  const res = await tryFetch("  stooq", "https://stooq.com/q/d/l/?s=nvda.us&i=d", {
    headers: { Accept: "text/csv" },
  });
  if (res) {
    const text = await res.text();
    line("  HTTP status:", res.status);
    line("  starts with 'Date':", text.startsWith("Date"));
    line("  body (first 80):", JSON.stringify(text.slice(0, 80)));
    if (text.startsWith("Date")) line("  rows:", text.trim().split("\n").length - 1);
  }
}

// 4. Twelve Data (keyed) — the recommended source for blocked networks.
console.log("\n[4] Twelve Data (keyed)");
{
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) {
    line("  TWELVE_DATA_API_KEY:", "(not set — get a free key at https://twelvedata.com)");
  } else {
    const url = `https://api.twelvedata.com/time_series?symbol=NVDA&interval=1day&outputsize=520&apikey=${encodeURIComponent(key)}`;
    const res = await tryFetch("  twelvedata", url, { headers: { Accept: "application/json" } });
    if (res) {
      line("  HTTP status:", res.status);
      const j = await res.json();
      line("  api status:", j?.status);
      if (Array.isArray(j?.values)) {
        line("  rows:", j.values.length);
        line("  latest:", `${j.values[0]?.datetime} close ${j.values[0]?.close}`);
      } else {
        line("  message:", j?.message ?? JSON.stringify(j).slice(0, 120));
      }
    }
  }
}

console.log("\n=== end diagnostic ===\n");
console.log("Paste this whole output back so we can see which source is failing and why.");
