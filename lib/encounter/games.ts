/**
 * Mini-game content (spec §9). Everything factual comes from dataset fields or
 * ES results — never from model memory (spec §11.1).
 */
import { INDEX, es } from "@/lib/es/client";
import type { PlaceSrc } from "@/lib/spirits/card";
import { hash32, type Rarity } from "@/lib/spirits/spawn";

export const DIFFICULTY: Record<Rarity, number> = { common: 0.1, uncommon: 0.3, rare: 0.55, legendary: 0.85 };

export type RhythmGame = {
  type: "rhythm";
  title: string;
  bpm: number;
  notes: number;
  seed: number;
  difficulty: number;
  flavor: string;
};
export type TriviaGame = {
  type: "trivia";
  title: string;
  seconds: number;
  difficulty: number;
  questions: { q: string; options: string[]; answer: number }[];
};
/** "Rush Hour" (spec §9.2): remember the order, serve it before it cools. */
export type RushGame = {
  type: "rush";
  title: string;
  shop: string; // category label ("bakery")
  items: string[];
  orders: number[][]; // indices into items
  showMs: number; // how long an order is shown
  coolMs: number; // per-item time once serving starts
  difficulty: number;
};
/** "Then or Now" (spec §9.3): a clue from the records → which real nearby place? */
export type ThenNowGame = {
  type: "thennow";
  title: string;
  seconds: number;
  difficulty: number;
  rounds: { clue: string; options: string[]; answer: number }[];
};
/** "Mosaic" (spec §9.5): rotate tiles to restore the guardian's pattern. */
export type MosaicGame = {
  type: "mosaic";
  title: string;
  size: number;
  seed: number;
  hue: number;
  seconds: number;
  difficulty: number;
  reveal: { title: string; artist?: string; year?: number; medium?: string };
};
export type GameContent = RhythmGame | TriviaGame | RushGame | ThenNowGame | MosaicGame;
export type GameType = GameContent["type"];

/** Rough age in decades from planting date, else from trunk-size rank. */
function decadesOf(p: PlaceSrc) {
  const planted = p.attrs.plant_date ? Date.parse(String(p.attrs.plant_date)) : NaN;
  if (Number.isFinite(planted)) return Math.max(0, (Date.now() - planted) / 3.156e11);
  return p.rank * 10;
}

export function rhythmFor(p: PlaceSrc, rarity: Rarity): RhythmGame {
  const d = DIFFICULTY[rarity];
  // spec §9.1: BPM = 70 + decades × 6, capped at 150, plus difficulty
  const bpm = Math.round(Math.min(150, 70 + decadesOf(p) * 6) + d * 20);
  const flavor =
    p.kind === "tree" ? `The ${(p.attrs.species as string) ?? "tree"} sways to a ${bpm > 115 ? "lively" : bpm > 90 ? "steady" : "slow, old"} beat.` :
    p.kind === "business" ? "The shop hums with the rhythm of the morning rush." :
    p.kind === "art" ? "Colours pulse in time — keep up with the pattern." :
    p.kind === "landmark" ? "Old floorboards creak in a steady rhythm." :
    "The park breathes in and out.";
  return {
    type: "rhythm",
    title: p.kind === "tree" ? "Rustle" : p.kind === "park" ? "Birdsong" : "Rhythm",
    bpm, notes: 16 + Math.round(d * 12), seed: hash32(p.id), difficulty: d, flavor,
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** "Take Two": film trivia grounded only in the film row (spec §9.4). */
export async function triviaFor(p: PlaceSrc, rarity: Rarity): Promise<GameContent> {
  const a = p.attrs as { film_title?: string; film_year?: number; director?: string; actors?: string[]; location_text?: string; writer?: string };
  if (!a.film_title) return rhythmFor(p, rarity);
  const d = DIFFICULTY[rarity];
  const seed = hash32(p.id);
  // Distractors: other real films from the same index.
  const r = await es().search<{ attrs: typeof a }>({
    index: INDEX.places,
    size: 40,
    _source: ["attrs.film_title", "attrs.film_year", "attrs.director", "attrs.actors", "attrs.writer"],
    query: { function_score: { query: { term: { kind: "film" } }, functions: [{ random_score: { seed, field: "_seq_no" } }] } },
  });
  const others = r.hits.hits.map((h) => h._source!.attrs).filter((o) => o.film_title !== a.film_title);
  const pool = (get: (o: typeof a) => string | undefined, correct: string) =>
    [...new Set(others.map(get).filter((v): v is string => !!v && v !== correct))].slice(0, 3);

  const qs: TriviaGame["questions"] = [];
  const add = (q: string, correct: string | undefined, wrong: string[]) => {
    if (!correct || wrong.length < 3) return;
    const opts = shuffle([correct, ...wrong.slice(0, 3)], seed + qs.length);
    qs.push({ q, options: opts, answer: opts.indexOf(correct) });
  };
  const title = a.film_title;
  if (a.film_year) {
    const wrongYears = shuffle([-12, -6, -3, 4, 7, 11].map((k) => String(a.film_year! + k)), seed).slice(0, 3);
    add(`When was “${title}” released?`, String(a.film_year), wrongYears);
  }
  add(`Who directed “${title}”?`, a.director, pool((o) => o.director, a.director ?? ""));
  if (a.location_text) add(`Which film had a scene at ${a.location_text}?`, title, pool((o) => o.film_title, title));
  if (a.actors?.[0]) add(`Who starred in “${title}”?`, a.actors[0], pool((o) => o.actors?.[0], a.actors[0]));
  if (a.writer && a.writer !== a.director) add(`Who wrote “${title}”?`, a.writer, pool((o) => o.writer, a.writer));
  if (a.actors?.[1]) add(`Which of these actors appeared in “${title}”?`, a.actors[1], pool((o) => o.actors?.[1], a.actors[1]));
  if (qs.length < 3) return rhythmFor(p, rarity);
  return { type: "trivia", title: "Take Two", seconds: Math.round(8 - d * 3), difficulty: d, questions: qs.slice(0, 5) };
}

// ───────────────────────── Rush Hour (shopkeepers) ─────────────────────────
/**
 * Generic menus per category. Deliberately NOT claims about the real shop's
 * menu (spec §11.2: no facts about businesses beyond the record).
 */
const MENUS: Record<string, string[]> = {
  bakery: ["sourdough", "concha", "croissant", "cardamom bun", "baguette", "pan dulce", "muffin", "scone"],
  cafe: ["espresso", "cortado", "oat latte", "drip coffee", "chai", "matcha", "cold brew", "mocha"],
  restaurant: ["noodles", "dumplings", "burrito", "salad", "soup", "tacos", "rice bowl", "curry"],
  bar: ["lemonade", "ginger beer", "soda water", "mocktail", "iced tea", "tonic", "cider", "shrub"],
  grocery: ["apples", "avocados", "tortillas", "rice", "lemons", "peppers", "bread", "eggs"],
  bookstore: ["poetry", "mystery", "atlas", "comic", "cookbook", "zine", "biography", "sci-fi"],
  florist: ["roses", "tulips", "dahlias", "ferns", "lilies", "sunflowers", "peonies", "daisies"],
  clothing: ["scarf", "hat", "jacket", "socks", "sweater", "tote", "jeans", "belt"],
  salon: ["trim", "braid", "curl", "wash", "fringe", "bob", "color", "blowout"],
  barber: ["fade", "trim", "shave", "line-up", "buzz", "part", "taper", "beard"],
  fitness: ["squats", "lunges", "plank", "jumps", "stretch", "push-ups", "row", "climb"],
  arts: ["ticket", "program", "poster", "encore", "matinee", "balcony", "aisle", "curtain"],
  music: ["vinyl", "strings", "picks", "cassette", "drumsticks", "capo", "tuner", "sheet music"],
  pets: ["kibble", "leash", "chew toy", "collar", "treats", "brush", "bed", "ball"],
  hardware: ["screws", "hammer", "paint", "tape", "nails", "hinges", "drill bit", "glue"],
  shop: ["postcard", "candle", "notebook", "mug", "pin", "sticker", "map", "keychain"],
};

export function rushFor(p: PlaceSrc, rarity: Rarity): RushGame {
  const d = DIFFICULTY[rarity];
  const cat = String(p.attrs.business_category ?? "shop");
  const items = (MENUS[cat] ?? MENUS.shop).slice(0, 6 + Math.round(d * 2));
  let s = hash32(p.id) || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const orders = [3, 4, 5].map((len) => Array.from({ length: Math.min(6, len + Math.round(d)) }, () => Math.floor(rnd() * items.length)));
  return {
    type: "rush", title: "Rush Hour", shop: cat, items, orders,
    showMs: Math.round(2600 - d * 900), coolMs: Math.round(3200 - d * 1200), difficulty: d,
  };
}

// ───────────────────────── Then or Now (ancients) ─────────────────────────
type Near = PlaceSrc & { meters: number };

/** A factual clue built only from dataset fields; null if the record is too thin. */
function clueFor(p: PlaceSrc): string | null {
  const a = p.attrs as Record<string, string | number | undefined>;
  switch (p.kind) {
    case "landmark": {
      const bits = [a.year && `Built in ${a.year}`, a.style && `in the ${a.style} style`, a.architect && `designed by ${a.architect}`].filter(Boolean);
      if (!bits.length) return null;
      const arch = String(a.architect ?? "").split(";")[0];
      if (arch) bits[bits.length - 1] = bits[bits.length - 1]!.toString().replace(String(a.architect), arch);
      const people = a.significant_people && !String(a.significant_people).includes(arch || "\u0000") ? `; tied to ${a.significant_people}` : "";
      const clue = bits.join(", ") + people + ".";
      return clue.length > 200 ? clue.slice(0, 197) + "…" : clue;
    }
    case "art":
      if (!a.artist && !a.year) return null;
      return `${a.medium ? `A ${String(a.medium).toLowerCase()} piece` : "A public artwork"}${a.artist ? ` by ${a.artist}` : ""}${a.year ? `, from ${a.year}` : ""}.`;
    case "business": {
      const y = a.opened_at ? String(a.opened_at).slice(0, 4) : null;
      return y && Number(y) < 2015 ? `A neighborhood ${String(a.business_category ?? "shop")} that has been on this block since ${y}.` : null;
    }
    case "park":
      return a.acres ? `${Number(a.acres).toFixed(1)} acres of public ${String(a.property_type ?? "park").toLowerCase()}.` : null;
    default:
      return null;
  }
}

export async function thenNowFor(p: PlaceSrc, rarity: Rarity): Promise<GameContent> {
  const d = DIFFICULTY[rarity];
  const r = await es().search<PlaceSrc>({
    index: INDEX.places,
    size: 60,
    _source: ["id", "kind", "name", "attrs", "location"],
    query: { bool: { filter: [{ geo_distance: { distance: "300m", location: p.location } }], must_not: [{ terms: { kind: ["tree", "film"] } }] } },
    sort: [{ _geo_distance: { location: p.location, order: "asc", unit: "m" } }],
  });
  const near: Near[] = r.hits.hits.map((h) => ({ ...h._source!, meters: Math.round((h.sort?.[0] as number) ?? 0) }));
  const seed = hash32(p.id);
  const targets = [p, ...near.filter((n) => n.id !== p.id && clueFor(n))].filter((t, i, arr) => arr.findIndex((x) => x.name === t.name) === i);
  const rounds: ThenNowGame["rounds"] = [];
  for (const t of targets) {
    const clue = clueFor(t);
    if (!clue) continue;
    const others = [...new Set(near.filter((n) => n.name !== t.name).map((n) => n.name))];
    if (others.length < 3) continue;
    const wrong = shuffle(others, seed + rounds.length).slice(0, 3);
    const options = shuffle([t.name, ...wrong], seed + 17 + rounds.length);
    rounds.push({ clue, options, answer: options.indexOf(t.name) });
    if (rounds.length >= 3 + Math.round(d * 2)) break;
  }
  if (rounds.length < 3) return rhythmFor(p, rarity);
  return { type: "thennow", title: "Then or Now", seconds: Math.round(12 - d * 4), difficulty: d, rounds };
}

// ───────────────────────── Mosaic (art guardians) ─────────────────────────
export function mosaicFor(p: PlaceSrc, rarity: Rarity): MosaicGame {
  const d = DIFFICULTY[rarity];
  const seed = hash32(p.id);
  const a = p.attrs as { artist?: string; year?: number; medium?: string };
  return {
    type: "mosaic", title: "Mosaic",
    size: d >= 0.8 ? 4 : 3,
    seed, hue: seed % 360,
    seconds: d >= 0.8 ? 75 : 60,
    difficulty: d,
    reveal: { title: p.name, artist: a.artist, year: a.year, medium: a.medium },
  };
}

export async function gameFor(p: PlaceSrc, rarity: Rarity): Promise<GameContent> {
  switch (p.kind) {
    case "film": return triviaFor(p, rarity);
    case "business": return rushFor(p, rarity);
    case "landmark": return thenNowFor(p, rarity);
    case "art": return mosaicFor(p, rarity);
    default: return rhythmFor(p, rarity);
  }
}

/** Shortest plausible play time (anti-cheat sanity check, spec §15). */
export function minDurationMs(g: GameContent) {
  switch (g.type) {
    case "rhythm": return Math.round(((g.notes * 60_000) / g.bpm) * 0.7);
    case "trivia": return g.questions.length * 700;
    case "rush": return g.orders.reduce((a, o) => a + o.length, 0) * 350;
    case "thennow": return g.rounds.length * 900;
    case "mosaic": return 3000;
  }
}
