import { verifyEncounter } from "@/lib/encounter/token";
import { MODELS, mistral } from "@/lib/mistral/client";
import { getCachedCard } from "@/lib/spirits/card";

/**
 * GET /api/encounter/greet?token=…  → text/plain stream (spec §7.3 "Live greeting").
 * mistral-small, streamed; falls back to the cached greeting if the first token
 * hasn't arrived after 2.5 s (or on any error).
 */
const FIRST_TOKEN_MS = 2500;

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
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sentAny = false;
      const timer = setTimeout(() => {
        if (!sentAny) {
          sentAny = true;
          controller.enqueue(encoder.encode(fallback));
          controller.close();
        }
      }, FIRST_TOKEN_MS);
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
        });
        for await (const ev of res) {
          const piece = ev.data.choices[0]?.delta?.content;
          if (typeof piece !== "string" || !piece) continue;
          if (!sentAny) {
            // timer already fired → fallback was sent; drop the live stream
            if (controller.desiredSize === null) return;
            sentAny = true;
            clearTimeout(timer);
          }
          controller.enqueue(encoder.encode(piece));
        }
        clearTimeout(timer);
        if (sentAny) controller.close();
      } catch {
        clearTimeout(timer);
        if (!sentAny) {
          sentAny = true;
          controller.enqueue(encoder.encode(fallback));
          controller.close();
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
