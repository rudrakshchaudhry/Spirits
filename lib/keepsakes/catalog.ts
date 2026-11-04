/**
 * Keepsakes (spec §10): every type, its theme group (drives the +10 "same
 * theme" gift rule), a display name and an icon recipe. Pure + client-safe.
 */
import { BUSINESS_CATEGORIES, EXCLUSIVE_KEEPSAKES, KIND_KEEPSAKES, type RGB, SPECIES_GROUPS } from "@/lib/places/catalog";

export type KeepsakeTheme = "nature" | "sea" | "shop" | "story" | "sky";
export type IconShape = "leaf" | "cone" | "petal" | "shell" | "bean" | "key" | "ticket" | "drop" | "cloud" | "star" | "page" | "coin" | "ribbon" | "fan" | "seed";

export type Keepsake = { type: string; label: string; theme: KeepsakeTheme; shape: IconShape; color: RGB };

const K = (type: string, label: string, theme: KeepsakeTheme, shape: IconShape, color: RGB): Keepsake => ({ type, label, theme, shape, color });

const TABLE: Keepsake[] = [
  // trees & parks
  K("seed_ball", "plane seed ball", "nature", "seed", [150, 120, 70]),
  K("acorn", "acorn", "nature", "seed", [150, 100, 50]),
  K("cypress_cone", "cypress cone", "nature", "cone", [120, 90, 60]),
  K("pine_cone", "pine cone", "nature", "cone", [140, 96, 56]),
  K("redwood_sprig", "redwood sprig", "nature", "leaf", [70, 120, 70]),
  K("gum_leaf", "eucalyptus leaf", "nature", "leaf", [140, 180, 160]),
  K("palm_frond", "palm frond", "nature", "leaf", [100, 170, 80]),
  K("golden_fan_leaf", "golden fan leaf", "nature", "fan", [230, 200, 70]),
  K("magnolia_petal", "magnolia petal", "nature", "petal", [246, 240, 228]),
  K("petal", "blossom petal", "nature", "petal", [250, 180, 210]),
  K("maple_key", "maple key", "nature", "seed", [200, 110, 70]),
  K("olive", "olive", "nature", "seed", [110, 130, 80]),
  K("fig_leaf", "fig leaf", "nature", "leaf", [70, 140, 80]),
  K("glossy_leaf", "glossy leaf", "nature", "leaf", [80, 150, 96]),
  K("red_bristle", "red bristle flower", "nature", "petal", [220, 50, 60]),
  K("seed_pod", "seed pod", "nature", "seed", [170, 150, 80]),
  K("willow_leaf", "willow leaf", "nature", "leaf", [140, 178, 110]),
  K("leaf", "leaf", "nature", "leaf", [104, 160, 90]),
  K("clover", "four-leaf clover", "nature", "leaf", [80, 170, 80]),
  K("pebble", "smooth pebble", "nature", "seed", [160, 160, 170]),
  // the coast & the sky
  K("sea_shell", "sea shell", "sea", "shell", [240, 210, 190]),
  K("scrap_of_fog", "scrap of fog", "sky", "cloud", [220, 228, 236]),
  K("rain_drop", "rain drop", "sky", "drop", [120, 170, 230]),
  K("moon_dust", "moon dust", "sky", "star", [230, 230, 255]),
  // shops
  K("crumb", "pastry crumb", "shop", "bean", [222, 170, 110]),
  K("coffee_bean", "coffee bean", "shop", "bean", [110, 70, 50]),
  K("spice", "pinch of spice", "shop", "bean", [196, 90, 50]),
  K("bottle_cap", "bottle cap", "shop", "coin", [200, 60, 60]),
  K("fruit_sticker", "fruit sticker", "shop", "coin", [240, 200, 70]),
  K("dog_eared_page", "dog-eared page", "shop", "page", [236, 224, 196]),
  K("ribbon", "florist's ribbon", "shop", "ribbon", [214, 110, 160]),
  K("button", "button", "shop", "coin", [160, 90, 170]),
  K("hair_ribbon", "hair ribbon", "shop", "ribbon", [230, 140, 170]),
  K("comb_tooth", "comb tooth", "shop", "page", [210, 200, 190]),
  K("sweatband", "sweatband", "shop", "ribbon", [60, 150, 190]),
  K("ticket_stub", "show ticket", "story", "ticket", [210, 150, 60]),
  K("guitar_pick", "guitar pick", "shop", "coin", [230, 200, 90]),
  K("pet_treat", "pet treat", "shop", "bean", [200, 150, 90]),
  K("brass_screw", "brass screw", "shop", "key", [200, 160, 70]),
  K("receipt", "receipt", "shop", "page", [240, 240, 236]),
  // stories
  K("film_ticket_stub", "film ticket stub", "story", "ticket", [220, 60, 60]),
  K("paint_chip", "paint chip", "story", "page", [70, 140, 220]),
  K("old_brass_key", "old brass key", "story", "key", [212, 172, 88]),
  K("paper_lantern", "paper lantern", "story", "drop", [220, 50, 50]),
  K("papel_picado", "papel picado", "story", "ribbon", [240, 120, 180]),
];

export const KEEPSAKES: Record<string, Keepsake> = Object.fromEntries(TABLE.map((k) => [k.type, k]));

export function keepsake(type: string): Keepsake {
  return KEEPSAKES[type] ?? K(type, type.replace(/_/g, " "), "nature", "star", [200, 200, 200]);
}

/** Keepsakes a spirit may wish for (everything findable as a glint). */
export const WISHABLE = TABLE.map((k) => k.type).filter((t) => t !== "rain_drop" && t !== "moon_dust");

/** Sanity: every keepsake referenced by places is in the table. */
export const REFERENCED = [
  ...Object.values(SPECIES_GROUPS).map((g) => g.keepsake),
  ...Object.values(BUSINESS_CATEGORIES).map((c) => c.keepsake),
  ...Object.values(KIND_KEEPSAKES).flat(),
  ...Object.values(EXCLUSIVE_KEEPSAKES).flat(),
];

export const MAX_STACK = 20;

/** Models sometimes add **bold** / _italics_; the game shows plain text. */
export const stripMarkdown = (s: string) =>
  s
    .replace(/\*{1,3}([^*]+?)\*{1,3}/g, "$1")
    .replace(/(^|[\s(])_{1,2}([^_]+?)_{1,2}(?=[\s.,!?;:)]|$)/g, "$1$2")
    .replace(/\*/g, "")
    .trim();

/** "a sea shell", "an old brass key", "a eucalyptus leaf" (vowel *sound*, not letter). */
export function withArticle(label: string): string {
  const an = /^[aeio]/i.test(label) || (/^u/i.test(label) && !/^(uni|use|usu|ur)/i.test(label));
  return `${/^(eu|ewe)/i.test(label) ? "a" : an ? "an" : "a"} ${label}`;
}

/** The word a riddle must use to point at a keepsake: "palm frond" → "frond", "old brass key" → "key". */
export function keyNoun(type: string): string {
  const words = keepsake(type).label.toLowerCase().replace(/[^a-z\s-]/g, "").split(/[\s-]+/).filter(Boolean);
  return words[words.length - 1] ?? type;
}

const IRREGULAR: Record<string, string> = { leaf: "leaves", tooth: "teeth", knife: "knives" };

const words = (text: string) =>
  stripMarkdown(text).toLowerCase().replace(/['’]/g, "").replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
const labelWords = (type: string) => keepsake(type).label.toLowerCase().replace(/[^a-z\s-]/g, "").split(/[\s-]+/).filter(Boolean);
const pluralForms = (noun: string) =>
  [noun, `${noun}s`, `${noun}es`, IRREGULAR[noun], noun.endsWith("f") ? `${noun.slice(0, -1)}ves` : null].filter(Boolean) as string[];

/** Whole-phrase match of a label ("cypress cone(s)") or its one-word form ("pinecone(s)"), never across words. */
function hasLabelPhrase(ws: string[], type: string): boolean {
  const lw = labelWords(type);
  const last = pluralForms(lw[lw.length - 1]);
  for (let i = 0; i + lw.length <= ws.length; i++) {
    if (lw.slice(0, -1).every((w, j) => ws[i + j] === w) && last.includes(ws[i + lw.length - 1])) return true;
  }
  const compact = lw.join("");
  return lw.length > 1 && ws.some((w) => w === compact || w === `${compact}s`);
}

/** Keepsakes whose label ends in the same noun (gum leaf / fig leaf / leaf …). */
const siblingsOf = (type: string) => Object.keys(KEEPSAKES).filter((t) => t !== type && keyNoun(t) === keyNoun(type));

/**
 * Does the text name this keepsake? The key noun (with plurals) is enough when
 * no other keepsake shares it; otherwise the full label is required, so a
 * pine-cone riddle doesn't pass for a cypress cone.
 */
export function namesKeepsake(text: string, type: string): boolean {
  const ws = words(text);
  if (hasLabelPhrase(ws, type)) return true;
  if (siblingsOf(type).length) return false;
  return pluralForms(keyNoun(type)).some((f) => ws.includes(f));
}

/**
 * Does the text name a SIBLING keepsake — one sharing our noun, like a pine cone
 * when the wish is a cypress cone? Other keepsakes ("coffee beans", "sea shell")
 * are normal scenery words in a riddle and don't count as drift.
 */
export function namesOtherKeepsake(text: string, type: string): boolean {
  const ws = words(text);
  const mine = keepsake(type).label.toLowerCase();
  return siblingsOf(type).some((t) => labelWords(t).length >= 2 && !mine.includes(keepsake(t).label.toLowerCase()) && hasLabelPhrase(ws, t));
}

/** Plain template riddles that always name the keepsake. */
export function templateRiddles(type: string): [string, string] {
  const a = withArticle(keepsake(type).label);
  return [
    `Somewhere across the city lies ${a}. I dream of it most nights.`,
    `Wander to a neighbourhood you rarely visit and look for ${a}.`,
  ];
}

/**
 * Guardrail for wish riddles (generation AND serving): the clearer riddle must
 * name the wished keepsake. If it doesn't, the model drifted (e.g. book riddles
 * for a palm frond), so both riddles are replaced by templates — appending a
 * hint to an off-topic riddle would contradict itself.
 */
export function checkRiddles(r1: string, r2: string, type: string): [string, string] {
  const a = stripMarkdown(r1), b = stripMarkdown(r2);
  const drifted = !namesKeepsake(b, type) || namesOtherKeepsake(a, type) || namesOtherKeepsake(b, type);
  return drifted ? templateRiddles(type) : [a, b];
}
