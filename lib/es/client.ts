import { Client } from "@elastic/elasticsearch";

/**
 * Server-side Elasticsearch client (API routes + ingest scripts). Never import
 * from client components: it needs ELASTICSEARCH_API_KEY.
 */
let client: Client | null = null;

export function es(): Client {
  if (client) return client;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  const node = process.env.ELASTICSEARCH_URL;
  const cloudId = process.env.ELASTIC_CLOUD_ID;
  if (!apiKey || (!node && !cloudId)) {
    throw new Error("Elasticsearch not configured: set ELASTICSEARCH_URL (or ELASTIC_CLOUD_ID) and ELASTICSEARCH_API_KEY");
  }
  client = new Client({
    ...(node ? { node } : { cloud: { id: cloudId! } }),
    auth: { apiKey },
    requestTimeout: 30_000,
  });
  return client;
}

export const INDEX = {
  places: "places",
  spirits: "spirits",
  neighborhoods: "neighborhoods",
  events: "events",
} as const;
