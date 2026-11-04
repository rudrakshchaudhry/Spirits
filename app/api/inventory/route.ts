import { NextResponse } from "next/server";
import { windowIndex, windowStart } from "@/lib/keepsakes/glints";
import { inventoryOf } from "@/lib/keepsakes/server";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/** GET /api/inventory → { items: {type: qty}, claimed: glint ids already taken this window } */
export async function GET(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const [items, { data: claims }] = await Promise.all([
    inventoryOf(player.id),
    supabaseAdmin()
      .from("pickups_claimed")
      .select("glint_id")
      .eq("player_id", player.id)
      .gte("window_start", windowStart(windowIndex() - 1)),
  ]);
  return NextResponse.json({ items, claimed: (claims ?? []).map((c) => c.glint_id) });
}
