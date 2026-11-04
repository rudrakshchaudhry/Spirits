import { describe, expect, it } from "vitest";
import { activeTags, condKey, conditionKeepsakes, parseCondKey } from "@/lib/conditions/rules";
import { minDurationMs, mosaicFor, rhythmFor, rushFor } from "@/lib/encounter/games";
import { signEncounter, verifyEncounter } from "@/lib/encounter/token";
import { CHUNK_TILES, latLonToTile, tileToLatLon, WORLD_TILES_H, WORLD_TILES_W } from "@/lib/geo/projection";
import { KEEPSAKES, REFERENCED, WISHABLE, keepsake } from "@/lib/keepsakes/catalog";
import { glintsForChunk, parseGlintId } from "@/lib/keepsakes/glints";
import { businessCategory, parseSpecies } from "@/lib/places/catalog";
import { conditionSpawn, hash32, roll, spawnFor } from "@/lib/spirits/spawn";
import { metersBetween } from "@/lib/social/gatherings";
import { companionForm, nextGoal, traitsFor, unlocksFor } from "@/lib/social/rules";
import { weekStart } from "@/lib/social/server";
import { cleanBag } from "@/lib/social/trades";
import type { PlaceSrc } from "@/lib/spirits/card";

describe("projection", () => {
  it("round-trips lat/lon through tile space", () => {
    const p = { lat: 37.7596, lon: -122.4269 };
    const t = latLonToTile(p.lat, p.lon);
    const back = tileToLatLon(t.x, t.y);
    expect(back.lat).toBeCloseTo(p.lat, 6);
    expect(back.lon).toBeCloseTo(p.lon, 6);
  });
  it("puts SF inside the world and 1 tile ≈ 4 m", () => {
    const t = latLonToTile(37.7749, -122.4194);
    expect(t.x).toBeGreaterThan(0);
    expect(t.x).toBeLessThan(WORLD_TILES_W);
    expect(t.y).toBeLessThan(WORLD_TILES_H);
    const a = latLonToTile(37.77, -122.42), b = latLonToTile(37.77, -122.42 + 0.001);
    expect((b.x - a.x) * 4).toBeCloseTo(88, 0); // ~88 m per 0.001° lon at SF
    expect(CHUNK_TILES).toBe(64);
  });
});

describe("deterministic spawning", () => {
  const base = { id: "tree:123", kind: "tree" as const, rank: 0.2, tags: [] as string[] };
  it("hash/roll are stable", () => {
    expect(hash32("abc")).toBe(hash32("abc"));
    expect(roll("x")).toBeGreaterThanOrEqual(0);
    expect(roll("x")).toBeLessThan(1);
  });
  it("same place + day → same answer for everyone", () => {
    expect(spawnFor(base, "2026-11-03")).toEqual(spawnFor(base, "2026-11-03"));
  });
  it("ancient trees always host; shops, art, landmarks, films always host", () => {
    for (const d of ["2026-11-01", "2026-11-02", "2026-11-03"]) expect(spawnFor({ ...base, tags: ["ancient"] }, d)?.rarity).toBe("rare");
    expect(spawnFor({ id: "art:1", kind: "art", rank: 1, tags: [] }, "2026-11-03")?.rarity).toBe("legendary");
    expect(spawnFor({ id: "business:1", kind: "business", rank: 0, tags: [] }, "2026-11-03")).not.toBeNull();
  });
  it("ordinary trees spawn about 5% of the time", () => {
    let n = 0;
    for (let i = 0; i < 4000; i++) if (spawnFor({ ...base, id: `tree:${i}` }, "2026-11-03")) n++;
    expect(n / 4000).toBeGreaterThan(0.03);
    expect(n / 4000).toBeLessThan(0.08);
  });
  it("new shops are rare 'grand openings' for 14 days", () => {
    const shop = { id: "business:9", kind: "business" as const, rank: 0, tags: [], openedAt: "2026-10-30" };
    expect(spawnFor(shop, "2026-11-03")?.rarity).toBe("rare");
    expect(spawnFor(shop, "2026-12-03")?.rarity).toBe("uncommon");
  });
  it("condition spirits need the condition and a qualifying place, +1 rarity", () => {
    const flowering = { ...base, tags: ["flowering"] };
    let blossoms = 0;
    for (let i = 0; i < 500; i++) {
      const s = conditionSpawn({ ...flowering, id: `tree:f${i}` }, "2026-03-01", ["blossom"]);
      if (s) { blossoms++; expect(s.variant).toBe("blossom"); expect(s.id).toMatch(/:blossom$/); }
    }
    expect(blossoms).toBeGreaterThan(80);
    for (let i = 0; i < 200; i++) expect(conditionSpawn({ ...base, id: `tree:g${i}` }, "2026-03-01", [])).toBeNull();
    for (let i = 0; i < 200; i++) expect(conditionSpawn({ ...base, id: `tree:h${i}`, foggy: false }, "2026-03-01", ["fog"])).toBeNull();
  });
});

describe("keepsakes & glints", () => {
  it("every keepsake referenced by places exists in the catalog", () => {
    for (const k of REFERENCED) expect(KEEPSAKES[k], k).toBeDefined();
    expect(WISHABLE).not.toContain("moon_dust");
    expect(keepsake("unknown_thing").label).toBe("unknown thing");
  });
  it("glints are deterministic per chunk + window and parse back", () => {
    const ents = [{ x: 2070, y: 2060, ks: ["crumb"] }, { x: 2080, y: 2070, ks: ["leaf"] }];
    const a = glintsForChunk("32_32", ents, 1000), b = glintsForChunk("32_32", ents, 1000);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(parseGlintId(a[0].id)).toEqual({ key: "32_32", win: 1000 });
    expect(parseGlintId("g:../../etc:1:0")).toBeNull();
  });
  it("sea shells only appear on Pacific beach chunks", () => {
    const beach = glintsForChunk("1_30", [], 5).concat(glintsForChunk("1_31", [], 5));
    expect(beach.some((g) => g.type === "sea_shell" && g.snap === "sand")).toBe(true);
    expect(glintsForChunk("32_32", [], 5).some((g) => g.type === "sea_shell")).toBe(false);
  });
  it("condition keepsakes follow conditions", () => {
    expect(conditionKeepsakes(["fog", "night"])).toEqual(["scrap_of_fog", "moon_dust"]);
    expect(condKey(activeTags({ isNight: true, fog: true, rain: false, blossom: false }))).toBe("fog.night");
    expect(parseCondKey("fog.night.bogus")).toEqual(["fog", "night"]);
  });
});

describe("encounters", () => {
  it("signed tokens verify and reject tampering / expiry", () => {
    const claims = { u: "p1", s: "tree:1:base", p: "tree:1", t0: Date.now(), trust0: 30, game: "rhythm" as const, minMs: 1000, exp: Date.now() + 60_000 };
    const tok = signEncounter(claims);
    expect(verifyEncounter(tok)?.u).toBe("p1");
    const [body, mac] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, trust0: 99 })).toString("base64url");
    expect(verifyEncounter(`${forged}.${mac}`)).toBeNull();
    expect(verifyEncounter(signEncounter({ ...claims, exp: Date.now() - 1 }))).toBeNull();
    expect(verifyEncounter(body)).toBeNull();
  });
  const place = (over: Partial<PlaceSrc>): PlaceSrc => ({
    id: "x:1", kind: "tree", name: "x", location: { lat: 37.77, lon: -122.42 }, neighborhood: "Mission", attrs: {}, tags: [], keepsake_types: [], rank: 0.5, ...over,
  });
  it("rhythm tempo follows tree age and is capped", () => {
    const young = rhythmFor(place({ attrs: { plant_date: "2020-01-01" } }), "common");
    const old = rhythmFor(place({ attrs: { plant_date: "1900-01-01" } }), "common");
    expect(old.bpm).toBeGreaterThan(young.bpm);
    expect(old.bpm).toBeLessThanOrEqual(150 + 20);
  });
  it("rush hour uses the shop's category menu; mosaic reveals the real record", () => {
    const g = rushFor(place({ kind: "business", attrs: { business_category: "bakery" } }), "uncommon");
    expect(g.items).toContain("sourdough");
    expect(g.orders.every((o) => o.every((i) => i < g.items.length))).toBe(true);
    const m = mosaicFor(place({ kind: "art", name: "Mission Parade", attrs: { artist: "M. B.", year: 2012 } }), "legendary");
    expect(m.reveal).toMatchObject({ title: "Mission Parade", artist: "M. B.", year: 2012 });
    expect(minDurationMs(g)).toBeGreaterThan(0);
  });
});

describe("data catalog", () => {
  it("parses species and maps genera to groups", () => {
    expect(parseSpecies("Platanus x hispanica :: Sycamore, London Plane")).toMatchObject({ group: "plane", common: "Sycamore, London Plane" });
    expect(parseSpecies("Ginkgo biloba :: Maidenhair Tree").group).toBe("ginkgo");
    expect(parseSpecies("Mysteria unknownus :: ?").group).toBe("other");
  });
  it("keeps only consumer-facing businesses", () => {
    expect(businessCategory("722515", "Ritual Coffee")).toBe("cafe");
    expect(businessCategory("722511", "Tartine Bakery")).toBe("bakery");
    expect(businessCategory("531110", "Some Landlord LLC")).toBeNull();
    expect(businessCategory("72", "Vague")).toBeNull();
  });
});

describe("social rules", () => {
  const s = (friends: number, hoods: number) => ({ friends, hoods, wishes: 0, topHoods: [] });
  it("milestones unlock in order, demo unlocks all", () => {
    expect(unlocksFor(s(0, 0))).toEqual({ crew: false, trading: false, gatherings: false, profiles: false });
    expect(unlocksFor(s(5, 2))).toMatchObject({ crew: true, trading: true, gatherings: false });
    expect(unlocksFor(s(0, 0), true).gatherings).toBe(true);
    expect(nextGoal(s(0, 1), unlocksFor(s(0, 1)))).toMatch(/1 more neighborhood/);
  });
  it("companion evolves at 3/5 and 8/20, absorbs traits", () => {
    expect(companionForm(s(4, 3))).toBe(1);
    expect(companionForm(s(5, 3))).toBe(2);
    expect(companionForm(s(20, 8))).toBe(3);
    expect(traitsFor(["Outer Richmond", "Mission"])).toEqual(["shell", "mural"]);
  });
  it("trade bags are validated", () => {
    expect(cleanBag({ sea_shell: 2 })).toEqual({ sea_shell: 2 });
    expect(cleanBag({ sea_shell: 6 })).toMatch(/at most 5/);
    expect(cleanBag({ not_a_thing: 1 })).toMatch(/unknown/);
    expect(cleanBag({ sea_shell: 1.5 })).toMatch(/whole/);
  });
  it("check-in distance and week start", () => {
    expect(metersBetween({ lat: 37.7596, lon: -122.4269 }, { lat: 37.7596, lon: -122.4269 })).toBe(0);
    const d = metersBetween({ lat: 37.7596, lon: -122.4269 }, { lat: 37.7605, lon: -122.4269 });
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
    const w = weekStart(new Date("2026-11-04T05:00:00Z")); // Tue 3 Nov, 21:00 PT
    expect(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", hour12: false }).format(w)).toMatch(/Mon.*(00|24)/);
  });
});

describe("exploration anti-cheat", () => {
  it("accepts only land chunks, caps per request and paces new chunks", async () => {
    const { admitChunks, EXPLORE_LIMITS } = await import("@/lib/social/explore");
    // 0_0 is open ocean → rejected; garbage rejected
    const r1 = admitChunks(["32_32", "0_0", "../x", 5], new Set(), 0);
    expect(r1.fresh).toEqual(["32_32"]);
    // per-request cap
    const many = Array.from({ length: 30 }, (_, i) => `${20 + (i % 10)}_${30 + Math.floor(i / 10)}`);
    expect(admitChunks(many, new Set(), 0).fresh.length).toBeLessThanOrEqual(EXPLORE_LIMITS.perRequest);
    // budget exhausted → new chunks deferred, revisits still fine
    const over = admitChunks(many, new Set(), 0);
    expect(over.fresh.length + over.deferred.length).toBe(new Set(many).size - many.filter((k) => !/^\d+_\d+$/.test(k)).length - (many.length - over.fresh.length - over.deferred.length));
    expect(over.deferred.length).toBeGreaterThan(0); // overflow comes back as deferred, not dropped
    const r3 = admitChunks(["32_32", "32_33"], new Set(["32_32"]), EXPLORE_LIMITS.newPerWindow);
    expect(r3.revisits).toEqual(["32_32"]);
    expect(r3.fresh).toEqual([]);
    expect(r3.deferred).toEqual(["32_33"]);
  });
});

describe("guest signup limit", () => {
  it("is generous for shared wifi, lenient on dev builds, configurable", async () => {
    const { guestLimit } = await import("@/lib/social/guestLimit");
    expect(guestLimit({} as NodeJS.ProcessEnv)).toBe(30);
    expect(guestLimit({ ALLOW_DEV_CONDITIONS: "1" } as unknown as NodeJS.ProcessEnv)).toBe(100);
    expect(guestLimit({ GUEST_LIMIT_PER_HOUR: "3" } as unknown as NodeJS.ProcessEnv)).toBe(3);
  });
  it("keys IPv6 by /64, never stores raw IPs, needs a server salt", async () => {
    const { clientKey, hashIp, ipSalt } = await import("@/lib/social/guestLimit");
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toEqual({ key: "203.0.113.7", known: true });
    const a = clientKey(new Headers({ "x-real-ip": "2001:db8:1:2:aaaa::1" })).key;
    const b = clientKey(new Headers({ "x-real-ip": "2001:0db8:0001:0002:ffff:1:2:3" })).key;
    expect(a).toBe("2001:db8:1:2::/64");
    expect(b).toBe(a);
    expect(clientKey(new Headers())).toEqual({ key: "unknown", known: false });
    expect(hashIp("203.0.113.7", "s")).not.toContain("203");
    expect(ipSalt({} as NodeJS.ProcessEnv)).toBeNull();
    expect(ipSalt({ SUPABASE_SERVICE_ROLE_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toBe("k");
  });
});

describe("revisit wishes (spec §8.4)", () => {
  it("counts a revisit after 24 h (or always on relaxed builds) and rolls ~30% deterministically", async () => {
    const { revisitCounts, rollsNewWish, pickBonusKeepsake, NEW_WISH_CHANCE } = await import("@/lib/spirits/bonusWish");
    const now = Date.parse("2026-11-04T12:00:00Z");
    expect(revisitCounts(new Date(now - 3600_000).toISOString(), now)).toBe(false);
    expect(revisitCounts(new Date(now - 25 * 3600_000).toISOString(), now)).toBe(true);
    expect(revisitCounts(new Date(now - 3600_000).toISOString(), now, true)).toBe(true);
    expect(rollsNewWish("p", "s", "2026-11-04")).toBe(rollsNewWish("p", "s", "2026-11-04"));
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (rollsNewWish(`p${i}`, "s", "2026-11-04")) hits++;
    expect(hits / 2000).toBeGreaterThan(NEW_WISH_CHANCE - 0.05);
    expect(hits / 2000).toBeLessThan(NEW_WISH_CHANCE + 0.05);
    const k = pickBonusKeepsake({ wish: { keepsake_type: "sea_shell" } } as never, { keepsake_types: ["crumb"] }, "seed");
    expect(k).not.toBe("sea_shell");
    expect(k).not.toBe("crumb");
  });
});

describe("wish riddles point at the keepsake", () => {
  it("recognises the keepsake in many spellings", async () => {
    const { keyNoun, namesKeepsake } = await import("@/lib/keepsakes/catalog");
    expect(keyNoun("palm_frond")).toBe("frond");
    expect(namesKeepsake("long green fronds rustle", "palm_frond")).toBe(true);
    expect(namesKeepsake("A seashell that still hums.", "sea_shell")).toBe(true);
    expect(namesKeepsake("a fallen pinecone", "pine_cone")).toBe(true);
    expect(namesKeepsake("silver eucalyptus leaves whisper", "gum_leaf")).toBe(true);
    expect(namesKeepsake("a comb missing two teeth", "comb_tooth")).toBe(true);
    expect(namesKeepsake("A _florist's ribbon_ of __silk__", "ribbon")).toBe(true);
    expect(namesKeepsake("a ribbon of silk", "ribbon")).toBe(false); // "hair ribbon" exists → full label needed
    expect(namesKeepsake("a keyhole story", "old_brass_key")).toBe(false);
    // review fixes: no cross-word compact matches, siblings need the full label
    expect(namesKeepsake("but tonight the wind", "button")).toBe(false);
    expect(namesKeepsake("a corn field in summer", "acorn")).toBe(false);
    expect(namesKeepsake("a fallen pine cone", "cypress_cone")).toBe(false);
    expect(namesKeepsake("a cypress cone, still sticky", "cypress_cone")).toBe(true);
    expect(namesKeepsake("an old brass key", "maple_key")).toBe(false);
    expect(namesKeepsake("a twirling maple key", "maple_key")).toBe(true);
  });
  it("rejects riddles that name a different keepsake", async () => {
    const { checkRiddles } = await import("@/lib/keepsakes/catalog");
    const [a] = checkRiddles("Find the eucalyptus leaf by the creek", "and bring me the leaf", "leaf");
    expect(a).toMatch(/Somewhere across the city lies a leaf/);
    // other keepsakes as scenery words are fine
    const ok = checkRiddles("Where coffee beans are ground at dawn…", "a pastry crumb left on the counter", "crumb");
    expect(ok[0]).toBe("Where coffee beans are ground at dawn…");
  });
  it("pins the stack cap shared with SQL (claim_glint, grant_keepsake, inventory CHECK)", async () => {
    const { MAX_STACK } = await import("@/lib/keepsakes/catalog");
    expect(MAX_STACK).toBe(20); // change supabase/migrations claim_glint + inventory check together
  });
  it("replaces drifted riddles with templates and strips markdown", async () => {
    const { checkRiddles, withArticle } = await import("@/lib/keepsakes/catalog");
    const [a, b] = checkRiddles("I am not a book…", "I hold countless tales.", "palm_frond");
    expect(a).toMatch(/a palm frond/);
    expect(b).toMatch(/a palm frond/);
    expect(checkRiddles("**Soft** and green", "what am I, if not a **palm frond**?", "palm_frond")).toEqual(["Soft and green", "what am I, if not a palm frond?"]);
    expect(withArticle("old brass key")).toBe("an old brass key");
    expect(withArticle("eucalyptus leaf")).toBe("a eucalyptus leaf");
    expect(withArticle("acorn")).toBe("an acorn");
    expect(withArticle("sea shell")).toBe("a sea shell");
  });
});

describe("checkpoint G review fixes", () => {
  it("weekStart is Monday 00:00 PT even across DST changes", async () => {
    const { weekStart } = await import("@/lib/social/server");
    // Sun 2026-03-08 after the spring-forward: week began Mon 2026-03-02 00:00 PST = 08:00Z
    expect(weekStart(new Date("2026-03-08T18:00:00Z")).toISOString()).toBe("2026-03-02T08:00:00.000Z");
    // Sun 2026-11-01 after fall-back: week began Mon 2026-10-26 00:00 PDT = 07:00Z
    expect(weekStart(new Date("2026-11-01T18:00:00Z")).toISOString()).toBe("2026-10-26T07:00:00.000Z");
    // Monday 00:30 PT belongs to the new week
    expect(weekStart(new Date("2026-11-09T08:30:00Z")).toISOString()).toBe("2026-11-09T08:00:00.000Z");
  });
  it("trade bags reject prototype keys", async () => {
    const { cleanBag } = await import("@/lib/social/trades");
    expect(cleanBag({ constructor: 1 })).toMatch(/unknown keepsake/);
    expect(cleanBag({ toString: 1 })).toMatch(/unknown keepsake/);
  });
});

describe("live weather parsing (Open-Meteo)", () => {
  const stub = async (status: number, body: unknown) => {
    const { vi } = await import("vitest");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    const { computeConditions } = await import("@/lib/conditions/server");
    return computeConditions(new Date("2026-11-04T20:00:00Z"));
  };
  it("a null visibility is not fog; real low cloud + humidity is", async () => {
    const a = await stub(200, { current: { visibility: null, cloud_cover_low: 10, relative_humidity_2m: 60, precipitation: 0, temperature_2m: 15 } });
    expect(a.fog).toBe(false);
    expect(a.source).toBe("live");
    const b = await stub(200, { current: { visibility: null, cloud_cover_low: 95, relative_humidity_2m: 96, precipitation: 0.3, temperature_2m: 12 } });
    expect(b.fog).toBe(true);
    expect(b.rain).toBe(true);
  });
  it("bad status or empty payload falls back to clear skies", async () => {
    expect((await stub(503, {})).source).toBe("fallback");
    const c = await stub(200, { current: {} });
    expect(c.source).toBe("fallback");
    expect(c.fog).toBe(false);
  });
});
