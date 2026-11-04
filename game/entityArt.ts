/**
 * Procedural sprites for real-world anchors: street trees (by species group and
 * size) and small markers for shops, art, landmarks, film spots and parks.
 * Textures are generated lazily and cached by look key.
 */
import type Phaser from "phaser";
import { BUSINESS_CATEGORIES, type RGB, SPECIES_GROUPS } from "@/lib/places/catalog";

const css = ([r, g, b]: RGB, a = 1) => `rgba(${r},${g},${b},${a})`;
const shade = ([r, g, b]: RGB, k: number): RGB => [r * k, g * k, b * k].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  tex.refresh();
  return key;
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a = 1) {
  // pixel-ish filled circle
  ctx.fillStyle = css(c, a);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
    ctx.fillRect(Math.round(x - w), Math.round(y + dy), w * 2 + 1, 1);
  }
}

// ───────────────────────── trees ─────────────────────────
export const TREE_SIZES = [
  { w: 16, h: 22, r: 6 },
  { w: 24, h: 30, r: 9 },
  { w: 32, h: 40, r: 13 },
] as const;

export function treeSizeFor(rank: number) {
  return rank > 0.82 ? 2 : rank > 0.45 ? 1 : 0;
}

export function treeTexture(scene: Phaser.Scene, group: string | undefined, size: number): string {
  const g = SPECIES_GROUPS[group ?? "other"] ?? SPECIES_GROUPS.other;
  const S = TREE_SIZES[size];
  return canvasTexture(scene, `tree:${g.key}:${size}`, S.w, S.h, (ctx) => {
    const [leaf, hi, bark] = g.palette;
    const cx = S.w / 2 - 0.5;
    const base = S.h - 1;
    // ground shadow
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(cx - S.r * 0.7, base - 2, S.r * 1.4 + 1, 3);
    const trunkH = Math.round(S.h * (g.shape === "palm" ? 0.62 : 0.32));
    const trunkW = size === 0 ? 2 : size === 1 ? 3 : 4;
    ctx.fillStyle = css(bark);
    ctx.fillRect(Math.round(cx - trunkW / 2 + 0.5), base - trunkH, trunkW, trunkH);
    ctx.fillStyle = css(shade(bark, 0.75));
    ctx.fillRect(Math.round(cx - trunkW / 2 + 0.5), base - trunkH, 1, trunkH);
    const top = base - trunkH;
    switch (g.shape) {
      case "palm": {
        const fronds = [[-1, -0.4], [1, -0.4], [-0.8, 0.2], [0.8, 0.2], [0, -0.9]];
        for (const [fx, fy] of fronds) {
          for (let t = 0; t <= S.r; t++) {
            const x = cx + fx * t, y = top + fy * t + (t * t) / (S.r * 1.6);
            ctx.fillStyle = css(t % 3 === 0 ? hi : leaf);
            ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
          }
        }
        disc(ctx, cx, top, 1, shade(bark, 0.8));
        break;
      }
      case "conical": {
        const h = S.h - trunkH * 0.4 - 2;
        for (let y = 0; y < h; y++) {
          const w = Math.max(1, Math.round((y / h) * S.r));
          ctx.fillStyle = css(y % 4 === 0 ? hi : leaf);
          ctx.fillRect(Math.round(cx - w), Math.round(top + trunkH * 0.6 - h + y), w * 2 + 1, 1);
        }
        break;
      }
      case "tall": {
        const r = Math.max(4, S.r - 2);
        disc(ctx, cx, top - r * 0.2, r, leaf);
        disc(ctx, cx, top - r * 1.1, r - 1, leaf);
        disc(ctx, cx - 1, top - r * 1.3, Math.max(2, r - 3), hi);
        break;
      }
      case "weeping": {
        disc(ctx, cx, top - S.r * 0.4, S.r, leaf);
        ctx.fillStyle = css(shade(leaf, 0.85));
        for (let x = -S.r + 1; x < S.r; x += 2) ctx.fillRect(Math.round(cx + x), top - 1, 1, Math.round(S.r * 0.7));
        disc(ctx, cx - 2, top - S.r * 0.8, Math.max(2, S.r - 4), hi);
        break;
      }
      case "fan":
      case "round":
      default: {
        disc(ctx, cx, top - S.r * 0.55, S.r, shade(leaf, 0.9));
        disc(ctx, cx - S.r * 0.35, top - S.r * 0.75, S.r * 0.75, leaf);
        disc(ctx, cx - S.r * 0.3, top - S.r * 0.95, Math.max(2, S.r * 0.45), hi);
      }
    }
    if (g.bloom) {
      ctx.fillStyle = css(g.bloom);
      const n = 3 + size * 4;
      for (let i = 0; i < n; i++) {
        const a = (i * 2.399) % (Math.PI * 2), d = ((i * 37) % 10) / 10;
        ctx.fillRect(Math.round(cx + Math.cos(a) * S.r * 0.75 * d), Math.round(top - S.r * 0.6 + Math.sin(a) * S.r * 0.6 * d), 1, 1);
      }
    }
  });
}

// ───────────────────────── markers ─────────────────────────
export function markerTexture(scene: Phaser.Scene, kind: string, look?: string): string {
  switch (kind) {
    case "business": {
      const c = BUSINESS_CATEGORIES[look ?? "shop"] ?? BUSINESS_CATEGORIES.shop;
      return canvasTexture(scene, `mk:biz:${c.key}`, 14, 14, (ctx) => {
        const [awn, acc] = c.palette;
        ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(2, 12, 10, 2);
        // A-frame sidewalk sign
        ctx.fillStyle = css([92, 70, 54]); ctx.fillRect(3, 6, 1, 7); ctx.fillRect(10, 6, 1, 7);
        ctx.fillStyle = css([40, 44, 52]); ctx.fillRect(3, 3, 8, 7);
        ctx.fillStyle = css(acc); ctx.fillRect(4, 5, 6, 1); ctx.fillRect(4, 7, 4, 1);
        // little awning stripe on top
        for (let x = 1; x < 13; x++) { ctx.fillStyle = css(x % 2 ? awn : acc); ctx.fillRect(x, 1, 1, 2); }
      });
    }
    case "art":
      return canvasTexture(scene, "mk:art", 14, 16, (ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(1, 14, 12, 2);
        ctx.fillStyle = css([200, 196, 188]); ctx.fillRect(3, 10, 8, 5);
        ctx.fillStyle = css([150, 146, 140]); ctx.fillRect(3, 14, 8, 1);
        disc(ctx, 7, 6, 3, [230, 90, 80]);
        ctx.fillStyle = css([70, 140, 220]); ctx.fillRect(4, 2, 3, 3);
        ctx.fillStyle = css([250, 210, 70]); ctx.fillRect(8, 1, 2, 4);
      });
    case "landmark":
      return canvasTexture(scene, "mk:landmark", 12, 16, (ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(1, 14, 10, 2);
        ctx.fillStyle = css([70, 60, 52]); ctx.fillRect(5, 7, 2, 8);
        ctx.fillStyle = css([150, 112, 48]); ctx.fillRect(1, 1, 10, 7);
        ctx.fillStyle = css([212, 172, 88]); ctx.fillRect(2, 2, 8, 5);
        ctx.fillStyle = css([150, 112, 48]); ctx.fillRect(3, 3, 6, 1); ctx.fillRect(3, 5, 4, 1);
      });
    case "film":
      return canvasTexture(scene, "mk:film", 14, 14, (ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(2, 12, 10, 2);
        ctx.fillStyle = css([30, 30, 34]); ctx.fillRect(2, 5, 10, 7);
        ctx.fillStyle = css([240, 240, 240]); ctx.fillRect(3, 7, 8, 1); ctx.fillRect(3, 9, 5, 1);
        for (let x = 2; x < 12; x++) { ctx.fillStyle = css(x % 2 ? [240, 240, 240] : [30, 30, 34]); ctx.fillRect(x, 2 + Math.round((x - 2) * 0.2), 1, 2); }
      });
    case "park":
    default:
      return canvasTexture(scene, "mk:park", 14, 14, (ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(2, 12, 10, 2);
        ctx.fillStyle = css([110, 80, 50]); ctx.fillRect(3, 7, 1, 6); ctx.fillRect(10, 7, 1, 6);
        ctx.fillStyle = css([60, 112, 64]); ctx.fillRect(1, 2, 12, 6);
        ctx.fillStyle = css([236, 230, 200]); ctx.fillRect(3, 4, 8, 1);
      });
  }
}
