import { NextResponse } from "next/server";
import { devConditionsAllowed } from "@/lib/conditions/server";
import { CHECKIN, gatheringById, isActive, metersBetween } from "@/lib/social/gatherings";
import { friendUnlocks } from "@/lib/social/server";
import { gatheringResult } from "@/lib/social/gatherings";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/gatherings/:id/checkin { lat, lon, accuracy } | { demo: true }
 * Real check-in (spec §14.3): within 150 m of the venue, accuracy < 100 m,
 * inside the time window. Only the boolean result is stored — raw coordinates
 * are never written anywhere. Demo override ("DEMO CHECK-IN") when allowed.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/gatherings/[id]/checkin">) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  const e = await gatheringById(id);
  if (!e || !isActive(e)) return NextResponse.json({ error: "this gathering isn't happening right now" }, { status: 404 });
  const me = await friendUnlocks(player.id);
  if (!me.gatherings) return NextResponse.json({ error: "befriend 10 spirits to unlock gatherings" }, { status: 403 });
  // once the co-op is settled, the gathering spirit has come and gone
  if ((await gatheringResult(id, e.min_players)).result !== "pending") {
    return NextResponse.json({ error: "this gathering already happened — catch the next one" }, { status: 409 });
  }
  const body = (await req.json().catch(() => ({}))) as { lat?: number; lon?: number; accuracy?: number; demo?: boolean };

  let demo = false;
  if (body.demo) {
    if (!(devConditionsAllowed() || me.demo)) return NextResponse.json({ error: "demo check-in isn't available" }, { status: 403 });
    demo = true;
  } else {
    const lat = Number(body.lat), lon = Number(body.lon), acc = Number(body.accuracy);
    if (![lat, lon, acc].every(Number.isFinite)) return NextResponse.json({ error: "location needed to check in" }, { status: 400 });
    if (acc > CHECKIN.maxAccuracyM) return NextResponse.json({ error: "your location is too fuzzy — try stepping outside" }, { status: 400 });
    const d = metersBetween({ lat, lon }, e.location);
    if (d > CHECKIN.radiusM) return NextResponse.json({ error: `you're about ${Math.round(d)} m away — come within ${CHECKIN.radiusM} m` }, { status: 400 });
  }
  const { error } = await supabaseAdmin().from("gathering_checkins").upsert({ event_id: id, player_id: player.id, verified: true, demo });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, demo });
}
