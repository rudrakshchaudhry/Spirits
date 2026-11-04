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
