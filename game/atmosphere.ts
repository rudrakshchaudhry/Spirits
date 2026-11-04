/**
 * Visual atmosphere (spec §4.4): day/night tint + lantern glow, drifting fog
 * (stronger in the west), rain particles, and the per-neighbourhood 311 haze.
 */
import Phaser from "phaser";
import { TILE_PX } from "@/lib/geo/projection";
import type { ConditionsView } from "@/lib/conditions/rules";
import type { Hood } from "@/lib/world/neighborhoods";

const TINT: Record<string, [number, number]> = {
  night: [0x0b1640, 0.45],
  dusk: [0xff7a3c, 0.14],
  dawn: [0xffc58a, 0.1],
  day: [0x000000, 0],
};

function makeTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists("fognoise")) {
    const S = 128;
    const t = scene.textures.createCanvas("fognoise", S, S)!;
    const ctx = t.getContext();
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 60; i++) {
      const x = r() * S, y = r() * S, rad = 12 + r() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(235,240,245,0.35)");
      g.addColorStop(1, "rgba(235,240,245,0)");
      ctx.fillStyle = g;
      // draw wrapped so the texture tiles seamlessly
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        ctx.restore();
      }
    }
    t.refresh();
  }
  if (!scene.textures.exists("raindrop")) {
    const t = scene.textures.createCanvas("raindrop", 1, 7)!;
    const ctx = t.getContext();
    ctx.fillStyle = "rgba(170,200,255,0.75)";
    ctx.fillRect(0, 0, 1, 7);
    t.refresh();
  }
  if (!scene.textures.exists("glow")) {
    const S = 128;
    const t = scene.textures.createCanvas("glow", S, S)!;
    const ctx = t.getContext();
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,214,140,0.55)");
    g.addColorStop(0.5, "rgba(255,190,110,0.18)");
    g.addColorStop(1, "rgba(255,190,110,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    t.refresh();
  }
}

export class Atmosphere {
  private tint: Phaser.GameObjects.Rectangle;
  private fog: Phaser.GameObjects.TileSprite;
  private rain: Phaser.GameObjects.Particles.ParticleEmitter;
  private lantern: Phaser.GameObjects.Image;
  private haze: Phaser.GameObjects.Graphics;
  private fogOn = false;
  private cond: ConditionsView | null = null;

  constructor(private scene: Phaser.Scene, private hoods: Hood[]) {
    makeTextures(scene);
    const big = 6000; // screen-space overlays are scaled by camera zoom; oversize them
    this.tint = scene.add.rectangle(0, 0, big, big, 0x000000, 0).setScrollFactor(0).setDepth(1e7);
    this.lantern = scene.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(1e7 + 1).setVisible(false).setScale(1.4);
    this.fog = scene.add.tileSprite(0, 0, big, big, "fognoise").setScrollFactor(0).setDepth(1e7 + 2).setAlpha(0);
    this.rain = scene.add.particles(0, 0, "raindrop", {
      x: { min: -800, max: 800 },
      y: -500,
      speedY: { min: 420, max: 560 },
      speedX: { min: -40, max: -20 },
      lifespan: 1600,
      quantity: 3,
      frequency: 25,
      emitting: false,
    });
    this.rain.setScrollFactor(0).setDepth(1e7 + 3);
    this.haze = scene.add.graphics().setDepth(0.5);
  }

  setConditions(c: ConditionsView) {
    this.cond = c;
    const [color, alpha] = TINT[c.phase] ?? TINT.day;
    this.tint.setFillStyle(color, alpha);
    this.lantern.setVisible(c.phase === "night" || c.phase === "dusk");
    this.fogOn = c.fog;
    if (c.rain) this.rain.start();
    else this.rain.stop();
    this.drawHaze(c.haze);
  }

  /** Grey veil over neighbourhoods with a high 311 haze score — visual only. */
  private drawHaze(haze: ConditionsView["haze"]) {
    this.haze.clear();
    for (const h of this.hoods) {
      const score = haze[h.name]?.score ?? 0;
      if (score < 0.15) continue;
      this.haze.fillStyle(0x8a8f99, Math.min(0.3, score * 0.28));
      for (const ring of h.rings) {
        const pts: Phaser.Types.Math.Vector2Like[] = [];
        for (let i = 0; i < ring.length; i += 2) pts.push({ x: ring[i] * TILE_PX, y: ring[i + 1] * TILE_PX });
        this.haze.fillPoints(pts, true);
      }
    }
  }

  update(player: { x: number; y: number }, dt: number) {
    const cam = this.scene.cameras.main;
    this.tint.setPosition(cam.width / 2, cam.height / 2);
    this.fog.setPosition(cam.width / 2, cam.height / 2);
    this.rain.setPosition(cam.width / 2, 0);
    this.lantern.setPosition(player.x * TILE_PX + 5, player.y * TILE_PX - 6);
    // fog drifts east→west and is thicker on the west side of the city (spec §4.4)
    const west = Math.max(0, Math.min(1, 1 - player.x / 1800));
    const target = this.fogOn ? 0.18 + 0.3 * west : 0;
    this.fog.setAlpha(this.fog.alpha + (target - this.fog.alpha) * Math.min(1, dt * 1.5));
    this.fog.tilePositionX += dt * 6;
    this.fog.tilePositionY += dt * 1.5;

  }
}
