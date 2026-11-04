import { NextResponse } from "next/server";
import { getCachedCard, getOrCreateCard } from "@/lib/spirits/card";
import { awardGathering, coopGame, gatheringById, gatheringResult, isActive } from "@/lib/social/gatherings";
import { friendUnlocks } from "@/lib/social/server";
import { handlesFor } from "@/lib/social/trades";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/gatherings/:id → co-op progress and result. Who is at the venue
 * (the roster of handles) is only shown to players checked in there — saying
 * "X is in Dolores Park right now" to anyone else would leak a real location.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/gatherings/[id]">) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  const e = await gatheringById(id);
  if (!e) return NextResponse.json({ error: "no such gathering" }, { status: 404 });
  const sb = supabaseAdmin();
  let checkins: { player_id: string; demo: boolean }[] = [];
  let res: Awaited<ReturnType<typeof gatheringResult>>;
  try {
    const [c, r] = await Promise.all([sb.from("gathering_checkins").select("player_id,demo").eq("event_id", id).eq("verified", true), gatheringResult(id, e.min_players)]);
    if (c.error) throw c.error;
    checkins = c.data ?? [];
    res = r;
  } catch {
    return NextResponse.json({ error: "please try again in a moment" }, { status: 503 });
  }
  const checkedIn = checkins.some((c) => c.player_id === player.id);
  // checked-in players already passed the unlock check at check-in; skip it on every 4 s poll
  if (!checkedIn && !(await friendUnlocks(player.id)).gatherings) return NextResponse.json({ error: "befriend 10 spirits to unlock gatherings", locked: true }, { status: 403 });
  // a success whose award failed is retried here (idempotent)
  if (res.result === "success" && checkedIn) await awardGathering(e).catch(() => null);
  const handles = checkedIn ? await handlesFor(checkins.map((c) => c.player_id)) : {};
  // generate the gathering spirit only while the event is live; afterwards just read the cache
  const card = isActive(e)
    ? await getOrCreateCard(e.place_id, undefined, { variant: "gathering" }).catch(() => null)
    : await getCachedCard(`${e.place_id}:gathering`);
  return NextResponse.json({
    event: { id, name: e.name, neighborhood: e.neighborhood, ends_at: e.ends_at, min_players: e.min_players, active: isActive(e) },
    spirit: card ? { name: card.name, family: card.family, rarity: card.rarity, look: card.look ?? null, seed: card.sprite_seed, persona: card.persona } : null,
    roster: checkedIn ? checkins.map((c) => ({ handle: handles[c.player_id], demo: c.demo })) : [],
    hereCount: checkins.length,
    checkedIn,
    played: res.played,
    youPlayed: res.playerIds.includes(player.id),
    teamScore: res.avg === null ? null : Math.round(res.avg * 100) / 100,
    result: res.result,
    game: coopGame(e),
  });
}
