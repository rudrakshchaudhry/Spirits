import { cacheLife } from "next/cache";
import SunCalc from "suncalc";
import { CENTER } from "@/lib/geo/projection";
import { type Conditions, type ConditionTag, type ForcedConditions, activeTags, isBlossomSeason } from "./rules";

/**
 * Live SF conditions (spec §12): Open-Meteo (no key) for fog/rain, suncalc for
 * the sun, month for blossom. Cached 15 min. Falls back to clear + suncalc if
 * the weather API is down.
 */
export async function liveConditions(): Promise<Conditions> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });
  return computeConditions();
}

/** Uncached (scripts / tests). */
export async function computeConditions(now = new Date()): Promise<Conditions> {
  const sun = SunCalc.getTimes(now, CENTER.lat, CENTER.lon);
  const t = now.getTime();
  const isNight = t < sun.dawn.getTime() || t > sun.dusk.getTime();
  const phase =
    isNight ? "night" :
    t < sun.sunriseEnd.getTime() + 45 * 60_000 ? "dawn" :
    t > sun.sunsetStart.getTime() - 45 * 60_000 ? "dusk" : "day";
  let fog = false, rain = false, tempC: number | null = null, source: Conditions["source"] = "live";
  try {
    const u = "https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current=temperature_2m,relative_humidity_2m,precipitation,cloud_cover_low,visibility&timezone=America%2FLos_Angeles";
    const res = await fetch(u, { signal: AbortSignal.timeout(4000) });
    const j = (await res.json()) as { current: { temperature_2m: number; relative_humidity_2m: number; precipitation: number; cloud_cover_low: number; visibility: number } };
    const c = j.current;
    fog = c.visibility < 3000 || (c.cloud_cover_low > 70 && c.relative_humidity_2m > 90);
    rain = c.precipitation > 0;
    tempC = c.temperature_2m;
  } catch {
    source = "fallback";
  }
  return {
    at: now.toISOString(),
    phase, isNight, fog, rain,
    blossom: isBlossomSeason(now),
    sunrise: sun.sunrise.toISOString(),
    sunset: sun.sunset.toISOString(),
    tempC, source,
  };
}

/** Dev overrides are honoured only when the server allows it (local / demo builds). */
export const devConditionsAllowed = () => process.env.ALLOW_DEV_CONDITIONS === "1";

export function applyForced(c: Conditions, forced: ForcedConditions | null): Conditions {
  if (!forced || !devConditionsAllowed()) return c;
  const out = { ...c, ...forced, source: "forced" as const };
  if (forced.isNight !== undefined) out.phase = forced.isNight ? "night" : c.phase === "night" ? "day" : c.phase;
  return out;
}

/** Condition tags in effect for a request (live, or forced via `?cond=` when allowed). */
export async function tagsFor(forcedKey: string | null): Promise<{ tags: ConditionTag[]; cond: Conditions }> {
  const live = await liveConditions();
  if (forcedKey !== null && devConditionsAllowed()) {
    const tags = forcedKey.split(".").filter(Boolean) as ConditionTag[];
    const cond = applyForced(live, { isNight: tags.includes("night"), fog: tags.includes("fog"), rain: tags.includes("rain"), blossom: tags.includes("blossom") });
    return { tags: activeTags(cond), cond };
  }
  return { tags: activeTags(live), cond: live };
}
