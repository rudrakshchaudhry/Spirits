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
  // two queries total (not two per event)
  const { data: rows, error } = await supabaseAdmin()
    .from("gathering_checkins")
    .select("event_id,player_id")
    .in("event_id", events.map((e) => e.id))
    .eq("verified", true);
  if (error) return NextResponse.json({ error: "please try again in a moment" }, { status: 503 });
  const count: Record<string, number> = {};
  const mine = new Set<string>();
  for (const r of rows ?? []) {
    count[r.event_id] = (count[r.event_id] ?? 0) + 1;
    if (r.player_id === player.id) mine.add(r.event_id);
  }
  return NextResponse.json({
    gatherings: events.map((e) => ({ id: e.id, name: e.name, neighborhood: e.neighborhood, ends_at: e.ends_at, min_players: e.min_players, checkedIn: count[e.id] ?? 0, me: mine.has(e.id) })),
    demo: me.demo,
  });
}
