import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { computeHaze } from "@/scripts/ingest/haze";

export const maxDuration = 60;

/** Hourly: recompute per-neighbourhood 311 haze (aggregates only). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const n = await computeHaze();
  return NextResponse.json({ ok: true, neighborhoods: n });
}
