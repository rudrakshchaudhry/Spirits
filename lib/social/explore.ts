import { chunkHood } from "@/lib/keepsakes/glints";

/**
 * Exploration anti-cheat (crew board + milestones depend on it): only real land
 * chunks, a few per request, and newly explored chunks capped at a plausible
 * walking pace. Re-visits (already explored) are always fine.
 */
export const EXPLORE_LIMITS = { perRequest: 10, newPerWindow: 40, windowMs: 5 * 60_000 };

const VALID = /^\d{1,3}_\d{1,3}$/;

export function admitChunks(requested: unknown, alreadyExplored: Set<string>, recentNew: number) {
  const keys = [...new Set((Array.isArray(requested) ? requested : []).filter((k): k is string => typeof k === "string" && VALID.test(k)))]
    .filter((k) => chunkHood(k) !== null) // land chunks inside a neighbourhood only
    .slice(0, EXPLORE_LIMITS.perRequest);
  const revisits = keys.filter((k) => alreadyExplored.has(k));
  const budget = Math.max(0, EXPLORE_LIMITS.newPerWindow - recentNew);
  const fresh = keys.filter((k) => !alreadyExplored.has(k)).slice(0, budget);
  const deferred = keys.filter((k) => !alreadyExplored.has(k)).slice(budget);
  return { revisits, fresh, deferred };
}
