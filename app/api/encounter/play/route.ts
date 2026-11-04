import { NextResponse } from "next/server";
import { devConditionsAllowed } from "@/lib/conditions/server";
import { verifyEncounter } from "@/lib/encounter/token";
import { getCachedCard } from "@/lib/spirits/card";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/encounter/play { token, score, durationMs }
 * Server computes trust (spec §8.2): +score×60; befriended at ≥ 100; otherwise
 * the spirit wanders off for this player (10 min, legendary 30) and trust is kept.
 */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { token?: string; score?: number; durationMs?: number; demo?: boolean };
  const claims = body.token ? verifyEncounter(body.token) : null;
  if (!claims || claims.u !== player.id) return NextResponse.json({ error: "bad encounter token" }, { status: 400 });

  const duration = Number(body.durationMs);
  const elapsed = Date.now() - claims.t0;
  // Sanity checks: game took at least its minimum length and can't exceed wall-clock time.
  if (!Number.isFinite(duration) || duration < claims.minMs || duration > elapsed + 2000) {
    return NextResponse.json({ error: "that was suspiciously fast" }, { status: 400 });
  }
  const score = Math.max(0, Math.min(1, Number(body.score) || 0));

  const sb = supabaseAdmin();
  const { data: friend } = await sb.from("friendships").select("rarity").eq("player_id", player.id).eq("spirit_id", claims.s).maybeSingle();
  if (!friend) return NextResponse.json({ error: "meet the spirit first" }, { status: 400 });
  // The demo cooldown (20 s, so a stage demo can retry) is only for dev/demo builds; matches the
  // other demo checks, and a client flag alone is never trusted.
  const ms = body.demo && devConditionsAllowed() ? 20_000 : (friend.rarity === "legendary" ? 30 : 10) * 60_000;
  const gained = Math.round(score * 60);
  // atomic: row lock → still 'met' → not wandered off → single-use token → trust += gained on the
  // stored value (a gift given mid-encounter is kept) → befriend, or wander off
  const { data, error } = await sb.rpc("record_play", { p_player: player.id, p_spirit: claims.s, p_t0: Math.floor(claims.t0), p_gain: gained, p_cooldown_ms: ms });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = data as { result: string; trust?: number; befriended?: boolean; until?: string };
  if (r.result === "already") return NextResponse.json({ trust: r.trust, befriended: true, already: true });
  if (r.result === "wandering") return NextResponse.json({ error: "the spirit has wandered off for now" }, { status: 409 });
  if (r.result === "used") return NextResponse.json({ error: "this encounter is over — meet the spirit again" }, { status: 409 });
  if (r.result !== "ok") return NextResponse.json({ error: "meet the spirit first" }, { status: 400 });
  if (r.befriended) {
    const card = await getCachedCard(claims.s);
    return NextResponse.json({ trust: r.trust, gained, befriended: true, lore: card?.lore[0] ?? null });
  }
  return NextResponse.json({ trust: r.trust, gained, befriended: false, wanderedUntil: new Date(r.until!).toISOString() });
}
