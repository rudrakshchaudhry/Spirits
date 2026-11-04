import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp, guestLimit, hashIp } from "@/lib/social/guestLimit";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/guest → { email, password } for a fresh guest account.
 * Stage-1 stand-in for Supabase anonymous sign-ins (disabled on this project):
 * the browser signs in with these and keeps them, so progress persists on that
 * device. Upgrading a guest to a magic-link account is roadmap.
 */
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  // Abuse guard: at most N new guests per IP per hour (only a salted IP hash is stored).
  const ipHash = hashIp(clientIp(req.headers), process.env.ENCOUNTER_SECRET ?? "sf-spirits");
  const { count } = await sb
    .from("guest_signups")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= guestLimit()) {
    return NextResponse.json({ error: "too many new players from here — try again in a bit" }, { status: 429 });
  }
  const id = randomUUID().slice(0, 8);
  const email = `guest-${id}-${Date.now().toString(36)}@guest.sfspirits.app`;
  const password = randomBytes(24).toString("hex");
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { guest: true },
  });
  if (error || !data.user) {
    console.error("guest create failed", error);
    return NextResponse.json({ error: "could not create guest" }, { status: 500 });
  }
  await Promise.all([
    sb.from("profiles").insert({ id: data.user.id, handle: `wanderer-${id}` }),
    sb.from("guest_signups").insert({ ip_hash: ipHash }),
  ]);
  return NextResponse.json({ email, password });
}
