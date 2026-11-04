/**
 * Procedural pixel art, generated into canvases at boot (no asset files).
 *  - Tileset: 16 cols (variant) × TERRAIN_COUNT rows (terrain), 16 px tiles,
 *    so a chunk byte (terrain*16 + variant) is directly the tile index.
 *  - Wanderer: 4 directions × 3 frames.
 */
import { TILE_PX } from "@/lib/geo/projection";
import { T, TERRAIN_COLORS, TERRAIN_COUNT } from "@/lib/world/terrain";

type RGB = [number, number, number];
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r},${g},${b},${a})`;
const shade = ([r, g, b]: RGB, k: number): RGB => [
  Math.max(0, Math.min(255, Math.round(r * k))),
  Math.max(0, Math.min(255, Math.round(g * k))),
  Math.max(0, Math.min(255, Math.round(b * k))),
];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

const N = 1, E = 2, S = 4, Wm = 8;

export function drawTileset(ctx: CanvasRenderingContext2D) {
  const P = TILE_PX;
  for (let t = 0; t < TERRAIN_COUNT; t++) {
    const base = TERRAIN_COLORS[t];
    for (let v = 0; v < 16; v++) {
      const ox = v * P, oy = t * P;
      const r = rng(t * 977 + v * 131 + 7);
      const px = (x: number, y: number, c: RGB, a = 1) => {
        ctx.fillStyle = css(c, a);
        ctx.fillRect(ox + x, oy + y, 1, 1);
      };
      const rect = (x: number, y: number, w: number, h: number, c: RGB, a = 1) => {
        ctx.fillStyle = css(c, a);
        ctx.fillRect(ox + x, oy + y, w, h);
      };
      rect(0, 0, P, P, base);

      switch (t) {
        case T.DEEP:
        case T.WATER: {
          const wr = rng(t * 31 + 3);
          for (let i = 0; i < 3; i++) {
            const x = Math.floor(wr() * 12), y = Math.floor(wr() * 15);
            rect(x, y, 3, 1, shade(base, 1.18));
          }
          // shoreline foam on edges that touch land
          const foam: RGB = [214, 232, 240];
          const lip = shade(base, 1.35);
          if (v & N) { rect(0, 0, P, 2, foam, 0.9); rect(0, 2, P, 1, lip, 0.8); }
          if (v & S) { rect(0, P - 2, P, 2, foam, 0.9); rect(0, P - 3, P, 1, lip, 0.8); }
          if (v & Wm) { rect(0, 0, 2, P, foam, 0.9); rect(2, 0, 1, P, lip, 0.8); }
          if (v & E) { rect(P - 2, 0, 2, P, foam, 0.9); rect(P - 3, 0, 1, P, lip, 0.8); }
          break;
        }
        case T.BUILDING: {
          const roof = base;
          const ridge = shade(roof, 1.1);
          rect(0, 0, P, P, roof);
          for (let y = 1; y < P; y += 4) rect(0, y, P, 1, shade(roof, 0.92));
          rect(0, 7, P, 1, ridge);
          const edge = shade(roof, 0.6);
          if (v & N) rect(0, 0, P, 1, edge);
          if (v & Wm) rect(0, 0, 1, P, edge);
          if (v & E) rect(P - 1, 0, 1, P, edge);
          if (v & S) {
            // front wall with windows — gives the top-down city some depth
            const wall: RGB = [214, 196, 170];
            rect(0, 9, P, 7, wall);
            rect(0, 8, P, 1, edge);
            const win: RGB = [92, 128, 160];
            rect(2, 11, 3, 3, win);
            rect(9, 11, 3, 3, win);
            rect(0, 15, P, 1, shade(wall, 0.7));
            if (v & Wm) rect(0, 9, 1, 7, shade(wall, 0.75));
            if (v & E) rect(P - 1, 9, 1, 7, shade(wall, 0.75));
          }
          break;
        }
        case T.GRASS:
        case T.LAND: {
          for (let i = 0; i < 10; i++) {
            const x = Math.floor(r() * 15), y = Math.floor(r() * 14);
            px(x, y, shade(base, 1.18));
            px(x, y + 1, shade(base, 0.85));
          }
          if (t === T.LAND && v === 2) rect(4 + Math.floor(r() * 6), 5, 3, 2, [150, 120, 84], 0.7);
          if (t === T.GRASS && v === 3) { px(5, 6, [240, 230, 120]); px(11, 10, [240, 160, 200]); }
          break;
        }
        case T.FOREST: {
          rect(0, 0, P, P, shade(base, 0.85));
          const blobs = [[4, 4], [11, 5], [7, 11], [13, 13], [1, 12]];
          for (const [bx, by] of blobs) {
            const rr = 3 + Math.floor(r() * 2);
            ctx.fillStyle = css(shade(base, 1.05 + r() * 0.15));
            ctx.beginPath();
            ctx.arc(ox + bx + (v & 1), oy + by + (v >> 1), rr, 0, Math.PI * 2);
            ctx.fill();
            px(bx - 1, by - 1, shade(base, 1.4));
          }
          break;
        }
        case T.SAND: {
          for (let i = 0; i < 12; i++) px(Math.floor(r() * 16), Math.floor(r() * 16), shade(base, r() > 0.5 ? 0.9 : 1.06));
          break;
        }
        case T.SIDEWALK:
        case T.PLAZA: {
          const line = shade(base, 0.88);
          if (t === T.SIDEWALK) {
            rect(0, 0, P, 1, line);
            rect(0, 0, 1, P, line);
            rect(0, 8, P, 1, line);
          } else {
            for (let y = 0; y < P; y += 4) {
              rect(0, y, P, 1, line);
              const off = (y / 4) % 2 ? 4 : 0;
              for (let x = off; x < P; x += 8) rect(x, y, 1, 4, line);
            }
          }
          if (v === 1) px(Math.floor(r() * 14) + 1, Math.floor(r() * 6) + 2, shade(base, 0.8));
          break;
        }
        case T.ROAD: {
          for (let i = 0; i < 14; i++) px(Math.floor(r() * 16), Math.floor(r() * 16), shade(base, r() > 0.5 ? 1.12 : 0.9));
          if (v === 3) rect(3 + Math.floor(r() * 8), 6, 2, 1, shade(base, 0.75));
          break;
        }
        case T.PATH: {
          for (let i = 0; i < 10; i++) px(Math.floor(r() * 16), Math.floor(r() * 16), shade(base, r() > 0.5 ? 1.1 : 0.85));
          break;
        }
        case T.PIER: {
          const gap = shade(base, 0.65);
          for (let y = 3; y < P; y += 4) rect(0, y, P, 1, gap);
          const seam = (v * 5) % 12 + 2;
          rect(seam, 0, 1, 3, gap);
          rect((seam + 7) % 16, 4, 1, 3, gap);
          rect((seam + 3) % 16, 8, 1, 3, gap);
          rect((seam + 10) % 16, 12, 1, 3, gap);
          break;
        }
      }
    }
  }
}

/** Wanderer: hooded traveller with a little lantern. Frames: [down,left,right,up] × [idle,stepA,stepB]. */
export const WANDERER_FRAME = 16;
export function drawWanderer(ctx: CanvasRenderingContext2D) {
  const cloak: RGB = [64, 84, 140];
  const cloakDark: RGB = [42, 56, 100];
  const skin: RGB = [240, 204, 170];
  const boot: RGB = [60, 40, 36];
  const lantern: RGB = [255, 214, 110];
  const F = WANDERER_FRAME;
  const dirs = ["down", "left", "right", "up"] as const;
  dirs.forEach((dir, di) => {
    for (let f = 0; f < 3; f++) {
      const ox = f * F, oy = di * F;
      const R = (x: number, y: number, w: number, h: number, c: RGB, a = 1) => {
        ctx.fillStyle = css(c, a);
        ctx.fillRect(ox + x, oy + y, w, h);
      };
      const bob = f === 0 ? 0 : 1;
      // shadow
      R(4, 14, 8, 2, [0, 0, 0], 0.25);
      // legs
      const lA = f === 1 ? -1 : f === 2 ? 1 : 0;
      R(5, 12 + (lA < 0 ? -1 : 0), 2, 3, boot);
      R(9, 12 + (lA > 0 ? -1 : 0), 2, 3, boot);
      // cloak body
      R(4, 6 - bob, 8, 7, cloak);
      R(4, 12 - bob, 8, 1, cloakDark);
      // hood
      R(4, 1 - bob, 8, 6, cloakDark);
      R(5, 0 - bob, 6, 1, cloakDark);
      if (dir === "down") {
        R(5, 3 - bob, 6, 4, skin);
        R(6, 4 - bob, 1, 1, [40, 30, 40]);
        R(9, 4 - bob, 1, 1, [40, 30, 40]);
        R(12, 8 - bob, 2, 3, lantern);
      } else if (dir === "left") {
        R(4, 3 - bob, 4, 4, skin);
        R(5, 4 - bob, 1, 1, [40, 30, 40]);
        R(2, 8 - bob, 2, 3, lantern);
      } else if (dir === "right") {
        R(8, 3 - bob, 4, 4, skin);
        R(10, 4 - bob, 1, 1, [40, 30, 40]);
        R(12, 8 - bob, 2, 3, lantern);
      } else {
        R(5, 2 - bob, 6, 4, shade(cloakDark, 0.85));
        R(2, 8 - bob, 2, 3, lantern, 0.8);
      }
    }
  });
}
