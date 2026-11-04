import { windowIndex } from "@/lib/keepsakes/glints";
import { sfDate } from "@/lib/spirits/spawn";
import type { WorldChunk, WorldResponse } from "./entities";

const MAX_BATCH = 16;
const TTL_MS = 10 * 60_000;

/**
 * Client-side per-chunk cache of entities + glints with a short TTL (spec §4.2).
 * Requests made in the same tick are batched into one /api/world call. A cached
 * chunk is stale when the day or the 2-hour glint window changes.
 */
export class EntityStore {
  private cache = new Map<string, { at: number; date: string; win: number; chunk: WorldChunk }>();
  private waiting = new Map<string, { resolve: (c: WorldChunk) => void; reject: (e: unknown) => void }[]>();
  private queued = new Set<string>();
  private scheduled = false;
  /** dev-forced condition key ("" = clear) or null for live */
  private forced: string | null = null;
  /** live condition key, used only to bust HTTP caches when the weather changes */
  private live = "";

  /** Conditions changed: drop the cache (which spirits exist depends on them). */
  setConditions(forced: string | null, liveKey: string) {
    this.forced = forced;
    this.live = liveKey;
    this.cache.clear();
  }

  get(key: string): WorldChunk | undefined {
    const c = this.cache.get(key);
    if (!c || Date.now() - c.at > TTL_MS || c.date !== sfDate() || c.win !== windowIndex()) return undefined;
    return c.chunk;
  }

  load(key: string): Promise<WorldChunk> {
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
    const win = windowIndex();
    try {
      const cond = this.forced !== null ? `&cond=${encodeURIComponent(this.forced)}` : `&ck=${encodeURIComponent(this.live)}`;
      const res = await fetch(`/api/world?chunks=${keys.join(",")}&date=${date}&w=${win}${cond}`);
      if (!res.ok) throw new Error(`world ${res.status}`);
      const body = (await res.json()) as WorldResponse;
      for (const c of body.chunks) {
        this.cache.set(c.key, { at: Date.now(), date: c.date, win: body.window, chunk: c });
        this.waiting.get(c.key)?.forEach((w) => w.resolve(c));
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
