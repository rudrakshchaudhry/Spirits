import { INDEX, es } from "@/lib/es/client";
import type { SpiritCard } from "@/lib/spirits/card";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Keepsake types some spirit this player has met is still wishing for. */
export async function openWishTypes(playerId: string): Promise<Map<string, string[]>> {
  const [{ data }, { data: bonuses }] = await Promise.all([
    supabaseAdmin().from("friendships").select("spirit_id,spirit_name,riddles_heard").eq("player_id", playerId).is("wish_fulfilled_at", null).gt("riddles_heard", 0),
    supabaseAdmin().from("friendships").select("spirit_name,bonus_wish").eq("player_id", playerId).not("bonus_wish", "is", null),
  ]);
  const out = new Map<string, string[]>();
  for (const b of bonuses ?? []) {
    const t = (b.bonus_wish as { keepsake_type?: string } | null)?.keepsake_type;
    if (t) out.set(t, [...(out.get(t) ?? []), b.spirit_name]);
  }
  if (!data?.length) return out;
  const m = await es().mget<SpiritCard>({ index: INDEX.spirits, ids: data.map((d) => d.spirit_id), _source_includes: ["wish.keepsake_type"] });
  for (const d of m.docs) {
    if (!("_source" in d) || !d._source) continue;
    const type = d._source.wish.keepsake_type;
    const name = data.find((x) => x.spirit_id === d._id)?.spirit_name ?? "a spirit";
    out.set(type, [...(out.get(type) ?? []), name]);
  }
  return out;
}

export async function inventoryOf(playerId: string): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin().from("inventory").select("keepsake_type,qty").eq("player_id", playerId).gt("qty", 0);
  if (error) throw new Error(`inventory: ${error.message}`);
  return Object.fromEntries((data ?? []).map((r) => [r.keepsake_type, r.qty]));
}
