/**
 * Seed gatherings (spec §14.3, §21: v1 = manually seeded events) at curated
 * PUBLIC parks — never residential addresses. Daily window 11:00–20:00 PT for
 * the next 14 days. Idempotent (ids are venue+date).
 * Run: npx tsx scripts/seed-gatherings.ts [minPlayers=3] [--now]   (--now: one extra
 * gathering at Dolores Park from now for 3 hours, for testing outside the window)
 */
import { INDEX, es } from "../lib/es/client";
import { loadEnv } from "./lib/env";

loadEnv();
const VENUES = ["Mission Dolores Park", "Portsmouth Square", "Washington Square", "Alamo Square", "Civic Center Plaza", "Union Square"];

function ptDate(dayOffset: number, hour: number) {
  const d = new Date(Date.now() + dayOffset * 86_400_000);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  // PT offset for that date (handles DST)
  const probe = new Date(`${ymd}T12:00:00Z`);
  const ptHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(probe));
  const offset = 12 - ptHour; // hours behind UTC
  return { ymd, iso: new Date(`${ymd}T${String(hour).padStart(2, "0")}:00:00Z`).getTime() + offset * 3600_000 };
}

async function main() {
  const minPlayers = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3);
  const parks = await es().search<{ id: string; name: string; neighborhood: string; location: { lat: number; lon: number } }>({
    index: INDEX.places, size: 20, _source: ["id", "name", "neighborhood", "location"],
    query: { bool: { filter: [{ term: { kind: "park" } }, { terms: { "name.keyword": VENUES } }] } },
  });
  const venues = parks.hits.hits.map((h) => h._source!);
  console.log(`venues: ${venues.map((v) => v.name).join(", ")}`);
  const ops: object[] = [];
  for (let day = 0; day < 14; day++) {
    const start = ptDate(day, 11), end = ptDate(day, 20);
    for (const v of venues) {
      const id = `gather-${v.id.replace(/[^a-z0-9]/gi, "")}-${start.ymd}`;
      ops.push({ index: { _index: INDEX.events, _id: id } }, {
        kind: "gathering", name: `Gathering at ${v.name}`, place_id: v.id, neighborhood: v.neighborhood, location: v.location,
        starts_at: new Date(start.iso).toISOString(), ends_at: new Date(end.iso).toISOString(), min_players: minPlayers, spirit_id: `${v.id}:gathering`,
      });
    }
  }
  if (process.argv.includes("--now")) {
    const v = venues.find((x) => x.name === "Mission Dolores Park") ?? venues[0];
    ops.push({ index: { _index: INDEX.events, _id: `gather-now-${Date.now().toString(36)}` } }, {
      kind: "gathering", name: `Pop-up gathering at ${v.name}`, place_id: v.id, neighborhood: v.neighborhood, location: v.location,
      starts_at: new Date(Date.now() - 60_000).toISOString(), ends_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
      min_players: minPlayers, spirit_id: `${v.id}:gathering`,
    });
  }
  const r = await es().bulk({ operations: ops, refresh: true });
  console.log(`✓ ${ops.length / 2} gatherings seeded${r.errors ? " (with errors)" : ""}`);
}
main().catch((e) => {
  console.error(e.meta?.body ?? e);
  process.exit(1);
});
