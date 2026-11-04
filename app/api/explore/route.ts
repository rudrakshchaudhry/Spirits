import { NextResponse } from "next/server";
import { chunkHood } from "@/lib/keepsakes/glints";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/explore { chunks: ["31_32", …] }
 * Records which map chunks the player has walked through (spec §4.3). Only the
 * chunk key is kept, never a position or a time series.
 */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { chunks } = (await req.json().catch(() => ({}))) as { chunks?: string[] };
  const keys = [...new Set((chunks ?? []).filter((k) => typeof k === "string" && /^\d{1,3}_\d{1,3}$/.test(k)))].slice(0, 50);
  const rows = keys.map((k) => ({ player_id: player.id, chunk_key: k, neighborhood: chunkHood(k), last_at: new Date().toISOString() }));
  if (rows.length) {
    const { error } = await supabaseAdmin().from("explored_chunks").upsert(rows, { onConflict: "player_id,chunk_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recorded: rows.length });
}
