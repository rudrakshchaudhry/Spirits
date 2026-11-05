import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { CREW_BOARD_TAG } from "@/lib/social/board";
import { keepsake, withArticle } from "@/lib/keepsakes/catalog";
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
    // atomic: row lock → still wished? → consume → clear + count (no double spend on double-click)
    const { data: result, error } = await sb.rpc("grant_bonus_wish", { p_player: player.id, p_spirit: claims.s, p_type: type });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (result === "missing") return NextResponse.json({ error: `you don't have ${withArticle(k.label)}` }, { status: 400 });
    if (result !== "ok") return NextResponse.json({ error: "that wish was already granted" }, { status: 409 });
    revalidateTag(CREW_BOARD_TAG, "max");
    return NextResponse.json({
      outcome: "bonus",
      trust: friend.trust,
      befriended: true,
      rare: friend.status === "rare",
      line: `${card.name} lights up. "${cap(withArticle(k.label))}! You remembered my new wish." ✦ A new star shines in your Atlas.`,
    });
  }
  // Once the first wish is granted, "close to the wish" means close to the open bonus wish (if any).
  const target = friend.wish_fulfilled_at ? bonus?.keepsake_type ?? null : card.wish.keepsake_type;
  const sameTheme = !wished && !!target && keepsake(type).theme === keepsake(target).theme;

  if (!wished && !sameTheme) {
    return NextResponse.json({
      outcome: "declined",
      trust: friend.trust,
      line: `${card.name} admires the ${k.label}, then gently pushes it back. "It's lovely — but it belongs with you. I'm dreaming of something else…"`,
    });
  }

  // atomic: row lock → still wished? → consume → update (no double spend, no lost update)
  const { data: res, error } = await sb.rpc("apply_gift", {
    p_player: player.id, p_spirit: claims.s, p_type: type, p_kind: wished ? "wish" : "theme", p_gain: wished ? 40 : 10,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = res as { result: string; trust?: number; status?: string };
  if (r.result === "missing") return NextResponse.json({ error: `you don't have ${withArticle(k.label)}` }, { status: 400 });
  if (r.result === "already") return NextResponse.json({ error: "that wish was already granted" }, { status: 409 });
  if (r.result !== "ok") return NextResponse.json({ error: "meet the spirit first" }, { status: 400 });
  const trust = r.trust!, status = r.status!;
  if (wished || (status !== "met" && friend.status === "met")) revalidateTag(CREW_BOARD_TAG, "max");
  if (status !== "met") await sb.from("encounter_cooldowns").delete().eq("player_id", player.id).eq("spirit_id", claims.s);

  const secret = wished ? await secretChapter(card) : null;
  return NextResponse.json({
    outcome: wished ? "wish" : "theme",
    trust,
    befriended: status !== "met",
    rare: status === "rare",
    secret,
    line: wished
      ? `${card.name} goes very still, then glows. "${cap(withArticle(k.label))}… you found it. You actually found it."`
      : `${card.name} turns the ${k.label} over and smiles. "Not quite what I dream of — but close, and kind."`,
  });
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
