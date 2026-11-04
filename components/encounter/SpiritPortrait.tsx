"use client";
import { useEffect, useRef } from "react";
import { SPIRIT_PX, drawSpiritPortrait } from "@/game/spiritArt";
import type { Family, Rarity } from "@/lib/spirits/spawn";

/** Pixel portrait of a spirit, drawn with the same procedural art as the world. */
export default function SpiritPortrait({
  family, rarity, seed, look, size = 96, animate = true,
}: { family: string; rarity: string; seed: number; look?: string | null; size?: number; animate?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, SPIRIT_PX, SPIRIT_PX);
      drawSpiritPortrait(ctx, { family: family as Family, rarity: rarity as Rarity, seed, look: look ?? undefined }, frame);
    };
    draw();
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seq = [0, 1, 2, 1, 0, 3];
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % seq.length;
      frame = seq[i];
      draw();
    }, 250);
    return () => clearInterval(t);
  }, [family, rarity, seed, look, animate]);
  return (
    <canvas
      ref={ref}
      width={SPIRIT_PX}
      height={SPIRIT_PX}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      aria-hidden
    />
  );
}
