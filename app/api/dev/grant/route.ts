import { NextResponse } from "next/server";
import { devConditionsAllowed } from "@/lib/conditions/server";
import { KEEPSAKES } from "@/lib/keepsakes/catalog";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/** POST /api/dev/grant { type } — dev panel only (ALLOW_DEV_CONDITIONS=1). */
export async function POST(req: Request) {
  if (!devConditionsAllowed()) return NextResponse.json({ error: "not available" }, { status: 404 });
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { type } = (await req.json().catch(() => ({}))) as { type?: string };
  if (!type || !KEEPSAKES[type]) return NextResponse.json({ error: "unknown keepsake" }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc("grant_keepsake", { p_player: player.id, p_type: type, p_n: 1 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ type, qty: data });
}
