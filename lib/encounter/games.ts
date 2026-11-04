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
export type GameContent = RhythmGame | TriviaGame;

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
  return { type: "rhythm", title: p.kind === "tree" ? "Rustle" : "Rhythm", bpm, notes: 16 + Math.round(d * 12), seed: hash32(p.id), difficulty: d, flavor };
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

export async function gameFor(p: PlaceSrc, rarity: Rarity): Promise<GameContent> {
  return p.kind === "film" ? triviaFor(p, rarity) : rhythmFor(p, rarity);
}

/** Shortest plausible play time (anti-cheat sanity check, spec §15). */
export function minDurationMs(g: GameContent) {
  if (g.type === "rhythm") return Math.round((g.notes * 60_000) / g.bpm * 0.7);
  return g.questions.length * 700;
}
