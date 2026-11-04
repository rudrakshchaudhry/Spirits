import { NextResponse } from "next/server";
import { minDurationMs } from "@/lib/encounter/games";
import { getOrCreateCard } from "@/lib/spirits/card";
import { COOP_PASS, coopGame, gatheringById, isActive } from "@/lib/social/gatherings";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/gatherings/:id/play { score, durationMs }
 * Co-op (spec §14.3): the team score is the average; once min_players have
 * played and the average passes, the gathering spirit befriends everyone present.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/gatherings/[id]/play">) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  const e = await gatheringById(id);
  if (!e || !isActive(e)) return NextResponse.json({ error: "this gathering has ended" }, { status: 404 });
  const sb = supabaseAdmin();
  const { data: me } = await sb.from("gathering_checkins").select("verified").eq("event_id", id).eq("player_id", player.id).maybeSingle();
  if (!me?.verified) return NextResponse.json({ error: "check in first" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { score?: number; durationMs?: number };
  if (!(Number(body.durationMs) >= minDurationMs(coopGame(e)))) return NextResponse.json({ error: "that was suspiciously fast" }, { status: 400 });
  const score = Math.max(0, Math.min(1, Number(body.score) || 0));
  await sb.from("gathering_scores").upsert({ event_id: id, player_id: player.id, score });

  const [{ data: scores }, { data: present }] = await Promise.all([
    sb.from("gathering_scores").select("score").eq("event_id", id),
    sb.from("gathering_checkins").select("player_id").eq("event_id", id).eq("verified", true),
  ]);
  const n = scores?.length ?? 0;
  const avg = n ? scores!.reduce((a, s) => a + s.score, 0) / n : 0;
  if (n < e.min_players) return NextResponse.json({ result: "pending", played: n, needed: e.min_players, teamScore: Math.round(avg * 100) / 100 });
  if (avg < COOP_PASS) return NextResponse.json({ result: "failed", played: n, teamScore: Math.round(avg * 100) / 100 });

  // success: befriend the gathering spirit for everyone checked in
  const card = await getOrCreateCard(e.place_id, undefined, { variant: "gathering" });
  const now = new Date().toISOString();
  await sb.from("friendships").upsert(
    (present ?? []).map((p) => ({
      player_id: p.player_id, spirit_id: card.spirit_id, place_id: card.place_id, family: card.family, rarity: card.rarity,
      spirit_name: card.name, place_name: card.place_name, neighborhood: card.neighborhood, look: card.look ?? null,
      sprite_seed: card.sprite_seed, trust: 100, status: "rare", riddles_heard: 0, lore_unlocked: 1, befriended_at: now, last_visit_at: now,
    })),
    { onConflict: "player_id,spirit_id", ignoreDuplicates: true },
  );
  return NextResponse.json({ result: "success", played: n, teamScore: Math.round(avg * 100) / 100, spirit: card.name, lore: card.lore[0] });
}
