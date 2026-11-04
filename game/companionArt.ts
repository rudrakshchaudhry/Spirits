/**
 * Starter companions (spec §13.1–13.2): Mote (fog wisp), Sprig (sapling),
 * Tidepip (sea sprite). Three forms that grow with milestones, plus cosmetic
 * parts absorbed from the player's most-explored neighbourhoods.
 * 24×24, 2 frames (bob).
 */
type RGB = [number, number, number];
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r},${g},${b},${a})`;

export const COMPANION_PX = 24;

export function drawCompanion(ctx: CanvasRenderingContext2D, species: string, form: number, traits: string[], frame: number) {
  const px = (x: number, y: number, c: RGB, w = 1, h = 1, a = 1) => {
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
  const bob = frame ? -1 : 0;
  const r = 3 + form; // grows with form
  const cx = 12, cy = 16 - form + bob;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(12 - r, 22, r * 2, 2);

  switch (species) {
    case "mote": {
      // soft fog wisp with a curling tail
      disc(cx, cy, r, [196, 206, 222], 0.95);
      disc(cx - 1, cy - 1, r - 1, [232, 238, 246]);
      for (let i = 0; i < 3 + form; i++) px(cx + r - 1 + i, cy + 1 + (i % 2) - bob, [220, 228, 240], 1, 1, 0.8);
      if (form >= 3) disc(cx, cy, r + 2, [230, 236, 250], 0.15);
      break;
    }
    case "sprig": {
      // sapling body with leaves that multiply
      disc(cx, cy, r, [110, 170, 84]);
      disc(cx - 1, cy - 1, r - 1, [140, 196, 104]);
      px(cx, cy - r - 3, [96, 70, 50], 1, 3);
      const leaves = form === 1 ? 2 : form === 2 ? 3 : 5;
      for (let i = 0; i < leaves; i++) {
        const a = -Math.PI / 2 + (i - (leaves - 1) / 2) * 0.7;
        disc(cx + Math.cos(a) * 3, cy - r - 3 + Math.sin(a) * 3, 1, [120, 200, 90]);
      }
      if (form >= 3) px(cx + 2, cy - r - 5, [250, 200, 220], 2, 2);
      break;
    }
    default: {
      // tidepip: sea sprite with fin ears
      disc(cx, cy, r, [70, 150, 200]);
      disc(cx - 1, cy - 1, r - 1, [110, 186, 226]);
      px(cx - r - 1, cy - 2, [70, 150, 200], 2, 3);
      px(cx + r, cy - 2, [70, 150, 200], 2, 3);
      if (form >= 2) px(cx - 1, cy - r - 2, [240, 240, 250], 3, 2); // little crest
      if (form >= 3) disc(cx, cy, r + 2, [150, 220, 255], 0.15);
    }
  }
  // face
  px(cx - 2, cy - 1, [30, 30, 40], 1, 2);
  px(cx + 2, cy - 1, [30, 30, 40], 1, 2);
  px(cx - 1, cy + 2, [30, 30, 40], 3, 1);

  // absorbed traits (spec §13.2)
  for (const t of traits) {
    switch (t) {
      case "shell": px(cx + r - 2, cy + r - 2, [240, 210, 190], 3, 2); px(cx + r - 1, cy + r - 3, [220, 180, 160]); break;
      case "mural": px(cx - r, cy + 2, [230, 80, 80], 2, 1); px(cx - r + 2, cy + 2, [250, 200, 60], 2, 1); px(cx - r + 4, cy + 2, [70, 160, 220], 2, 1); break;
      case "lantern": px(cx + r + 1, cy + 1, [220, 50, 50], 2, 3); px(cx + r + 1, cy, [250, 220, 120], 2, 1); break;
      case "leafcrown": for (let i = -2; i <= 2; i += 2) px(cx + i, cy - r - 1, [90, 160, 70], 1, 2); break;
      case "fogscarf": px(cx - r + 1, cy + 3, [230, 236, 244], r * 2 - 2, 1); px(cx + r - 2, cy + 4, [230, 236, 244], 1, 2); break;
      case "tophat": px(cx - 2, cy - r - 3, [30, 30, 36], 5, 3); px(cx - 3, cy - r, [30, 30, 36], 7, 1); break;
      case "flower": disc(cx - r + 1, cy - r + 1, 1, [240, 130, 180]); px(cx - r + 1, cy - r + 1, [250, 230, 90]); break;
    }
  }
}
