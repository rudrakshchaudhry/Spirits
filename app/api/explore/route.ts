import { NextResponse } from "next/server";
import { chunkHood } from "@/lib/keepsakes/glints";
import { EXPLORE_LIMITS, validChunkKeys } from "@/lib/social/explore";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/explore { chunks: ["31_32", …] } → { accepted, deferred }
 * Records which map chunks the player has walked through (spec §4.3). Only the
 * chunk key is kept, never a position or a time series. Land chunks only, 10
 * per request, new chunks paced at 40 per 5 min — enforced atomically in
 * admit_chunks() so parallel requests can't overspend. Deferred keys can be
 * re-sent later.
 */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { chunks } = (await req.json().catch(() => ({}))) as { chunks?: unknown };
  const candidates = Array.isArray(chunks) ? chunks.filter((k): k is string => typeof k === "string").slice(0, 50) : [];
  // static filtering (land chunks, per-request cap) — the budget is applied in SQL
  const { keys, overflow } = validChunkKeys(candidates);
  if (!keys.length) return NextResponse.json({ ok: true, accepted: [], deferred: overflow });
  const { data, error } = await supabaseAdmin().rpc("admit_chunks", {
    p_player: player.id,
    p_keys: keys,
    p_hoods: keys.map((k) => chunkHood(k)),
    p_cap: EXPLORE_LIMITS.newPerWindow,
    p_window_s: EXPLORE_LIMITS.windowMs / 1000,
  });
  if (error) return NextResponse.json({ error: "please try again in a moment" }, { status: 503 });
  const accepted = (data as string[]) ?? [];
  return NextResponse.json({ ok: true, accepted, deferred: [...keys.filter((k) => !accepted.includes(k)), ...overflow] });
}
