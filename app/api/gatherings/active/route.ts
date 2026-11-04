import { NextResponse } from "next/server";
import { activeGatherings } from "@/lib/social/gatherings";
import { friendUnlocks } from "@/lib/social/server";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/** GET /api/gatherings/active → gatherings happening now (public places only), with counts. */
export async function GET(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const me = await friendUnlocks(player.id);
  if (!me.gatherings) return NextResponse.json({ error: "befriend 10 spirits to unlock gatherings", locked: true }, { status: 403 });
  const events = await activeGatherings();
  if (!events.length) return NextResponse.json({ gatherings: [], demo: me.demo });
  // exact per-event counts (head queries have no row cap) + one query for my own check-ins
  const sb = supabaseAdmin();
  const ids = events.map((e) => e.id);
  const [counts, mineRes] = await Promise.all([
    Promise.all(ids.map((id) => sb.from("gathering_checkins").select("*", { count: "exact", head: true }).eq("event_id", id).eq("verified", true))),
    sb.from("gathering_checkins").select("event_id").eq("player_id", player.id).in("event_id", ids).eq("verified", true),
  ]);
  if (mineRes.error || counts.some((c) => c.error)) return NextResponse.json({ error: "please try again in a moment" }, { status: 503 });
  const count: Record<string, number> = Object.fromEntries(ids.map((id, i) => [id, counts[i].count ?? 0]));
  const mine = new Set((mineRes.data ?? []).map((r) => r.event_id));
  return NextResponse.json({
    gatherings: events.map((e) => ({ id: e.id, name: e.name, neighborhood: e.neighborhood, ends_at: e.ends_at, min_players: e.min_players, checkedIn: count[e.id] ?? 0, me: mine.has(e.id) })),
    demo: me.demo,
  });
}
