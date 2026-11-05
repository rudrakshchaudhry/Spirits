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
  // same definition as the board rows (crew_member_points), so the two always agree
  const { data: pts, error } = await supabaseAdmin().rpc("crew_member_points", { p_since: since, p_player: player.id });
  if (error) {
    console.error("crew contribution failed", error);
    return NextResponse.json({ error: "the crew board is resting" }, { status: 500 });
  }
  const mine = (pts as { chunks: number; friends: number; wishes: number; points: number }[] | null)?.[0];
  return NextResponse.json({
    weekStart: since,
    top: rows.slice(0, 10),
    mine: myHood ? { hood: myHood, rank: rank || null, row: rows.find((r) => r.hood === myHood) ?? null } : null,
    contribution: { chunks: mine?.chunks ?? 0, friends: mine?.friends ?? 0, wishes: mine?.wishes ?? 0, points: mine?.points ?? 0 },
  });
}
