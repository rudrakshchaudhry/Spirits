import { INDEX, es } from "@/lib/es/client";
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
