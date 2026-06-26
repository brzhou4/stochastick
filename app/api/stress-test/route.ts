import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/quant/validate";
import { runStressTest } from "@/lib/quant/analyze";

// GBM + live data can take a few seconds; allow headroom but stay under target.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const validation = validateRequest(body);
  if (!validation.ok || !validation.value) {
    return NextResponse.json(
      { error: "Validation failed.", details: validation.errors },
      { status: 400 },
    );
  }

  try {
    const result = await runStressTest(validation.value);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? Number((err as { statusCode: unknown }).statusCode)
        : 500;
    const message =
      err instanceof Error ? err.message : "Unexpected error running stress test.";
    return NextResponse.json(
      {
        error: message,
        details:
          statusCode === 500
            ? ["The research worker hit an unexpected error. Please retry."]
            : undefined,
      },
      { status: Number.isFinite(statusCode) ? statusCode : 500 },
    );
  }
}
