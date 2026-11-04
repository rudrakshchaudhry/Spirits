import { NextResponse } from "next/server";
import { meFor } from "@/lib/social/server";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/profile/:handle (spec §14.4): handle, companion, 3 favourite spirits,
 * home neighbourhood, Atlas stats. Visible only once that player has unlocked
 * profiles. Never includes any location.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/profile/[handle]">) {
  const viewer = await playerFrom(req);
  if (!viewer) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { handle } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("profiles").select("id,handle").eq("handle", handle.toLowerCase()).maybeSingle();
  if (!p) return NextResponse.json({ error: "no wanderer by that name" }, { status: 404 });
  const me = await meFor(p.id);
  if (!me.unlocks.profiles && viewer.id !== p.id) return NextResponse.json({ error: "this wanderer's profile isn't public yet" }, { status: 403 });
  const favIds = me.profile?.favorite_spirits ?? [];
  let favorites: { spirit_name: string; family: string; rarity: string; look: string | null; sprite_seed: number; neighborhood: string | null }[] = [];
  const q = sb.from("friendships").select("spirit_id,spirit_name,family,rarity,look,sprite_seed,neighborhood,status").eq("player_id", p.id).neq("status", "met");
  const { data: friends } = favIds.length ? await q.in("spirit_id", favIds) : await q.order("trust", { ascending: false }).limit(3);
  favorites = friends ?? [];
  return NextResponse.json({
    handle: p.handle,
    home_hood: me.profile?.home_hood ?? null,
    companion: me.companion,
    stats: { friends: me.stats.friends, neighborhoods: me.stats.hoods, wishes: me.stats.wishes },
    favorites,
  });
}
