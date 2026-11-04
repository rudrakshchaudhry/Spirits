import { cacheLife, cacheTag } from "next/cache";
import type { ChunkEntities } from "./entities";
import { parseCondKey } from "@/lib/conditions/rules";
import { queryChunk } from "./chunkQuery";

/**
 * Entities + today's spirits for one 64×64-tile chunk (spec §6.2 "Nearby world").
 * Cached per (chunk, date): the world only changes with the daily ingest.
 */
export async function chunkEntities(key: string, date: string, cond = ""): Promise<ChunkEntities> {
  "use cache";
  cacheLife("hours");
  cacheTag("world", `world:${date}`);
  return queryChunk(key, date, parseCondKey(cond));
}
