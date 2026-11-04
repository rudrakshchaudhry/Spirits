import { sfDate } from "@/lib/spirits/spawn";
import type { Entity, WorldResponse } from "./entities";

const MAX_BATCH = 16;
const TTL_MS = 10 * 60_000;

/**
 * Client-side per-chunk entity cache with a short TTL (spec §4.2). Requests
 * made in the same tick are batched into one /api/world call.
 */
export class EntityStore {
  private cache = new Map<string, { at: number; date: string; entities: Entity[] }>();
  private waiting = new Map<string, { resolve: (e: Entity[]) => void; reject: (e: unknown) => void }[]>();
  private queued = new Set<string>();
  private scheduled = false;

  get(key: string): Entity[] | undefined {
    const c = this.cache.get(key);
    if (!c || Date.now() - c.at > TTL_MS || c.date !== sfDate()) return undefined;
    return c.entities;
  }

  load(key: string): Promise<Entity[]> {
    const hit = this.get(key);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      if (!this.waiting.has(key)) this.waiting.set(key, []);
      this.waiting.get(key)!.push({ resolve, reject });
      this.queued.add(key);
      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => this.flush());
      }
    });
  }

  private flush() {
    this.scheduled = false;
    const keys = [...this.queued];
    this.queued.clear();
    for (let i = 0; i < keys.length; i += MAX_BATCH) this.fetchBatch(keys.slice(i, i + MAX_BATCH));
  }

  private async fetchBatch(keys: string[]) {
    const date = sfDate();
    try {
      const res = await fetch(`/api/world?chunks=${keys.join(",")}&date=${date}`);
      if (!res.ok) throw new Error(`world ${res.status}`);
      const body = (await res.json()) as WorldResponse;
      for (const c of body.chunks) {
        this.cache.set(c.key, { at: Date.now(), date: c.date, entities: c.entities });
        this.waiting.get(c.key)?.forEach((w) => w.resolve(c.entities));
        this.waiting.delete(c.key);
      }
    } catch (e) {
      for (const k of keys) {
        this.waiting.get(k)?.forEach((w) => w.reject(e));
        this.waiting.delete(k);
      }
    }
  }

  evictExcept(keep: Set<string>) {
    for (const k of this.cache.keys()) if (!keep.has(k)) this.cache.delete(k);
  }
}
