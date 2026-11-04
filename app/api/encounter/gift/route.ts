import { NextResponse } from "next/server";
import { keepsake } from "@/lib/keepsakes/catalog";
import { verifyEncounter } from "@/lib/encounter/token";
import { getCachedCard, secretChapter } from "@/lib/spirits/card";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/encounter/gift { token, keepsake } (spec §8.2)
 *  - the wished-for keepsake: +40 trust, friendship becomes RARE, secret chapter
 *  - same theme as the wish (nature/sea/shop/story/sky): +10
 *  - anything else: +0, a polite in-character decline, the keepsake is kept
 */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { token?: string; keepsake?: string };
  const claims = body.token ? verifyEncounter(body.token) : null;
  if (!claims || claims.u !== player.id) return NextResponse.json({ error: "bad encounter token" }, { status: 400 });
  const type = String(body.keepsake ?? "");
  if (!type) return NextResponse.json({ error: "pick a keepsake" }, { status: 400 });

  const sb = supabaseAdmin();
  const [{ data: friend }, card] = await Promise.all([
    sb.from("friendships").select("*").eq("player_id", player.id).eq("spirit_id", claims.s).maybeSingle(),
    getCachedCard(claims.s),
  ]);
  if (!friend || !card) return NextResponse.json({ error: "meet the spirit first" }, { status: 400 });

  const wished = type === card.wish.keepsake_type && !friend.wish_fulfilled_at;
  const k = keepsake(type);

  // A revisit wish (spec §8.4): granting it is a bonus star + companion XP, no trust needed.
  const bonus = friend.bonus_wish as { keepsake_type: string; theme: string } | null;
  if (!wished && bonus && type === bonus.keepsake_type) {
    const { data: consumed, error } = await sb.rpc("consume_keepsake", { p_player: player.id, p_type: type });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!consumed) return NextResponse.json({ error: `you don't have a ${k.label}` }, { status: 400 });
    await sb
      .from("friendships")
      .update({ bonus_wish: null, bonus_wishes_granted: (friend.bonus_wishes_granted ?? 0) + 1, last_visit_at: new Date().toISOString() })
      .eq("player_id", player.id)
      .eq("spirit_id", claims.s);
    return NextResponse.json({
      outcome: "bonus",
      trust: friend.trust,
      befriended: true,
      line: `${card.name} lights up. "A ${k.label}! You remembered my new wish." ✦ A new star shines in your Atlas.`,
    });
  }
  const sameTheme = !wished && keepsake(type).theme === keepsake(card.wish.keepsake_type).theme;

  if (!wished && !sameTheme) {
    return NextResponse.json({
      outcome: "declined",
      trust: friend.trust,
      line: `${card.name} admires the ${k.label}, then gently pushes it back. "It's lovely — but it belongs with you. I'm dreaming of something else…"`,
    });
  }

  const { data: consumed, error } = await sb.rpc("consume_keepsake", { p_player: player.id, p_type: type });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!consumed) return NextResponse.json({ error: `you don't have a ${k.label}` }, { status: 400 });

  const trust = Math.min(200, friend.trust + (wished ? 40 : 10));
  const nowIso = new Date().toISOString();
  const befriendedNow = friend.status === "met" && trust >= 100;
  const status = wished ? "rare" : befriendedNow ? "befriended" : friend.status;
  await sb
    .from("friendships")
    .update({
      trust,
      status,
      befriended_at: friend.befriended_at ?? (status !== "met" ? nowIso : null),
      lore_unlocked: status !== "met" ? Math.max(1, friend.lore_unlocked) : friend.lore_unlocked,
      ...(wished ? { wish_fulfilled_at: nowIso } : {}),
      last_visit_at: nowIso,
    })
    .eq("player_id", player.id)
    .eq("spirit_id", claims.s);
  if (status !== "met") await sb.from("encounter_cooldowns").delete().eq("player_id", player.id).eq("spirit_id", claims.s);

  const secret = wished ? await secretChapter(card) : null;
  return NextResponse.json({
    outcome: wished ? "wish" : "theme",
    trust,
    befriended: status !== "met",
    rare: status === "rare",
    secret,
    line: wished
      ? `${card.name} goes very still, then glows. "A ${k.label}… you found it. You actually found it."`
      : `${card.name} turns the ${k.label} over and smiles. "Not quite what I dream of — but close, and kind."`,
  });
}
