import type { Glint } from "@/lib/keepsakes/glints";
import type { PlaceKind, SpiritSpawn } from "@/lib/spirits/spawn";

/** One real-world anchor as the client needs it (compact; tile coords). */
export type Entity = {
  id: string;
  kind: PlaceKind;
  /** fractional world-tile position */
  x: number;
  y: number;
  name: string;
  /** look key: species group for trees, category for businesses */
  look?: string;
  /** 0..1 notability (tree size, shop age, …) */
  rank: number;
  /** keepsake types this place yields (glint typing) */
  ks?: string[];
  spirit?: SpiritSpawn;
};

export type ChunkEntities = { key: string; date: string; entities: Entity[] };

export type WorldChunk = ChunkEntities & { glints: Glint[] };
export type WorldResponse = { date: string; window: number; chunks: WorldChunk[] };
