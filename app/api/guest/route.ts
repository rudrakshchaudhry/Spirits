import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { clientKey, guestLimit, hashIp, ipSalt } from "@/lib/social/guestLimit";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/guest → { email, password } for a fresh guest account.
 * Stand-in for Supabase anonymous sign-ins (disabled on this project): the
 * browser signs in with these and keeps them, so progress persists on that
 * device. Rate-limited per client network (salted hash only, never the IP).
 */
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const salt = ipSalt();
  if (!salt) return NextResponse.json({ error: "server misconfigured" }, { status: 503 });
  const { key, known } = clientKey(req.headers);
  // Atomic claim (advisory lock → count → insert) so a parallel burst can't slip through.
  const { data: ok, error: limitErr } = await sb.rpc("claim_guest_slot", {
    p_hash: hashIp(key, salt),
    p_limit: known ? guestLimit() : guestLimit() * 5,
  });
  if (limitErr) {
    console.error("guest rate limit check failed", limitErr);
    return NextResponse.json({ error: "please try again in a moment" }, { status: 503 }); // fail closed
  }
  if (!ok) return NextResponse.json({ error: "Lots of new players from this network — please try again in a little while." }, { status: 429 });

  const id = randomUUID().slice(0, 8);
  const email = `guest-${id}-${Date.now().toString(36)}@guest.sfspirits.app`;
  const password = randomBytes(24).toString("hex");
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { guest: true } });
  if (error || !data.user) {
    console.error("guest create failed", error);
    return NextResponse.json({ error: "could not create guest" }, { status: 500 });
  }
  const { error: profErr } = await sb.from("profiles").insert({ id: data.user.id, handle: `wanderer-${id}` });
  if (profErr) console.error("guest profile insert failed", profErr);
  return NextResponse.json({ email, password });
}
