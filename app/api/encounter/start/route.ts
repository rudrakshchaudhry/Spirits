import { NextResponse } from "next/server";
import { gameFor, minDurationMs } from "@/lib/encounter/games";
import { signEncounter } from "@/lib/encounter/token";
import { START_TRUST, getOrCreateCard, getPlace } from "@/lib/spirits/card";
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

  // Already friends → revisit: next lore chapter (spec §8.4; 24 h gate relaxed to "new visit" for the demo).
  if (friend && friend.status !== "met") {
    const lore = Math.min(card.lore.length, Math.max(1, friend.lore_unlocked + 1));
    await sb.from("friendships").update({ lore_unlocked: lore, last_visit_at: new Date().toISOString() }).eq("player_id", player.id).eq("spirit_id", spawn.id);
    // Friends can still be given a gift (granting the wish makes the friendship rare).
    const token = signEncounter({ u: player.id, s: spawn.id, p: place.id, t0: Date.now(), trust0: friend.trust, game: "rhythm", minMs: 0, exp: Date.now() + 15 * 60_000 });
    const lorePlus = friend.status === "rare" && card.secret_lore ? [...card.lore.slice(0, lore), card.secret_lore] : card.lore.slice(0, lore);
    return NextResponse.json({
      mode: "friend", spirit, place: placeOut, trust: friend.trust, lore: lorePlus, greeting: card.greeting, token,
      rare: friend.status === "rare", wishGranted: !!friend.wish_fulfilled_at,
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
