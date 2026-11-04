import { NextResponse } from "next/server";
import { INDEX, es } from "@/lib/es/client";
import { CHUNKS_PER_HOOD } from "@/lib/keepsakes/glints";
import { inventoryOf } from "@/lib/keepsakes/server";
import type { SpiritCard } from "@/lib/spirits/card";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/atlas → friends, met-but-not-yet friends, wishes heard (spec §13.4).
 * Never returns exact positions of anything undiscovered — wishes only glow
 * neighbourhoods, and only after both riddles were heard (spec §8.3).
 */
export async function GET(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { data: rows, error } = await supabaseAdmin()
    .from("friendships")
    .select("spirit_id,place_id,family,rarity,spirit_name,place_name,neighborhood,trust,status,riddles_heard,lore_unlocked,look,sprite_seed,befriended_at,met_at,wish_fulfilled_at")
    .eq("player_id", player.id)
    .order("befriended_at", { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (rows ?? []).map((r) => r.spirit_id);
  const cards = new Map<string, SpiritCard>();
  if (ids.length) {
    const m = await es().mget<SpiritCard>({ index: INDEX.spirits, ids, _source_includes: ["spirit_id", "wish", "lore", "secret_lore"] });
    for (const d of m.docs) if ("_source" in d && d._source) cards.set(d._id, d._source);
  }

  const entries = (rows ?? []).map((r) => {
    const c = cards.get(r.spirit_id);
    return {
      ...r,
      lore: [...(c?.lore.slice(0, r.lore_unlocked) ?? []), ...(r.status === "rare" && c?.secret_lore ? [c.secret_lore] : [])],
      wish: c
        ? {
            theme: c.wish.theme,
            keepsake: c.wish.keepsake_type,
            riddles: [c.wish.riddle_1, c.wish.riddle_2].slice(0, r.riddles_heard),
            glowHoods: r.riddles_heard >= 2 && !r.wish_fulfilled_at ? c.wish.target_hoods : [],
            granted: !!r.wish_fulfilled_at,
          }
        : null,
    };
  });
  const hoods = new Set(entries.filter((e) => e.status !== "met").map((e) => e.neighborhood).filter(Boolean));

  // Explored % per neighbourhood = chunks walked / land chunks (spec §4.3)
  const [{ data: explored }, inventory] = await Promise.all([
    supabaseAdmin().from("explored_chunks").select("neighborhood").eq("player_id", player.id),
    inventoryOf(player.id),
  ]);
  const walked: Record<string, number> = {};
  for (const e of explored ?? []) if (e.neighborhood) walked[e.neighborhood] = (walked[e.neighborhood] ?? 0) + 1;
  const exploredPct = Object.fromEntries(
    Object.entries(walked).map(([h, n]) => [h, Math.min(100, Math.round((n / (CHUNKS_PER_HOOD[h] ?? n)) * 100))]),
  );
  return NextResponse.json({
    inventory,
    explored: exploredPct,
    friends: entries.filter((e) => e.status !== "met"),
    met: entries.filter((e) => e.status === "met"),
    stats: {
      friends: entries.filter((e) => e.status !== "met").length,
      met: entries.length,
      neighborhoods: hoods.size,
      explored: Object.keys(exploredPct).length,
      keepsakes: Object.values(inventory).reduce((a, b) => a + b, 0),
    },
  });
}
