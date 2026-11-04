import { chunkHood } from "@/lib/keepsakes/glints";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EXPLORE_LIMITS } from "./explore";

/** A chunk walked through this recently counts as "here". */
export const PRESENCE_MS = 15 * 60_000;

/**
 * Is the player plausibly at this chunk? Yes if they touched it in the last
 * 15 min; otherwise touching it now spends from a budget of 40 chunk touches
 * per 5 min (revisits included), so glints can't be farmed citywide even by a
 * player who has walked the whole city before. Works for chunks outside any
 * neighbourhood too.
 */
export async function ensurePresence(playerId: string, key: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const sb = supabaseAdmin();
  const now = Date.now();
  const [{ data: visit, error: e1 }, { count: touches, error: e2 }] = await Promise.all([
    sb.from("explored_chunks").select("last_at").eq("player_id", playerId).eq("chunk_key", key).maybeSingle(),
    sb.from("explored_chunks").select("*", { count: "exact", head: true }).eq("player_id", playerId).gte("last_at", new Date(now - EXPLORE_LIMITS.windowMs).toISOString()),
  ]);
  if (e1 || e2) return { ok: false, error: "please try again in a moment", status: 503 };
  if (visit && Date.parse(visit.last_at) >= now - PRESENCE_MS) return { ok: true };
  if ((touches ?? 0) >= EXPLORE_LIMITS.newPerWindow) {
    return { ok: false, error: "slow down, wanderer — you're moving faster than your feet", status: 429 };
  }
  const { error } = await sb
    .from("explored_chunks")
    .upsert({ player_id: playerId, chunk_key: key, neighborhood: chunkHood(key), last_at: new Date(now).toISOString() }, { onConflict: "player_id,chunk_key" });
  if (error) return { ok: false, error: "please try again in a moment", status: 503 };
  return { ok: true };
}
