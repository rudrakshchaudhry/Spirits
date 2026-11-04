import { NextResponse } from "next/server";
import { conditionKeepsakes } from "@/lib/conditions/rules";
import { keepsake, withArticle } from "@/lib/keepsakes/catalog";
import { chunkHood, glintsForChunk, parseGlintId, windowIndex, windowStart } from "@/lib/keepsakes/glints";
import { openWishTypes } from "@/lib/keepsakes/server";
import { EXPLORE_LIMITS, admitChunks } from "@/lib/social/explore";
import { sfDate } from "@/lib/spirits/spawn";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";
import { chunkEntities } from "@/lib/world/query";

/** A glint's chunk must have been visited this recently (spec §10: "collected by walking over them"). */
const PRESENCE_MS = 15 * 60_000;
/** Every condition keepsake: a glint seen under fog/rain/night/blossom stays claimable if the weather flips mid-pickup. */
const ALL_CONDITION_KEEPSAKES = conditionKeepsakes(["night", "fog", "rain", "blossom"]);

/**
 * POST /api/pickup { glintId } → { type, qty, wishedBy }
 * Recomputes the deterministic glint to validate it (nothing stored about
 * glints), requires the chunk to have been walked through recently (paced by
 * the same budget as exploration, so ids can't be farmed citywide), then claims
 * it once per player per window — claim + grant are one transaction.
 */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { glintId } = (await req.json().catch(() => ({}))) as { glintId?: string };
  const parsed = glintId ? parseGlintId(glintId) : null;
  if (!parsed) return NextResponse.json({ error: "bad glint" }, { status: 400 });
  // current window, or the previous one (grace for players standing on it at the turnover)
  const now = windowIndex();
  if (parsed.win !== now && parsed.win !== now - 1) return NextResponse.json({ error: "that glint has faded" }, { status: 410 });

  // Glints come from place keepsake types + positions (date- and weather-independent) plus condition extras.
  const chunk = await chunkEntities(parsed.key, sfDate(), "");
  const glint = glintsForChunk(parsed.key, chunk.entities, parsed.win, { extra: ALL_CONDITION_KEEPSAKES }).find((g) => g.id === glintId);
  if (!glint) return NextResponse.json({ error: "nothing here" }, { status: 404 });

  // Presence: the chunk must count as visited, through the exploration pace budget.
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - PRESENCE_MS).toISOString();
  const { data: visit } = await sb.from("explored_chunks").select("last_at").eq("player_id", player.id).eq("chunk_key", parsed.key).maybeSingle();
  if (!visit || visit.last_at < since) {
    const { count: recentNew } = await sb
      .from("explored_chunks")
      .select("*", { count: "exact", head: true })
      .eq("player_id", player.id)
      .gte("first_at", new Date(Date.now() - EXPLORE_LIMITS.windowMs).toISOString());
    const { revisits, fresh } = admitChunks([parsed.key], new Set(visit ? [parsed.key] : []), recentNew ?? 0);
    if (!revisits.length && !fresh.length) return NextResponse.json({ error: "slow down, wanderer — you're moving faster than your feet" }, { status: 429 });
    await sb
      .from("explored_chunks")
      .upsert({ player_id: player.id, chunk_key: parsed.key, neighborhood: chunkHood(parsed.key), last_at: new Date().toISOString() }, { onConflict: "player_id,chunk_key" });
  }

  const { data, error } = await sb.rpc("claim_glint", { p_player: player.id, p_glint: glint.id, p_window: windowStart(parsed.win), p_type: glint.type });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = data as { result: string; qty?: number };
  if (r.result === "claimed") return NextResponse.json({ error: "already picked up" }, { status: 409 });
  if (r.result === "full") {
    return NextResponse.json({ error: `your pocket for ${keepsake(glint.type).label}s is full — gift or trade some first`, full: true }, { status: 409 });
  }
  const wishes = await openWishTypes(player.id).catch(() => new Map<string, string[]>());
  return NextResponse.json({ type: glint.type, label: withArticle(keepsake(glint.type).label), qty: r.qty, full: false, wishedBy: wishes.get(glint.type) ?? [] });
}
