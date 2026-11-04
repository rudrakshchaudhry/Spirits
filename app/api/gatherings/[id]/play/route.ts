import { NextResponse } from "next/server";
import { minDurationMs } from "@/lib/encounter/games";
import { getOrCreateCard } from "@/lib/spirits/card";
import { coopGame, gatheringById, gatheringResult, isActive } from "@/lib/social/gatherings";
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
  // the result is final once settled, and each player's FIRST score is the one that counts
  const before = await gatheringResult(id, e.min_players);
  if (before.result !== "pending") return NextResponse.json({ error: "this gathering is already settled", result: before.result }, { status: 409 });
  const { data: inserted, error: insErr } = await sb
    .from("gathering_scores")
    .upsert({ event_id: id, player_id: player.id, score }, { onConflict: "event_id,player_id", ignoreDuplicates: true })
    .select("player_id");
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  if (!inserted?.length) return NextResponse.json({ error: "you already played this one" }, { status: 409 });

  const after = await gatheringResult(id, e.min_players);
  const teamScore = Math.round((after.avg ?? 0) * 100) / 100;
  if (after.result === "pending") return NextResponse.json({ result: "pending", played: after.played, needed: e.min_players, teamScore });
  if (after.result === "failed") return NextResponse.json({ result: "failed", played: after.played, teamScore });

  // success: befriend the gathering spirit for everyone checked in
  const { data: present, error: pErr } = await sb.from("gathering_checkins").select("player_id").eq("event_id", id).eq("verified", true);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  const card = await getOrCreateCard(e.place_id, undefined, { variant: "gathering" });
  const now = new Date().toISOString();
  const { error: fErr } = await sb.from("friendships").upsert(
    (present ?? []).map((p) => ({
      player_id: p.player_id, spirit_id: card.spirit_id, place_id: card.place_id, family: card.family, rarity: card.rarity,
      spirit_name: card.name, place_name: card.place_name, neighborhood: card.neighborhood, look: card.look ?? null,
      sprite_seed: card.sprite_seed, trust: 100, status: "rare", riddles_heard: 0, lore_unlocked: 1, befriended_at: now, last_visit_at: now,
    })),
    { onConflict: "player_id,spirit_id", ignoreDuplicates: true },
  );
  if (fErr) return NextResponse.json({ error: "the spirit couldn't settle in — try again" }, { status: 500 });
  return NextResponse.json({ result: "success", played: after.played, teamScore, spirit: card.name, lore: card.lore[0] });
}
