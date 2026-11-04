import { NextResponse } from "next/server";
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
  const { data: friend } = await sb.from("friendships").select("*").eq("player_id", player.id).eq("spirit_id", claims.s).maybeSingle();
  if (!friend) return NextResponse.json({ error: "meet the spirit first" }, { status: 400 });
  if (friend.status !== "met") return NextResponse.json({ trust: friend.trust, befriended: true, already: true });
  // Single-use tokens: /start stamps last_visit_at just before signing (≤ t0) and every
  // play/gift moves it forward, so a replayed token (e.g. to retry past the cooldown) is stale.
  if (Date.parse(friend.last_visit_at) > claims.t0) {
    return NextResponse.json({ error: "this encounter is over — meet the spirit again" }, { status: 409 });
  }

  const gained = Math.round(score * 60);
  const trust = Math.min(200, claims.trust0 + gained);
  const befriended = trust >= 100;
  const now = new Date();
  await sb
    .from("friendships")
    .update({
      trust,
      status: befriended ? "befriended" : "met",
      befriended_at: befriended ? now.toISOString() : null,
      lore_unlocked: befriended ? 1 : friend.lore_unlocked,
      last_visit_at: now.toISOString(),
    })
    .eq("player_id", player.id)
    .eq("spirit_id", claims.s);

  if (befriended) {
    const card = await getCachedCard(claims.s);
    return NextResponse.json({ trust, gained, befriended: true, lore: card?.lore[0] ?? null });
  }
  // Demo mode (?dev=1) shortens the wander-off so a stage demo can retry.
  const ms = body.demo ? 20_000 : (friend.rarity === "legendary" ? 30 : 10) * 60_000;
  const until = new Date(now.getTime() + ms).toISOString();
  await sb.from("encounter_cooldowns").upsert({ player_id: player.id, spirit_id: claims.s, until });
  return NextResponse.json({ trust, gained, befriended: false, wanderedUntil: until });
}
