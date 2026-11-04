import { chunkHood } from "@/lib/keepsakes/glints";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EXPLORE_LIMITS } from "./explore";

/** A chunk walked through this recently counts as "here". */
export const PRESENCE_MS = 15 * 60_000;

/**
 * Is the player plausibly at this chunk? Yes if they touched it in the last
 * 15 min; otherwise touching it now spends from a budget of 40 chunk touches
 * per 5 min (revisits included). Done atomically in touch_chunk() under a
 * per-player lock, so a parallel burst can't overspend the budget.
 */
export async function ensurePresence(playerId: string, key: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data, error } = await supabaseAdmin().rpc("touch_chunk", {
    p_player: playerId,
    p_key: key,
    p_hood: chunkHood(key),
    p_cap: EXPLORE_LIMITS.newPerWindow,
    p_window_s: EXPLORE_LIMITS.windowMs / 1000,
    p_presence_s: PRESENCE_MS / 1000,
  });
  if (error) return { ok: false, error: "please try again in a moment", status: 503 };
  if (data === "limit") return { ok: false, error: "slow down, wanderer — you're moving faster than your feet", status: 429 };
  return { ok: true };
}
