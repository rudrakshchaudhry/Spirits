import { NextResponse } from "next/server";
import { condKey, conditionKeepsakes } from "@/lib/conditions/rules";
import { tagsFor } from "@/lib/conditions/server";
import { MAX_STACK, keepsake, withArticle } from "@/lib/keepsakes/catalog";
import { glintsForChunk, parseGlintId, windowIndex, windowStart } from "@/lib/keepsakes/glints";
import { openWishTypes } from "@/lib/keepsakes/server";
import { ensurePresence } from "@/lib/social/presence";
import { sfDate } from "@/lib/spirits/spawn";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";
import { chunkEntities } from "@/lib/world/query";

/**
 * POST /api/pickup { glintId, cond? } → { type, label, qty, wishedBy }
 * Recomputes the deterministic glint under the REAL current conditions (so
 * night/fog/rain glints only exist when they should), requires the player to be
 * plausibly at the chunk (lib/social/presence), then claims it once per player
 * per window — claim + grant are one transaction (claim_glint).
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

  // forced conditions are only honoured on dev/demo builds (tagsFor checks)
  const { tags, cond } = await tagsFor(forced ?? null);
  const chunk = await chunkEntities(parsed.key, sfDate(), condKey(tags));
  const glint = glintsForChunk(parsed.key, chunk.entities, parsed.win, { extra: conditionKeepsakes(tags, cond.phase) }).find((g) => g.id === glintId);
  if (!glint) return NextResponse.json({ error: "nothing here" }, { status: 404 });

  const presence = await ensurePresence(player.id, parsed.key);
  if (!presence.ok) return NextResponse.json({ error: presence.error }, { status: presence.status });

  // claim (atomic) and the wish hint run together
  const [{ data, error }, wishes] = await Promise.all([
    supabaseAdmin().rpc("claim_glint", { p_player: player.id, p_glint: glint.id, p_window: windowStart(parsed.win), p_type: glint.type }),
    openWishTypes(player.id).catch(() => new Map<string, string[]>()),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = data as { result: string; qty?: number };
  if (r.result === "claimed") return NextResponse.json({ error: "already picked up" }, { status: 409 });
  if (r.result === "full") {
    return NextResponse.json({ error: `you can't carry more than ${MAX_STACK} × ${keepsake(glint.type).label} — gift or trade some first`, full: true }, { status: 409 });
  }
  return NextResponse.json({ type: glint.type, label: withArticle(keepsake(glint.type).label), qty: r.qty, full: false, wishedBy: wishes.get(glint.type) ?? [] });
}
