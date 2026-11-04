import { INDEX, es } from "@/lib/es/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hash32 } from "@/lib/spirits/spawn";
import type { RhythmGame } from "@/lib/encounter/games";

export type GatheringEvent = {
  id: string;
  kind: "gathering";
  name: string;
  place_id: string;
  neighborhood: string | null;
  location: { lat: number; lon: number };
  starts_at: string;
  ends_at: string;
  min_players: number;
  spirit_id: string;
};

export const CHECKIN = { radiusM: 150, maxAccuracyM: 100 };
export const COOP_PASS = 0.55;

export async function activeGatherings(now = new Date()): Promise<GatheringEvent[]> {
  const r = await es().search<GatheringEvent>({
    index: INDEX.events,
    size: 20,
    query: { bool: { filter: [{ term: { kind: "gathering" } }, { range: { starts_at: { lte: now.toISOString() } } }, { range: { ends_at: { gte: now.toISOString() } } }] } },
    sort: [{ ends_at: "asc" }],
  });
  return r.hits.hits.map((h) => ({ ...h._source!, id: h._id! }));
}

export async function gatheringById(id: string): Promise<GatheringEvent | null> {
  try {
    const r = await es().get<GatheringEvent>({ index: INDEX.events, id });
    return r._source ? { ...r._source, id } : null;
  } catch {
    return null;
  }
}

export const isActive = (e: GatheringEvent, now = Date.now()) => Date.parse(e.starts_at) <= now && now <= Date.parse(e.ends_at);

/** Great-circle distance in metres. */
export function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6_371_000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Everyone at a gathering plays the same pattern (co-op rhythm, spec §14.3). */
export function coopGame(e: GatheringEvent): RhythmGame {
  return { type: "rhythm", title: "Gathering song", bpm: 104, notes: 24, seed: hash32(e.id), difficulty: 0.4, flavor: "Everyone here plays the same song — the team score is the average." };
}

/** Co-op result: settled once min_players have played; only the FIRST min_players scores count (final). */
export async function gatheringResult(eventId: string, minPlayers: number) {
  const { data, error } = await supabaseAdmin()
    .from("gathering_scores")
    .select("player_id,score,played_at")
    .eq("event_id", eventId)
    .order("played_at", { ascending: true })
    .order("player_id", { ascending: true });
  if (error) throw new Error(error.message);
  const all = data ?? [];
  const counted = all.slice(0, minPlayers);
  const avg = counted.length ? counted.reduce((a, s) => a + s.score, 0) / counted.length : null;
  const result: "pending" | "success" | "failed" = all.length < minPlayers ? "pending" : avg! >= COOP_PASS ? "success" : "failed";
  return { result, played: all.length, avg, playerIds: all.map((s) => s.player_id) };
}

/**
 * Befriend the gathering spirit for everyone checked in. Idempotent, so it is
 * safe to retry (the room GET re-runs it after a success), and a transient
 * failure never loses the reward.
 */
export async function awardGathering(e: GatheringEvent) {
  const sb = supabaseAdmin();
  const { data: present, error } = await sb.from("gathering_checkins").select("player_id").eq("event_id", e.id).eq("verified", true);
  if (error) throw new Error(error.message);
  if (!present?.length) return null;
  const { getOrCreateCard } = await import("@/lib/spirits/card");
  const card = await getOrCreateCard(e.place_id, undefined, { variant: "gathering" });
  const now = new Date().toISOString();
  const { error: fErr } = await sb.from("friendships").upsert(
    present.map((p) => ({
      player_id: p.player_id, spirit_id: card.spirit_id, place_id: card.place_id, family: card.family, rarity: card.rarity,
      spirit_name: card.name, place_name: card.place_name, neighborhood: card.neighborhood, look: card.look ?? null,
      sprite_seed: card.sprite_seed, trust: 100, status: "rare", riddles_heard: 0, lore_unlocked: 1, befriended_at: now, last_visit_at: now,
    })),
    { onConflict: "player_id,spirit_id", ignoreDuplicates: true },
  );
  if (fErr) throw new Error(fErr.message);
  return card;
}
