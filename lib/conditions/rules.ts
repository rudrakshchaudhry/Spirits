/**
 * Live world conditions (spec §12): shared, pure rules (client + server).
 */
export type Phase = "dawn" | "day" | "dusk" | "night";
export type ConditionTag = "night" | "fog" | "rain" | "blossom";

export type Conditions = {
  at: string;
  phase: Phase;
  isNight: boolean;
  fog: boolean;
  rain: boolean;
  blossom: boolean;
  sunrise: string;
  sunset: string;
  tempC: number | null;
  /** live = Open-Meteo + suncalc; forced = dev panel override */
  source: "live" | "forced" | "fallback";
};

export type ForcedConditions = Partial<Pick<Conditions, "isNight" | "fog" | "rain" | "blossom">>;

export function activeTags(c: Pick<Conditions, "isNight" | "fog" | "rain" | "blossom">): ConditionTag[] {
  const t: ConditionTag[] = [];
  if (c.isNight) t.push("night");
  if (c.fog) t.push("fog");
  if (c.rain) t.push("rain");
  if (c.blossom) t.push("blossom");
  return t;
}

/** Compact string for URLs / cache keys: "night.fog" (sorted), "" when clear. */
export const condKey = (tags: ConditionTag[]) => [...tags].sort().join(".");
export const parseCondKey = (s: string | null | undefined): ConditionTag[] =>
  (s ?? "").split(".").filter((x): x is ConditionTag => ["night", "fog", "rain", "blossom"].includes(x));

/** Blossom season: February–May (spec §12). */
export const isBlossomSeason = (d = new Date()) => {
  const m = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "numeric" }).format(d));
  return m >= 2 && m <= 5;
};

/** Condition-gated keepsakes (spec §10). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- phase reserved for dawn-only keepsakes
export function conditionKeepsakes(tags: ConditionTag[], phase?: Phase): string[] {
  const out: string[] = [];
  if (tags.includes("fog")) out.push("scrap_of_fog");
  if (tags.includes("rain")) out.push("rain_drop");
  if (tags.includes("night")) out.push("moon_dust");
  if (tags.includes("blossom")) out.push("petal");
  return out;
}

export const CONDITION_LABEL: Record<ConditionTag, string> = {
  night: "night",
  fog: "fog",
  rain: "rain",
  blossom: "blossom",
};

/** What /api/conditions returns (client view). */
export type ConditionsView = Conditions & {
  tags: ConditionTag[];
  key: string;
  devAllowed: boolean;
  haze: Record<string, { score: number; prev: number | null; lifting: boolean }>;
  featured: { family: string; rarity: string; neighborhood: string; date: string } | null;
};
