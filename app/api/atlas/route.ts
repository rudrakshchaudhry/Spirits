import { NextResponse } from "next/server";
import { INDEX, es } from "@/lib/es/client";
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
    .select("spirit_id,place_id,family,rarity,spirit_name,place_name,neighborhood,trust,status,riddles_heard,lore_unlocked,look,sprite_seed,befriended_at,met_at")
    .eq("player_id", player.id)
    .order("befriended_at", { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (rows ?? []).map((r) => r.spirit_id);
  const cards = new Map<string, SpiritCard>();
  if (ids.length) {
    const m = await es().mget<SpiritCard>({ index: INDEX.spirits, ids, _source_includes: ["spirit_id", "wish", "lore"] });
    for (const d of m.docs) if ("_source" in d && d._source) cards.set(d._id, d._source);
  }

  const entries = (rows ?? []).map((r) => {
    const c = cards.get(r.spirit_id);
    return {
      ...r,
      lore: c?.lore.slice(0, r.lore_unlocked) ?? [],
      wish: c
        ? {
            theme: c.wish.theme,
            keepsake: c.wish.keepsake_type,
            riddles: [c.wish.riddle_1, c.wish.riddle_2].slice(0, r.riddles_heard),
            glowHoods: r.riddles_heard >= 2 ? c.wish.target_hoods : [],
          }
        : null,
    };
  });
  const hoods = new Set(entries.filter((e) => e.status !== "met").map((e) => e.neighborhood).filter(Boolean));
  return NextResponse.json({
    friends: entries.filter((e) => e.status !== "met"),
    met: entries.filter((e) => e.status === "met"),
    stats: { friends: entries.filter((e) => e.status !== "met").length, met: entries.length, neighborhoods: hoods.size },
  });
}
