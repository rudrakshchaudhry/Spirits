import { NextResponse } from "next/server";
import { crewBoard } from "@/lib/social/board";
import { meFor, weekStart } from "@/lib/social/server";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/** GET /api/crews/board → top 10 crews this week, your crew's rank, your contribution. */
export async function GET(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const me = await meFor(player.id);
  if (!me.unlocks.crew) return NextResponse.json({ error: "explore 2 neighborhoods to unlock the crew board", locked: true }, { status: 403 });
  const since = weekStart().toISOString();
  const rows = await crewBoard(since);
  const myHood = me.profile?.home_hood ?? null;
  const rank = myHood ? rows.findIndex((r) => r.hood === myHood) + 1 : 0;
  const sb = supabaseAdmin();
  // wishes = first wishes + bonus (revisit) wishes granted this week, same as crew_scores()
  const [{ count: chunks }, { count: friends }, { count: firstWishes }, { count: bonusWishes }] = await Promise.all([
    sb.from("explored_chunks").select("*", { count: "exact", head: true }).eq("player_id", player.id).gte("first_at", since).not("neighborhood", "is", null),
    sb.from("friendships").select("*", { count: "exact", head: true }).eq("player_id", player.id).gte("befriended_at", since),
    sb.from("friendships").select("*", { count: "exact", head: true }).eq("player_id", player.id).gte("wish_fulfilled_at", since),
    sb.from("bonus_wish_grants").select("*", { count: "exact", head: true }).eq("player_id", player.id).gte("granted_at", since),
  ]);
  const wishes = (firstWishes ?? 0) + (bonusWishes ?? 0);
  return NextResponse.json({
    weekStart: since,
    top: rows.slice(0, 10),
    mine: myHood ? { hood: myHood, rank: rank || null, row: rows.find((r) => r.hood === myHood) ?? null } : null,
    contribution: { chunks: chunks ?? 0, friends: friends ?? 0, wishes, points: (chunks ?? 0) + 5 * (friends ?? 0) + 10 * wishes },
  });
}
