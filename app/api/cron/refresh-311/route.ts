import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeHaze } from "@/scripts/ingest/haze";

export const maxDuration = 60;

/** Hourly: recompute per-neighbourhood 311 haze (aggregates only) and prune expired guest rate-limit rows. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // prune first so a DataSF outage can't block it; report each step's outcome
  const { count: pruned, error: pruneErr } = await supabaseAdmin()
    .from("guest_signups")
    .delete({ count: "exact" })
    .lt("created_at", new Date(Date.now() - 2 * 3600_000).toISOString());
  let neighborhoods: number | null = null, hazeError: string | null = null;
  try {
    neighborhoods = await computeHaze();
  } catch (e) {
    hazeError = (e as Error).message;
  }
  const ok = !pruneErr && !hazeError;
  return NextResponse.json(
    { ok, neighborhoods, hazeError, prunedGuestRows: pruned ?? 0, pruneError: pruneErr?.message ?? null },
    { status: ok ? 200 : 500 },
  );
}
