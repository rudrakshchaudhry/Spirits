import { createHmac } from "node:crypto";

/**
 * Guest-account creation limit per client network per hour. Generous enough
 * for a shared venue wifi; strict enough to stop scripted account minting.
 */
export function guestLimit(env: NodeJS.ProcessEnv = process.env) {
  const n = Number(env.GUEST_LIMIT_PER_HOUR);
  if (Number.isFinite(n) && n > 0) return n;
  return env.ALLOW_DEV_CONDITIONS === "1" ? 100 : 30;
}

/**
 * Rate-limit key from the platform-set client IP. Vercel overwrites
 * x-real-ip / x-forwarded-for, so they're trustworthy there; on other hosts put
 * a proxy in front that does the same. IPv6 is keyed by its /64 prefix so a
 * host can't rotate addresses inside its own subnet. With no header at all the
 * request lands in a shared "unknown" bucket (with a larger limit).
 */
export function clientKey(h: Headers): { key: string; known: boolean } {
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return { key: "unknown", known: false };
  if (ip.includes(":")) {
    const groups = expandV6(ip);
    if (groups) return { key: groups.slice(0, 4).join(":") + "::/64", known: true };
  }
  return { key: ip, known: true };
}

function expandV6(ip: string): string[] | null {
  const clean = ip.replace(/^\[|\]$/g, "").split("%")[0];
  if (clean.includes(".")) return null; // v4-mapped: treat as opaque
  const [head, tail = ""] = clean.split("::");
  const h = head ? head.split(":") : [];
  const t = clean.includes("::") ? (tail ? tail.split(":") : []) : [];
  const fill = clean.includes("::") ? 8 - h.length - t.length : 0;
  const all = [...h, ...Array(Math.max(0, fill)).fill("0"), ...t];
  return all.length === 8 ? all.map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")) : null;
}

/** Salted hash so raw IPs are never stored. The salt is a server-only secret. */
export function hashIp(key: string, salt: string) {
  return createHmac("sha256", salt).update(key).digest("hex").slice(0, 32);
}

export function ipSalt(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.IP_HASH_SALT || env.SUPABASE_SERVICE_ROLE_KEY || null;
}
