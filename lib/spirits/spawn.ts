/**
 * Deterministic, shared, sparse spawning (spec §7.2).
 * seed = hash(place_id, yyyy-mm-dd PT, condition_bucket) — server and client
 * compute the same answer, so no spawn table is stored.
 */

import type { ConditionTag } from "@/lib/conditions/rules";

export type Family = "tree" | "park" | "shopkeeper" | "ancient" | "echo" | "guardian";
export type Rarity = "common" | "uncommon" | "rare" | "legendary";
export type PlaceKind = "tree" | "park" | "art" | "landmark" | "film" | "business";

export const FAMILY_OF: Record<PlaceKind, Family> = {
  tree: "tree",
  park: "park",
  business: "shopkeeper",
  landmark: "ancient",
  film: "echo",
  art: "guardian",
};

/** 32-bit FNV-1a. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Uniform [0,1) from a string key. */
export const roll = (key: string) => {
  let h = hash32(key);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Today's date in San Francisco, yyyy-mm-dd. */
export function sfDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export type SpawnInput = {
  id: string;
  kind: PlaceKind;
  rank: number;
  tags: string[];
  openedAt?: string;
  /** west side of the city / on the coast (fog spirits live here) */
  foggy?: boolean;
};

export type SpiritSpawn = {
  id: string;
  family: Family;
  rarity: Rarity;
  /** stable per place (not per day) so a spirit always looks the same */
  seed: number;
  /** condition variant (night/fog/rain/blossom) — spec §7.1 "condition spirits" */
  variant?: ConditionTag;
};

const BUMP: Record<Rarity, Rarity> = { common: "uncommon", uncommon: "rare", rare: "legendary", legendary: "legendary" };

/**
 * Condition spirits: a second roll, only while the condition is active and the
 * place qualifies (flowering trees in spring → blossom; west/coast + fog → fog;
 * any place + rain → rain; night → night). +1 rarity tier.
 */
export function conditionSpawn(p: SpawnInput, date: string, tags: ConditionTag[]): SpiritSpawn | null {
  const base = spawnFor(p, date) ?? { rarity: "common" as Rarity };
  const order: [ConditionTag, number, boolean][] = [
    ["blossom", 0.3, p.kind === "tree" && p.tags.includes("flowering")],
    ["fog", 0.06, !!p.foggy],
    ["rain", 0.015, true],
    ["night", 0.015, true],
  ];
  for (const [tag, chance, ok] of order) {
    if (!ok || !tags.includes(tag)) continue;
    if (roll(`${p.id}|${date}|${tag}`) >= chance) continue;
    return { id: `${p.id}:${tag}`, family: FAMILY_OF[p.kind], rarity: BUMP[base.rarity], seed: hash32(`${p.id}:${tag}`), variant: tag };
  }
  return null;
}

const DAY = 86_400_000;

/**
 * Does this place host a spirit today, and which?
 * `condition` is the active condition bucket ("clear" until Checkpoint F).
 */
export function spawnFor(p: SpawnInput, date: string, condition = "clear"): SpiritSpawn | null {
  const family = FAMILY_OF[p.kind];
  let rarity: Rarity;
  switch (p.kind) {
    case "tree": {
      const ancient = p.tags.includes("ancient");
      const notable = p.tags.includes("notable");
      if (!ancient) {
        // base ~5%, raised by age/size and by notable status
        const chance = 0.045 + 0.12 * p.rank ** 3 + (notable ? 0.25 : 0);
        if (roll(`${p.id}|${date}|${condition}`) >= chance) return null;
      }
      rarity = ancient ? "rare" : notable || p.rank > 0.85 ? "uncommon" : "common";
      break;
    }
    case "park":
      rarity = p.rank > 0.45 ? "rare" : "uncommon";
      break;
    case "business": {
      const opened = p.openedAt ? Date.parse(p.openedAt) : NaN;
      const grand = Number.isFinite(opened) && Date.parse(date) - opened < 14 * DAY;
      rarity = grand ? "rare" : "uncommon";
      break;
    }
    case "landmark":
      rarity = "rare";
      break;
    case "film":
      rarity = p.tags.includes("classic") ? "rare" : "uncommon";
      break;
    case "art":
      rarity = "legendary";
      break;
  }
  return { id: `${p.id}:base`, family, rarity, seed: hash32(p.id) };
}
