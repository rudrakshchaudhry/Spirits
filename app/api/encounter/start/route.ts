import { NextResponse } from "next/server";
import { gameFor, minDurationMs } from "@/lib/encounter/games";
import { signEncounter } from "@/lib/encounter/token";
import { START_TRUST, getOrCreateCard, getPlace } from "@/lib/spirits/card";
import { type BonusWish, makeBonusWish, pickBonusKeepsake, revisitCounts, rollsNewWish } from "@/lib/spirits/bonusWish";
import { devConditionsAllowed } from "@/lib/conditions/server";
import type { ConditionTag } from "@/lib/conditions/rules";
import { tagsFor } from "@/lib/conditions/server";
import { conditionSpawn, sfDate, spawnFor } from "@/lib/spirits/spawn";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";
import { featuredDay, featuredFor } from "@/lib/world/featured";

/**
 * POST /api/encounter/start { placeId }
 * meet → returns the spirit card (lazy-generated), trust, riddle and a signed token.
 */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { placeId, variant, cond: forced } = (await req.json().catch(() => ({}))) as { placeId?: string; variant?: ConditionTag; cond?: string };
  if (!placeId || typeof placeId !== "string") return NextResponse.json({ error: "placeId required" }, { status: 400 });

  const place = await getPlace(placeId);
  if (!place) return NextResponse.json({ error: "unknown place" }, { status: 404 });
  const input = {
    id: place.id, kind: place.kind, rank: place.rank, tags: place.tags, openedAt: place.attrs.opened_at as string | undefined,
    foggy: place.tags.includes("coastal") || place.location.lon < -122.465,
  };
  // A condition spirit only exists while its condition is active (spec §7.2).
  const spawn = variant
    ? (await tagsFor(forced ?? null).then(({ tags }) => conditionSpawn(input, sfDate(), tags)))
    : spawnFor(input, sfDate());
  if (!spawn || (variant && spawn.variant !== variant)) return NextResponse.json({ error: variant ? "that spirit has faded with the weather" : "no spirit here today" }, { status: 404 });

  const sb = supabaseAdmin();
  const [{ data: cd }, { data: friend }] = await Promise.all([
    sb.from("encounter_cooldowns").select("until").eq("player_id", player.id).eq("spirit_id", spawn.id).maybeSingle(),
    sb.from("friendships").select("*").eq("player_id", player.id).eq("spirit_id", spawn.id).maybeSingle(),
  ]);

  let card;
  try {
    card = await getOrCreateCard(place.id, undefined, { variant });
  } catch (e) {
    console.error("card failed", e);
    return NextResponse.json({ error: "the spirit is shy right now" }, { status: 503 });
  }
  const spirit = {
    id: card.spirit_id,
    name: card.name,
    persona: card.persona,
    temperament: card.temperament,
    family: card.family,
    rarity: card.rarity,
    look: card.look ?? null,
    seed: card.sprite_seed,
    model: card.model,
    variant: card.variant ?? null,
    featured: !variant && (await featuredFor(featuredDay()).catch(() => null))?.placeId === place.id,
  };
  const placeOut = { id: place.id, name: place.name, kind: place.kind, neighborhood: place.neighborhood };

  // Already friends → revisit (spec §8.4): after 24 h (any visit on dev/demo builds) the next
  // chapter unlocks, and ~30% of those revisits bring a new wish once the first is granted.
  if (friend && friend.status !== "met") {
    const counts = revisitCounts(friend.last_visit_at, Date.now(), devConditionsAllowed());
    const lore = counts ? Math.min(card.lore.length, Math.max(1, friend.lore_unlocked + 1)) : Math.max(1, friend.lore_unlocked);
    let bonus = friend.bonus_wish as BonusWish | null;
    let newWish = false;
    if (counts && !bonus && friend.wish_fulfilled_at && rollsNewWish(player.id, spawn.id, sfDate())) {
      bonus = await makeBonusWish(card, place, pickBonusKeepsake(card, place, `${player.id}|${spawn.id}|${sfDate()}`));
      newWish = true;
    }
    await sb
      .from("friendships")
      .update({ lore_unlocked: lore, ...(counts ? { last_visit_at: new Date().toISOString() } : {}), ...(newWish ? { bonus_wish: bonus } : {}) })
      .eq("player_id", player.id)
      .eq("spirit_id", spawn.id);
    // Friends can still be given a gift (granting the wish makes the friendship rare).
    const token = signEncounter({ u: player.id, s: spawn.id, p: place.id, t0: Date.now(), trust0: friend.trust, game: "rhythm", minMs: 0, exp: Date.now() + 15 * 60_000 });
    const lorePlus = friend.status === "rare" && card.secret_lore ? [...card.lore.slice(0, lore), card.secret_lore] : card.lore.slice(0, lore);
    return NextResponse.json({
      mode: "friend", spirit, place: placeOut, trust: friend.trust, lore: lorePlus, greeting: card.greeting, token,
      rare: friend.status === "rare", wishGranted: !!friend.wish_fulfilled_at,
      bonusWish: bonus ? { theme: bonus.theme, riddle: bonus.riddles[0], isNew: newWish } : null,
      nextChapterIn: counts ? null : Math.max(0, Date.parse(friend.last_visit_at) + 24 * 3600_000 - Date.now()),
    });
  }

  if (cd && Date.parse(cd.until) > Date.now()) {
    return NextResponse.json({ mode: "wandering", spirit, place: placeOut, until: cd.until, trust: friend?.trust ?? 0 });
  }

  const trust0 = friend?.trust ?? START_TRUST[card.temperament];
  const riddlesHeard = Math.min(2, (friend?.riddles_heard ?? 0) + 1);
  const riddle = riddlesHeard >= 2 ? card.wish.riddle_2 : card.wish.riddle_1;
  await sb.from("friendships").upsert({
    player_id: player.id,
    spirit_id: spawn.id,
    place_id: place.id,
    family: card.family,
    rarity: card.rarity,
    spirit_name: card.name,
    place_name: place.name,
    neighborhood: place.neighborhood,
    look: card.look ?? null,
    sprite_seed: card.sprite_seed,
    trust: trust0,
    status: "met",
    riddles_heard: riddlesHeard,
    last_visit_at: new Date().toISOString(),
  });

  const game = await gameFor(place, card.rarity);
  const token = signEncounter({
    u: player.id,
    s: spawn.id,
    p: place.id,
    t0: Date.now(),
    trust0,
    game: game.type,
    minMs: minDurationMs(game),
    exp: Date.now() + 15 * 60_000,
  });
  return NextResponse.json({ mode: "meet", spirit, place: placeOut, trust: trust0, riddle, riddlesHeard, game, token, greeting: card.greeting });
}
