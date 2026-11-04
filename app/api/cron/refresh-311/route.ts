import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeHaze } from "@/scripts/ingest/haze";

export const maxDuration = 60;

/** Hourly: recompute per-neighbourhood 311 haze (aggregates only) and prune expired guest rate-limit rows. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const n = await computeHaze();
  // guest_signups only matters for the last hour; drop rows older than 2 h
  const { count: pruned } = await supabaseAdmin()
    .from("guest_signups")
    .delete({ count: "exact" })
    .lt("created_at", new Date(Date.now() - 2 * 3600_000).toISOString());
  return NextResponse.json({ ok: true, neighborhoods: n, prunedGuestRows: pruned ?? 0 });
}
