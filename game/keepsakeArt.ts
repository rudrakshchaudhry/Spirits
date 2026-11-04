/** 12×12 procedural keepsake icons (React canvases + Phaser textures). */
import { keepsake } from "@/lib/keepsakes/catalog";
import type { RGB } from "@/lib/places/catalog";

export const ICON_PX = 12;
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r},${g},${b},${a})`;
const shade = (c: RGB, k: number): RGB => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))) as RGB;

export function drawKeepsake(ctx: CanvasRenderingContext2D, type: string, ox = 0, oy = 0) {
  const k = keepsake(type);
  const c = k.color, d = shade(c, 0.65), l = shade(c, 1.25);
  const px = (x: number, y: number, col: RGB, w = 1, h = 1) => {
    ctx.fillStyle = css(col);
    ctx.fillRect(ox + x, oy + y, w, h);
  };
  switch (k.shape) {
    case "leaf":
      for (let y = 1; y < 11; y++) { const w = Math.round(4 - Math.abs(y - 5.5) * 0.7); px(6 - w, y, c, w * 2, 1); }
      px(6, 2, d, 1, 9); px(6, 10, d, 1, 2); px(4, 3, l);
      break;
    case "fan":
      for (let y = 2; y < 8; y++) px(6 - (y - 1), y, c, (y - 1) * 2, 1);
      px(3, 8, c, 6, 1); px(6, 9, d, 1, 3); px(5, 2, l, 2, 1);
      break;
    case "cone":
      for (let y = 1; y < 11; y++) { const w = Math.round(3 - Math.abs(y - 6) * 0.35); px(6 - w, y, y % 2 ? c : d, w * 2, 1); }
      break;
    case "petal":
      px(4, 2, c, 4, 1); px(3, 3, c, 6, 5); px(4, 8, c, 4, 1); px(5, 9, c, 2, 2); px(4, 4, l, 2, 2); px(6, 6, d);
      break;
    case "shell":
      for (let y = 2; y < 10; y++) { const w = Math.round(5 - Math.abs(y - 6) * 0.6); px(6 - w, y, c, w * 2, 1); }
      for (let x = 3; x < 10; x += 2) px(x, 4, d, 1, 5);
      px(5, 10, d, 2, 1);
      break;
    case "bean":
      px(4, 2, c, 4, 1); px(3, 3, c, 6, 6); px(4, 9, c, 4, 1); px(6, 3, d, 1, 6); px(4, 4, l);
      break;
    case "seed":
      px(4, 3, d, 4, 2); px(3, 5, c, 6, 5); px(4, 10, c, 4, 1); px(4, 6, l);
      break;
    case "key":
      px(2, 3, c, 4, 4); px(3, 4, [30, 30, 30], 2, 2); px(6, 5, c, 5, 2); px(9, 7, c, 1, 2); px(7, 7, c, 1, 1);
      break;
    case "ticket":
      px(1, 3, c, 10, 6); px(1, 5, [255, 255, 255], 1, 2); px(10, 5, [255, 255, 255], 1, 2); px(3, 5, l, 6, 1); px(3, 7, d, 4, 1);
      break;
    case "drop":
      px(5, 2, c, 2, 2); px(4, 4, c, 4, 2); px(3, 6, c, 6, 3); px(4, 9, c, 4, 1); px(4, 6, l);
      break;
    case "cloud":
      px(3, 5, c, 7, 3); px(4, 4, c, 3, 1); px(7, 3, c, 2, 2); px(2, 6, c, 1, 2); px(4, 8, d, 6, 1);
      break;
    case "star":
      px(5, 1, c, 2, 10); px(1, 5, c, 10, 2); px(3, 3, l, 6, 6); px(5, 5, [255, 255, 255], 2, 2);
      break;
    case "page":
      px(3, 1, c, 6, 10); px(7, 1, d, 2, 2); px(4, 3, d, 4, 1); px(4, 5, d, 4, 1); px(4, 7, d, 3, 1);
      break;
    case "coin":
      px(4, 2, c, 4, 1); px(3, 3, c, 6, 6); px(4, 9, c, 4, 1); px(4, 4, l, 2, 2); px(5, 5, d, 2, 2);
      break;
    case "ribbon":
      px(1, 3, c, 4, 4); px(7, 3, c, 4, 4); px(5, 4, d, 2, 2); px(4, 6, c, 1, 4); px(7, 6, c, 1, 4);
      break;
  }
}
