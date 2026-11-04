import { createHmac } from "node:crypto";

/** Guest-account creation limit per client IP per hour. */
export function guestLimit(env: NodeJS.ProcessEnv = process.env) {
  const n = Number(env.GUEST_LIMIT_PER_HOUR);
  if (Number.isFinite(n) && n > 0) return n;
  return env.ALLOW_DEV_CONDITIONS === "1" ? 100 : 10; // local/demo builds run e2e scripts
}

/** Client IP as set by the platform (Vercel sets x-real-ip / x-forwarded-for). */
export function clientIp(h: Headers): string {
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Salted hash so raw IPs are never stored. */
export function hashIp(ip: string, salt: string) {
  return createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}
