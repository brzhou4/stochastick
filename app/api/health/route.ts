import { NextResponse } from "next/server";

export async function GET() {
  const twelveKey = process.env.TWELVE_DATA_API_KEY;
  const gmiKey = process.env.GMI_API_KEY;
  const gmiBase = process.env.GMI_BASE_URL;
  const gmiModel = process.env.GMI_MODEL;

  // Quick live test against Twelve Data
  let twelveStatus = "not tested";
  let twelvePrice: number | null = null;
  if (twelveKey) {
    try {
      const res = await fetch(
        `https://api.twelvedata.com/time_series?symbol=NVDA&interval=1day&outputsize=1&apikey=${twelveKey}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (json?.status === "ok" && Array.isArray(json?.values)) {
        twelvePrice = Number(json.values[0]?.close);
        twelveStatus = "ok";
      } else {
        twelveStatus = `error: ${json?.message ?? json?.status ?? "unknown"}`;
      }
    } catch (e) {
      twelveStatus = `fetch error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return NextResponse.json({
    TWELVE_DATA_API_KEY: twelveKey ? `set (${twelveKey.slice(0, 8)}...)` : "MISSING",
    GMI_API_KEY: gmiKey ? `set (${gmiKey.slice(0, 8)}...)` : "MISSING",
    GMI_BASE_URL: gmiBase ?? "MISSING",
    GMI_MODEL: gmiModel ?? "MISSING",
    twelveDataTest: twelveStatus,
    nvdaLivePrice: twelvePrice,
    serverTime: new Date().toISOString(),
  });
}
