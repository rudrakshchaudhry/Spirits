/**
 * Data → game lookups shared by ingest, server and client:
 *  - tree species → species group (look, palette, keepsake, flowering)
 *  - business NAICS/name → category (palette, keepsake)
 *  - place kind/tags → keepsake types (spec §10)
 */

export type RGB = [number, number, number];

// ───────────────────────── trees ─────────────────────────
export type SpeciesGroup = {
  key: string;
  label: string;
  /** canopy, canopy-highlight, trunk */
  palette: [RGB, RGB, RGB];
  /** silhouette used by the tree sprite + leaf-ear shape on the spirit */
  shape: "round" | "conical" | "palm" | "weeping" | "fan" | "tall";
  keepsake: string;
  flowering?: boolean;
  /** blossom colour, if flowering */
  bloom?: RGB;
};

export const SPECIES_GROUPS: Record<string, SpeciesGroup> = {
  plane: { key: "plane", label: "London plane", palette: [[86, 140, 70], [128, 176, 92], [150, 130, 104]], shape: "round", keepsake: "seed_ball" },
  oak: { key: "oak", label: "oak", palette: [[60, 108, 56], [96, 146, 74], [104, 78, 56]], shape: "round", keepsake: "acorn" },
  cypress: { key: "cypress", label: "cypress", palette: [[42, 88, 62], [70, 120, 82], [92, 66, 50]], shape: "conical", keepsake: "cypress_cone" },
  pine: { key: "pine", label: "pine", palette: [[38, 92, 70], [64, 128, 92], [98, 70, 52]], shape: "conical", keepsake: "pine_cone" },
  redwood: { key: "redwood", label: "redwood", palette: [[46, 96, 64], [72, 128, 84], [140, 74, 52]], shape: "tall", keepsake: "redwood_sprig" },
  eucalyptus: { key: "eucalyptus", label: "eucalyptus", palette: [[110, 150, 128], [150, 184, 160], [196, 184, 168]], shape: "tall", keepsake: "gum_leaf" },
  palm: { key: "palm", label: "palm", palette: [[84, 148, 72], [124, 184, 96], [150, 120, 84]], shape: "palm", keepsake: "palm_frond" },
  ginkgo: { key: "ginkgo", label: "ginkgo", palette: [[150, 176, 64], [212, 196, 80], [120, 96, 70]], shape: "fan", keepsake: "golden_fan_leaf" },
  magnolia: { key: "magnolia", label: "magnolia", palette: [[46, 102, 64], [80, 136, 84], [110, 92, 76]], shape: "round", keepsake: "magnolia_petal", flowering: true, bloom: [246, 240, 228] },
  cherry: { key: "cherry", label: "flowering cherry", palette: [[120, 70, 90], [214, 132, 168], [96, 64, 58]], shape: "round", keepsake: "petal", flowering: true, bloom: [250, 186, 210] },
  pear: { key: "pear", label: "ornamental pear", palette: [[78, 138, 74], [120, 172, 98], [104, 84, 66]], shape: "round", keepsake: "petal", flowering: true, bloom: [248, 248, 236] },
  maple: { key: "maple", label: "maple", palette: [[150, 66, 50], [210, 104, 64], [100, 72, 56]], shape: "round", keepsake: "maple_key" },
  olive: { key: "olive", label: "olive", palette: [[110, 132, 96], [150, 168, 128], [116, 100, 80]], shape: "round", keepsake: "olive" },
  fig: { key: "fig", label: "fig", palette: [[40, 104, 58], [72, 140, 80], [120, 104, 88]], shape: "round", keepsake: "fig_leaf" },
  myrtle: { key: "myrtle", label: "myrtle", palette: [[56, 112, 70], [92, 150, 96], [140, 100, 76]], shape: "round", keepsake: "glossy_leaf" },
  bottlebrush: { key: "bottlebrush", label: "bottlebrush", palette: [[70, 118, 70], [110, 154, 92], [104, 80, 62]], shape: "weeping", keepsake: "red_bristle", flowering: true, bloom: [220, 50, 60] },
  xmas: { key: "xmas", label: "New Zealand Christmas tree", palette: [[64, 108, 74], [100, 144, 100], [110, 86, 70]], shape: "round", keepsake: "red_bristle", flowering: true, bloom: [214, 40, 50] },
  jacaranda: { key: "jacaranda", label: "jacaranda", palette: [[92, 120, 80], [160, 130, 210], [104, 84, 70]], shape: "round", keepsake: "petal", flowering: true, bloom: [168, 132, 226] },
  acacia: { key: "acacia", label: "acacia", palette: [[72, 116, 70], [130, 160, 84], [100, 80, 62]], shape: "round", keepsake: "seed_pod", flowering: true, bloom: [244, 220, 80] },
  willow: { key: "willow", label: "willow", palette: [[96, 140, 84], [140, 178, 110], [110, 92, 70]], shape: "weeping", keepsake: "willow_leaf" },
  other: { key: "other", label: "street tree", palette: [[66, 122, 68], [104, 160, 90], [110, 86, 66]], shape: "round", keepsake: "leaf" },
};

const GENUS_TO_GROUP: [RegExp, string][] = [
  [/^platanus/i, "plane"],
  [/^(quercus)/i, "oak"],
  [/^(cupressus|hesperocyparis|juniperus|chamaecyparis|thuja)/i, "cypress"],
  [/^(pinus|cedrus|araucaria|picea|abies|podocarpus|afrocarpus)/i, "pine"],
  [/^(sequoia|metasequoia|sequoiadendron)/i, "redwood"],
  [/^(eucalyptus|corymbia|melaleuca|lophostemon)/i, "eucalyptus"],
  [/^(washingtonia|phoenix|syagrus|trachycarpus|cordyline|archontophoenix|brahea|chamaerops|butia|dracaena)/i, "palm"],
  [/^ginkgo/i, "ginkgo"],
  [/^magnolia/i, "magnolia"],
  [/^prunus/i, "cherry"],
  [/^(pyrus|malus|crataegus)/i, "pear"],
  [/^acer/i, "maple"],
  [/^olea/i, "olive"],
  [/^ficus/i, "fig"],
  [/^(tristaniopsis|tristania|arbutus|lagunaria|myoporum|laurus|ligustrum|eriobotrya|pittosporum|maytenus|leptospermum|geijera|lyonothamnus)/i, "myrtle"],
  [/^callistemon/i, "bottlebrush"],
  [/^metrosideros/i, "xmas"],
  [/^jacaranda/i, "jacaranda"],
  [/^acacia/i, "acacia"],
  [/^(salix|agonis|schinus)/i, "willow"],
];

/** "Platanus x hispanica :: Sycamore, London Plane" → { scientific, common, group } */
export function parseSpecies(raw: string | undefined) {
  const [sci = "", common = ""] = (raw ?? "").split("::").map((s) => s.trim());
  const group = GENUS_TO_GROUP.find(([re]) => re.test(sci))?.[1] ?? "other";
  const key = sci.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unknown";
  return { scientific: sci, common: common || sci, group, key };
}

// ───────────────────────── businesses ─────────────────────────
export type BusinessCategory = {
  key: string;
  label: string;
  palette: [RGB, RGB]; // awning, accent
  keepsake: string;
  hat: "chef" | "beret" | "cup" | "book" | "flower" | "bow" | "headband" | "cap" | "tophat" | "bell";
};

export const BUSINESS_CATEGORIES: Record<string, BusinessCategory> = {
  bakery: { key: "bakery", label: "bakery", palette: [[222, 170, 110], [250, 232, 196]], keepsake: "crumb", hat: "beret" },
  cafe: { key: "cafe", label: "café", palette: [[120, 80, 56], [232, 210, 180]], keepsake: "coffee_bean", hat: "cup" },
  restaurant: { key: "restaurant", label: "restaurant", palette: [[196, 64, 56], [250, 236, 220]], keepsake: "spice", hat: "chef" },
  bar: { key: "bar", label: "bar", palette: [[90, 50, 96], [240, 196, 90]], keepsake: "bottle_cap", hat: "tophat" },
  grocery: { key: "grocery", label: "market", palette: [[70, 140, 70], [240, 220, 120]], keepsake: "fruit_sticker", hat: "cap" },
  bookstore: { key: "bookstore", label: "bookstore", palette: [[70, 90, 140], [236, 224, 196]], keepsake: "dog_eared_page", hat: "book" },
  florist: { key: "florist", label: "florist", palette: [[214, 110, 160], [250, 240, 200]], keepsake: "ribbon", hat: "flower" },
  clothing: { key: "clothing", label: "boutique", palette: [[160, 90, 170], [246, 220, 236]], keepsake: "button", hat: "bow" },
  salon: { key: "salon", label: "salon", palette: [[230, 140, 170], [250, 236, 244]], keepsake: "hair_ribbon", hat: "bow" },
  barber: { key: "barber", label: "barbershop", palette: [[210, 60, 60], [60, 90, 180]], keepsake: "comb_tooth", hat: "cap" },
  fitness: { key: "fitness", label: "gym", palette: [[60, 150, 190], [240, 240, 240]], keepsake: "sweatband", hat: "headband" },
  arts: { key: "arts", label: "arts venue", palette: [[210, 150, 60], [60, 40, 90]], keepsake: "ticket_stub", hat: "beret" },
  music: { key: "music", label: "music shop", palette: [[40, 40, 60], [230, 200, 90]], keepsake: "guitar_pick", hat: "tophat" },
  pets: { key: "pets", label: "pet shop", palette: [[230, 170, 80], [250, 240, 220]], keepsake: "pet_treat", hat: "bow" },
  hardware: { key: "hardware", label: "hardware store", palette: [[200, 120, 40], [80, 80, 90]], keepsake: "brass_screw", hat: "cap" },
  shop: { key: "shop", label: "shop", palette: [[90, 130, 170], [240, 230, 210]], keepsake: "receipt", hat: "bell" },
};

/** Consumer-facing NAICS prefixes → category. Anything not listed is skipped. */
const NAICS: [string, string][] = [
  ["311811", "bakery"], ["445291", "bakery"],
  ["722515", "cafe"],
  ["722511", "restaurant"], ["722513", "restaurant"], ["722514", "restaurant"],
  ["722410", "bar"], ["4248", "bar"],
  ["4451", "grocery"], ["4452", "grocery"], ["445298", "grocery"], ["445230", "grocery"],
  ["451211", "bookstore"], ["459210", "bookstore"],
  ["453110", "florist"], ["459310", "florist"],
  ["448", "clothing"], ["4581", "clothing"], ["4582", "clothing"], ["4583", "clothing"],
  ["812112", "salon"], ["812113", "salon"], ["812111", "barber"],
  ["713940", "fitness"], ["713950", "arts"], ["712", "arts"], ["7111", "arts"],
  ["451140", "music"], ["459140", "music"],
  ["453910", "pets"], ["459910", "pets"], ["812910", "pets"],
  ["4441", "hardware"], ["444140", "hardware"],
  ["4511", "shop"], ["4591", "shop"], ["4532", "shop"], ["4592", "shop"], ["4539", "shop"],
  ["4593", "shop"], ["455", "shop"], ["4521", "shop"], ["4483", "shop"], ["4482", "shop"],
];

const NAME_HINTS: [RegExp, string][] = [
  [/\b(bakery|bakeshop|panader[ií]a|boulangerie|patisserie|p[aâ]tisserie|donut|doughnut|bagel)/i, "bakery"],
  [/\b(caf[eé]|coffee|espresso|roaster|tea house|teahouse|boba)\b/i, "cafe"],
  [/\b(books?|bookstore|bookshop|libreria)\b/i, "bookstore"],
  [/\b(flowers?|florist|floral)\b/i, "florist"],
  [/\b(barber)/i, "barber"],
  [/\b(records|music)\b/i, "music"],
];

export function businessCategory(naics: string | undefined, name: string): string | null {
  const code = (naics ?? "").trim();
  if (code.length < 3) return null; // generic sector codes ("72") are too vague
  const byCode = NAICS.find(([p]) => code.startsWith(p))?.[1];
  if (!byCode) return null;
  // Name can refine a broad code (a "restaurant" called X Bakery is a bakery)
  if (["restaurant", "cafe", "shop", "grocery", "arts"].includes(byCode)) {
    const hint = NAME_HINTS.find(([re]) => re.test(name))?.[1];
    if (hint) return hint;
  }
  return byCode;
}

// ───────────────────────── keepsakes (spec §10) ─────────────────────────
export const KIND_KEEPSAKES: Record<string, string[]> = {
  film: ["film_ticket_stub"],
  art: ["paint_chip"],
  landmark: ["old_brass_key"],
  park: ["clover", "pebble"],
};

/** Neighbourhoods on the Pacific / Golden Gate shore (fog spirits, sea-shell keepsakes). */
export const COASTAL_HOODS = new Set([
  "Outer Richmond", "Sunset/Parkside", "Seacliff", "Lincoln Park", "Lakeshore", "Golden Gate Park", "Presidio",
]);
/** Keepsakes found only in specific neighbourhoods (drives trading, spec §10). */
export const EXCLUSIVE_KEEPSAKES: Record<string, string[]> = {
  "Outer Richmond": ["sea_shell"],
  "Sunset/Parkside": ["sea_shell"],
  Lakeshore: ["sea_shell"],
  "Twin Peaks": ["scrap_of_fog"],
  Chinatown: ["paper_lantern"],
  Mission: ["papel_picado"],
};
