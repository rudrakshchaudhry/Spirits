import Phaser from "phaser";
import { bus } from "@/lib/game/bus";
import { type SpiritRef, useGame } from "@/lib/game/store";
import { CHUNK_TILES, TILE_PX, chunkKey, latLonToTile, tileToLatLon } from "@/lib/geo/projection";
import type { ChunkStore } from "@/lib/world/chunks";
import type { Entity } from "@/lib/world/entities";
import { EntityStore } from "@/lib/world/entityStore";
import { type Hood, hoodAt, taglineFor } from "@/lib/world/neighborhoods";
import { TERRAIN_COLORS, TERRAIN_COUNT, T, terrainOf } from "@/lib/world/terrain";
import { WANDERER_FRAME, drawTileset, drawWanderer } from "./art";
import { markerTexture, treeSizeFor, treeTexture } from "./entityArt";
import { spiritTexture } from "./spiritArt";

export type WorldInit = {
  chunks: ChunkStore;
  hoods: Hood[];
  spawn: { lat: number; lon: number };
  noclip: boolean;
};

/** Walk speed (spec §4.1): ~10 tiles/s. Shift jogs at 2×. */
const SPEED = 10;
/** Player collision box, in tiles, relative to the feet position. */
const BOX = { halfW: 0.3, top: 0.35, bottom: 0.02 };
/** How close (tiles) you must be for the "meet" prompt; clicks work a bit further out. */
const REACH = 2.6;
const CLICK_REACH = 6;
/** Extra tiles beyond the camera view to keep loaded. */
const LOAD_MARGIN = 24;

type ChunkLayer = {
  map: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
  /** entity + spirit sprites living in this chunk */
  objects: Phaser.GameObjects.GameObject[];
};

export type LiveSpirit = { entity: Entity; sprite: Phaser.GameObjects.Sprite; x: number; y: number };

/** 8 neighbour offsets; a spirit picks one (by seed) to stand beside its anchor. */
const AROUND: [number, number][] = [[1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1], [0, -1], [1, -1], [-1, -1]];

export class WorldScene extends Phaser.Scene {
  private chunks!: ChunkStore;
  private hoods!: Hood[];
  private noclip = false;
  private pos = { x: 0, y: 0 };
  private facing: "down" | "left" | "right" | "up" = "down";
  private player!: Phaser.GameObjects.Sprite;
  private layers = new Map<string, ChunkLayer>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private spawned = false;
  private lastRange = "";
  private lastPublish = 0;
  private lastHoodCheck = 0;
  private currentHood: string | null = null;
  private lastNearCheck = 0;
  private highlighted: Phaser.GameObjects.Sprite | null = null;
  private unsub: (() => void)[] = [];
  private entities = new EntityStore();
  /** today's visible spirits, keyed by spirit id (Checkpoint C uses this for approach) */
  readonly spirits = new Map<string, LiveSpirit>();

  constructor() {
    super("world");
  }

  init(data: WorldInit) {
    this.chunks = data.chunks;
    this.hoods = data.hoods;
    this.noclip = data.noclip;
    const t = latLonToTile(data.spawn.lat, data.spawn.lon);
    this.pos = { x: t.x, y: t.y };
  }

  create() {
    this.makeTextures();
    this.cameras.main.setBackgroundColor(`rgb(${TERRAIN_COLORS[T.DEEP].join(",")})`);
    this.cameras.main.setRoundPixels(true);
    this.applyZoom();
    this.scale.on("resize", this.applyZoom, this);

    this.player = this.add.sprite(this.pos.x * TILE_PX, this.pos.y * TILE_PX, "wanderer", "down-0");
    this.player.setOrigin(0.5, 1).setDepth(10).setVisible(false);
    this.makeAnims();
    this.cameras.main.startFollow(this.player, true, 0.18, 0.18);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,E,SPACE,ENTER,B") as Record<string, Phaser.Input.Keyboard.Key>;
    // Event-based (not JustDown): a tap shorter than one frame still counts.
    const meet = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const st = useGame.getState();
      if (!st.encounter && !st.atlasOpen && st.nearby) useGame.setState({ encounter: st.nearby });
    };
    kb.on("keydown-E", meet);
    kb.on("keydown-SPACE", meet);
    kb.on("keydown-ENTER", meet);
    kb.on("keydown-B", (e: KeyboardEvent) => {
      if (e.repeat) return;
      const st = useGame.getState();
      if (!st.encounter) useGame.setState({ atlasOpen: !st.atlasOpen });
    });
    this.makeHeart();

    this.unsub.push(
      bus.on("player:teleport", ({ x, y }) => {
        this.pos = { x, y };
        this.spawned = false;
        this.player.setVisible(false);
        this.placeOnWalkable();
      }),
    );
    this.unsub.push(
      bus.on("spirit:befriended", ({ spiritId }) => {
        const live = this.spirits.get(spiritId);
        if (live) this.addHeart(live.sprite);
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsub.forEach((u) => u()));

    this.placeOnWalkable();
  }

  // ───────────────────────── setup ─────────────────────────
  private makeTextures() {
    if (!this.textures.exists("tiles")) {
      const tex = this.textures.createCanvas("tiles", 16 * TILE_PX, TERRAIN_COUNT * TILE_PX)!;
      drawTileset(tex.getContext());
      tex.refresh();
    }
    if (!this.textures.exists("wanderer")) {
      const F = WANDERER_FRAME;
      const tex = this.textures.createCanvas("wanderer", F * 3, F * 4)!;
      drawWanderer(tex.getContext());
      tex.refresh();
      ["down", "left", "right", "up"].forEach((d, di) => {
        for (let f = 0; f < 3; f++) tex.add(`${d}-${f}`, 0, f * F, di * F, F, F);
      });
    }
  }

  private makeHeart() {
    if (this.textures.exists("heart")) return;
    const tex = this.textures.createCanvas("heart", 7, 6)!;
    const c = tex.getContext();
    c.fillStyle = "#e8506a";
    for (const [x, y, w] of [[1, 0, 2], [4, 0, 2], [0, 1, 7], [0, 2, 7], [1, 3, 5], [2, 4, 3], [3, 5, 1]] as const) c.fillRect(x, y, w, 1);
    c.fillStyle = "#ffd0da";
    c.fillRect(1, 1, 1, 1);
    tex.refresh();
  }

  private addHeart(sprite: Phaser.GameObjects.Sprite) {
    if (sprite.getData("heart")) return;
    const h = this.add.image(sprite.x + 7, sprite.y - 24, "heart").setDepth(sprite.depth + 1);
    sprite.setData("heart", h);
    sprite.once(Phaser.GameObjects.Events.DESTROY, () => h.destroy());
  }

  private refOf(live: LiveSpirit): SpiritRef {
    const e = live.entity, sp = e.spirit!;
    return { spiritId: sp.id, placeId: e.id, kind: e.kind, family: sp.family, rarity: sp.rarity, look: e.look, seed: sp.seed };
  }

  /** Nearest spirit within REACH → store (prompt) + gentle highlight. */
  private updateNearby() {
    let best: LiveSpirit | null = null, bestD = REACH;
    for (const live of this.spirits.values()) {
      const d = Math.hypot(live.x - this.pos.x, live.y - this.pos.y);
      if (d < bestD) { bestD = d; best = live; }
    }
    if (this.highlighted && this.highlighted !== best?.sprite) this.highlighted.setScale(1);
    this.highlighted = best?.sprite ?? null;
    this.highlighted?.setScale(1.15);
    const cur = useGame.getState().nearby;
    const next = best ? this.refOf(best) : null;
    if (cur?.spiritId !== next?.spiritId) useGame.setState({ nearby: next });
  }

  private makeAnims() {
    for (const d of ["down", "left", "right", "up"]) {
      if (this.anims.exists(`walk-${d}`)) continue;
      this.anims.create({
        key: `walk-${d}`,
        frames: [1, 0, 2, 0].map((f) => ({ key: "wanderer", frame: `${d}-${f}` })),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  private applyZoom() {
    const w = this.scale.width, h = this.scale.height;
    // ~24–32 tiles across the short side, integer zoom for crisp pixels
    const zoom = Phaser.Math.Clamp(Math.round(Math.min(w, h) / (TILE_PX * 18)), 2, 4);
    this.cameras.main.setZoom(zoom);
  }

  /** Load chunks around pos, then nudge onto the nearest walkable tile. */
  private async placeOnWalkable() {
    this.player.setPosition(this.pos.x * TILE_PX, this.pos.y * TILE_PX);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    const { cx, cy } = { cx: Math.floor(this.pos.x / CHUNK_TILES), cy: Math.floor(this.pos.y / CHUNK_TILES) };
    const loads: Promise<unknown>[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (this.chunks.inWorld(cx + dx, cy + dy)) loads.push(this.chunks.fetch(cx + dx, cy + dy));
    await Promise.allSettled(loads);
    const sx = Math.floor(this.pos.x), sy = Math.floor(this.pos.y);
    outer: for (let r = 0; r < 60; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sx + dx + 0.5, y = sy + dy + 0.8;
        if (!this.blocked(x, y)) { this.pos = { x, y }; break outer; }
      }
    }
    this.player.setPosition(this.pos.x * TILE_PX, this.pos.y * TILE_PX).setVisible(true);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.spawned = true;
    this.lastRange = "";
    useGame.setState({ ready: true });
  }

  // ───────────────────────── per-frame ─────────────────────────
  update(time: number, deltaMs: number) {
    this.streamChunks();
    if (!this.spawned) return;

    const dt = Math.min(deltaMs, 50) / 1000;
    const k = this.keys;
    const st = useGame.getState();
    const busy = !!st.encounter || st.atlasOpen;
    if (busy) {
      this.player.anims.stop();
      this.player.setFrame(`${this.facing}-0`);
      return;
    }
    if (time - this.lastNearCheck > 120) {
      this.lastNearCheck = time;
      this.updateNearby();
    }

    let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const joy = useGame.getState().joystick;
    if (ix === 0 && iy === 0 && (joy.x !== 0 || joy.y !== 0)) { ix = joy.x; iy = joy.y; }
    const mag = Math.hypot(ix, iy);

    if (mag > 0.05) {
      const n = Math.min(1, mag);
      const speed = SPEED * (k.SHIFT.isDown ? 2 : 1) * n;
      const vx = (ix / mag) * speed * dt, vy = (iy / mag) * speed * dt;
      // axis-separated so you slide along walls
      if (!this.blocked(this.pos.x + vx, this.pos.y)) this.pos.x += vx;
      if (!this.blocked(this.pos.x, this.pos.y + vy)) this.pos.y += vy;
      this.facing = Math.abs(ix) > Math.abs(iy) ? (ix > 0 ? "right" : "left") : iy > 0 ? "down" : "up";
      this.player.anims.play(`walk-${this.facing}`, true);
    } else {
      this.player.anims.stop();
      this.player.setFrame(`${this.facing}-0`);
    }
    this.player.setPosition(this.pos.x * TILE_PX, this.pos.y * TILE_PX);
    this.player.setDepth(this.player.y + 0.5);

    if (time - this.lastPublish > 100) {
      this.lastPublish = time;
      const ll = tileToLatLon(this.pos.x, this.pos.y);
      useGame.setState({ player: { x: this.pos.x, y: this.pos.y, lat: ll.lat, lon: ll.lon } });
    }
    if (time - this.lastHoodCheck > 250) {
      this.lastHoodCheck = time;
      this.checkNeighborhood();
    }
  }

  private blocked(x: number, y: number) {
    if (this.noclip) return false;
    const x0 = Math.floor(x - BOX.halfW), x1 = Math.floor(x + BOX.halfW);
    const y0 = Math.floor(y - BOX.top), y1 = Math.floor(y - BOX.bottom);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) if (this.chunks.isSolid(tx, ty)) return true;
    return false;
  }

  private checkNeighborhood() {
    const h = hoodAt(this.hoods, this.pos.x, this.pos.y);
    const name = h?.name ?? null;
    if (name === this.currentHood) return;
    this.currentHood = name;
    useGame.setState({ neighborhood: name });
    if (name) {
      useGame.setState({ titleCard: { name, tagline: taglineFor(name), at: Date.now() } });
      bus.emit("neighborhood:enter", { name });
    }
  }

  // ───────────────────────── chunk streaming ─────────────────────────
  private streamChunks() {
    const view = this.cameras.main.worldView;
    const C = CHUNK_TILES * TILE_PX;
    const m = LOAD_MARGIN * TILE_PX;
    // Before the camera has a view, use the player position
    const cxA = Math.floor((view.width ? view.x - m : this.pos.x * TILE_PX - C) / C);
    const cyA = Math.floor((view.height ? view.y - m : this.pos.y * TILE_PX - C) / C);
    const cxB = Math.floor((view.width ? view.right + m : this.pos.x * TILE_PX + C) / C);
    const cyB = Math.floor((view.height ? view.bottom + m : this.pos.y * TILE_PX + C) / C);
    const range = `${cxA},${cyA},${cxB},${cyB}`;
    if (range === this.lastRange) return;
    this.lastRange = range;

    this.wantRange = [cxA - 1, cyA - 1, cxB + 1, cyB + 1];
    for (let cy = cyA; cy <= cyB; cy++) {
      for (let cx = cxA; cx <= cxB; cx++) {
        if (!this.chunks.inWorld(cx, cy)) continue;
        const key = chunkKey(cx, cy);
        if (this.layers.has(key)) continue;
        const ready = this.chunks.get(cx, cy);
        if (ready) this.addLayer(cx, cy, ready);
        else
          this.chunks.fetch(cx, cy).then(
            (data) => {
              if (this.wanted(cx, cy) && !this.layers.has(key)) this.addLayer(cx, cy, data);
            },
            (e) => console.warn(e),
          );
      }
    }
    // Hysteresis: keep one extra ring before evicting.
    const keep = new Set<string>();
    for (let cy = cyA - 1; cy <= cyB + 1; cy++) for (let cx = cxA - 1; cx <= cxB + 1; cx++) keep.add(chunkKey(cx, cy));
    for (const [key, l] of this.layers) {
      if (keep.has(key)) continue;
      this.clearObjects(l);
      l.layer.destroy();
      l.map.destroy();
      this.layers.delete(key);
    }
    this.chunks.evictExcept(keep);
    this.entities.evictExcept(keep);
  }

  private wantRange: [number, number, number, number] = [0, 0, -1, -1];
  private wanted(cx: number, cy: number) {
    const [a, b, c, d] = this.wantRange;
    return cx >= a && cx <= c && cy >= b && cy <= d;
  }

  private addLayer(cx: number, cy: number, data: Uint8Array) {
    const rows: number[][] = [];
    for (let y = 0; y < CHUNK_TILES; y++) rows.push(Array.from(data.subarray(y * CHUNK_TILES, (y + 1) * CHUNK_TILES)));
    const map = this.make.tilemap({ data: rows, tileWidth: TILE_PX, tileHeight: TILE_PX });
    const ts = map.addTilesetImage("tiles", "tiles", TILE_PX, TILE_PX, 0, 0)!;
    const layer = map.createLayer(0, ts, cx * CHUNK_TILES * TILE_PX, cy * CHUNK_TILES * TILE_PX)!;
    layer.setDepth(0);
    const key = chunkKey(cx, cy);
    const entry: ChunkLayer = { map, layer, objects: [] };
    this.layers.set(key, entry);
    if (!this.chunks.manifest.chunks.includes(key)) return; // open water: nothing lives here
    this.entities.load(key).then(
      (list) => {
        if (this.layers.get(key) === entry && entry.objects.length === 0) this.populate(entry, list);
      },
      (e) => console.warn("world entities", key, e),
    );
  }

  // ───────────────────────── entities & spirits (Checkpoint B) ─────────────────────────
  private clearObjects(l: ChunkLayer) {
    for (const o of l.objects) {
      const id = o.getData("spiritId");
      if (id) this.spirits.delete(id);
      o.destroy();
    }
    l.objects.length = 0;
    useGame.setState({ spiritsNearby: this.spirits.size });
  }

  /** Nearest walkable tile centre to (x,y) within r tiles, or null. */
  private nearestOpen(x: number, y: number, r: number): { x: number; y: number } | null {
    const sx = Math.floor(x), sy = Math.floor(y);
    if (!this.chunks.isSolid(sx, sy)) return { x, y };
    for (let d = 1; d <= r; d++)
      for (let dy = -d; dy <= d; dy++)
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          if (!this.chunks.isSolid(sx + dx, sy + dy)) return { x: sx + dx + 0.5, y: sy + dy + 0.7 };
        }
    return null;
  }

  /** Nearest sidewalk / plaza tile — where a storefront actually meets the street. */
  private nearestSidewalk(x: number, y: number, r: number): { x: number; y: number } | null {
    const sx = Math.floor(x), sy = Math.floor(y);
    const ok = (tx: number, ty: number) => {
      const t = this.chunks.tileAt(tx, ty);
      return t !== undefined && (terrainOf(t) === T.SIDEWALK || terrainOf(t) === T.PLAZA);
    };
    for (let d = 0; d <= r; d++)
      for (let dy = -d; dy <= d; dy++)
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          if (ok(sx + dx, sy + dy)) return { x: sx + dx + 0.5, y: sy + dy + 0.7 };
        }
    return null;
  }

  /** Spiral out from (x,y) to the first open tile not in `used`. */
  private freeTileNear(x: number, y: number, used: Set<number>, r = 5): { x: number; y: number } {
    const sx = Math.floor(x), sy = Math.floor(y);
    for (let d = 0; d <= r; d++)
      for (let dy = -d; dy <= d; dy++)
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const tx = sx + dx, ty = sy + dy;
          if (used.has(ty * 100_000 + tx) || this.chunks.isSolid(tx, ty)) continue;
          return d === 0 ? { x, y } : { x: tx + 0.5, y: ty + 0.7 };
        }
    return { x, y };
  }

  private populate(l: ChunkLayer, list: Entity[]) {
    // Many records share a point (films at City Hall, shops in one building): spread them out.
    const used = new Set<number>();
    const mark = (x: number, y: number) => used.add(Math.floor(y) * 100_000 + Math.floor(x));
    for (const e of list) {
      // Business points are geocoded to the parcel (often a rooftop or yard): pull them to the sidewalk.
      const anchor =
        (e.kind === "business" ? this.nearestSidewalk(e.x, e.y, 10) : null) ??
        this.nearestOpen(e.x, e.y, e.kind === "business" ? 6 : 3) ??
        { x: e.x, y: e.y };
      if (e.kind !== "tree") {
        const free = this.freeTileNear(anchor.x, anchor.y, used);
        anchor.x = free.x;
        anchor.y = free.y;
      }
      mark(anchor.x, anchor.y);
      const ax = anchor.x * TILE_PX, ay = anchor.y * TILE_PX;

      // Anchor sprite: a tree, or a small marker for everything else.
      let tex: string;
      if (e.kind === "tree") tex = treeTexture(this, e.look, treeSizeFor(e.rank));
      else if (e.kind === "park" && !e.spirit) continue;
      else tex = markerTexture(this, e.kind, e.look);
      const img = this.add.image(ax, ay, tex).setOrigin(0.5, 1).setDepth(ay);
      l.objects.push(img);

      if (!e.spirit) continue;
      const sp = e.spirit;
      // Stand beside the anchor on an open tile, chosen by seed.
      // Prefer an open tile that isn't roadway; fall back to any open tile.
      let px = anchor.x, py = anchor.y;
      outer: for (const avoidRoad of [true, false]) {
        for (let i = 0; i < AROUND.length; i++) {
          const [dx, dy] = AROUND[(sp.seed + i) % AROUND.length];
          const tx = anchor.x + dx * 1.2, ty = anchor.y + dy * 1.2;
          const tile = this.chunks.tileAt(Math.floor(tx), Math.floor(ty));
          if (tile === undefined || this.chunks.isSolid(Math.floor(tx), Math.floor(ty))) continue;
          if (avoidRoad && terrainOf(tile) === T.ROAD) continue;
          if (used.has(Math.floor(ty) * 100_000 + Math.floor(tx))) continue;
          px = tx; py = ty;
          break outer;
        }
      }
      mark(px, py);
      const key = spiritTexture(this, { family: sp.family, rarity: sp.rarity, seed: sp.seed, look: e.look });
      const sprite = this.add.sprite(px * TILE_PX, py * TILE_PX, key, 0).setOrigin(0.5, 1).setDepth(py * TILE_PX + 0.25);
      sprite.play({ key: `${key}:idle`, startFrame: sp.seed % 4 });
      sprite.setData("spiritId", sp.id);
      l.objects.push(sprite);
      const live: LiveSpirit = { entity: e, sprite, x: px, y: py };
      this.spirits.set(sp.id, live);
      if (useGame.getState().friends[sp.id]) this.addHeart(sprite);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => {
        const st = useGame.getState();
        if (st.encounter || st.atlasOpen) return;
        if (Math.hypot(live.x - this.pos.x, live.y - this.pos.y) <= CLICK_REACH) useGame.setState({ encounter: this.refOf(live) });
        else useGame.setState({ toast: { text: "Walk a little closer to say hello.", at: Date.now() } });
      });
    }
    useGame.setState({ spiritsNearby: this.spirits.size });
  }
}
