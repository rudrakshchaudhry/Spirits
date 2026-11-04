import { NextResponse } from "next/server";
import { getOrCreateCard } from "@/lib/spirits/card";
import { COOP_PASS, coopGame, gatheringById } from "@/lib/social/gatherings";
import { handlesFor } from "@/lib/social/trades";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/** GET /api/gatherings/:id → roster (handles only — never positions), co-op progress, result. */
export async function GET(req: Request, ctx: RouteContext<"/api/gatherings/[id]">) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  const e = await gatheringById(id);
  if (!e) return NextResponse.json({ error: "no such gathering" }, { status: 404 });
  const sb = supabaseAdmin();
  const [{ data: checkins }, { data: scores }] = await Promise.all([
    sb.from("gathering_checkins").select("player_id,demo").eq("event_id", id).eq("verified", true),
    sb.from("gathering_scores").select("player_id,score").eq("event_id", id),
  ]);
  const handles = await handlesFor((checkins ?? []).map((c) => c.player_id));
  const played = scores ?? [];
  const avg = played.length ? played.reduce((a, s) => a + s.score, 0) / played.length : null;
  const done = played.length >= e.min_players;
  const card = await getOrCreateCard(e.place_id, undefined, { variant: "gathering" }).catch(() => null);
  return NextResponse.json({
    event: { id, name: e.name, neighborhood: e.neighborhood, ends_at: e.ends_at, min_players: e.min_players },
    spirit: card ? { name: card.name, family: card.family, rarity: card.rarity, look: card.look ?? null, seed: card.sprite_seed, persona: card.persona } : null,
    roster: (checkins ?? []).map((c) => ({ handle: handles[c.player_id], demo: c.demo })),
    checkedIn: (checkins ?? []).some((c) => c.player_id === player.id),
    played: played.length,
    youPlayed: played.some((s) => s.player_id === player.id),
    teamScore: avg === null ? null : Math.round(avg * 100) / 100,
    result: done ? (avg! >= COOP_PASS ? "success" : "failed") : "pending",
    game: coopGame(e),
  });
}
