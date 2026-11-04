import { NextResponse } from "next/server";
import { devConditionsAllowed } from "@/lib/conditions/server";
import { meFor } from "@/lib/social/server";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/** GET /api/profile/me → profile, stats, unlocks, companion, next goal. */
export async function GET(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  return NextResponse.json(await meFor(player.id));
}

/** POST /api/profile/me { demo?: boolean, favorites?: string[] } */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { demo?: boolean; favorites?: string[] };
  const patch: Record<string, unknown> = {};
  if (typeof body.demo === "boolean") {
    if (!devConditionsAllowed()) return NextResponse.json({ error: "demo mode isn't available here" }, { status: 403 });
    patch.demo_mode = body.demo;
  }
  if (Array.isArray(body.favorites)) {
    const ids = body.favorites.filter((x) => typeof x === "string").slice(0, 3);
    const { data } = await supabaseAdmin().from("friendships").select("spirit_id").eq("player_id", player.id).neq("status", "met").in("spirit_id", ids);
    patch.favorite_spirits = (data ?? []).map((d) => d.spirit_id);
  }
  if (Object.keys(patch).length) await supabaseAdmin().from("profiles").update(patch).eq("id", player.id);
  return NextResponse.json(await meFor(player.id));
}
