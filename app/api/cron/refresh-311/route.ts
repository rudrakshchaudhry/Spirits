import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeHaze } from "@/scripts/ingest/haze";

export const maxDuration = 60;

/** Hourly: recompute per-neighbourhood 311 haze (aggregates only) and prune expired rate-limit rows (guest sign-ups, rate_hits). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // prune first so a DataSF outage can't block it; report each step's outcome
  const { count: pruned, error: pruneErr } = await supabaseAdmin()
    .from("guest_signups")
    .delete({ count: "exact" })
    .lt("created_at", new Date(Date.now() - 2 * 3600_000).toISOString());
  const { count: prunedHits, error: hitsErr } = await supabaseAdmin()
    .from("rate_hits")
    .delete({ count: "exact" })
    .lt("at", new Date(Date.now() - 24 * 3600_000).toISOString());
  let neighborhoods: number | null = null, hazeError: string | null = null;
  try {
    neighborhoods = await computeHaze();
  } catch (e) {
    hazeError = (e as Error).message;
  }
  const ok = !pruneErr && !hitsErr && !hazeError;
  return NextResponse.json(
    { ok, neighborhoods, hazeError, prunedGuestRows: pruned ?? 0, prunedRateHits: prunedHits ?? 0, pruneError: (pruneErr ?? hitsErr)?.message ?? null },
    { status: ok ? 200 : 500 },
  );
}
