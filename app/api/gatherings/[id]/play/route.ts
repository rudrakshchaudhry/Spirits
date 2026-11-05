import { NextResponse } from "next/server";
import { minDurationMs } from "@/lib/encounter/games";
import { revalidateTag } from "next/cache";
import { CREW_BOARD_TAG } from "@/lib/social/board";
import { COOP_PASS, awardGathering, coopGame, gatheringById, isActive } from "@/lib/social/gatherings";
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
  // atomic: per-event lock, first score per player, only the first min_players count, final once settled
  const { data, error } = await sb.rpc("settle_gathering", { p_event: id, p_player: player.id, p_score: score, p_min: e.min_players, p_pass: COOP_PASS });
  if (error) return NextResponse.json({ error: "please try again in a moment" }, { status: 503 });
  const r = data as { result: string; settled_before?: boolean; played?: number; avg?: number };
  if (r.result === "already") return NextResponse.json({ error: "you already played this one" }, { status: 409 });
  if (r.settled_before) return NextResponse.json({ error: "this gathering is already settled", result: r.result }, { status: 409 });
  const teamScore = Math.round((r.avg ?? 0) * 100) / 100;
  if (r.result === "pending") return NextResponse.json({ result: "pending", played: r.played, needed: e.min_players, teamScore });
  if (r.result === "failed") return NextResponse.json({ result: "failed", played: r.played, teamScore });
  // success: befriend everyone present (idempotent — the room GET retries it if this fails)
  try {
    const card = await awardGathering(e);
    revalidateTag(CREW_BOARD_TAG, "max");
    return NextResponse.json({ result: "success", played: r.played, teamScore, spirit: card?.name, lore: card?.lore[0] });
  } catch {
    return NextResponse.json({ result: "success", played: r.played, teamScore, pendingAward: true });
  }
}
