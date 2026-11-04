import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/guest → { email, password } for a fresh guest account.
 * Stage-1 stand-in for Supabase anonymous sign-ins (disabled on this project):
 * the browser signs in with these and keeps them, so progress persists on that
 * device. Upgrading a guest to a magic-link account is roadmap.
 */
export async function POST() {
  const id = randomUUID().slice(0, 8);
  const email = `guest-${id}-${Date.now().toString(36)}@guest.sfspirits.app`;
  const password = randomBytes(24).toString("hex");
  const sb = supabaseAdmin();
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
  await sb.from("profiles").insert({ id: data.user.id, handle: `wanderer-${id}` });
  return NextResponse.json({ email, password });
}
