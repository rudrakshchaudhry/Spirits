import { CHUNK_TILES, chunkKey } from "@/lib/geo/projection";
import { T, isSolidTile } from "./terrain";

export type Manifest = {
  version: string;
  chunkTiles: number;
  tilesW: number;
  tilesH: number;
  chunksW: number;
  chunksH: number;
  chunks: string[];
};

const DEEP_CHUNK = new Uint8Array(CHUNK_TILES * CHUNK_TILES).fill(T.DEEP * 16);

/** Client-side terrain chunk cache. Missing-from-manifest chunks are open water. */
export class ChunkStore {
  private data = new Map<string, Uint8Array>();
  private pending = new Map<string, Promise<Uint8Array>>();
  private present: Set<string>;

  constructor(readonly manifest: Manifest) {
    this.present = new Set(manifest.chunks);
  }

  static async load(): Promise<ChunkStore> {
    const res = await fetch(`/chunks/manifest.json?t=${Date.now()}`);
    if (!res.ok) throw new Error("Terrain manifest missing. Run `npm run bake`.");
    return new ChunkStore(await res.json());
  }

  inWorld(cx: number, cy: number) {
    return cx >= 0 && cy >= 0 && cx < this.manifest.chunksW && cy < this.manifest.chunksH;
  }

  get(cx: number, cy: number): Uint8Array | undefined {
    const key = chunkKey(cx, cy);
    if (!this.present.has(key)) return DEEP_CHUNK;
    return this.data.get(key);
  }

  fetch(cx: number, cy: number): Promise<Uint8Array> {
    const key = chunkKey(cx, cy);
    if (!this.present.has(key)) return Promise.resolve(DEEP_CHUNK);
    const have = this.data.get(key);
    if (have) return Promise.resolve(have);
    let p = this.pending.get(key);
    if (!p) {
      p = fetch(`/chunks/${key}.bin?v=${this.manifest.version}`)
        .then((r) => {
          if (!r.ok) throw new Error(`chunk ${key}: ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const arr = new Uint8Array(buf);
          this.data.set(key, arr);
          this.pending.delete(key);
          return arr;
        })
        .catch((e) => {
          this.pending.delete(key);
          throw e;
        });
      this.pending.set(key, p);
    }
    return p;
  }

  /** Tile byte at world tile coords, or undefined if that chunk isn't loaded yet. */
  tileAt(tx: number, ty: number): number | undefined {
    const cx = Math.floor(tx / CHUNK_TILES);
    const cy = Math.floor(ty / CHUNK_TILES);
    if (!this.inWorld(cx, cy)) return T.DEEP * 16;
    const chunk = this.get(cx, cy);
    if (!chunk) return undefined;
    return chunk[(ty - cy * CHUNK_TILES) * CHUNK_TILES + (tx - cx * CHUNK_TILES)];
  }

  /** Unloaded chunks count as solid so you can't walk into the void. */
  isSolid(tx: number, ty: number): boolean {
    const t = this.tileAt(tx, ty);
    return t === undefined || isSolidTile(t);
  }

  evictExcept(keep: Set<string>) {
    for (const k of this.data.keys()) if (!keep.has(k)) this.data.delete(k);
  }
}
