/**
 * Procedural pixel spirits (spec §7.4): family base body + seeded parts
 * (eyes, mouth, cheeks, ears/hat/halo) + data-driven palette + rarity aura.
 * 24×24, 4 idle frames (bob + blink). Textures are shared by look signature.
 */
import type Phaser from "phaser";

import { BUSINESS_CATEGORIES, type RGB, SPECIES_GROUPS } from "@/lib/places/catalog";
import type { Family, Rarity } from "@/lib/spirits/spawn";

export const SPIRIT_PX = 24;
const FRAMES = 4;

const css = ([r, g, b]: RGB, a = 1) => `rgba(${r},${g},${b},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
const shade = (c: RGB, k: number): RGB => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))) as RGB;

function hsl(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

export type SpiritLook = {
  family: Family;
  rarity: Rarity;
  seed: number;
  /** species group (tree) or business category (shopkeeper) */
  look?: string;
};

type Parts = { eyes: number; mouth: number; cheeks: boolean; variant: number };
const partsFor = (seed: number): Parts => ({
  eyes: seed % 4,
  mouth: (seed >>> 3) % 3,
  cheeks: ((seed >>> 6) & 1) === 1,
  variant: (seed >>> 8) % 8,
});

/** Texture key + ensure it exists. Animation key is `${key}:idle`. */
export function spiritTexture(scene: Phaser.Scene, s: SpiritLook): string {
  const p = partsFor(s.seed);
  const key = `sp:${s.family}:${s.look ?? "-"}:${s.rarity}:${p.eyes}${p.mouth}${p.cheeks ? 1 : 0}${p.variant}`;
  if (scene.textures.exists(key)) return key;

  const W = SPIRIT_PX, H = SPIRIT_PX;
  const tex = scene.textures.createCanvas(key, W * FRAMES, H)!;
  const ctx = tex.getContext();
  for (let f = 0; f < FRAMES; f++) {
    ctx.save();
    ctx.translate(f * W, 0);
    drawSpirit(ctx, s, p, f);
    ctx.restore();
    tex.add(f, 0, f * W, 0, W, H);
  }
  tex.refresh();
  scene.anims.create({
    key: `${key}:idle`,
    frames: [0, 1, 2, 1, 0, 3].map((frame) => ({ key, frame })),
    frameRate: 4,
    repeat: -1,
  });
  return key;
}

/** Draw one frame of a spirit onto any 2D canvas (used by React portraits). */
export function drawSpiritPortrait(ctx: CanvasRenderingContext2D, s: SpiritLook, frame = 0) {
  drawSpirit(ctx, s, partsFor(s.seed), frame);
}

function drawSpirit(ctx: CanvasRenderingContext2D, s: SpiritLook, p: Parts, frame: number) {
  const px = (x: number, y: number, c: RGB, a = 1, w = 1, h = 1) => {
    ctx.fillStyle = css(c, a);
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const disc = (x: number, y: number, r: number, c: RGB, a = 1) => {
    ctx.fillStyle = css(c, a);
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
      ctx.fillRect(Math.round(x - w), Math.round(y + dy), w * 2 + 1, 1);
    }
  };
  const bob = frame === 1 || frame === 2 ? -1 : 0;
  const blink = frame === 3;
  const cx = 11.5, cy = 14 + bob;

  // ── palette from data ──
  let body: RGB, accent: RGB, alpha = 1;
  switch (s.family) {
    case "tree": {
      const g = SPECIES_GROUPS[s.look ?? "other"] ?? SPECIES_GROUPS.other;
      body = mix(g.palette[0], g.palette[1], 0.45);
      accent = g.bloom ?? g.palette[1];
      break;
    }
    case "park":
      body = hsl(95 + p.variant * 6, 0.42, 0.5);
      accent = hsl((p.variant * 45) % 360, 0.75, 0.68);
      break;
    case "shopkeeper": {
      const c = BUSINESS_CATEGORIES[s.look ?? "shop"] ?? BUSINESS_CATEGORIES.shop;
      body = c.palette[1];
      accent = c.palette[0];
      break;
    }
    case "ancient":
      body = mix([176, 150, 112], [140, 120, 96], p.variant / 8);
      accent = [214, 172, 88];
      break;
    case "echo":
      body = [214, 226, 244];
      accent = [40, 40, 48];
      alpha = 0.82;
      break;
    case "guardian":
    default:
      body = hsl((s.seed % 360), 0.62, 0.6);
      accent = hsl(((s.seed % 360) + 150) % 360, 0.7, 0.62);
  }
  const outline = shade(body, 0.55);

  // ── rarity aura (behind) ──
  if (s.rarity === "legendary") {
    const hue = (frame * 90 + (s.seed % 360)) % 360;
    disc(cx, cy, 11, hsl(hue, 0.9, 0.7), 0.18);
    disc(cx, cy, 9, hsl((hue + 60) % 360, 0.9, 0.75), 0.18);
  } else if (s.rarity === "rare") {
    disc(cx, cy, 10, [255, 220, 120], 0.16 + (frame % 2) * 0.06);
  }

  // shadow (doesn't bob)
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(6, 22, 12, 2);

  // ── body ──
  switch (s.family) {
    case "guardian": {
      // crystalline diamond
      for (let y = -8; y <= 7; y++) {
        const w = 7 - Math.abs(y + 0.5) * 0.85;
        if (w <= 0) continue;
        px(cx - w, cy + y, outline, 1, w * 2 + 1, 1);
        if (w > 1) px(cx - w + 1, cy + y, y < 0 ? body : shade(body, 0.85), 1, w * 2 - 1, 1);
      }
      px(cx - 2, cy - 6, mix(body, [255, 255, 255], 0.6), 1, 2, 4);
      px(cx + 2, cy - 2, accent, 1, 2, 2);
      break;
    }
    case "ancient": {
      // weathered stone lantern-spirit
      px(cx - 6, cy - 6, outline, 1, 13, 14);
      px(cx - 5, cy - 7, outline, 1, 11, 1);
      px(cx - 5, cy - 5, body, 1, 11, 12);
      px(cx - 4, cy - 6, body, 1, 9, 1);
      px(cx - 3, cy + 2, shade(body, 0.8), 1, 1, 3);
      px(cx + 3, cy - 2, shade(body, 0.8), 1, 2, 1);
      // brass key charm
      px(cx + 5, cy + 3, accent, 1, 3, 1);
      px(cx + 7, cy + 3, accent, 1, 1, 3);
      break;
    }
    case "echo": {
      // ghost with wavy hem
      disc(cx, cy - 2, 7, outline, alpha);
      disc(cx, cy - 2, 6, body, alpha);
      px(cx - 6, cy - 2, body, alpha, 13, 8);
      px(cx - 7, cy - 2, outline, alpha, 1, 8);
      px(cx + 7, cy - 2, outline, alpha, 1, 8);
      for (let x = -6; x <= 6; x++) if ((x + frame) % 3 === 0) px(cx + x, cy + 5, body, alpha, 1, 1);
      // film-reel halo
      const hy = cy - 11;
      disc(cx, hy, 3, [50, 50, 58]);
      px(cx - 1, hy - 2, [200, 200, 210]); px(cx + 1, hy + 1, [200, 200, 210]); px(cx - 2, hy + 1, [200, 200, 210]);
      break;
    }
    default: {
      // round blob (tree / park / shopkeeper)
      disc(cx, cy, 7, outline);
      disc(cx, cy, 6, body);
      disc(cx - 2, cy - 3, 2, mix(body, [255, 255, 255], 0.35));
    }
  }

  // ── family toppers ──
  const top = cy - 7;
  if (s.family === "tree") {
    const g = SPECIES_GROUPS[s.look ?? "other"] ?? SPECIES_GROUPS.other;
    const leaf = g.palette[1], dark = g.palette[0];
    switch (g.shape) {
      case "conical":
        px(cx - 5, top - 3, dark, 1, 2, 4); px(cx - 4, top - 4, dark); px(cx + 4, top - 3, dark, 1, 2, 4); px(cx + 4, top - 4, dark);
        break;
      case "palm":
        for (let i = 0; i < 4; i++) { px(cx - 1 - i * 2, top - 2 + i, leaf, 1, 2, 1); px(cx + i * 2, top - 2 + i, leaf, 1, 2, 1); }
        break;
      case "fan":
        disc(cx - 4, top - 1, 2, leaf); disc(cx + 4, top - 1, 2, leaf); px(cx - 4, top + 1, dark); px(cx + 4, top + 1, dark);
        break;
      case "weeping":
        for (let x = -5; x <= 5; x += 2) px(cx + x, top + 1, dark, 1, 1, 4);
        break;
      case "tall":
        px(cx, top - 5, leaf, 1, 2, 5); px(cx + 1, top - 6, dark);
        break;
      default:
        disc(cx - 4, top, 2, leaf); disc(cx + 4, top, 2, leaf);
    }
    if (g.bloom) { px(cx + 3, top - 2, g.bloom, 1, 2, 2); px(cx - 5, top - 1, g.bloom); }
  } else if (s.family === "park") {
    px(cx, top - 3, [80, 140, 60], 1, 1, 4);
    disc(cx, top - 4, 1, accent);
    px(cx + 1, top - 1, [80, 140, 60], 1, 2, 1);
  } else if (s.family === "shopkeeper") {
    const c = BUSINESS_CATEGORIES[s.look ?? "shop"] ?? BUSINESS_CATEGORIES.shop;
    const hc = accent;
    switch (c.hat) {
      case "chef": px(cx - 3, top - 2, [250, 250, 250], 1, 7, 3); disc(cx, top - 4, 3, [250, 250, 250]); break;
      case "beret": px(cx - 4, top - 1, hc, 1, 8, 2); px(cx - 2, top - 2, hc, 1, 5, 1); px(cx + 1, top - 3, hc); break;
      case "cup": px(cx - 2, top - 3, [250, 250, 250], 1, 5, 4); px(cx + 3, top - 2, [250, 250, 250], 1, 1, 2); px(cx - 1, top - 5, [200, 200, 200], 0.6, 1, 2); break;
      case "book": px(cx - 4, top - 2, hc, 1, 9, 3); px(cx - 3, top - 1, [240, 236, 220], 1, 7, 1); break;
      case "flower": disc(cx + 3, top - 1, 2, hc); px(cx + 3, top - 1, [250, 230, 90]); break;
      case "bow": px(cx - 4, top - 1, hc, 1, 3, 2); px(cx + 2, top - 1, hc, 1, 3, 2); px(cx - 1, top - 1, shade(hc, 0.8), 1, 3, 2); break;
      case "headband": px(cx - 6, top + 2, hc, 1, 13, 2); break;
      case "tophat": px(cx - 4, top - 1, [30, 30, 36], 1, 9, 1); px(cx - 2, top - 5, [30, 30, 36], 1, 5, 5); px(cx - 2, top - 2, hc, 1, 5, 1); break;
      case "bell": disc(cx, top - 2, 2, [230, 190, 70]); px(cx, top - 5, [230, 190, 70]); break;
      case "cap":
      default: px(cx - 4, top - 1, hc, 1, 8, 2); px(cx + 3, top, hc, 1, 3, 1);
    }
  }

  // ── face ──
  const ey = cy - (s.family === "echo" ? 3 : 1);
  const ink: RGB = s.family === "guardian" ? [255, 255, 255] : [36, 30, 40];
  const ex = [cx - 3, cx + 2];
  for (const x of ex) {
    if (blink) { px(x, ey + 1, ink, 1, 2, 1); continue; }
    switch (p.eyes) {
      case 0: px(x, ey, ink, 1, 2, 2); break;
      case 1: px(x, ey - 1, ink, 1, 2, 3); px(x, ey - 1, [255, 255, 255]); break;
      case 2: px(x, ey + 1, ink, 1, 2, 1); px(x + (x < cx ? 0 : 1), ey, ink); break; // content ^ ^
      default: px(x, ey, ink, 1, 1, 2); px(x + 1, ey, ink, 1, 1, 1); break;
    }
  }
  if (p.mouth === 1) { px(cx - 1, ey + 3, ink, 1, 3, 1); px(cx - 2, ey + 2, ink); px(cx + 2, ey + 2, ink); }
  else if (p.mouth === 2) px(cx, ey + 3, ink, 1, 1, 1);
  if (p.cheeks && s.family !== "guardian") { px(cx - 5, ey + 2, [240, 120, 130], 0.8, 2, 1); px(cx + 4, ey + 2, [240, 120, 130], 0.8, 2, 1); }

  // ── sparkle for rare+ ──
  if (s.rarity === "rare" || s.rarity === "legendary") {
    const sx = [3, 19, 5, 18][frame], sy = [5, 8, 17, 3][frame];
    const c: RGB = s.rarity === "legendary" ? hsl((frame * 90) % 360, 0.9, 0.75) : [255, 230, 140];
    px(sx, sy - 1, c); px(sx - 1, sy, c); px(sx, sy, [255, 255, 255]); px(sx + 1, sy, c); px(sx, sy + 1, c);
  }
}
