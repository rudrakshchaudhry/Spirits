import { NextResponse } from "next/server";
import { activeGatherings } from "@/lib/social/gatherings";
import { meFor } from "@/lib/social/server";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/** GET /api/gatherings/active → gatherings happening now (public places only), with counts. */
export async function GET(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const me = await meFor(player.id);
  if (!me.unlocks.gatherings) return NextResponse.json({ error: "befriend 10 spirits to unlock gatherings", locked: true }, { status: 403 });
  const events = await activeGatherings();
  const sb = supabaseAdmin();
  const out = await Promise.all(
    events.map(async (e) => {
      const [{ count }, { data: mine }] = await Promise.all([
        sb.from("gathering_checkins").select("*", { count: "exact", head: true }).eq("event_id", e.id).eq("verified", true),
        sb.from("gathering_checkins").select("verified,demo").eq("event_id", e.id).eq("player_id", player.id).maybeSingle(),
      ]);
      return { id: e.id, name: e.name, neighborhood: e.neighborhood, ends_at: e.ends_at, min_players: e.min_players, checkedIn: count ?? 0, me: !!mine?.verified };
    }),
  );
  return NextResponse.json({ gatherings: out, demo: me.demo });
}
