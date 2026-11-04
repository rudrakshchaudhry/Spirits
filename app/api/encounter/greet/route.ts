import { verifyEncounter } from "@/lib/encounter/token";
import { MODELS, mistral } from "@/lib/mistral/client";
import { getCachedCard } from "@/lib/spirits/card";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/encounter/greet?token=…  → text/plain stream (spec §7.3 "Live greeting").
 * mistral-small, streamed; falls back to the cached greeting if the first token
 * hasn't arrived after 2.5 s (or on any error).
 */
const FIRST_TOKEN_MS = 2500;
const TOTAL_MS = 8000; // hard deadline for the whole live greeting
const GREET_FRESH_MS = 2 * 60_000;
const GREETS_PER_MIN = 6;

/** Shared across instances (rate_hit RPC); on a DB error, fall back to the cached greeting. */
async function allowGreet(playerId: string) {
  const { data, error } = await supabaseAdmin().rpc("rate_hit", { p_key: `greet:${playerId}`, p_window_s: 60, p_max: GREETS_PER_MIN });
  return !error && data === true;
}

function sfMoment() {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(new Date()));
  return h < 5 ? "late night" : h < 11 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claims = verifyEncounter(token);
  if (!claims) return new Response("bad token", { status: 400 });
  const card = await getCachedCard(claims.s);
  if (!card) return new Response("unknown spirit", { status: 404 });

  const fallback = card.greeting;
  const encoder = new TextEncoder();
  // Live greetings cost a model call: only for fresh tokens, and a few per player per minute.
  // Anything over the limit gets the cached greeting.
  const live = Date.now() - claims.t0 < GREET_FRESH_MS && (await allowGreet(claims.u));
  const abort = new AbortController();
  let done = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sentAny = false;
      const finish = (text?: string) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(deadline);
        abort.abort(); // stop the upstream model stream too
        try {
          if (text) controller.enqueue(encoder.encode(text));
          controller.close();
        } catch {
          /* client went away */
        }
      };
      const timer = setTimeout(() => {
        if (!sentAny) finish(fallback);
      }, FIRST_TOKEN_MS);
      // a stream that stalls after its first token still ends (with what was sent so far)
      const deadline = setTimeout(() => finish(sentAny ? undefined : fallback), TOTAL_MS);
      if (!live) return finish(fallback);
      try {
        const res = await mistral().chat.stream({
          model: MODELS.greeting,
          maxTokens: 110,
          temperature: 0.9,
          messages: [
            {
              role: "system",
              content:
                `You are ${card.name}, a spirit in a cosy San Francisco game. Persona: ${card.persona} Voice: ${card.voice_notes}\n` +
                "Greet the wanderer who just approached, in character, in at most 45 words. Warm, all-ages. " +
                "Do not state facts about real people, businesses, films or artworks beyond your persona. No prices, hours, crime or safety talk.",
            },
            {
              role: "user",
              content: `It is ${sfMoment()} in San Francisco. ${claims.trust0 > 60 ? "You already trust this wanderer a little." : "You have never met this wanderer."} Say hello.`,
            },
          ],
        }, { signal: abort.signal });
        for await (const ev of res) {
          if (done) break; // fallback already sent (or the client left): stop the live stream
          const piece = ev.data.choices[0]?.delta?.content;
          if (typeof piece !== "string" || !piece) continue;
          sentAny = true;
          clearTimeout(timer);
          controller.enqueue(encoder.encode(piece));
        }
      } catch {
        /* fall through */
      }
      // an empty or failed stream still ends with the cached greeting
      finish(sentAny ? undefined : fallback);
    },
    cancel() {
      done = true;
      abort.abort();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
