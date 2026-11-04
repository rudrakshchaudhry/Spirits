import { NextResponse } from "next/server";
import { condKey, conditionKeepsakes } from "@/lib/conditions/rules";
import { tagsFor } from "@/lib/conditions/server";
import { MAX_STACK } from "@/lib/keepsakes/catalog";
import { glintsForChunk, parseGlintId, windowIndex, windowStart } from "@/lib/keepsakes/glints";
import { openWishTypes } from "@/lib/keepsakes/server";
import { sfDate } from "@/lib/spirits/spawn";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";
import { chunkEntities } from "@/lib/world/query";

/**
 * POST /api/pickup { glintId } → { type, qty, wishedBy }
 * Recomputes the deterministic glint to validate it (nothing stored about
 * glints), then claims it once per player per window (spec §10).
 */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { glintId, cond: forced } = (await req.json().catch(() => ({}))) as { glintId?: string; cond?: string };
  const parsed = glintId ? parseGlintId(glintId) : null;
  if (!parsed) return NextResponse.json({ error: "bad glint" }, { status: 400 });
  // current window, or the previous one (grace for players standing on it at the turnover)
  const now = windowIndex();
  if (parsed.win !== now && parsed.win !== now - 1) return NextResponse.json({ error: "that glint has faded" }, { status: 410 });

  const { tags, cond } = await tagsFor(forced ?? null);
  const chunk = await chunkEntities(parsed.key, sfDate(), condKey(tags));
  const glint = glintsForChunk(parsed.key, chunk.entities, parsed.win, { extra: conditionKeepsakes(tags, cond.phase) }).find((g) => g.id === glintId);
  if (!glint) return NextResponse.json({ error: "nothing here" }, { status: 404 });

  const sb = supabaseAdmin();
  const { error: claimErr } = await sb.from("pickups_claimed").insert({ player_id: player.id, glint_id: glint.id, window_start: windowStart(parsed.win) });
  if (claimErr) {
    if (claimErr.code === "23505") return NextResponse.json({ error: "already picked up" }, { status: 409 });
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  const { data: qty, error } = await sb.rpc("grant_keepsake", { p_player: player.id, p_type: glint.type, p_n: 1 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const wishes = await openWishTypes(player.id).catch(() => new Map<string, string[]>());
  return NextResponse.json({ type: glint.type, qty, full: qty >= MAX_STACK, wishedBy: wishes.get(glint.type) ?? [] });
}
