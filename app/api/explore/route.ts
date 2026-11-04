import { NextResponse } from "next/server";
import { chunkHood } from "@/lib/keepsakes/glints";
import { EXPLORE_LIMITS, admitChunks } from "@/lib/social/explore";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/explore { chunks: ["31_32", …] } → { accepted, deferred }
 * Records which map chunks the player has walked through (spec §4.3). Only the
 * chunk key is kept, never a position or a time series. New chunks are capped
 * at a walking pace so the crew board can't be farmed; deferred keys can be
 * re-sent later.
 */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { chunks } = (await req.json().catch(() => ({}))) as { chunks?: unknown };
  const sb = supabaseAdmin();
  const candidates = Array.isArray(chunks) ? chunks.filter((k): k is string => typeof k === "string").slice(0, 50) : [];
  const since = new Date(Date.now() - EXPLORE_LIMITS.windowMs).toISOString();
  const [{ data: existing }, { count: recentNew }] = await Promise.all([
    candidates.length
      ? sb.from("explored_chunks").select("chunk_key").eq("player_id", player.id).in("chunk_key", candidates)
      : Promise.resolve({ data: [] as { chunk_key: string }[] }),
    sb.from("explored_chunks").select("*", { count: "exact", head: true }).eq("player_id", player.id).gte("first_at", since),
  ]);
  const { revisits, fresh, deferred } = admitChunks(candidates, new Set((existing ?? []).map((e) => e.chunk_key)), recentNew ?? 0);
  const now = new Date().toISOString();
  const rows = [...revisits, ...fresh].map((k) => ({ player_id: player.id, chunk_key: k, neighborhood: chunkHood(k), last_at: now }));
  if (rows.length) {
    const { error } = await sb.from("explored_chunks").upsert(rows, { onConflict: "player_id,chunk_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, accepted: [...revisits, ...fresh], deferred });
}
