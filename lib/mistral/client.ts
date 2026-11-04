import { Mistral } from "@mistralai/mistralai";

let client: Mistral | null = null;
export function mistral(): Mistral {
  if (client) return client;
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY missing");
  client = new Mistral({ apiKey, timeoutMs: 25_000 });
  return client;
}

/** Exact models used (spec §3), named here so the pitch can quote them. */
export const MODELS = {
  persona: "mistral-large-latest", // spirit card generation (JSON mode)
  greeting: "mistral-small-latest", // live streamed greeting
  embed: "mistral-embed", // place embeddings (1024-d)
  moderation: "mistral-moderation-2603",
} as const;

/** True if Mistral moderation flags any of the texts. */
export async function flagged(texts: string[]): Promise<boolean> {
  const res = await mistral().classifiers.moderate({ model: MODELS.moderation, inputs: texts });
  return res.results.some((r) => Object.values(r.categories ?? {}).some(Boolean));
}
