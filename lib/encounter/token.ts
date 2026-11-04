import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed per-encounter token (spec §15 "Authority"). The client carries it from
 * /start to /play; the server trusts only what it signed.
 */
export type EncounterClaims = {
  u: string; // player id
  s: string; // spirit id
  p: string; // place id
  t0: number; // started at (ms)
  trust0: number;
  game: "rhythm" | "trivia" | "rush" | "thennow" | "mosaic";
  /** minimum plausible game duration (ms) */
  minMs: number;
  exp: number;
};

const secret = () => {
  const s = process.env.ENCOUNTER_SECRET;
  if (!s) throw new Error("ENCOUNTER_SECRET missing");
  return s;
};

export function signEncounter(c: EncounterClaims): string {
  const body = Buffer.from(JSON.stringify(c)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyEncounter(token: string): EncounterClaims | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expect = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
  const c = JSON.parse(Buffer.from(body, "base64url").toString()) as EncounterClaims;
  return c.exp > Date.now() ? c : null;
}
